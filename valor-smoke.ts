/**
 * Throwaway diagnostic: Valor SANDBOX credential + host verification.
 *   npx tsx valor-smoke.ts
 *
 * Exercises the two credential-independent legs of the Valor rail:
 *   1. GetClientToken — securelink host, BODY creds (appid/appkey/epi)
 *   2. Add Customer   — vault host, HEADER creds (Valor-App-ID/-Key, no epi)
 * The actual card SALE needs a Passage.js browser token and is not covered here.
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd(), true, {
  info() {},
  error: (...a: unknown[]) => console.error(...a),
  warn() {},
});

import {
  readTestMerchantCredentials,
  resolveValorEndpoints,
} from "./lib/payments/valor/config";

async function tryPost(
  label: string,
  url: string,
  body: object,
  headers: Record<string, string> = {}
) {
  console.log(`\n── ${label} ──`);
  console.log("POST", url);
  console.log("body:", JSON.stringify(body));
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    const text = await res.text();
    console.log("status:", res.status);
    console.log("raw   :", text);
  } catch (e) {
    console.log("fetch error:", e instanceof Error ? e.message : String(e));
  }
}

async function main() {
  const c = readTestMerchantCredentials();
  const ep = resolveValorEndpoints();

  console.log("PARSED FROM ENV:");
  console.log("  appId :", JSON.stringify(c.appId), "len", c.appId.length);
  console.log("  appKey:", JSON.stringify(c.appKey), "len", c.appKey.length);
  console.log("  epi   :", JSON.stringify(c.epi), "valid:", /^2\d{9}$/.test(c.epi));

  // ── Leg 1: GetClientToken (securelink, body creds) ──────────────────────
  const gpBody = {
    appid: c.appId,
    appkey: c.appKey,
    epi: c.epi,
    txn_type: "clientToken",
  };
  await tryPost(
    "GetClientToken @ :443 (documented)",
    `${ep.transactionBaseUrl}/?gptoken`,
    gpBody
  );

  // ── Leg 2: Add Customer (vault, HEADER creds, no epi) ───────────────────
  const custBody = {
    customer_name: "Dexa Smoke Test",
    address_details: [{ address_label: "primary" }],
  };
  await tryPost(
    "Add Customer @ vault (header creds)",
    `${ep.vaultBaseUrl}/api/valor-vault/addcustomer`,
    custBody,
    { "Valor-App-ID": c.appId, "Valor-App-Key": c.appKey }
  );
}

main();
