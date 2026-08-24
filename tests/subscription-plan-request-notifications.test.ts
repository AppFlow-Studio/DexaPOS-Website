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
const hqActions = readFileSync(
  resolve(process.cwd(), 'app/manage/actions/subscription-billing.ts'),
  'utf8',
)

describe('subscription request and read-only notification contract', () => {
  it('creates a dedicated request lifecycle with one pending request per merchant', () => {
    expect(migration).toContain('create table if not exists public.subscription_plan_requests')
    expect(migration).toContain("check (status in ('pending', 'approved', 'denied', 'cancelled'))")
    expect(migration).toContain('idx_subscription_plan_requests_one_pending_per_merchant')
    expect(migration).toContain("where status = 'pending'")
  })

  it('creates tenant-scoped read-only notifications and per-user read state', () => {
    expect(migration).toContain('create table if not exists public.app_notifications')
    expect(migration).toContain('create table if not exists public.app_notification_reads')
    expect(migration).toContain("public.hq_has_permission('system.billing.manage')")
    expect(migration).toContain('public.user_belongs_to_merchant(merchant_id)')
    expect(migration).toContain('public.current_user_id()')
    expect(migration).toContain('set search_path = \'public\', \'pg_temp\'')
  })

  it('keeps subscription requests out of the support-ticket workflow', () => {
    const merchantRequestAction = merchantActions.slice(
      merchantActions.indexOf('export async function RequestMerchantTierPlan'),
    )

    expect(merchantRequestAction).toContain(".from('subscription_plan_requests')")
    expect(merchantRequestAction).toContain("audience: 'hq'")
    expect(merchantRequestAction).not.toContain('CreateTicket(')
    expect(hqActions).toContain("notificationType: 'subscription_plan_request_denied'")
    expect(hqActions).not.toContain("p_subject: `Subscription updated:")
  })
})
