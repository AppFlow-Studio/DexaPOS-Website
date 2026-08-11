/**
 * Throwaway diagnostic: Valor SANDBOX GetClientToken.
 *   npx tsx valor-smoke.ts
 * Prints the exact creds parsed from env and the exact JSON body sent, so we can
 * confirm parsing + wire-passing, and see the full raw response (not just error_no).
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

async function tryPost(label: string, url: string, body: object) {
  console.log(`\n── ${label} ──`);
  console.log("POST", url);
  console.log("body:", JSON.stringify(body));
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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

  // Full values — user is rotating this key afterward.
  console.log("PARSED FROM ENV:");
  console.log("  appId :", JSON.stringify(c.appId), "len", c.appId.length);
  console.log("  appKey:", JSON.stringify(c.appKey), "len", c.appKey.length);
  console.log("  epi   :", JSON.stringify(c.epi));

  const body = {
    appid: c.appId,
    appkey: c.appKey,
    epi: c.epi,
    txn_type: "clientToken",
  };

  // Documented host is :443 (create-page-token). Passage.js sandbox docs mention
  // :4430. Try both so we can see which the securelink service accepts.
  await tryPost("gptoken @ :443 (documented)", `${ep.transactionBaseUrl}/?gptoken`, body);
  await tryPost("gptoken @ :4430 (passage host)", `${ep.clientTokenBaseUrl}/?gptoken`, body);
}

main();
