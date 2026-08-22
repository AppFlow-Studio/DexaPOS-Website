/**
 * [C2] Valor ISO boarding — HTTP transport + Valor-shaped orchestration.
 *
 * ── Why this file is not `runBoarding`/`onboardMerchant` from boarding.ts ──────
 * boarding.ts models boarding as four independent calls (merchant → store → epi →
 * keys). The live ISO API (confirmed 2026-08-21 against valorapi.readme.io) does
 * NOT work that way: the first location is created by a single nested
 * `POST /api/valor/create` whose body carries the merchant with `storeData[]` and
 * each store's `epiData[]` inline. Only *additional* stores use a separate
 * `POST /api/valor/createStore`. So the correct sequence is:
 *
 *   /create  (merchant + store[0] + epi[0])  →  keys(epi[0])  →  persist
 *   then per extra location:  /createStore (+ epi)  →  keys(epi)  →  persist
 *
 * This module implements that sequence with the same rollback discipline
 * boarding.ts pioneered (delete the merchant if the first create can't be
 * finished; delete just the store for a later location; never delete the shared
 * merchant for a later-location failure), reusing its types and error classes.
 *
 * ── UNVERIFIED ────────────────────────────────────────────────────────────────
 * Valor documents every boarding RESPONSE as an empty `{}`. The request contract
 * here is from the live docs; the response readers (identifiers.ts + the nested
 * store/epi reader below) are best-effort and are the one thing a supervised
 * first live run must confirm. Request builders are pure and unit-tested.
 */

import {
  getBearerToken,
  type IsoAuthOptions,
  type ValorIsoCredentials,
} from "./auth";
import {
  isValidEpi,
  resolveValorEndpoints,
  type ValorEndpoints,
} from "./config";
import { extractValorError, type ValorEnvelope } from "./client";
import {
  readAppId,
  readAppKey,
  readEpi,
  readMerchantId,
  readNewUserId,
  readStoreId,
  ValorIdentifierError,
} from "./identifiers";
import {
  BoardingError,
  type BoardedAccount,
  type BoardingMerchantDetails,
  type BoardingParams,
  type BoardingPersist,
  type BoardingStoreDetails,
  type LocationInput,
  type OnboardResult,
  type ValorFeeSchedule,
} from "./boarding";

/**
 * Per-acquirer boarding profile. Valor boards onto a specific acquirer (First
 * Data, TSYS, …) and the `/create` body carries acquirer-specific MID/TID
 * credentials in `epiData[].processorData[]`. Those come from underwriting, not
 * from DEXA — so they are injected as an opaque block rather than modelled here,
 * which also keeps this file acquirer-agnostic.
 */
export interface ValorAcquirerConfig {
  /** `/create` variant selector, e.g. "FDcardnet" | "surchargetsys". Sent as the query string. */
  createVariant: string;
  /** `/createStore` variant selector, e.g. "storeadd". */
  storeVariant: string;
  /** Numeric processor id used at root + epiData, e.g. "3" (FD) | "1" (TSYS). */
  processor: string;
  /** Root `programType`: "1" = cash discount, "2" = traditional. */
  programType: string;
  /** Device id — "139" is the cloud Virtual Terminal used for gateway/ecommerce. */
  device: string;
  /** Human device type label, e.g. "Soft POS". */
  deviceType: string;
  /** ISO associate username echoed on store/EPI/key calls. */
  associateUserName?: string;
  /**
   * Opaque per-acquirer MID/credential block merged into `processorData[0]`.
   * Sandbox uses Valor's published test values; production comes from the
   * acquirer at underwriting. `surchargeIndicator`/`surchargePercentage`/
   * `programType` are overlaid from the fee schedule, so omit them here.
   */
  processorData: Record<string, unknown>;
}

export interface ValorBoardingOptions {
  credentials: ValorIsoCredentials;
  acquirer: ValorAcquirerConfig;
  endpoints?: ValorEndpoints;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

const DEFAULT_TIMEOUT_MS = 20_000;

// ────────────────────────────────────────────────────────────────────────────
// Request-body builders — pure, exported for unit tests.
// ────────────────────────────────────────────────────────────────────────────

/** The tip/surcharge/tax feature block. Web checkout is card-only: no add-ons. */
function buildFeatures() {
  return {
    tip: { enabled: false, value: [5, 10, 15, 20] },
    surcharge: { enabled: false, value: "0.00" },
    tax: { enabled: false, value: "0.00" },
  };
}

function processorProgramType(programType: string): string {
  // Root uses "1"/"2"; the nested processorData uses the STRING form.
  return programType === "1" ? "cashdiscount" : "surcharge";
}

/** One `epiData[]` entry — a single Virtual Terminal for online-order checkout. */
export function buildEpiData(
  acquirer: ValorAcquirerConfig,
  store: BoardingStoreDetails,
  fees: ValorFeeSchedule,
  epiLabel: string
) {
  return {
    device: acquirer.device,
    deviceType: acquirer.deviceType,
    processor: acquirer.processor,
    epiLabel,
    selectedState: store.storeState,
    features: buildFeatures(),
    processorData: [
      {
        ...acquirer.processorData,
        // Card-only online rail: surcharge is disabled at charge time (the sale
        // API always sends surchargeIndicator "0"), so board with the fee rate
        // recorded but the indicator neutral.
        surchargeIndicator: "0",
        surchargePercentage: fees.surchargePercent.toFixed(3),
        programType: processorProgramType(acquirer.programType),
      },
    ],
  };
}

/** One `storeData[]` entry with its nested Virtual Terminal. */
export function buildStoreData(
  store: BoardingStoreDetails,
  acquirer: ValorAcquirerConfig,
  fees: ValorFeeSchedule,
  epiLabel: string,
  mccCode: string
) {
  return {
    storeName: store.storeName,
    storeAddress: store.storeAddress,
    storeState: store.storeState,
    storeCountry: store.storeCountry ?? "US",
    storeZipCode: store.storeZipCode,
    storeTimezone: store.storeTimezone ?? "EST",
    superVisorName: store.superVisorName,
    superVisorEmail: store.superVisorEmail,
    superVisorContact: store.superVisorContact,
    mccCode,
    epiData: [buildEpiData(acquirer, store, fees, epiLabel)],
  };
}

/** `POST /api/valor/create` body — merchant + first store + first EPI, nested. */
export function buildCreateMerchantBody(
  merchant: BoardingMerchantDetails,
  store: BoardingStoreDetails,
  acquirer: ValorAcquirerConfig,
  fees: ValorFeeSchedule,
  epiLabel: string
) {
  return {
    legalName: merchant.legalName,
    dbaName: merchant.dbaName,
    firstName: merchant.firstName,
    lastName: merchant.lastName,
    emailId: merchant.emailId,
    userName: merchant.emailId,
    mobile: merchant.mobile,
    legalAddress: merchant.legalAddress,
    legalCity: merchant.legalCity,
    legalState: merchant.legalState,
    legalCountry: merchant.legalCountry ?? "US",
    legalZipCode: merchant.legalZipCode,
    legalTimezone: merchant.legalTimezone ?? "EST",
    role: "10",
    userType: "4",
    isTxnAllowed: "1",
    selectedState: store.storeState,
    programType: acquirer.programType,
    processor: acquirer.processor,
    rollUp: "0",
    ...(acquirer.associateUserName
      ? { associate_user_name: acquirer.associateUserName }
      : {}),
    storeData: [buildStoreData(store, acquirer, fees, epiLabel, merchant.mccCode)],
  };
}

/** `POST /api/valor/createStore` body — a store under an existing merchant. */
export function buildCreateStoreBody(
  ctx: { mpId: string; newUserId: string },
  store: BoardingStoreDetails,
  acquirer: ValorAcquirerConfig,
  fees: ValorFeeSchedule,
  epiLabel: string,
  mccCode: string
) {
  return {
    dbaName: store.storeName.slice(0, 15),
    newUserId: ctx.newUserId,
    mp_id: ctx.mpId,
    selectedState: store.storeState,
    s4f: acquirer.programType === "1" ? "1" : "2",
    processor: acquirer.processor,
    rollUp: "0",
    ...(acquirer.associateUserName
      ? { associate_user_name: acquirer.associateUserName }
      : {}),
    storeData: [buildStoreData(store, acquirer, fees, epiLabel, mccCode)],
  };
}

export function buildGenerateKeysBody(
  epi: string,
  associateUserName?: string
): Record<string, string> {
  return {
    epi,
    ...(associateUserName ? { associate_user_name: associateUserName } : {}),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Response reader for the nested /create + /createStore responses.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Pull the created store id + EPI out of a nested create/createStore response.
 *
 * UNVERIFIED shape: docs show `{}`. We probe the response top-level, a `data`
 * wrapper, and the first element of any `storeData`/`stores` array (which is
 * where the created store's `id` + its `epiData[].epi` would live). Boarding one
 * store per call keeps this unambiguous — the array has a single element.
 */
export function readStoreAndEpi(
  body: ValorEnvelope
): { storeId: string | null; epi: string | null } {
  const container =
    (body.data && typeof body.data === "object" ? (body.data as ValorEnvelope) : body) ??
    body;

  const storeArray =
    (container.storeData as unknown) ??
    (container.stores as unknown) ??
    (body.storeData as unknown) ??
    (body.stores as unknown);

  let storeNode: ValorEnvelope | null = null;
  if (Array.isArray(storeArray) && storeArray.length > 0) {
    storeNode = storeArray[0] as ValorEnvelope;
  }

  const storeId = storeNode ? readStoreId(storeNode) : readStoreId(body);

  let epi: string | null = null;
  if (storeNode) {
    const epiArray = storeNode.epiData as unknown;
    if (Array.isArray(epiArray) && epiArray.length > 0) {
      epi = readEpi(epiArray[0] as ValorEnvelope);
    }
    if (!epi) epi = readEpi(storeNode);
  }
  if (!epi) epi = readEpi(body);

  return { storeId, epi };
}

// ────────────────────────────────────────────────────────────────────────────
// HTTP client for the boarding host.
// ────────────────────────────────────────────────────────────────────────────

interface BoardingHttp {
  post(
    path: string,
    body: object
  ): Promise<{ status: number; body: ValorEnvelope }>;
}

async function makeBoardingHttp(
  options: ValorBoardingOptions
): Promise<BoardingHttp> {
  const endpoints = options.endpoints ?? resolveValorEndpoints();
  const doFetch = options.fetchImpl ?? fetch;
  const authOptions: IsoAuthOptions = {
    credentials: options.credentials,
    endpoints,
    fetchImpl: doFetch,
    ...(options.now ? { now: options.now } : {}),
  };
  const token = await getBearerToken(authOptions);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    ...(options.credentials.isvSecretKey
      ? { "isv-secret-key": options.credentials.isvSecretKey }
      : {}),
  };

  return {
    async post(path, body) {
      const res = await doFetch(`${endpoints.boardingBaseUrl}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
        cache: "no-store",
      });
      const text = await res.text();
      let parsed: ValorEnvelope = {};
      try {
        if (text) parsed = JSON.parse(text) as ValorEnvelope;
      } catch {
        parsed = {};
      }
      return { status: res.status, body: parsed };
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Orchestration.
// ────────────────────────────────────────────────────────────────────────────

/** Mint the app id/key for one EPI, activating it first (best-effort). */
async function generateKeysForEpi(
  http: BoardingHttp,
  acquirer: ValorAcquirerConfig,
  epi: string
): Promise<{ appId: string; appKey: string }> {
  // Activation is a documented sibling of EPI Add; harmless if already active.
  try {
    await http.post("/api/valor/activateEpi", { epi });
  } catch {
    // Non-fatal: key generation below is the real gate.
  }

  const keysRes = await http.post(
    "/api/valor/getEpiAppKeyDetails?apikey",
    buildGenerateKeysBody(epi, acquirer.associateUserName)
  );
  const appId = readAppId(keysRes.body);
  const appKey = readAppKey(keysRes.body);
  if (!appId || !appKey) {
    throw new ValorIdentifierError(
      "Generate API Keys",
      appId ? "readAppKey" : "readAppId",
      keysRes.body
    );
  }
  return { appId, appKey };
}

function accountFrom(
  params: BoardingParams,
  ctx: { mpId: string },
  provisioned: { storeId: string; epi: string; appId: string; appKey: string }
): BoardedAccount {
  return {
    dexaMerchantId: params.dexaMerchantId,
    dexaLocationId: params.dexaLocationId,
    valorMerchantId: ctx.mpId,
    valorStoreId: provisioned.storeId,
    valorEpi: provisioned.epi,
    valorAppId: provisioned.appId,
    valorAppKey: provisioned.appKey,
    fees: params.fees,
  };
}

/**
 * Board a DEXA merchant and all of its locations on Valor.
 *
 * The first location is created together with the merchant via `/create`; every
 * later location is added with `/createStore`. Partial success is durable: the
 * merchant and any location that succeeded stay live, and failed locations are
 * returned for a targeted retry.
 */
export async function onboardValorMerchant(
  options: ValorBoardingOptions,
  merchant: BoardingMerchantDetails,
  fees: ValorFeeSchedule,
  dexaMerchantId: string,
  locations: LocationInput[],
  persist: BoardingPersist
): Promise<OnboardResult> {
  if (locations.length === 0) {
    throw new RangeError("onboardValorMerchant requires at least one location");
  }

  const http = await makeBoardingHttp(options);
  const { acquirer } = options;
  const accounts: BoardedAccount[] = [];
  const failures: OnboardResult["failures"] = [];

  const paramsFor = (location: LocationInput): BoardingParams => ({
    merchant,
    store: location.store,
    fees,
    dexaMerchantId,
    dexaLocationId: location.dexaLocationId,
    ...(location.epiLabel ? { epiLabel: location.epiLabel } : {}),
  });

  // ── First location: /create (merchant + store + EPI) ─────────────────────────
  const first = locations[0];
  const firstParams = paramsFor(first);
  const epiLabel0 = first.epiLabel ?? "VT";

  let createRes: { status: number; body: ValorEnvelope };
  try {
    createRes = await http.post(
      `/api/valor/create?${acquirer.createVariant}`,
      buildCreateMerchantBody(merchant, first.store, acquirer, fees, epiLabel0)
    );
  } catch (error) {
    throw new BoardingError("merchant_add", "Valor Merchant Add failed", {}, false, {
      cause: error,
    });
  }

  const mpId = readMerchantId(createRes.body);
  if (!mpId) {
    throw new ValorIdentifierError("Merchant Add", "readMerchantId", createRes.body);
  }
  const newUserId = readNewUserId(createRes.body) ?? mpId;
  const ctx = { mpId, newUserId };

  // Everything after the merchant exists must clean the whole merchant up on
  // failure, so a retry starts from nothing rather than a half-built merchant.
  const failMerchant = async (
    step: "store_add" | "epi_add" | "generate_api_keys" | "persist",
    message: string,
    cause?: unknown
  ): Promise<never> => {
    let cleanedUp = false;
    try {
      await http.post("/api/valor/delete", { mp_id: mpId });
      cleanedUp = true;
    } catch {
      cleanedUp = false;
    }
    throw new BoardingError(step, message, { valorMerchantId: mpId }, cleanedUp, {
      cause,
    });
  };

  const { storeId: store0, epi: epi0 } = readStoreAndEpi(createRes.body);
  if (!store0) {
    return failMerchant(
      "store_add",
      new ValorIdentifierError("Merchant Add (store)", "readStoreAndEpi", createRes.body)
        .message
    );
  }
  if (!epi0 || !isValidEpi(epi0)) {
    return failMerchant(
      "epi_add",
      `Valor /create returned EPI "${epi0 ?? "none"}", which is not a 10-digit ` +
        "EPI beginning with 2. readStoreAndEpi() is probably reading the wrong field."
    );
  }

  let keys0: { appId: string; appKey: string };
  try {
    keys0 = await generateKeysForEpi(http, acquirer, epi0);
  } catch (error) {
    return failMerchant("generate_api_keys", "Valor Generate API Keys failed", error);
  }

  const account0 = accountFrom(firstParams, ctx, {
    storeId: store0,
    epi: epi0,
    ...keys0,
  });
  try {
    await persist(account0);
  } catch (error) {
    return failMerchant(
      "persist",
      "Boarding succeeded on Valor but persisting the first location failed",
      error
    );
  }
  accounts.push(account0);

  // ── Remaining locations: /createStore each, isolated ─────────────────────────
  for (const location of locations.slice(1)) {
    try {
      accounts.push(
        await provisionValorLocation(http, options, ctx, paramsFor(location), persist)
      );
    } catch (error) {
      failures.push({ dexaLocationId: location.dexaLocationId, error });
    }
  }

  return { merchant: { valorMerchantId: mpId, newUserId }, accounts, failures };
}

/**
 * Provision one additional location under an already-boarded merchant.
 *
 * Store Add → keys → persist. Rolls back the *store* only (never the shared
 * merchant) so one bad location can't tear down the others. Exported so a
 * later "add a location" flow can reuse it directly.
 */
export async function provisionValorLocation(
  http: BoardingHttp,
  options: ValorBoardingOptions,
  ctx: { mpId: string; newUserId: string },
  params: BoardingParams,
  persist: BoardingPersist
): Promise<BoardedAccount> {
  const { acquirer } = options;
  const epiLabel = params.epiLabel ?? "VT";
  let createdStoreId: string | null = null;

  const failStore = async (
    step: "store_add" | "epi_add" | "generate_api_keys" | "persist",
    message: string,
    cause?: unknown
  ): Promise<never> => {
    let cleanedUp = false;
    if (createdStoreId) {
      try {
        await http.post("/api/valor/deletestore", {
          store_id: [Number(createdStoreId)],
        });
        cleanedUp = true;
      } catch {
        cleanedUp = false;
      }
    }
    throw new BoardingError(
      step,
      message,
      createdStoreId ? { valorStoreId: createdStoreId } : {},
      cleanedUp,
      { cause }
    );
  };

  let storeRes: { status: number; body: ValorEnvelope };
  try {
    storeRes = await http.post(
      `/api/valor/createStore?${acquirer.storeVariant}`,
      buildCreateStoreBody(
        ctx,
        params.store,
        acquirer,
        params.fees,
        epiLabel,
        params.merchant.mccCode
      )
    );
  } catch (error) {
    return failStore("store_add", "Valor Store Add failed", error);
  }

  const { storeId, epi } = readStoreAndEpi(storeRes.body);
  if (!storeId) {
    return failStore(
      "store_add",
      new ValorIdentifierError("Store Add", "readStoreAndEpi", storeRes.body).message
    );
  }
  createdStoreId = storeId;

  if (!epi || !isValidEpi(epi)) {
    return failStore(
      "epi_add",
      `Valor /createStore returned EPI "${epi ?? "none"}", not a 10-digit EPI ` +
        "beginning with 2. readStoreAndEpi() is probably reading the wrong field."
    );
  }

  let keys: { appId: string; appKey: string };
  try {
    keys = await generateKeysForEpi(http, acquirer, epi);
  } catch (error) {
    return failStore("generate_api_keys", "Valor Generate API Keys failed", error);
  }

  const account = accountFrom(params, ctx, { storeId, epi, ...keys });
  try {
    await persist(account);
  } catch (error) {
    return failStore(
      "persist",
      "Location provisioned on Valor but persisting merchant_processor_accounts failed",
      error
    );
  }

  return account;
}
