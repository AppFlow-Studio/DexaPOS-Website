'use server'

import { auth } from '@clerk/nextjs/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getEffectiveMerchantContext } from '@/lib/admin/merchant-context'
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

export interface MerchantSubscriptionBillingProfileViewRecord {
  id: string
  location_id: string | null
  billing_email: string | null
  account_holder_name: string | null
  billing_method: 'ach' | 'card'
  bank_name: string | null
  account_number_last_four: string | null
  card_brand: string | null
  card_last_four: string | null
  card_exp_month: number | null
  card_exp_year: number | null
  is_primary: boolean
  is_active: boolean
}

export interface MerchantPlanStatusView {
  plan: {
    code: string
    name: string
    min_locations: number | null
    max_locations: number | null
    monthly_price_cents: number
    description: string | null
  } | null
  active_location_count: number
  is_over_limit: boolean
  required_plan_code: string | null
  subscription_status: 'active' | 'past_due' | 'suspended' | 'cancelled' | null
  current_period_end: string | null
}

export interface MerchantTierPlanViewRecord {
  id: string
  plan_code: string
  display_name: string
  min_locations: number | null
  max_locations: number | null
  monthly_price_cents: number
  description: string | null
  display_order: number
}

function normalizeMerchantTierPlans(
  rows: Array<{
    id: string
    plan_code: string
    display_name: string
    min_locations: number | null
    max_locations: number | null
    monthly_price_cents: number | null
    description: string | null
    display_order: number | null
  }> | null | undefined,
): MerchantTierPlanViewRecord[] {
  return (rows ?? []).map((plan) => ({
    id: plan.id,
    plan_code: plan.plan_code,
    display_name: plan.display_name,
    min_locations: plan.min_locations === null ? null : toNumber(plan.min_locations),
    max_locations: plan.max_locations === null ? null : toNumber(plan.max_locations),
    monthly_price_cents: toNumber(plan.monthly_price_cents),
    description: plan.description,
    display_order: toNumber(plan.display_order),
  }))
}

export interface MerchantBillingLocationViewRecord {
  id: string
  name: string
  address_line1: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  is_active: boolean
  device_count: number
}

export interface MerchantProvisionedDeviceViewRecord {
  id: string
  location_id: string | null
  location_name: string | null
  model_name: string
  serial_number: string
  pos_id: string | null
  status: string
  linked_station_id: string | null
  linked_station_name: string | null
}

function toNumber(value: unknown): number {
  const amount = Number(value ?? 0)
  return Number.isFinite(amount) ? amount : 0
}

async function resolveMerchantForCurrentOrg() {
  const { userId } = await auth()
  if (!userId) {
    throw new Error('Unauthorized')
  }

  const merchantContext = await getEffectiveMerchantContext(null)
  const serviceRole = createServiceRoleClient()
  const { data: merchant, error } = await serviceRole
    .from('merchants')
    .select('id, name, clerk_org_id')
    .eq('id', merchantContext.merchantId)
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
  merchantPlanStatus: MerchantPlanStatusView
  merchantTierPlans: MerchantTierPlanViewRecord[]
  locations: MerchantBillingLocationViewRecord[]
  devicesByLocationId: Record<string, MerchantProvisionedDeviceViewRecord[]>
  invoices: MerchantSubscriptionInvoiceViewRecord[]
  billingProfilesByLocationId: Record<string, MerchantSubscriptionBillingProfileViewRecord>
}> {
  const { merchantId, merchantName, serviceRole } = await resolveMerchantForCurrentOrg()

  const [
    merchantPlanStatusResult,
    merchantTierPlansResult,
    locationsResult,
    invoicesResult,
    billingProfilesResult,
    devicesResult,
  ] = await Promise.all([
    serviceRole.rpc('get_merchant_subscription_status', {
      p_merchant_id: merchantId,
    }),
    serviceRole
      .from('subscription_plans')
      .select('id, plan_code, display_name, min_locations, max_locations, monthly_price_cents, description, display_order')
      .eq('plan_scope', 'merchant_tier')
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .order('display_name', { ascending: true }),
    serviceRole
      .from('locations')
      .select('id, name, address_line1, city, state, postal_code, is_active')
      .eq('merchant_id', merchantId)
      .order('name', { ascending: true }),
    serviceRole.rpc('list_subscription_invoices', {
      p_merchant_id: merchantId,
      p_location_id: null,
      p_limit: 100,
    }),
    serviceRole
      .from('merchant_billing_profiles')
      .select(`
        id,
        location_id,
        billing_email,
        account_holder_name,
        billing_method,
        bank_name,
        account_number_last_four,
        card_brand,
        card_last_four,
        card_exp_month,
        card_exp_year,
        is_primary,
        is_active
      `)
      .eq('merchant_id', merchantId)
      .eq('is_primary', true)
      .eq('is_active', true)
      .not('location_id', 'is', null),
    serviceRole
      .from('admin_device_inventory')
      .select('id, location_id, location_name, model_name, serial_number, pos_id, status, linked_station_id')
      .eq('merchant_id', merchantId)
      .order('location_name', { ascending: true })
      .order('model_name', { ascending: true }),
  ])

  if (merchantPlanStatusResult.error) {
    console.error('[getMerchantSubscriptionOverview] merchant plan status error:', merchantPlanStatusResult.error)
    throw new Error('Failed to load current plan.')
  }

  if (locationsResult.error) {
    console.error('[getMerchantSubscriptionOverview] locations error:', locationsResult.error)
    throw new Error('Failed to load locations.')
  }

  if (merchantTierPlansResult.error) {
    console.error('[getMerchantSubscriptionOverview] merchant tier plans error:', merchantTierPlansResult.error)
    throw new Error('Failed to load plan tiers.')
  }

  if (invoicesResult.error) {
    console.error('[getMerchantSubscriptionOverview] invoices error:', invoicesResult.error)
    throw new Error('Failed to load subscription invoices.')
  }

  if (billingProfilesResult.error) {
    console.error('[getMerchantSubscriptionOverview] billing profile error:', billingProfilesResult.error)
    throw new Error('Failed to load billing profiles.')
  }

  let resolvedDevicesData = devicesResult.data
  let resolvedDevicesError = devicesResult.error
  if (
    resolvedDevicesError &&
    typeof resolvedDevicesError.message === 'string' &&
    resolvedDevicesError.message.includes('pos_id')
  ) {
    const fallbackDevicesResult = await serviceRole
      .from('admin_device_inventory')
      .select('id, location_id, location_name, model_name, serial_number, status, linked_station_id')
      .eq('merchant_id', merchantId)
      .order('location_name', { ascending: true })
      .order('model_name', { ascending: true })

    resolvedDevicesData = (fallbackDevicesResult.data ?? []).map((row) => ({
      ...row,
      pos_id: null,
    }))
    resolvedDevicesError = fallbackDevicesResult.error
  }

  if (resolvedDevicesError) {
    console.error('[getMerchantSubscriptionOverview] device inventory error:', resolvedDevicesError)
    throw new Error('Failed to load provisioned devices.')
  }

  const normalizedInvoices = ((invoicesResult.data ?? []) as MerchantSubscriptionInvoiceViewRecord[]).map((row) => ({
    ...row,
    station_count_snapshot: toNumber(row.station_count_snapshot),
    subtotal: toNumber(row.subtotal),
    card_surcharge: toNumber(row.card_surcharge),
    total_amount: toNumber(row.total_amount),
    payment_attempt_count: toNumber(row.payment_attempt_count),
  }))

  const stationIds = Array.from(
    new Set(
      ((resolvedDevicesData ?? []) as Array<{ linked_station_id: string | null }>)
        .map((row) => row.linked_station_id)
        .filter((value): value is string => Boolean(value)),
    ),
  )

  const stationNameMap = new Map<string, string>()
  if (stationIds.length > 0) {
    const { data: stations, error: stationsError } = await serviceRole
      .from('stations')
      .select('id, station_name')
      .in('id', stationIds)

    if (stationsError) {
      console.error('[getMerchantSubscriptionOverview] stations error:', stationsError)
      throw new Error('Failed to load linked station names.')
    }

    for (const station of stations ?? []) {
      stationNameMap.set(station.id as string, station.station_name as string)
    }
  }

  const normalizedDevices = ((resolvedDevicesData ?? []) as Array<{
    id: string
    location_id: string | null
    location_name: string | null
    model_name: string
    serial_number: string
    pos_id: string | null
    status: string
    linked_station_id: string | null
  }>).map((row) => ({
    id: row.id,
    location_id: row.location_id,
    location_name: row.location_name,
    model_name: row.model_name,
    serial_number: row.serial_number,
    pos_id: row.pos_id,
    status: row.status,
    linked_station_id: row.linked_station_id,
    linked_station_name: row.linked_station_id ? stationNameMap.get(row.linked_station_id) ?? null : null,
  }))

  const deviceCountsByLocationId = new Map<string, number>()
  const devicesByLocationId = normalizedDevices.reduce<Record<string, MerchantProvisionedDeviceViewRecord[]>>(
    (acc, device) => {
      if (!device.location_id) return acc
      acc[device.location_id] = acc[device.location_id] ?? []
      acc[device.location_id].push(device)
      deviceCountsByLocationId.set(device.location_id, (deviceCountsByLocationId.get(device.location_id) ?? 0) + 1)
      return acc
    },
    {},
  )

  const normalizedLocations = ((locationsResult.data ?? []) as Array<{
    id: string
    name: string
    address_line1: string | null
    city: string | null
    state: string | null
    postal_code: string | null
    is_active: boolean | null
  }>).map((location) => ({
    ...location,
    is_active: Boolean(location.is_active),
    device_count: deviceCountsByLocationId.get(location.id) ?? 0,
  }))

  const rawPlanStatus = (merchantPlanStatusResult.data ?? {}) as Record<string, any>
  const merchantTierPlans = normalizeMerchantTierPlans(
    (merchantTierPlansResult.data ?? []) as Array<{
      id: string
      plan_code: string
      display_name: string
      min_locations: number | null
      max_locations: number | null
      monthly_price_cents: number | null
      description: string | null
      display_order: number | null
    }>,
  )

  const merchantPlanStatus: MerchantPlanStatusView = {
    plan: rawPlanStatus.plan
      ? {
          code: String(rawPlanStatus.plan.code),
          name: String(rawPlanStatus.plan.name),
          min_locations:
            rawPlanStatus.plan.min_locations === null ? null : toNumber(rawPlanStatus.plan.min_locations),
          max_locations:
            rawPlanStatus.plan.max_locations === null ? null : toNumber(rawPlanStatus.plan.max_locations),
          monthly_price_cents: toNumber(rawPlanStatus.plan.monthly_price_cents),
          description:
            typeof rawPlanStatus.plan.description === 'string' ? rawPlanStatus.plan.description : null,
        }
      : null,
    active_location_count: toNumber(rawPlanStatus.active_location_count),
    is_over_limit: Boolean(rawPlanStatus.is_over_limit),
    required_plan_code:
      typeof rawPlanStatus.required_plan_code === 'string' ? rawPlanStatus.required_plan_code : null,
    subscription_status:
      typeof rawPlanStatus.subscription_status === 'string'
        ? (rawPlanStatus.subscription_status as MerchantPlanStatusView['subscription_status'])
        : null,
    current_period_end:
      typeof rawPlanStatus.current_period_end === 'string' ? rawPlanStatus.current_period_end : null,
  }

  return {
    merchantId,
    merchantName,
    merchantPlanStatus,
    merchantTierPlans,
    locations: normalizedLocations,
    devicesByLocationId,
    invoices: normalizedInvoices,
    billingProfilesByLocationId: Object.fromEntries(
      ((billingProfilesResult.data ?? []) as MerchantSubscriptionBillingProfileViewRecord[])
        .filter((profile) => typeof profile.location_id === 'string' && profile.location_id.length > 0)
        .map((profile) => [profile.location_id as string, profile]),
    ),
  }
}

export async function getMerchantTierPlansForCurrentMerchant(): Promise<MerchantTierPlanViewRecord[]> {
  const { userId } = await auth()
  if (!userId) {
    throw new Error('Unauthorized')
  }

  const { serviceRole } = await resolveMerchantForCurrentOrg()
  const { data, error } = await serviceRole
    .from('subscription_plans')
    .select('id, plan_code, display_name, min_locations, max_locations, monthly_price_cents, description, display_order')
    .eq('plan_scope', 'merchant_tier')
    .eq('is_active', true)
    .order('display_order', { ascending: true })
    .order('display_name', { ascending: true })

  if (error) {
    console.error('[getMerchantTierPlansForCurrentMerchant] error:', error)
    throw new Error('Failed to load plan tiers.')
  }

  return normalizeMerchantTierPlans(
    (data ?? []) as Array<{
      id: string
      plan_code: string
      display_name: string
      min_locations: number | null
      max_locations: number | null
      monthly_price_cents: number | null
      description: string | null
      display_order: number | null
    }>,
  )
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
