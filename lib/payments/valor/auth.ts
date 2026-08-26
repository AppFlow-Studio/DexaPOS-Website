/**
 * [C2] Valor ISO authentication — bearer token acquisition and caching.
 *
 * The boarding APIs authenticate with a bearer JWT obtained from the ISO office
 * login, optionally accompanied by an `isv-secret-key` header.
 *
 * ── Naming note ───────────────────────────────────────────────────────────────
 * The C2 ticket specifies `VALOR_ISO_API_KEY` + `VALOR_ISO_SECRET`. Valor's
 * actual endpoint takes a portal login instead — `mailId` + `SubmailId` +
 * `passCode` ([V-BEAR]). The env vars here match the API, not the ticket.
 *
 * ── Unverified assumptions ────────────────────────────────────────────────────
 * Marked UNVERIFIED below and cheap to correct once a live call is possible:
 *  1. Login host. [V-BEAR] documents the path but not the host; the boarding
 *     host is assumed because it serves the sibling `/api/valor/*` endpoints.
 *  2. Token TTL. Undocumented. The arch parent assumes ~1h; a conservative
 *     default is used and the response is probed for an explicit expiry.
 *  3. Response field name for the token itself.
 */

import {
  resolveValorEndpoints,
  ValorConfigError,
  type EnvLike,
  type ValorEndpoints,
} from "./config";
import { extractValorError, type ValorEnvelope } from "./client";

/** ISO office login credentials ([V-BEAR]). */
export interface ValorIsoCredentials {
  /** E-mail id of the ISO office. Max 50 chars. */
  mailId: string;
  /** Sub-office username. Max 50 chars. */
  subMailId: string;
  /** Password for the office login merchants are boarded under. */
  passCode: string;
  /** Optional `isv-secret-key` header accepted by the boarding endpoints. */
  isvSecretKey?: string;
}

export function readIsoCredentials(
  env: EnvLike = process.env
): ValorIsoCredentials {
  const mailId = env.VALOR_ISO_MAIL_ID?.trim();
  const subMailId = env.VALOR_ISO_SUBMAIL_ID?.trim();
  const passCode = env.VALOR_ISO_PASSCODE?.trim();
  const isvSecretKey = env.VALOR_ISV_SECRET_KEY?.trim();

  const missing: string[] = [];
  if (!mailId) missing.push("VALOR_ISO_MAIL_ID");
  if (!subMailId) missing.push("VALOR_ISO_SUBMAIL_ID");
  if (!passCode) missing.push("VALOR_ISO_PASSCODE");

  if (missing.length > 0) {
    throw new ValorConfigError(
      `Missing Valor ISO credentials: ${missing.join(", ")}. ` +
        "VALOR_ISO_MAIL_ID is the e-mail address of the ISO office — the one " +
        "entered alongside the sub-office username when logging into the Valor " +
        "portal. Boarding cannot authenticate without it."
    );
  }

  return {
    mailId: mailId as string,
    subMailId: subMailId as string,
    passCode: passCode as string,
    ...(isvSecretKey ? { isvSecretKey } : {}),
  };
}

/**
 * Conservative default lifetime.
 *
 * UNVERIFIED — Valor does not document the token's TTL. The arch parent assumes
 * roughly an hour; 50 minutes leaves headroom so a long boarding run cannot
 * expire mid-sequence. Shorten rather than lengthen if observation disagrees.
 */
export const DEFAULT_TOKEN_TTL_MS = 50 * 60 * 1000;

export interface CachedBearerToken {
  token: string;
  /** Epoch millis after which the token must not be reused. */
  expiresAt: number;
}

interface BearerTokenResponse extends ValorEnvelope {
  token?: string;
  access_token?: string;
  bearerToken?: string;
  jwt?: string;
  expires_in?: number;
  validity?: string;
}

/**
 * Pull the token out of an undocumented response.
 *
 * UNVERIFIED field name — every plausible key is probed, and a null return
 * makes the caller fail loudly rather than send `Bearer undefined`.
 */
export function readBearerToken(body: ValorEnvelope): string | null {
  for (const key of ["token", "access_token", "bearerToken", "jwt"]) {
    const value = body[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/**
 * Derive an expiry from the response when Valor supplies one, else fall back
 * to the conservative default.
 */
export function readTokenExpiry(
  body: BearerTokenResponse,
  now: number,
  ttlMs: number = DEFAULT_TOKEN_TTL_MS
): number {
  if (typeof body.expires_in === "number" && body.expires_in > 0) {
    // Treat as seconds, shaved by 10% so a boundary request cannot race expiry.
    return now + body.expires_in * 1000 * 0.9;
  }
  if (typeof body.validity === "string") {
    const parsed = Date.parse(body.validity.replace(" ", "T") + "Z");
    if (!Number.isNaN(parsed) && parsed > now) return parsed;
  }
  return now + ttlMs;
}

export function isTokenValid(
  cached: CachedBearerToken | null,
  now: number
): cached is CachedBearerToken {
  return cached !== null && cached.expiresAt > now;
}

export interface IsoAuthOptions {
  credentials: ValorIsoCredentials;
  endpoints?: ValorEndpoints;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  /** Injectable clock for tests. */
  now?: () => number;
  ttlMs?: number;
}

export class ValorAuthError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ValorAuthError";
    this.status = status;
  }
}

/**
 * Process-wide token cache.
 *
 * Keyed by office + sub-office so a process boarding under more than one office
 * cannot cross-contaminate tokens — which would board a merchant under the
 * wrong ISO office, the failure mode `passCode`'s own documentation warns about.
 */
const tokenCache = new Map<string, CachedBearerToken>();

export function cacheKeyFor(credentials: ValorIsoCredentials): string {
  return `${credentials.mailId}::${credentials.subMailId}`;
}

/** Clear cached tokens. Exposed for tests and for credential rotation. */
export function clearTokenCache(): void {
  tokenCache.clear();
}

/** Request a fresh bearer token, bypassing the cache. */
export async function requestBearerToken(
  options: IsoAuthOptions
): Promise<CachedBearerToken> {
  const endpoints = options.endpoints ?? resolveValorEndpoints();
  const doFetch = options.fetchImpl ?? fetch;
  const now = (options.now ?? Date.now)();

  // UNVERIFIED host: [V-BEAR] documents the path but not the host. The boarding
  // host serves the sibling /api/valor/* endpoints, so it is assumed here.
  const response = await doFetch(
    `${endpoints.boardingBaseUrl}/api/valor/login?isotoken`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(options.credentials.isvSecretKey
          ? { "isv-secret-key": options.credentials.isvSecretKey }
          : {}),
      },
      body: JSON.stringify({
        mailId: options.credentials.mailId,
        SubmailId: options.credentials.subMailId,
        passCode: options.credentials.passCode,
      }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
      cache: "no-store",
    }
  );

  const text = await response.text();
  let body: BearerTokenResponse = {};
  try {
    if (text) body = JSON.parse(text) as BearerTokenResponse;
  } catch {
    body = {};
  }

  const token = readBearerToken(body);
  if (!response.ok || !token) {
    throw new ValorAuthError(
      extractValorError(body) ??
        `Valor ISO login failed (HTTP ${response.status}). If the status is 2xx ` +
          "the token field name may differ from those probed in readBearerToken.",
      response.status
    );
  }

  return { token, expiresAt: readTokenExpiry(body, now, options.ttlMs) };
}

/**
 * Get a bearer token, reusing the cached one while it remains valid.
 *
 * Boarding makes four authenticated calls in sequence; without caching each
 * would re-authenticate, which is both slow and a good way to trip rate limits
 * partway through creating a merchant.
 */
export async function getBearerToken(
  options: IsoAuthOptions
): Promise<string> {
  const now = (options.now ?? Date.now)();
  const key = cacheKeyFor(options.credentials);
  const cached = tokenCache.get(key) ?? null;

  if (isTokenValid(cached, now)) return cached.token;

  const fresh = await requestBearerToken(options);
  tokenCache.set(key, fresh);
  return fresh.token;
}

/** Headers every boarding call needs. */
export function boardingAuthHeaders(
  token: string,
  credentials: ValorIsoCredentials
): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    ...(credentials.isvSecretKey
      ? { "isv-secret-key": credentials.isvSecretKey }
      : {}),
  };
}
