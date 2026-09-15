'use server'

import { assertHQPermission } from '@/lib/admin/auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { LogAuditEvent } from '@/app/dashboard/actions/audit-logs'

/**
 * Dynamic Valor acquirer profiles — per-merchant (optionally per-location) MID
 * entry captured from underwriting.
 *
 * The MID/V-Number identify the merchant's own settlement DDA, so they are
 * vaulted by the RPCs (`save_valor_acquirer_profile` / `get_valor_acquirer_secrets`
 * in migration 20260915130000). This module never returns a full MID except
 * through the explicit, audit-logged `revealAcquirerMid`. Everything else the UI
 * needs is masked (last-4 only).
 *
 * Scope model: a NULL `location_id` row is the "same MID for all locations"
 * default; per-location rows are the opt-in "different MID per location" case.
 * The two modes are kept mutually exclusive on save so the UI is unambiguous.
 */

export interface AcquirerProfileMasked {
  /** null = the shared (all-locations) profile. */
  locationId: string | null
  locationName: string | null
  midLast4: string
  vnumberLast4: string | null
  storeNo: string
  termNo: string
  status: 'draft' | 'ready'
}

export interface MerchantAcquirerProfile {
  mode: 'none' | 'shared' | 'per_location'
  shared: AcquirerProfileMasked | null
  perLocation: AcquirerProfileMasked[]
  /** All active locations, for the per-location editor. */
  locations: { locationId: string; locationName: string }[]
  /** Boarding can proceed: a shared profile exists, or every active location has one. */
  ready: boolean
}

interface ProfileRow {
  location_id: string | null
  mid_last_four: string
  vnumber_last_four: string | null
  store_no: string
  term_no: string
  status: 'draft' | 'ready'
}

function maskedFrom(row: ProfileRow, locationName: string | null): AcquirerProfileMasked {
  return {
    locationId: row.location_id,
    locationName,
    midLast4: row.mid_last_four,
    vnumberLast4: row.vnumber_last_four,
    storeNo: row.store_no,
    termNo: row.term_no,
    status: row.status,
  }
}

/** Masked acquirer-profile state for the Valor Boarding section. */
export async function getMerchantAcquirerProfile(
  merchantId: string,
): Promise<MerchantAcquirerProfile> {
  await assertHQPermission('hq.merchant.view')
  const supabase = createServiceRoleClient()

  const [{ data: locations, error: locError }, { data: profiles, error: profError }] =
    await Promise.all([
      supabase
        .from('locations')
        .select('id, name')
        .eq('merchant_id', merchantId)
        .eq('is_active', true)
        .order('name', { ascending: true }),
      supabase
        .from('valor_acquirer_profiles')
        .select('location_id, mid_last_four, vnumber_last_four, store_no, term_no, status')
        .eq('merchant_id', merchantId),
    ])

  if (locError) throw new Error('Failed to load merchant locations.')
  if (profError) throw new Error('Failed to load acquirer profiles.')

  const activeLocations = (locations ?? []).map((l: any) => ({
    locationId: l.id as string,
    locationName: (l.name ?? l.id) as string,
  }))
  const nameById = new Map(activeLocations.map((l) => [l.locationId, l.locationName]))

  const rows = (profiles ?? []) as ProfileRow[]
  const sharedRow = rows.find((r) => r.location_id === null) ?? null
  const perLocationRows = rows.filter((r) => r.location_id !== null)

  const shared = sharedRow ? maskedFrom(sharedRow, null) : null
  const perLocation = perLocationRows.map((r) =>
    maskedFrom(r, nameById.get(r.location_id as string) ?? null),
  )

  let mode: MerchantAcquirerProfile['mode'] = 'none'
  if (perLocation.length > 0) mode = 'per_location'
  else if (shared) mode = 'shared'

  const coveredLocationIds = new Set(perLocation.map((p) => p.locationId as string))
  const ready =
    mode === 'shared'
      ? true
      : mode === 'per_location'
        ? activeLocations.length > 0 &&
          activeLocations.every((l) => coveredLocationIds.has(l.locationId))
        : false

  return { mode, shared, perLocation, locations: activeLocations, ready }
}

export interface AcquirerIdentifierInput {
  mid: string
  vnumber: string
  storeNo: string
  termNo: string
}

export interface SaveAcquirerProfileInput {
  sameForAll: boolean
  /** Required when sameForAll. */
  shared?: AcquirerIdentifierInput
  /** Required when !sameForAll — one entry per active location. */
  perLocation?: (AcquirerIdentifierInput & { locationId: string })[]
}

export interface SaveAcquirerProfileResult {
  ok: boolean
  error?: string
}

/**
 * Upsert a merchant's acquirer profile(s). Keeps the two scope modes mutually
 * exclusive: saving "same for all" clears per-location rows and vice-versa, so
 * `getMerchantAcquirerProfile` always reports one unambiguous mode.
 */
export async function saveMerchantAcquirerProfile(
  merchantId: string,
  input: SaveAcquirerProfileInput,
): Promise<SaveAcquirerProfileResult> {
  const { userId } = await assertHQPermission('hq.merchant.update')
  const supabase = createServiceRoleClient()

  try {
    if (input.sameForAll) {
      const s = input.shared
      if (!s) return { ok: false, error: 'Missing shared credentials.' }
      const { error } = await supabase.rpc('save_valor_acquirer_profile', {
        p_merchant_id: merchantId,
        p_location_id: null,
        p_mid: s.mid,
        p_vnumber: s.vnumber,
        p_store_no: s.storeNo,
        p_term_no: s.termNo,
      })
      if (error) return { ok: false, error: error.message }
      // Drop any per-location rows so the mode is unambiguously "shared".
      await supabase
        .from('valor_acquirer_profiles')
        .delete()
        .eq('merchant_id', merchantId)
        .not('location_id', 'is', null)
    } else {
      const rows = input.perLocation ?? []
      if (rows.length === 0) return { ok: false, error: 'No per-location credentials provided.' }
      for (const r of rows) {
        const { error } = await supabase.rpc('save_valor_acquirer_profile', {
          p_merchant_id: merchantId,
          p_location_id: r.locationId,
          p_mid: r.mid,
          p_vnumber: r.vnumber,
          p_store_no: r.storeNo,
          p_term_no: r.termNo,
        })
        if (error) return { ok: false, error: error.message }
      }
      // Drop the shared row so the mode is unambiguously "per_location".
      await supabase
        .from('valor_acquirer_profiles')
        .delete()
        .eq('merchant_id', merchantId)
        .is('location_id', null)
    }

    await LogAuditEvent({
      merchantId,
      action: 'HQ Admin: Saved Valor acquirer profile',
      actionCategory: 'payments',
      severity: 'info',
      resourceType: 'valor_acquirer_profile',
      resourceId: merchantId,
      resourceName: 'Valor acquirer profile',
      changes: {
        before: {},
        after: {
          mode: input.sameForAll ? 'shared' : 'per_location',
          // Never log full identifiers — last-4 only for traceability.
          mid_last4: input.sameForAll
            ? input.shared?.mid.slice(-4)
            : input.perLocation?.map((r) => r.mid.slice(-4)),
        },
      },
      metadata: { saved_by_admin: userId, source: 'hq_admin' },
    })

    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to save profile.' }
  }
}

export interface RevealAcquirerResult {
  ok: boolean
  mid?: string
  vnumber?: string
  error?: string
}

/** Return the full MID + V-Number for the Sheet reveal. Audit-logged. */
export async function revealAcquirerMid(
  merchantId: string,
  locationId: string | null,
): Promise<RevealAcquirerResult> {
  const { userId } = await assertHQPermission('hq.merchant.update')
  const supabase = createServiceRoleClient()

  const { data, error } = await supabase.rpc('get_valor_acquirer_secrets', {
    p_merchant_id: merchantId,
    p_location_id: locationId,
  })
  if (error) return { ok: false, error: error.message }
  const row = (data as any[])?.[0]
  if (!row) return { ok: false, error: 'No acquirer profile found.' }

  await LogAuditEvent({
    merchantId,
    locationId: locationId ?? undefined,
    action: 'HQ Admin: Revealed Valor MID',
    actionCategory: 'payments',
    severity: 'info',
    resourceType: 'valor_acquirer_profile',
    resourceId: merchantId,
    resourceName: 'Valor acquirer profile',
    changes: { before: {}, after: {} },
    metadata: { revealed_by_admin: userId, source: 'hq_admin', location_id: locationId },
  })

  return { ok: true, mid: row.mid ?? undefined, vnumber: row.vnumber ?? undefined }
}
