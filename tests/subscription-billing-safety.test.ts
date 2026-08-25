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
})

