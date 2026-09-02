import { describe, expect, it } from 'vitest'
import {
  buildAddSubscriptionBody,
  buildSubscriptionLifecycleRequest,
  buildUpdateSubscriptionBody,
} from '@/lib/payments/valor/subscriptionApi'

const baseParams = {
  money: { amountMinor: 9999, currency: 'USD' },
  interval: 'monthly' as const,
  chargeOn: 15,
  startsOn: new Date('2026-09-15T12:00:00.000Z'),
  vaultCustomerId: 'vault-123',
  paymentProfileId: 'payment-456',
  billingCustomerName: 'Test Merchant',
  billingZip: '85284',
  invoiceNo: 'SUB-00001',
  email: 'billing@example.com',
}

describe('Valor SaaS recurring request contract', () => {
  it('creates a monthly never-expiring schedule with an immediate first charge', () => {
    expect(buildAddSubscriptionBody(baseParams)).toMatchObject({
      amount: '99.99',
      txn_type: 'add_subscription',
      payment_info: {
        vault_id: 'vault-123',
        payment_id: 'payment-456',
      },
      recurring_type: '2',
      is_validate_card: '0',
      subscription_starts_from: '2026-09-15',
      charge_until: 'never_expired',
      charge_on: '15',
      surchargeIndicator: '0',
    })
  })

  it('replaces the payment profile and charges a past-due cycle through updateSub', () => {
    expect(
      buildUpdateSubscriptionBody({
        ...baseParams,
        subscriptionId: 'valor-sub-789',
      }),
    ).toMatchObject({
      txn_type: 'updateSubscription',
      subscription_id: 'valor-sub-789',
      amount: '99.99',
      is_validate_card: '0',
      failure_notification: '1',
      payment_info: {
        vault_id: 'vault-123',
        payment_id: 'payment-456',
      },
    })
  })

  it('supports validate-only card replacement without charging', () => {
    expect(
      buildUpdateSubscriptionBody({
        ...baseParams,
        subscriptionId: 'valor-sub-789',
        validateOnly: true,
      }).is_validate_card,
    ).toBe('1')
  })

  it.each([
    ['activate', '/?activateSub', 'activateSubscription'],
    ['deactivate', '/?de-Activate', 'deactivateSubscription'],
    ['delete', '/?deleteSub', 'deleteSubscription'],
  ] as const)(
    'builds the documented %s lifecycle request',
    (action, path, txnType) => {
      expect(
        buildSubscriptionLifecycleRequest(' valor-sub-789 ', action),
      ).toEqual({
        path,
        body: {
          txn_type: txnType,
          subscription_id: 'valor-sub-789',
        },
      })
    },
  )
})
