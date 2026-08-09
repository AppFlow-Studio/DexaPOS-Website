/**
 * [C2] Every guess about Valor's undocumented boarding responses, in one file.
 *
 * ── Why this file exists ──────────────────────────────────────────────────────
 * Valor's OpenAPI specs for Merchant Add, Store Add, EPI Add and Generate API
 * Keys all document the response as an empty object `{}`. No field names are
 * published. But boarding is a chain — Merchant Add's identifier is Store Add's
 * input, EPI Add's identifier is Generate API Keys' input — so the field names
 * are load-bearing.
 *
 * Rather than scatter guesses across `boarding.ts`, every one lives here behind
 * a probe function that returns null on no match. `boarding.ts` then fails
 * loudly with a message naming the exact function to fix. The first live
 * sandbox run should turn this file from guesses into facts; nothing else needs
 * to change when it does.
 *
 * STATUS: UNVERIFIED. No call has been made against Valor.
 */

import type { ValorEnvelope } from "./client";

/** Read the first string/number match from a list of candidate keys. */
function probe(body: ValorEnvelope, keys: string[]): string | null {
  for (const key of keys) {
    const value = body[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }

  // Valor nests payloads under `data` on some endpoints; check one level down.
  const nested = body.data;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return probe(nested as ValorEnvelope, keys);
  }

  return null;
}

/**
 * Merchant identifier from Merchant Add.
 *
 * `mp_id` is the highest-confidence guess: EPI Add documents a *required*
 * `mp_id` input, which has to come from somewhere, and Merchant Add is the only
 * preceding call.
 */
export function readMerchantId(body: ValorEnvelope): string | null {
  return probe(body, [
    "mp_id",
    "merchant_id",
    "merchantId",
    "mid",
    "id",
  ]);
}

/**
 * User identifier from Merchant Add.
 *
 * EPI Add also requires `newUserId`, which likewise has no other source.
 */
export function readNewUserId(body: ValorEnvelope): string | null {
  return probe(body, ["newUserId", "new_user_id", "userId", "user_id"]);
}

/** Store identifier from Store Add. */
export function readStoreId(body: ValorEnvelope): string | null {
  return probe(body, [
    "store_id",
    "storeId",
    "storeNo",
    "store_no",
    "id",
  ]);
}

/**
 * EPI from EPI Add.
 *
 * Validated by shape at the call site — a 10-digit value starting with 2 —
 * which gives a genuine correctness signal even though the key name is a guess.
 */
export function readEpi(body: ValorEnvelope): string | null {
  return probe(body, ["epi", "EPI", "epiNumber", "epi_number", "id"]);
}

/** App id from Generate API Keys. */
export function readAppId(body: ValorEnvelope): string | null {
  return probe(body, ["appid", "appId", "app_id", "APP_ID"]);
}

/** App key from Generate API Keys. */
export function readAppKey(body: ValorEnvelope): string | null {
  return probe(body, ["appkey", "appKey", "app_key", "APP_KEY"]);
}

/**
 * Error raised when a response parses but the expected identifier is absent.
 *
 * Carries the raw body so the real field name is one log line away.
 */
export class ValorIdentifierError extends Error {
  readonly step: string;
  readonly body: ValorEnvelope;

  constructor(step: string, probeFn: string, body: ValorEnvelope) {
    super(
      `Valor ${step} succeeded but no identifier was found in the response. ` +
        `The response schema is undocumented — inspect the body below and add ` +
        `the correct key to ${probeFn}() in lib/payments/valor/identifiers.ts. ` +
        `Received keys: [${Object.keys(body).join(", ") || "none"}]`
    );
    this.name = "ValorIdentifierError";
    this.step = step;
    this.body = body;
  }
}
