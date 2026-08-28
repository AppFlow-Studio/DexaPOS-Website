/**
 * Throwaway: does /createStore require newUserId, or is mp_id alone enough?
 *   npx tsx valor-provision-probe.ts
 * Uses an existing sandbox merchant (165175 from a prior smoke run).
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd(), true, { info() {}, error: (...a: unknown[]) => console.error(...a), warn() {} });

import { resolveValorEndpoints } from "./lib/payments/valor/config";

const ep = resolveValorEndpoints();
const user = process.env.VALOR_ISO_MAIL_ID?.trim() ?? "";
const pass = process.env.VALOR_ISO_PASSCODE?.trim() ?? "";
const MP_ID = "165175"; // existing sandbox merchant

const storeData = [{
  storeName: "Reprovision Test",
  storeAddress: "9 Ninth St",
  storeCity: "Gilbert",
  storeState: "AZ",
  storeCountry: "US",
  storeZipCode: "85233",
  storeTimezone: "MST",
  superVisorName: "Sam Owner",
  superVisorEmail: "support@dexaposai.com",
  superVisorContact: "4805551212",
  mccCode: "5812",
  epiData: [{
    device: "139", deviceType: "Soft POS", processor: "1", epiLabel: "VT", selectedState: "AZ",
    features: { tip: { enabled: false, value: [5,10,15,20] }, surcharge: { enabled: false, value: "0.00" }, tax: { enabled: false, value: "0.00" } },
    processorData: [{
      mid: "", vNumber: "", storeNo: "", termNo: "", association: "", chain: "", agent: "", binnumber: "", agentBank: "", industry: "",
      mid1: "887000003193", vNumber1: "75021674", storeNo1: "5999", termNo1: "1515", association1: "949006", chain1: "111111", agent1: "0001", binnumber1: "686868", agentBank1: "000000", industry1: "Retail",
      EBTcash: 0, EBTcash1: 0, EBTfood: 0, EBTfood1: 0, EbtNo: "", EbtNo1: "",
      label: "MERCHANT PORTAL LOGIN", surchargeIndicator: "0", surchargePercentage: "0.000", programType: "surcharge",
    }],
  }],
}];

async function main() {
  const loginRes = await fetch(`${ep.boardingBaseUrl}/api/valor/login?isotoken`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mailId: user, SubmailId: user, passCode: pass }),
  });
  const { access_token } = (await loginRes.json()) as { access_token?: string };
  console.log("login:", access_token ? "OK" : "FAIL");

  async function tryStore(label: string, body: object) {
    const res = await fetch(`${ep.boardingBaseUrl}/api/valor/createStore?storeadd`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${access_token}` },
      body: JSON.stringify(body),
    });
    console.log(`\n── ${label} ──\n`, res.status, (await res.text()).slice(0, 400));
  }

  // A: mp_id only, NO newUserId
  await tryStore("mp_id only (no newUserId)", {
    dbaName: "Reprovision", mp_id: MP_ID, selectedState: "AZ", s4f: "2", processor: "1", rollUp: "0",
    associate_user_name: user, storeData,
  });
}

main().catch((e) => { console.error("FAILED:", e instanceof Error ? e.message : e); process.exit(1); });
