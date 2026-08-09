/**
 * [C2] Per-merchant Valor ISO boarding.
 *
 * Runs the sequence that turns a DEXA merchant into a live Valor merchant:
 * bearer token → Merchant Add → Store Add → EPI Add → Generate API Keys →
 * persist to `merchant_processor_accounts`.
 *
 * ── Why the API is injected ───────────────────────────────────────────────────
 * The valuable, bug-prone part of boarding is the *sequencing and rollback*,
 * not the HTTP. Steps 2–5 create real state on Valor's side that no database
 * transaction can undo, so a failure at step 4 must actively delete what steps
 * 2 and 3 created. That logic is fully testable today; the wire format is not,
 * because Valor documents these responses as empty objects. Injecting the API
 * lets the orchestration be verified now and the transport be corrected later.
 *
 * ── Unverified ────────────────────────────────────────────────────────────────
 * Response field names live in `identifiers.ts` and are guesses. Request bodies
 * follow the published field lists. See that file before the first live run.
 */

import { isValidEpi } from "./config";
import type { ValorEnvelope } from "./client";
import {
  readAppId,
  readAppKey,
  readEpi,
  readMerchantId,
  readNewUserId,
  readStoreId,
  ValorIdentifierError,
} from "./identifiers";

/**
 * DEXA-owned pricing applied at Merchant Add.
 *
 * Deliberately has NO defaults. The C2 ticket calls for hardcoded defaults, but
 * the values were never supplied, and a merchant boarded on guessed rates earns
 * the wrong residual on every transaction until someone notices — a silent
 * revenue bug. Callers must pass them explicitly.
 *
 * UNITS UNCONFIRMED — `merchant_processor_accounts` stores these as
 * numeric(5,4), which caps at 9.9999, so "percent" cannot mean 0–100. Resolve
 * before boarding anything real.
 */
export interface ValorFeeSchedule {
  feeScheduleId: string;
  discRatePercent: number;
  residualBps: number;
  surchargePercent: number;
}

export interface BoardingMerchantDetails {
  legalName: string;
  dbaName: string;
  firstName: string;
  lastName: string;
  emailId: string;
  mobile: string;
  legalAddress: string;
  legalCity: string;
  legalState: string;
  legalZipCode: string;
  legalCountry?: string;
  legalTimezone?: string;
  mccCode: string;
}

export interface BoardingStoreDetails {
  storeName: string;
  storeAddress: string;
  storeState: string;
  storeZipCode: string;
  storeCountry?: string;
  storeTimezone?: string;
  superVisorName: string;
  superVisorEmail: string;
  superVisorContact: string;
}

export interface BoardingParams {
  merchant: BoardingMerchantDetails;
  store: BoardingStoreDetails;
  fees: ValorFeeSchedule;
  /** DEXA merchant + location this Valor merchant corresponds to. */
  dexaMerchantId: string;
  dexaLocationId: string | null;
  epiLabel?: string;
}

/**
 * Transport surface. Implemented over HTTP for real use; stubbed in tests.
 * Each method returns the raw response body so `identifiers.ts` can probe it.
 */
export interface BoardingApi {
  createMerchant(params: BoardingParams): Promise<ValorEnvelope>;
  createStore(
    params: BoardingParams,
    ctx: { merchantId: string; newUserId: string }
  ): Promise<ValorEnvelope>;
  createEpi(
    params: BoardingParams,
    ctx: { merchantId: string; newUserId: string; storeId: string }
  ): Promise<ValorEnvelope>;
  generateApiKeys(ctx: { epi: string }): Promise<ValorEnvelope>;
  /** Best-effort cleanup. Absence means partial state must be reported instead. */
  deleteMerchant?(ctx: { merchantId: string }): Promise<void>;
}

/** Persists the boarded account. Supplied by the caller (service-role write). */
export type BoardingPersist = (record: BoardedAccount) => Promise<void>;

export interface BoardedAccount {
  dexaMerchantId: string;
  dexaLocationId: string | null;
  valorMerchantId: string;
  valorStoreId: string;
  valorEpi: string;
  valorAppId: string;
  valorAppKey: string;
  fees: ValorFeeSchedule;
}

export type BoardingStep =
  | "merchant_add"
  | "store_add"
  | "epi_add"
  | "generate_api_keys"
  | "persist";

export class BoardingError extends Error {
  readonly step: BoardingStep;
  /** Valor-side state that outlived the failure, if cleanup could not remove it. */
  readonly orphaned: Partial<
    Pick<BoardedAccount, "valorMerchantId" | "valorStoreId" | "valorEpi">
  >;
  readonly cleanedUp: boolean;

  constructor(
    step: BoardingStep,
    message: string,
    orphaned: BoardingError["orphaned"],
    cleanedUp: boolean,
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = "BoardingError";
    this.step = step;
    this.orphaned = orphaned;
    this.cleanedUp = cleanedUp;
  }
}

/**
 * Run the boarding sequence.
 *
 * On failure after Merchant Add, attempts to delete the Valor merchant so a
 * retry does not collide with a half-created one. If cleanup is unavailable or
 * itself fails, the identifiers are attached to the thrown error rather than
 * lost — an orphaned Valor merchant needs a human, and silently discarding its
 * id makes that job much harder.
 */
export async function runBoarding(
  api: BoardingApi,
  params: BoardingParams,
  persist: BoardingPersist
): Promise<BoardedAccount> {
  const created: BoardingError["orphaned"] = {};

  const fail = async (
    step: BoardingStep,
    message: string,
    cause?: unknown
  ): Promise<never> => {
    let cleanedUp = false;

    if (created.valorMerchantId && api.deleteMerchant) {
      try {
        await api.deleteMerchant({ merchantId: created.valorMerchantId });
        cleanedUp = true;
      } catch {
        cleanedUp = false;
      }
    }

    throw new BoardingError(step, message, { ...created }, cleanedUp, { cause });
  };

  // ── Step 2: Merchant Add ───────────────────────────────────────────────────
  let merchantBody: ValorEnvelope;
  try {
    merchantBody = await api.createMerchant(params);
  } catch (error) {
    return fail("merchant_add", "Valor Merchant Add failed", error);
  }

  const valorMerchantId = readMerchantId(merchantBody);
  if (!valorMerchantId) {
    throw new ValorIdentifierError("Merchant Add", "readMerchantId", merchantBody);
  }
  created.valorMerchantId = valorMerchantId;

  const newUserId = readNewUserId(merchantBody) ?? valorMerchantId;

  // ── Step 3: Store Add ──────────────────────────────────────────────────────
  let storeBody: ValorEnvelope;
  try {
    storeBody = await api.createStore(params, {
      merchantId: valorMerchantId,
      newUserId,
    });
  } catch (error) {
    return fail("store_add", "Valor Store Add failed", error);
  }

  const valorStoreId = readStoreId(storeBody);
  if (!valorStoreId) {
    return fail(
      "store_add",
      new ValorIdentifierError("Store Add", "readStoreId", storeBody).message
    );
  }
  created.valorStoreId = valorStoreId;

  // ── Step 4: EPI Add ────────────────────────────────────────────────────────
  let epiBody: ValorEnvelope;
  try {
    epiBody = await api.createEpi(params, {
      merchantId: valorMerchantId,
      newUserId,
      storeId: valorStoreId,
    });
  } catch (error) {
    return fail("epi_add", "Valor EPI Add failed", error);
  }

  const valorEpi = readEpi(epiBody);
  if (!valorEpi) {
    return fail(
      "epi_add",
      new ValorIdentifierError("EPI Add", "readEpi", epiBody).message
    );
  }

  // Shape check gives a real correctness signal even though the key is a guess:
  // a 10-digit value starting with 2 is very unlikely to be the wrong field.
  if (!isValidEpi(valorEpi)) {
    return fail(
      "epi_add",
      `Valor EPI Add returned "${valorEpi}", which is not a 10-digit EPI ` +
        "beginning with 2. readEpi() in identifiers.ts is probably reading the " +
        "wrong field."
    );
  }
  created.valorEpi = valorEpi;

  // ── Step 5: Generate API Keys ──────────────────────────────────────────────
  let keysBody: ValorEnvelope;
  try {
    keysBody = await api.generateApiKeys({ epi: valorEpi });
  } catch (error) {
    return fail("generate_api_keys", "Valor Generate API Keys failed", error);
  }

  const valorAppId = readAppId(keysBody);
  const valorAppKey = readAppKey(keysBody);
  if (!valorAppId || !valorAppKey) {
    return fail(
      "generate_api_keys",
      new ValorIdentifierError(
        "Generate API Keys",
        valorAppId ? "readAppKey" : "readAppId",
        keysBody
      ).message
    );
  }

  const account: BoardedAccount = {
    dexaMerchantId: params.dexaMerchantId,
    dexaLocationId: params.dexaLocationId,
    valorMerchantId,
    valorStoreId,
    valorEpi,
    valorAppId,
    valorAppKey,
    fees: params.fees,
  };

  // ── Step 6: Persist ────────────────────────────────────────────────────────
  // Failing here is the worst case: Valor state exists and DEXA has no record
  // of it. Cleanup runs so a retry starts clean rather than orphaning a live
  // merchant nobody can see.
  try {
    await persist(account);
  } catch (error) {
    return fail(
      "persist",
      "Boarding succeeded on Valor but persisting merchant_processor_accounts failed",
      error
    );
  }

  return account;
}

/**
 * Validate a fee schedule before it reaches Valor.
 *
 * C1's `fee_schedule_required_for_merchant_purposes` constraint rejects an
 * active Valor online_order/invoice row missing any of these, so catching it
 * here avoids boarding a merchant whose account row cannot then be written.
 */
export function assertCompleteFeeSchedule(fees: Partial<ValorFeeSchedule>): void {
  const missing = (
    ["feeScheduleId", "discRatePercent", "residualBps", "surchargePercent"] as const
  ).filter((key) => fees[key] === undefined || fees[key] === null);

  if (missing.length > 0) {
    throw new RangeError(
      `Incomplete Valor fee schedule: missing ${missing.join(", ")}. ` +
        "All four are required — C1's fee_schedule_required_for_merchant_purposes " +
        "constraint rejects the account row without them."
    );
  }

  if (fees.residualBps !== undefined && fees.residualBps < 0) {
    throw new RangeError("residualBps must not be negative");
  }
}
