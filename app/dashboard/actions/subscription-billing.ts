'use server'

import { auth, currentUser } from '@clerk/nextjs/server'
import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getEffectiveMerchantContext } from '@/lib/admin/merchant-context'
import { buildEmailTemplate, sendEmail } from '@/lib/messaging/resend'
import { createAppNotification } from '@/lib/notifications/app-notifications'
import { parseSupportAssigneeEmails } from '@/lib/support/assignees'
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
  next_retry_at: string | null
  retry_exhausted_at: string | null
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
  location_name: string | null
}

export interface MerchantPendingHardwareRequestViewRecord {
  id: string
  request_number: string
  location_id: string
  location_name: string
  status: 'pending'
  requested_at: string
  request_note: string | null
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

export interface MerchantPendingTierRequestViewRecord {
  id: string
  request_number: string
  requested_plan_id: string
  requested_plan_name: string
  status: 'pending'
  requested_at: string
}

function normalizeMerchantTierPlans(
  rows:
    | Array<{
    id: string
    plan_code: string
    display_name: string
    min_locations: number | null
    max_locations: number | null
    monthly_price_cents: number | null
    description: string | null
    display_order: number | null
      }>
    | null
    | undefined,
): MerchantTierPlanViewRecord[] {
  return (rows ?? []).map((plan) => ({
    id: plan.id,
    plan_code: plan.plan_code,
    display_name: plan.display_name,
    min_locations:
      plan.min_locations === null ? null : toNumber(plan.min_locations),
    max_locations:
      plan.max_locations === null ? null : toNumber(plan.max_locations),
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
    clerkOrgId: merchant.clerk_org_id as string,
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
      unitPrice = toNumber(
        item.unit_price ?? (quantity > 0 ? amount / quantity : amount),
      )
    } else if (typeof item.subtotal !== 'undefined') {
      amount = toNumber(item.subtotal)
      unitPrice = quantity > 0 ? amount / quantity : amount
    } else {
      amount = toNumber(item.total_amount)
      unitPrice = quantity > 0 ? amount / quantity : amount
    }

    return {
      code: typeof item.code === 'string' ? item.code : null,
      description: String(
        item.description ??
          item.display_name ??
          item.service_code ??
          item.code ??
          'Line item',
      ),
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
  pendingTierRequest: MerchantPendingTierRequestViewRecord | null
  pendingHardwareRequests: MerchantPendingHardwareRequestViewRecord[]
  locations: MerchantBillingLocationViewRecord[]
  devicesByLocationId: Record<string, MerchantProvisionedDeviceViewRecord[]>
  invoices: MerchantSubscriptionInvoiceViewRecord[]
  primaryBillingProfile: MerchantSubscriptionBillingProfileViewRecord | null
  billingProfilesByLocationId: Record<
    string,
    MerchantSubscriptionBillingProfileViewRecord
  >
}> {
  const { merchantId, merchantName, serviceRole } =
    await resolveMerchantForCurrentOrg()

  const [
    merchantPlanStatusResult,
    merchantTierPlansResult,
    locationsResult,
    invoicesResult,
    billingProfilesResult,
    devicesResult,
    pendingTierRequestResult,
    pendingHardwareRequestsResult,
  ] = await Promise.all([
    serviceRole.rpc('get_merchant_subscription_status', {
      p_merchant_id: merchantId,
    }),
    serviceRole
      .from('subscription_plans')
      .select(
        'id, plan_code, display_name, min_locations, max_locations, monthly_price_cents, description, display_order',
      )
      .eq('plan_scope', 'merchant_tier')
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .order('display_name', { ascending: true }),
    serviceRole
      .from('locations')
      .select('id, name, address_line1, city, state, postal_code, is_active')
      .eq('merchant_id', merchantId)
      .order('created_at', { ascending: true }),
    serviceRole.rpc('list_subscription_invoices', {
      p_merchant_id: merchantId,
      p_location_id: null,
      p_limit: 100,
    }),
    serviceRole
      .from('merchant_billing_profiles')
      .select(
        `
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
        is_active,
        created_at
      `,
      )
      .eq('merchant_id', merchantId)
      .eq('is_primary', true)
      .eq('is_active', true)
      .not('location_id', 'is', null)
      .order('created_at', { ascending: true }),
    serviceRole
      .from('admin_device_inventory')
      .select(
        'id, location_id, location_name, model_name, serial_number, pos_id, status, linked_station_id',
      )
      .eq('merchant_id', merchantId)
      .order('location_name', { ascending: true })
      .order('model_name', { ascending: true }),
    (serviceRole as any)
      .from('subscription_plan_requests')
      .select(
        'id, request_number, requested_plan_id, status, created_at, metadata',
      )
      .eq('merchant_id', merchantId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    (serviceRole as any)
      .from('subscription_hardware_requests')
      .select(
        'id, request_number, location_id, status, created_at, request_note',
      )
      .eq('merchant_id', merchantId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
  ])

  if (merchantPlanStatusResult.error) {
    console.error(
      '[getMerchantSubscriptionOverview] merchant plan status error:',
      merchantPlanStatusResult.error,
    )
    throw new Error('Failed to load current plan.')
  }

  if (locationsResult.error) {
    console.error(
      '[getMerchantSubscriptionOverview] locations error:',
      locationsResult.error,
    )
    throw new Error('Failed to load locations.')
  }

  if (merchantTierPlansResult.error) {
    console.error(
      '[getMerchantSubscriptionOverview] merchant tier plans error:',
      merchantTierPlansResult.error,
    )
    throw new Error('Failed to load plan tiers.')
  }

  if (invoicesResult.error) {
    console.error(
      '[getMerchantSubscriptionOverview] invoices error:',
      invoicesResult.error,
    )
    throw new Error('Failed to load subscription invoices.')
  }

  if (billingProfilesResult.error) {
    console.error(
      '[getMerchantSubscriptionOverview] billing profile error:',
      billingProfilesResult.error,
    )
    throw new Error('Failed to load billing profiles.')
  }

  if (pendingTierRequestResult.error) {
    console.error(
      '[getMerchantSubscriptionOverview] pending request error:',
      pendingTierRequestResult.error,
    )
    throw new Error('Failed to load the pending subscription request.')
  }

  if (pendingHardwareRequestsResult.error) {
    console.error(
      '[getMerchantSubscriptionOverview] pending hardware requests error:',
      pendingHardwareRequestsResult.error,
    )
    throw new Error('Failed to load pending hardware requests.')
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
      .select(
        'id, location_id, location_name, model_name, serial_number, status, linked_station_id',
      )
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
    console.error(
      '[getMerchantSubscriptionOverview] device inventory error:',
      resolvedDevicesError,
    )
    throw new Error('Failed to load provisioned devices.')
  }

  let normalizedInvoices = (
    (invoicesResult.data ?? []) as MerchantSubscriptionInvoiceViewRecord[]
  ).map((row) => ({
    ...row,
    station_count_snapshot: toNumber(row.station_count_snapshot),
    subtotal: toNumber(row.subtotal),
    card_surcharge: toNumber(row.card_surcharge),
    total_amount: toNumber(row.total_amount),
    payment_attempt_count: toNumber(row.payment_attempt_count),
    next_retry_at: row.next_retry_at ?? null,
    retry_exhausted_at: row.retry_exhausted_at ?? null,
  }))

  if (normalizedInvoices.length > 0) {
    const { data: retryRows, error: retryError } = await (serviceRole as any)
      .from('subscription_invoices')
      .select('id, next_retry_at, retry_exhausted_at')
      .in(
        'id',
        normalizedInvoices.map((invoice) => invoice.id),
      )

    if (retryError && retryError.code !== '42703') {
      console.error(
        '[getMerchantSubscriptionOverview] retry schedule error:',
        retryError,
      )
      throw new Error('Failed to load invoice retry schedules.')
    }

    const retryByInvoiceId = new Map(
      (retryRows ?? []).map((row: any) => [row.id, row]),
    )
    normalizedInvoices = normalizedInvoices.map((invoice) => ({
      ...invoice,
      next_retry_at:
        retryByInvoiceId.get(invoice.id)?.next_retry_at ?? null,
      retry_exhausted_at:
        retryByInvoiceId.get(invoice.id)?.retry_exhausted_at ?? null,
    }))
  }

  const stationIds = Array.from(
    new Set(
      (
        (resolvedDevicesData ?? []) as Array<{
          linked_station_id: string | null
        }>
      )
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
      console.error(
        '[getMerchantSubscriptionOverview] stations error:',
        stationsError,
      )
      throw new Error('Failed to load linked station names.')
    }

    for (const station of stations ?? []) {
      stationNameMap.set(station.id as string, station.station_name as string)
    }
  }

  const normalizedDevices = (
    (resolvedDevicesData ?? []) as Array<{
    id: string
    location_id: string | null
    location_name: string | null
    model_name: string
    serial_number: string
    pos_id: string | null
    status: string
    linked_station_id: string | null
    }>
  ).map((row) => ({
    id: row.id,
    location_id: row.location_id,
    location_name: row.location_name,
    model_name: row.model_name,
    serial_number: row.serial_number,
    pos_id: row.pos_id,
    status: row.status,
    linked_station_id: row.linked_station_id,
    linked_station_name: row.linked_station_id
      ? (stationNameMap.get(row.linked_station_id) ?? null)
      : null,
  }))

  const deviceCountsByLocationId = new Map<string, number>()
  const devicesByLocationId = normalizedDevices.reduce<
    Record<string, MerchantProvisionedDeviceViewRecord[]>
  >((acc, device) => {
      if (!device.location_id) return acc
      acc[device.location_id] = acc[device.location_id] ?? []
      acc[device.location_id].push(device)
    deviceCountsByLocationId.set(
      device.location_id,
      (deviceCountsByLocationId.get(device.location_id) ?? 0) + 1,
  )
    return acc
  }, {})

  const normalizedLocations = (
    (locationsResult.data ?? []) as Array<{
    id: string
    name: string
    address_line1: string | null
    city: string | null
    state: string | null
    postal_code: string | null
    is_active: boolean | null
    }>
  ).map((location) => ({
    ...location,
    is_active: Boolean(location.is_active),
    device_count: deviceCountsByLocationId.get(location.id) ?? 0,
  }))

  const rawPlanStatus = (merchantPlanStatusResult.data ?? {}) as Record<
    string,
    any
  >
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
            rawPlanStatus.plan.min_locations === null
              ? null
              : toNumber(rawPlanStatus.plan.min_locations),
          max_locations:
            rawPlanStatus.plan.max_locations === null
              ? null
              : toNumber(rawPlanStatus.plan.max_locations),
          monthly_price_cents: toNumber(rawPlanStatus.plan.monthly_price_cents),
          description:
            typeof rawPlanStatus.plan.description === 'string'
              ? rawPlanStatus.plan.description
              : null,
        }
      : null,
    active_location_count: toNumber(rawPlanStatus.active_location_count),
    is_over_limit: Boolean(rawPlanStatus.is_over_limit),
    required_plan_code:
      typeof rawPlanStatus.required_plan_code === 'string'
        ? rawPlanStatus.required_plan_code
        : null,
    subscription_status:
      typeof rawPlanStatus.subscription_status === 'string'
        ? (rawPlanStatus.subscription_status as MerchantPlanStatusView['subscription_status'])
        : null,
    current_period_end:
      typeof rawPlanStatus.current_period_end === 'string'
        ? rawPlanStatus.current_period_end
        : null,
  }

  const pendingRequestMetadata = (pendingTierRequestResult.data?.metadata ??
    {}) as Record<string, unknown>
  const pendingRequestedPlan = pendingTierRequestResult.data
    ? merchantTierPlans.find(
        (plan) => plan.id === pendingTierRequestResult.data.requested_plan_id,
      )
    : null
  const pendingTierRequest: MerchantPendingTierRequestViewRecord | null =
    pendingTierRequestResult.data
      ? {
          id: pendingTierRequestResult.data.id,
          request_number: pendingTierRequestResult.data.request_number,
          requested_plan_id: pendingTierRequestResult.data.requested_plan_id,
          requested_plan_name:
            pendingRequestedPlan?.display_name ||
            (typeof pendingRequestMetadata.requested_plan_name === 'string'
              ? pendingRequestMetadata.requested_plan_name
              : 'Subscription plan'),
          status: 'pending',
          requested_at: pendingTierRequestResult.data.created_at,
        }
      : null

  const locationNameById = new Map(
    normalizedLocations.map((location) => [location.id, location.name]),
  )
  const normalizedBillingProfiles = (
    (billingProfilesResult.data ?? []) as Array<
      MerchantSubscriptionBillingProfileViewRecord & { created_at: string }
    >
  ).map((profile) => ({
    ...profile,
    location_name: profile.location_id
      ? (locationNameById.get(profile.location_id) ?? null)
      : null,
  }))
  const primaryBillingProfile = normalizedBillingProfiles[0] ?? null

  const pendingHardwareRequests = (
    (pendingHardwareRequestsResult.data ?? []) as Array<{
      id: string
      request_number: string
      location_id: string
      status: 'pending'
      created_at: string
      request_note: string | null
    }>
  ).map((request) => ({
    id: request.id,
    request_number: request.request_number,
    location_id: request.location_id,
    location_name:
      locationNameById.get(request.location_id) ?? 'Unknown location',
    status: 'pending' as const,
    requested_at: request.created_at,
    request_note: request.request_note,
  }))

  return {
    merchantId,
    merchantName,
    merchantPlanStatus,
    merchantTierPlans,
    pendingTierRequest,
    pendingHardwareRequests,
    locations: normalizedLocations,
    devicesByLocationId,
    invoices: normalizedInvoices,
    primaryBillingProfile,
    billingProfilesByLocationId: Object.fromEntries(
      normalizedBillingProfiles
        .filter(
          (profile) =>
            typeof profile.location_id === 'string' &&
            profile.location_id.length > 0,
        )
        .map((profile) => [profile.location_id as string, profile]),
    ),
  }
}

export async function getMerchantTierPlansForCurrentMerchant(): Promise<
  MerchantTierPlanViewRecord[]
> {
  const { userId } = await auth()
  if (!userId) {
    throw new Error('Unauthorized')
  }

  const { serviceRole } = await resolveMerchantForCurrentOrg()
  const { data, error } = await serviceRole
    .from('subscription_plans')
    .select(
      'id, plan_code, display_name, min_locations, max_locations, monthly_price_cents, description, display_order',
    )
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

export async function RequestMerchantTierPlan(
  planId: string,
  authorization: { accepted: boolean },
): Promise<{
  success: boolean
  requestId?: string
  requestNumber?: string
  alreadyRequested?: boolean
  notificationWarning?: string
  error?: string
}> {
  try {
    if (!planId?.trim()) {
      return { success: false, error: 'Select a subscription plan first.' }
    }

    if (!authorization?.accepted) {
      return {
        success: false,
        error: 'Accept the recurring charge authorization before submitting.',
      }
    }

    const { userId } = await auth()
    if (!userId) {
      return { success: false, error: 'Unauthorized' }
    }

    const { merchantId, merchantName, clerkOrgId, serviceRole } =
      await resolveMerchantForCurrentOrg()

    const [
      { data: requestedPlan, error: planError },
      { data: planStatus, error: statusError },
    ] = await Promise.all([
        serviceRole
          .from('subscription_plans')
        .select(
          'id, plan_code, display_name, monthly_price_cents, plan_scope, is_active',
        )
          .eq('id', planId)
          .eq('plan_scope', 'merchant_tier')
          .eq('is_active', true)
          .maybeSingle(),
        serviceRole.rpc('get_merchant_subscription_status', {
          p_merchant_id: merchantId,
        }),
      ])

    if (planError || !requestedPlan) {
      console.error('[RequestMerchantTierPlan] plan lookup error:', planError)
      return { success: false, error: 'The selected plan is not available.' }
    }

    if (statusError) {
      console.error(
        '[RequestMerchantTierPlan] status lookup error:',
        statusError,
      )
      return {
        success: false,
        error: 'Failed to load the current subscription.',
      }
    }

    const status = (planStatus ?? {}) as Record<string, any>
    const currentPlan = status.plan as Record<string, any> | null | undefined

    if (
      String(currentPlan?.id ?? '') === requestedPlan.id ||
      String(currentPlan?.code ?? '') === requestedPlan.plan_code
    ) {
      return {
        success: false,
        error: 'This is already your current subscription plan.',
      }
    }

    const { data: existingRequest, error: existingRequestError } =
      await serviceRole
      .from('subscription_plan_requests' as any)
      .select('id, request_number, requested_plan_id')
      .eq('merchant_id', merchantId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingRequestError) {
      console.error(
        '[RequestMerchantTierPlan] duplicate lookup error:',
        existingRequestError,
      )
      return {
        success: false,
        error: 'Failed to check existing plan requests.',
      }
    }

    if (existingRequest) {
      if (existingRequest.requested_plan_id !== requestedPlan.id) {
        return {
          success: false,
          error: `Request ${existingRequest.request_number} is already awaiting HQ review. It must be approved or denied before another plan can be requested.`,
        }
      }

      return {
        success: true,
        requestId: existingRequest.id,
        requestNumber: existingRequest.request_number,
        alreadyRequested: true,
      }
    }

    const monthlyPrice = Number(requestedPlan.monthly_price_cents ?? 0) / 100
    const currentPlanName = String(
      currentPlan?.name ?? currentPlan?.display_name ?? 'No active plan',
    )
    const [clerkUser, requestHeaders] = await Promise.all([
      currentUser(),
      headers(),
    ])
    const requestedByEmail =
      clerkUser?.emailAddresses.find(
        (email) => email.id === clerkUser.primaryEmailAddressId,
      )?.emailAddress ??
      clerkUser?.emailAddresses[0]?.emailAddress ??
      null
    const forwardedFor = requestHeaders.get('x-forwarded-for')
    const authorizationIpAddress = (
      forwardedFor?.split(',')[0]?.trim() ||
      requestHeaders.get('cf-connecting-ip')?.trim() ||
      requestHeaders.get('x-real-ip')?.trim() ||
      ''
    ).slice(0, 128) || null
    const authorizationUserAgent =
      requestHeaders.get('user-agent')?.trim().slice(0, 1000) || null
    const authorizationAcceptedAt = new Date().toISOString()
    const authorizationReference = `AUTH-${randomUUID().toUpperCase()}`
    const authorizedPriceCents = Number(
      requestedPlan.monthly_price_cents ?? 0,
    )
    const authorizationTermsVersion = 'merchant-plan-recurring-v1'
    const authorizationText = `I authorize DEXA POS to charge ${
      authorizedPriceCents > 0
        ? `$${(authorizedPriceCents / 100).toFixed(2)}`
        : '$0.00'
    } per month for ${requestedPlan.display_name}. I understand the charge is recurring, activation requires DEXA HQ approval, and billing continues until cancellation under the applicable terms.`
    const requestInsert = await (serviceRole as any)
      .from('subscription_plan_requests')
      .insert({
        merchant_id: merchantId,
        current_plan_id: currentPlan?.id ?? null,
        requested_plan_id: requestedPlan.id,
        requested_by: userId,
        requested_by_email: requestedByEmail,
        status: 'pending',
        authorization_reference: authorizationReference,
        authorization_accepted: true,
        authorization_accepted_at: authorizationAcceptedAt,
        authorization_terms_version: authorizationTermsVersion,
        authorization_text: authorizationText,
        authorized_price_cents: authorizedPriceCents,
        authorized_billing_cadence: 'monthly_recurring',
        authorization_ip_address: authorizationIpAddress,
        authorization_user_agent: authorizationUserAgent,
        metadata: {
          source: 'merchant_subscription_plan_request',
          requested_plan_code: requestedPlan.plan_code,
          requested_plan_name: requestedPlan.display_name,
          requested_monthly_price_cents: Number(
            requestedPlan.monthly_price_cents ?? 0,
          ),
          current_plan_code: currentPlan?.code ?? null,
          current_plan_name: currentPlanName,
          active_location_count: Number(status.active_location_count ?? 0),
          authorization_reference: authorizationReference,
          authorization_terms_version: authorizationTermsVersion,
        },
      })
      .select('id, request_number')
      .single()

    if (requestInsert.error || !requestInsert.data) {
      if (requestInsert.error?.code === '23505') {
        return {
          success: false,
          error: 'A subscription request is already awaiting HQ review.',
        }
      }
      console.error(
        '[RequestMerchantTierPlan] request insert failed:',
        requestInsert.error,
      )
      return {
        success: false,
        error:
          requestInsert.error?.message || 'Failed to submit the plan request.',
      }
    }

    const request = requestInsert.data as {
      id: string
      request_number: string
    }
    const priceLabel =
      monthlyPrice > 0
        ? `$${monthlyPrice.toFixed(2)}/month`
        : 'contact for pricing'
    const notificationBody = `${merchantName} requested ${requestedPlan.display_name} at ${priceLabel}. Current plan: ${currentPlanName}.`
    const notificationResult = await createAppNotification({
      audience: 'hq',
      merchantId,
      notificationType: 'subscription_plan_requested',
      title: `${merchantName} requested a subscription plan`,
      body: notificationBody,
      href: `/manage/subscriptions/${clerkOrgId}?request=${request.id}`,
      actorUserId: userId,
      subscriptionPlanRequestId: request.id,
      metadata: {
        request_number: request.request_number,
        requested_plan_id: requestedPlan.id,
        requested_plan_code: requestedPlan.plan_code,
      },
    })

    const recipients = parseSupportAssigneeEmails(
      process.env.SUPPORT_TICKET_NOTIFICATION_EMAILS ?? '',
    )
    const emailResults = await Promise.all(
      recipients.map((recipient) =>
        sendEmail(
          recipient,
          `DEXA subscription request - ${merchantName}`,
          buildEmailTemplate(
            'DEXA POS',
            'Subscription plan requested',
            `${notificationBody}\n\nRequest: ${request.request_number}\nReview it in the DEXA HQ subscription workspace.`,
          ),
        ),
      ),
    )
    const emailFailed = emailResults.some((result) => 'error' in result)

    let notificationWarning: string | undefined
    if (notificationResult.error && emailFailed) {
      notificationWarning =
        'The request was saved, but neither the in-app nor email notification could be confirmed.'
    } else if (notificationResult.error) {
      notificationWarning =
        'The request was saved and emailed, but the in-app notification could not be confirmed.'
    } else if (emailFailed) {
      notificationWarning =
        'The request was saved in-app, but one or more notification emails failed.'
    }

    revalidatePath('/dashboard/subscriptions')
    revalidatePath('/manage/subscriptions')
    revalidatePath(`/manage/subscriptions/${clerkOrgId}`)

    return {
      success: true,
      requestId: request.id,
      requestNumber: request.request_number,
      notificationWarning,
    }
  } catch (error) {
    console.error('[RequestMerchantTierPlan] exception:', error)
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Failed to submit the plan request.',
    }
  }
}

export async function RequestSubscriptionHardware(params: {
  locationId: string
  quantity: number
  note?: string
}): Promise<{
  success: boolean
  requestId?: string
  requestNumber?: string
  alreadyRequested?: boolean
  notificationWarning?: string
  error?: string
}> {
  try {
    const { userId } = await auth()
    if (!userId) return { success: false, error: 'Unauthorized' }

    const locationId = params.locationId?.trim()
    const quantity = Math.trunc(Number(params.quantity))
    const note = params.note?.trim() || null
    if (!locationId)
      return { success: false, error: 'Select a location first.' }
    if (!Number.isFinite(quantity) || quantity < 1 || quantity > 100) {
      return {
        success: false,
        error: 'Device quantity must be between 1 and 100.',
      }
    }
    if (note && note.length > 2000) {
      return {
        success: false,
        error: 'Request notes must be 2,000 characters or fewer.',
      }
    }

    const { merchantId, merchantName, clerkOrgId, serviceRole } =
      await resolveMerchantForCurrentOrg()
    const { data: location, error: locationError } = await serviceRole
      .from('locations')
      .select('id, name')
      .eq('id', locationId)
      .eq('merchant_id', merchantId)
      .maybeSingle()

    if (locationError || !location) {
      return {
        success: false,
        error: 'The selected location is not available.',
      }
    }

    const { data: existingRequest, error: existingRequestError } = await (
      serviceRole as any
    )
      .from('subscription_hardware_requests')
      .select('id, request_number')
      .eq('merchant_id', merchantId)
      .eq('location_id', locationId)
      .eq('status', 'pending')
      .limit(1)
      .maybeSingle()

    if (existingRequestError) {
      console.error(
        '[RequestSubscriptionHardware] duplicate lookup error:',
        existingRequestError,
      )
      return {
        success: false,
        error: 'Failed to check existing hardware requests.',
      }
    }
    if (existingRequest) {
      return {
        success: true,
        requestId: existingRequest.id,
        requestNumber: existingRequest.request_number,
        alreadyRequested: true,
      }
    }

    const { data: request, error: insertError } = await (serviceRole as any)
      .from('subscription_hardware_requests')
      .insert({
        merchant_id: merchantId,
        location_id: locationId,
        requested_by: userId,
        requested_quantity: quantity,
        request_note: note,
        status: 'pending',
        metadata: { source: 'merchant_subscription_hardware_request' },
      })
      .select('id, request_number')
      .single()

    if (insertError || !request) {
      if (insertError?.code === '23505') {
        return {
          success: false,
          error: 'A hardware request is already pending for this location.',
        }
      }
      console.error('[RequestSubscriptionHardware] insert error:', insertError)
      return {
        success: false,
        error: insertError?.message || 'Failed to submit the hardware request.',
      }
    }

    const body = `${merchantName} requested ${quantity} device${quantity === 1 ? '' : 's'} for ${location.name}.`
    const notificationResult = await createAppNotification({
      audience: 'hq',
      merchantId,
      notificationType: 'subscription_hardware_requested',
      title: `${merchantName} requested hardware`,
      body,
      href: `/manage/subscriptions/${clerkOrgId}?hardwareRequest=${request.id}`,
      actorUserId: userId,
      metadata: {
        hardware_request_id: request.id,
        request_number: request.request_number,
        location_id: locationId,
        location_name: location.name,
        requested_quantity: quantity,
      },
    })

    const recipients = parseSupportAssigneeEmails(
      process.env.SUPPORT_TICKET_NOTIFICATION_EMAILS ?? '',
    )
    const emailResults = await Promise.all(
      recipients.map((recipient) =>
        sendEmail(
          recipient,
          `DEXA hardware request - ${merchantName}`,
          buildEmailTemplate(
            'DEXA POS',
            'Hardware requested',
            `${body}\n\nRequest: ${request.request_number}${note ? `\nNote: ${note}` : ''}`,
          ),
        ),
      ),
    )
    const emailFailed = emailResults.some((result) => 'error' in result)
    const notificationWarning =
      notificationResult.error && emailFailed
        ? 'The request was saved, but neither the in-app nor email notification could be confirmed.'
        : notificationResult.error
          ? 'The request was saved and emailed, but the in-app notification could not be confirmed.'
          : emailFailed
            ? 'The request was saved in-app, but one or more notification emails failed.'
            : undefined

    revalidatePath('/dashboard/subscriptions')
    revalidatePath('/manage/subscriptions')
    revalidatePath(`/manage/subscriptions/${clerkOrgId}`)

    return {
      success: true,
      requestId: request.id,
      requestNumber: request.request_number,
      notificationWarning,
    }
  } catch (error) {
    console.error('[RequestSubscriptionHardware] exception:', error)
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Failed to submit the hardware request.',
    }
  }
}

// ---------------------------------------------------------------------------
// Add-Location gate — single-location UX ticket
// ---------------------------------------------------------------------------
// The merchant-web Add-Location paywall reads the resolved tier (Basic default
// when no merchant_plan_subscriptions row), whether the tier still has location
// headroom, and the next tier up (to price the gate). All prices are NUMERIC
// dollars from subscription_plans.base_price_monthly so HQ edits reflect with
// zero deploy — never hardcoded here.

export interface MerchantLocationGateTier {
  code: string
  name: string
  minLocations: number | null
  maxLocations: number | null
  basePriceMonthly: number
  displayOrder: number
  description: string | null
}

export interface MerchantLocationGateUpgradeTarget {
  code: string
  name: string
  maxLocations: number | null
  basePriceMonthly: number
}

export interface MerchantLocationGateStatus {
  activeLocationCount: number
  canAddLocation: boolean
  resolvedTier: MerchantLocationGateTier | null
  upgradeTarget: MerchantLocationGateUpgradeTarget | null
}

export async function getMerchantLocationGateStatus(): Promise<MerchantLocationGateStatus> {
  const { merchantId, serviceRole } = await resolveMerchantForCurrentOrg()

  const { data, error } = await serviceRole.rpc(
    'get_merchant_subscription_status',
    {
    p_merchant_id: merchantId,
    },
  )

  if (error) {
    console.error('[getMerchantLocationGateStatus] error:', error)
    throw new Error('Failed to load location plan status.')
  }

  const raw = (data ?? {}) as Record<string, any>
  const rt = raw.resolved_tier as Record<string, any> | null | undefined
  const ut = raw.upgrade_target as Record<string, any> | null | undefined

  return {
    activeLocationCount: toNumber(raw.active_location_count),
    canAddLocation: Boolean(raw.can_add_location),
    resolvedTier: rt
      ? {
          code: String(rt.code),
          name: String(rt.name),
          minLocations:
            rt.min_locations === null ? null : toNumber(rt.min_locations),
          maxLocations:
            rt.max_locations === null ? null : toNumber(rt.max_locations),
          basePriceMonthly: toNumber(rt.base_price_monthly),
          displayOrder: toNumber(rt.display_order),
          description:
            typeof rt.description === 'string' ? rt.description : null,
        }
      : null,
    upgradeTarget: ut
      ? {
          code: String(ut.code),
          name: String(ut.name),
          maxLocations:
            ut.max_locations === null ? null : toNumber(ut.max_locations),
          basePriceMonthly: toNumber(ut.base_price_monthly),
        }
      : null,
  }
}

/**
 * File a merchant-initiated request to unlock multi-location. Writes a pending
 * `upgrade_request` billing event to audit_logs (action_category='billing'),
 * which surfaces in the HQ plan-change feed. Uses the authenticated client so
 * current_user_id() records the requesting user.
 */
export async function RequestLocationUpgrade(): Promise<{
  success: boolean
  error?: string
}> {
  try {
    const { userId } = await auth()
    if (!userId) {
      return { success: false, error: 'Unauthorized' }
    }

    const { merchantId, serviceRole } = await resolveMerchantForCurrentOrg()

    const { data, error } = await serviceRole.rpc(
      'get_merchant_subscription_status',
      {
      p_merchant_id: merchantId,
      },
    )

    if (error) {
      console.error('[RequestLocationUpgrade] plan status error:', error)
      return { success: false, error: 'Failed to resolve plan status.' }
    }

    const raw = (data ?? {}) as Record<string, any>
    const resolved = raw.resolved_tier as Record<string, any> | null | undefined
    const target = raw.upgrade_target as Record<string, any> | null | undefined

    if (!target) {
      return {
        success: false,
        error: 'No higher plan is available to request.',
      }
    }

    const supabase = createServerSupabaseClient()
    const { error: rpcError } = await supabase.rpc(
      'log_subscription_billing_event',
      {
      p_action: 'upgrade_request',
      p_merchant_id: merchantId,
      p_resource_type: 'subscription_plan',
      p_resource_name: String(target.name ?? target.code),
      p_changes: {
          from_plan: resolved
            ? { code: resolved.code, name: resolved.name }
            : null,
        to_plan: {
          code: target.code,
          name: target.name,
          base_price_monthly: target.base_price_monthly,
        },
        active_location_count: raw.active_location_count ?? null,
        reason: 'add_location_gate',
      },
      p_status: 'pending',
      },
    )

    if (rpcError) {
      console.error('[RequestLocationUpgrade] log event error:', rpcError)
      return { success: false, error: 'Failed to submit upgrade request.' }
    }

    return { success: true }
  } catch (error: any) {
    console.error('[RequestLocationUpgrade] exception:', error)
    return {
      success: false,
      error: error?.message || 'Failed to submit upgrade request.',
    }
  }
}

export async function getMerchantSubscriptionInvoiceDocument(
  invoiceId: string,
): Promise<{
  success: boolean
  document?: SubscriptionInvoiceDocumentData
  error?: string
}> {
  if (!invoiceId?.trim()) {
    return { success: false, error: 'invoiceId is required.' }
  }

  try {
    const { merchantId, merchantName, serviceRole } =
      await resolveMerchantForCurrentOrg()

    const { data: invoice, error: invoiceError } = await serviceRole
      .from('subscription_invoices')
      .select(
        `
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
      `,
      )
      .eq('id', invoiceId)
      .eq('merchant_id', merchantId)
      .maybeSingle()

    if (invoiceError || !invoice) {
      console.error(
        '[getMerchantSubscriptionInvoiceDocument] invoice error:',
        invoiceError,
      )
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
          lines: [
            'Dexa POS Billing',
            process.env.RESEND_FROM_EMAIL || 'support@dexaposai.com',
          ],
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
    return {
      success: false,
      error: error?.message || 'Failed to load invoice document.',
    }
  }
}

export async function payMerchantSubscriptionInvoice(
  invoiceId: string,
): Promise<{
  success: boolean
  invoiceId?: string
  status?: string
  transactionId?: string | null
  error?: string
}> {
  if (!invoiceId?.trim()) {
    return { success: false, error: 'invoiceId is required.' }
  }

  try {
    const { merchantId, serviceRole } = await resolveMerchantForCurrentOrg()
    const { data: invoice, error: invoiceError } = await serviceRole
      .from('subscription_invoices')
      .select('id, status')
      .eq('id', invoiceId)
      .eq('merchant_id', merchantId)
      .maybeSingle()

    if (invoiceError || !invoice) {
      return { success: false, error: 'Invoice not found.' }
    }

    if (invoice.status === 'paid') {
      return {
        success: true,
        invoiceId: invoice.id,
        status: invoice.status,
        transactionId: null,
      }
    }

    if (!['open', 'failed'].includes(invoice.status)) {
      return {
        success: false,
        error: `Invoice cannot be paid while its status is ${invoice.status}.`,
      }
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceRoleKey) {
      return {
        success: false,
        error: 'Subscription payment service is not configured.',
      }
    }

    const response = await fetch(
      `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/billing-charge-subscription`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          apikey: serviceRoleKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ invoice_id: invoice.id }),
        cache: 'no-store',
      },
    )

    const payload = (await response.json().catch(() => ({}))) as {
      success?: boolean
      error?: string
      invoice_id?: string
      status?: string
      transaction_id?: string | null
    }

    if (!response.ok || !payload.success) {
      return {
        success: false,
        error: payload.error || 'The invoice payment could not be completed.',
      }
    }

    revalidatePath('/dashboard/subscriptions')
    revalidatePath('/dashboard/settings/billing')

    return {
      success: true,
      invoiceId: payload.invoice_id ?? invoice.id,
      status: payload.status,
      transactionId: payload.transaction_id ?? null,
    }
  } catch (error) {
    console.error('[payMerchantSubscriptionInvoice] exception:', error)
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'The invoice payment could not be completed.',
    }
  }
}
