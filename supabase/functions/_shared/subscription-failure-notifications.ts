import type { SupabaseClient } from 'npm:@supabase/supabase-js'
import { sendSubscriptionPaymentFailedEmail } from './payment-emails.ts'

type BillingSupabaseClient = SupabaseClient<any, any, any>

function parseEmails(value: string | undefined): string[] {
  return (value ?? '')
    .split(/[;,\n]/)
    .map((email) => email.trim().toLowerCase())
    .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
}

async function runDelivery(params: {
  supabase: BillingSupabaseClient
  invoiceId: string
  eventKey: string
  channel: 'email' | 'app_notification'
  recipient: string
  deliver: () => Promise<void>
}): Promise<void> {
  const { data: existing, error: existingError } = await params.supabase
    .from('subscription_billing_notification_deliveries')
    .select('id, status, attempt_count, updated_at')
    .eq('invoice_id', params.invoiceId)
    .eq('event_key', params.eventKey)
    .eq('channel', params.channel)
    .eq('recipient', params.recipient)
    .maybeSingle()

  if (existingError) {
    console.warn(
      '[subscription-failure-notifications] Delivery ledger unavailable; proceeding without idempotency:',
      existingError.message,
    )
  } else if (existing?.status === 'sent') {
    return
  } else if (
    existing?.status === 'pending' &&
    Date.now() - new Date(existing.updated_at).getTime() < 5 * 60 * 1000
  ) {
    return
  }

  let deliveryId = existing?.id as string | undefined
  if (!existingError) {
    if (deliveryId) {
      await params.supabase
        .from('subscription_billing_notification_deliveries')
        .update({
          status: 'pending',
          attempt_count: Number(existing.attempt_count ?? 0) + 1,
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', deliveryId)
    } else {
      const { data: created, error: createError } = await params.supabase
        .from('subscription_billing_notification_deliveries')
        .insert({
          invoice_id: params.invoiceId,
          event_key: params.eventKey,
          channel: params.channel,
          recipient: params.recipient,
          status: 'pending',
          attempt_count: 1,
        })
        .select('id')
        .maybeSingle()
      if (createError?.code === '23505') return
      if (createError) {
        console.warn(
          '[subscription-failure-notifications] Failed to claim delivery; proceeding without idempotency:',
          createError.message,
        )
      }
      deliveryId = created?.id as string | undefined
    }
  }

  try {
    await params.deliver()
    if (deliveryId) {
      await params.supabase
        .from('subscription_billing_notification_deliveries')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', deliveryId)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (deliveryId) {
      await params.supabase
        .from('subscription_billing_notification_deliveries')
        .update({
          status: 'failed',
          last_error: message,
          updated_at: new Date().toISOString(),
        })
        .eq('id', deliveryId)
    }
    throw error
  }
}

export async function notifySubscriptionPaymentFailure(params: {
  supabase: BillingSupabaseClient
  invoiceId: string
  paymentAttemptCount: number
  failureMessage: string
}): Promise<void> {
  const { data: invoice, error: invoiceError } = await params.supabase
    .from('subscription_invoices')
    .select(
      'id, subscription_id, merchant_id, location_id, invoice_number, total_amount, due_date',
    )
    .eq('id', params.invoiceId)
    .single()

  if (invoiceError || !invoice) {
    throw new Error(invoiceError?.message || 'Invoice not found for notification')
  }

  const [{ data: merchant }, { data: location }, { data: subscription }] =
    await Promise.all([
      params.supabase
        .from('merchants')
        .select('name, owner_email, clerk_org_id')
        .eq('id', invoice.merchant_id)
        .maybeSingle(),
      params.supabase
        .from('locations')
        .select('name')
        .eq('id', invoice.location_id)
        .maybeSingle(),
      params.supabase
        .from('merchant_subscriptions')
        .select('billing_profile_id')
        .eq('id', invoice.subscription_id)
        .maybeSingle(),
    ])

  let billingEmail: string | null = null
  if (subscription?.billing_profile_id) {
    const { data: profile } = await params.supabase
      .from('merchant_billing_profiles')
      .select('billing_email')
      .eq('id', subscription.billing_profile_id)
      .maybeSingle()
    billingEmail = profile?.billing_email?.trim() || null
  }

  const merchantName = merchant?.name || 'Merchant'
  const locationName = location?.name || 'Location'
  const eventKey = `payment_failed_attempt_${Math.max(
    1,
    params.paymentAttemptCount,
  )}`
  const merchantEmail = billingEmail || merchant?.owner_email?.trim() || null
  const configuredInternalEmails = [
    ...parseEmails(Deno.env.get('BILLING_NOTIFICATION_EMAILS')),
    ...parseEmails(Deno.env.get('SUPPORT_TICKET_NOTIFICATION_EMAILS')),
    'support@mtechdistributors.com',
  ]
  const internalEmails = [...new Set(configuredInternalEmails)]

  const merchantHref = '/dashboard/subscriptions'
  const hqHref = merchant?.clerk_org_id
    ? `/manage/subscriptions/${merchant.clerk_org_id}`
    : '/manage/billing'
  const body = `${invoice.invoice_number} for ${merchantName} (${locationName}) failed for $${Number(
    invoice.total_amount ?? 0,
  ).toFixed(2)}. Payment method action is required.`

  const deliveries: Array<Promise<void>> = []
  deliveries.push(
    runDelivery({
      supabase: params.supabase,
      invoiceId: invoice.id,
      eventKey,
      channel: 'app_notification',
      recipient: `merchant:${invoice.merchant_id}`,
      deliver: async () => {
        const { error } = await params.supabase.from('app_notifications').insert({
          audience: 'merchant',
          merchant_id: invoice.merchant_id,
          notification_type: 'subscription_payment_failed',
          title: 'Subscription payment failed',
          body,
          href: merchantHref,
          metadata: {
            invoice_id: invoice.id,
            invoice_number: invoice.invoice_number,
            attempt_count: params.paymentAttemptCount,
            failure_message: params.failureMessage,
          },
        })
        if (error) throw new Error(error.message)
      },
    }),
    runDelivery({
      supabase: params.supabase,
      invoiceId: invoice.id,
      eventKey,
      channel: 'app_notification',
      recipient: 'hq',
      deliver: async () => {
        const { error } = await params.supabase.from('app_notifications').insert({
          audience: 'hq',
          merchant_id: invoice.merchant_id,
          notification_type: 'subscription_payment_failed',
          title: `${merchantName} subscription payment failed`,
          body,
          href: hqHref,
          metadata: {
            invoice_id: invoice.id,
            invoice_number: invoice.invoice_number,
            attempt_count: params.paymentAttemptCount,
            failure_message: params.failureMessage,
          },
        })
        if (error) throw new Error(error.message)
      },
    }),
  )

  const emailRecipients = [
    ...(merchantEmail ? [merchantEmail.toLowerCase()] : []),
    ...internalEmails,
  ]
  for (const recipient of [...new Set(emailRecipients)]) {
    deliveries.push(
      runDelivery({
        supabase: params.supabase,
        invoiceId: invoice.id,
        eventKey,
        channel: 'email',
        recipient,
        deliver: () =>
          sendSubscriptionPaymentFailedEmail({
            to: recipient,
            merchantName,
            locationName,
            invoiceNumber: invoice.invoice_number,
            totalAmount: Number(invoice.total_amount ?? 0),
            dueDate: invoice.due_date,
            failureMessage: params.failureMessage,
          }),
      }),
    )
  }

  const results = await Promise.allSettled(deliveries)
  const failures = results.filter((result) => result.status === 'rejected')
  if (failures.length > 0) {
    throw new Error(`${failures.length} failed-payment notification deliveries failed`)
  }
}
