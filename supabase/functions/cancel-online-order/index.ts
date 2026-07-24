import { createClient } from 'npm:@supabase/supabase-js'
import { refundSale, voidSale } from '../_shared/nmi.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

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
      .select(`
        id,
        payment_method,
        status,
        total_amount,
        transaction_id,
        reference_number,
        processor_name,
        payment_device_id,
        is_settled,
        settled_at
      `)
      .eq('order_id', body.order_id)
      .order('initiated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const cardPaymentNeedsReversal =
      payment?.payment_method === 'card' &&
      ['captured', 'authorized', 'paid'].includes(String(payment.status))

    let finalStatus: 'cancelled' | 'void' = 'cancelled'
    let paymentStatusUpdate: 'refunded' | 'void' | null = null
    let reversalDetails: {
      responseCode: string
      responseMessage: string
      authCode: string
      referenceNumber: string
    } | null = null

    if (cardPaymentNeedsReversal) {
      if (payment.processor_name && payment.processor_name !== 'nmi') {
        return jsonResponse(
          {
            success: false,
            error: `Automatic cancellation is only supported for NMI online payments. Found processor "${payment.processor_name}".`,
          },
          409,
        )
      }

      if (!payment.transaction_id) {
        return jsonResponse(
          {
            success: false,
            error: 'Missing payment transaction id. Unable to reverse card payment automatically.',
          },
          409,
        )
      }

      let paymentDeviceId = payment.payment_device_id as string | null

      if (!paymentDeviceId) {
        const { data: storefrontPaymentConfigRows, error: storefrontPaymentConfigError } =
          await supabase.rpc('get_storefront_payment_config', {
            p_location_id: order.location_id,
          })

        if (storefrontPaymentConfigError) {
          console.error('[CANCEL_ORDER] Failed to resolve storefront payment config:', storefrontPaymentConfigError)
          return jsonResponse({ success: false, error: 'Payment configuration is unavailable.' }, 502)
        }

        paymentDeviceId =
          ((storefrontPaymentConfigRows as Array<{ device_id: string; provider: string }> | null) ?? [])
            .find((row) => row.provider === 'nmi')
            ?.device_id ?? null
      }

      if (!paymentDeviceId) {
        return jsonResponse({ success: false, error: 'NMI payment device is not configured.' }, 502)
      }

      const { data: credentialRows, error: credentialError } = await supabase.rpc(
        'get_nmi_device_credentials',
        {
          p_device_id: paymentDeviceId,
        },
      )

      if (credentialError) {
        console.error('[CANCEL_ORDER] Failed to resolve NMI device credentials:', credentialError)
        return jsonResponse({ success: false, error: 'Payment configuration is unavailable.' }, 502)
      }

      const nmiDeviceCredential = ((credentialRows as Array<{
        device_id: string
        merchant_id: string
        location_id: string
        environment: string
        provider_merchant_id: string | null
        provider_gateway_id: string | null
        provider_public_key: string | null
        decrypted_security_key: string
      }> | null) ?? [])[0] ?? null

      if (!nmiDeviceCredential?.decrypted_security_key) {
        return jsonResponse({ success: false, error: 'NMI credentials are not configured.' }, 502)
      }

      await supabase
        .from('payment_credential_access_log')
        .insert({
          device_id: paymentDeviceId,
          function_name: 'cancel-online-order',
          store_config_id: session.store_config_id,
          actor_user_id: null,
          metadata: {
            order_id: body.order_id,
            payment_id: payment.id,
            trigger: body.trigger ?? 'customer',
          },
        })

      const shouldRefund = Boolean(payment.is_settled || payment.settled_at)
      const amount = Number(Number(payment.total_amount ?? order.total_amount ?? 0).toFixed(2))
      const reversalResult = shouldRefund
        ? await refundSale(
          { apiKey: nmiDeviceCredential.decrypted_security_key },
          payment.transaction_id,
          { amount },
        )
        : await voidSale(
          { apiKey: nmiDeviceCredential.decrypted_security_key },
          payment.transaction_id,
          reason,
        )

      if (!reversalResult.success) {
        console.error('[CANCEL_ORDER] NMI reversal failed:', reversalResult)
        return jsonResponse(
          {
            success: false,
            error:
              reversalResult.details.responseText ||
              'Unable to reverse the payment automatically.',
          },
          reversalResult.status >= 500 ? 502 : 409,
        )
      }

      reversalDetails = {
        responseCode: reversalResult.details.responseCode || reversalResult.details.response,
        responseMessage: reversalResult.details.responseText || (shouldRefund ? 'Refunded' : 'Voided'),
        authCode: reversalResult.details.authCode,
        referenceNumber: reversalResult.details.referenceNumber || reversalResult.details.transactionId,
      }

      const { error: refundApplyError } = await supabase.rpc('apply_refund_to_payment', {
        p_payment_id: payment.id,
        p_refund_amount: Number(amount),
        p_reversal_type: shouldRefund ? 'refund' : 'void',
        p_return_rrn: null,
        p_return_auth_code: reversalDetails.authCode || null,
        p_return_reference_id: reversalDetails.referenceNumber || payment.transaction_id,
        p_return_number: reversalResult.details.transactionId || null,
        p_return_reason: reason,
        p_initiated_by: null,
        p_restore_paid_quantity: false,
      })

      if (refundApplyError) {
        console.error('[CANCEL_ORDER] Failed to persist reversal on payment row:', {
          paymentId: payment.id,
          orderId: body.order_id,
          reversalType: shouldRefund ? 'refund' : 'void',
          gatewayReference:
            reversalResult.details.transactionId ||
            reversalDetails.referenceNumber ||
            null,
          error: refundApplyError,
        })
        return jsonResponse(
          {
            success: false,
            error:
              `Payment reversal was accepted by NMI but could not be recorded locally. ` +
              `Do not retry. Contact support with order ${body.order_id}.`,
          },
          500,
        )
      }

      if (!shouldRefund) {
        finalStatus = 'void'
        paymentStatusUpdate = 'void'
      } else {
        finalStatus = 'cancelled'
        paymentStatusUpdate = 'refunded'
      }
    }

    const orderUpdate: Record<string, unknown> = {
      status: finalStatus,
      payment_status: paymentStatusUpdate ?? order.payment_status,
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
      reversal: reversalDetails,
    })
  } catch (error) {
    console.error('[CANCEL_ORDER] Unhandled error:', error)
    return jsonResponse({ success: false, error: 'Internal server error' }, 500)
  }
})
