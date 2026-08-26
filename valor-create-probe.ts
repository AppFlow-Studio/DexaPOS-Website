/**
 * Throwaway diagnostic: isolate the /create 401
 *   "Invalid Secret key or invalid associate_user_name"
 *   npx tsx valor-create-probe.ts
 *
 * Logs in once, then tries /create auth variations. A 401 creates nothing, so we
 * probe until auth passes; the moment the error changes (or it succeeds) we know
 * which input was wrong. Stops on the first non-secret-key response.
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd(), true, {
  info() {},
  error: (...a: unknown[]) => console.error(...a),
  warn() {},
});

import { resolveValorEndpoints } from "./lib/payments/valor/config";

const ep = resolveValorEndpoints();
const isv = process.env.VALOR_ISV_SECRET_KEY?.trim() ?? "";
const user = process.env.VALOR_ISO_MAIL_ID?.trim() ?? "";
const pass = process.env.VALOR_ISO_PASSCODE?.trim() ?? "";

async function login(): Promise<string> {
  const res = await fetch(`${ep.boardingBaseUrl}/api/valor/login?isotoken`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "isv-secret-key": isv },
    body: JSON.stringify({ mailId: user, SubmailId: user, passCode: pass }),
  });
  const body = (await res.json()) as { access_token?: string };
  if (!body.access_token) throw new Error("login failed");
  return body.access_token;
}

/** Minimal-but-plausible create body; associate_user_name toggled by caller. */
function createBody(associate: string | null) {
  return {
    legalName: "Dexa Probe LLC",
    dbaName: "Dexa Probe",
    firstName: "Sam",
    lastName: "Owner",
    emailId: "support@dexaposai.com",
    userName: "support@dexaposai.com",
    mobile: "4805551212",
    legalAddress: "1 Main St",
    legalCity: "Tempe",
    legalState: "AZ",
    legalCountry: "US",
    legalZipCode: "85284",
    legalTimezone: "EST",
    role: "10",
    userType: "4",
    isTxnAllowed: "1",
    selectedState: "AZ",
    programType: "2",
    processor: "1",
    rollUp: "0",
    ...(associate ? { associate_user_name: associate } : {}),
    storeData: [
      {
        storeName: "Dexa Probe",
        storeAddress: "1 Main St",
        storeState: "AZ",
        storeCountry: "US",
        storeZipCode: "85284",
        storeTimezone: "EST",
        superVisorName: "Sam Owner",
        superVisorEmail: "support@dexaposai.com",
        superVisorContact: "4805551212",
        mccCode: "5812",
        epiData: [
          {
            device: "139",
            deviceType: "Soft POS",
            processor: "1",
            epiLabel: "VT",
            selectedState: "AZ",
            features: {
              tip: { enabled: false, value: [5, 10, 15, 20] },
              surcharge: { enabled: false, value: "0.00" },
              tax: { enabled: false, value: "0.00" },
            },
            processorData: [
              {
                mid: "887000003193",
                vNumber: "75021674",
                storeNo: "5999",
                termNo: "1515",
                association: "949006",
                chain: "111111",
                agent: "0001",
                binnumber: "999991",
                agentBank: "000000",
                industry: "Retail",
                EBTcash: 0,
                EBTfood: 0,
                label: "MERCHANT PORTAL LOGIN",
                surchargeIndicator: "0",
                surchargePercentage: "0.000",
                programType: "surcharge",
              },
            ],
          },
        ],
      },
    ],
  };
}

async function tryCreate(
  label: string,
  token: string,
  withIsv: boolean,
  associate: string | null
): Promise<string> {
  console.log(`\n── ${label} ──`);
  const res = await fetch(`${ep.boardingBaseUrl}/api/valor/create?surchargetsys`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(withIsv && isv ? { "isv-secret-key": isv } : {}),
    },
    body: JSON.stringify(createBody(associate)),
  });
  const text = await res.text();
  console.log("  ←", res.status, text.slice(0, 600));
  return text;
}

async function main() {
  console.log("isv-secret-key len:", isv.length);
  const token = await login();
  console.log("login OK, token acquired");

  const secretErr = "Invalid Secret key or invalid associate_user_name";

  const variants: Array<[string, boolean, string | null]> = [
    ["isv header + associate=DexaISO (control)", true, "DexaISO"],
    ["NO isv header + associate=DexaISO", false, "DexaISO"],
    ["isv header + NO associate", true, null],
    ["NO isv header + NO associate", false, null],
  ];

  for (const [label, withIsv, associate] of variants) {
    const text = await tryCreate(label, token, withIsv, associate);
    if (!text.includes(secretErr)) {
      console.log("\n>>> auth passed (or new error) on this variant — stopping.");
      break;
    }
  }
}

main();
