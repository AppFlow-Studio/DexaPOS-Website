// ============================================================================
// OrderOut Direct — dispatch worker
// ============================================================================
// Drains public.orderout_delivery_dispatches. Two kinds of work:
//   pending        -> POST /api/channel/order/push (book the courier)
//   cancel_pending -> POST /v2/delivery/orders/{id}/cancel
//
// Invoked two ways, both best-effort on their own:
//   - pg_net poke from the accept/cancel triggers the instant a row is due
//   - the `orderout-delivery-dispatch-drain` cron job, every minute
// The table is the source of truth; a lost invocation only costs latency.
//
// Retries: claim_orderout_delivery_dispatch bumps next_attempt_at with
// exponential backoff, so this function does NOT retry in-process beyond the
// shared client's short 5xx retry. A transient failure is reported as
// 'retry' and the row becomes due again later; a terminal one is 'failed'.
//
// Double-courier guard: before every push the row is checked for evidence
// that OrderOut already has this order (echo linked it, or an id is stored).
// A timed-out push that actually succeeded upstream is then completed as
// dispatched instead of being pushed again.
//
// Auth: x-internal-secret must equal INTERNAL_NOTIFICATION_SECRET (or a
// service-role bearer). Deploy with --no-verify-jwt so pg_net can reach it.
// ============================================================================

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@^2'
import {
  cancelDeliveryOrder,
  isTerminalStatus,
  pushChannelOrder,
  rawInt,
  type ChannelOrderItem,
  type ChannelPushOrderPayload,
} from '../_shared/orderout.ts'
import { fetchAndStoreQuotes, normalizeDropoff, resolveDirectEligibility } from '../_shared/orderout-direct.ts'
import { isAuthorizedInternalBillingRequest } from '../_shared/internal-billing-auth.ts'
import { notifyMerchantDispatch } from '../_shared/orderout-dispatch-notify.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const BATCH_SIZE = 20
/** Alert the merchant when a re-quote at accept came in more than this over what the customer paid. */
const REQUOTE_ALERT_THRESHOLD = 1.0

type DispatchState = 'awaiting_accept' | 'pending' | 'dispatched' | 'failed' | 'cancel_pending' | 'cancelled'

interface DispatchRow {
  id: string
  order_id: string
  online_order_id: string | null
  location_id: string
  merchant_id: string
  quote_id: string
  charged_fee: number
  driver_tip: number
  oo_order_number: string
  oo_channel_order_id: string | null
  oo_delivery_order_id: string | null
  state: DispatchState
  attempts: number
  max_attempts: number
  echo_received_at: string | null
  cancel_reason: string | null
}

interface OrderRow {
  id: string
  order_number: string
  display_number: string | null
  customer_name: string | null
  customer_phone: string | null
  customer_email: string | null
  special_instructions: string | null
  delivery_address: Record<string, unknown> | null
  subtotal: number
  tax_amount: number
  created_at: string
  online_session_id: string | null
}

interface OrderItemRow {
  id: string
  menu_item_id: string | null
  item_name: string
  quantity: number
  unit_price: number
  subtotal: number
  special_instructions: string | null
  order_item_modifiers: Array<{
    modifier_item_id: string | null
    modifier_name: string
    price_modifier: number
    quantity: number
  }> | null
}

interface QuoteRow {
  id: string
  oo_quote_id: string
  price: number
  expires_at: string
  dropoff: Record<string, unknown>
  store_config_id: string
  session_id: string | null
  pickup_mins: number | null
}

type Outcome = 'dispatched' | 'cancelled' | 'cancel_rejected' | 'retry' | 'failed'

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function money(n: unknown): number {
  const v = Number(n ?? 0)
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0
}

async function complete(
  supabase: SupabaseClient,
  id: string,
  outcome: Outcome,
  statusCode: number | null,
  error: string | null,
  result: Record<string, unknown> = {},
): Promise<void> {
  const { error: rpcError } = await supabase.rpc('complete_orderout_delivery_dispatch', {
    p_id: id,
    p_outcome: outcome,
    p_status_code: statusCode,
    p_error: error,
    p_result: result,
  })
  if (rpcError) console.error('[oo-dispatch] complete RPC failed', { id, outcome, rpcError })
}

/** Pull any id-shaped fields out of whatever the push actually returned. */
function extractIds(data: unknown): { oo_delivery_order_id?: string; tracker_id?: string; fd_id?: string; oo_channel_order_id?: string } {
  if (!data || typeof data !== 'object') return {}
  const d = data as Record<string, unknown>
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = d[k]
      if (typeof v === 'string' && v) return v
      if (typeof v === 'number' && Number.isFinite(v)) return String(v)
    }
    return undefined
  }
  return {
    oo_delivery_order_id: pick('delivery_order_id', 'order_id', 'id'),
    oo_channel_order_id: pick('externalReferenceId', 'external_reference_id', 'channel_order_id'),
    tracker_id: pick('tracker_id', 'trackerId'),
    fd_id: pick('fd_id'),
  }
}

// ── push ────────────────────────────────────────────────────────────────────

async function handlePush(supabase: SupabaseClient, row: DispatchRow): Promise<Outcome> {
  // Double-courier guard (see header).
  if (row.oo_delivery_order_id || row.oo_channel_order_id || row.echo_received_at) {
    console.log('[oo-dispatch] push skipped — OrderOut already has this order', { id: row.id, order: row.oo_order_number })
    await complete(supabase, row.id, 'dispatched', null, null, {})
    return 'dispatched'
  }

  const [{ data: order }, { data: items }, { data: quote }, { data: restaurant }] = await Promise.all([
    supabase
      .from('orders')
      .select('id, order_number, display_number, customer_name, customer_phone, customer_email, special_instructions, delivery_address, subtotal, tax_amount, created_at, online_session_id')
      .eq('id', row.order_id)
      .maybeSingle(),
    supabase
      .from('order_items')
      .select('id, menu_item_id, item_name, quantity, unit_price, subtotal, special_instructions, order_item_modifiers(modifier_item_id, modifier_name, price_modifier, quantity)')
      .eq('order_id', row.order_id),
    supabase
      .from('orderout_delivery_quotes')
      .select('id, oo_quote_id, price, expires_at, dropoff, store_config_id, session_id, pickup_mins')
      .eq('id', row.quote_id)
      .maybeSingle(),
    supabase
      .from('orderout_restaurants')
      .select('pos_uuid, channel_store_id, prep_time_minutes')
      .eq('location_id', row.location_id)
      .maybeSingle(),
  ])

  if (!order || !quote || !restaurant) {
    const missing = [!order && 'order', !quote && 'quote', !restaurant && 'restaurant'].filter(Boolean).join(',')
    await complete(supabase, row.id, 'failed', null, `missing ${missing}`)
    return 'failed'
  }

  const typedOrder = order as OrderRow
  const typedItems = (items ?? []) as OrderItemRow[]
  let activeQuote = quote as QuoteRow
  let requoteDelta: number | null = null

  // Quote expired while waiting for the merchant: re-quote silently. The
  // customer is never re-charged; a higher price is the merchant's cost.
  if (new Date(activeQuote.expires_at).getTime() <= Date.now()) {
    const eligibility = await resolveDirectEligibility(supabase, activeQuote.store_config_id)
    const dropoff = normalizeDropoff(activeQuote.dropoff)
    if (!eligibility.eligible || !dropoff) {
      await complete(supabase, row.id, 'failed', null, `requote impossible: ${eligibility.reason ?? 'bad dropoff'}`)
      return 'failed'
    }
    const fresh = await fetchAndStoreQuotes(supabase, eligibility, dropoff, activeQuote.session_id)
    if (!fresh.available) {
      // Coverage can come and go; treat as transient until attempts run out.
      await complete(supabase, row.id, 'retry', null, `requote failed: ${fresh.reason}`)
      return 'retry'
    }
    const { data: freshRow } = await supabase
      .from('orderout_delivery_quotes')
      .select('id, oo_quote_id, price, expires_at, dropoff, store_config_id, session_id, pickup_mins')
      .eq('id', fresh.selected.quoteRowId)
      .single()
    activeQuote = freshRow as QuoteRow
    requoteDelta = money(fresh.selected.fee - Number(row.charged_fee))
    console.log('[oo-dispatch] re-quoted expired quote', { id: row.id, delta: requoteDelta })
  }

  const addr = (typedOrder.delivery_address ?? {}) as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  const pickupMinutes = activeQuote.pickup_mins ?? restaurant.prep_time_minutes ?? 20
  const readyBy = new Date(Date.now() + pickupMinutes * 60_000).toISOString()

  const channelItems: ChannelOrderItem[] = typedItems.map((it) => ({
    id: it.menu_item_id ?? it.id,
    name: it.item_name,
    price: money(it.unit_price),
    quantity: it.quantity,
    total: money(it.subtotal),
    note: it.special_instructions ?? undefined,
    modifiers: (it.order_item_modifiers ?? []).map((m) => ({
      id: m.modifier_item_id ?? m.modifier_name,
      name: m.modifier_name,
      price: money(m.price_modifier),
      quantity: m.quantity ?? 1,
    })),
  }))

  const subtotal = money(typedOrder.subtotal)
  const tax = money(typedOrder.tax_amount)
  const deliveryFee = money(row.charged_fee)
  const driverTip = money(row.driver_tip)

  const payload: ChannelPushOrderPayload = {
    destination: { storeId: restaurant.channel_store_id ?? restaurant.pos_uuid },
    payload: {
      customer: {
        customerName: typedOrder.customer_name ?? 'Guest',
        phoneNumber: (typedOrder.customer_phone ?? '').replace(/\D/g, ''),
        phoneCode: '',
        customerEmail: typedOrder.customer_email ?? undefined,
        streetName: str(addr.street),
        unit: str(addr.unit) || undefined,
        zipCode: str(addr.zip),
        city: str(addr.city),
        state: str(addr.state),
        deliveryNotes: str(addr.delivery_notes) || undefined,
      },
      order: {
        orderType: 'DELIVERY',
        ready_by: readyBy,
        thirdPartyManagedDelivery: true,
        ooServiceFee: 0,
        merchantOrderFee: 0,
        subtotal,
        staffTip: 0,
        discount: 0,
        tax,
        deliveryFee,
        driverTip,
        driverComp: 0,
        total: money(subtotal + tax + deliveryFee + driverTip),
        payment: { status: 'PAID', mode: 'CREDIT_CARD' },
        delivery: { quote_id: rawInt(activeQuote.oo_quote_id) },
        items: channelItems,
        orderNotes: typedOrder.special_instructions ?? '',
      },
    },
    source: {
      orderNumber: row.oo_order_number,
      placedOn: typedOrder.created_at,
      additionalInfo: 'DexaPOS website',
    },
  }

  // Persist what we are about to send BEFORE the call, so the echo guard and a
  // post-mortem both see the exact request even if the process dies mid-flight.
  await supabase
    .from('orderout_delivery_dispatches')
    .update({ request_payload: payload as unknown as Record<string, unknown> })
    .eq('id', row.id)

  const res = await pushChannelOrder(payload)

  if (res.ok) {
    const ids = extractIds(res.data)
    await complete(supabase, row.id, 'dispatched', res.status, null, {
      ...ids,
      response_payload: res.data ?? {},
      requote_delta: requoteDelta,
    })
    if (requoteDelta !== null && requoteDelta > REQUOTE_ALERT_THRESHOLD) {
      await notifyMerchantDispatch(supabase, {
        merchantId: row.merchant_id,
        orderId: row.order_id,
        orderNumber: row.oo_order_number,
        displayNumber: typedOrder.display_number,
        type: 'orderout_delivery_requote_delta',
        detail: `+$${requoteDelta.toFixed(2)}`,
        metadata: { requote_delta: requoteDelta },
      })
    }
    return 'dispatched'
  }

  const terminal = isTerminalStatus(res.status)
  const outOfAttempts = row.attempts >= row.max_attempts
  const errorText = res.error ?? `HTTP ${res.status}`
  if (terminal || outOfAttempts) {
    await complete(supabase, row.id, 'failed', res.status || null, errorText, { response_payload: res.data ?? null })
    await notifyMerchantDispatch(supabase, {
      merchantId: row.merchant_id,
      orderId: row.order_id,
      orderNumber: row.oo_order_number,
      displayNumber: typedOrder.display_number,
      type: 'orderout_delivery_dispatch_failed',
      detail: res.status ? `OrderOut ${res.status}` : 'network error',
    })
    return 'failed'
  }

  await complete(supabase, row.id, 'retry', res.status || null, errorText, { response_payload: res.data ?? null })
  return 'retry'
}

// ── cancel ──────────────────────────────────────────────────────────────────

async function handleCancel(supabase: SupabaseClient, row: DispatchRow): Promise<Outcome> {
  const { data: order } = await supabase
    .from('orders')
    .select('display_number')
    .eq('id', row.order_id)
    .maybeSingle()
  const displayNumber = (order as { display_number?: string | null } | null)?.display_number ?? null

  const deliveryId = row.oo_delivery_order_id ?? row.oo_channel_order_id
  if (!deliveryId) {
    // Pushed but no id yet (echo hasn't arrived). Wait for it, then give up.
    if (row.attempts >= row.max_attempts) {
      await complete(supabase, row.id, 'failed', null, 'cancel: no OrderOut order id available')
      await notifyMerchantDispatch(supabase, {
        merchantId: row.merchant_id,
        orderId: row.order_id,
        orderNumber: row.oo_order_number,
        displayNumber,
        type: 'orderout_delivery_cancel_failed',
        detail: 'no OrderOut order id',
      })
      return 'failed'
    }
    await complete(supabase, row.id, 'retry', null, 'cancel: waiting for OrderOut order id')
    return 'retry'
  }

  const res = await cancelDeliveryOrder(deliveryId, row.cancel_reason ?? 'Order cancelled')

  if (res.ok || res.status === 404) {
    await complete(supabase, row.id, 'cancelled', res.status, null, { response_payload: res.data ?? {} })
    return 'cancelled'
  }

  const bodyText = JSON.stringify(res.data ?? '').toLowerCase()
  if (bodyText.includes('already') && bodyText.includes('cancel')) {
    await complete(supabase, row.id, 'cancelled', res.status, null, { response_payload: res.data ?? {} })
    return 'cancelled'
  }

  if (isTerminalStatus(res.status)) {
    // OrderOut refused — the courier has (or is about to have) the food.
    await complete(supabase, row.id, 'cancel_rejected', res.status, res.error ?? null, { response_payload: res.data ?? {} })
    await notifyMerchantDispatch(supabase, {
      merchantId: row.merchant_id,
      orderId: row.order_id,
      orderNumber: row.oo_order_number,
      displayNumber,
      type: 'orderout_delivery_cancel_rejected',
      detail: `OrderOut ${res.status}`,
    })
    return 'cancel_rejected'
  }

  if (row.attempts >= row.max_attempts) {
    await complete(supabase, row.id, 'failed', res.status || null, res.error ?? 'cancel failed', { response_payload: res.data ?? null })
    await notifyMerchantDispatch(supabase, {
      merchantId: row.merchant_id,
      orderId: row.order_id,
      orderNumber: row.oo_order_number,
      displayNumber,
      type: 'orderout_delivery_cancel_failed',
      detail: res.status ? `OrderOut ${res.status}` : 'network error',
    })
    return 'failed'
  }

  await complete(supabase, row.id, 'retry', res.status || null, res.error ?? 'cancel failed', { response_payload: res.data ?? null })
  return 'retry'
}

// ── main ────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ success: false, error: 'Method not allowed' }, 405)
  if (!(await isAuthorizedInternalBillingRequest(req))) {
    return json({ success: false, error: 'Unauthorized' }, 401)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  const { data: claimed, error: claimError } = await supabase.rpc('claim_orderout_delivery_dispatch', {
    p_limit: BATCH_SIZE,
  })
  if (claimError) {
    console.error('[oo-dispatch] claim failed', claimError)
    return json({ success: false, error: claimError.message }, 500)
  }

  const rows = (claimed ?? []) as DispatchRow[]
  if (rows.length === 0) return json({ success: true, claimed: 0 })

  const counts: Record<Outcome, number> = { dispatched: 0, cancelled: 0, cancel_rejected: 0, retry: 0, failed: 0 }

  for (const row of rows) {
    try {
      const outcome = row.state === 'cancel_pending' ? await handleCancel(supabase, row) : await handlePush(supabase, row)
      counts[outcome]++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[oo-dispatch] unhandled error', { id: row.id, message })
      await complete(supabase, row.id, 'retry', null, `worker exception: ${message}`)
      counts.retry++
    }
  }

  console.log('[oo-dispatch] batch done', { claimed: rows.length, ...counts })
  return json({ success: true, claimed: rows.length, ...counts })
})
