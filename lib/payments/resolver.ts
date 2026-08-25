/**
 * [C2] Resolution of `merchant_processor_accounts` rows.
 *
 * Selection logic is a pure function (`selectAccount`) so it can be tested
 * without a database; the exported async function is a thin read around it.
 *
 * Writes are intentionally absent. C1's RLS grants merchants and carriers
 * SELECT only — INSERT/UPDATE/DELETE are HQ-only — so `boarding.ts` performs
 * its inserts through the service-role client under an explicit HQ contract.
 */

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  type PaymentPurpose,
  type ProcessorAccount,
  type ProcessorName,
} from "./types";

/** Only the keys these helpers read; keeps test doubles from needing NODE_ENV. */
export type EnvLike = Record<string, string | undefined>;

/** Raw `merchant_processor_accounts` row as returned by PostgREST. */
interface ProcessorAccountRow {
  id: string;
  merchant_id: string;
  location_id: string | null;
  processor: string;
  purpose: string;
  is_active: boolean;
  is_primary: boolean;
  valor_merchant_id: string | null;
  valor_store_id: string | null;
  valor_epi: string | null;
  valor_appid: string | null;
  valor_appkey_encrypted: string | null;
  valor_customer_profile_id: string | null;
  valor_payment_profile_id: string | null;
  fee_schedule_id: string | null;
  disc_rate_percent: number | null;
  residual_bps: number | null;
  surcharge_percent: number | null;
  nmi_merchant_id: string | null;
  nmi_customer_vault_id: string | null;
  webhook_secret_encrypted: string | null;
}

const ACCOUNT_COLUMNS = [
  "id",
  "merchant_id",
  "location_id",
  "processor",
  "purpose",
  "is_active",
  "is_primary",
  "valor_merchant_id",
  "valor_store_id",
  "valor_epi",
  "valor_appid",
  "valor_appkey_encrypted",
  "valor_customer_profile_id",
  "valor_payment_profile_id",
  "fee_schedule_id",
  "disc_rate_percent",
  "residual_bps",
  "surcharge_percent",
  "nmi_merchant_id",
  "nmi_customer_vault_id",
  "webhook_secret_encrypted",
].join(", ");

function isProcessorName(value: string): value is ProcessorName {
  return value === "nmi" || value === "valor";
}

function isPaymentPurpose(value: string): value is PaymentPurpose {
  return (
    value === "online_order" || value === "subscription" || value === "invoice"
  );
}

/**
 * Map a database row into application shape.
 *
 * Returns null for rows whose `processor` or `purpose` fall outside the union.
 * The database has check constraints on both, so this only fires if the
 * constraints are widened without this file being updated — in which case
 * skipping the row is safer than charging a card through an unknown processor.
 */
export function mapAccountRow(row: ProcessorAccountRow): ProcessorAccount | null {
  if (!isProcessorName(row.processor)) return null;
  if (!isPaymentPurpose(row.purpose)) return null;

  return {
    id: row.id,
    merchantId: row.merchant_id,
    locationId: row.location_id,
    processor: row.processor,
    purpose: row.purpose,
    isActive: row.is_active,
    isPrimary: row.is_primary,
    valor: {
      merchantId: row.valor_merchant_id,
      storeId: row.valor_store_id,
      epi: row.valor_epi,
      appId: row.valor_appid,
      appKeyEncrypted: row.valor_appkey_encrypted,
      customerProfileId: row.valor_customer_profile_id,
      paymentProfileId: row.valor_payment_profile_id,
    },
    fees: {
      scheduleId: row.fee_schedule_id,
      discRatePercent: row.disc_rate_percent,
      residualBps: row.residual_bps,
      surchargePercent: row.surcharge_percent,
    },
    nmi: {
      merchantId: row.nmi_merchant_id,
      customerVaultId: row.nmi_customer_vault_id,
    },
    webhookSecretEncrypted: row.webhook_secret_encrypted,
  };
}

export interface SelectAccountOptions {
  /**
   * Location being charged. A location-specific account wins over a
   * merchant-global one (`location_id IS NULL`) for the same purpose.
   */
  locationId?: string | null;
  /**
   * Kill switch from the cutover matrix. When set, an NMI account is chosen
   * even if a Valor account is marked primary — the rollback path stays open
   * without a deploy.
   */
  forceNmi?: boolean;
}

/**
 * Choose the account to charge through, from the candidate rows for a merchant
 * and purpose.
 *
 * Only active/primary rows are eligible. C1 enforces at most one active primary
 * per (merchant, location, purpose) via `uq_mpa_primary_scope`, so the only
 * ambiguity left for this function to settle is location specificity — and,
 * under the kill switch, processor preference.
 *
 * Returns null when nothing matches, which callers treat as "use the legacy
 * pre-C1 resolution path", mirroring how a NULL
 * `online_store_config.merchant_processor_account_id` behaves.
 */
export function selectAccount(
  accounts: ProcessorAccount[],
  options: SelectAccountOptions = {}
): ProcessorAccount | null {
  const { locationId = null, forceNmi = false } = options;

  const eligible = accounts.filter((a) => a.isActive && a.isPrimary);
  if (eligible.length === 0) return null;

  // Under the kill switch an NMI row is preferred at every location tier, so
  // narrow the pool before ranking rather than after.
  const pool = forceNmi
    ? eligible.filter((a) => a.processor === "nmi")
    : eligible;
  if (pool.length === 0) return null;

  const locationScoped =
    locationId !== null
      ? pool.filter((a) => a.locationId === locationId)
      : [];
  if (locationScoped.length > 0) return locationScoped[0];

  const merchantGlobal = pool.filter((a) => a.locationId === null);
  if (merchantGlobal.length > 0) return merchantGlobal[0];

  return null;
}

/** True when the `PAYMENTS_FORCE_NMI` kill switch is engaged. */
export function isNmiForced(env: EnvLike = process.env): boolean {
  return env.PAYMENTS_FORCE_NMI === "true";
}

export interface ResolveAccountOptions {
  locationId?: string | null;
  /** Overrides the `PAYMENTS_FORCE_NMI` environment check. Tests only. */
  forceNmi?: boolean;
}

/**
 * Read the active primary processor account for a merchant and purpose.
 *
 * Uses the service-role client: this runs on server-only paths where there may
 * be no Clerk session at all (webhook projection, scheduled billing), and C1's
 * RLS would otherwise return nothing.
 */
export async function resolveProcessorAccount(
  merchantId: string,
  purpose: PaymentPurpose,
  options: ResolveAccountOptions = {}
): Promise<ProcessorAccount | null> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("merchant_processor_accounts")
    .select(ACCOUNT_COLUMNS)
    .eq("merchant_id", merchantId)
    .eq("purpose", purpose)
    .eq("is_active", true)
    .eq("is_primary", true);

  if (error) {
    throw new Error(
      `Failed to resolve processor account for merchant ${merchantId} / ${purpose}: ${error.message}`
    );
  }

  const rows = (data ?? []) as unknown as ProcessorAccountRow[];
  const accounts = rows
    .map(mapAccountRow)
    .filter((a): a is ProcessorAccount => a !== null);

  return selectAccount(accounts, {
    locationId: options.locationId ?? null,
    forceNmi: options.forceNmi ?? isNmiForced(),
  });
}
