// ============================================================================
// OrderOut UI helpers
// ============================================================================

/**
 * Canonical UPPERCASE delivery platform identifiers. Used as the allowlist for
 * merchant self-confirmation and as the iteration order for grid/checkbox UIs.
 * These match the `delivery_service` values that OrderOut sends back via the
 * push-menu webhook, so self-confirmed and webhook-verified channel lists
 * merge cleanly without casing drift.
 */
export const KNOWN_DELIVERY_CHANNELS = [
  'UBEREATS',
  'DOORDASH',
  'GRUBHUB',
] as const

export type KnownDeliveryChannel = (typeof KNOWN_DELIVERY_CHANNELS)[number]

/**
 * Normalize an arbitrary list of channel identifiers into the canonical set
 * used everywhere (trim → uppercase → dedupe → allowlist-filter).
 */
export function normalizeDeliveryChannels(input: readonly string[]): string[] {
  const seen = new Set<string>()
  for (const raw of input) {
    if (typeof raw !== 'string') continue
    const norm = raw.trim().toUpperCase()
    if (!norm) continue
    if (!(KNOWN_DELIVERY_CHANNELS as readonly string[]).includes(norm)) continue
    seen.add(norm)
  }
  return Array.from(seen)
}

/**
 * Format an ISO timestamp as a short relative phrase ("Just now", "5m ago",
 * "3h ago", "2d ago"). Falls back to a locale date string after a week.
 * Shared between the merchant OrderOut tab and the HQ admin section.
 */
export function formatRelativeTime(dateStr: string): string {
  const now = new Date()
  const date = new Date(dateStr)
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

/**
 * connected_channels shape transitioned from an array of platform names
 *   ["UBEREATS","DOORDASH"]
 * to an object keyed by platform with per-platform status:
 *   { "UBEREATS": { status, last_updated, last_error }, ... }
 *
 * Return the list of platforms currently reporting "success". Tolerates both
 * legacy array rows and the new object shape.
 */
export function extractConnectedPlatforms(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return (raw as unknown[]).filter(
      (x): x is string => typeof x === 'string'
    )
  }
  if (raw && typeof raw === 'object') {
    return Object.entries(raw as Record<string, unknown>)
      .filter(([, v]) => {
        if (!v || typeof v !== 'object') return false
        return (v as { status?: unknown }).status === 'success'
      })
      .map(([k]) => k)
  }
  return []
}

export interface PlatformChannelStatus {
  platform: string
  status: 'success' | 'failed' | 'pending' | 'unknown'
  last_updated: string | null
  last_error: string | null
}

/**
 * Return the full per-platform status list from connected_channels (object
 * shape). Returns empty array for legacy array-shape rows.
 */
export function extractChannelStatuses(raw: unknown): PlatformChannelStatus[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return []
  return Object.entries(raw as Record<string, unknown>)
    .filter(([, v]) => v && typeof v === 'object')
    .map(([platform, v]) => {
      const obj = v as Record<string, unknown>
      const status = typeof obj.status === 'string' ? obj.status : 'unknown'
      return {
        platform,
        status: (['success', 'failed', 'pending'].includes(status)
          ? status
          : 'unknown') as PlatformChannelStatus['status'],
        last_updated:
          typeof obj.last_updated === 'string' ? obj.last_updated : null,
        last_error: typeof obj.last_error === 'string' ? obj.last_error : null,
      }
    })
}
