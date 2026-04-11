import { createClient } from 'npm:@supabase/supabase-js'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const DEJAVOO_IPOS_API_KEY = Deno.env.get('DEJAVOO_IPOS_API_KEY')!
const DEJAVOO_IPOS_SECRET_KEY = Deno.env.get('DEJAVOO_IPOS_SECRET_KEY')!

const IPOS_AUTH_URL = 'https://auth.ipospays.tech/v1/authenticate-token'
const IPOS_TRANSACT_URL = 'https://payment.ipospays.tech/api/v3/iposTransact'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function firstString(source: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim().length > 0) return value.trim()
    if (typeof value === 'number') return String(value)
  }
  return ''
}

function getResponsePayload(rawResponse: Record<string, unknown>): Record<string, unknown> {
  const transactPayload = asRecord(rawResponse.iposTransactResponse)
  if (Object.keys(transactPayload).length > 0) return transactPayload

  const hpPayload = asRecord(rawResponse.iposhpresponse)
  if (Object.keys(hpPayload).length > 0) return hpPayload

  return rawResponse
}

function extractProcessorDetails(rawResponse: Record<string, unknown>) {
  const payload = getResponsePayload(rawResponse)
  return {
    transactionId: firstString(payload, ['transactionId', 'TransactionId']),
    transactionReferenceId: firstString(payload, ['transactionReferenceId', 'referenceId']),
    transactionNumber: firstString(payload, ['transactionNumber', 'invoiceNumber', 'referenceNumber']),
    responseCode: firstString(payload, ['responseCode', 'ResultCode']),
    responseMessage: firstString(payload, ['responseMessage', 'ResultMessage']),
    authCode: firstString(payload, ['responseApprovalCode', 'authorizationCode', 'authCode']),
    rrn: firstString(payload, ['rrn', 'RRN']),
    rawPayload: payload,
  }
}

async function authenticateIPOS() {
  try {
    const response = await fetch(IPOS_AUTH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apiKey: DEJAVOO_IPOS_API_KEY,
        secretKey: DEJAVOO_IPOS_SECRET_KEY,
        scope: 'PaymentTokenization',
      },
    })

    if (!response.ok) {
      const text = await response.text()
      console.error('[CANCEL_ORDER] iPOS auth failed:', response.status, text)
      return { success: false as const, error: `iPOS authentication failed: ${response.status}` }
    }

    const data = await response.json()
    const token = data.token || data.access_token || data.jwt
    if (!token) {
      return { success: false as const, error: 'No token returned from iPOS authentication' }
    }

    return { success: true as const, token: String(token) }
  } catch (error) {
    console.error('[CANCEL_ORDER] iPOS auth network error:', error)
    return { success: false as const, error: `iPOS authentication network error: ${String(error)}` }
  }
}

async function voidTransaction(token: string, params: { tpn: string; rrn: string; amountCents: number; referenceId: string }) {
  try {
    const response = await fetch(IPOS_TRANSACT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        token,
        apiKey: DEJAVOO_IPOS_API_KEY,
        secretKey: DEJAVOO_IPOS_SECRET_KEY,
        scope: 'PaymentTokenization',
      },
      body: JSON.stringify({
        merchantAuthentication: {
          merchantId: params.tpn,
          transactionReferenceId: params.referenceId,
        },
        transactionRequest: {
          transactionType: 2,
          rrn: params.rrn,
          amount: params.amountCents,
        },
      }),
    })

    const data = await response.json()
    const details = extractProcessorDetails(asRecord(data))

    if (details.responseCode === '200' || details.responseCode === '00' || details.responseCode === '0') {
      return { success: true as const, details, rawResponse: asRecord(data) }
    }

    return {
      success: false as const,
      error: details.responseMessage || 'Processor declined the void',
      details,
      rawResponse: asRecord(data),
    }
  } catch (error) {
    console.error('[CANCEL_ORDER] Void network error:', error)
    return { success: false as const, error: `Void network error: ${String(error)}` }
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (req.method !== 'POST') {
      return jsonResponse({ success: false, error: 'Method not allowed' }, 405)
    }

    const body = await req.json() as {
      order_id?: string
      session_token?: string
      reason?: string
      trigger?: 'customer' | 'timeout'
    }

    if (!body.order_id || !body.session_token) {
      return jsonResponse(
        { success: false, error: 'order_id and session_token are required' },
        400,
      )
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const now = new Date().toISOString()
    const reason = body.reason?.trim() || 'Order cancelled'
    const cancelledBy = body.trigger === 'timeout' ? 'system' : 'customer'

    const { data: session, error: sessionError } = await supabase
      .from('online_order_sessions')
      .select('id, order_id, expires_at, store_config_id')
      .eq('session_token', body.session_token)
      .gt('expires_at', now)
      .single()

    if (sessionError || !session) {
      return jsonResponse({ success: false, error: 'Invalid or expired session' }, 401)
    }

    if (session.order_id !== body.order_id) {
      return jsonResponse({ success: false, error: 'Order does not belong to this session' }, 403)
    }

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, status, payment_status, location_id, merchant_id, customer_email, display_number, total_amount')
      .eq('id', body.order_id)
      .single()

    if (orderError || !order) {
      return jsonResponse({ success: false, error: 'Order not found' }, 404)
    }

    if (order.status !== 'pending') {
      return jsonResponse(
        { success: false, error: `Order can only be cancelled while pending (current: ${order.status})` },
        409,
      )
    }

    const { data: payment } = await supabase
      .from('order_payments')
      .select('id, payment_method, status, rrn, total_amount')
      .eq('order_id', body.order_id)
      .order('initiated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const { data: storeConfig } = await supabase
      .from('online_store_config')
      .select('ipospays_tpn')
      .eq('id', session.store_config_id)
      .single()

    let finalStatus: 'cancelled' | 'void' = 'cancelled'
    let voidDetails:
      | ReturnType<typeof extractProcessorDetails>
      | null = null

    const cardPaymentNeedsVoid =
      payment?.payment_method === 'card' &&
      ['captured', 'authorized', 'paid'].includes(String(payment.status))

    if (cardPaymentNeedsVoid) {
      finalStatus = 'void'

      if (payment?.rrn && storeConfig?.ipospays_tpn) {
        const authResult = await authenticateIPOS()
        if (!authResult.success) {
          return jsonResponse({ success: false, error: authResult.error }, 502)
        }

        const voidResult = await voidTransaction(authResult.token, {
          tpn: storeConfig.ipospays_tpn,
          rrn: payment.rrn,
          amountCents: Math.round(Number(payment.total_amount ?? order.total_amount ?? 0) * 100),
          referenceId: `cancel-${body.order_id.slice(0, 8)}-${Date.now()}`,
        })

        if (!voidResult.success) {
          console.error('[CANCEL_ORDER] Processor void failed:', voidResult)
          return jsonResponse(
            {
              success: false,
              error: `Unable to void the payment automatically: ${voidResult.error}`,
            },
            502,
          )
        }

        voidDetails = voidResult.details
      } else {
        console.warn('[CANCEL_ORDER] No RRN/TPN found for card payment, applying internal void only', {
          orderId: body.order_id,
          paymentId: payment?.id,
        })
      }
    }

    const orderUpdate: Record<string, unknown> = {
      status: finalStatus,
      payment_status: finalStatus === 'void' ? 'void' : order.payment_status,
      cancelled_at: now,
      cancelled_by: cancelledBy,
      cancellation_reason: reason,
      updated_at: now,
    }

    if (finalStatus === 'void') {
      orderUpdate.voided_at = now
      orderUpdate.void_reason = reason
    }

    const { error: updateOrderError } = await supabase
      .from('orders')
      .update(orderUpdate)
      .eq('id', body.order_id)

    if (updateOrderError) {
      console.error('[CANCEL_ORDER] Order update error:', updateOrderError)
      return jsonResponse({ success: false, error: updateOrderError.message }, 500)
    }

    if (payment?.id && finalStatus === 'void') {
      const paymentUpdate: Record<string, unknown> = {
        status: 'void',
        is_voided: true,
        voided_at: now,
        void_reason: reason,
      }

      if (voidDetails) {
        paymentUpdate.result_code = voidDetails.responseCode || null
        paymentUpdate.result_message = voidDetails.responseMessage || null
        paymentUpdate.return_rrn = voidDetails.rrn || payment.rrn || null
        paymentUpdate.return_reference_id =
          voidDetails.transactionReferenceId || voidDetails.transactionNumber || null
        paymentUpdate.return_auth_code = voidDetails.authCode || null
      }

      const { error: updatePaymentError } = await supabase
        .from('order_payments')
        .update(paymentUpdate)
        .eq('id', payment.id)

      if (updatePaymentError) {
        console.error('[CANCEL_ORDER] Payment update error:', updatePaymentError)
        return jsonResponse({ success: false, error: updatePaymentError.message }, 500)
      }
    }

    await supabase.from('order_status_history').insert({
      order_id: body.order_id,
      from_status: 'pending',
      to_status: finalStatus,
      changed_at: now,
      notes:
        finalStatus === 'void'
          ? `Voided ${cancelledBy === 'system' ? 'automatically' : 'by customer'}: ${reason}`
          : `Cancelled ${cancelledBy === 'system' ? 'automatically' : 'by customer'}: ${reason}`,
    })

    return jsonResponse({
      success: true,
      order_id: body.order_id,
      status: finalStatus,
      cancelled_by: cancelledBy,
      customer_email: order.customer_email,
    })
  } catch (error) {
    console.error('[CANCEL_ORDER] Unhandled error:', error)
    return jsonResponse({ success: false, error: 'Internal server error' }, 500)
  }
})
