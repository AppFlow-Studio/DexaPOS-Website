/**
 * [C2] Shared HTTP layer for the Valor APIs.
 *
 * Valor uses two authentication styles depending on which host you are talking
 * to — credentials in the request body for the securelink endpoints, and
 * `Valor-App-ID` / `Valor-App-Key` headers for the vault endpoints. Both live
 * here so the individual API modules never have to think about it, and so a
 * credential cannot accidentally be sent the wrong way.
 */

import type { ValorEndpoints, ValorMerchantCredentials } from "./config";
import { resolveValorEndpoints } from "./config";

/** Response envelope Valor returns on the securelink hosts. */
export interface ValorEnvelope {
  error_no?: string;
  error_code?: string;
  code?: number;
  status?: string;
  [key: string]: unknown;
}

export interface ValorResponse<TBody extends ValorEnvelope = ValorEnvelope> {
  status: number;
  body: TBody;
  text: string;
}

export interface ValorRequestOptions {
  credentials: ValorMerchantCredentials;
  endpoints?: ValorEndpoints;
  timeoutMs?: number;
  /** Injectable for tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

export const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Valor signals success inconsistently across hosts: the securelink endpoints
 * return `error_no: "S00"` with `error_code: "00"`, while the vault endpoints
 * return `code: 201` with `status: "OK"`. Both forms are accepted here.
 */
export function isValorSuccess(body: ValorEnvelope): boolean {
  if (body.error_no === "S00" && body.error_code === "00") return true;
  if (typeof body.code === "number" && body.code >= 200 && body.code < 300) {
    return true;
  }
  return false;
}

async function readResponse<TBody extends ValorEnvelope>(
  response: Response
): Promise<ValorResponse<TBody>> {
  const text = await response.text();
  let body = {} as TBody;
  try {
    if (text) body = JSON.parse(text) as TBody;
  } catch {
    body = {} as TBody;
  }
  return { status: response.status, body, text };
}

/**
 * POST to a securelink endpoint, with credentials merged into the body.
 *
 * `appid` / `appkey` / `epi` are injected here rather than by callers so that
 * a module cannot forget them or send a mismatched set.
 */
export async function postWithBodyCredentials<
  TBody extends ValorEnvelope = ValorEnvelope,
>(
  path: string,
  payload: object,
  options: ValorRequestOptions,
  host: "transaction" | "clientToken" = "transaction"
): Promise<ValorResponse<TBody>> {
  const endpoints = options.endpoints ?? resolveValorEndpoints();
  const doFetch = options.fetchImpl ?? fetch;
  const base =
    host === "clientToken"
      ? endpoints.clientTokenBaseUrl
      : endpoints.transactionBaseUrl;

  const response = await doFetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      appid: options.credentials.appId,
      appkey: options.credentials.appKey,
      epi: options.credentials.epi,
      ...payload,
    }),
    signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    cache: "no-store",
  });

  return readResponse<TBody>(response);
}

/**
 * POST to a vault endpoint, with credentials in headers.
 *
 * Note the vault host does not take `epi` at all — it is merchant-scoped by the
 * app id/key pair alone.
 */
export async function postWithHeaderCredentials<
  TBody extends ValorEnvelope = ValorEnvelope,
>(
  path: string,
  payload: object,
  options: ValorRequestOptions
): Promise<ValorResponse<TBody>> {
  const endpoints = options.endpoints ?? resolveValorEndpoints();
  const doFetch = options.fetchImpl ?? fetch;

  const response = await doFetch(`${endpoints.vaultBaseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Valor-App-ID": options.credentials.appId,
      "Valor-App-Key": options.credentials.appKey,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    cache: "no-store",
  });

  return readResponse<TBody>(response);
}

/**
 * Extract a human-readable error from a failed Valor response.
 *
 * The vault endpoints return an `error` array of strings; the securelink hosts
 * return a flat message field. Neither is documented reliably, so every shape
 * is probed before falling back.
 */
export function extractValorError(body: ValorEnvelope): string | null {
  if (Array.isArray(body.error) && body.error.length > 0) {
    const first = body.error[0];
    if (typeof first === "string") return first;
  }
  for (const key of ["error_message", "response_text", "message", "status"]) {
    const value = body[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}
