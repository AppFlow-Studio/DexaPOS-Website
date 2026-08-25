import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260824120000_subscription_plan_requests_and_app_notifications.sql',
  ),
  'utf8',
)
const merchantActions = readFileSync(
  resolve(process.cwd(), 'app/dashboard/actions/subscription-billing.ts'),
  'utf8',
)
const hardwareMigration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260824130000_subscription_hardware_requests.sql',
  ),
  'utf8',
)
const merchantOverview = readFileSync(
  resolve(
    process.cwd(),
    'components/billing/MerchantSubscriptionOverviewCard.tsx',
  ),
  'utf8',
)
const hqWorkspace = readFileSync(
  resolve(process.cwd(), 'components/billing/HqSubscriptionsWorkspace.tsx'),
  'utf8',
)
const hqActions = readFileSync(
  resolve(process.cwd(), 'app/manage/actions/subscription-billing.ts'),
  'utf8',
)
const notificationActions = readFileSync(
  resolve(process.cwd(), 'app/actions/read-only-notifications.ts'),
  'utf8',
)

describe('subscription request and read-only notification contract', () => {
  it('creates a dedicated request lifecycle with one pending request per merchant', () => {
    expect(migration).toContain(
      'create table if not exists public.subscription_plan_requests',
    )
    expect(migration).toContain(
      "check (status in ('pending', 'approved', 'denied', 'cancelled'))",
    )
    expect(migration).toContain(
      'idx_subscription_plan_requests_one_pending_per_merchant',
    )
    expect(migration).toContain("where status = 'pending'")
    expect(merchantActions).toContain(
      'requested_plan_id, status, created_at, metadata',
    )
    expect(merchantActions).toContain(
      'requested_at: pendingTierRequestResult.data.created_at',
    )
  })

  it('creates tenant-scoped read-only notifications and per-user read state', () => {
    expect(migration).toContain(
      'create table if not exists public.app_notifications',
    )
    expect(migration).toContain(
      'create table if not exists public.app_notification_reads',
    )
    expect(migration).toContain(
      "public.hq_has_permission('system.billing.manage')",
    )
    expect(migration).toContain('public.user_belongs_to_merchant(merchant_id)')
    expect(migration).toContain('public.current_user_id()')
    expect(migration).toContain("set search_path = 'public', 'pg_temp'")
  })

  it('keeps subscription requests out of the support-ticket workflow', () => {
    const merchantRequestAction = merchantActions.slice(
      merchantActions.indexOf('export async function RequestMerchantTierPlan'),
    )

    expect(merchantRequestAction).toContain(
      ".from('subscription_plan_requests')",
    )
    expect(merchantRequestAction).toContain("audience: 'hq'")
    expect(merchantRequestAction).not.toContain('CreateTicket(')
    expect(hqActions).toContain('requestId?: string')
    expect(hqActions).toContain(
      'subscriptionChanged || Boolean(params.requestId)',
    )
    expect(hqActions).toContain(
      "pendingRequestQuery.eq('id', params.requestId)",
    )
    expect(hqActions).toContain('if (!subscriptionChanged && params.requestId)')
    expect(hqActions).toContain(
      'appliedMerchantPlanSubscriptionId: result.data.id as string',
    )
    expect(hqActions).not.toContain(
      'appliedSubscriptionId: synced.anchorSubscriptionId',
    )
    expect(hqWorkspace).toContain('requestId: requestIdOverride')
    expect(hqWorkspace).toContain('pendingMerchantTierRequest.id')
    expect(hqActions).toContain('without generating a')
    expect(hqActions).toContain(
      "notificationType: 'subscription_plan_request_denied'",
    )
    expect(hqActions).not.toContain('p_subject: `Subscription updated:')
  })

  it('scopes merchant notifications to the active impersonation session', () => {
    expect(notificationActions).toContain('getEffectiveMerchantContext(null)')
    expect(notificationActions).toContain(
      'context.isImpersonating ? context : null',
    )
    expect(notificationActions).toContain(".eq('audience', 'merchant')")
    expect(notificationActions).toContain(
      ".eq('merchant_id', impersonatedMerchant.merchantId)",
    )
  })

  it('keeps merchant billing merchant-wide while hardware remains location scoped', () => {
    expect(merchantActions).toContain('primaryBillingProfile')
    expect(merchantActions).toContain(
      ".order('created_at', { ascending: true })",
    )
    expect(merchantOverview).toContain('Merchant Payment Method')
    expect(merchantOverview).toContain(
      'Merchant-wide subscription payment activity',
    )
    expect(merchantOverview).not.toContain('selectedInvoices')
    expect(merchantOverview).not.toContain(
      'id="merchant-subscriptions-location"',
    )
    expect(merchantOverview).toContain('id="hardware-request-location"')
  })

  it('creates location-scoped hardware requests with independent HQ review', () => {
    expect(hardwareMigration).toContain(
      'create table if not exists public.subscription_hardware_requests',
    )
    expect(hardwareMigration).toContain(
      'idx_subscription_hardware_requests_one_pending_per_location',
    )
    expect(hardwareMigration).toContain('(merchant_id, location_id)')
    expect(hardwareMigration).toContain(
      "public.hq_has_permission('system.billing.manage')",
    )
    expect(merchantActions).toContain(
      'export async function RequestSubscriptionHardware',
    )
    expect(merchantActions).toContain("'subscription_hardware_requested'")
    expect(hqActions).toContain(
      'export async function getPendingMerchantHardwareRequests',
    )
    expect(hqActions).toContain(
      'export async function approveMerchantHardwareRequest',
    )
    expect(hqActions).toContain(
      'export async function denyMerchantHardwareRequest',
    )
    expect(hqWorkspace).toContain('Pending hardware requests')
    expect(hqWorkspace).toContain('handleHardwareRequestDecision')
  })
})
