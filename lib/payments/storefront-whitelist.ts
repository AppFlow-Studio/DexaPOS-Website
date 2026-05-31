// ============================================================================
// Storefront payment-origin whitelist (QR-32)
// ----------------------------------------------------------------------------
// Pure, environment-agnostic helpers for computing the browser origins a
// merchant storefront can be reached from, and syncing them into
// `location_payment_devices.whitelist_origins`. This is the *local mirror* of
// the allow-list ops registers in the NMI / Dejavoo merchant portal — it does
// NOT call NMI's API. See docs/RUNBOOK-PAYMENT-WHITELIST-SYNC.md.
//
// Both the HQ admin server action and the standalone backfill/audit scripts
// import from this module so they share one source of truth.
// ============================================================================
import type { SupabaseClient } from '@supabase/supabase-js'

// We don't depend on the generated Database type here so this module can be
// imported by both server actions (authenticated Clerk client) and the
// service-role scripts under scripts/.
export type AnySupabase = SupabaseClient<any, any, any>

export interface StorefrontOriginsInput {
  slug: string | null | undefined
  customDomain: string | null | undefined
}

export interface WhitelistSyncResult {
  synced: boolean
  origins: string[]
  syncedAt: string | null
  skipped?: boolean
  skipReason?: string
  error?: string
}

export interface WhitelistAuditEntry {
  locationId: string
  merchantId: string | null
  storeSlug: string | null
  customDomain: string | null
  deviceId: string | null
  expected: string[]
  current: string[]
  missing: string[]
  whitelistSyncedAt: string | null
  /**
   * - `up_to_date` — every expected origin is already in `whitelist_origins`.
   * - `needs_sync` — at least one expected origin is missing.
   * - `no_device` — no active online-ordering payment device exists for this
   *   location yet; NMI device must be created before any sync can run.
   */
  status: 'up_to_date' | 'needs_sync' | 'no_device'
}

function normalizeHost(value: string): string | null {
  const trimmed = value.trim().toLowerCase()
  if (!trimmed) return null
  const withoutScheme = trimmed.replace(/^https?:\/\//, '')
  const host = withoutScheme.split('/')[0].split('?')[0]
  return host || null
}

/**
 * Build the canonical set of origins a storefront can be reached from.
 *
 * Sources (any source may be empty — duplicates are de-duped):
 *   1. `https://{slug}.{NEXT_PUBLIC_STOREFRONT_BASE_DOMAIN}` (default subdomain)
 *   2. `https://{custom_domain}` (when the merchant configured one)
 *   3. `NEXT_PUBLIC_APP_URL` origin — covers path-based access
 *      `/sites/{slug}` AND `/s/{slug}/t/{token}` (the QR route, QR-26)
 *   4. Any comma-separated origins in `NMI_DEFAULT_ALLOWED_ORIGINS` —
 *      e.g. payment-widget origins required by NMI Collect.js itself
 *
 * The QR scan route `/s/{slug}/t/{token}` is path-based on the same storefront
 * origin, so it inherits coverage automatically — no QR-specific entry needed.
 */
export function computeStorefrontOrigins({
  slug,
  customDomain,
}: StorefrontOriginsInput): string[] {
  const origins: string[] = []
  const baseDomain = (
    process.env.NEXT_PUBLIC_STOREFRONT_BASE_DOMAIN ?? 'dexaposai.com'
  )
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')

  if (slug) {
    origins.push(`https://${slug}.${baseDomain}`)
  }

  if (customDomain) {
    const host = normalizeHost(customDomain)
    if (host) origins.push(`https://${host}`)
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (appUrl) {
    try {
      origins.push(new URL(appUrl).origin)
    } catch {
      // ignore malformed env var
    }
  }

  const defaults = (process.env.NMI_DEFAULT_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  origins.push(...defaults)

  return [...new Set(origins)]
}

interface ActiveStoreDeviceRow {
  location_id: string
  device_id: string
  whitelist_origins: string[] | null
  whitelist_synced_at: string | null
  merchant_id: string | null
  slug: string | null
  custom_domain: string | null
}

/**
 * Fetch every (location, active-online-ordering-device, store-config) triple
 * we may need to sync. Optionally scoped to a single merchant.
 *
 * Returns one row per location that has BOTH an `online_store_config` and an
 * active online-ordering payment device. Locations missing either are simply
 * absent here — surface them via auditStorefrontWhitelist if you need to know.
 */
async function listActiveStoreDevices(
  supabase: AnySupabase,
  merchantId?: string,
): Promise<ActiveStoreDeviceRow[]> {
  let configQuery = supabase
    .from('online_store_config')
    .select('location_id, merchant_id, slug, custom_domain')

  if (merchantId) {
    configQuery = configQuery.eq('merchant_id', merchantId)
  }

  const { data: configs, error: configError } = await configQuery
  if (configError) throw configError
  if (!configs || configs.length === 0) return []

  const locationIds = configs.map((c) => c.location_id as string)

  const { data: devices, error: deviceError } = await supabase
    .from('location_payment_devices')
    .select('id, location_id, whitelist_origins, whitelist_synced_at')
    .in('location_id', locationIds)
    .eq('use_for_online_ordering', true)
    .eq('is_active', true)

  if (deviceError) throw deviceError

  const deviceByLocation = new Map<string, {
    id: string
    whitelist_origins: string[] | null
    whitelist_synced_at: string | null
  }>()
  for (const d of devices ?? []) {
    deviceByLocation.set(d.location_id as string, {
      id: d.id as string,
      whitelist_origins: (d.whitelist_origins as string[] | null) ?? null,
      whitelist_synced_at: (d.whitelist_synced_at as string | null) ?? null,
    })
  }

  const rows: ActiveStoreDeviceRow[] = []
  for (const c of configs) {
    const device = deviceByLocation.get(c.location_id as string)
    if (!device) continue
    rows.push({
      location_id: c.location_id as string,
      device_id: device.id,
      whitelist_origins: device.whitelist_origins,
      whitelist_synced_at: device.whitelist_synced_at,
      merchant_id: (c.merchant_id as string | null) ?? null,
      slug: (c.slug as string | null) ?? null,
      custom_domain: (c.custom_domain as string | null) ?? null,
    })
  }
  return rows
}

/**
 * Sync a single location's whitelist. Merges (never replaces) the computed
 * origin set into `whitelist_origins`. Idempotent — a re-run on an already-
 * synced location returns `skipped: true, skipReason: 'unchanged'`.
 */
export async function syncStorefrontWhitelistForLocation(
  supabase: AnySupabase,
  locationId: string,
): Promise<WhitelistSyncResult> {
  try {
    const { data: device, error: deviceError } = await supabase
      .from('location_payment_devices')
      .select('id, whitelist_origins')
      .eq('location_id', locationId)
      .eq('use_for_online_ordering', true)
      .eq('is_active', true)
      .maybeSingle()

    if (deviceError) {
      return { synced: false, origins: [], syncedAt: null, error: deviceError.message }
    }
    if (!device) {
      return {
        synced: false,
        origins: [],
        syncedAt: null,
        skipped: true,
        skipReason: 'no_active_online_ordering_device',
      }
    }

    const { data: config } = await supabase
      .from('online_store_config')
      .select('slug, custom_domain')
      .eq('location_id', locationId)
      .maybeSingle()

    const computed = computeStorefrontOrigins({
      slug: (config?.slug as string | null) ?? null,
      customDomain: (config?.custom_domain as string | null) ?? null,
    })
    const existing: string[] = Array.isArray(device.whitelist_origins)
      ? (device.whitelist_origins as string[])
      : []
    const merged = [...new Set([...existing, ...computed])]

    if ([...existing].sort().join('|') === [...merged].sort().join('|')) {
      return {
        synced: true,
        origins: merged,
        syncedAt: null,
        skipped: true,
        skipReason: 'unchanged',
      }
    }

    const nowIso = new Date().toISOString()
    const { error: updateError } = await supabase
      .from('location_payment_devices')
      .update({ whitelist_origins: merged, whitelist_synced_at: nowIso })
      .eq('id', device.id)

    if (updateError) {
      return { synced: false, origins: existing, syncedAt: null, error: updateError.message }
    }
    return { synced: true, origins: merged, syncedAt: nowIso }
  } catch (e) {
    return {
      synced: false,
      origins: [],
      syncedAt: null,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

/**
 * Bulk sync every active online-ordering location. Safe to re-run — each
 * per-location call is idempotent. Use the result summary to decide which
 * locations now need their `whitelist_origins` registered in the NMI portal.
 */
export async function bulkSyncStorefrontWhitelist(
  supabase: AnySupabase,
  options: { merchantId?: string } = {},
): Promise<{
  scanned: number
  updated: number
  unchanged: number
  errors: number
  perLocation: Array<{ locationId: string; result: WhitelistSyncResult }>
}> {
  const rows = await listActiveStoreDevices(supabase, options.merchantId)
  const perLocation: Array<{ locationId: string; result: WhitelistSyncResult }> = []
  let updated = 0
  let unchanged = 0
  let errors = 0

  for (const row of rows) {
    const result = await syncStorefrontWhitelistForLocation(supabase, row.location_id)
    perLocation.push({ locationId: row.location_id, result })
    if (result.error) errors += 1
    else if (result.skipped && result.skipReason === 'unchanged') unchanged += 1
    else if (result.synced && !result.skipped) updated += 1
  }

  return { scanned: rows.length, updated, unchanged, errors, perLocation }
}

/**
 * Read-only audit: for every active online-ordering location (optionally
 * scoped to one merchant), report which expected origins are missing from
 * `whitelist_origins`. This is the report ops uses to know which locations
 * still need their origins registered in the NMI portal.
 *
 * Also includes locations that have a store config but NO active online-
 * ordering device (`status: 'no_device'`) — those are blocked on NMI device
 * setup before any sync can run.
 */
export async function auditStorefrontWhitelist(
  supabase: AnySupabase,
  options: { merchantId?: string } = {},
): Promise<WhitelistAuditEntry[]> {
  // Pull all configs (including locations that may have no device) so we can
  // surface the no-device case.
  let configQuery = supabase
    .from('online_store_config')
    .select('location_id, merchant_id, slug, custom_domain, is_active')

  if (options.merchantId) {
    configQuery = configQuery.eq('merchant_id', options.merchantId)
  }

  const { data: configs, error: configError } = await configQuery
  if (configError) throw configError
  if (!configs || configs.length === 0) return []

  const locationIds = configs.map((c) => c.location_id as string)

  const { data: devices, error: deviceError } = await supabase
    .from('location_payment_devices')
    .select('id, location_id, whitelist_origins, whitelist_synced_at')
    .in('location_id', locationIds)
    .eq('use_for_online_ordering', true)
    .eq('is_active', true)
  if (deviceError) throw deviceError

  const deviceByLocation = new Map<string, {
    id: string
    whitelist_origins: string[] | null
    whitelist_synced_at: string | null
  }>()
  for (const d of devices ?? []) {
    deviceByLocation.set(d.location_id as string, {
      id: d.id as string,
      whitelist_origins: (d.whitelist_origins as string[] | null) ?? null,
      whitelist_synced_at: (d.whitelist_synced_at as string | null) ?? null,
    })
  }

  const entries: WhitelistAuditEntry[] = []
  for (const c of configs) {
    const expected = computeStorefrontOrigins({
      slug: (c.slug as string | null) ?? null,
      customDomain: (c.custom_domain as string | null) ?? null,
    })
    const device = deviceByLocation.get(c.location_id as string)
    const current = device?.whitelist_origins ?? []
    const currentSet = new Set(current)
    const missing = expected.filter((o) => !currentSet.has(o))

    let status: WhitelistAuditEntry['status']
    if (!device) status = 'no_device'
    else if (missing.length === 0) status = 'up_to_date'
    else status = 'needs_sync'

    entries.push({
      locationId: c.location_id as string,
      merchantId: (c.merchant_id as string | null) ?? null,
      storeSlug: (c.slug as string | null) ?? null,
      customDomain: (c.custom_domain as string | null) ?? null,
      deviceId: device?.id ?? null,
      expected,
      current,
      missing,
      whitelistSyncedAt: device?.whitelist_synced_at ?? null,
      status,
    })
  }
  return entries
}
