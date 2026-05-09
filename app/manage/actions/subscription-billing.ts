'use server'

import { revalidatePath } from 'next/cache'
import { assertHQPermission } from '@/lib/admin/auth'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { buildEmailTemplate, sendEmail } from '@/lib/messaging/resend'

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

function formatUsd(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount)
}

async function sendSubscriptionLifecycleEmail(params: {
  to: string
  merchantName: string
  locationName: string
  subject: string
  body: string
}) {
  const html = buildEmailTemplate(params.merchantName, params.subject, params.body)
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

export async function getSubscriptionPlans(): Promise<SubscriptionPlanRecord[]> {
  await assertHQPermission('system.billing.manage')

  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('subscription_plans')
    .select('*')
    .order('display_name', { ascending: true })

  if (error) {
    console.error('[getSubscriptionPlans] Error:', error)
    throw new Error('Failed to load subscription plans.')
  }

  return (data ?? []) as SubscriptionPlanRecord[]
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
      serviceRole.rpc('list_subscription_service_assignments', {
        p_subscription_id: data as string,
      }),
    ])

    const recipientEmail =
      billingProfileRecord.data?.billing_email?.trim() || merchantRecord.data?.owner_email?.trim() || ''

    if (recipientEmail && params.status === 'canceled') {
      const locationName = locationRecord.data?.name || 'Location'
      const merchantName = merchantRecord.data?.name || 'Dexa POS'

      await sendSubscriptionLifecycleEmail({
        to: recipientEmail,
        merchantName,
        locationName,
        subject: `Dexa subscription canceled - ${locationName}`,
        body:
          `The subscription for ${locationName} has been canceled.\n\n` +
          `No further recurring subscription charges should be generated for this location while it remains canceled.`,
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
        .select('id, merchant_id, location_id, monthly_amount, status')
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

        await sendSubscriptionLifecycleEmail({
          to: recipientEmail,
          merchantName,
          locationName,
          subject: `Dexa subscription active - ${locationName}`,
          body:
            `Your subscription for ${locationName} is active.\n\n` +
            `Assigned services: ${assignmentCount}\n` +
            `Recurring monthly total: ${formatUsd(monthlyAmount)}\n\n` +
            `Future subscription invoices and payment confirmations will be sent to this billing email.`,
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
