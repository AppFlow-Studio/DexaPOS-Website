import { createClient } from 'npm:@supabase/supabase-js'
import {
  activateRecurringSubscription,
  createRecurringSubscription,
  updateRecurringSubscription,
  type ValorCredentials,
  type ValorRecurringResult,
} from '../_shared/valor.ts'
import { sendSubscriptionInvoicePaymentEmail } from '../_shared/payment-emails.ts'
import { isAuthorizedInternalBillingRequest } from '../_shared/internal-billing-auth.ts'
import { notifySubscriptionPaymentFailure } from '../_shared/subscription-failure-notifications.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-internal-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type BillingMode = 'manual' | 'automatic' | 'configuration'

interface ValorCredentialRow {
  valor_appid: string
  valor_epi: string
  decrypted_appkey: string
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}

function toAmount(value: unknown): number {
  const amount = Number(value ?? 0)
  return Number.isFinite(amount) ? amount : 0
}

function toMinorUnits(value: unknown): number {
  return Math.round(toAmount(value) * 100)
}

function parseBillingDate(value: string | null | undefined): Date {
  if (!value) return new Date()
  const parsed = new Date(`${value.slice(0, 10)}T12:00:00.000Z`)
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
}

function recurringChargeDay(value: string | null | undefined): number {
  return Math.min(parseBillingDate(value).getUTCDate(), 30)
}

function normalizeValorCredentials(row: ValorCredentialRow | null): ValorCredentials | null {
  const appId = row?.valor_appid?.trim()
  const epi = row?.valor_epi?.trim()
  const appKey = row?.decrypted_appkey?.trim()
  return appId && epi && appKey ? { appId, epi, appKey } : null
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed' }, 405)
  }
  if (!(await isAuthorizedInternalBillingRequest(req))) {
    return jsonResponse({ success: false, error: 'Unauthorized' }, 401)
  }

  try {
    const body = (await req.json().catch(() => ({}))) as {
      invoice_id?: string
      mode?: BillingMode
    }
    const invoiceId = body.invoice_id?.trim()
    const mode: BillingMode =
      body.mode === 'automatic'
        ? 'automatic'
        : body.mode === 'configuration'
          ? 'configuration'
          : 'manual'

    if (!invoiceId) {
      return jsonResponse({ success: false, error: 'invoice_id is required' }, 400)
    }

    const now = new Date().toISOString()
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const { data: invoice, error: invoiceError } = await supabase
      .from('subscription_invoices')
      .select(`
        id,
        subscription_id,
        merchant_id,
        location_id,
        invoice_number,
        billing_period_start,
        billing_period_end,
        line_items,
        subtotal,
        card_surcharge,
        total_amount,
        due_date,
        billing_method,
        status,
        created_at,
        payment_attempt_count,
        merchant_subscriptions (
          id,
          status,
          billing_profile_id,
          processor,
          processor_account_id,
          processor_subscription_id,
          processor_subscription_status,
          monthly_amount,
          next_billing_date
        )
      `)
      .eq('id', invoiceId)
      .single()

    if (invoiceError || !invoice) {
      return jsonResponse({ success: false, error: 'Invoice not found' }, 404)
    }
    if (!['open', 'failed'].includes(invoice.status)) {
      return jsonResponse(
        { success: false, error: `Invoice status ${invoice.status} cannot be charged.` },
        400,
      )
    }
    if (invoice.billing_method !== 'card') {
      return jsonResponse(
        {
          success: false,
          error: 'Only card-based subscription billing is supported.',
          code: 'billing_method_not_supported',
        },
        400,
      )
    }

    const subscription = Array.isArray(invoice.merchant_subscriptions)
      ? invoice.merchant_subscriptions[0]
      : invoice.merchant_subscriptions
    if (!subscription) {
      return jsonResponse({ success: false, error: 'Subscription not found' }, 404)
    }

    const { data: billingProfile, error: billingProfileError } = await supabase
      .from('merchant_billing_profiles')
      .select(`
        id,
        billing_email,
        billing_method,
        customer_vault_id,
        payment_profile_id,
        processor,
        processor_account_id
      `)
      .eq('id', subscription.billing_profile_id)
      .eq('merchant_id', invoice.merchant_id)
      .eq('billing_method', 'card')
      .eq('processor', 'valor')
      .eq('is_active', true)
      .maybeSingle()

    if (billingProfileError || !billingProfile) {
      return jsonResponse(
        {
          success: false,
          error: 'No active Valor card billing profile is linked to this subscription.',
          code: 'billing_profile_missing',
        },
        400,
      )
    }
    if (!billingProfile.customer_vault_id?.trim()) {
      return jsonResponse(
        {
          success: false,
          error: 'The Valor billing profile is missing its vault customer reference.',
          code: 'billing_payment_reference_missing',
        },
        400,
      )
    }

    const processorAccountId =
      subscription.processor_account_id ?? billingProfile.processor_account_id ?? null
    if (!processorAccountId) {
      return jsonResponse(
        {
          success: false,
          error: 'No primary Valor SaaS billing account is linked to this subscription.',
          code: 'processor_account_missing',
        },
        400,
      )
    }

    const { data: processorAccount, error: processorAccountError } = await supabase
      .from('merchant_processor_accounts')
      .select('id, processor, purpose, is_active, is_primary')
      .eq('id', processorAccountId)
      .eq('merchant_id', invoice.merchant_id)
      .eq('processor', 'valor')
      .eq('purpose', 'subscription')
      .eq('is_active', true)
      .eq('is_primary', true)
      .maybeSingle()

    if (processorAccountError || !processorAccount) {
      return jsonResponse(
        {
          success: false,
          error: 'The primary Valor SaaS billing account is unavailable.',
          code: 'processor_account_unavailable',
        },
        502,
      )
    }

    const { data: credentialRows, error: credentialError } = await supabase.rpc(
      'get_valor_account_credentials',
      { p_account_id: processorAccount.id },
    )
    const credentialRow = (Array.isArray(credentialRows)
      ? credentialRows[0]
      : credentialRows) as ValorCredentialRow | null
    const credentials = normalizeValorCredentials(credentialRow)
    if (credentialError || !credentials) {
      console.error('[billing-charge-subscription] Valor credential error:', credentialError)
      return jsonResponse(
        {
          success: false,
          error: 'Valor SaaS billing credentials are unavailable.',
          code: 'payment_credentials_unavailable',
        },
        502,
      )
    }

    // Valor owns retries for an existing native schedule. The Dexa retry sweep
    // must never independently charge that same billing cycle.
    if (mode === 'automatic' && subscription.processor_subscription_id) {
      await supabase
        .from('subscription_invoices')
        .update({ next_retry_at: null, updated_at: now })
        .eq('id', invoice.id)

      return jsonResponse({
        success: true,
        invoice_id: invoice.id,
        subscription_id: invoice.subscription_id,
        skipped: true,
        reason: 'valor_native_schedule_owns_retry',
      })
    }

    const [{ data: merchant }, { data: location }] = await Promise.all([
      supabase
        .from('merchants')
        .select('name, owner_email, business_postal_code')
        .eq('id', invoice.merchant_id)
        .maybeSingle(),
      supabase
        .from('locations')
        .select('name, postal_code')
        .eq('id', invoice.location_id)
        .maybeSingle(),
    ])
    const billingName = merchant?.name?.trim() || 'Dexa merchant'
    const billingZip = (location?.postal_code || merchant?.business_postal_code || '')
      .replace(/\D/g, '')
      .slice(0, 5)
    if (billingZip.length !== 5) {
      return jsonResponse(
        {
          success: false,
          error: 'A five-digit billing ZIP is required before charging with Valor.',
          code: 'billing_zip_missing',
        },
        400,
      )
    }

    const nextAttemptCount = Number(invoice.payment_attempt_count || 0) + 1
    const { data: claimedInvoice, error: claimError } = await supabase
      .from('subscription_invoices')
      .update({
        status: 'processing',
        payment_attempt_count: nextAttemptCount,
        last_payment_attempt_at: now,
        last_payment_error: null,
        next_retry_at: null,
        processor: 'valor',
        processor_account_id: processorAccount.id,
        updated_at: now,
      })
      .eq('id', invoice.id)
      .in('status', ['open', 'failed'])
      .select('id')
      .maybeSingle()

    if (claimError || !claimedInvoice) {
      return jsonResponse(
        {
          success: false,
          error: claimError?.message || 'Invoice is already being processed.',
          code: 'invoice_claim_conflict',
        },
        claimError ? 500 : 409,
      )
    }

    const startsOn = parseBillingDate(
      subscription.next_billing_date || invoice.billing_period_end || invoice.due_date,
    )
    const recurringParams = {
      amountMinor: toMinorUnits(invoice.total_amount),
      vaultCustomerId: billingProfile.customer_vault_id.trim(),
      paymentProfileId: billingProfile.payment_profile_id,
      billingCustomerName: billingName,
      billingZip,
      startsOn,
      chargeOn: recurringChargeDay(subscription.next_billing_date || invoice.due_date),
      invoiceNumber: invoice.invoice_number,
      email: billingProfile.billing_email || merchant?.owner_email || null,
      validateOnly: false,
    }

    let charge: ValorRecurringResult
    try {
      if (
        subscription.processor_subscription_id &&
        (subscription.status === 'suspended' ||
          subscription.processor_subscription_status === 'deactivated')
      ) {
        const activation = await activateRecurringSubscription(
          credentials,
          subscription.processor_subscription_id,
        )
        if (!activation.success) {
          throw new Error(
            activation.responseText || 'Valor subscription could not be reactivated',
          )
        }
      }

      charge = subscription.processor_subscription_id
        ? await updateRecurringSubscription(
            credentials,
            subscription.processor_subscription_id,
            recurringParams,
          )
        : await createRecurringSubscription(credentials, recurringParams)
    } catch (error) {
      charge = {
        success: false,
        status: 502,
        subscriptionId: subscription.processor_subscription_id || '',
        transactionId: '',
        responseText: error instanceof Error ? error.message : 'Valor recurring request failed',
        body: {},
      }
    }

    const processorSubscriptionId =
      charge.subscriptionId || subscription.processor_subscription_id || null

    if (processorSubscriptionId) {
      const scheduleUpdates: Record<string, unknown> = {
        processor: 'valor',
        processor_account_id: processorAccount.id,
        processor_subscription_id: processorSubscriptionId,
        processor_subscription_status: charge.success ? 'active' : 'payment_failed',
        processor_next_payment_at: subscription.next_billing_date || invoice.due_date,
        updated_at: now,
      }
      if (!subscription.processor_subscription_id) {
        scheduleUpdates.processor_schedule_created_at = now
      }
      await supabase
        .from('merchant_subscriptions')
        .update(scheduleUpdates)
        .eq('id', invoice.subscription_id)
    }

    if (!charge.success) {
      const failureMessage = charge.responseText || 'Valor subscription charge failed'
      await supabase
        .from('subscription_invoices')
        .update({
          status: 'failed',
          last_payment_attempt_at: now,
          last_payment_error: failureMessage,
          next_retry_at: null,
          processor: 'valor',
          processor_account_id: processorAccount.id,
          processor_response: charge.body,
          updated_at: now,
        })
        .eq('id', invoice.id)
      await supabase
        .from('merchant_subscriptions')
        .update({ status: 'past_due', updated_at: now })
        .eq('id', invoice.subscription_id)
        .neq('status', 'canceled')

      await supabase.rpc('log_subscription_billing_event', {
        p_action: 'invoice_payment_failed',
        p_merchant_id: invoice.merchant_id,
        p_location_id: invoice.location_id,
        p_resource_type: 'subscription_invoice',
        p_resource_name: invoice.invoice_number,
        p_resource_id: invoice.id,
        p_changes: { status: 'failed', payment_attempt_count: nextAttemptCount },
        p_metadata: {
          source: 'billing-charge-subscription',
          processor: 'valor',
          processor_account_id: processorAccount.id,
          processor_subscription_id: processorSubscriptionId,
          valor_status: charge.status,
          valor_body: charge.body,
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
        console.error('[billing-charge-subscription] Failure notification error:', notificationError)
      }

      return jsonResponse(
        {
          success: false,
          error: failureMessage,
          code: 'payment_declined',
          processor: 'valor',
          processor_subscription_id: processorSubscriptionId,
        },
        402,
      )
    }

    const transactionId = charge.transactionId || null
    const subscriptionWasRecoverable = ['past_due', 'suspended'].includes(subscription.status)
    const { error: paidError } = await supabase
      .from('subscription_invoices')
      .update({
        status: 'paid',
        paid_at: now,
        processor: 'valor',
        processor_account_id: processorAccount.id,
        processor_transaction_id: transactionId,
        processor_response: charge.body,
        last_payment_attempt_at: now,
        last_payment_error: null,
        next_retry_at: null,
        retry_exhausted_at: null,
        updated_at: now,
      })
      .eq('id', invoice.id)

    if (paidError) {
      return jsonResponse({ success: false, error: paidError.message }, 500)
    }

    await supabase
      .from('merchant_subscriptions')
      .update({
        status: 'active',
        processor: 'valor',
        processor_account_id: processorAccount.id,
        processor_subscription_id: processorSubscriptionId,
        processor_subscription_status: 'active',
        processor_next_payment_at: subscription.next_billing_date || invoice.due_date,
        grace_period_ends_at: null,
        grace_reason: null,
        updated_at: now,
      })
      .eq('id', invoice.subscription_id)
      .neq('status', 'canceled')

    if (subscriptionWasRecoverable) {
      await supabase.rpc('log_subscription_billing_event', {
        p_action: 'subscription_restored',
        p_merchant_id: invoice.merchant_id,
        p_location_id: invoice.location_id,
        p_resource_type: 'merchant_subscription',
        p_resource_name: invoice.invoice_number,
        p_resource_id: invoice.subscription_id,
        p_changes: { restored_by_invoice_id: invoice.id },
        p_metadata: { source: 'billing-charge-subscription', processor: 'valor' },
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
        payment_attempt_count: nextAttemptCount,
        processor_transaction_id: transactionId,
      },
      p_metadata: {
        source: 'billing-charge-subscription',
        processor: 'valor',
        processor_account_id: processorAccount.id,
        processor_subscription_id: processorSubscriptionId,
        valor_status: charge.status,
      },
    })

    try {
      const recipientEmail = billingProfile.billing_email?.trim() || merchant?.owner_email?.trim()
      if (recipientEmail) {
        await sendSubscriptionInvoicePaymentEmail({
          to: recipientEmail,
          merchantName: merchant?.name || 'Dexa POS',
          locationName: location?.name || 'Location',
          billingEmail: billingProfile.billing_email?.trim() || null,
          invoiceNumber: invoice.invoice_number,
          issuedOn: invoice.created_at,
          billingPeriodStart: invoice.billing_period_start,
          billingPeriodEnd: invoice.billing_period_end,
          lineItems: Array.isArray(invoice.line_items) ? invoice.line_items : [],
          subtotal: toAmount(invoice.subtotal),
          cardSurcharge: toAmount(invoice.card_surcharge),
          totalAmount: toAmount(invoice.total_amount),
          dueDate: invoice.due_date,
          transactionId,
        })
      }
    } catch (emailError) {
      console.error('[billing-charge-subscription] Invoice email error:', emailError)
    }

    return jsonResponse({
      success: true,
      invoice_id: invoice.id,
      subscription_id: invoice.subscription_id,
      processor: 'valor',
      processor_subscription_id: processorSubscriptionId,
      status: 'paid',
      transaction_id: transactionId,
    })
  } catch (error) {
    console.error('[billing-charge-subscription] Unhandled error:', error)
    return jsonResponse({ success: false, error: 'Internal server error' }, 500)
  }
})
