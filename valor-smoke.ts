/**
 * Throwaway diagnostic: Valor SANDBOX GetClientToken.
 *   npx tsx valor-smoke.ts
 * Self-contained (no ./lib imports) so tsx path resolution can't get in the way.
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd(), true, {
  info() {},
  error: (...a: unknown[]) => console.error(...a),
  warn() {},
});

const TRANSACTION_BASE = "https://securelink-staging.valorpaytech.com:443";
const CLIENT_TOKEN_BASE = "https://securelink-staging.valorpaytech.com:4430";

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
  const appId = process.env.VALOR_TEST_APP_ID ?? "";
  const appKey = process.env.VALOR_TEST_APP_KEY ?? "";
  const epi = process.env.VALOR_TEST_EPI ?? "";

  console.log("PARSED FROM ENV:");
  console.log("  appId :", JSON.stringify(appId), "len", appId.length);
  console.log("  appKey:", JSON.stringify(appKey), "len", appKey.length);
  console.log("  epi   :", JSON.stringify(epi), "valid:", /^2\d{9}$/.test(epi));

  if (!appId || !appKey || !epi) {
    console.log("\nMissing VALOR_TEST_APP_ID / VALOR_TEST_APP_KEY / VALOR_TEST_EPI in .env");
    return;
  }

  const body = { appid: appId, appkey: appKey, epi, txn_type: "clientToken" };

  await tryPost("gptoken @ :443 (documented)", `${TRANSACTION_BASE}/?gptoken`, body);
  await tryPost("gptoken @ :4430 (passage host)", `${CLIENT_TOKEN_BASE}/?gptoken`, body);
}

main();
