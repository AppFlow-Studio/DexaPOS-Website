import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

const merchantActions = read('app/dashboard/actions/subscription-billing.ts')
const merchantOverview = read(
  'components/billing/MerchantSubscriptionOverviewCard.tsx',
)
const migration = read(
  'supabase/migrations/20260824140000_subscription_authorizations_and_failure_notifications.sql',
)
const graceRetryMigration = read(
  'supabase/migrations/20260830120000_subscription_billing_grace_and_retry_foundation.sql',
)
const valorLifecycleMigration = read(
  'supabase/migrations/20260830130000_valor_saas_billing_lifecycle.sql',
)
const internalAuth = read(
  'supabase/functions/_shared/internal-billing-auth.ts',
)
const failureNotifications = read(
  'supabase/functions/_shared/subscription-failure-notifications.ts',
)
const paymentEmails = read('supabase/functions/_shared/payment-emails.ts')

const protectedBillingFunctions = [
  'billing-charge-subscription',
  'billing-handle-failure',
  'billing-suspend-overdue',
  'billing-mark-paid',
  'billing-generate-monthly-invoices',
  'billing-retry-due-invoices',
].map((name) => read(`supabase/functions/${name}/index.ts`))

describe('subscription billing safety and authorization contract', () => {
  it('requires internal authorization on every service-role billing function', () => {
    expect(internalAuth).toContain('SUPABASE_SERVICE_ROLE_KEY')
    expect(internalAuth).toContain('INTERNAL_NOTIFICATION_SECRET')
    expect(internalAuth).toContain("request.headers.get('x-internal-secret')")

    for (const edgeFunction of protectedBillingFunctions) {
      expect(edgeFunction).toContain('isAuthorizedInternalBillingRequest')
      expect(edgeFunction).toContain("error: 'Unauthorized'")
      expect(edgeFunction).toContain('x-internal-secret')
    }
  })

  it('requires explicit recurring-charge consent in both UI and server action', () => {
    expect(merchantOverview).toContain('id="plan-charge-authorization"')
    expect(merchantOverview).toContain('!hasAcceptedPlanAuthorization')
    expect(merchantOverview).toContain(
      'accepted: hasAcceptedPlanAuthorization',
    )
    expect(merchantActions).toContain('if (!authorization?.accepted)')
    expect(merchantActions).toContain('authorization_terms_version')
    expect(merchantActions).toContain('authorization_ip_address')
    expect(merchantActions).toContain('authorization_user_agent')
    expect(merchantActions).toContain('requested_by_email: requestedByEmail')
  })

  it('stores immutable authorization evidence and an idempotent delivery ledger', () => {
    expect(migration).toContain('authorization_reference text')
    expect(migration).toContain('authorization_accepted_at timestamptz')
    expect(migration).toContain('authorized_price_cents integer')
    expect(migration).toContain(
      'protect_subscription_plan_request_authorization',
    )
    expect(migration).toContain(
      'create table if not exists public.subscription_billing_notification_deliveries',
    )
    expect(migration).toContain(
      'unique (invoice_id, event_key, channel, recipient)',
    )
    expect(migration).toContain('force row level security')
  })

  it('notifies merchant and HQ on every new failed payment attempt', () => {
    expect(failureNotifications).toContain(
      "notification_type: 'subscription_payment_failed'",
    )
    expect(failureNotifications).toContain("audience: 'merchant'")
    expect(failureNotifications).toContain("audience: 'hq'")
    expect(failureNotifications).toContain('support@mtechdistributors.com')
    expect(failureNotifications).toContain(
      'SUPPORT_TICKET_NOTIFICATION_EMAILS',
    )
    expect(paymentEmails).toContain(
      'export async function sendSubscriptionPaymentFailedEmail',
    )
    expect(protectedBillingFunctions[0]).toContain(
      'notifySubscriptionPaymentFailure',
    )
    expect(protectedBillingFunctions[1]).toContain(
      'notifySubscriptionPaymentFailure',
    )
  })

  it('uses Valor for card setup, native recurring schedules, and recovery', () => {
    const merchantBilling = read('app/manage/actions/merchant-billing.ts')
    const manageActions = read('app/manage/actions/subscription-billing.ts')
    const billingSetup = read('components/billing/MerchantBillingSetupCard.tsx')
    const hqWorkspace = read('components/billing/HqSubscriptionsWorkspace.tsx')
    const billingAdmin = read('components/billing/SubscriptionBillingAdminCard.tsx')
    const chargeFunction = protectedBillingFunctions[0]
    const retryWorker = protectedBillingFunctions[5]
    const valorWebhook = read('supabase/functions/valor-webhook/index.ts')

    expect(merchantBilling).toContain("'subscription'")
    expect(merchantBilling).toContain('createCustomerProfile')
    expect(merchantBilling).toContain('attachPaymentProfile')
    expect(merchantBilling).toContain('updateSubscription')
    expect(billingSetup).toContain('PassageCheckout')
    expect(chargeFunction).toContain('createRecurringSubscription')
    expect(chargeFunction).toContain('updateRecurringSubscription')
    expect(chargeFunction).toContain("'manual' | 'automatic' | 'configuration'")
    expect(chargeFunction).toContain("body.mode === 'configuration'")
    expect(chargeFunction).toContain(".eq('purpose', 'subscription')")
    expect(chargeFunction).not.toContain("../_shared/nmi.ts")
    expect(chargeFunction).toContain('valor_native_schedule_owns_retry')
    expect(retryWorker).toContain("mode: 'automatic'")
    expect(valorWebhook).toContain('valor_recurring_webhook_events')
    expect(valorWebhook).toContain('notifySubscriptionPaymentFailure')
    expect(valorWebhook).toContain("'generate_subscription_invoice'")
    expect(valorWebhook).toContain(".eq('processor_transaction_id', transactionId)")
    expect(merchantBilling).toContain(
      'Cards must be tokenized and stored through the Valor payment form.',
    )
    expect(hqWorkspace).not.toContain('getMerchantNmiAccountsSummary')
    expect(billingAdmin).not.toContain('getMerchantNmiAccountsSummary')
    expect(manageActions).toContain('saveAndChargeMerchantSubscription')
    expect(manageActions).toContain("'configuration'")
    expect(manageActions).toContain(
      'Valor did not approve the payment, so the subscription was not activated or updated.',
    )
    expect(hqWorkspace).toContain('Save & Charge')
    expect(billingAdmin).toContain('Create & Charge')
    expect(valorLifecycleMigration).toContain('processor_subscription_id text')
    expect(valorLifecycleMigration).toContain(
      'alter table public.valor_recurring_webhook_events enable row level security',
    )
  })

  it('keeps merchant invoices read-only while Valor billing runs automatically', () => {
    expect(merchantActions).not.toContain(
      'export async function payMerchantSubscriptionInvoice',
    )
    expect(merchantOverview).toContain('Update payment method')
    expect(merchantOverview).not.toContain('Pay now')
    expect(merchantOverview).toContain('charged automatically')
  })

  it('persists retry scheduling and enforces HQ grace periods during suspension', () => {
    const chargeFunction = protectedBillingFunctions[0]
    const suspendFunction = protectedBillingFunctions[2]
    const retryWorker = protectedBillingFunctions[5]

    expect(graceRetryMigration).toContain('grace_period_ends_at timestamptz')
    expect(graceRetryMigration).toContain('next_retry_at timestamptz')
    expect(graceRetryMigration).toContain(
      'idx_subscription_invoices_retry_due',
    )
    expect(chargeFunction).toContain('invoice_claim_conflict')
    expect(chargeFunction).toContain('valor_native_schedule_owns_retry')
    expect(suspendFunction).toContain('grace_period_ends_at')
    expect(retryWorker).toContain(".eq('status', 'failed')")
    expect(retryWorker).toContain(".lte('next_retry_at'")
  })
})
