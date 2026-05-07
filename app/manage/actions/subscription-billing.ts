'use server'

import { revalidatePath } from 'next/cache'
import { assertHQPermission } from '@/lib/admin/auth'
import { createServerSupabaseClient } from '@/lib/supabase/server'

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

export interface MerchantSubscriptionRecord {
  id: string
  merchant_id: string
  location_id: string
  location_name: string
  plan_id: string
  plan_code: string
  display_name: string
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
  planId: string
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

  if (!params.merchantId || !params.locationId || !params.planId) {
    return { success: false, error: 'merchantId, locationId, and planId are required.' }
  }

  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase.rpc('upsert_merchant_subscription', {
    p_subscription_id: params.subscriptionId ?? null,
    p_merchant_id: params.merchantId,
    p_location_id: params.locationId,
    p_plan_id: params.planId,
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

  revalidatePath('/manage/billing')
  revalidatePath(`/manage/merchants/${params.merchantId}`)
  revalidatePath(`/manage/merchants/${params.merchantId}/billing`)

  return { success: true, subscriptionId: data as string }
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
