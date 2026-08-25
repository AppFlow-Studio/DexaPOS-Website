import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd(), true, { info() {}, error: (...a: unknown[]) => console.error(...a), warn() {} });
import { resolveValorEndpoints } from "./lib/payments/valor/config";
const ep = resolveValorEndpoints();
const user = process.env.VALOR_ISO_MAIL_ID?.trim() ?? "";
const pass = process.env.VALOR_ISO_PASSCODE?.trim() ?? "";
const EPI = process.argv[2] ?? "2319991700";
(async () => {
  const l = await fetch(`${ep.boardingBaseUrl}/api/valor/login?isotoken`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mailId: user, SubmailId: user, passCode: pass }),
  });
  const { access_token } = (await l.json()) as { access_token?: string };
  const r = await fetch(`${ep.boardingBaseUrl}/api/valor/getEpiAppKeyDetails?apikey`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${access_token}` },
    body: JSON.stringify({ epi: EPI, associate_user_name: user }),
  });
  console.log(await r.text());
})();
