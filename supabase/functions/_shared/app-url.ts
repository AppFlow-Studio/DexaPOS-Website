// ============================================================================
// _shared/app-url.ts
// ============================================================================
// Single source of truth for the public origin of the Next.js web app, as seen
// from a Supabase edge function. Edge functions that call back into the app
// (e.g. POST /api/internal/order-placed-notify) or that print tappable links
// in SMS/email must resolve this correctly.
//
// Resolution order:
//   1. APP_URL             — canonical, dedicated edge secret (preferred; the
//                            local dev .env has no APP_URL, so a stray
//                            `supabase secrets set --env-file .env` cannot
//                            clobber it with a localhost value)
//   2. NEXT_PUBLIC_APP_URL — shared with the Vercel build; often localhost in dev
//   3. VERCEL_URL          — deployment host, needs an https:// prefix
//
// A localhost/private host is treated as "no usable origin" and returns null,
// so callers skip (and log) instead of firing a doomed connect-refused request
// to localhost inside the edge container.
// ============================================================================

/** True when the URL points at a loopback/unroutable host (dead link from SMS). */
function isLocalOrPrivate(url: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[?::1\]?)(:|\/|$)/i.test(url)
}

/**
 * Resolve the public https origin of the web app, or null when unset/unusable.
 * Trailing slashes are stripped so callers can safely append `/api/...`.
 */
export function getAppBaseUrl(): string | null {
  const explicit = (Deno.env.get('APP_URL') ?? Deno.env.get('NEXT_PUBLIC_APP_URL'))?.trim()
  if (explicit) {
    const normalized = explicit.replace(/\/+$/, '')
    return isLocalOrPrivate(normalized) ? null : normalized
  }

  const vercelUrl = Deno.env.get('VERCEL_URL')?.trim()
  if (vercelUrl) {
    const normalized = `https://${vercelUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '')}`
    return isLocalOrPrivate(normalized) ? null : normalized
  }

  return null
}
