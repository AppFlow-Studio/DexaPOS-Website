// ============================================================================
// OrderOut Direct — merchant bell notifications + storefront broadcasts
// ============================================================================
// Shared by the dispatch worker and the delivery status intake so the
// dashboard bell copy and the realtime event shape live in one place.
// ============================================================================

import type { SupabaseClient } from 'npm:@supabase/supabase-js@^2'

export type DispatchNotificationType =
  | 'orderout_delivery_dispatch_failed'
  | 'orderout_delivery_push_unconfirmed'
  | 'orderout_delivery_cancel_failed'
  | 'orderout_delivery_cancel_rejected'
  | 'orderout_delivery_courier_cancelled'
  | 'orderout_delivery_requote_delta'

interface NotifyInput {
  merchantId: string
  orderId: string
  orderNumber: string
  displayNumber?: string | null
  type: DispatchNotificationType
  detail?: string | null
  metadata?: Record<string, unknown>
}

const COPY: Record<DispatchNotificationType, { title: string; body: (n: string, d: string | null | undefined) => string }> = {
  orderout_delivery_dispatch_failed: {
    title: 'Delivery not dispatched',
    body: (n, d) => `Order ${n} was paid but no courier could be booked${d ? ` (${d})` : ''}. Call the customer or arrange delivery.`,
  },
  orderout_delivery_push_unconfirmed: {
    title: 'Courier booking unconfirmed',
    body: (n, d) => `OrderOut did not confirm the courier for order ${n}${d ? ` (${d})` : ''}. Check the OrderOut dashboard: if the order is there it will link itself shortly, otherwise arrange delivery.`,
  },
  orderout_delivery_cancel_failed: {
    title: 'Delivery cancel not sent',
    body: (n, d) => `Order ${n} was cancelled but OrderOut could not be told${d ? ` (${d})` : ''}. Cancel the courier manually.`,
  },
  orderout_delivery_cancel_rejected: {
    title: 'Courier already on the way',
    body: (n, d) => `Order ${n} was cancelled but the courier has already picked it up${d ? ` (${d})` : ''}.`,
  },
  orderout_delivery_courier_cancelled: {
    title: 'Courier cancelled',
    body: (n, d) => `The courier for order ${n} cancelled${d ? ` (${d})` : ''}. The customer is waiting — arrange another delivery.`,
  },
  orderout_delivery_requote_delta: {
    title: 'Delivery cost changed',
    body: (n, d) => `Order ${n} was dispatched at a higher courier price than the customer paid${d ? ` (${d})` : ''}.`,
  },
}

/** Best-effort: never throws, never blocks the worker. */
export async function notifyMerchantDispatch(supabase: SupabaseClient, input: NotifyInput): Promise<void> {
  const copy = COPY[input.type]
  const label = input.displayNumber ? `#${input.displayNumber}` : input.orderNumber
  try {
    const { error } = await supabase.from('app_notifications').insert({
      audience: 'merchant',
      merchant_id: input.merchantId,
      notification_type: input.type,
      title: copy.title,
      body: copy.body(label, input.detail).slice(0, 2000),
      href: `/dashboard/orders/${input.orderId}`,
      metadata: { order_id: input.orderId, order_number: input.orderNumber, ...(input.metadata ?? {}) },
    })
    if (error) console.error('[oo-dispatch] app_notifications insert failed', error)
  } catch (err) {
    console.error('[oo-dispatch] app_notifications insert threw', err)
  }
}

export interface DeliveryBroadcastPayload {
  orderId: string
  deliveryStatus: string
  deliveryRank: number
  dispatchState: string
  courierName: string | null
  eta: string | null
  trackingUrl: string | null
}

/**
 * Same REST broadcast the checkout uses for status_changed, on the same
 * per-order topic OrderStatusWatcher already subscribes to.
 */
export async function broadcastDeliveryStatus(payload: DeliveryBroadcastPayload): Promise<void> {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) return
  try {
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, apikey: key },
      body: JSON.stringify({
        messages: [{ topic: `order-update:${payload.orderId}`, event: 'delivery_status_changed', payload }],
      }),
    })
  } catch (err) {
    console.error('[oo-dispatch] broadcast failed', err)
  }
}
