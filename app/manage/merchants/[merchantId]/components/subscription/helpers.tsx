'use client'

/**
 * Shared, dependency-light formatting helpers for the HQ subscription overview
 * sections. Kept in one place so the overview components render tiers, money,
 * and dates consistently with the workspace.
 *
 * Statuses render as one neutral `<Badge variant="outline">` whatever the
 * value — the word carries the meaning (UI-DESIGN-SYSTEM §4.6b).
 */
import type { MerchantBillingProfileRecord } from '@/app/manage/actions/merchant-billing'

export function formatMoney(amount: number | null | undefined): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(amount || 0))
}

export function formatTierPrice(monthlyPriceCents: number | null | undefined): string {
  const cents = Number(monthlyPriceCents || 0)
  if (!cents) return 'Contact for pricing'
  return formatMoney(cents / 100)
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return '—'
  const value = new Date(date)
  if (Number.isNaN(value.getTime())) return '—'
  return value.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function buildPaymentMethodLabel(profile: MerchantBillingProfileRecord | null | undefined): string {
  if (!profile) return 'No card on file'

  if (profile.billing_method === 'card') {
    const brand = profile.card_brand || 'Card'
    const suffix = profile.card_last_four ? `•••• ${profile.card_last_four}` : ''
    const exp =
      profile.card_exp_month && profile.card_exp_year
        ? ` · ${String(profile.card_exp_month).padStart(2, '0')}/${String(profile.card_exp_year).slice(-2)}`
        : ''
    return `${[brand, suffix].filter(Boolean).join(' ')}${exp}`
  }

  if (profile.billing_method === 'ach') {
    const bank = profile.bank_name || 'Bank account'
    const suffix = profile.account_number_last_four ? `•••• ${profile.account_number_last_four}` : ''
    return [bank, suffix].filter(Boolean).join(' ')
  }

  return 'No billing profile'
}
