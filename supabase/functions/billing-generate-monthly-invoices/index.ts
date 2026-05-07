import { createClient } from 'npm:@supabase/supabase-js'

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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ success: false, error: 'Method not allowed' }, 405)

  try {
    const body = await req.json().catch(() => ({})) as {
      subscription_id?: string
      merchant_id?: string
      location_id?: string
      billing_date?: string
      due_date?: string
    }

    const billingDate = body.billing_date ?? new Date().toISOString().slice(0, 10)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    let query = supabase
      .from('merchant_subscriptions')
      .select('id, merchant_id, location_id, status, trial_ends_at, next_billing_date')
      .lte('next_billing_date', billingDate)
      .in('status', ['trial', 'active', 'past_due'])

    if (body.subscription_id) query = query.eq('id', body.subscription_id)
    if (body.merchant_id) query = query.eq('merchant_id', body.merchant_id)
    if (body.location_id) query = query.eq('location_id', body.location_id)

    const { data: subscriptions, error } = await query

    if (error) {
      console.error('[billing-generate-monthly-invoices] Query error:', error)
      return jsonResponse({ success: false, error: error.message }, 500)
    }

    const created: Array<{ subscription_id: string; invoice_id: string }> = []
    const skipped: Array<{ subscription_id: string; reason: string }> = []
    const failures: Array<{ subscription_id: string; error: string }> = []

    for (const subscription of subscriptions ?? []) {
      if (
        subscription.status === 'trial' &&
        subscription.trial_ends_at &&
        subscription.trial_ends_at.slice(0, 10) > billingDate
      ) {
        skipped.push({ subscription_id: subscription.id, reason: 'trial_not_finished' })
        continue
      }

      const { data: invoiceId, error: invoiceError } = await supabase.rpc(
        'generate_subscription_invoice',
        {
          p_subscription_id: subscription.id,
          p_due_date: body.due_date ?? null,
        },
      )

      if (invoiceError) {
        failures.push({ subscription_id: subscription.id, error: invoiceError.message })
        continue
      }

      created.push({ subscription_id: subscription.id, invoice_id: invoiceId as string })
    }

    return jsonResponse({
      success: true,
      billing_date: billingDate,
      created_count: created.length,
      skipped_count: skipped.length,
      failed_count: failures.length,
      created,
      skipped,
      failures,
    })
  } catch (error) {
    console.error('[billing-generate-monthly-invoices] Unhandled error:', error)
    return jsonResponse({ success: false, error: 'Internal server error' }, 500)
  }
})
