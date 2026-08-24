/**
 * [C2] Boarding inputs that are configuration, not merchant data.
 *
 * A Valor merchant can't be boarded from DEXA's records alone: it also needs a
 * DEXA-owned fee schedule and an acquirer profile (which MID/TID block + which
 * `/create` variant to board onto). Those live in the environment, not the DB,
 * and are read here with loud errors when absent so the boarding preflight can
 * report exactly what's missing instead of failing mid-sequence on Valor.
 */

import type { EnvLike } from "./config";
import { ValorConfigError } from "./config";
import type {
  BoardingMerchantDetails,
  BoardingStoreDetails,
  ValorFeeSchedule,
} from "./boarding";
import type { ValorAcquirerConfig } from "./boardingApi";

/** Default MCC for restaurants (5812 = eating places) when none is configured. */
const DEFAULT_MCC = "5812";

function num(value: string | undefined): number | null {
  if (value === undefined) return null;
  const n = Number(value.trim());
  return Number.isFinite(n) ? n : null;
}

/**
 * Read the DEXA-owned fee schedule applied to every boarded Valor account.
 *
 * All four fields are required — C1's `fee_schedule_required_for_merchant_purposes`
 * CHECK rejects an active Valor online_order row missing any of them.
 */
export function readValorFeeSchedule(env: EnvLike = process.env): ValorFeeSchedule {
  const feeScheduleId = env.VALOR_FEE_SCHEDULE_ID?.trim();
  const discRatePercent = num(env.VALOR_FEE_DISC_RATE_PERCENT);
  const residualBps = num(env.VALOR_FEE_RESIDUAL_BPS);
  const surchargePercent = num(env.VALOR_FEE_SURCHARGE_PERCENT);

  const missing: string[] = [];
  if (!feeScheduleId) missing.push("VALOR_FEE_SCHEDULE_ID");
  if (discRatePercent === null) missing.push("VALOR_FEE_DISC_RATE_PERCENT");
  if (residualBps === null) missing.push("VALOR_FEE_RESIDUAL_BPS");
  if (surchargePercent === null) missing.push("VALOR_FEE_SURCHARGE_PERCENT");

  if (missing.length > 0) {
    throw new ValorConfigError(
      `Missing Valor fee schedule config: ${missing.join(", ")}. ` +
        "All four are required — C1's fee_schedule_required_for_merchant_purposes " +
        "constraint rejects a boarded Valor online_order account without them."
    );
  }

  return {
    feeScheduleId: feeScheduleId as string,
    discRatePercent: discRatePercent as number,
    residualBps: residualBps as number,
    surchargePercent: surchargePercent as number,
  };
}

/**
 * Read the acquirer boarding profile.
 *
 * `VALOR_BOARDING_PROCESSOR_DATA` is the per-acquirer MID/TID credential block
 * (JSON). In sandbox these are Valor's published test values; in production they
 * come from the acquirer at underwriting. Kept opaque so this stays FD/TSYS
 * agnostic.
 */
export function readValorAcquirerConfig(
  env: EnvLike = process.env
): ValorAcquirerConfig {
  const createVariant = env.VALOR_BOARDING_CREATE_VARIANT?.trim();
  const processor = env.VALOR_BOARDING_PROCESSOR?.trim();
  const processorDataRaw = env.VALOR_BOARDING_PROCESSOR_DATA?.trim();

  const missing: string[] = [];
  if (!createVariant) missing.push("VALOR_BOARDING_CREATE_VARIANT");
  if (!processor) missing.push("VALOR_BOARDING_PROCESSOR");
  if (!processorDataRaw) missing.push("VALOR_BOARDING_PROCESSOR_DATA");

  if (missing.length > 0) {
    throw new ValorConfigError(
      `Missing Valor acquirer boarding config: ${missing.join(", ")}. ` +
        "VALOR_BOARDING_PROCESSOR_DATA is the acquirer MID/TID block (JSON) — " +
        "Valor's test values in sandbox, underwriting output in production."
    );
  }

  let processorData: Record<string, unknown>;
  try {
    processorData = JSON.parse(processorDataRaw as string) as Record<string, unknown>;
  } catch {
    throw new ValorConfigError(
      "VALOR_BOARDING_PROCESSOR_DATA must be valid JSON (the acquirer MID/TID block)."
    );
  }

  return {
    createVariant: createVariant as string,
    storeVariant: env.VALOR_BOARDING_STORE_VARIANT?.trim() || "storeadd",
    processor: processor as string,
    programType: env.VALOR_BOARDING_PROGRAM_TYPE?.trim() || "2",
    device: env.VALOR_BOARDING_DEVICE?.trim() || "139",
    deviceType: env.VALOR_BOARDING_DEVICE_TYPE?.trim() || "Soft POS",
    ...(env.VALOR_ISO_SUBMAIL_ID?.trim()
      ? { associateUserName: env.VALOR_ISO_SUBMAIL_ID.trim() }
      : {}),
    ...(env.VALOR_BOARDING_ISV_USERNAME?.trim()
      ? { isvUserName: env.VALOR_BOARDING_ISV_USERNAME.trim() }
      : {}),
    processorData,
  };
}

export function readBoardingMcc(env: EnvLike = process.env): string {
  return env.VALOR_BOARDING_MCC?.trim() || DEFAULT_MCC;
}

// ────────────────────────────────────────────────────────────────────────────
// DB row → boarding detail mapping.
// ────────────────────────────────────────────────────────────────────────────

/** The `merchants` columns boarding reads. */
export interface MerchantBoardingRow {
  business_legal_name: string | null;
  dba_name: string | null;
  name: string | null;
  owner_first_name: string | null;
  owner_last_name: string | null;
  owner_email: string | null;
  owner_phone: string | null;
  business_address_line1: string | null;
  business_city: string | null;
  business_state: string | null;
  business_postal_code: string | null;
  business_country: string | null;
}

/** The `locations` columns boarding reads. */
export interface LocationBoardingRow {
  id: string;
  name: string | null;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  timezone: string | null;
}

function digits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

/** US timezone abbreviations Valor accepts on store/legal timezone. */
const VALOR_TIMEZONES = new Set(["EST", "CST", "MST", "PST", "AKST", "HST"]);

const IANA_TO_VALOR_TZ: Record<string, string> = {
  "America/New_York": "EST",
  "America/Detroit": "EST",
  "America/Toronto": "EST",
  "America/Chicago": "CST",
  "America/Denver": "MST",
  "America/Phoenix": "MST",
  "America/Los_Angeles": "PST",
  "America/Anchorage": "AKST",
  "Pacific/Honolulu": "HST",
  "America/Adak": "HST",
};

/**
 * Valor wants a US timezone ABBREVIATION (e.g. "EST"), but DEXA stores IANA names
 * (e.g. "America/Phoenix") — sending the IANA name fails "invalid store/timezone".
 * Map known zones; default to EST so boarding never blocks on an unmapped zone.
 */
export function normalizeValorTimezone(tz: string | null | undefined): string {
  const t = (tz ?? "").trim();
  if (!t) return "EST";
  if (VALOR_TIMEZONES.has(t.toUpperCase())) return t.toUpperCase();
  return IANA_TO_VALOR_TZ[t] ?? "EST";
}

/**
 * Strip gmail-style plus-addressing (`temur+tag@gmail.com` → `temur@gmail.com`).
 * The `+tag` is delivery routing, not identity, and Valor's email validator
 * rejects it outright ("Invalid email format"). Same inbox, Valor-acceptable.
 */
export function normalizeValorEmail(email: string | null | undefined): string {
  const e = (email ?? "").trim();
  const at = e.indexOf("@");
  if (at <= 0) return e;
  const local = e.slice(0, at).replace(/\+.*$/, "");
  return `${local}${e.slice(at)}`;
}

export function mapMerchantToBoardingDetails(
  row: MerchantBoardingRow,
  mccCode: string
): BoardingMerchantDetails {
  const dba = row.dba_name ?? row.name ?? row.business_legal_name ?? "";
  return {
    legalName: row.business_legal_name ?? row.name ?? "",
    dbaName: dba,
    firstName: row.owner_first_name ?? "",
    lastName: row.owner_last_name ?? "",
    emailId: normalizeValorEmail(row.owner_email),
    mobile: digits(row.owner_phone),
    legalAddress: row.business_address_line1 ?? "",
    legalCity: row.business_city ?? "",
    legalState: (row.business_state ?? "").toUpperCase(),
    legalZipCode: digits(row.business_postal_code),
    legalCountry: row.business_country ?? "US",
    mccCode,
  };
}

export function mapLocationToStore(
  location: LocationBoardingRow,
  merchant: MerchantBoardingRow
): BoardingStoreDetails {
  return {
    storeName: location.name ?? merchant.dba_name ?? "Store",
    storeAddress: location.address_line1 ?? merchant.business_address_line1 ?? "",
    storeCity: location.city ?? merchant.business_city ?? "",
    storeState: (location.state ?? merchant.business_state ?? "").toUpperCase(),
    storeZipCode: digits(location.postal_code ?? merchant.business_postal_code),
    storeCountry: location.country ?? merchant.business_country ?? "US",
    storeTimezone: normalizeValorTimezone(location.timezone),
    // The merchant owner is the store supervisor unless a per-location contact
    // is captured later.
    superVisorName: `${merchant.owner_first_name ?? ""} ${merchant.owner_last_name ?? ""}`.trim(),
    superVisorEmail: normalizeValorEmail(merchant.owner_email),
    superVisorContact: digits(merchant.owner_phone),
  };
}

/** Required merchant fields boarding cannot proceed without. */
export function missingMerchantFields(row: MerchantBoardingRow): string[] {
  const details = mapMerchantToBoardingDetails(row, DEFAULT_MCC);
  const missing: string[] = [];
  if (!details.legalName) missing.push("business legal name");
  if (!details.firstName) missing.push("owner first name");
  if (!details.lastName) missing.push("owner last name");
  if (!details.emailId) missing.push("owner email");
  if (details.mobile.length < 10) missing.push("owner phone (10 digits)");
  if (!details.legalAddress) missing.push("business address");
  if (!details.legalCity) missing.push("business city");
  if (details.legalState.length !== 2) missing.push("business state (2-letter)");
  if (details.legalZipCode.length < 5) missing.push("business ZIP (5 digits)");
  return missing;
}

/** Required per-location fields, keyed by location id. */
export function missingLocationFields(
  location: LocationBoardingRow,
  merchant: MerchantBoardingRow
): string[] {
  const store = mapLocationToStore(location, merchant);
  const missing: string[] = [];
  if (!store.storeAddress) missing.push("address");
  if (!store.storeCity) missing.push("city");
  if (store.storeState.length !== 2) missing.push("state (2-letter)");
  if (store.storeZipCode.length < 5) missing.push("ZIP (5 digits)");
  return missing;
}
