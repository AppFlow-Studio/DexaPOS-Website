/**
 * Throwaway: tie the knot — Valor sandbox boarding -> real staging DB persist.
 *   npx tsx valor-board-persist-smoke.ts
 *
 * Boards a Valor merchant (creates real sandbox state), then persists the result
 * through board_persist_valor_account (service role, app key -> Vault) against a
 * REAL staging merchant+location, and verifies the app key decrypts back via
 * get_valor_account_credentials. Prints the new mpId + account_id for cleanup.
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd(), true, {
  info() {},
  error: (...a: unknown[]) => console.error(...a),
  warn() {},
});

import { createClient } from "@supabase/supabase-js";
import { onboardValorMerchant } from "./lib/payments/valor/boardingApi";
import {
  readValorAcquirerConfig,
  readValorFeeSchedule,
} from "./lib/payments/valor/boardingConfig";
import { readIsoCredentials } from "./lib/payments/valor/auth";
import type {
  BoardedAccount,
  BoardingMerchantDetails,
  LocationInput,
} from "./lib/payments/valor/boarding";

// Real staging merchant + location (Main Street Diner) so FKs + the
// enforce_mpa_location_merchant trigger are satisfied.
const REAL_MERCHANT_ID = "4637b8bf-5562-41c6-a0da-7301b867daf2";
const REAL_LOCATION_ID = "05c2559d-7d6d-4d98-8c1c-8b6d3b447c4a";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function main() {
  const iso = readIsoCredentials();
  const fees = readValorFeeSchedule();
  const acquirer = readValorAcquirerConfig();

  const stamp = Date.now().toString().slice(-8);
  const merchant: BoardingMerchantDetails = {
    legalName: `Dexa Persist ${stamp} LLC`,
    dbaName: "Dexa Persist Diner",
    firstName: "Sam",
    lastName: "Owner",
    emailId: `dexapersist${stamp}@dexaposai.com`,
    mobile: "4805551212",
    legalAddress: "1 Main St",
    legalCity: "Tempe",
    legalState: "AZ",
    legalZipCode: "85284",
    legalCountry: "US",
    legalTimezone: "EST",
    mccCode: "5812",
  };

  const locations: LocationInput[] = [
    {
      store: {
        storeName: "Dexa Persist Diner",
        storeAddress: "1 Main St",
        storeCity: "Tempe",
        storeState: "AZ",
        storeZipCode: "85284",
        storeCountry: "US",
        storeTimezone: "EST",
        superVisorName: "Sam Owner",
        superVisorEmail: "support@dexaposai.com",
        superVisorContact: "4805551212",
      },
      dexaLocationId: REAL_LOCATION_ID,
      epiLabel: "VT",
    },
  ];

  let accountId: string | null = null;
  let boardedAppKey = "";
  let boardedMpId = "";

  const persist = async (account: BoardedAccount) => {
    boardedAppKey = account.valorAppKey;
    boardedMpId = account.valorMerchantId;
    const { data, error } = await supabase.rpc("board_persist_valor_account", {
      p_merchant_id: account.dexaMerchantId,
      p_location_id: account.dexaLocationId,
      p_valor_merchant_id: account.valorMerchantId,
      p_valor_store_id: account.valorStoreId,
      p_valor_epi: account.valorEpi,
      p_valor_appid: account.valorAppId,
      p_valor_appkey: account.valorAppKey,
      p_valor_new_user_id: account.valorNewUserId,
      p_fee_schedule_id: account.fees.feeScheduleId,
      p_disc_rate_percent: account.fees.discRatePercent,
      p_residual_bps: account.fees.residualBps,
      p_surcharge_percent: account.fees.surchargePercent,
      p_is_primary: false,
    });
    if (error) throw new Error(`persist RPC failed: ${error.message}`);
    accountId = data as string;
  };

  console.log("═══ BOARD + PERSIST ═══");
  const result = await onboardValorMerchant(
    { credentials: iso, acquirer },
    merchant,
    fees,
    REAL_MERCHANT_ID,
    locations,
    persist
  );

  console.log("boarded accounts:", result.accounts.length, "failures:", result.failures.length);
  console.log("new Valor mpId  :", boardedMpId);
  console.log("DB account_id   :", accountId);

  // Verify the app key decrypts back out of Vault.
  const { data: creds, error: credErr } = await supabase.rpc(
    "get_valor_account_credentials",
    { p_account_id: accountId }
  );
  if (credErr) throw new Error(`get creds failed: ${credErr.message}`);
  const row = Array.isArray(creds) ? creds[0] : creds;

  console.log("\n═══ DB ROW VERIFY ═══");
  console.log("valor_appid     :", row?.valor_appid);
  console.log("valor_epi       :", row?.valor_epi);
  console.log("appkey decrypts + matches boarded:", row?.decrypted_appkey === boardedAppKey);

  // Show the stored column holds a vault UUID, not the plaintext key.
  const { data: rowData } = await supabase
    .from("merchant_processor_accounts")
    .select("processor, purpose, is_active, is_primary, valor_appkey_encrypted")
    .eq("id", accountId)
    .single();
  console.log(
    "stored row      :",
    JSON.stringify({
      ...rowData,
      valor_appkey_encrypted_is_uuid: /^[0-9a-f-]{36}$/.test(
        (rowData as any)?.valor_appkey_encrypted ?? ""
      ),
      valor_appkey_encrypted: undefined,
    })
  );
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
