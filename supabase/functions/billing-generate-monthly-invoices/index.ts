import { createClient } from 'npm:@supabase/supabase-js'
import { isAuthorizedInternalBillingRequest } from '../_shared/internal-billing-auth.ts'
import { isSubscriptionBillingHeld } from '../_shared/subscription-billing-scope.ts'
import { loadMerchantBillingExemption } from '../_shared/merchant-billing-exemption.ts'
import { sendSubscriptionInvoiceIssuedEmail } from '../_shared/payment-emails.ts'
import { runSubscriptionNotificationDelivery } from '../_shared/subscription-failure-notifications.ts'
import {
  buildSubscriptionInvoiceLinks,
  fetchSubscriptionInvoicePdfAttachment,
} from '../_shared/subscription-invoice-links.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

/**
 * Email the merchant their freshly-issued invoice (Stripe-style, PDF attached,
 * hosted link). Best-effort + idempotent via the notification delivery ledger,
 * so a retry of invoice generation never double-sends or fails the run.
 */
async function emailIssuedInvoice(
  supabase: ReturnType<typeof createClient>,
  invoiceId: string,
): Promise<void> {
  try {
    const { data: invoice } = await supabase
      .from('subscription_invoices')
      .select(
        'id, subscription_id, merchant_id, location_id, invoice_number, billing_period_start, billing_period_end, line_items, subtotal, card_surcharge, total_amount, due_date, created_at, public_token, status',
      )
      .eq('id', invoiceId)
      .maybeSingle()
    if (!invoice || invoice.status !== 'open') return

    const [{ data: merchant }, { data: location }, { data: subscription }] = await Promise.all([
      supabase.from('merchants').select('name, owner_email').eq('id', invoice.merchant_id).maybeSingle(),
      invoice.location_id
        ? supabase.from('locations').select('name').eq('id', invoice.location_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from('merchant_subscriptions').select('billing_profile_id').eq('id', invoice.subscription_id).maybeSingle(),
    ])

    let billingEmail: string | null = null
    if (subscription?.billing_profile_id) {
      const { data: profile } = await supabase
        .from('merchant_billing_profiles')
        .select('billing_email')
        .eq('id', subscription.billing_profile_id)
        .maybeSingle()
      billingEmail = (profile?.billing_email as string | null)?.trim() || null
    }

    const recipient = (billingEmail || (merchant?.owner_email as string | null)?.trim() || '').toLowerCase()
    if (!recipient) return

    const { viewUrl, pdfUrl } = buildSubscriptionInvoiceLinks(invoice.public_token as string | null)
    const pdfAttachment = await fetchSubscriptionInvoicePdfAttachment(
      invoice.id as string,
      (invoice.invoice_number as string) || 'dexa-invoice',
    )

    await runSubscriptionNotificationDelivery({
      supabase,
      invoiceId: invoice.id as string,
      eventKey: 'subscription_invoice_issued',
      channel: 'email',
      recipient,
      deliver: () =>
        sendSubscriptionInvoiceIssuedEmail({
          to: recipient,
          merchantName: (merchant?.name as string) || 'Dexa POS',
          locationName: ((location as { name?: string } | null)?.name as string) || 'Location',
          billingEmail,
          invoiceNumber: invoice.invoice_number as string,
          issuedOn: invoice.created_at as string,
          billingPeriodStart: invoice.billing_period_start as string,
          billingPeriodEnd: invoice.billing_period_end as string,
          lineItems: Array.isArray(invoice.line_items) ? (invoice.line_items as Array<Record<string, unknown>>) : [],
          subtotal: Number(invoice.subtotal ?? 0),
          cardSurcharge: Number(invoice.card_surcharge ?? 0),
          totalAmount: Number(invoice.total_amount ?? 0),
          dueDate: invoice.due_date as string,
          viewUrl,
          pdfUrl,
          attachments: pdfAttachment ? [pdfAttachment] : undefined,
        }),
    })
  } catch (err) {
    console.error('[billing-generate-monthly-invoices] issued-email error:', err)
  }
}

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
      .select('id, merchant_id, location_id, status, metadata, trial_ends_at, next_billing_date')
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
      if (isSubscriptionBillingHeld(subscription.metadata)) {
        skipped.push({ subscription_id: subscription.id, reason: 'billing_cutover_review_required' })
        continue
      }
      const billingExemption = await loadMerchantBillingExemption(
        supabase,
        subscription.merchant_id,
      )
      if (billingExemption.active) {
        const { error: advanceError } = await supabase.rpc(
          'advance_billing_exempt_subscription',
          { p_subscription_id: subscription.id, p_as_of_date: billingDate },
        )
        if (advanceError) {
          failures.push({ subscription_id: subscription.id, error: advanceError.message })
          continue
        }
        skipped.push({ subscription_id: subscription.id, reason: 'merchant_billing_exempt' })
        continue
      }
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
      await emailIssuedInvoice(supabase, invoiceId as string)
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
