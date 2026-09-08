import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  'supabase/migrations/20260908120000_saas_admin_access_entitlements_and_authorizations.sql',
  'utf8',
)
const merchantActions = readFileSync('app/dashboard/actions/subscription-billing.ts', 'utf8')
const hqActions = readFileSync('app/manage/actions/subscription-billing.ts', 'utf8')
const qrActions = readFileSync('app/dashboard/online-ordering/actions.ts', 'utf8')
const chargeFunction = readFileSync('supabase/functions/billing-charge-subscription/index.ts', 'utf8')
const markPaidFunction = readFileSync('supabase/functions/billing-mark-paid/index.ts', 'utf8')
const webhookFunction = readFileSync('supabase/functions/valor-webhook/index.ts', 'utf8')

describe('SaaS admin completion contracts', () => {
  it('keeps past-due access available until explicit suspension', () => {
    expect(migration).toContain("v_status := 'past_due_grace'")
    expect(migration).toContain("v_reason := 'Payment is past due. Access remains available until suspension.'")
    expect(migration).not.toMatch(/elsif v_tier_status = 'past_due'[\s\S]{0,160}v_allowed := false/)
  })

  it('separates merchant-wide tier suspension from location suspension', () => {
    expect(migration).toContain("v_scope = 'merchant_tier' or s.location_id = v_subscription.location_id")
    expect(migration).toContain("v_scope = 'merchant_tier' or pt.location_id = v_subscription.location_id")
    expect(migration).toContain("blocker.metadata->>'billing_scope' = 'location'")
    expect(migration).toContain('sync_merchant_tier_billing_status')
    expect(migration).toContain("new.metadata->>'billing_scope' = 'merchant_tier'")
  })

  it('protects merchant authorization evidence from later mutation', () => {
    expect(migration).toContain('protect_subscription_service_request_authorization')
    expect(migration).toContain("raise exception 'Subscription service authorization evidence is immutable'")
    expect(migration).toContain("raise exception 'Subscription service authorization evidence cannot be deleted'")
    expect(migration).toContain('merchant_name_snapshot text not null')
    expect(merchantActions).toContain('merchant_name_snapshot: merchantName')
    expect(merchantActions).toContain('authorization_ip_address')
    expect(merchantActions).toContain('authorization_user_agent')
    expect(merchantActions).toContain("authorization_terms_version: 'merchant-addon-recurring-v1'")
  })

  it('charges before HQ finalizes add-on approval', () => {
    const chargeIndex = hqActions.indexOf('saveAndChargeMerchantSubscription({', hqActions.indexOf('reviewMerchantServiceRequest'))
    const approvedIndex = hqActions.indexOf("status: 'approved'", chargeIndex)
    expect(chargeIndex).toBeGreaterThan(0)
    expect(approvedIndex).toBeGreaterThan(chargeIndex)
    expect(hqActions).toContain("status: 'pending', reviewed_by: null")
  })

  it('uses the shared entitlement contract for QR access', () => {
    const gate = qrActions.slice(
      qrActions.indexOf('async function getQrBillingGateStatus'),
      qrActions.indexOf('async function computeOnlineStoreRequestRequirements'),
    )
    expect(gate).toContain('get_subscription_entitlement')
    expect(gate).not.toContain('list_subscription_service_assignments')
  })

  it('notifies recovery from direct charges and Valor recurring webhooks', () => {
    expect(chargeFunction).toContain('notifySubscriptionRestored')
    expect(markPaidFunction).toContain('notifySubscriptionRestored')
    expect(webhookFunction).toContain('notifySubscriptionRestored')
  })
})
