'use server'

import { auth } from '@clerk/nextjs/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import {
  formatLongDate,
  formatShortDateRange,
  formatUsd,
  type SubscriptionInvoiceDocumentData,
  type SubscriptionInvoiceLineItem,
} from '@/lib/subscription-billing/invoice-template'

export interface MerchantSubscriptionViewRecord {
  id: string
  merchant_id: string
  location_id: string
  location_name: string
  current_period_start: string
  current_period_end: string
  next_billing_date: string
  station_count: number
  monthly_amount: number
  status: 'trial' | 'active' | 'past_due' | 'suspended' | 'canceled'
  trial_ends_at: string | null
  canceled_at: string | null
  cancel_reason: string | null
  billing_profile_id: string | null
  billing_method: 'ach' | 'card' | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface MerchantSubscriptionAssignmentViewRecord {
  id: string
  subscription_id: string
  service_id: string
  service_code: string
  display_name: string
  service_category: 'hardware' | 'software' | 'service'
  pricing_model: 'flat' | 'per_unit' | 'tiered'
  unit_label: string
  quantity: number
  is_enabled: boolean
  base_price_monthly: number
  additional_unit_price: number | null
  included_quantity: number
  card_surcharge_pct: number
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface MerchantSubscriptionInvoiceViewRecord {
  id: string
  subscription_id: string
  merchant_id: string
  location_id: string
  location_name: string
  invoice_number: string
  billing_period_start: string
  billing_period_end: string
  station_count_snapshot: number
  billing_method: 'ach' | 'card'
  subtotal: number
  card_surcharge: number
  total_amount: number
  status: 'open' | 'processing' | 'paid' | 'failed' | 'refunded' | 'voided'
  due_date: string
  paid_at: string | null
  payment_attempt_count: number
  last_payment_attempt_at: string | null
  last_payment_error: string | null
  nmi_transaction_id: string | null
  nmi_response: Record<string, unknown> | null
  line_items: Array<Record<string, unknown>>
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

function toNumber(value: unknown): number {
  const amount = Number(value ?? 0)
  return Number.isFinite(amount) ? amount : 0
}

async function resolveMerchantForCurrentOrg() {
  const { userId, orgId } = await auth()
  if (!userId || !orgId) {
    throw new Error('Unauthorized')
  }

  const serviceRole = createServiceRoleClient()
  const { data: merchant, error } = await serviceRole
    .from('merchants')
    .select('id, name, clerk_org_id')
    .eq('clerk_org_id', orgId)
    .single()

  if (error || !merchant) {
    throw new Error('Merchant not found.')
  }

  return {
    merchantId: merchant.id as string,
    merchantName: merchant.name as string,
    serviceRole,
  }
}

function normalizeSubscriptionInvoiceLineItems(
  rawLineItems: Array<Record<string, unknown>> | null | undefined,
  billingPeriodStart: string,
  billingPeriodEnd: string,
): SubscriptionInvoiceLineItem[] {
  const periodLabel = formatShortDateRange(billingPeriodStart, billingPeriodEnd)

  return (rawLineItems ?? []).map((item) => {
    const quantity = Math.max(1, toNumber(item.quantity ?? 1))
    let amount = 0
    let unitPrice = 0

    if (typeof item.amount !== 'undefined') {
      amount = toNumber(item.amount)
      unitPrice = toNumber(item.unit_price ?? (quantity > 0 ? amount / quantity : amount))
    } else if (typeof item.subtotal !== 'undefined') {
      amount = toNumber(item.subtotal)
      unitPrice = quantity > 0 ? amount / quantity : amount
    } else {
      amount = toNumber(item.total_amount)
      unitPrice = quantity > 0 ? amount / quantity : amount
    }

    return {
      code: typeof item.code === 'string' ? item.code : null,
      description: String(item.description ?? item.display_name ?? item.service_code ?? item.code ?? 'Line item'),
      periodLabel,
      quantity,
      unitPrice,
      amount,
    }
  })
}

function buildInvoiceStatusSummary(invoice: {
  status: string
  total_amount: number
  paid_at: string | null
  due_date: string
}) {
  const amountLabel = formatUsd(invoice.total_amount)

  if (invoice.status === 'paid') {
    return {
      summaryTitle: `${amountLabel} paid ${formatLongDate(invoice.paid_at || invoice.due_date)}`,
      finalAmountLabel: 'Amount paid',
      finalAmountValue: invoice.total_amount,
    }
  }

  if (invoice.status === 'voided' || invoice.status === 'refunded') {
    return {
      summaryTitle: `${amountLabel} ${invoice.status}`,
      finalAmountLabel: 'Amount due',
      finalAmountValue: 0,
    }
  }

  return {
    summaryTitle: `${amountLabel} due ${formatLongDate(invoice.due_date)}`,
    finalAmountLabel: 'Amount due',
    finalAmountValue: invoice.total_amount,
  }
}

export async function getMerchantSubscriptionOverview(): Promise<{
  merchantId: string
  merchantName: string
  subscriptions: MerchantSubscriptionViewRecord[]
  assignmentsBySubscriptionId: Record<string, MerchantSubscriptionAssignmentViewRecord[]>
  invoices: MerchantSubscriptionInvoiceViewRecord[]
}> {
  const { merchantId, merchantName, serviceRole } = await resolveMerchantForCurrentOrg()

  const { data: subscriptions, error: subscriptionsError } = await serviceRole.rpc(
    'list_merchant_subscriptions',
    {
      p_merchant_id: merchantId,
    },
  )

  if (subscriptionsError) {
    console.error('[getMerchantSubscriptionOverview] subscriptions error:', subscriptionsError)
    throw new Error('Failed to load subscriptions.')
  }

  const { data: invoices, error: invoicesError } = await serviceRole.rpc(
    'list_subscription_invoices',
    {
      p_merchant_id: merchantId,
      p_location_id: null,
      p_limit: 100,
    },
  )

  if (invoicesError) {
    console.error('[getMerchantSubscriptionOverview] invoices error:', invoicesError)
    throw new Error('Failed to load subscription invoices.')
  }

  const normalizedSubscriptions = ((subscriptions ?? []) as MerchantSubscriptionViewRecord[]).map((row) => ({
    ...row,
    station_count: toNumber(row.station_count),
    monthly_amount: toNumber(row.monthly_amount),
  }))

  const assignmentEntries = await Promise.all(
    normalizedSubscriptions.map(async (subscription) => {
      const { data, error } = await serviceRole.rpc('list_subscription_service_assignments', {
        p_subscription_id: subscription.id,
      })

      if (error) {
        console.error('[getMerchantSubscriptionOverview] assignment error:', error)
        throw new Error('Failed to load subscription services.')
      }

      const normalizedAssignments = ((data ?? []) as MerchantSubscriptionAssignmentViewRecord[]).map((row) => ({
        ...row,
        quantity: toNumber(row.quantity),
        base_price_monthly: toNumber(row.base_price_monthly),
        additional_unit_price: row.additional_unit_price === null ? null : toNumber(row.additional_unit_price),
        included_quantity: toNumber(row.included_quantity),
        card_surcharge_pct: toNumber(row.card_surcharge_pct),
      }))

      return [subscription.id, normalizedAssignments] as const
    }),
  )

  const normalizedInvoices = ((invoices ?? []) as MerchantSubscriptionInvoiceViewRecord[]).map((row) => ({
    ...row,
    station_count_snapshot: toNumber(row.station_count_snapshot),
    subtotal: toNumber(row.subtotal),
    card_surcharge: toNumber(row.card_surcharge),
    total_amount: toNumber(row.total_amount),
    payment_attempt_count: toNumber(row.payment_attempt_count),
  }))

  return {
    merchantId,
    merchantName,
    subscriptions: normalizedSubscriptions,
    assignmentsBySubscriptionId: Object.fromEntries(assignmentEntries),
    invoices: normalizedInvoices,
  }
}

export async function getMerchantSubscriptionInvoiceDocument(
  invoiceId: string,
): Promise<{ success: boolean; document?: SubscriptionInvoiceDocumentData; error?: string }> {
  if (!invoiceId?.trim()) {
    return { success: false, error: 'invoiceId is required.' }
  }

  try {
    const { merchantId, merchantName, serviceRole } = await resolveMerchantForCurrentOrg()

    const { data: invoice, error: invoiceError } = await serviceRole
      .from('subscription_invoices')
      .select(`
        id,
        merchant_id,
        location_id,
        billing_profile_id,
        invoice_number,
        billing_period_start,
        billing_period_end,
        line_items,
        subtotal,
        card_surcharge,
        total_amount,
        status,
        due_date,
        paid_at,
        created_at
      `)
      .eq('id', invoiceId)
      .eq('merchant_id', merchantId)
      .maybeSingle()

    if (invoiceError || !invoice) {
      console.error('[getMerchantSubscriptionInvoiceDocument] invoice error:', invoiceError)
      return { success: false, error: 'Invoice not found.' }
    }

    const [{ data: location }, billingProfileResult] = await Promise.all([
      serviceRole
        .from('locations')
        .select('name')
        .eq('id', invoice.location_id)
        .maybeSingle(),
      invoice.billing_profile_id
        ? serviceRole
            .from('merchant_billing_profiles')
            .select('billing_email, account_holder_name')
            .eq('id', invoice.billing_profile_id)
            .maybeSingle()
        : serviceRole
            .from('merchant_billing_profiles')
            .select('billing_email, account_holder_name')
            .eq('merchant_id', merchantId)
            .eq('location_id', invoice.location_id)
            .eq('is_primary', true)
            .eq('is_active', true)
            .maybeSingle(),
    ])

    const summary = buildInvoiceStatusSummary({
      status: invoice.status,
      total_amount: toNumber(invoice.total_amount),
      paid_at: invoice.paid_at,
      due_date: invoice.due_date,
    })

    return {
      success: true,
      document: {
        title: 'Invoice',
        invoiceNumber: invoice.invoice_number,
        issuedOn: invoice.created_at,
        dueDate: invoice.due_date,
        statusLabel: invoice.status,
        summaryTitle: summary.summaryTitle,
        fromParty: {
          title: 'Bill from',
          lines: ['Dexa POS Billing', process.env.RESEND_FROM_EMAIL || 'support@dexaposai.com'],
        },
        toParty: {
          title: 'Bill to',
          lines: [
            merchantName,
            location?.name || 'Location',
            billingProfileResult.data?.account_holder_name || '',
            billingProfileResult.data?.billing_email || '',
          ].filter(Boolean),
        },
        lineItems: normalizeSubscriptionInvoiceLineItems(
          (invoice.line_items as Array<Record<string, unknown>> | null) ?? [],
          invoice.billing_period_start,
          invoice.billing_period_end,
        ),
        subtotal: toNumber(invoice.subtotal),
        surcharge: toNumber(invoice.card_surcharge),
        total: toNumber(invoice.total_amount),
        finalAmountLabel: summary.finalAmountLabel,
        finalAmountValue: summary.finalAmountValue,
        footerNote:
          invoice.status === 'paid'
            ? 'Payment processed successfully through Dexa Billing.'
            : 'This invoice reflects the current subscription billing state for this location.',
      },
    }
  } catch (error: any) {
    console.error('[getMerchantSubscriptionInvoiceDocument] exception:', error)
    return { success: false, error: error?.message || 'Failed to load invoice document.' }
  }
}

