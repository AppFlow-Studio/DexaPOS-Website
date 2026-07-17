import { createClient } from "@supabase/supabase-js";

// ─────────────────────────────────────────────────────────────────────────────
// Shared security primitives for public form endpoints.
//
// Every unauthenticated form route should run, in order:
//   1. originAllowed(req)   → 403 on cross-origin
//   2. isBot(body)          → silently accept (no write) so bots get no signal
//   3. rateLimit(...)       → 429 when a single IP floods
//   4. validate + sanitizeText each field, then insert via the service-role client
//
// See CLAUDE.md → "Secure form endpoints".
// ─────────────────────────────────────────────────────────────────────────────

/** First client IP from the x-forwarded-for chain (Vercel sets this). */
export function getClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * Same-origin guard. Compares the request Origin (falling back to Referer) host
 * against NEXT_PUBLIC_SITE_URL. In development, or if the site URL is unset, we
 * allow the request through so local testing isn't blocked.
 */
export function originAllowed(req: Request): boolean {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl || process.env.NODE_ENV !== "production") return true;

  let expectedHost: string;
  try {
    expectedHost = new URL(siteUrl).host;
  } catch {
    return true; // misconfigured env — don't hard-fail legitimate users
  }

  const source = req.headers.get("origin") || req.headers.get("referer");
  if (!source) return false; // production browsers always send one for a POST fetch

  try {
    return new URL(source).host === expectedHost;
  } catch {
    return false;
  }
}

/** The honeypot field name shared between the form and every endpoint. */
export const HONEYPOT_FIELD = "company_website";

/**
 * Best-effort bot detection with zero dependencies:
 *  - honeypot: a hidden field real users never fill; any value ⇒ bot.
 *  - timing: humans take a moment to fill a form; a submit faster than
 *    minElapsedMs is suspicious. The timestamp is client-supplied and therefore
 *    spoofable, so this is only a soft secondary signal — the honeypot is the
 *    real filter. Upgrade to Turnstile if targeted abuse appears.
 */
export function isBot(
  body: Record<string, unknown>,
  { minElapsedMs = 2000 }: { minElapsedMs?: number } = {},
): boolean {
  const honeypot = body[HONEYPOT_FIELD];
  if (typeof honeypot === "string" && honeypot.trim() !== "") return true;

  const elapsed = body.elapsed_ms;
  if (typeof elapsed === "number" && Number.isFinite(elapsed) && elapsed >= 0 && elapsed < minElapsedMs) {
    return true;
  }
  return false;
}

let serviceClient: ReturnType<typeof createClient> | null = null;
function getServiceClient() {
  if (!serviceClient) {
    serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
  }
  return serviceClient;
}

/**
 * Supabase-backed sliding-window rate limit, keyed by (ip, action). Delegates to
 * the check_rate_limit SQL function (migration 004) which atomically prunes,
 * counts, and records the hit. `action` namespaces the limit so future forms can
 * reuse this with their own key. Returns true when the request is allowed.
 *
 * Fails open on infrastructure errors: a limiter outage must not take the form
 * offline (the honeypot + validation still protect the endpoint).
 */
export async function rateLimit({
  ip,
  action,
  max,
  windowSeconds,
}: {
  ip: string;
  action: string;
  max: number;
  windowSeconds: number;
}): Promise<boolean> {
  try {
    // The service client is untyped (no generated Database type), so `.rpc` infers
    // its args as `undefined`. Narrow to the exact shape of check_rate_limit.
    const client = getServiceClient() as unknown as {
      rpc(
        fn: string,
        args: Record<string, unknown>,
      ): Promise<{ data: boolean | null; error: { message: string } | null }>;
    };
    const { data, error } = await client.rpc("check_rate_limit", {
      p_ip: ip,
      p_action: action,
      p_max: max,
      p_window_seconds: windowSeconds,
    });
    if (error) {
      console.error("rateLimit: check_rate_limit failed", error);
      return true;
    }
    return data !== false;
  } catch (err) {
    console.error("rateLimit: unexpected error", err);
    return true;
  }
}

// ── Validation helpers ───────────────────────────────────────────────────────
// Each collects into a FieldErrors bag rather than throwing, so a route can run
// every check and return a single generic 400.

export type FieldErrors = Record<string, string>;

export function isValid(errors: FieldErrors): boolean {
  return Object.keys(errors).length === 0;
}

/**
 * Validate a plain-text field: coerces to string, enforces required + max length.
 * Returns the raw trimmed value (sanitize separately with sanitizeText before
 * storing). Records an error under `field` when invalid.
 */
export function text(
  value: unknown,
  field: string,
  errors: FieldErrors,
  { max, required = false }: { max: number; required?: boolean },
): string {
  if (typeof value !== "string") {
    if (required) errors[field] = `${field} is required`;
    return "";
  }
  const trimmed = value.trim();
  if (required && trimmed === "") {
    errors[field] = `${field} is required`;
    return "";
  }
  if (trimmed.length > max) {
    errors[field] = `${field} is too long`;
    return trimmed.slice(0, max);
  }
  return trimmed;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validate an email address (format + length ≤ 254). */
export function email(value: unknown, field: string, errors: FieldErrors): string {
  const v = text(value, field, errors, { max: 254, required: true });
  if (errors[field]) return v;
  if (!EMAIL_RE.test(v)) {
    errors[field] = `${field} is invalid`;
    return v;
  }
  return v;
}
