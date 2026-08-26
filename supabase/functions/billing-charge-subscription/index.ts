import { createClient } from 'npm:@supabase/supabase-js'
import { createSale, createVaultSale } from '../_shared/nmi.ts'
import { sendSubscriptionInvoicePaymentEmail } from '../_shared/payment-emails.ts'
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

function toAmount(value: unknown): number {
  const amount = Number(value ?? 0)
  return Number.isFinite(amount) ? amount : 0
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ success: false, error: 'Method not allowed' }, 405)
  if (!(await isAuthorizedInternalBillingRequest(req))) {
    return jsonResponse({ success: false, error: 'Unauthorized' }, 401)
  }

  try {
    const body = await req.json().catch(() => ({})) as {
      invoice_id?: string
    }

    if (!body.invoice_id?.trim()) {
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
        paid_at,
        payment_attempt_count,
        merchant_subscriptions (
          id,
          status,
          billing_profile_id
        )
      `)
      .eq('id', body.invoice_id)
      .single()

    if (invoiceError || !invoice) {
      return jsonResponse({ success: false, error: 'Invoice not found' }, 404)
    }

    if (!['open', 'failed'].includes(invoice.status)) {
      return jsonResponse(
        {
          success: false,
          error: `Invoice status ${invoice.status} cannot be charged manually.`,
        },
        400,
      )
    }

    const { data: processorAccounts, error: processorAccountError } = await supabase
      .from('merchant_processor_accounts')
      .select('id, location_id, processor')
      .eq('merchant_id', invoice.merchant_id)
      .eq('purpose', 'subscription')
      .eq('is_active', true)
      .eq('is_primary', true)

    if (processorAccountError) {
      console.error(
        '[billing-charge-subscription] Processor account resolution error:',
        processorAccountError,
      )
      return jsonResponse(
        {
          success: false,
          error: 'Subscription payment processor configuration is unavailable.',
          code: 'processor_account_unavailable',
        },
        502,
      )
    }

    const selectedProcessorAccount =
      processorAccounts?.find((account) => account.location_id === invoice.location_id) ??
      processorAccounts?.find((account) => account.location_id === null) ??
      null

    const forceNmi = Deno.env.get('PAYMENTS_FORCE_NMI') === 'true'

    if (selectedProcessorAccount?.processor === 'valor' && !forceNmi) {
      return jsonResponse(
        {
          success: false,
          error:
            'Valor SaaS billing is awaiting recurring-schedule and webhook configuration.',
          code: 'valor_subscription_contract_pending',
        },
        409,
      )
    }

    if (invoice.billing_method !== 'card') {
      return jsonResponse(
        {
          success: false,
          error: 'Only card-based subscription billing is supported right now.',
          code: 'billing_method_not_supported',
        },
        400,
      )
    }

    const subscription = Array.isArray(invoice.merchant_subscriptions)
      ? invoice.merchant_subscriptions[0]
      : invoice.merchant_subscriptions

    let billingProfile:
      | {
          id: string
          billing_email: string | null
          billing_method: string
          card_token: string | null
          customer_vault_id: string | null
          vault_initial_transaction_id: string | null
          payment_device_id: string | null
          platform_billing_config_id: string | null
          card_brand: string | null
          card_last_four: string | null
          is_primary: boolean
          location_id?: string | null
        }
      | null = null
    let billingProfileError: { message?: string } | null = null

    if (subscription?.billing_profile_id) {
      const profileResult = await supabase
        .from('merchant_billing_profiles')
        .select('id, billing_email, billing_method, card_token, customer_vault_id, vault_initial_transaction_id, payment_device_id, platform_billing_config_id, card_brand, card_last_four, is_primary, location_id')
        .eq('id', subscription.billing_profile_id)
        .eq('merchant_id', invoice.merchant_id)
        .eq('billing_method', 'card')
        .eq('is_active', true)
        .maybeSingle()

      billingProfile = profileResult.data
      billingProfileError = profileResult.error
    } else {
      const profileResult = await supabase
        .from('merchant_billing_profiles')
        .select('id, billing_email, billing_method, card_token, customer_vault_id, vault_initial_transaction_id, payment_device_id, platform_billing_config_id, card_brand, card_last_four, is_primary, location_id')
        .eq('merchant_id', invoice.merchant_id)
        .eq('billing_method', 'card')
        .eq('is_active', true)
        .eq('is_primary', true)
        .or(`location_id.eq.${invoice.location_id},location_id.is.null`)
        .order('location_id', { ascending: true, nullsFirst: false })
        .limit(1)

      billingProfile = profileResult.data?.[0] ?? null
      billingProfileError = profileResult.error
    }

    if (billingProfileError || !billingProfile) {
      return jsonResponse(
        {
          success: false,
          error: 'No active card billing profile found for this merchant.',
          code: 'billing_profile_missing',
        },
        400,
      )
    }

    if (!billingProfile.customer_vault_id?.trim() && !billingProfile.card_token?.trim()) {
      return jsonResponse(
        {
          success: false,
          error: 'The selected billing profile is missing an NMI vault reference or card token.',
          code: 'billing_payment_reference_missing',
        },
        400,
      )
    }

    let resolvedPaymentDeviceId = billingProfile.payment_device_id ?? null
    let resolvedPlatformBillingConfigId = billingProfile.platform_billing_config_id ?? null
    let resolvedRailSource: 'platform_billing_config' | 'location_payment_device' = 'location_payment_device'
    let nmiApiKey: string | null = null

    if (billingProfile.customer_vault_id?.trim() && resolvedPlatformBillingConfigId) {
      const { data: platformCredentialRows, error: platformCredentialError } = await supabase.rpc(
        'get_platform_billing_provider_secret',
        {
          p_provider: 'nmi',
        },
      )

      if (platformCredentialError) {
        console.error('[billing-charge-subscription] Platform credential error:', platformCredentialError)
      } else {
        const platformCredential = Array.isArray(platformCredentialRows)
          ? platformCredentialRows[0]
          : platformCredentialRows

        if (platformCredential?.decrypted_secret?.trim()) {
          nmiApiKey = platformCredential.decrypted_secret.trim()
          resolvedRailSource = 'platform_billing_config'
        }
      }
    }

    if (!nmiApiKey) {
      if (!resolvedPaymentDeviceId) {
        const { data: paymentConfigRows, error: paymentConfigError } = await supabase.rpc(
          'get_storefront_payment_config',
          {
            p_location_id: invoice.location_id,
          },
        )

        if (paymentConfigError) {
          console.error('[billing-charge-subscription] Payment config error:', paymentConfigError)
          return jsonResponse(
            {
              success: false,
              error: 'Payment configuration is unavailable for this location.',
              code: 'payment_config_unavailable',
            },
            502,
          )
        }

        const storefrontPaymentConfig = Array.isArray(paymentConfigRows)
          ? paymentConfigRows[0]
          : paymentConfigRows

        resolvedPaymentDeviceId = storefrontPaymentConfig?.device_id ?? null
      }

      if (!resolvedPaymentDeviceId) {
        return jsonResponse(
          {
            success: false,
            error: 'No active billing rail is configured for this billing profile.',
            code: 'payment_device_missing',
          },
          502,
        )
      }

      const { data: credentialRows, error: credentialError } = await supabase.rpc(
        'get_nmi_device_credentials',
        {
          p_device_id: resolvedPaymentDeviceId,
        },
      )

      if (credentialError) {
        console.error('[billing-charge-subscription] Credential error:', credentialError)
        return jsonResponse(
          {
            success: false,
            error: 'Payment configuration is unavailable for this location.',
            code: 'payment_credentials_unavailable',
          },
          502,
        )
      }

      const nmiCredential = Array.isArray(credentialRows)
        ? credentialRows[0]
        : credentialRows

      if (!nmiCredential?.decrypted_security_key?.trim()) {
        return jsonResponse(
          {
            success: false,
            error: 'The active NMI device is missing its private API key.',
            code: 'payment_api_key_missing',
          },
          502,
        )
      }

      nmiApiKey = nmiCredential.decrypted_security_key.trim()
    }

    if (!nmiApiKey) {
      return jsonResponse(
        {
          success: false,
          error: 'No active NMI billing credentials are available.',
          code: 'payment_api_key_missing',
        },
        502,
      )
    }

    const nextAttemptCount = Number(invoice.payment_attempt_count || 0) + 1

    const { data: claimedInvoice, error: processingError } = await supabase
      .from('subscription_invoices')
      .update({
        status: 'processing',
        payment_attempt_count: nextAttemptCount,
        last_payment_attempt_at: now,
        last_payment_error: null,
        next_retry_at: null,
        updated_at: now,
      })
      .eq('id', invoice.id)
      .in('status', ['open', 'failed'])
      .select('id')
      .maybeSingle()

    if (processingError || !claimedInvoice) {
      console.error('[billing-charge-subscription] Processing update error:', processingError)
      return jsonResponse(
        {
          success: false,
          error: processingError?.message || 'Invoice is already being processed.',
          code: 'invoice_claim_conflict',
        },
        processingError ? 500 : 409,
      )
    }

    const charge = billingProfile.customer_vault_id?.trim()
      ? await createVaultSale(
          { apiKey: nmiApiKey },
          {
            amount: toAmount(invoice.total_amount),
            currency: 'USD',
            customerVaultId: billingProfile.customer_vault_id.trim(),
            industry: 'ecommerce',
            initiatedBy: 'merchant',
            initialTransactionId: billingProfile.vault_initial_transaction_id?.trim() || undefined,
          },
        )
      : await createSale(
          { apiKey: nmiApiKey },
          {
            amount: toAmount(invoice.total_amount),
            currency: 'USD',
            paymentToken: billingProfile.card_token.trim(),
            industry: 'ecommerce',
          },
        )

    if (!charge.success) {
      const failureMessage =
        charge.details.responseText ||
        charge.body.message?.toString() ||
        charge.text ||
        'Charge failed'
      const retrySchedule = resolveSubscriptionRetrySchedule(
        nextAttemptCount,
        new Date(now),
      )

      await supabase
        .from('subscription_invoices')
        .update({
          status: 'failed',
          last_payment_attempt_at: now,
          last_payment_error: failureMessage,
          next_retry_at: retrySchedule.nextRetryAt,
          retry_exhausted_at: retrySchedule.retryExhaustedAt,
          nmi_response: charge.body,
          updated_at: now,
        })
        .eq('id', invoice.id)

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
          source: 'billing-charge-subscription',
          billing_profile_id: billingProfile.id,
          payment_device_id: resolvedPaymentDeviceId,
          platform_billing_config_id: resolvedPlatformBillingConfigId,
          billing_rail_source: resolvedRailSource,
          nmi_status: charge.status,
          nmi_body: charge.body,
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
          '[billing-charge-subscription] Failed to deliver payment failure notifications:',
          notificationError,
        )
      }

      return jsonResponse(
        {
          success: false,
          error: failureMessage,
          code: 'payment_declined',
          details: {
            responseCode: charge.details.responseCode,
            responseMessage: charge.details.responseText,
            nmiStatus: charge.status,
          },
        },
        402,
      )
    }

    const subscriptionWasRecoverable = subscription && ['past_due', 'suspended'].includes(subscription.status)

    const { error: paidError } = await supabase
      .from('subscription_invoices')
      .update({
        status: 'paid',
        paid_at: now,
        nmi_transaction_id: charge.details.transactionId || charge.details.id || null,
        nmi_response: charge.body,
        last_payment_attempt_at: now,
        last_payment_error: null,
        next_retry_at: null,
        retry_exhausted_at: null,
        updated_at: now,
      })
      .eq('id', invoice.id)

    if (paidError) {
      console.error('[billing-charge-subscription] Paid update error:', paidError)
      return jsonResponse({ success: false, error: paidError.message }, 500)
    }

    await supabase
      .from('merchant_subscriptions')
      .update({
        status: 'active',
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
        p_changes: {
          restored_by_invoice_id: invoice.id,
        },
        p_metadata: {
          source: 'billing-charge-subscription',
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
        payment_attempt_count: nextAttemptCount,
        nmi_transaction_id: charge.details.transactionId || charge.details.id || null,
      },
      p_metadata: {
        source: 'billing-charge-subscription',
        billing_profile_id: billingProfile.id,
        payment_device_id: resolvedPaymentDeviceId,
        platform_billing_config_id: resolvedPlatformBillingConfigId,
        billing_rail_source: resolvedRailSource,
        nmi_status: charge.status,
        nmi_body: charge.body,
      },
    })

    try {
      const [{ data: merchant }, { data: location }] = await Promise.all([
        supabase
          .from('merchants')
          .select('name, owner_email')
          .eq('id', invoice.merchant_id)
          .maybeSingle(),
        supabase
          .from('locations')
          .select('name')
          .eq('id', invoice.location_id)
          .maybeSingle(),
      ])

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
          transactionId: charge.details.transactionId || charge.details.id || null,
        })
      }
    } catch (emailError) {
      console.error('[billing-charge-subscription] Failed to send invoice email:', emailError)
    }

    return jsonResponse({
      success: true,
      invoice_id: invoice.id,
      subscription_id: invoice.subscription_id,
      status: 'paid',
      transaction_id: charge.details.transactionId || charge.details.id || null,
    })
  } catch (error) {
    console.error('[billing-charge-subscription] Unhandled error:', error)
    return jsonResponse({ success: false, error: 'Internal server error' }, 500)
  }
})
