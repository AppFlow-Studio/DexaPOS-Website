// ============================================================================
// OrderOut Direct — delivery status intake
// ============================================================================
// Receives courier status events for dispatched deliveries and applies them
// through apply_orderout_delivery_status(), which is monotonic: a late or
// duplicated event can never move the customer's stepper backwards.
//
// STATUS OF THIS FUNCTION (2026-09-20)
//   OrderOut's public docs list the delivery statuses but document neither a
//   registration endpoint nor a payload for them (Step 0 Q5 on the ticket).
//   This function therefore reads the fields it needs from any of the key
//   spellings OrderOut uses elsewhere (order id, tracker id, status, courier,
//   eta, tracking url) and stores the raw body on the dispatch row, so the
//   real shape can be confirmed from the first live event. If OrderOut turns
//   out to have no webhook at all, the same RPC is fed by a poll branch in
//   the dispatch worker instead and this function is simply never registered.
//
// Auth: Bearer ORDEROUT_WEBHOOK_SECRET, constant-time compare — the same
// secret orderout-orders-webhook validates. Always answers 200 after auth so
// OrderOut does not retry; failures land in webhook_dead_letter_queue.
// ============================================================================

import { createClient } from 'npm:@supabase/supabase-js@^2'
import { broadcastDeliveryStatus, notifyMerchantDispatch } from '../_shared/orderout-dispatch-notify.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const WEBHOOK_SECRET = Deno.env.get('ORDEROUT_WEBHOOK_SECRET')

const KNOWN_STATUSES = new Set([
  'pending_assign', 'pending_merchant', 'scheduled', 'runner_assigned', 'en_route_pickup',
  'arrived_pickup', 'picked_up', 'en_route_dropoff', 'arrived_dropoff', 'completed', 'cancelled',
])

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

async function secretsMatch(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder()
  const [x, y] = [enc.encode(a), enc.encode(b)]
  if (x.length !== y.length) return false
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i]
  return diff === 0
}

/** First string/number found under any of the given keys, searched one level deep. */
function pick(obj: Record<string, unknown>, keys: string[]): string | null {
  const scan = (o: Record<string, unknown>): string | null => {
    for (const k of keys) {
      const v = o[k]
      if (typeof v === 'string' && v.trim()) return v.trim()
      if (typeof v === 'number' && Number.isFinite(v)) return String(v)
    }
    return null
  }
  const direct = scan(obj)
  if (direct) return direct
  for (const v of Object.values(obj)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const nested = scan(v as Record<string, unknown>)
      if (nested) return nested
    }
  }
  return null
}

interface ParsedEvent {
  deliveryOrderId: string | null
  trackerId: string | null
  orderNumber: string | null
  status: string | null
  courierName: string | null
  courierPhone: string | null
  trackingUrl: string | null
  eta: string | null
}

function parseEvent(body: Record<string, unknown>): ParsedEvent {
  const status = pick(body, ['status', 'delivery_status', 'event', 'state'])?.toLowerCase() ?? null
  const etaRaw = pick(body, ['eta', 'estimated_delivery', 'estimated_dropoff_time', 'dropoff_eta', 'delivery_eta'])
  const eta = etaRaw && !Number.isNaN(new Date(etaRaw).getTime()) ? new Date(etaRaw).toISOString() : null
  return {
    deliveryOrderId: pick(body, ['order_id', 'delivery_order_id', 'id', 'orderId']),
    trackerId: pick(body, ['tracker_id', 'trackerId']),
    orderNumber: pick(body, ['orderNumber', 'order_number', 'external_id', 'externalReferenceId']),
    status,
    courierName: pick(body, ['courier_name', 'runner_name', 'driver_name', 'courierName', 'name']),
    courierPhone: pick(body, ['courier_phone', 'runner_phone', 'driver_phone', 'courierPhone', 'phone']),
    trackingUrl: pick(body, ['tracking_url', 'trackingUrl', 'tracking_link', 'url']),
    eta,
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ success: false, error: 'Method not allowed' }, 405)

  if (!WEBHOOK_SECRET) return json({ success: false, error: 'ORDEROUT_WEBHOOK_SECRET not configured' }, 401)
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : ''
  if (!token || !(await secretsMatch(token, WEBHOOK_SECRET))) {
    return json({ success: false, error: 'Unauthorized' }, 401)
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ success: false, error: 'Invalid JSON body' }, 400)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const event = parseEvent(body)
  console.log('[oo-delivery-webhook] event', event)

  const dlq = async (message: string) => {
    await supabase.from('webhook_dead_letter_queue').insert({
      source: 'orderout_delivery_webhook',
      event_type: event.status ?? 'unknown',
      raw_payload: body,
      error_message: message,
      status: 'pending',
    })
    return json({ success: true, message: `Stored for review: ${message}` })
  }

  if (!event.status || !KNOWN_STATUSES.has(event.status)) {
    return dlq(`Unrecognised delivery status: ${event.status ?? 'missing'}`)
  }

  // Resolve the dispatch row by whichever id the event carries. Ids are
  // matched with .eq()/.in() only — never interpolated into a PostgREST
  // filter string, which would let a crafted value widen the query.
  const base = () => supabase
    .from('orderout_delivery_dispatches')
    .select('id, order_id, merchant_id, oo_order_number, state, delivery_status_rank')
  let dispatch: { id: string; order_id: string; merchant_id: string; oo_order_number: string; state: string; delivery_status_rank: number } | null = null
  if (event.deliveryOrderId) {
    if (!/^\d{1,32}$/.test(event.deliveryOrderId)) {
      return dlq(`Malformed delivery order id: ${event.deliveryOrderId.slice(0, 64)}`)
    }
    const byDelivery = await base().eq('oo_delivery_order_id', event.deliveryOrderId).maybeSingle()
    dispatch = byDelivery.data ?? (await base().eq('oo_channel_order_id', event.deliveryOrderId).maybeSingle()).data
  } else if (event.trackerId) {
    dispatch = (await base().eq('tracker_id', event.trackerId).maybeSingle()).data
  } else if (event.orderNumber) {
    dispatch = (await base().eq('oo_order_number', event.orderNumber).maybeSingle()).data
  } else {
    return dlq('Event carries no order id, tracker id or order number')
  }
  if (!dispatch) {
    return dlq('No dispatch row matches this event')
  }

  const { data: advanced, error: rpcError } = await supabase.rpc('apply_orderout_delivery_status', {
    p_dispatch_id: dispatch.id,
    p_status: event.status,
    p_courier: { name: event.courierName, phone: event.courierPhone },
    p_eta: event.eta,
    p_tracking_url: event.trackingUrl,
    p_raw: body,
  })
  if (rpcError) {
    return dlq(`apply_orderout_delivery_status failed: ${rpcError.message}`)
  }

  // Keep the tracker id if this is the first time we see it.
  if (event.trackerId) {
    await supabase
      .from('orderout_delivery_dispatches')
      .update({ tracker_id: event.trackerId })
      .eq('id', dispatch.id)
      .is('tracker_id', null)
  }

  if (advanced === true) {
    const { data: fresh } = await supabase
      .from('orderout_delivery_dispatches')
      .select('state, delivery_status, delivery_status_rank, courier_name, eta, tracking_url')
      .eq('id', dispatch.id)
      .single()
    await broadcastDeliveryStatus({
      orderId: dispatch.order_id,
      deliveryStatus: fresh?.delivery_status ?? event.status,
      deliveryRank: Number(fresh?.delivery_status_rank ?? 0),
      dispatchState: fresh?.state ?? dispatch.state,
      courierName: fresh?.courier_name ?? null,
      eta: fresh?.eta ?? null,
      trackingUrl: fresh?.tracking_url ?? null,
    })

    if (event.status === 'cancelled') {
      const { data: order } = await supabase.from('orders').select('display_number').eq('id', dispatch.order_id).maybeSingle()
      await notifyMerchantDispatch(supabase, {
        merchantId: dispatch.merchant_id,
        orderId: dispatch.order_id,
        orderNumber: dispatch.oo_order_number,
        displayNumber: (order as { display_number?: string | null } | null)?.display_number ?? null,
        type: 'orderout_delivery_courier_cancelled',
      })
    }
  }

  return json({ success: true, advanced: advanced === true, dispatch_id: dispatch.id })
})
