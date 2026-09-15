import type { SupabaseClient } from 'npm:@supabase/supabase-js'
import { sendSubscriptionRestoredEmail } from './payment-emails.ts'
import { runSubscriptionNotificationDelivery } from './subscription-failure-notifications.ts'

type BillingSupabaseClient = SupabaseClient<any, any, any>

function parseEmails(value: string | undefined): string[] {
  return (value ?? '').split(/[;,\n]/).map((email) => email.trim().toLowerCase())
    .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
}

export async function notifySubscriptionRestored(params: {
  supabase: BillingSupabaseClient
  invoiceId: string
}): Promise<void> {
  const { data: invoice, error } = await params.supabase
    .from('subscription_invoices')
    .select('id, subscription_id, merchant_id, location_id, invoice_number, total_amount')
    .eq('id', params.invoiceId)
    .single()
  if (error || !invoice) throw new Error(error?.message || 'Restored invoice not found')

  const [{ data: merchant }, { data: location }, { data: subscription }] = await Promise.all([
    params.supabase.from('merchants').select('name, owner_email, clerk_org_id').eq('id', invoice.merchant_id).maybeSingle(),
    params.supabase.from('locations').select('name').eq('id', invoice.location_id).maybeSingle(),
    params.supabase.from('merchant_subscriptions').select('billing_profile_id').eq('id', invoice.subscription_id).maybeSingle(),
  ])
  let billingEmail: string | null = null
  if (subscription?.billing_profile_id) {
    const { data: profile } = await params.supabase.from('merchant_billing_profiles')
      .select('billing_email').eq('id', subscription.billing_profile_id).maybeSingle()
    billingEmail = profile?.billing_email?.trim() || null
  }

  const merchantName = merchant?.name || 'Merchant'
  const locationName = location?.name || 'Location'
  const body = `${invoice.invoice_number} for ${merchantName} (${locationName}) was paid. Subscription billing is current and access has been restored.`
  const eventKey = 'subscription_restored'
  const hqHref = merchant?.clerk_org_id ? `/manage/subscriptions/${merchant.clerk_org_id}` : '/manage/billing'
  const deliveries: Array<Promise<void>> = [
    runSubscriptionNotificationDelivery({
      supabase: params.supabase, invoiceId: invoice.id, eventKey,
      channel: 'app_notification', recipient: `merchant:${invoice.merchant_id}`,
      deliver: async () => {
        const { error: insertError } = await params.supabase.from('app_notifications').insert({
          audience: 'merchant', merchant_id: invoice.merchant_id,
          notification_type: 'subscription_restored', title: 'Subscription billing restored',
          body, href: '/dashboard/subscriptions', metadata: { invoice_id: invoice.id, invoice_number: invoice.invoice_number },
        })
        if (insertError) throw new Error(insertError.message)
      },
    }),
    runSubscriptionNotificationDelivery({
      supabase: params.supabase, invoiceId: invoice.id, eventKey,
      channel: 'app_notification', recipient: 'hq',
      deliver: async () => {
        const { error: insertError } = await params.supabase.from('app_notifications').insert({
          audience: 'hq', merchant_id: invoice.merchant_id,
          notification_type: 'subscription_restored', title: `${merchantName} subscription restored`,
          body, href: hqHref, metadata: { invoice_id: invoice.id, invoice_number: invoice.invoice_number },
        })
        if (insertError) throw new Error(insertError.message)
      },
    }),
  ]

  const recipients = new Set([
    ...(billingEmail || merchant?.owner_email ? [(billingEmail || merchant?.owner_email || '').toLowerCase()] : []),
    ...parseEmails(Deno.env.get('BILLING_NOTIFICATION_EMAILS')),
    ...parseEmails(Deno.env.get('SUPPORT_TICKET_NOTIFICATION_EMAILS')),
    'support@mtechdistributors.com',
  ])
  for (const recipient of recipients) {
    deliveries.push(runSubscriptionNotificationDelivery({
      supabase: params.supabase, invoiceId: invoice.id, eventKey, channel: 'email', recipient,
      deliver: () => sendSubscriptionRestoredEmail({
        to: recipient, merchantName, locationName, invoiceNumber: invoice.invoice_number,
        totalAmount: Number(invoice.total_amount ?? 0),
      }),
    }))
  }
  const results = await Promise.allSettled(deliveries)
  const failures = results.filter((result) => result.status === 'rejected')
  if (failures.length) throw new Error(`${failures.length} restoration notification deliveries failed`)
}
