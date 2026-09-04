import { createClient } from 'npm:@supabase/supabase-js'
import { isAuthorizedInternalBillingRequest } from '../_shared/internal-billing-auth.ts'
import { notifySubscriptionPaymentFailure } from '../_shared/subscription-failure-notifications.ts'
import { resolveSubscriptionRetrySchedule } from '../_shared/subscription-retry-policy.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ success: false, error: 'Method not allowed' }, 405)
  if (!(await isAuthorizedInternalBillingRequest(req))) {
    return jsonResponse({ success: false, error: 'Unauthorized' }, 401)
  }

  try {
    const body = await req.json() as {
      invoice_id?: string
      error_message?: string
    }

    if (!body.invoice_id) {
      return jsonResponse({ success: false, error: 'invoice_id is required' }, 400)
    }

    const now = new Date().toISOString()
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { data: invoice, error: invoiceError } = await supabase
      .from('subscription_invoices')
      .select('id, subscription_id, merchant_id, location_id, invoice_number, payment_attempt_count')
      .eq('id', body.invoice_id)
      .single()

    if (invoiceError || !invoice) {
      return jsonResponse({ success: false, error: 'Invoice not found' }, 404)
    }

    const nextAttemptCount = Number(invoice.payment_attempt_count || 0) + 1
    const failureMessage = body.error_message ?? 'Charge failed'
    const retrySchedule = resolveSubscriptionRetrySchedule(
      nextAttemptCount,
      new Date(now),
    )
    const { error: updateInvoiceError } = await supabase
      .from('subscription_invoices')
      .update({
        status: 'failed',
        payment_attempt_count: nextAttemptCount,
        last_payment_attempt_at: now,
        last_payment_error: failureMessage,
        next_retry_at: retrySchedule.nextRetryAt,
        retry_exhausted_at: retrySchedule.retryExhaustedAt,
        updated_at: now,
      })
      .eq('id', invoice.id)

    if (updateInvoiceError) {
      console.error('[billing-handle-failure] Invoice update error:', updateInvoiceError)
      return jsonResponse({ success: false, error: updateInvoiceError.message }, 500)
    }

    await supabase
      .from('merchant_subscriptions')
      .update({
        status: 'past_due',
        updated_at: now,
      })
      .eq('id', invoice.subscription_id)
      .neq('status', 'canceled')

    await supabase.rpc('log_subscription_billing_event', {
      p_action: 'invoice_payment_failed',
      p_merchant_id: invoice.merchant_id,
      p_location_id: invoice.location_id,
      p_resource_type: 'subscription_invoice',
      p_resource_name: invoice.invoice_number,
      p_resource_id: invoice.id,
      p_changes: {
        status: 'failed',
        payment_attempt_count: nextAttemptCount,
      },
      p_metadata: {
        source: 'billing-handle-failure',
      },
      p_status: 'failed',
      p_error_message: failureMessage,
    })

    try {
      await notifySubscriptionPaymentFailure({
        supabase,
        invoiceId: invoice.id,
        paymentAttemptCount: nextAttemptCount,
        failureMessage,
      })
    } catch (notificationError) {
      console.error(
        '[billing-handle-failure] Failed to deliver payment failure notifications:',
        notificationError,
      )
    }

    return jsonResponse({ success: true, invoice_id: invoice.id, subscription_id: invoice.subscription_id })
  } catch (error) {
    console.error('[billing-handle-failure] Unhandled error:', error)
    return jsonResponse({ success: false, error: 'Internal server error' }, 500)
  }
})
