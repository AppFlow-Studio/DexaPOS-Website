import { describe, expect, it } from 'vitest'
import {
  formatBillingCard,
  formatCardExpiry,
  normalizeBillingCardBrand,
  readCardLastFour,
} from '../card-display'

describe('normalizeBillingCardBrand', () => {
  it('rejects values that describe a card type rather than a brand', () => {
    // 'credit-card' is what Passage.js reports as the payment method; 'C' / 'D'
    // are Valor's card_type. Both were being stored as the brand.
    for (const generic of ['credit-card', 'Credit-Card', 'credit card', 'credit', 'debit', 'card', 'C', 'D', 'c', 'debit_card']) {
      expect(normalizeBillingCardBrand(generic)).toBeNull()
    }
  })

  it('returns null for a missing brand', () => {
    expect(normalizeBillingCardBrand(null)).toBeNull()
    expect(normalizeBillingCardBrand(undefined)).toBeNull()
    expect(normalizeBillingCardBrand('   ')).toBeNull()
  })

  it('normalises real brands to one display label', () => {
    expect(normalizeBillingCardBrand('Visa')).toBe('Visa')
    expect(normalizeBillingCardBrand('VISA')).toBe('Visa')
    expect(normalizeBillingCardBrand(' visa ')).toBe('Visa')
    expect(normalizeBillingCardBrand('MASTERCARD')).toBe('Mastercard')
    expect(normalizeBillingCardBrand('MC')).toBe('Mastercard')
    expect(normalizeBillingCardBrand('discover')).toBe('Discover')
  })

  it('spells American Express out in full', () => {
    expect(normalizeBillingCardBrand('Amex')).toBe('American Express')
    expect(normalizeBillingCardBrand('AMEX')).toBe('American Express')
    expect(normalizeBillingCardBrand('American Express')).toBe('American Express')
    expect(normalizeBillingCardBrand('AMERICAN_EXPRESS')).toBe('American Express')
  })

  it('keeps a brand it does not recognise rather than dropping it', () => {
    expect(normalizeBillingCardBrand('Troy')).toBe('Troy')
  })
})

describe('readCardLastFour', () => {
  it('reads the last four from a masked card number', () => {
    expect(readCardLastFour('XXXX1111')).toBe('1111')
    expect(readCardLastFour('**** **** **** 4242')).toBe('4242')
  })

  it('reads the last four from a masked number that contains spaces', () => {
    expect(readCardLastFour('3782 XXXX XXXX 0005')).toBe('0005')
  })

  it('accepts a bare last four', () => {
    expect(readCardLastFour('1111')).toBe('1111')
  })

  it('returns null when there are not four digits to show', () => {
    expect(readCardLastFour(null)).toBeNull()
    expect(readCardLastFour('')).toBeNull()
    expect(readCardLastFour('XXXX')).toBeNull()
    expect(readCardLastFour('111')).toBeNull()
  })
})

describe('formatCardExpiry', () => {
  it('formats as MM/YY', () => {
    expect(formatCardExpiry(4, 2027)).toBe('04/27')
    expect(formatCardExpiry(12, 2030)).toBe('12/30')
  })

  it('needs both halves', () => {
    expect(formatCardExpiry(4, null)).toBeNull()
    expect(formatCardExpiry(null, 2027)).toBeNull()
    expect(formatCardExpiry()).toBeNull()
  })
})

describe('formatBillingCard', () => {
  it('shows brand and last four when both are known', () => {
    expect(
      formatBillingCard({ card_brand: 'Visa', card_last_four: '1111' }).label,
    ).toBe('Visa •••• 1111')
  })

  it('renders the production Amex card as reported by the webhook', () => {
    expect(
      formatBillingCard({
        card_brand: normalizeBillingCardBrand('Amex'),
        card_last_four: readCardLastFour('3782 XXXX XXXX 0005'),
      }).label,
    ).toBe('American Express •••• 0005')
  })

  it('never shows a masked placeholder for an unknown last four', () => {
    // The reported bug: this row rendered as "Credit-Card •••• ••••".
    const card = formatBillingCard({
      card_brand: 'credit-card',
      card_last_four: null,
      card_exp_month: null,
      card_exp_year: null,
    })
    expect(card.label).toBe('Card')
    expect(card.label).not.toContain('•')
    expect(card.detail).toBe('Card on file')
  })

  it('shows just the brand when only the last four is unknown', () => {
    expect(formatBillingCard({ card_brand: 'Visa', card_last_four: null }).label).toBe('Visa')
  })

  it('falls back to "Card" when a stored brand is a generic type', () => {
    expect(
      formatBillingCard({ card_brand: 'credit-card', card_last_four: '1111' }).label,
    ).toBe('Card •••• 1111')
  })

  it('shows the expiry only when it is known', () => {
    const known = formatBillingCard({
      card_brand: 'Visa',
      card_last_four: '1111',
      card_exp_month: 4,
      card_exp_year: 2027,
    })
    expect(known.expiry).toBe('04/27')
    expect(known.detail).toBe('Expires 04/27')

    const unknown = formatBillingCard({ card_brand: 'Visa', card_last_four: '1111' })
    expect(unknown.expiry).toBeNull()
    expect(unknown.detail).toBe('Card on file')
  })

  it('treats half an expiry as unknown', () => {
    expect(
      formatBillingCard({ card_brand: 'Visa', card_last_four: '1111', card_exp_month: 4 }).detail,
    ).toBe('Card on file')
  })
})
