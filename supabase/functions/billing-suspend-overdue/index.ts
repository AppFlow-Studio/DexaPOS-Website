import { createClient } from 'npm:@supabase/supabase-js'
import { isAuthorizedInternalBillingRequest } from '../_shared/internal-billing-auth.ts'
import {
  deactivateRecurringSubscription,
  type ValorCredentials,
} from '../_shared/valor.ts'

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

interface ValorCredentialRow {
  valor_appid: string
  valor_epi: string
  decrypted_appkey: string
}

function normalizeValorCredentials(row: ValorCredentialRow | null): ValorCredentials | null {
  const appId = row?.valor_appid?.trim()
  const appKey = row?.decrypted_appkey?.trim()
  const epi = row?.valor_epi?.trim()
  return appId && appKey && epi ? { appId, appKey, epi } : null
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
      .select(`
        id,
        subscription_id,
        merchant_id,
        location_id,
        invoice_number,
        due_date,
        status,
        merchant_subscriptions(
          grace_period_ends_at,
          processor,
          processor_account_id,
          processor_subscription_id
        )
      `)
      .in('status', ['open', 'failed'])
      .lte('due_date', cutoff)

    if (error) {
      console.error('[billing-suspend-overdue] Query error:', error)
      return jsonResponse({ success: false, error: error.message }, 500)
    }

    const uniqueSubscriptions = new Map<string, {
      merchant_id: string
      location_id: string
      invoice_number: string
      processor: string | null
      processor_account_id: string | null
      processor_subscription_id: string | null
    }>()
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
          processor: subscription?.processor ?? null,
          processor_account_id: subscription?.processor_account_id ?? null,
          processor_subscription_id: subscription?.processor_subscription_id ?? null,
        })
      }
    }

    const suspended: string[] = []
    const failures: Array<{ subscription_id: string; error: string }> = []
    for (const [subscriptionId, info] of uniqueSubscriptions.entries()) {
      if (info.processor_subscription_id) {
        if (info.processor !== 'valor' || !info.processor_account_id) {
          failures.push({
            subscription_id: subscriptionId,
            error: 'Native recurring schedule is missing its Valor account link.',
          })
          continue
        }

        const { data: credentialRows, error: credentialError } = await supabase.rpc(
          'get_valor_account_credentials',
          { p_account_id: info.processor_account_id },
        )
        const credentialRow = (Array.isArray(credentialRows)
          ? credentialRows[0]
          : credentialRows) as ValorCredentialRow | null
        const credentials = normalizeValorCredentials(credentialRow)
        if (credentialError || !credentials) {
          failures.push({
            subscription_id: subscriptionId,
            error: 'Valor credentials are unavailable; the schedule was not paused.',
          })
          continue
        }

        const deactivation = await deactivateRecurringSubscription(
          credentials,
          info.processor_subscription_id,
        )
        if (!deactivation.success) {
          failures.push({
            subscription_id: subscriptionId,
            error: deactivation.responseText || 'Valor schedule deactivation failed.',
          })
          continue
        }
      }

      const { error: updateError } = await supabase
        .from('merchant_subscriptions')
        .update({
          status: 'suspended',
          ...(info.processor_subscription_id
            ? { processor_subscription_status: 'deactivated' }
            : {}),
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
            processor: info.processor,
            processor_subscription_id: info.processor_subscription_id,
          },
        })
      } else {
        failures.push({
          subscription_id: subscriptionId,
          error: updateError.message,
        })
      }
    }

    return jsonResponse({
      success: true,
      days_past_due: daysPastDue,
      suspended_count: suspended.length,
      suspended_subscription_ids: suspended,
      failure_count: failures.length,
      failures,
    })
  } catch (error) {
    console.error('[billing-suspend-overdue] Unhandled error:', error)
    return jsonResponse({ success: false, error: 'Internal server error' }, 500)
  }
})
