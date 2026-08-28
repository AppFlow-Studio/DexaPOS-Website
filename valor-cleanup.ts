/**
 * Throwaway: delete orphaned Valor SANDBOX test merchants created during boarding
 * smoke runs.  npx tsx valor-cleanup.ts
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd(), true, {
  info() {},
  error: (...a: unknown[]) => console.error(...a),
  warn() {},
});

import { resolveValorEndpoints } from "./lib/payments/valor/config";

const ep = resolveValorEndpoints();
const user = process.env.VALOR_ISO_MAIL_ID?.trim() ?? "";
const pass = process.env.VALOR_ISO_PASSCODE?.trim() ?? "";
const isv = process.env.VALOR_ISV_SECRET_KEY?.trim() ?? "";

const MP_IDS = ["165160", "165163", "165166"];

async function main() {
  const loginRes = await fetch(`${ep.boardingBaseUrl}/api/valor/login?isotoken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mailId: user, SubmailId: user, passCode: pass }),
  });
  const { access_token } = (await loginRes.json()) as { access_token?: string };
  if (!access_token) throw new Error("login failed");
  console.log("login OK");

  for (const mp_id of MP_IDS) {
    const res = await fetch(`${ep.boardingBaseUrl}/api/valor/delete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${access_token}`,
        "isv-secret-key": isv,
      },
      body: JSON.stringify({ mp_id, associate_user_name: user }),
    });
    console.log(`delete ${mp_id}:`, res.status, (await res.text()).slice(0, 200));
  }
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
