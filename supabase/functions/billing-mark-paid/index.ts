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
    const body = await req.json() as {
      invoice_id?: string
      paid_at?: string
      external_reference?: string | null
      notes?: string | null
    }

    if (!body.invoice_id) {
      return jsonResponse({ success: false, error: 'invoice_id is required' }, 400)
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { data: invoice, error: invoiceError } = await supabase
      .from('subscription_invoices')
      .select('id, subscription_id, merchant_id, location_id, invoice_number, status, metadata')
      .eq('id', body.invoice_id)
      .single()

    if (invoiceError || !invoice) {
      return jsonResponse({ success: false, error: 'Invoice not found' }, 404)
    }

    const paidAt = body.paid_at ?? new Date().toISOString()

    const { error: updateError } = await supabase
      .from('subscription_invoices')
      .update({
        status: 'paid',
        paid_at: paidAt,
        updated_at: new Date().toISOString(),
        nmi_transaction_id: body.external_reference ?? null,
        nmi_response: body.notes
          ? { manual_mark_paid_notes: body.notes }
          : undefined,
      })
      .eq('id', body.invoice_id)

    if (updateError) {
      console.error('[billing-mark-paid] Invoice update error:', updateError)
      return jsonResponse({ success: false, error: updateError.message }, 500)
    }

    const { data: subscription } = await supabase
      .from('merchant_subscriptions')
      .select('id, status')
      .eq('id', invoice.subscription_id)
      .maybeSingle()

    if (subscription && ['past_due', 'suspended'].includes(subscription.status)) {
      await supabase
        .from('merchant_subscriptions')
        .update({
          status: 'active',
          updated_at: new Date().toISOString(),
        })
        .eq('id', invoice.subscription_id)

      await supabase.rpc('log_subscription_billing_event', {
        p_action: 'subscription_restored',
        p_merchant_id: invoice.merchant_id,
        p_location_id: invoice.location_id,
        p_resource_type: 'merchant_subscription',
        p_resource_name: invoice.invoice_number,
        p_resource_id: invoice.subscription_id,
        p_changes: {
          restored_by_invoice_id: invoice.id,
        },
        p_metadata: {
          source: 'billing-mark-paid',
        },
      })
    }

    await supabase.rpc('log_subscription_billing_event', {
      p_action: 'invoice_charged',
      p_merchant_id: invoice.merchant_id,
      p_location_id: invoice.location_id,
      p_resource_type: 'subscription_invoice',
      p_resource_name: invoice.invoice_number,
      p_resource_id: invoice.id,
      p_changes: {
        status: 'paid',
        paid_at: paidAt,
        external_reference: body.external_reference ?? null,
      },
      p_metadata: {
        source: 'billing-mark-paid',
        notes: body.notes ?? null,
      },
    })

    return jsonResponse({ success: true, invoice_id: invoice.id, status: 'paid' })
  } catch (error) {
    console.error('[billing-mark-paid] Unhandled error:', error)
    return jsonResponse({ success: false, error: 'Internal server error' }, 500)
  }
})
