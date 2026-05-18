'use server'

import { revalidatePath } from 'next/cache'
import { assertHQPermission } from '@/lib/admin/auth'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { sendEmail } from '@/lib/messaging/resend'
import {
  formatLongDate,
  formatShortDateRange,
  formatUsd,
  renderSubscriptionInvoiceHtml,
  type SubscriptionInvoiceDocumentData,
  type SubscriptionInvoiceLineItem,
} from '@/lib/subscription-billing/invoice-template'

export interface SubscriptionPlanRecord {
  id: string
  plan_code: string
  display_name: string
  base_price_monthly: number
  included_stations: number
  per_extra_station_price: number
  card_surcharge_pct: number
  is_active: boolean
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface BillableServiceRecord {
  id: string
  service_code: string
  display_name: string
  service_category: 'hardware' | 'software' | 'service'
  pricing_model: 'flat' | 'per_unit' | 'tiered'
  base_price_monthly: number
  additional_unit_price: number | null
  included_quantity: number
  card_surcharge_pct: number
  unit_label: string
  is_active: boolean
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface SubscriptionServiceAssignmentRecord {
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

export interface MerchantSubscriptionRecord {
  id: string
  merchant_id: string
  location_id: string
  location_name: string
  plan_id: string | null
  plan_code: string | null
  display_name: string | null
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

async function sendSubscriptionLifecycleEmail(params: {
  to: string
  subject: string
  document: SubscriptionInvoiceDocumentData
}) {
  const html = renderSubscriptionInvoiceHtml(params.document)
  const result = await sendEmail(params.to, params.subject, html)
  if ('error' in result) {
    throw new Error(result.error)
  }
}

export interface SubscriptionInvoiceRecord {
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

export interface MerchantTierPlanRecord {
  id: string
  plan_code: string
  display_name: string
  min_locations: number | null
  max_locations: number | null
  monthly_price_cents: number
  description: string | null
  display_order: number
  is_active: boolean
}

export interface MerchantTierSubscriptionRecord {
  id: string
  merchant_id: string
  plan_id: string
  plan_code: string
  display_name: string
  min_locations: number | null
  max_locations: number | null
  monthly_price_cents: number
  description: string | null
  status: 'active' | 'past_due' | 'suspended' | 'cancelled'
  current_period_start: string
  current_period_end: string
  trial_ends_at: string | null
  created_at: string
  updated_at: string
}

export interface MerchantTierStatusRecord {
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

export interface UpsertMerchantTierSubscriptionParams {
  merchantId: string
  planId: string
  status: 'active' | 'past_due' | 'suspended' | 'cancelled'
  currentPeriodStart: string
  currentPeriodEnd: string
  trialEndsAt?: string | null
}

export interface UpsertMerchantSubscriptionParams {
  subscriptionId?: string
  merchantId: string
  locationId: string
  planId?: string | null
  currentPeriodStart: string
  currentPeriodEnd: string
  nextBillingDate: string
  status?: 'trial' | 'active' | 'past_due' | 'suspended' | 'canceled'
  trialEndsAt?: string | null
  billingProfileId?: string | null
  metadata?: Record<string, unknown>
}

interface InvoiceDocumentContext {
  merchantName: string
  locationName: string
  billingEmail: string | null
  accountHolderName: string | null
}

function toNumber(value: unknown): number {
  const amount = Number(value ?? 0)
  return Number.isFinite(amount) ? amount : 0
}

function dexaBillingParty() {
  const sender = process.env.RESEND_FROM_EMAIL || 'support@dexaposai.com'

  return {
    title: 'Bill from',
    lines: ['Dexa POS Billing', sender],
  }
}

function billToParty(context: InvoiceDocumentContext) {
  return {
    title: 'Bill to',
    lines: [
      context.merchantName,
      context.locationName,
      context.accountHolderName || '',
      context.billingEmail || '',
    ].filter(Boolean),
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
    const code = typeof item.code === 'string' ? item.code : null

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
      code,
      description:
        String(
          item.description ??
          item.display_name ??
          item.service_code ??
          item.code ??
          'Line item'
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
}): { summaryTitle: string; finalAmountLabel: string; finalAmountValue: number } {
  const amountLabel = formatUsd(invoice.total_amount)

  if (invoice.status === 'paid') {
    return {
      summaryTitle: `${amountLabel} paid ${formatLongDate(invoice.paid_at || invoice.due_date)}`,
      finalAmountLabel: 'Amount paid',
      finalAmountValue: invoice.total_amount,
    }
  }

  if (invoice.status === 'voided') {
    return {
      summaryTitle: `${amountLabel} voided`,
      finalAmountLabel: 'Amount due',
      finalAmountValue: 0,
    }
  }

  if (invoice.status === 'refunded') {
    return {
      summaryTitle: `${amountLabel} refunded`,
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

function buildSubscriptionLifecycleDocument(params: {
  title: string
  invoiceNumber?: string | null
  issuedOn?: string | null
  dueDate?: string | null
  statusLabel?: string | null
  summaryTitle: string
  context: InvoiceDocumentContext
  lineItems: SubscriptionInvoiceLineItem[]
  subtotal?: number | null
  surcharge?: number | null
  total?: number | null
  finalAmountLabel?: string | null
  finalAmountValue?: number | null
  footerNote?: string | null
}): SubscriptionInvoiceDocumentData {
  return {
    title: params.title,
    invoiceNumber: params.invoiceNumber ?? null,
    issuedOn: params.issuedOn ?? null,
    dueDate: params.dueDate ?? null,
    statusLabel: params.statusLabel ?? null,
    summaryTitle: params.summaryTitle,
    fromParty: dexaBillingParty(),
    toParty: billToParty(params.context),
    lineItems: params.lineItems,
    subtotal: params.subtotal ?? null,
    surcharge: params.surcharge ?? null,
    total: params.total ?? null,
    finalAmountLabel: params.finalAmountLabel ?? null,
    finalAmountValue: params.finalAmountValue ?? null,
    footerNote: params.footerNote ?? null,
  }
}

function buildAssignmentPreviewLineItems(
  assignments: SubscriptionServiceAssignmentRecord[],
  periodStart: string,
  periodEnd: string,
): { lineItems: SubscriptionInvoiceLineItem[]; subtotal: number } {
  const periodLabel = formatShortDateRange(periodStart, periodEnd)
  let subtotal = 0

  const lineItems = assignments.map((assignment) => {
    let amount = 0

    if (assignment.pricing_model === 'flat') {
      amount = toNumber(assignment.base_price_monthly)
    } else if (assignment.pricing_model === 'per_unit') {
      amount = toNumber(assignment.base_price_monthly) * assignment.quantity
    } else {
      const base = toNumber(assignment.base_price_monthly)
      const additionalQuantity = Math.max(0, assignment.quantity - toNumber(assignment.included_quantity))
      amount = base + additionalQuantity * toNumber(assignment.additional_unit_price)
    }

    subtotal += amount

    return {
      code: assignment.service_code,
      description: assignment.display_name,
      periodLabel,
      quantity: assignment.quantity,
      unitPrice: assignment.quantity > 0 ? amount / assignment.quantity : amount,
      amount,
    }
  })

  return { lineItems, subtotal }
}

export async function getSubscriptionPlans(): Promise<SubscriptionPlanRecord[]> {
  await assertHQPermission('system.billing.manage')

  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('plan_scope', 'service_billing')
    .order('display_name', { ascending: true })

  if (error) {
    console.error('[getSubscriptionPlans] Error:', error)
    throw new Error('Failed to load subscription plans.')
  }

  return (data ?? []) as SubscriptionPlanRecord[]
}

export async function getMerchantTierPlans(): Promise<MerchantTierPlanRecord[]> {
  await assertHQPermission('system.billing.manage')

  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('subscription_plans')
    .select('id, plan_code, display_name, min_locations, max_locations, monthly_price_cents, description, display_order, is_active')
    .eq('plan_scope', 'merchant_tier')
    .eq('is_active', true)
    .order('display_order', { ascending: true })
    .order('display_name', { ascending: true })

  if (error) {
    console.error('[getMerchantTierPlans] Error:', error)
    throw new Error('Failed to load merchant tier plans.')
  }

  return ((data ?? []) as MerchantTierPlanRecord[]).map((row) => ({
    ...row,
    min_locations: row.min_locations === null ? null : Number(row.min_locations || 0),
    max_locations: row.max_locations === null ? null : Number(row.max_locations || 0),
    monthly_price_cents: Number(row.monthly_price_cents || 0),
    display_order: Number(row.display_order || 0),
  }))
}

export async function getMerchantTierStatus(
  merchantId: string,
): Promise<MerchantTierStatusRecord> {
  await assertHQPermission('system.billing.manage')

  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase.rpc('get_merchant_subscription_status', {
    p_merchant_id: merchantId,
  })

  if (error) {
    console.error('[getMerchantTierStatus] Error:', error)
    throw new Error('Failed to load merchant plan status.')
  }

  const raw = (data ?? {}) as Record<string, any>

  return {
    plan: raw.plan
      ? {
          code: String(raw.plan.code),
          name: String(raw.plan.name),
          min_locations: raw.plan.min_locations === null ? null : Number(raw.plan.min_locations || 0),
          max_locations: raw.plan.max_locations === null ? null : Number(raw.plan.max_locations || 0),
          monthly_price_cents: Number(raw.plan.monthly_price_cents || 0),
          description: typeof raw.plan.description === 'string' ? raw.plan.description : null,
        }
      : null,
    active_location_count: Number(raw.active_location_count || 0),
    is_over_limit: Boolean(raw.is_over_limit),
    required_plan_code: typeof raw.required_plan_code === 'string' ? raw.required_plan_code : null,
    subscription_status:
      typeof raw.subscription_status === 'string'
        ? (raw.subscription_status as MerchantTierStatusRecord['subscription_status'])
        : null,
    current_period_end: typeof raw.current_period_end === 'string' ? raw.current_period_end : null,
  }
}

export async function getMerchantTierSubscription(
  merchantId: string,
): Promise<MerchantTierSubscriptionRecord | null> {
  await assertHQPermission('system.billing.manage')

  const serviceRole = createServiceRoleClient()
  const { data, error } = await serviceRole
    .from('merchant_plan_subscriptions')
    .select(`
      id,
      merchant_id,
      plan_id,
      status,
      current_period_start,
      current_period_end,
      trial_ends_at,
      created_at,
      updated_at,
      subscription_plans!inner(
        plan_code,
        display_name,
        min_locations,
        max_locations,
        monthly_price_cents,
        description
      )
    `)
    .eq('merchant_id', merchantId)
    .eq('subscription_plans.plan_scope', 'merchant_tier')
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[getMerchantTierSubscription] Error:', error)
    throw new Error('Failed to load merchant plan subscription.')
  }

  if (!data) {
    return null
  }

  const plan = Array.isArray((data as any).subscription_plans)
    ? (data as any).subscription_plans[0]
    : (data as any).subscription_plans

  return {
    id: data.id as string,
    merchant_id: data.merchant_id as string,
    plan_id: data.plan_id as string,
    plan_code: String(plan?.plan_code || ''),
    display_name: String(plan?.display_name || ''),
    min_locations: plan?.min_locations === null ? null : Number(plan?.min_locations || 0),
    max_locations: plan?.max_locations === null ? null : Number(plan?.max_locations || 0),
    monthly_price_cents: Number(plan?.monthly_price_cents || 0),
    description: typeof plan?.description === 'string' ? plan.description : null,
    status: data.status as MerchantTierSubscriptionRecord['status'],
    current_period_start: data.current_period_start as string,
    current_period_end: data.current_period_end as string,
    trial_ends_at: (data.trial_ends_at as string | null) ?? null,
    created_at: data.created_at as string,
    updated_at: data.updated_at as string,
  }
}

export async function upsertMerchantTierSubscription(
  params: UpsertMerchantTierSubscriptionParams,
): Promise<{ success: boolean; subscriptionId?: string; error?: string }> {
  await assertHQPermission('system.billing.manage')

  if (!params.merchantId || !params.planId) {
    return { success: false, error: 'merchantId and planId are required.' }
  }

  const serviceRole = createServiceRoleClient()
  const { data: existing, error: existingError } = await serviceRole
    .from('merchant_plan_subscriptions')
    .select('id, status')
    .eq('merchant_id', params.merchantId)
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingError) {
    console.error('[upsertMerchantTierSubscription] Existing lookup error:', existingError)
    return { success: false, error: 'Failed to load existing merchant plan.' }
  }

  const payload = {
    merchant_id: params.merchantId,
    plan_id: params.planId,
    status: params.status,
    current_period_start: params.currentPeriodStart,
    current_period_end: params.currentPeriodEnd,
    trial_ends_at: params.trialEndsAt ?? null,
  }

  const result = existing?.id
    ? await serviceRole
        .from('merchant_plan_subscriptions')
        .update(payload)
        .eq('id', existing.id)
        .select('id')
        .single()
    : await serviceRole
        .from('merchant_plan_subscriptions')
        .insert(payload)
        .select('id')
        .single()

  if (result.error || !result.data) {
    console.error('[upsertMerchantTierSubscription] Upsert error:', result.error)
    return { success: false, error: result.error?.message || 'Failed to save merchant plan.' }
  }

  revalidatePath('/manage/subscriptions')
  revalidatePath(`/manage/subscriptions/${params.merchantId}`)
  revalidatePath('/dashboard/subscriptions')

  return { success: true, subscriptionId: result.data.id as string }
}

export async function getBillableServices(): Promise<BillableServiceRecord[]> {
  await assertHQPermission('system.billing.manage')

  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('billable_services')
    .select('*')
    .eq('is_active', true)
    .order('service_category', { ascending: true })
    .order('display_name', { ascending: true })

  if (error) {
    console.error('[getBillableServices] Error:', error)
    throw new Error('Failed to load billable services.')
  }

  return ((data ?? []) as BillableServiceRecord[]).map((row) => ({
    ...row,
    base_price_monthly: Number(row.base_price_monthly || 0),
    additional_unit_price: row.additional_unit_price === null ? null : Number(row.additional_unit_price || 0),
    included_quantity: Number(row.included_quantity || 0),
    card_surcharge_pct: Number(row.card_surcharge_pct || 0),
  }))
}

export async function getMerchantSubscriptions(
  merchantId: string
): Promise<MerchantSubscriptionRecord[]> {
  await assertHQPermission('system.billing.manage')

  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase.rpc('list_merchant_subscriptions', {
    p_merchant_id: merchantId,
  })

  if (error) {
    console.error('[getMerchantSubscriptions] Error:', error)
    throw new Error('Failed to load merchant subscriptions.')
  }

  return ((data ?? []) as MerchantSubscriptionRecord[]).map((row) => ({
    ...row,
    station_count: Number(row.station_count || 0),
    monthly_amount: Number(row.monthly_amount || 0),
  }))
}

export async function upsertMerchantSubscription(
  params: UpsertMerchantSubscriptionParams
): Promise<{ success: boolean; subscriptionId?: string; error?: string }> {
  await assertHQPermission('system.billing.manage')

  if (!params.merchantId || !params.locationId) {
    return { success: false, error: 'merchantId and locationId are required.' }
  }

  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase.rpc('upsert_merchant_subscription', {
    p_subscription_id: params.subscriptionId ?? null,
    p_merchant_id: params.merchantId,
    p_location_id: params.locationId,
    p_plan_id: params.planId ?? null,
    p_current_period_start: params.currentPeriodStart,
    p_current_period_end: params.currentPeriodEnd,
    p_next_billing_date: params.nextBillingDate,
    p_status: params.status ?? 'active',
    p_trial_ends_at: params.trialEndsAt ?? null,
    p_billing_profile_id: params.billingProfileId ?? null,
    p_metadata: params.metadata ?? {},
  })

  if (error) {
    console.error('[upsertMerchantSubscription] Error:', error)
    return { success: false, error: error.message }
  }

  try {
    const serviceRole = createServiceRoleClient()
    const [subscriptionRecord, locationRecord, merchantRecord, billingProfileRecord] = await Promise.all([
      serviceRole
        .from('merchant_subscriptions')
        .select('id, monthly_amount, status, location_id')
        .eq('id', data as string)
        .maybeSingle(),
      serviceRole
        .from('locations')
        .select('id, name')
        .eq('id', params.locationId)
        .maybeSingle(),
      serviceRole
        .from('merchants')
        .select('id, name, owner_email')
        .eq('id', params.merchantId)
        .maybeSingle(),
      params.billingProfileId
        ? serviceRole
            .from('merchant_billing_profiles')
            .select('id, billing_email')
            .eq('id', params.billingProfileId)
            .maybeSingle()
        : serviceRole
            .from('merchant_billing_profiles')
            .select('id, billing_email')
            .eq('merchant_id', params.merchantId)
            .eq('location_id', params.locationId)
            .eq('is_primary', true)
            .eq('is_active', true)
            .maybeSingle(),
    ])

    const recipientEmail =
      billingProfileRecord.data?.billing_email?.trim() || merchantRecord.data?.owner_email?.trim() || ''

    if (recipientEmail && params.status === 'canceled') {
      const locationName = locationRecord.data?.name || 'Location'
      const merchantName = merchantRecord.data?.name || 'Dexa POS'

      await sendSubscriptionLifecycleEmail({
        to: recipientEmail,
        subject: `Dexa subscription canceled - ${locationName}`,
        document: buildSubscriptionLifecycleDocument({
          title: 'Subscription Canceled',
          issuedOn: new Date().toISOString(),
          statusLabel: 'canceled',
          summaryTitle: 'No further recurring charges will be generated.',
          context: {
            merchantName,
            locationName,
            billingEmail: billingProfileRecord.data?.billing_email || null,
            accountHolderName: null,
          },
          lineItems: [
            {
              code: 'subscription_canceled',
              description: 'Recurring subscription canceled',
              periodLabel: null,
              quantity: 1,
              unitPrice: 0,
              amount: 0,
            },
          ],
          footerNote:
            `The subscription for ${locationName} has been canceled.\n` +
            `No amount is currently due for this cancellation notice.`,
        }),
      })
    }
  } catch (emailError) {
    console.error('[upsertMerchantSubscription] Failed to send lifecycle email:', emailError)
  }

  revalidatePath('/manage/billing')
  revalidatePath(`/manage/merchants/${params.merchantId}`)
  revalidatePath(`/manage/merchants/${params.merchantId}/billing`)

  return { success: true, subscriptionId: data as string }
}

export async function getSubscriptionServiceAssignments(
  subscriptionId: string
): Promise<SubscriptionServiceAssignmentRecord[]> {
  await assertHQPermission('system.billing.manage')

  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase.rpc('list_subscription_service_assignments', {
    p_subscription_id: subscriptionId,
  })

  if (error) {
    console.error('[getSubscriptionServiceAssignments] Error:', error)
    throw new Error('Failed to load subscription service assignments.')
  }

  return ((data ?? []) as SubscriptionServiceAssignmentRecord[]).map((row) => ({
    ...row,
    quantity: Number(row.quantity || 0),
    base_price_monthly: Number(row.base_price_monthly || 0),
    additional_unit_price: row.additional_unit_price === null ? null : Number(row.additional_unit_price || 0),
    included_quantity: Number(row.included_quantity || 0),
    card_surcharge_pct: Number(row.card_surcharge_pct || 0),
  }))
}

export async function replaceSubscriptionServiceAssignments(
  subscriptionId: string,
  services: Array<{
    serviceId: string
    quantity: number
    enabled?: boolean
    metadata?: Record<string, unknown>
  }>
): Promise<{ success: boolean; error?: string }> {
  await assertHQPermission('system.billing.manage')

  if (!subscriptionId?.trim()) {
    return { success: false, error: 'subscriptionId is required.' }
  }

  const supabase = createServerSupabaseClient()
  const { error } = await supabase.rpc('replace_merchant_subscription_services', {
    p_subscription_id: subscriptionId,
    p_services: services.map((service) => ({
      service_id: service.serviceId,
      quantity: service.quantity,
      enabled: service.enabled ?? true,
      metadata: service.metadata ?? {},
    })),
  })

  if (error) {
    console.error('[replaceSubscriptionServiceAssignments] Error:', error)
    return { success: false, error: error.message }
  }

  try {
    const serviceRole = createServiceRoleClient()
    const [subscriptionRecord, assignmentRecord] = await Promise.all([
      serviceRole
        .from('merchant_subscriptions')
        .select('id, merchant_id, location_id, monthly_amount, status, current_period_start, current_period_end, next_billing_date')
        .eq('id', subscriptionId)
        .maybeSingle(),
      serviceRole.rpc('list_subscription_service_assignments', {
        p_subscription_id: subscriptionId,
      }),
    ])

    if (subscriptionRecord.data && subscriptionRecord.data.status !== 'canceled') {
      const [{ data: merchantRecord }, { data: locationRecord }, { data: billingProfileRecord }] = await Promise.all([
        serviceRole
          .from('merchants')
          .select('name, owner_email')
          .eq('id', subscriptionRecord.data.merchant_id)
          .maybeSingle(),
        serviceRole
          .from('locations')
          .select('name')
          .eq('id', subscriptionRecord.data.location_id)
          .maybeSingle(),
        serviceRole
          .from('merchant_billing_profiles')
          .select('billing_email')
          .eq('merchant_id', subscriptionRecord.data.merchant_id)
          .eq('location_id', subscriptionRecord.data.location_id)
          .eq('is_primary', true)
          .eq('is_active', true)
          .maybeSingle(),
      ])

      const recipientEmail =
        billingProfileRecord?.billing_email?.trim() || merchantRecord?.owner_email?.trim() || ''

      if (recipientEmail) {
        const assignmentCount = Array.isArray(assignmentRecord.data) ? assignmentRecord.data.length : 0
        const locationName = locationRecord?.name || 'Location'
        const merchantName = merchantRecord?.name || 'Dexa POS'
        const monthlyAmount = Number(subscriptionRecord.data.monthly_amount || 0)
        const periodStart = subscriptionRecord.data.current_period_start || new Date().toISOString()
        const periodEnd = subscriptionRecord.data.current_period_end || periodStart
        const assignmentRows = (assignmentRecord.data ?? []) as SubscriptionServiceAssignmentRecord[]
        const pricingPreview = buildAssignmentPreviewLineItems(assignmentRows, periodStart, periodEnd)
        const surcharge = Math.max(0, monthlyAmount - pricingPreview.subtotal)

        await sendSubscriptionLifecycleEmail({
          to: recipientEmail,
          subject: `Dexa subscription active - ${locationName}`,
          document: buildSubscriptionLifecycleDocument({
            title: 'Subscription Activated',
            issuedOn: new Date().toISOString(),
            dueDate: subscriptionRecord.data.next_billing_date || null,
            statusLabel: 'active',
            summaryTitle: `${formatUsd(monthlyAmount)} billed monthly`,
            context: {
              merchantName,
              locationName,
              billingEmail: billingProfileRecord?.billing_email || null,
              accountHolderName: null,
            },
            lineItems: pricingPreview.lineItems,
            subtotal: pricingPreview.subtotal,
            surcharge,
            total: monthlyAmount,
            finalAmountLabel: 'Recurring monthly total',
            finalAmountValue: monthlyAmount,
            footerNote:
              `Assigned services: ${assignmentCount}\n` +
              `Future subscription invoices and payment confirmations will be sent to this billing email.`,
          }),
        })
      } else {
        console.warn(
          '[replaceSubscriptionServiceAssignments] No recipient email found for subscription lifecycle email.',
          {
            merchantId: subscriptionRecord.data.merchant_id,
            locationId: subscriptionRecord.data.location_id,
          }
        )
      }
    }
  } catch (emailError) {
    console.error('[replaceSubscriptionServiceAssignments] Failed to send lifecycle email:', emailError)
  }

  revalidatePath('/manage/billing')
  return { success: true }
}

export async function generateSubscriptionInvoiceManually(
  subscriptionId: string,
  dueDate?: string | null
): Promise<{ success: boolean; invoiceId?: string; error?: string }> {
  await assertHQPermission('system.billing.manage')

  if (!subscriptionId?.trim()) {
    return { success: false, error: 'subscriptionId is required.' }
  }

  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase.rpc('generate_subscription_invoice', {
    p_subscription_id: subscriptionId,
    p_due_date: dueDate ?? null,
  })

  if (error) {
    console.error('[generateSubscriptionInvoiceManually] Error:', error)
    return { success: false, error: error.message }
  }

  revalidatePath('/manage/billing')
  return { success: true, invoiceId: data as string }
}

export async function getSubscriptionInvoices(
  merchantId: string,
  locationId?: string | null,
  limit = 100
): Promise<SubscriptionInvoiceRecord[]> {
  await assertHQPermission('system.billing.manage')

  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase.rpc('list_subscription_invoices', {
    p_merchant_id: merchantId,
    p_location_id: locationId ?? null,
    p_limit: limit,
  })

  if (error) {
    console.error('[getSubscriptionInvoices] Error:', error)
    throw new Error('Failed to load subscription invoices.')
  }

  return ((data ?? []) as SubscriptionInvoiceRecord[]).map((row) => ({
    ...row,
    station_count_snapshot: Number(row.station_count_snapshot || 0),
    subtotal: Number(row.subtotal || 0),
    card_surcharge: Number(row.card_surcharge || 0),
    total_amount: Number(row.total_amount || 0),
    payment_attempt_count: Number(row.payment_attempt_count || 0),
  }))
}

export async function getSubscriptionInvoiceDocument(
  invoiceId: string,
): Promise<{ success: boolean; document?: SubscriptionInvoiceDocumentData; error?: string }> {
  await assertHQPermission('system.billing.manage')

  if (!invoiceId?.trim()) {
    return { success: false, error: 'invoiceId is required.' }
  }

  const serviceRole = createServiceRoleClient()
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
    .maybeSingle()

  if (invoiceError || !invoice) {
    console.error('[getSubscriptionInvoiceDocument] Invoice lookup error:', invoiceError)
    return { success: false, error: 'Invoice not found.' }
  }

  const [{ data: merchant }, { data: location }, billingProfileResult] = await Promise.all([
    serviceRole
      .from('merchants')
      .select('name')
      .eq('id', invoice.merchant_id)
      .maybeSingle(),
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
          .eq('merchant_id', invoice.merchant_id)
          .eq('location_id', invoice.location_id)
          .eq('is_primary', true)
          .eq('is_active', true)
          .maybeSingle(),
  ])

  const invoiceSummary = buildInvoiceStatusSummary({
    status: invoice.status,
    total_amount: toNumber(invoice.total_amount),
    paid_at: invoice.paid_at,
    due_date: invoice.due_date,
  })

  return {
    success: true,
    document: buildSubscriptionLifecycleDocument({
      title: 'Invoice',
      invoiceNumber: invoice.invoice_number,
      issuedOn: invoice.created_at,
      dueDate: invoice.due_date,
      statusLabel: invoice.status,
      summaryTitle: invoiceSummary.summaryTitle,
      context: {
        merchantName: merchant?.name || 'Merchant',
        locationName: location?.name || 'Location',
        billingEmail: billingProfileResult.data?.billing_email || null,
        accountHolderName: billingProfileResult.data?.account_holder_name || null,
      },
      lineItems: normalizeSubscriptionInvoiceLineItems(
        (invoice.line_items as Array<Record<string, unknown>> | null) ?? [],
        invoice.billing_period_start,
        invoice.billing_period_end,
      ),
      subtotal: toNumber(invoice.subtotal),
      surcharge: toNumber(invoice.card_surcharge),
      total: toNumber(invoice.total_amount),
      finalAmountLabel: invoiceSummary.finalAmountLabel,
      finalAmountValue: invoiceSummary.finalAmountValue,
      footerNote:
        invoice.status === 'paid'
          ? 'Payment processed successfully through Dexa Billing.'
          : 'This invoice reflects the current subscription billing state for this location.',
    }),
  }
}

export async function chargeSubscriptionInvoiceManually(
  invoiceId: string
): Promise<{ success: boolean; invoiceId?: string; status?: string; transactionId?: string | null; error?: string }> {
  await assertHQPermission('system.billing.manage')

  if (!invoiceId?.trim()) {
    return { success: false, error: 'invoiceId is required.' }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return { success: false, error: 'Missing Supabase server configuration.' }
  }

  const response = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/functions/v1/billing-charge-subscription`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ invoice_id: invoiceId }),
    cache: 'no-store',
  })

  const payload = await response.json().catch(() => ({})) as {
    success?: boolean
    error?: string
    invoice_id?: string
    status?: string
    transaction_id?: string | null
  }

  if (!response.ok || !payload.success) {
    return {
      success: false,
      error: payload.error || 'Failed to charge invoice.',
    }
  }

  const serviceRole = createServiceRoleClient()
  const { data: invoice } = await serviceRole
    .from('subscription_invoices')
    .select('merchant_id')
    .eq('id', invoiceId)
    .maybeSingle()

  revalidatePath('/manage/billing')
  if (invoice?.merchant_id) {
    revalidatePath(`/manage/merchants/${invoice.merchant_id}`)
    revalidatePath(`/manage/merchants/${invoice.merchant_id}/billing`)
  }

  return {
    success: true,
    invoiceId: payload.invoice_id,
    status: payload.status,
    transactionId: payload.transaction_id ?? null,
  }
}
