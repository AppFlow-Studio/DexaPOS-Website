'use client'

/**
 * Shared, dependency-light formatting + badge helpers for the HQ subscription
 * overview sections. Kept in one place so the overview components render tiers,
 * money, dates, and statuses consistently with the workspace.
 */
import type {
  MerchantSubscriptionRecord,
  SubscriptionInvoiceRecord,
  MerchantTierStatusRecord,
} from '@/app/manage/actions/subscription-billing'
import type { MerchantBillingProfileRecord } from '@/app/manage/actions/merchant-billing'

export type BadgeVariant = 'default' | 'secondary' | 'outline' | 'destructive'

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

export function tierStatusVariant(status: MerchantTierStatusRecord['subscription_status']): BadgeVariant {
  switch (status) {
    case 'active':
      return 'default'
    case 'past_due':
      return 'outline'
    case 'suspended':
      return 'destructive'
    default:
      return 'secondary'
  }
}

export function subscriptionStatusVariant(status: MerchantSubscriptionRecord['status']): BadgeVariant {
  switch (status) {
    case 'active':
      return 'default'
    case 'trial':
      return 'outline'
    case 'past_due':
    case 'suspended':
      return 'destructive'
    default:
      return 'secondary'
  }
}

export function invoiceStatusVariant(status: SubscriptionInvoiceRecord['status']): BadgeVariant {
  switch (status) {
    case 'paid':
      return 'default'
    case 'open':
    case 'processing':
      return 'outline'
    case 'failed':
      return 'destructive'
    default:
      return 'secondary'
  }
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
