/**
 * Throwaway diagnostic: Valor SANDBOX boarding end-to-end.
 *   npx tsx valor-board-smoke.ts
 *
 * 1. Prints the exact ISO creds + fee schedule + acquirer config parsed from .env
 *    (catches dotenv-expand `$` corruption + un-stripped inline comments).
 * 2. Drives the REAL onboardValorMerchant against the sandbox boarding host with a
 *    logging fetch, so every request/response is visible — this is the supervised
 *    first run that confirms the UNVERIFIED response-field readers.
 *
 * Uses a logging persist (no DB write) so this run is purely about the Valor side.
 * NOTE: a successful run creates a real TEST merchant on Valor's sandbox.
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd(), true, {
  info() {},
  error: (...a: unknown[]) => console.error(...a),
  warn() {},
});

import { onboardValorMerchant } from "./lib/payments/valor/boardingApi";
import {
  readValorAcquirerConfig,
  readValorFeeSchedule,
} from "./lib/payments/valor/boardingConfig";
import { readIsoCredentials } from "./lib/payments/valor/auth";
import { resolveValorEndpoints } from "./lib/payments/valor/config";
import type {
  BoardedAccount,
  BoardingMerchantDetails,
  LocationInput,
} from "./lib/payments/valor/boarding";

function loggingFetch(): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    console.log(`\n→ ${init?.method ?? "GET"} ${url}`);
    if (init?.body) console.log(`  body: ${String(init.body).slice(0, 1500)}`);
    const res = await fetch(input, init);
    const text = await res.text();
    console.log(`  ← ${res.status}: ${text.slice(0, 2000)}`);
    return new Response(text, { status: res.status, headers: res.headers });
  }) as unknown as typeof fetch;
}

async function main() {
  console.log("═══ PARSED ENV ═══");
  const iso = readIsoCredentials();
  console.log("iso.mailId    :", JSON.stringify(iso.mailId));
  console.log("iso.subMailId :", JSON.stringify(iso.subMailId));
  console.log("iso.passCode  :", JSON.stringify(iso.passCode), "len", iso.passCode.length);
  console.log("iso.isvSecret :", JSON.stringify(iso.isvSecretKey));

  const fees = readValorFeeSchedule();
  console.log("fees          :", JSON.stringify(fees));

  const acquirer = readValorAcquirerConfig();
  console.log("acquirer      :", JSON.stringify(acquirer));

  const endpoints = resolveValorEndpoints();
  console.log("boardingBase  :", endpoints.boardingBaseUrl);

  // ── Synthetic test merchant + one location ──────────────────────────────────
  // Valor enforces a unique userName (= emailId), so stamp each run to allow
  // repeated sandbox boardings.
  const stamp = Date.now().toString().slice(-8);
  const merchant: BoardingMerchantDetails = {
    legalName: `Dexa Test ${stamp} LLC`,
    dbaName: "Dexa Test Diner",
    firstName: "Sam",
    lastName: "Owner",
    emailId: `dexatest${stamp}@dexaposai.com`,
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
        storeName: "Dexa Test Diner",
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
      dexaLocationId: "test-loc-1",
      epiLabel: "VT",
    },
    {
      // Second location → exercises /createStore (reveals its response shape).
      store: {
        storeName: "Dexa Test Diner 2",
        storeAddress: "2 Second St",
        storeCity: "Mesa",
        storeState: "AZ",
        storeZipCode: "85201",
        storeCountry: "US",
        storeTimezone: "MST",
        superVisorName: "Sam Owner",
        superVisorEmail: "support@dexaposai.com",
        superVisorContact: "4805551212",
      },
      dexaLocationId: "test-loc-2",
      epiLabel: "VT",
    },
  ];

  const persist = async (account: BoardedAccount) => {
    console.log("\n✔ WOULD PERSIST:", JSON.stringify({ ...account, valorAppKey: "***" }));
  };

  console.log("\n═══ BOARDING (sandbox) ═══");
  try {
    const result = await onboardValorMerchant(
      { credentials: iso, acquirer, fetchImpl: loggingFetch() },
      merchant,
      fees,
      "test-dexa-merchant",
      locations,
      persist
    );
    console.log("\n═══ RESULT ═══");
    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    console.log("\n═══ BOARDING FAILED ═══");
    if (e && typeof e === "object") {
      const err = e as Record<string, unknown>;
      console.log("name    :", err.name);
      console.log("step    :", err.step);
      console.log("message :", err.message);
      console.log("orphaned:", JSON.stringify(err.orphaned));
      console.log("cleanedUp:", err.cleanedUp);
    } else {
      console.log(e);
    }
  }
}

main();
