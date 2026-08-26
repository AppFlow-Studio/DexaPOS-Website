'use server'

import { assertHQPermission } from '@/lib/admin/auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { LogAuditEvent } from '@/app/dashboard/actions/audit-logs'
import { readIsoCredentials } from '@/lib/payments/valor/auth'
import { ValorConfigError } from '@/lib/payments/valor/config'
import {
  fetchValorNewUserId,
  onboardValorMerchant,
  provisionValorLocations,
  type ValorBoardingOptions,
} from '@/lib/payments/valor/boardingApi'
import {
  BoardingError,
  type BoardedAccount,
  type BoardingPersist,
  type LocationInput,
  type OnboardResult,
} from '@/lib/payments/valor/boarding'
import {
  mapLocationToStore,
  mapMerchantToBoardingDetails,
  missingLocationFields,
  missingMerchantFields,
  readBoardingMcc,
  readValorAcquirerConfig,
  readValorFeeSchedule,
  type LocationBoardingRow,
  type MerchantBoardingRow,
} from '@/lib/payments/valor/boardingConfig'

export interface BoardingBlocker {
  code: string
  label: string
}

export interface BoardMerchantResult {
  ok: boolean
  /** Present when boarding could not even be attempted; each is a fixable gap. */
  blockers?: BoardingBlocker[]
  valorMerchantId?: string | null
  boardedCount?: number
  /** Locations that failed after the merchant was created (retryable). */
  failures?: { locationId: string | null; message: string }[]
  /** Present on a merchant-level failure (nothing durably boarded). */
  error?: string
}

const MERCHANT_COLUMNS =
  'id, business_legal_name, dba_name, name, owner_first_name, owner_last_name, ' +
  'owner_email, owner_phone, business_address_line1, business_city, ' +
  'business_state, business_postal_code, business_country'

const LOCATION_COLUMNS =
  'id, name, address_line1, city, state, postal_code, country, timezone, is_active'

/**
 * Board a DEXA merchant (and all of its active locations) on Valor.
 *
 * Runs a preflight first: if ISO creds, the fee schedule, the acquirer profile,
 * or required merchant/location fields are missing, it returns those blockers
 * and makes NO calls to Valor. Only when the preflight is clean does it run the
 * live boarding sequence (which creates irreversible Valor state). Provisioned
 * accounts are boarded is_primary=false — cutover to the Valor rail is a separate
 * deliberate step.
 */
export async function boardMerchantOnValor(
  merchantId: string,
  opts?: { makePrimary?: boolean }
): Promise<BoardMerchantResult> {
  const { userId } = await assertHQPermission('hq.merchant.update')
  const supabase = createServiceRoleClient()

  const { data: merchant, error: merchantError } = await supabase
    .from('merchants')
    .select(MERCHANT_COLUMNS)
    .eq('id', merchantId)
    .single<MerchantBoardingRow & { id: string }>()

  if (merchantError || !merchant) {
    return { ok: false, error: 'Merchant not found.' }
  }

  const { data: locationRows, error: locationsError } = await supabase
    .from('locations')
    .select(LOCATION_COLUMNS)
    .eq('merchant_id', merchantId)
    .eq('is_active', true)
    .order('name', { ascending: true })

  if (locationsError) {
    return { ok: false, error: 'Failed to load merchant locations.' }
  }

  const locations = (locationRows ?? []) as (LocationBoardingRow & {
    is_active: boolean
  })[]

  // ── Preflight — collect every fixable gap before touching Valor ──────────────
  const blockers: BoardingBlocker[] = []

  try {
    readIsoCredentials()
  } catch (e) {
    blockers.push({
      code: 'iso_credentials',
      label: e instanceof ValorConfigError ? e.message : 'Valor ISO login not configured.',
    })
  }

  let fees: ReturnType<typeof readValorFeeSchedule> | null = null
  try {
    fees = readValorFeeSchedule()
  } catch (e) {
    blockers.push({
      code: 'fee_schedule',
      label: e instanceof ValorConfigError ? e.message : 'Valor fee schedule not configured.',
    })
  }

  let acquirer: ReturnType<typeof readValorAcquirerConfig> | null = null
  try {
    acquirer = readValorAcquirerConfig()
  } catch (e) {
    blockers.push({
      code: 'acquirer',
      label: e instanceof ValorConfigError ? e.message : 'Valor acquirer profile not configured.',
    })
  }

  const merchantGaps = missingMerchantFields(merchant)
  if (merchantGaps.length > 0) {
    blockers.push({
      code: 'merchant_fields',
      label: `Merchant is missing: ${merchantGaps.join(', ')}.`,
    })
  }

  if (locations.length === 0) {
    blockers.push({
      code: 'no_locations',
      label: 'Merchant has no active locations to board.',
    })
  }

  for (const location of locations) {
    const gaps = missingLocationFields(location, merchant)
    if (gaps.length > 0) {
      blockers.push({
        code: `location_fields:${location.id}`,
        label: `Location "${location.name ?? location.id}" is missing: ${gaps.join(', ')}.`,
      })
    }
  }

  if (blockers.length > 0 || !fees || !acquirer) {
    return { ok: false, blockers }
  }

  // ── Live boarding — irreversible Valor state from here ───────────────────────
  const mcc = readBoardingMcc()
  const merchantDetails = mapMerchantToBoardingDetails(merchant, mcc)
  const locationInputs: LocationInput[] = locations.map((location) => ({
    store: mapLocationToStore(location, merchant),
    dexaLocationId: location.id,
    epiLabel: 'VT',
  }))

  const boardingOptions: ValorBoardingOptions = {
    credentials: readIsoCredentials(),
    acquirer,
  }

  const persist: BoardingPersist = async (account: BoardedAccount) => {
    const { error } = await supabase.rpc('board_persist_valor_account', {
      p_merchant_id: account.dexaMerchantId,
      p_location_id: account.dexaLocationId,
      p_valor_merchant_id: account.valorMerchantId,
      p_valor_store_id: account.valorStoreId,
      p_valor_epi: account.valorEpi,
      p_valor_appid: account.valorAppId,
      p_valor_appkey: account.valorAppKey,
      p_valor_new_user_id: account.valorNewUserId,
      p_fee_schedule_id: account.fees.feeScheduleId,
      p_disc_rate_percent: account.fees.discRatePercent,
      p_residual_bps: account.fees.residualBps,
      p_surcharge_percent: account.fees.surchargePercent,
      p_is_primary: Boolean(opts?.makePrimary),
    })
    if (error) {
      throw new Error(`Persisting the boarded account failed: ${error.message}`)
    }
  }

  // Idempotency: if this merchant already has a Valor merchant, DON'T re-run
  // /create (its username is taken) — reuse the existing merchant and only
  // /createStore the locations that aren't boarded yet.
  const { data: existingRows } = await supabase
    .from('merchant_processor_accounts')
    .select('location_id, valor_merchant_id, valor_new_user_id, valor_epi, is_active')
    .eq('merchant_id', merchantId)
    .eq('processor', 'valor')
    .eq('purpose', 'online_order')

  const existing = (existingRows ?? []) as Array<{
    location_id: string | null
    valor_merchant_id: string | null
    valor_new_user_id: string | null
    valor_epi: string | null
    is_active: boolean
  }>
  const boardedLocationIds = new Set(
    existing.filter((r) => r.is_active && r.valor_epi).map((r) => r.location_id),
  )

  // Reuse an existing Valor merchant if this merchant is already boarded. Prefer
  // a row that already has newUserId; otherwise recover it from Valor via an EPI
  // (rows boarded before newUserId was persisted have it NULL — self-heal).
  const anyBoarded = existing.find(
    (r) => r.valor_merchant_id && r.is_active && r.valor_epi,
  )
  let existingCtx: { valorMerchantId: string; newUserId: string } | null = null
  if (anyBoarded?.valor_merchant_id) {
    let newUserId =
      existing.find((r) => r.valor_merchant_id && r.valor_new_user_id)
        ?.valor_new_user_id ?? null
    if (!newUserId && anyBoarded.valor_epi) {
      newUserId = await fetchValorNewUserId(boardingOptions, anyBoarded.valor_epi)
    }
    if (newUserId) {
      existingCtx = {
        valorMerchantId: anyBoarded.valor_merchant_id,
        newUserId,
      }
    }
  }

  try {
    let result: OnboardResult

    if (existingCtx) {
      // Re-provision: only the locations not already boarded.
      const missing = locationInputs.filter(
        (l) => !boardedLocationIds.has(l.dexaLocationId),
      )
      if (missing.length === 0) {
        return {
          ok: true,
          valorMerchantId: existingCtx.valorMerchantId,
          boardedCount: 0,
          failures: [],
        }
      }
      result = await provisionValorLocations(
        boardingOptions,
        merchantDetails,
        fees,
        merchantId,
        existingCtx,
        missing,
        persist,
      )
    } else {
      result = await onboardValorMerchant(
        boardingOptions,
        merchantDetails,
        fees,
        merchantId,
        locationInputs,
        persist,
      )
    }

    await LogAuditEvent({
      merchantId,
      action: 'HQ Admin: Boarded merchant on Valor',
      actionCategory: 'payments',
      severity: result.failures.length > 0 ? 'warning' : 'info',
      resourceType: 'merchant_processor_account',
      resourceId: result.merchant.valorMerchantId,
      resourceName: merchantDetails.dbaName,
      changes: {
        before: {},
        after: {
          valor_merchant_id: result.merchant.valorMerchantId,
          boarded_locations: result.accounts.map((a) => a.dexaLocationId),
          failed_locations: result.failures.map((f) => f.dexaLocationId),
          made_primary: Boolean(opts?.makePrimary),
        },
      },
      metadata: { boarded_by_admin: userId, source: 'hq_admin' },
    })

    return {
      ok: true,
      valorMerchantId: result.merchant.valorMerchantId,
      boardedCount: result.accounts.length,
      failures: result.failures.map((f) => ({
        locationId: f.dexaLocationId,
        message: f.error instanceof Error ? f.error.message : String(f.error),
      })),
    }
  } catch (e) {
    // A merchant-level failure: nothing durably boarded. Surface the step and any
    // Valor-side state that outlived a failed cleanup so a human can reconcile.
    if (e instanceof BoardingError) {
      const orphan = e.orphaned.valorMerchantId
        ? ` Orphaned Valor merchant ${e.orphaned.valorMerchantId}${
            e.cleanedUp ? ' (cleaned up)' : ' (NOT cleaned up — needs manual removal)'
          }.`
        : ''
      return { ok: false, error: `Boarding failed at ${e.step}: ${e.message}.${orphan}` }
    }
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Boarding failed unexpectedly.',
    }
  }
}
