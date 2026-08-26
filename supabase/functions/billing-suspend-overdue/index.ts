import { createClient } from 'npm:@supabase/supabase-js'
import { isAuthorizedInternalBillingRequest } from '../_shared/internal-billing-auth.ts'

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
    const body = await req.json().catch(() => ({})) as {
      days_past_due?: number
    }

    const daysPastDue = Math.max(Number(body.days_past_due ?? 14), 1)
    const cutoff = new Date(Date.now() - daysPastDue * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { data: overdueInvoices, error } = await supabase
      .from('subscription_invoices')
      .select('id, subscription_id, merchant_id, location_id, invoice_number, due_date, status, merchant_subscriptions(grace_period_ends_at)')
      .in('status', ['open', 'failed'])
      .lte('due_date', cutoff)

    if (error) {
      console.error('[billing-suspend-overdue] Query error:', error)
      return jsonResponse({ success: false, error: error.message }, 500)
    }

    const uniqueSubscriptions = new Map<string, { merchant_id: string; location_id: string; invoice_number: string }>()
    for (const invoice of overdueInvoices ?? []) {
      const subscription = Array.isArray(invoice.merchant_subscriptions)
        ? invoice.merchant_subscriptions[0]
        : invoice.merchant_subscriptions
      const gracePeriodEndsAt = subscription?.grace_period_ends_at
      if (gracePeriodEndsAt && new Date(gracePeriodEndsAt).getTime() > Date.now()) {
        continue
      }

      if (!uniqueSubscriptions.has(invoice.subscription_id)) {
        uniqueSubscriptions.set(invoice.subscription_id, {
          merchant_id: invoice.merchant_id,
          location_id: invoice.location_id,
          invoice_number: invoice.invoice_number,
        })
      }
    }

    const suspended: string[] = []
    for (const [subscriptionId, info] of uniqueSubscriptions.entries()) {
      const { error: updateError } = await supabase
        .from('merchant_subscriptions')
        .update({
          status: 'suspended',
          updated_at: new Date().toISOString(),
        })
        .eq('id', subscriptionId)
        .in('status', ['active', 'past_due'])

      if (!updateError) {
        suspended.push(subscriptionId)
        await supabase.rpc('log_subscription_billing_event', {
          p_action: 'subscription_suspended',
          p_merchant_id: info.merchant_id,
          p_location_id: info.location_id,
          p_resource_type: 'merchant_subscription',
          p_resource_name: info.invoice_number,
          p_resource_id: subscriptionId,
          p_changes: {
            reason: 'overdue_invoice',
            days_past_due: daysPastDue,
          },
          p_metadata: {
            source: 'billing-suspend-overdue',
          },
        })
      }
    }

    return jsonResponse({
      success: true,
      days_past_due: daysPastDue,
      suspended_count: suspended.length,
      suspended_subscription_ids: suspended,
    })
  } catch (error) {
    console.error('[billing-suspend-overdue] Unhandled error:', error)
    return jsonResponse({ success: false, error: 'Internal server error' }, 500)
  }
})
