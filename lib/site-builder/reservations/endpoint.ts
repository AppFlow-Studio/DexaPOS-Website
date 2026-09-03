/**
 * The shared spine of the four public reservation endpoints.
 *
 * Every one of them runs the same order of operations, and it is the order
 * `lib/cms/form-security.ts` prescribes for every public endpoint in this
 * codebase:
 *
 *   1. size cap        — before parsing, so a huge body is never materialised
 *   2. JSON parse      — malformed is indistinguishable from invalid
 *   3. rate limit      — per IP, per action
 *   4. validate        — the schema is the allowlist
 *   5. service-role call to a SECURITY DEFINER function that writes atomically
 *
 * Factored out because four endpoints implementing "the same" security posture
 * separately is four chances to get it subtly different, and the difference
 * would not be visible in review.
 */

import { NextResponse } from "next/server";

import { getClientIp, rateLimit } from "@/lib/cms/form-security";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

import {
  HONEYPOT_FIELD,
  MIN_FILL_MS,
  RENDERED_AT_FIELD,
  type ReservationErrorCode,
} from "./protocol";

/**
 * A booking payload is a handful of short strings. Anything larger is not a
 * guest, and refusing it before `await request.json()` is what stops a large
 * body being materialised at all.
 */
export const MAX_BODY_BYTES = 16 * 1024;

export function fail(
  code: ReservationErrorCode,
  fields?: Record<string, string>,
): NextResponse {
  // Always 200. A 4xx here would let a caller distinguish outcomes by status
  // alone, without reading the body — and the whole point of the coarse codes
  // is that most outcomes are indistinguishable. Rate limiting is the one
  // exception, because a client genuinely should back off.
  const status = code === "rate_limited" ? 429 : 200;
  return NextResponse.json({ ok: false, code, ...(fields ? { fields } : {}) }, { status });
}

export function ok<T extends object>(body: T): NextResponse {
  return NextResponse.json({ ok: true, ...body });
}

/**
 * Reads and size-caps the JSON body.
 *
 * Returns `null` for anything unparseable, which every caller turns into the
 * same generic failure as a semantically invalid payload — a malformed body is
 * not a distinct thing a guest can act on.
 */
export async function readJsonBody(
  request: Request,
): Promise<Record<string, unknown> | null> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null;

  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return null;
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Per-IP sliding window, namespaced per action.
 *
 * Fails OPEN on limiter failure, matching `rateLimit`'s own contract: a limiter
 * outage must not take a restaurant's booking page offline. The honeypot and
 * the database's own checks still stand.
 */
export async function withinRateLimit(
  request: Request,
  action: string,
  max: number,
  windowSeconds: number,
): Promise<boolean> {
  return rateLimit({ ip: getClientIp(request), action, max, windowSeconds });
}

/** The distinct automated-submission signals a payload can trip. */
export type BotSignal = "honeypot" | "timing";

/**
 * Which signal a payload trips, or null for none. Honeypot first, timing second.
 *
 * Split out from `looksAutomated` so the endpoint can LOG which signal fired. A
 * booking silently rejected as a bot is exactly the failure that stays invisible
 * until a guest screenshots "we could not complete your booking" — and the
 * reason (a password manager filling the honeypot vs. a too-fast submit) points
 * straight at the fix. The honeypot is the real filter; the elapsed-time check
 * is a soft signal against the crudest tooling and is trivially spoofable.
 */
export function botSignal(body: Record<string, unknown>): BotSignal | null {
  const honeypot = body[HONEYPOT_FIELD];
  if (typeof honeypot === "string" && honeypot.trim() !== "") return "honeypot";

  const renderedAt = Number(body[RENDERED_AT_FIELD]);
  if (!Number.isFinite(renderedAt) || renderedAt <= 0) return null;

  const elapsed = Date.now() - renderedAt;
  // Negative means clock skew or a forged stamp, not a fast human.
  return elapsed >= 0 && elapsed < MIN_FILL_MS ? "timing" : null;
}

/**
 * Callers should treat a `true` here as a SILENT SUCCESS on write endpoints —
 * show the confirmation, store nothing — so an automated submitter learns
 * nothing to iterate against.
 */
export function looksAutomated(body: Record<string, unknown>): boolean {
  return botSignal(body) !== null;
}

export function serviceClient() {
  return createServiceRoleClient();
}

/** Trimmed string, or "" for anything that is not a string. */
export function str(value: unknown, max = 200): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function strArray(value: unknown, maxItems = 20, maxLen = 60): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((v) => (typeof v === "string" && v.trim() ? [v.trim().slice(0, maxLen)] : []))
    .slice(0, maxItems);
}

export function bool(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/**
 * A whole number, or null.
 *
 * The type check before `Number()` is not redundant: `Number(null)`,
 * `Number("")`, `Number([])` and `Number(false)` are all `0`, and `0` is an
 * integer — so the obvious one-liner turns four different kinds of missing
 * value into a party of zero. Downstream range checks happen to catch that
 * today, which is exactly why it would survive unnoticed.
 */
export function int(value: unknown): number | null {
  if (typeof value === "number") return Number.isInteger(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isInteger(n) ? n : null;
  }
  return null;
}

/**
 * The one validation with real consequences: a wrong phone number means the
 * confirmation SMS never arrives and the restaurant cannot call about a late
 * table. Deliberately permissive about format — international numbers are
 * written a dozen ways and `notification-shared.ts` normalises to E.164 later —
 * but it must plausibly be a phone number.
 */
export function looksLikePhone(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) && value.length <= 254;
}
