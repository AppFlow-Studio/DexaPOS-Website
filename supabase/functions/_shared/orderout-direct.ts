// ============================================================================
// OrderOut Direct — shared eligibility + quote persistence
// ============================================================================
// Used by orderout-delivery-quote (checkout) and orderout-delivery-dispatch
// (re-quote at accept). Keeps the "is this store allowed to use Direct?" rule
// and the "store a batch of quotes, pick one" rule in exactly one place.
// ============================================================================

import type { SupabaseClient } from 'npm:@supabase/supabase-js@^2'
import {
  getDeliveryQuotes,
  quotePriceToDollars,
  type DeliveryQuote,
  type DeliveryQuotesResult,
} from './orderout.ts'

/**
 * How long a stored quote is trusted before create-online-order demands a
 * re-quote. OrderOut does not document quote lifetime (Step 0 Q2 still open);
 * 5 minutes is the conservative assumption until measured against a push.
 */
export const QUOTE_TTL_MINUTES = 5

/**
 * Every live quote observed on 2026-09-20 carried unit="cent". Used only when
 * a quote arrives without a unit so a doc-shaped response never breaks checkout.
 */
export const QUOTE_DEFAULT_UNIT: 'cent' | 'dollar' = 'cent'

export interface DirectEligibility {
  eligible: boolean
  reason?:
    | 'store_not_found'
    | 'fulfillment_self'
    | 'delivery_disabled'
    | 'restaurant_missing'
    | 'restaurant_inactive'
    | 'restaurant_unlinked'
  storeConfigId: string
  locationId: string
  merchantId: string | null
  /** OrderOut restaurant id (digits) — the `restaurant_id` for quotes. */
  ooRestaurantId: string | null
  /** Minutes until pickup, sent as pickup_minutes. */
  pickupMinutes: number
  restaurantRowId: string | null
}

/**
 * A store may use Direct when it is switched to orderout_direct, delivery is
 * on, and its location has an active OrderOut restaurant. The dashboard's
 * OrderOut paywall grandfathers any merchant with a restaurant row, so the
 * active-row check is the entitlement check.
 */
export async function resolveDirectEligibility(
  supabase: SupabaseClient,
  storeConfigId: string,
): Promise<DirectEligibility> {
  const { data: store } = await supabase
    .from('online_store_config')
    .select('id, location_id, accepts_delivery, delivery_fulfillment, estimated_prep_minutes')
    .eq('id', storeConfigId)
    .maybeSingle()

  const base: DirectEligibility = {
    eligible: false,
    storeConfigId,
    locationId: store?.location_id ?? '',
    merchantId: null,
    ooRestaurantId: null,
    pickupMinutes: store?.estimated_prep_minutes ?? 20,
    restaurantRowId: null,
  }

  if (!store) return { ...base, reason: 'store_not_found' }
  if (store.delivery_fulfillment !== 'orderout_direct') return { ...base, reason: 'fulfillment_self' }
  if (!store.accepts_delivery) return { ...base, reason: 'delivery_disabled' }

  const { data: restaurant } = await supabase
    .from('orderout_restaurants')
    .select('id, oo_restaurant_id, status, prep_time_minutes, merchant_id')
    .eq('location_id', store.location_id)
    .maybeSingle()

  if (!restaurant) return { ...base, reason: 'restaurant_missing' }
  base.restaurantRowId = restaurant.id
  base.merchantId = restaurant.merchant_id ?? null
  if (restaurant.status !== 'active') return { ...base, reason: 'restaurant_inactive' }
  if (!restaurant.oo_restaurant_id || !/^\d+$/.test(restaurant.oo_restaurant_id)) {
    return { ...base, reason: 'restaurant_unlinked' }
  }

  return {
    ...base,
    eligible: true,
    ooRestaurantId: restaurant.oo_restaurant_id,
    pickupMinutes: restaurant.prep_time_minutes ?? store.estimated_prep_minutes ?? 20,
  }
}

export interface NormalizedDropoff {
  street: string
  unit: string | null
  city: string
  state: string
  zip: string
  country: 'USA'
  instructions: string | null
}

/** Trim, upper-case the state, keep the 5-digit ZIP. Returns null when incomplete. */
export function normalizeDropoff(input: Record<string, unknown> | null | undefined): NormalizedDropoff | null {
  if (!input) return null
  const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const street = s(input.street)
  const city = s(input.city)
  const state = s(input.state).toUpperCase()
  const zip = s(input.zip).replace(/-\d{4}$/, '')
  if (!street || !city || !/^[A-Z]{2}$/.test(state) || !/^\d{5}$/.test(zip)) return null
  return {
    street,
    unit: s(input.unit) || null,
    city,
    state,
    zip,
    country: 'USA',
    instructions: s(input.instructions ?? input.delivery_notes) || null,
  }
}

export interface StoredQuoteSelection {
  quoteRowId: string
  batchKey: string
  provider: string
  fee: number
  pickupMinutes: number
  deliveryMinutes: number
  expiresAt: string
}

export type FetchAndStoreResult =
  | { available: true; selected: StoredQuoteSelection; quoteCount: number }
  | { available: false; reason: string; detail?: string }

/**
 * Ask OrderOut for quotes, persist every one under a fresh batch key, mark the
 * cheapest (tie → fastest) as selected, and return only what the caller needs.
 */
export async function fetchAndStoreQuotes(
  supabase: SupabaseClient,
  eligibility: DirectEligibility,
  dropoff: NormalizedDropoff,
  sessionId: string | null,
): Promise<FetchAndStoreResult> {
  if (!eligibility.eligible || !eligibility.ooRestaurantId) {
    return { available: false, reason: eligibility.reason ?? 'ineligible' }
  }

  const result: DeliveryQuotesResult = await getDeliveryQuotes({
    restaurantId: eligibility.ooRestaurantId,
    dropoffStreet: dropoff.street,
    dropoffCity: dropoff.city,
    dropoffState: dropoff.state,
    dropoffZip: dropoff.zip,
    dropoffCountry: dropoff.country,
    dropoffSuite: dropoff.unit ?? undefined,
    dropoffInstructions: dropoff.instructions ?? undefined,
    pickupMinutes: eligibility.pickupMinutes,
  })

  if (!result.available) {
    if (result.reason === 'no_coverage') {
      return { available: false, reason: 'no_coverage', detail: result.providerErrors.map((e) => `${e.provider}: ${e.message}`).join(' | ') }
    }
    return { available: false, reason: result.reason, detail: result.error }
  }

  const priced = result.quotes
    .map((q) => ({ q, fee: quotePriceToDollars(q, QUOTE_DEFAULT_UNIT) }))
    .filter((x) => Number.isFinite(x.fee) && x.fee >= 0)

  if (priced.length === 0) {
    return { available: false, reason: 'no_coverage', detail: 'empty quote list' }
  }

  priced.sort((a, b) => a.fee - b.fee || a.q.delivery_mins_from_now - b.q.delivery_mins_from_now)
  // Selected by position, not by quote id: exactly one row per batch may be
  // is_selected (unique partial index), and OrderOut's ids are not guaranteed
  // distinct across providers.
  const winner = priced[0]

  const batchKey = crypto.randomUUID()
  const fetchedAt = new Date()
  const expiresAt = new Date(fetchedAt.getTime() + QUOTE_TTL_MINUTES * 60_000)

  const rows = priced.map(({ q, fee }, index) => ({
    location_id: eligibility.locationId,
    store_config_id: eligibility.storeConfigId,
    session_id: sessionId,
    request_key: batchKey,
    oo_quote_id: q.id,
    provider: q.provider,
    price: fee,
    raw_price: q.price,
    raw_unit: q.unit ?? null,
    pickup_mins: q.pickup_mins_from_now,
    delivery_mins: q.delivery_mins_from_now,
    dropoff,
    is_selected: index === 0,
    fetched_at: fetchedAt.toISOString(),
    expires_at: expiresAt.toISOString(),
    raw_response: q as unknown as Record<string, unknown>,
  }))

  const { data: inserted, error } = await supabase
    .from('orderout_delivery_quotes')
    .insert(rows)
    .select('id, is_selected')

  if (error || !inserted) {
    return { available: false, reason: 'store_failed', detail: error?.message }
  }

  const selectedRow = inserted.find((r: { id: string; is_selected: boolean }) => r.is_selected)
  if (!selectedRow) {
    return { available: false, reason: 'store_failed', detail: 'selected row missing after insert' }
  }

  return {
    available: true,
    quoteCount: priced.length,
    selected: {
      quoteRowId: selectedRow.id,
      batchKey,
      provider: winner.q.provider,
      fee: winner.fee,
      pickupMinutes: winner.q.pickup_mins_from_now,
      deliveryMinutes: winner.q.delivery_mins_from_now,
      expiresAt: expiresAt.toISOString(),
    },
  }
}

export type { DeliveryQuote }
