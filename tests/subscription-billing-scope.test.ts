import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  billingProfileMatchesSubscription,
  shouldRebindSubscriptionCard,
  isSubscriptionBillingHeld,
  subscriptionBillingScope,
} from '../supabase/functions/_shared/subscription-billing-scope'

const location = { merchant_id: 'merchant', location_id: 'a', metadata: { billing_scope: 'location' } }
const tier = { ...location, metadata: { billing_scope: 'merchant_tier' } }

describe('subscription billing card isolation', () => {
  it('holds both archived history and unreviewed replacements independently of card scope', () => {
    for (const metadata of [{ billing_scope: 'legacy' }, { billing_scope: 'location', billing_setup_required: true }, { billing_setup_required: 'true' }]) {
      expect(isSubscriptionBillingHeld(metadata)).toBe(true)
      expect(billingProfileMatchesSubscription({ ...location, metadata }, { merchant_id: 'merchant', location_id: 'a' })).toBe(false)
      expect(shouldRebindSubscriptionCard({ ...tier, metadata, billing_profile_id: 'old' }, null, ['old'])).toBe(false)
    }
    expect(subscriptionBillingScope({ billing_scope: 'legacy' })).toBe('legacy')
    expect(isSubscriptionBillingHeld({ billing_scope: 'location', billing_setup_required: false })).toBe(false)
    expect(isSubscriptionBillingHeld(null)).toBe(false)
  })

  it('blocks historical charges before credentials, claims, and external requests', () => {
    const charge = readFileSync('supabase/functions/billing-charge-subscription/index.ts', 'utf8')
    const guard = charge.indexOf('if (isSubscriptionBillingHeld(subscription.metadata))')
    expect(guard).toBeGreaterThan(0)
    expect(guard).toBeLessThan(charge.indexOf('const { data: billingProfile'))
    for (const path of ['billing-generate-monthly-invoices', 'billing-suspend-overdue', 'billing-handle-failure', 'valor-webhook']) {
      expect(readFileSync(`supabase/functions/${path}/index.ts`, 'utf8')).toContain('isSubscriptionBillingHeld(subscription.metadata)')
    }
    expect(readFileSync('supabase/functions/billing-retry-due-invoices/index.ts', 'utf8')).toContain(".neq('merchant_subscriptions.status', 'canceled')")
  })
  it('allows the location card but rejects global, another location, and another merchant cards', () => {
    expect(billingProfileMatchesSubscription(location, { merchant_id: 'merchant', location_id: 'a' })).toBe(true)
    for (const profile of [
      { merchant_id: 'merchant', location_id: null },
      { merchant_id: 'merchant', location_id: 'b' },
      { merchant_id: 'other', location_id: 'a' },
    ]) expect(billingProfileMatchesSubscription(location, profile)).toBe(false)
  })

  it('allows a merchant tier to use its anchor card or merchant-wide card only', () => {
    expect(billingProfileMatchesSubscription(tier, { merchant_id: 'merchant', location_id: null })).toBe(true)
    expect(billingProfileMatchesSubscription(tier, { merchant_id: 'merchant', location_id: 'a' })).toBe(true)
    expect(billingProfileMatchesSubscription(tier, { merchant_id: 'merchant', location_id: 'b' })).toBe(false)
  })

  it('treats missing metadata as location scope, not permission to charge a global card', () => {
    expect(billingProfileMatchesSubscription({ ...location, metadata: undefined }, { merchant_id: 'merchant', location_id: null })).toBe(false)
  })

  it('merchant card replacement does not move any location subscriptions', () => {
    expect(shouldRebindSubscriptionCard({ ...location, billing_profile_id: 'global-old' }, null, ['global-old'])).toBe(false)
    expect(shouldRebindSubscriptionCard({ ...tier, billing_profile_id: 'a-old' }, null, ['global-old'])).toBe(true)
  })

  it('location card replacement stays local and only updates a tier already linked to that card', () => {
    expect(shouldRebindSubscriptionCard({ ...location, billing_profile_id: 'a-old' }, 'a', ['a-old'])).toBe(true)
    expect(shouldRebindSubscriptionCard({ ...location, location_id: 'b', billing_profile_id: 'b-old' }, 'a', ['a-old'])).toBe(false)
    expect(shouldRebindSubscriptionCard({ ...tier, billing_profile_id: 'a-old' }, 'a', ['a-old'])).toBe(true)
    expect(shouldRebindSubscriptionCard({ ...tier, billing_profile_id: 'global' }, 'a', ['a-old'])).toBe(false)
  })

  it('guards charging and card replacement at their external API boundaries', () => {
    const charge = readFileSync('supabase/functions/billing-charge-subscription/index.ts', 'utf8')
    expect(charge.indexOf('!billingProfileMatchesSubscription')).toBeLessThan(charge.indexOf('const processorAccountId'))
    const save = readFileSync('app/manage/actions/merchant-billing.ts', 'utf8')
    expect(save).toContain('shouldRebindSubscriptionCard(subscription, locationId')
    expect(save).toContain(".in('id', subscriptions.map((subscription) => subscription.id))")
  })
})
