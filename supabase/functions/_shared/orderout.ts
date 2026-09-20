// ============================================================================
// OrderOut HTTP client (shared)
// ============================================================================
// Host-level client for api.orderout.co. The three older functions
// (orderout-onboard, orderout-menu-webhook, orderout-status-relay) each inline
// their own copy pinned to the `/api` prefix; the Direct delivery endpoints
// live under `/v2/delivery/*`, so this client takes the bare host and callers
// pass the full path.
//
// Two OrderOut quirks this file owns so callers don't have to:
//   1. Ids are int64s close to 2^53. `JSON.parse` would silently round them.
//      Responses are parsed with big integers preserved as strings, and
//      `rawInt()` lets a request body carry one back as a bare JSON integer.
//   2. "No coverage" on quotes is a 400 whose body is an array of per-provider
//      errors, not an empty array. `getDeliveryQuotes` normalises both shapes.
// ============================================================================

const ORDEROUT_HOST = 'https://api.orderout.co'
const DEFAULT_MAX_RETRIES = 2
const DEFAULT_BASE_DELAY_MS = 500

export interface OrderOutResponse<T> {
  ok: boolean
  status: number
  data?: T
  error?: string
}

/** 4xx codes that will never succeed on retry. Same set as orderout-status-relay. */
export function isTerminalStatus(status: number): boolean {
  return [400, 401, 403, 404, 411, 422].includes(status)
}

// ── Big-integer safety ──────────────────────────────────────────────────────

/**
 * Parse JSON while turning any integer literal of 15+ digits into a string.
 * Applied to every OrderOut response body so ids survive intact.
 */
export function parseJsonPreservingBigInts(text: string): unknown {
  // Only touches numbers in value position (after `:` or inside arrays) and
  // never numbers inside strings, because the lookbehind requires a structural
  // character immediately before the digits.
  const quoted = text.replace(/(?<=[:\[,]\s*)(-?\d{15,})(?=\s*[,\]}])/g, '"$1"')
  return JSON.parse(quoted)
}

const RAW_INT_PREFIX = '__orderout_rawint__'

/** Mark a string of digits to be serialised as a bare JSON integer. */
export function rawInt(digits: string): string {
  if (!/^\d+$/.test(digits)) {
    throw new Error(`rawInt expects a digit string, got: ${digits}`)
  }
  return `${RAW_INT_PREFIX}${digits}`
}

/** JSON.stringify that unquotes `rawInt()` markers. */
export function stringifyWithRawInts(body: unknown): string {
  return JSON.stringify(body).replace(
    new RegExp(`"${RAW_INT_PREFIX}(\\d+)"`, 'g'),
    '$1',
  )
}

// ── Core request ────────────────────────────────────────────────────────────

export interface OrderOutRequestOptions {
  /** Defaults to Deno.env ORDEROUT_API_KEY. */
  apiKey?: string
  maxRetries?: number
  baseDelayMs?: number
  /** Defaults to https://api.orderout.co. Override only in tests. */
  host?: string
}

export async function orderOutRequest<T = unknown>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
  options: OrderOutRequestOptions = {},
): Promise<OrderOutResponse<T>> {
  const apiKey = options.apiKey ?? Deno.env.get('ORDEROUT_API_KEY')
  if (!apiKey) {
    return { ok: false, status: 0, error: 'ORDEROUT_API_KEY not configured' }
  }
  if (!path.startsWith('/')) {
    return { ok: false, status: 0, error: `OrderOut path must start with "/": ${path}` }
  }

  const url = `${options.host ?? ORDEROUT_HOST}${path}`
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS

  const headers: Record<string, string> = {
    'api-key': apiKey,
    'Content-Type': 'application/json',
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const init: RequestInit = { method, headers }
      if (body !== undefined && method !== 'GET') {
        init.body = stringifyWithRawInts(body)
      }

      const response = await fetch(url, init)
      const text = await response.text()

      let data: unknown
      try {
        data = text ? parseJsonPreservingBigInts(text) : {}
      } catch {
        data = text
      }

      if (response.ok) {
        return { ok: true, status: response.status, data: data as T }
      }

      // 4xx other than 429 will not change on retry.
      if (response.status < 500 && response.status !== 429) {
        return {
          ok: false,
          status: response.status,
          data: data as T,
          error: `OrderOut ${method} ${path} → ${response.status}`,
        }
      }

      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, baseDelayMs * Math.pow(2, attempt)))
        continue
      }
      return {
        ok: false,
        status: response.status,
        data: data as T,
        error: `OrderOut ${method} ${path} → ${response.status} after ${attempt + 1} attempts`,
      }
    } catch (err) {
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, baseDelayMs * Math.pow(2, attempt)))
        continue
      }
      return { ok: false, status: 0, error: err instanceof Error ? err.message : String(err) }
    }
  }

  return { ok: false, status: 0, error: 'Exhausted retries' }
}

// ── Delivery: quotes ────────────────────────────────────────────────────────

export interface DeliveryQuoteRequest {
  /** OrderOut restaurant id (orderout_restaurants.oo_restaurant_id). Digits only. */
  restaurantId: string
  dropoffStreet: string
  dropoffCity: string
  dropoffState: string
  dropoffZip: string
  /** Defaults to "USA". */
  dropoffCountry?: string
  dropoffSuite?: string
  dropoffInstructions?: string
  /** Minutes until the order is ready for pickup. OrderOut defaults to 10. */
  pickupMinutes?: number
}

/** One quote as OrderOut returns it. `id` is preserved as a digit string. */
export interface DeliveryQuote {
  id: string
  provider: string
  price: number
  /** "cent" or "dollar". Observed always "cent" (2026-09-20); guard anyway. */
  unit?: string
  pickup_mins_from_now: number
  delivery_mins_from_now: number
}

/** Per-provider failure returned (as a 400 array) when no provider can quote. */
export interface DeliveryQuoteProviderError {
  provider: string
  message: string
}

export type DeliveryQuotesResult =
  | { available: true; quotes: DeliveryQuote[]; status: number }
  | { available: false; reason: 'no_coverage'; providerErrors: DeliveryQuoteProviderError[]; status: number }
  | { available: false; reason: 'restaurant_not_found' | 'restaurant_invalid' | 'error'; error: string; status: number }

export async function getDeliveryQuotes(
  req: DeliveryQuoteRequest,
  options?: OrderOutRequestOptions,
): Promise<DeliveryQuotesResult> {
  const body: Record<string, unknown> = {
    restaurant_id: rawInt(req.restaurantId),
    dropoff_street: req.dropoffStreet,
    dropoff_city: req.dropoffCity,
    dropoff_state: req.dropoffState,
    dropoff_zip: req.dropoffZip,
    dropoff_country: req.dropoffCountry ?? 'USA',
  }
  if (req.dropoffSuite) body.dropoff_suite = req.dropoffSuite
  if (req.dropoffInstructions) body.dropoff_instructions = req.dropoffInstructions
  if (req.pickupMinutes !== undefined) body.pickup_minutes = req.pickupMinutes

  const res = await orderOutRequest<unknown>('POST', '/v2/delivery/quotes', body, options)

  if (res.ok && Array.isArray(res.data)) {
    return { available: true, quotes: res.data as DeliveryQuote[], status: res.status }
  }

  if (res.status === 400 && Array.isArray(res.data)) {
    return {
      available: false,
      reason: 'no_coverage',
      providerErrors: res.data as DeliveryQuoteProviderError[],
      status: res.status,
    }
  }

  if (res.status === 404) {
    return { available: false, reason: 'restaurant_not_found', error: describe(res), status: res.status }
  }

  // The restaurant record itself is unquotable (e.g. {"reason": "Invalid 'phone_number'"}).
  if (res.status === 400) {
    return { available: false, reason: 'restaurant_invalid', error: describe(res), status: res.status }
  }

  return { available: false, reason: 'error', error: describe(res), status: res.status }
}

/**
 * Normalise a quote's price to dollars with two decimals, truncated.
 * Throws when `unit` is absent: never guess money units. Callers decide
 * whether to fall back (see ORDEROUT_QUOTE_DEFAULT_UNIT in the quote function).
 */
export function quotePriceToDollars(quote: Pick<DeliveryQuote, 'price' | 'unit'>, defaultUnit?: 'cent' | 'dollar'): number {
  const unit = quote.unit ?? defaultUnit
  if (unit === 'cent') return Math.trunc(quote.price) / 100
  if (unit === 'dollar') return Math.trunc(quote.price * 100) / 100
  throw new Error(`Quote has no unit and no default was supplied (price=${quote.price})`)
}

// ── Channel: push order ─────────────────────────────────────────────────────

export interface ChannelOrderItemModifier {
  id: string
  name: string
  price: number
  quantity: number
}

export interface ChannelOrderItem {
  /** Our menu_item_id. Echoed back as items[].external_id / id on the webhook. */
  id: string
  name: string
  price: number
  quantity: number
  total: number
  note?: string
  modifiers: ChannelOrderItemModifier[]
}

export interface ChannelOrderCustomer {
  customerName: string
  phoneNumber: string
  phoneCode?: string
  customerEmail?: string
  streetName: string
  unit?: string
  zipCode: string
  city: string
  state: string
  deliveryNotes?: string
}

/** Push Order payload per developers.orderout.co/docs/order-payload-example. Money in dollars. */
export interface ChannelPushOrderPayload {
  destination: { storeId: string }
  payload: {
    customer: ChannelOrderCustomer
    order: {
      orderType: 'DELIVERY' | 'PICKUP'
      ready_by: string
      thirdPartyManagedDelivery: boolean
      ooServiceFee: number
      merchantOrderFee: number
      subtotal: number
      staffTip: number
      discount: number
      tax: number
      deliveryFee: number
      driverTip: number
      driverComp: number
      total: number
      payment: { status: 'PAID' | 'UNPAID'; mode: 'CREDIT_CARD' | 'CASH' }
      /** Use rawInt(quoteId) so it serialises as an integer. */
      delivery: { quote_id: string }
      items: ChannelOrderItem[]
      orderNotes: string
    }
  }
  source: {
    orderNumber: string
    placedOn: string
    additionalInfo: string
  }
}

export interface ChannelPushOrderResponse {
  /** Documented as `{}`; anything OrderOut actually returns is kept verbatim. */
  [key: string]: unknown
}

export function pushChannelOrder(
  payload: ChannelPushOrderPayload,
  options?: OrderOutRequestOptions,
): Promise<OrderOutResponse<ChannelPushOrderResponse>> {
  return orderOutRequest<ChannelPushOrderResponse>('POST', '/api/channel/order/push', payload, options)
}

// ── Delivery: cancel ────────────────────────────────────────────────────────

export interface CancelDeliveryOrderResponse {
  id?: string
  fd_id?: string
  tracker_id?: string
  status?: string
  [key: string]: unknown
}

export function cancelDeliveryOrder(
  deliveryOrderId: string,
  reason: string,
  options?: OrderOutRequestOptions,
): Promise<OrderOutResponse<CancelDeliveryOrderResponse>> {
  if (!/^\d+$/.test(deliveryOrderId)) {
    return Promise.resolve({ ok: false, status: 0, error: `Invalid delivery order id: ${deliveryOrderId}` })
  }
  return orderOutRequest<CancelDeliveryOrderResponse>(
    'POST',
    `/v2/delivery/orders/${deliveryOrderId}/cancel`,
    { reason },
    options,
  )
}

// ── POS: restaurant record ──────────────────────────────────────────────────

export interface OrderOutRestaurantRecord {
  id: string
  name: string
  phone_number: string
  street_address_1: string
  city: string
  zipcode: string
  state: string
  country: string
  preparation_time: number
  timezone: string
  connected_delivery_services: string[]
  [key: string]: unknown
}

export function getRestaurant(
  restaurantId: string,
  options?: OrderOutRequestOptions,
): Promise<OrderOutResponse<OrderOutRestaurantRecord>> {
  return orderOutRequest<OrderOutRestaurantRecord>('GET', `/api/pos/restaurant/${restaurantId}`, undefined, options)
}

// ── helpers ─────────────────────────────────────────────────────────────────

function describe(res: OrderOutResponse<unknown>): string {
  const d = res.data
  if (d && typeof d === 'object' && 'reason' in d) return String((d as { reason: unknown }).reason)
  if (typeof d === 'string') return d.slice(0, 200)
  return res.error ?? `HTTP ${res.status}`
}
