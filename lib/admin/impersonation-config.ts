// =============================================================================
// Impersonation session configuration — single source of truth.
// =============================================================================
// The auto-exit window is enforced server-side (touch_impersonation_session /
// is_merchant_admin_or_impersonating in the migrations) AND reflected in the
// banner countdown. Keep both anchored to this one value so the displayed
// deadline can never drift from the cookie maxAge / RPC threshold.
//
// Importable from both server actions and client components (no "use server"
// / "use client" — plain constants only).
// =============================================================================

/** Auto-exit window for an impersonation session, in hours. */
export const IMPERSONATION_TTL_HOURS = 24;

/** Same window expressed in seconds (cookie maxAge, expiresAt math). */
export const IMPERSONATION_TTL_SECONDS = IMPERSONATION_TTL_HOURS * 60 * 60;

/** Same window in milliseconds (client-side Date arithmetic). */
export const IMPERSONATION_TTL_MS = IMPERSONATION_TTL_SECONDS * 1000;
