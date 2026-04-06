// ============================================================================
// OrderOut UI helpers
// ============================================================================

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
