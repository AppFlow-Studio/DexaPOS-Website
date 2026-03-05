/**
 * One-shot backfill script for the successful OrderOut onboarding that
 * wasn't stored due to the response field name mismatch.
 *
 * Run: npx tsx scripts/backfill-orderout.ts
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

// Parse .env manually (no dotenv dependency)
const envPath = resolve(__dirname, "..", ".env");
const envContent = readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  let val = trimmed.slice(eqIdx + 1).trim();
  // Strip surrounding quotes
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  if (!process.env[key]) process.env[key] = val;
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Data from the successful OrderOut onboarding response
const MERCHANT_ID = "2add44cb-f498-4653-aca3-a8f0ca258e70";
const LOCATION_ID = "657a703d-37ef-423e-a72b-a8766f67941a";
const OO_ACCOUNT_ID = "4598357012119552";
const OO_RESTAURANT_ID = "6487684134600704";
const OO_BILLING_ACCOUNT_ID = "5546155819794432";
const ACCOUNT_MANAGER_EMAIL = "support@dexaposai.com";

const RAW_RESPONSE = {
  url: "https://dashboard.orderout.co/",
  account: Number(OO_ACCOUNT_ID),
  restaurant: Number(OO_RESTAURANT_ID),
};

async function main() {
  console.log("Starting OrderOut backfill...");

  // 1. Upsert orderout_accounts
  const { data: account, error: accountErr } = await supabase
    .from("orderout_accounts")
    .upsert(
      {
        merchant_id: MERCHANT_ID,
        oo_account_id: OO_ACCOUNT_ID,
        oo_billing_account_id: OO_BILLING_ACCOUNT_ID,
        account_manager_email: ACCOUNT_MANAGER_EMAIL,
        status: "active",
        raw_response: RAW_RESPONSE,
      },
      { onConflict: "merchant_id" }
    )
    .select("id")
    .single();

  if (accountErr) {
    console.error("Failed to upsert orderout_accounts:", accountErr);
    process.exit(1);
  }

  console.log("orderout_accounts upserted:", account.id);

  // 2. Insert orderout_restaurants
  const { data: restaurant, error: restErr } = await supabase
    .from("orderout_restaurants")
    .upsert(
      {
        orderout_account_id: account.id,
        location_id: LOCATION_ID,
        oo_restaurant_id: OO_RESTAURANT_ID,
        oo_account_id: OO_ACCOUNT_ID,
        merchant_id: MERCHANT_ID,
        pos_uuid: LOCATION_ID,
        status: "active",
        raw_response: RAW_RESPONSE,
      },
      { onConflict: "location_id" }
    )
    .select("id, oo_restaurant_id")
    .single();

  if (restErr) {
    console.error("Failed to upsert orderout_restaurants:", restErr);
    process.exit(1);
  }

  console.log("orderout_restaurants upserted:", restaurant.id, "oo_restaurant_id:", restaurant.oo_restaurant_id);
  console.log("Backfill complete!");
}

main();
