"use server";

// =============================================================================
// HQ Merchant Impersonation — server actions + cookie-resolution helpers
// =============================================================================
// Companion to migration 20260504110000_hq_merchant_impersonation.sql.
//
// Surface area:
//   * startImpersonation(merchantId, reason?) — sets cookies, opens session,
//                                               logs audit row.
//   * endImpersonation(reason)                — closes session, clears cookies.
//   * getImpersonationContext()               — RSC hydration source of truth.
//                                               Re-validates via touch RPC.
//   * resolveImpersonationFromCookies()       — server-only, React.cache'd.
//                                               Used by LogAuditEvent and
//                                               getEffectiveClerkOrgId.
//
// Trust model:
//   The cookies are httpOnly and set ONLY by startImpersonation after a
//   server-side authorization check. Every request that honors them re-runs
//   touch_impersonation_session (which validates session freshness, admin
//   identity match, and ongoing access) before treating the user as
//   impersonating. RLS holds defense-in-depth via
//   is_merchant_admin_or_impersonating.
// =============================================================================

import { auth, currentUser } from "@clerk/nextjs/server";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LogAuditEvent } from "@/app/dashboard/actions/audit-logs";

// Cookie names. Plain (no __Host- prefix) for parity with x-location-id and
// to keep local dev working without HTTPS. httpOnly + Secure + SameSite=Lax
// is what actually carries the security here.
const COOKIE_MERCHANT_ID = "x-impersonate-merchant-id";
const COOKIE_SESSION_ID = "x-impersonate-session-id";

// 30-minute sliding TTL. Mirrors the value enforced server-side in
// touch_impersonation_session and is_merchant_admin_or_impersonating.
const SESSION_TTL_SECONDS = 30 * 60;

// UUID v4-ish regex. Cheap middleware/cookie validation.
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// In-memory rate limit. Per-worker only; Next.js serverless workers may spawn
// independently, so this is a soft v1 backstop, not a hard guarantee. If
// abuse becomes a real concern, swap for Upstash Redis.
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX_STARTS = 30;
const startTimestamps = new Map<string, number[]>();

function checkRateLimit(hqUserId: string): boolean {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const previous = startTimestamps.get(hqUserId) ?? [];
  const recent = previous.filter((t) => t > cutoff);
  if (recent.length >= RATE_LIMIT_MAX_STARTS) return false;
  recent.push(now);
  startTimestamps.set(hqUserId, recent);
  return true;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ImpersonationContext {
  sessionId: string;
  merchantId: string;
  clerkOrgId: string;
  merchantName: string;
  expiresAt: string; // ISO; client uses for countdown
}

export interface StartImpersonationResult {
  context?: ImpersonationContext;
  error?: string;
}

// ─── Cookie helpers ───────────────────────────────────────────────────────────

async function setImpersonationCookies(merchantId: string, sessionId: string) {
  const cookieStore = await cookies();
  const opts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
  cookieStore.set(COOKIE_MERCHANT_ID, merchantId, opts);
  cookieStore.set(COOKIE_SESSION_ID, sessionId, opts);
}

async function clearImpersonationCookies() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_MERCHANT_ID);
  cookieStore.delete(COOKIE_SESSION_ID);
}

// ─── resolveImpersonationFromCookies ─────────────────────────────────────────
// Cheap read used by LogAuditEvent and getEffectiveClerkOrgId. React.cache
// memoizes per-request so the touch RPC fires at most once per request even
// when called from many places.

interface ResolvedImpersonation {
  sessionId: string;
  merchantId: string;
  clerkOrgId: string;
  hqUserId: string;
}

export const resolveImpersonationFromCookies = cache(
  async (): Promise<ResolvedImpersonation | null> => {
    const cookieStore = await cookies();
    const merchantId = cookieStore.get(COOKIE_MERCHANT_ID)?.value;
    const sessionId = cookieStore.get(COOKIE_SESSION_ID)?.value;

    if (
      !merchantId ||
      !sessionId ||
      !UUID_REGEX.test(merchantId) ||
      !UUID_REGEX.test(sessionId)
    ) {
      return null;
    }

    const { userId } = await auth();
    if (!userId) return null;

    const supabase = createServerSupabaseClient();

    // touch_impersonation_session does the work in one round-trip:
    //   * verifies the session belongs to the calling admin
    //   * checks 30-min sliding TTL (ends session as 'idle_timeout' if past)
    //   * re-checks hq_can_impersonate_merchant (ends as 'revoked_access')
    //   * slides last_validated_at forward
    const { data: stillValid, error: touchError } = await supabase.rpc(
      "touch_impersonation_session",
      { p_session_id: sessionId },
    );

    if (touchError || !stillValid) {
      // Cookie is stale — clear it so the next request doesn't re-touch a
      // dead session. Best-effort; ignore failures.
      try {
        await clearImpersonationCookies();
      } catch {
        // intentionally swallowed
      }
      return null;
    }

    // Cookie's merchant_id is the canonical anchor; resolve clerk_org_id from
    // the merchants table. We do NOT trust the cookie value as a clerk_org_id.
    const { data: merchant } = await supabase
      .from("merchants")
      .select("clerk_org_id")
      .eq("id", merchantId)
      .single();

    if (!merchant?.clerk_org_id) {
      return null;
    }

    return {
      sessionId,
      merchantId,
      clerkOrgId: merchant.clerk_org_id,
      hqUserId: userId,
    };
  },
);

// ─── getImpersonationContext (RSC hydration) ─────────────────────────────────
// Same as resolveImpersonationFromCookies but adds the merchant name and an
// expiresAt timestamp for the client banner countdown.

export async function getImpersonationContext(): Promise<ImpersonationContext | null> {
  const resolved = await resolveImpersonationFromCookies();
  if (!resolved) return null;

  const supabase = createServerSupabaseClient();
  const { data: merchant } = await supabase
    .from("merchants")
    .select("name")
    .eq("id", resolved.merchantId)
    .single();

  if (!merchant?.name) return null;

  return {
    sessionId: resolved.sessionId,
    merchantId: resolved.merchantId,
    clerkOrgId: resolved.clerkOrgId,
    merchantName: merchant.name,
    expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString(),
  };
}

// ─── startImpersonation ──────────────────────────────────────────────────────

export async function startImpersonation(
  merchantId: string,
  reason?: string,
): Promise<StartImpersonationResult> {
  if (!UUID_REGEX.test(merchantId)) {
    return { error: "Invalid merchant id" };
  }

  const { userId, orgId } = await auth();
  if (!userId) return { error: "Not authenticated" };

  // HQ org gate. Mirrors requireAdminAuth's check without the redirect path.
  if (orgId !== process.env.DEXA_POS_INTERNAL_TEAM_ID) {
    return { error: "Not authorized" };
  }

  if (!checkRateLimit(userId)) {
    return { error: "Rate limit exceeded — try again in an hour" };
  }

  const supabase = createServerSupabaseClient();

  // Capture diagnostic context for the session row. Best-effort; the RPC
  // accepts NULL for both.
  let ip: string | null = null;
  let userAgent: string | null = null;
  try {
    const h = await headers();
    const fwd = h.get("x-forwarded-for");
    ip = fwd ? fwd.split(",")[0]?.trim() ?? null : h.get("x-real-ip");
    userAgent = h.get("user-agent");
  } catch {
    // intentionally swallowed
  }

  const { data: sessionId, error: rpcError } = await supabase.rpc(
    "start_impersonation_session",
    {
      p_merchant_id: merchantId,
      p_reason: reason ?? null,
      p_ip_address: ip,
      p_user_agent: userAgent,
    },
  );

  if (rpcError || !sessionId) {
    // Postgres error code 42501 = insufficient_privilege (raised by the RPC
    // when the admin lacks impersonation access). We surface a clean message
    // either way; the audit row in admin_actions will show the failed attempt.
    return { error: rpcError?.message ?? "Failed to start impersonation" };
  }

  // Look up merchant name + clerk org for the cookie + return value.
  const { data: merchant } = await supabase
    .from("merchants")
    .select("clerk_org_id, name")
    .eq("id", merchantId)
    .single();

  if (!merchant?.clerk_org_id) {
    // Pathological — RPC succeeded but merchant row missing. Roll back the
    // session so we don't leave an orphan, then bail.
    await supabase.rpc("end_impersonation_session", {
      p_session_id: sessionId,
      p_reason: "session_expired",
    });
    return { error: "Merchant not found" };
  }

  await setImpersonationCookies(merchantId, sessionId as string);

  // Audit row attributing the start. We pass impersonation_session_id so the
  // row links back to the session and is_impersonation flips to true.
  await LogAuditEvent({
    merchantId,
    action: "hq_started_impersonation",
    actionCategory: "security",
    severity: "critical",
    resourceType: "impersonation_session",
    resourceId: sessionId as string,
    resourceName: merchant.name,
    metadata: {
      reason: reason ?? null,
      ip_address: ip,
      user_agent: userAgent,
    },
  });

  // TODO(impersonation-pr3): notify merchant owner via email. Wiring to the
  // transactional email path will land alongside the UI PR.

  return {
    context: {
      sessionId: sessionId as string,
      merchantId,
      clerkOrgId: merchant.clerk_org_id,
      merchantName: merchant.name,
      expiresAt: new Date(
        Date.now() + SESSION_TTL_SECONDS * 1000,
      ).toISOString(),
    },
  };
}

// ─── endImpersonation ────────────────────────────────────────────────────────

export async function endImpersonation(
  reason: "user_exit" | "idle_timeout" = "user_exit",
): Promise<{ success: boolean }> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(COOKIE_SESSION_ID)?.value;
  const merchantId = cookieStore.get(COOKIE_MERCHANT_ID)?.value;

  // Always clear cookies first so the client is in a known state even if the
  // RPC call fails.
  await clearImpersonationCookies();

  if (!sessionId || !UUID_REGEX.test(sessionId)) {
    return { success: true };
  }

  const supabase = createServerSupabaseClient();

  await supabase.rpc("end_impersonation_session", {
    p_session_id: sessionId,
    p_reason: reason,
  });

  // Best-effort audit. The merchantId from the cookie is what was active at
  // exit; if it's missing we still log against null merchant to record the
  // event under the actor.
  try {
    const user = await currentUser();
    await LogAuditEvent({
      merchantId: merchantId && UUID_REGEX.test(merchantId) ? merchantId : undefined,
      action: "hq_ended_impersonation",
      actionCategory: "security",
      severity: "info",
      resourceType: "impersonation_session",
      resourceId: sessionId,
      resourceName: user?.fullName ?? user?.firstName ?? undefined,
      metadata: { reason },
    });
  } catch {
    // intentionally swallowed; logging never blocks
  }

  return { success: true };
}
