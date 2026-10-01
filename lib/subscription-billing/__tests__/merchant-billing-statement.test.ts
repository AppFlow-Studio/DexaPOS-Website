import { describe, expect, it } from 'vitest'
import {
  cardFee,
  describePaymentFailure,
  estimateNextCharge,
  groupInvoicesByMonth,
  serviceSubtotal,
} from '../merchant-billing-statement'

const ONLINE_ORDERING = {
  pricing_model: 'flat' as const,
  base_price_monthly: 100,
  additional_unit_price: null,
  included_quantity: 1,
  card_surcharge_pct: 4,
}

const KDS = {
  pricing_model: 'per_unit' as const,
  base_price_monthly: 20,
  additional_unit_price: null,
  included_quantity: 0,
  card_surcharge_pct: 5,
}

describe('serviceSubtotal', () => {
  it('prices flat, per-unit and tiered add-ons', () => {
    expect(serviceSubtotal(ONLINE_ORDERING, 3)).toBe(100)
    expect(serviceSubtotal(KDS, 3)).toBe(60)
    expect(
      serviceSubtotal(
        { pricing_model: 'tiered', base_price_monthly: 50, additional_unit_price: 10, included_quantity: 2, card_surcharge_pct: 0 },
        5,
      ),
    ).toBe(80)
  })
})

describe('cardFee', () => {
  it('is a percentage of the subtotal, rounded to cents', () => {
    expect(cardFee(180, 4, 'card')).toBe(7.2)
    expect(cardFee(177, 4, 'card')).toBe(7.08)
  })

  it('is waived for ACH and for nothing owed', () => {
    expect(cardFee(180, 4, 'ach')).toBe(0)
    expect(cardFee(0, 4, 'card')).toBe(0)
  })
})

describe('estimateNextCharge', () => {
  const base = {
    tierSubtotal: 180,
    tierSurchargePct: 4,
    tierBillingMethod: 'card' as const,
    servicesById: { oo: ONLINE_ORDERING, kds: KDS },
    locationBillingMethod: () => 'card' as const,
  }

  it('adds the card fee to the tier, not just to add-ons', () => {
    const estimate = estimateNextCharge({ ...base, assignments: [] })
    expect(estimate.tier).toEqual({ subtotal: 180, fee: 7.2, total: 187.2 })
    expect(estimate.total).toBe(187.2)
  })

  it('charges each location at the highest rate among its add-ons', () => {
    const estimate = estimateNextCharge({
      ...base,
      assignments: [
        { location_id: 'uptown', service_id: 'oo', quantity: 1 },
        { location_id: 'uptown', service_id: 'kds', quantity: 2 },
      ],
    })
    // (100 + 40) × 5% = 7.00
    expect(estimate.locations.uptown).toEqual({ subtotal: 140, fee: 7, total: 147, addOnCount: 2 })
    expect(estimate.addOnSubtotal).toBe(140)
    expect(estimate.fee).toBe(14.2)
    expect(estimate.total).toBe(334.2)
  })

  it('ignores assignments with no catalogue service', () => {
    const estimate = estimateNextCharge({
      ...base,
      assignments: [{ location_id: 'uptown', service_id: 'gone', quantity: 1 }],
    })
    expect(estimate.addOnCount).toBe(0)
    expect(estimate.locations).toEqual({})
  })

  it('takes no fee from a location paying by ACH', () => {
    const estimate = estimateNextCharge({
      ...base,
      tierSubtotal: 0,
      assignments: [{ location_id: 'uptown', service_id: 'oo', quantity: 1 }],
      locationBillingMethod: () => 'ach',
    })
    expect(estimate.fee).toBe(0)
    expect(estimate.total).toBe(100)
  })
})

describe('describePaymentFailure', () => {
  it('never passes the raw processor text through', () => {
    const raw =
      'Valor returned HTTP 200 with an empty response body — recurring not confirmed; this EPI may not be provisioned for native recurring'
    const reason = describePaymentFailure(raw)
    expect(reason.kind).toBe('processor')
    expect(reason.message).not.toMatch(/valor|epi|http/i)
  })

  it('recognises card problems before the processor catch-all', () => {
    expect(describePaymentFailure('Valor: Card declined (05 Do Not Honor)').kind).toBe('card')
    expect(describePaymentFailure('Insufficient funds').message).toMatch(/insufficient funds/)
    expect(describePaymentFailure('Expired card').message).toMatch(/expired/)
    expect(describePaymentFailure('AVS mismatch').message).toMatch(/ZIP/)
  })

  it('falls back to a neutral sentence', () => {
    expect(describePaymentFailure(null).kind).toBe('unknown')
    expect(describePaymentFailure('   ').kind).toBe('unknown')
    expect(describePaymentFailure('E1234 xyz').message).toBe("The payment didn't go through.")
  })
})

describe('groupInvoicesByMonth', () => {
  const invoice = (billing_period_start: string | null, created_at: string, status: string, total_amount: number) => ({
    billing_period_start,
    created_at,
    status,
    total_amount,
  })

  it('groups by billing month, newest first, with billed and unpaid totals', () => {
    const groups = groupInvoicesByMonth([
      invoice('2026-08-01', '2026-08-01T10:00:00Z', 'paid', 180),
      invoice('2026-09-01', '2026-09-11T10:00:00Z', 'failed', 184.08),
      invoice('2026-09-01', '2026-09-13T10:00:00Z', 'paid', 212.16),
      invoice('2026-09-01', '2026-09-14T10:00:00Z', 'voided', 50),
    ])

    expect(groups.map((group) => group.label)).toEqual(['September 2026', 'August 2026'])
    expect(groups[0]).toMatchObject({ billed: 396.24, unpaid: 184.08, failedCount: 1 })
    expect(groups[0].invoices[0].created_at).toBe('2026-09-14T10:00:00Z')
  })

  it('reads the month off the string, not through a timezone', () => {
    expect(groupInvoicesByMonth([invoice('2026-09-01', '2026-08-31T23:00:00Z', 'paid', 1)])[0].label).toBe(
      'September 2026',
    )
  })

  it('falls back to created_at when the period is missing', () => {
    expect(groupInvoicesByMonth([invoice(null, '2026-07-04T00:00:00Z', 'paid', 1)])[0].key).toBe('2026-07')
  })
})
