/**
 * Throwaway diagnostic: crack the Valor ISO login field mapping.
 *   npx tsx valor-login-probe.ts
 *
 * The login only mints a token — it creates nothing — so it is safe to try a few
 * principled mailId/SubmailId combinations. Valor's demo uses mailId==SubmailId,
 * so the account identifier may not be the sub-user email we first tried.
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd(), true, {
  info() {},
  error: (...a: unknown[]) => console.error(...a),
  warn() {},
});

import { resolveValorEndpoints } from "./lib/payments/valor/config";

const endpoints = resolveValorEndpoints();
const url = `${endpoints.boardingBaseUrl}/api/valor/login?isotoken`;
const isv = process.env.VALOR_ISV_SECRET_KEY?.trim() ?? "";
const email = process.env.VALOR_ISO_MAIL_ID?.trim() ?? "";
const sub = process.env.VALOR_ISO_SUBMAIL_ID?.trim() ?? "";
const pass = process.env.VALOR_ISO_PASSCODE?.trim() ?? "";

async function attempt(
  label: string,
  body: Record<string, string>,
  withIsv = true
) {
  console.log(`\n── ${label} ──`);
  console.log("  body:", JSON.stringify({ ...body, passCode: "***" }), withIsv ? "+isv" : "no-isv");
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(withIsv && isv ? { "isv-secret-key": isv } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    const text = await res.text();
    console.log("  ←", res.status, text.slice(0, 800));
  } catch (e) {
    console.log("  fetch error:", e instanceof Error ? e.message : String(e));
  }
}

async function main() {
  console.log("host:", endpoints.boardingBaseUrl);
  console.log("email:", JSON.stringify(email), "sub:", JSON.stringify(sub), "passLen:", pass.length);

  // 1. control (what already failed): email + sub username
  await attempt("mailId=email, SubmailId=DexaISO (control)", {
    mailId: email,
    SubmailId: sub,
    passCode: pass,
  });
  // 2. both = email (demo pattern: mailId==SubmailId)
  await attempt("mailId=email, SubmailId=email", {
    mailId: email,
    SubmailId: email,
    passCode: pass,
  });
  // 3. both = username
  await attempt("mailId=DexaISO, SubmailId=DexaISO", {
    mailId: sub,
    SubmailId: sub,
    passCode: pass,
  });
  // 4. swapped: username as mailId, email as sub
  await attempt("mailId=DexaISO, SubmailId=email", {
    mailId: sub,
    SubmailId: email,
    passCode: pass,
  });
  // 5. email + sub, WITHOUT the isv-secret-key header
  await attempt(
    "mailId=email, SubmailId=DexaISO, no isv header",
    { mailId: email, SubmailId: sub, passCode: pass },
    false
  );
}

main();
