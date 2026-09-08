import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { isMerchantBillingExemptionActive } from '../supabase/functions/_shared/merchant-billing-exemption'

const read = (path: string) => readFileSync(path, 'utf8')
const migration = read('supabase/migrations/20260908130000_merchant_billing_exemption.sql')
const hqActions = read('app/manage/actions/subscription-billing.ts')
const hqWorkspace = read('components/billing/HqSubscriptionsWorkspace.tsx')
const chargeWorker = read('supabase/functions/billing-charge-subscription/index.ts')
const invoiceWorker = read('supabase/functions/billing-generate-monthly-invoices/index.ts')
const failureWorker = read('supabase/functions/billing-handle-failure/index.ts')
const suspensionWorker = read('supabase/functions/billing-suspend-overdue/index.ts')
const valorWebhook = read('supabase/functions/valor-webhook/index.ts')

describe('merchant billing exemption', () => {
  it('honors optional expiration and fails closed on invalid dates', () => {
    const now = new Date('2026-09-08T12:00:00.000Z')

    expect(isMerchantBillingExemptionActive({ billing_exempt: true }, now)).toBe(true)
    expect(isMerchantBillingExemptionActive({
      billing_exempt: true,
      billing_exempt_expires_at: '2026-09-08T12:01:00.000Z',
    }, now)).toBe(true)
    expect(isMerchantBillingExemptionActive({
      billing_exempt: true,
      billing_exempt_expires_at: '2026-09-08T11:59:00.000Z',
    }, now)).toBe(false)
    expect(isMerchantBillingExemptionActive({
      billing_exempt: true,
      billing_exempt_expires_at: 'not-a-date',
    }, now)).toBe(false)
  })

  it('keeps cancellation and merchant suspension authoritative', () => {
    const merchantBlock = migration.indexOf("v_merchant_status in ('suspended'")
    const canceledTierBlock = migration.indexOf("v_tier_status in ('cancelled', 'canceled')")
    const exemptionBlock = migration.indexOf('elsif v_billing_exempt then')

    expect(merchantBlock).toBeGreaterThan(0)
    expect(canceledTierBlock).toBeGreaterThan(merchantBlock)
    expect(exemptionBlock).toBeGreaterThan(canceledTierBlock)
    expect(migration).toContain("v_entitled := coalesce((v_access->>'allowed')::boolean, false) and (v_direct or v_plan)")
    expect(migration).toContain('guard_billing_exempt_invoice_creation')
  })

  it('pauses native Valor schedules before enabling the exemption', () => {
    const pauseIndex = hqActions.indexOf("await syncValorSubscriptionLifecycle({")
    const rpcIndex = hqActions.indexOf("serviceRole.rpc('set_merchant_billing_exemption'")

    expect(pauseIndex).toBeGreaterThan(0)
    expect(rpcIndex).toBeGreaterThan(pauseIndex)
    expect(hqActions).toContain('force: true')
    expect(hqActions).toContain('needs manual verification after rollback')
    expect(hqActions).toContain('p_actor_user_id: userId')
    expect(migration).toContain("else public.current_user_id()")
    expect(migration).toContain('Deactivate active Valor recurring schedules before enabling the billing exemption')
  })

  it('skips every automatic billing enforcement path', () => {
    for (const source of [chargeWorker, invoiceWorker, failureWorker, valorWebhook]) {
      expect(source).toContain('loadMerchantBillingExemption')
      expect(source).toContain('merchant_billing_exempt')
    }
    expect(suspensionWorker).toContain('loadMerchantBillingExemption')
    expect(suspensionWorker).toContain('if (billingExemption.active) continue')
    expect(invoiceWorker).toContain('advance_billing_exempt_subscription')
  })

  it('exposes a reasoned HQ control and prevents manual billing actions', () => {
    expect(hqWorkspace).toContain('Merchant billing exemption')
    expect(hqWorkspace).toContain('billingExemptionReason.trim().length < 5')
    expect(hqWorkspace).toContain('Disable the merchant billing exemption before generating an invoice.')
    expect(hqWorkspace).toContain('Existing invoices remain available for records but cannot be charged.')
    expect(hqActions).toContain('Complimentary access - no payment due')
  })
})
