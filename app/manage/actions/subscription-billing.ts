'use server'

import { revalidatePath } from 'next/cache'
import { assertHQPermission } from '@/lib/admin/auth'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { buildEmailTemplate, sendEmail } from '@/lib/messaging/resend'
import { createAppNotification } from '@/lib/notifications/app-notifications'
import {
  formatLongDate,
  formatShortDateRange,
  formatUsd,
  renderSubscriptionInvoiceHtml,
  type SubscriptionInvoiceDocumentData,
  type SubscriptionInvoiceLineItem,
} from '@/lib/subscription-billing/invoice-template'
import { resolveMonthlyBillingPeriod } from '@/lib/subscription-billing/billing-period'
import {
  activateSubscription as activateValorSubscription,
  deactivateSubscription as deactivateValorSubscription,
  deleteSubscription as deleteValorSubscription,
} from '@/lib/payments/valor/subscriptionApi'

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

export interface DeviceBillingServiceMappingRecord {
  id: string
  device_category: string
  service_code: string
  is_active: boolean
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface UpsertDeviceBillingServiceMappingParams {
  deviceCategory: string
  serviceCode: string
  isActive?: boolean
  metadata?: Record<string, unknown>
}

export interface UpsertBillableServiceParams {
  serviceId?: string | null
  serviceCode: string
  displayName: string
  serviceCategory: 'hardware' | 'software' | 'service'
  pricingModel: 'flat' | 'per_unit' | 'tiered'
  basePriceMonthly: number
  additionalUnitPrice?: number | null
  includedQuantity?: number
  cardSurchargePct?: number
  unitLabel?: string
  isActive?: boolean
  metadata?: Record<string, unknown>
}

export interface UpsertSubscriptionPlanParams {
  planId?: string | null
  planCode: string
  displayName: string
  basePriceMonthly: number
  includedStations: number
  perExtraStationPrice: number
  cardSurchargePct: number
  isActive?: boolean
  metadata?: Record<string, unknown>
}

export interface SubscriptionQuoteResult {
  station_count: number
  billing_method: 'ach' | 'card'
  line_items: Array<Record<string, unknown>>
  subtotal: number
  card_surcharge: number
  total_amount: number
}

export interface CalculateSubscriptionTotalParams {
  planId?: string | null
  stationCount: number
  billingMethod?: 'ach' | 'card'
  services?: Array<{
    serviceId?: string | null
    serviceCode?: string | null
    quantity: number
  }>
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
  grace_period_ends_at: string | null
  grace_reason: string | null
  grace_extended_at: string | null
  grace_extended_by: string | null
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
  next_retry_at: string | null
  retry_exhausted_at: string | null
  processor: 'valor' | null
  processor_account_id: string | null
  processor_transaction_id: string | null
  processor_response: Record<string, unknown> | null
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
  requestId?: string
  status: 'active' | 'past_due' | 'suspended' | 'cancelled'
  currentPeriodStart: string
  currentPeriodEnd?: string | null
  trialEndsAt?: string | null
}

export interface MerchantTierPlanRequestRecord {
  id: string
  request_number: string
  merchant_id: string
  current_plan_id: string | null
  current_plan_name: string | null
  requested_plan_id: string
  requested_plan_code: string
  requested_plan_name: string
  requested_monthly_price_cents: number
  requested_by: string
  status: 'pending' | 'approved' | 'denied' | 'cancelled'
  requested_at: string
  reviewed_at: string | null
  reviewed_by: string | null
  decision_note: string | null
  applied_subscription_id: string | null
}

export interface MerchantHardwareRequestRecord {
  id: string
  request_number: string
  merchant_id: string
  location_id: string
  location_name: string
  requested_quantity: number
  request_note: string | null
  requested_by: string
  status: 'pending' | 'approved' | 'denied' | 'cancelled'
  requested_at: string
  reviewed_at: string | null
  reviewed_by: string | null
  decision_note: string | null
}

function escapeEmailText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

async function notifyMerchantOfTierAssignment(params: {
  merchantId: string
  planId: string
  requestId?: string
  status: UpsertMerchantTierSubscriptionParams['status']
  adminUserId: string | null
  appliedMerchantPlanSubscriptionId: string
}): Promise<string | undefined> {
  const serviceRole = createServiceRoleClient()
  let pendingRequestQuery = (serviceRole as any)
    .from('subscription_plan_requests')
    .select('id, request_number')
    .eq('merchant_id', params.merchantId)
    .eq('requested_plan_id', params.planId)
    .eq('status', 'pending')

  if (params.requestId) {
    pendingRequestQuery = pendingRequestQuery.eq('id', params.requestId)
  }

  const [merchantResult, planResult, billingProfileResult, requestResult] =
    await Promise.all([
    serviceRole
      .from('merchants')
      .select('id, name, owner_email')
      .eq('id', params.merchantId)
      .maybeSingle(),
    serviceRole
      .from('subscription_plans')
      .select('id, plan_code, display_name, monthly_price_cents')
      .eq('id', params.planId)
      .maybeSingle(),
    serviceRole
      .from('merchant_billing_profiles')
      .select('billing_email')
      .eq('merchant_id', params.merchantId)
      .eq('is_primary', true)
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
      pendingRequestQuery
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (
    merchantResult.error ||
    !merchantResult.data ||
    planResult.error ||
    !planResult.data
  ) {
    console.error('[notifyMerchantOfTierAssignment] context lookup failed:', {
      merchantError: merchantResult.error,
      planError: planResult.error,
    })
    return 'Plan saved, but the merchant notification could not be prepared.'
  }

  if (requestResult.error) {
    console.error(
      '[notifyMerchantOfTierAssignment] request lookup failed:',
      requestResult.error,
    )
  }

  const merchant = merchantResult.data
  const plan = planResult.data
  const statusLabel = params.status.replace(/_/g, ' ')
  const message =
    `DEXA updated your merchant subscription to ${plan.display_name}. ` +
    `The subscription status is now ${statusLabel}.`
  const now = new Date().toISOString()
  let requestUpdateError: string | undefined
  let approvedRequest: { id: string; request_number: string } | null = null

  if (requestResult.data && params.status === 'active') {
    const { data: updatedRequest, error } = await (serviceRole as any)
      .from('subscription_plan_requests')
      .update({
        status: 'approved',
        reviewed_at: now,
        reviewed_by: params.adminUserId,
        decision_note: message,
        applied_subscription_id: params.appliedMerchantPlanSubscriptionId,
        updated_at: now,
      })
      .eq('id', requestResult.data.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle()

    if (error || !updatedRequest) {
      console.error(
        '[notifyMerchantOfTierAssignment] request approval failed:',
        error,
      )
      requestUpdateError =
        error?.message ||
        'The request was decided by another user before approval completed.'
    } else {
      approvedRequest = requestResult.data
    }
  }

  const inAppResult = await createAppNotification({
    audience: 'merchant',
    merchantId: params.merchantId,
    notificationType: approvedRequest
      ? 'subscription_plan_request_approved'
      : 'subscription_plan_assigned',
    title: approvedRequest
      ? `Subscription request ${approvedRequest.request_number} approved`
      : 'Subscription updated',
    body: message,
    href: '/dashboard/subscriptions',
    actorUserId: params.adminUserId,
    subscriptionPlanRequestId: approvedRequest?.id ?? null,
    metadata: {
      assigned_plan_id: plan.id,
      assigned_plan_code: plan.plan_code,
      subscription_status: params.status,
      applied_subscription_id: params.appliedMerchantPlanSubscriptionId,
    },
  })

  const recipient =
    billingProfileResult.data?.billing_email?.trim() ||
    merchant.owner_email?.trim() ||
    ''
  let emailError: string | undefined

  if (recipient) {
    const emailResult = await sendEmail(
      recipient,
      `DEXA subscription updated - ${plan.display_name}`,
      buildEmailTemplate(
        'DEXA POS',
        'Subscription updated',
        `${escapeEmailText(merchant.name)},\n\n${escapeEmailText(message)}\n\nYou can review the update on the Subscriptions page in your DEXA dashboard.`,
      ),
    )

    if ('error' in emailResult) {
      emailError = emailResult.error
      console.error(
        '[notifyMerchantOfTierAssignment] email failed:',
        emailResult.error,
      )
    }
  }

  if (requestUpdateError) {
    if (inAppResult.error && (emailError || !recipient)) {
      return 'Plan saved, but neither the request decision status nor merchant notification could be confirmed.'
    }
    return 'Plan saved and the merchant was notified, but the request decision status could not be confirmed.'
  }
  if (inAppResult.error && emailError) {
    return 'Plan saved, but neither the in-app nor email notification could be confirmed.'
  }
  if (inAppResult.error) {
    return 'Plan saved and email sent, but the in-app notification could not be confirmed.'
  }
  if (emailError) {
    return 'Plan saved and the in-app notification was created, but email delivery could not be confirmed.'
  }
  if (!recipient) {
    return 'Plan saved and the in-app notification was created; no merchant billing email is configured.'
  }

  return undefined
}

function addOneMonthPeriod(
  startDate: string,
  endDate: string,
): {
  nextPeriodStart: string
  nextPeriodEnd: string
} {
  const end = new Date(`${endDate}T00:00:00.000Z`)
  const nextStart = new Date(end)
  nextStart.setUTCDate(nextStart.getUTCDate() + 1)

  const nextEnd = new Date(nextStart)
  nextEnd.setUTCMonth(nextEnd.getUTCMonth() + 1)
  nextEnd.setUTCDate(nextEnd.getUTCDate() - 1)

  return {
    nextPeriodStart: nextStart.toISOString().slice(0, 10),
    nextPeriodEnd: nextEnd.toISOString().slice(0, 10),
  }
}

interface ValorSubscriptionCredentialRow {
  valor_appid: string
  valor_epi: string
  decrypted_appkey: string
}

type SubscriptionChargeMode = 'manual' | 'automatic' | 'configuration'

interface SubscriptionChargeResult {
  success: boolean
  invoiceId?: string
  status?: string
  transactionId?: string | null
  error?: string
}

async function chargeSubscriptionInvoiceViaValor(
  invoiceId: string,
  mode: SubscriptionChargeMode,
): Promise<SubscriptionChargeResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return { success: false, error: 'Missing Supabase server configuration.' }
  }

  try {
    const response = await fetch(
      `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/billing-charge-subscription`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          apikey: serviceRoleKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ invoice_id: invoiceId, mode }),
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
        invoiceId: payload.invoice_id ?? invoiceId,
        error: payload.error || 'Failed to charge invoice.',
      }
    }

    return {
      success: true,
      invoiceId: payload.invoice_id ?? invoiceId,
      status: payload.status,
      transactionId: payload.transaction_id ?? null,
    }
  } catch (error) {
    return {
      success: false,
      invoiceId,
      error:
        error instanceof Error
          ? `Valor billing service could not be reached: ${error.message}`
          : 'Valor billing service could not be reached.',
    }
  }
}

async function syncValorSubscriptionLifecycle(params: {
  subscriptionId: string
  targetStatus: 'trial' | 'active' | 'past_due' | 'suspended' | 'canceled'
}): Promise<{ success: boolean; error?: string }> {
  const serviceRole = createServiceRoleClient() as any
  const { data: subscription, error: subscriptionError } = await serviceRole
    .from('merchant_subscriptions')
    .select(
      'id, processor, processor_account_id, processor_subscription_id, processor_subscription_status',
    )
    .eq('id', params.subscriptionId)
    .maybeSingle()

  if (subscriptionError || !subscription) {
    return { success: false, error: 'Failed to load the subscription processor schedule.' }
  }

  const processorSubscriptionId = subscription.processor_subscription_id?.trim()
  if (!processorSubscriptionId) return { success: true }

  if (subscription.processor !== 'valor' || !subscription.processor_account_id) {
    return {
      success: false,
      error: 'The native recurring schedule is not linked to a Valor subscription account.',
    }
  }

  if (
    params.targetStatus === 'past_due' ||
    params.targetStatus === 'trial' ||
    (params.targetStatus === 'active' &&
      !['deactivated', 'deleted'].includes(
        subscription.processor_subscription_status ?? '',
      )) ||
    (params.targetStatus === 'suspended' &&
      subscription.processor_subscription_status === 'deactivated') ||
    (params.targetStatus === 'canceled' &&
      subscription.processor_subscription_status === 'deleted')
  ) {
    return { success: true }
  }

  const { data: credentialRows, error: credentialError } = await serviceRole.rpc(
    'get_valor_account_credentials',
    { p_account_id: subscription.processor_account_id },
  )
  const row = (Array.isArray(credentialRows)
    ? credentialRows[0]
    : credentialRows) as ValorSubscriptionCredentialRow | null
  const appId = row?.valor_appid?.trim()
  const appKey = row?.decrypted_appkey?.trim()
  const epi = row?.valor_epi?.trim()
  if (credentialError || !appId || !appKey || !epi) {
    return { success: false, error: 'Valor subscription credentials are unavailable.' }
  }

  const valorOptions = { credentials: { appId, appKey, epi } }
  const persistProcessorSchedule = async (
    updates: Record<string, unknown>,
  ): Promise<{ success: boolean; error?: string }> => {
    const { error } = await serviceRole
      .from('merchant_subscriptions')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.subscriptionId)

    return error
      ? {
          success: false,
          error: `Valor schedule changed, but the local subscription could not be updated: ${error.message}`,
        }
      : { success: true }
  }

  try {
    if (params.targetStatus === 'canceled') {
      await deleteValorSubscription(valorOptions, processorSubscriptionId)
      return persistProcessorSchedule({ processor_subscription_status: 'deleted' })
    }

    if (params.targetStatus === 'suspended') {
      await deactivateValorSubscription(valorOptions, processorSubscriptionId)
      return persistProcessorSchedule({ processor_subscription_status: 'deactivated' })
    }

    if (params.targetStatus === 'active') {
      if (subscription.processor_subscription_status === 'deleted') {
        return persistProcessorSchedule({
          processor_subscription_id: null,
          processor_subscription_status: null,
          processor_schedule_created_at: null,
          processor_next_payment_at: null,
        })
      }

      await activateValorSubscription(valorOptions, processorSubscriptionId)
      return persistProcessorSchedule({ processor_subscription_status: 'active' })
    }

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Valor subscription lifecycle update failed.',
    }
  }
}

async function syncMerchantTierBillingArtifacts(params: {
  merchantId: string
  merchantTierSubscriptionId: string
  planId: string
  status: 'active' | 'past_due' | 'suspended' | 'cancelled'
  currentPeriodStart: string
  currentPeriodEnd: string
}) {
  const serviceRole = createServiceRoleClient()

  const { data: anchorProfile, error: anchorProfileError } = await serviceRole
    .from('merchant_billing_profiles')
    .select('id, location_id, created_at')
    .eq('merchant_id', params.merchantId)
    .eq('billing_method', 'card')
    .eq('processor', 'valor')
    .eq('is_active', true)
    .eq('is_primary', true)
    .order('location_id', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (anchorProfileError) {
    console.error(
      '[syncMerchantTierBillingArtifacts] anchor profile lookup error:',
      anchorProfileError,
    )
    return {
      success: false as const,
      error: 'Failed to resolve billing anchor location.',
    }
  }

  if (!anchorProfile?.id) {
    return {
      success: false as const,
      error:
        'No active primary Valor billing card is available for merchant tier billing.',
    }
  }

  let anchorLocationId = anchorProfile.location_id as string | null
  if (!anchorLocationId) {
    const { data: anchorLocation, error: anchorLocationError } = await serviceRole
      .from('locations')
      .select('id')
      .eq('merchant_id', params.merchantId)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (anchorLocationError || !anchorLocation?.id) {
      return {
        success: false as const,
        error: 'No active location is available to anchor merchant tier billing.',
      }
    }
    anchorLocationId = anchorLocation.id as string
  }

  const {
    data: existingAnchorSubscription,
    error: existingAnchorSubscriptionError,
  } = await serviceRole
    .from('merchant_subscriptions')
    .select(
      'id, metadata, status, plan_id, current_period_start, current_period_end, next_billing_date, trial_ends_at, billing_profile_id, monthly_amount, station_count, processor, processor_account_id, processor_subscription_id, processor_subscription_status, processor_schedule_created_at, processor_next_payment_at',
    )
    .eq('merchant_id', params.merchantId)
    .eq('location_id', anchorLocationId)
    .maybeSingle()

  if (existingAnchorSubscriptionError) {
    console.error(
      '[syncMerchantTierBillingArtifacts] existing anchor subscription lookup error:',
      existingAnchorSubscriptionError,
    )
    return {
      success: false as const,
      error: 'Failed to resolve location anchor subscription.',
    }
  }

  const anchorMetadata = {
    billing_scope: 'merchant_tier',
    merchant_tier_subscription_id: params.merchantTierSubscriptionId,
    merchant_tier_plan_id: params.planId,
  }

  const { data: anchorSubscriptionId, error: anchorSubscriptionError } =
    await serviceRole.rpc('upsert_merchant_subscription', {
      p_subscription_id: existingAnchorSubscription?.id ?? null,
      p_merchant_id: params.merchantId,
      p_location_id: anchorLocationId,
      p_plan_id: params.planId,
      p_current_period_start: params.currentPeriodStart,
      p_current_period_end: params.currentPeriodEnd,
      p_next_billing_date: params.currentPeriodEnd,
      p_status: params.status === 'cancelled' ? 'canceled' : params.status,
      p_trial_ends_at: null,
      p_billing_profile_id: anchorProfile.id,
      p_metadata: anchorMetadata,
    })

  if (anchorSubscriptionError || !anchorSubscriptionId) {
    console.error(
      '[syncMerchantTierBillingArtifacts] anchor subscription upsert error:',
      anchorSubscriptionError,
    )
    return {
      success: false as const,
      error:
        anchorSubscriptionError?.message ||
        'Failed to create anchor subscription.',
    }
  }

  const lifecycleResult = await syncValorSubscriptionLifecycle({
    subscriptionId: anchorSubscriptionId as string,
    targetStatus: params.status === 'cancelled' ? 'canceled' : params.status,
  })
  if (!lifecycleResult.success) {
    if (existingAnchorSubscription?.id) {
      await serviceRole
        .from('merchant_subscriptions')
        .update({
          status: existingAnchorSubscription.status,
          plan_id: existingAnchorSubscription.plan_id,
          current_period_start: existingAnchorSubscription.current_period_start,
          current_period_end: existingAnchorSubscription.current_period_end,
          next_billing_date: existingAnchorSubscription.next_billing_date,
          trial_ends_at: existingAnchorSubscription.trial_ends_at,
          billing_profile_id: existingAnchorSubscription.billing_profile_id,
          metadata: existingAnchorSubscription.metadata,
          updated_at: new Date().toISOString(),
        })
        .eq('id', anchorSubscriptionId as string)
    } else {
      await serviceRole
        .from('merchant_subscriptions')
        .delete()
        .eq('id', anchorSubscriptionId as string)
    }
    return {
      success: false as const,
      error: lifecycleResult.error || 'Failed to synchronize the Valor billing schedule.',
    }
  }

  if (params.status === 'cancelled') {
    return {
      success: true as const,
      anchorLocationId,
      anchorSubscriptionId: anchorSubscriptionId as string,
      invoiceId: null,
      previousAnchorSubscription: existingAnchorSubscription,
    }
  }

  const { data: existingInvoice, error: existingInvoiceError } =
    await serviceRole
    .from('subscription_invoices')
    .select('id, created_at')
    .eq('subscription_id', anchorSubscriptionId as string)
    .eq('billing_period_start', params.currentPeriodStart)
    .eq('location_id', anchorLocationId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingInvoiceError) {
    console.error(
      '[syncMerchantTierBillingArtifacts] existing invoice lookup error:',
      existingInvoiceError,
    )
    return {
      success: false as const,
      error: 'Failed to check existing merchant tier invoice.',
    }
  }

  let invoiceId: string | null = existingInvoice?.id ?? null

  if (!invoiceId) {
    const { data: generatedInvoiceId, error: generatedInvoiceError } =
      await serviceRole.rpc('generate_subscription_invoice', {
        p_subscription_id: anchorSubscriptionId as string,
        p_due_date: params.currentPeriodEnd,
      })

    if (generatedInvoiceError || !generatedInvoiceId) {
      console.error(
        '[syncMerchantTierBillingArtifacts] invoice generation error:',
        generatedInvoiceError,
      )
      return {
        success: false as const,
        error:
          generatedInvoiceError?.message ||
          'Failed to generate merchant tier invoice.',
      }
    }

    invoiceId = generatedInvoiceId as string

    const { nextPeriodStart, nextPeriodEnd } = addOneMonthPeriod(
      params.currentPeriodStart,
      params.currentPeriodEnd,
    )

    const { error: mirrorAdvanceError } = await serviceRole
      .from('merchant_plan_subscriptions')
      .update({
        current_period_start: nextPeriodStart,
        current_period_end: nextPeriodEnd,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.merchantTierSubscriptionId)

    if (mirrorAdvanceError) {
      console.error(
        '[syncMerchantTierBillingArtifacts] merchant tier period advance error:',
        mirrorAdvanceError,
      )
    }
  } else {
    const { data: duplicateInvoiceId, error: duplicateInvoiceError } =
      await serviceRole.rpc('generate_subscription_invoice_snapshot', {
        p_subscription_id: anchorSubscriptionId as string,
        p_due_date: params.currentPeriodEnd,
      })

    if (duplicateInvoiceError || !duplicateInvoiceId) {
      console.error(
        '[syncMerchantTierBillingArtifacts] duplicate tier invoice generation error:',
        duplicateInvoiceError,
      )
      return {
        success: false as const,
        error:
          duplicateInvoiceError?.message ||
          'Failed to generate updated merchant tier invoice.',
      }
    }

    invoiceId = duplicateInvoiceId as string
  }

  return {
    success: true as const,
    anchorLocationId,
    anchorSubscriptionId: anchorSubscriptionId as string,
    invoiceId,
    previousAnchorSubscription: existingAnchorSubscription,
  }
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

export interface SaveAndChargeMerchantSubscriptionParams
  extends UpsertMerchantSubscriptionParams {
  services: Array<{
    serviceId: string
    quantity: number
    enabled?: boolean
    metadata?: Record<string, unknown>
  }>
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
      code,
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
}): {
  summaryTitle: string
  finalAmountLabel: string
  finalAmountValue: number
} {
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
      const additionalQuantity = Math.max(
        0,
        assignment.quantity - toNumber(assignment.included_quantity),
      )
      amount =
        base + additionalQuantity * toNumber(assignment.additional_unit_price)
    }

    subtotal += amount

    return {
      code: assignment.service_code,
      description: assignment.display_name,
      periodLabel,
      quantity: assignment.quantity,
      unitPrice:
        assignment.quantity > 0 ? amount / assignment.quantity : amount,
      amount,
    }
  })

  return { lineItems, subtotal }
}

export async function getSubscriptionPlans(): Promise<
  SubscriptionPlanRecord[]
> {
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

export async function upsertSubscriptionPlan(
  params: UpsertSubscriptionPlanParams,
): Promise<{ success: boolean; planId?: string; error?: string }> {
  await assertHQPermission('system.billing.manage')

  if (!params.planCode?.trim()) {
    return { success: false, error: 'Plan code is required.' }
  }

  if (!params.displayName?.trim()) {
    return { success: false, error: 'Display name is required.' }
  }

  const supabase = createServerSupabaseClient() as any
  const { data, error } = await supabase.rpc('upsert_subscription_plan', {
    p_plan_id: params.planId ?? null,
    p_plan_code: params.planCode,
    p_display_name: params.displayName,
    p_base_price_monthly: params.basePriceMonthly,
    p_included_stations: params.includedStations,
    p_per_extra_station_price: params.perExtraStationPrice,
    p_card_surcharge_pct: params.cardSurchargePct,
    p_is_active: params.isActive ?? true,
    p_metadata: params.metadata ?? {},
  })

  if (error) {
    console.error('[upsertSubscriptionPlan] Error:', error)
    return { success: false, error: error.message }
  }

  revalidatePath('/manage/subscriptions')
  revalidatePath('/dashboard/subscriptions')

  return { success: true, planId: data as string }
}

export async function getMerchantTierPlans(): Promise<
  MerchantTierPlanRecord[]
> {
  await assertHQPermission('system.billing.manage')

  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('subscription_plans')
    .select(
      'id, plan_code, display_name, min_locations, max_locations, monthly_price_cents, description, display_order, is_active',
    )
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
    min_locations:
      row.min_locations === null ? null : Number(row.min_locations || 0),
    max_locations:
      row.max_locations === null ? null : Number(row.max_locations || 0),
    monthly_price_cents: Number(row.monthly_price_cents || 0),
    display_order: Number(row.display_order || 0),
  }))
}

export async function getMerchantTierStatus(
  merchantId: string,
): Promise<MerchantTierStatusRecord> {
  await assertHQPermission('system.billing.manage')

  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase.rpc(
    'get_merchant_subscription_status',
    {
    p_merchant_id: merchantId,
    },
  )

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
          min_locations:
            raw.plan.min_locations === null
              ? null
              : Number(raw.plan.min_locations || 0),
          max_locations:
            raw.plan.max_locations === null
              ? null
              : Number(raw.plan.max_locations || 0),
          monthly_price_cents: Number(raw.plan.monthly_price_cents || 0),
          description:
            typeof raw.plan.description === 'string'
              ? raw.plan.description
              : null,
        }
      : null,
    active_location_count: Number(raw.active_location_count || 0),
    is_over_limit: Boolean(raw.is_over_limit),
    required_plan_code:
      typeof raw.required_plan_code === 'string'
        ? raw.required_plan_code
        : null,
    subscription_status:
      typeof raw.subscription_status === 'string'
        ? (raw.subscription_status as MerchantTierStatusRecord['subscription_status'])
        : null,
    current_period_end:
      typeof raw.current_period_end === 'string'
        ? raw.current_period_end
        : null,
  }
}

export async function getMerchantTierSubscription(
  merchantId: string,
): Promise<MerchantTierSubscriptionRecord | null> {
  await assertHQPermission('system.billing.manage')

  const serviceRole = createServiceRoleClient()
  const { data, error } = await serviceRole
    .from('merchant_plan_subscriptions')
    .select(
      `
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
    `,
    )
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
    min_locations:
      plan?.min_locations === null ? null : Number(plan?.min_locations || 0),
    max_locations:
      plan?.max_locations === null ? null : Number(plan?.max_locations || 0),
    monthly_price_cents: Number(plan?.monthly_price_cents || 0),
    description:
      typeof plan?.description === 'string' ? plan.description : null,
    status: data.status as MerchantTierSubscriptionRecord['status'],
    current_period_start: data.current_period_start as string,
    current_period_end: data.current_period_end as string,
    trial_ends_at: (data.trial_ends_at as string | null) ?? null,
    created_at: data.created_at as string,
    updated_at: data.updated_at as string,
  }
}

export async function getPendingMerchantTierRequest(
  merchantId: string,
): Promise<MerchantTierPlanRequestRecord | null> {
  await assertHQPermission('system.billing.manage')

  const serviceRole = createServiceRoleClient() as any
  const { data: request, error } = await serviceRole
    .from('subscription_plan_requests')
    .select('*')
    .eq('merchant_id', merchantId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error(
      '[getPendingMerchantTierRequest] request lookup failed:',
      error,
    )
    throw new Error('Failed to load the pending subscription request.')
  }
  if (!request) return null

  const { data: requestedPlan, error: planError } = await serviceRole
    .from('subscription_plans')
    .select('id, plan_code, display_name, monthly_price_cents')
    .eq('id', request.requested_plan_id)
    .maybeSingle()

  if (planError || !requestedPlan) {
    console.error(
      '[getPendingMerchantTierRequest] plan lookup failed:',
      planError,
    )
    throw new Error('The requested subscription plan is no longer available.')
  }

  const metadata = (request.metadata ?? {}) as Record<string, unknown>
  return {
    id: request.id,
    request_number: request.request_number,
    merchant_id: request.merchant_id,
    current_plan_id: request.current_plan_id ?? null,
    current_plan_name:
      typeof metadata.current_plan_name === 'string'
        ? metadata.current_plan_name
        : null,
    requested_plan_id: request.requested_plan_id,
    requested_plan_code: requestedPlan.plan_code,
    requested_plan_name: requestedPlan.display_name,
    requested_monthly_price_cents: Number(
      requestedPlan.monthly_price_cents ?? 0,
    ),
    requested_by: request.requested_by,
    status: request.status,
    requested_at: request.created_at,
    reviewed_at: request.reviewed_at ?? null,
    reviewed_by: request.reviewed_by ?? null,
    decision_note: request.decision_note ?? null,
    applied_subscription_id: request.applied_subscription_id ?? null,
  }
}

export async function denyMerchantTierPlanRequest(
  requestId: string,
  decisionNote?: string,
): Promise<{ success: boolean; notificationWarning?: string; error?: string }> {
  const { userId } = await assertHQPermission('system.billing.manage')
  if (!requestId) return { success: false, error: 'requestId is required.' }

  const serviceRole = createServiceRoleClient() as any
  const { data: request, error: requestError } = await serviceRole
    .from('subscription_plan_requests')
    .select('id, request_number, merchant_id, requested_plan_id, status')
    .eq('id', requestId)
    .maybeSingle()

  if (requestError || !request) {
    console.error(
      '[denyMerchantTierPlanRequest] request lookup failed:',
      requestError,
    )
    return { success: false, error: 'Subscription request not found.' }
  }
  if (request.status !== 'pending') {
    return {
      success: false,
      error: `Request ${request.request_number} is no longer pending.`,
    }
  }

  const [merchantResult, planResult, billingProfileResult] = await Promise.all([
    serviceRole
      .from('merchants')
      .select('id, name, owner_email')
      .eq('id', request.merchant_id)
      .maybeSingle(),
    serviceRole
      .from('subscription_plans')
      .select('id, plan_code, display_name')
      .eq('id', request.requested_plan_id)
      .maybeSingle(),
    serviceRole
      .from('merchant_billing_profiles')
      .select('billing_email')
      .eq('merchant_id', request.merchant_id)
      .eq('is_primary', true)
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (
    merchantResult.error ||
    !merchantResult.data ||
    planResult.error ||
    !planResult.data
  ) {
    console.error('[denyMerchantTierPlanRequest] context lookup failed:', {
      merchantError: merchantResult.error,
      planError: planResult.error,
    })
    return {
      success: false,
      error: 'Failed to prepare the subscription decision.',
    }
  }

  const note = decisionNote?.trim() || null
  const now = new Date().toISOString()
  const { data: updated, error: updateError } = await serviceRole
    .from('subscription_plan_requests')
    .update({
      status: 'denied',
      reviewed_at: now,
      reviewed_by: userId,
      decision_note: note,
      updated_at: now,
    })
    .eq('id', request.id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()

  if (updateError || !updated) {
    console.error(
      '[denyMerchantTierPlanRequest] request update failed:',
      updateError,
    )
    return {
      success: false,
      error:
        'The request changed before it could be denied. Refresh and try again.',
    }
  }

  const body = note
    ? `DEXA did not approve your request for ${planResult.data.display_name}. Note: ${note}`
    : `DEXA did not approve your request for ${planResult.data.display_name}. Contact DEXA Billing if you need more information.`
  const notificationResult = await createAppNotification({
    audience: 'merchant',
    merchantId: request.merchant_id,
    notificationType: 'subscription_plan_request_denied',
    title: `Subscription request ${request.request_number} was not approved`,
    body,
    href: '/dashboard/subscriptions',
    actorUserId: userId,
    subscriptionPlanRequestId: request.id,
    metadata: {
      requested_plan_id: planResult.data.id,
      requested_plan_code: planResult.data.plan_code,
    },
  })

  const recipient =
    billingProfileResult.data?.billing_email?.trim() ||
    merchantResult.data.owner_email?.trim() ||
    ''
  let emailError: string | undefined
  if (recipient) {
    const emailResult = await sendEmail(
      recipient,
      `DEXA subscription request update - ${planResult.data.display_name}`,
      buildEmailTemplate(
        'DEXA POS',
        'Subscription request update',
        `${escapeEmailText(merchantResult.data.name)},\n\n${escapeEmailText(body)}\n\nYou can review your current plan on the Subscriptions page in your DEXA dashboard.`,
      ),
    )
    if ('error' in emailResult) emailError = emailResult.error
  }

  revalidatePath('/manage/subscriptions')
  revalidatePath(`/manage/subscriptions/${request.merchant_id}`)
  revalidatePath('/dashboard/subscriptions')

  if (notificationResult.error && emailError) {
    return {
      success: true,
      notificationWarning:
        'The request was denied, but neither the in-app nor email notification could be confirmed.',
    }
  }
  if (notificationResult.error) {
    return {
      success: true,
      notificationWarning:
        'The request was denied and emailed, but the in-app notification could not be confirmed.',
    }
  }
  if (emailError) {
    return {
      success: true,
      notificationWarning:
        'The request was denied in-app, but email delivery could not be confirmed.',
    }
  }
  if (!recipient) {
    return {
      success: true,
      notificationWarning:
        'The request was denied in-app; no merchant billing email is configured.',
    }
  }

  return { success: true }
}

export async function getPendingMerchantHardwareRequests(
  merchantId: string,
): Promise<MerchantHardwareRequestRecord[]> {
  await assertHQPermission('system.billing.manage')

  const serviceRole = createServiceRoleClient() as any
  const { data, error } = await serviceRole
    .from('subscription_hardware_requests')
    .select(
      `
      id,
      request_number,
      merchant_id,
      location_id,
      requested_quantity,
      request_note,
      requested_by,
      status,
      created_at,
      reviewed_at,
      reviewed_by,
      decision_note,
      locations!inner(name)
    `,
    )
    .eq('merchant_id', merchantId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[getPendingMerchantHardwareRequests] lookup failed:', error)
    throw new Error('Failed to load pending hardware requests.')
  }

  return (data ?? []).map((request: any) => ({
    id: request.id,
    request_number: request.request_number,
    merchant_id: request.merchant_id,
    location_id: request.location_id,
    location_name: Array.isArray(request.locations)
      ? (request.locations[0]?.name ?? 'Unknown location')
      : (request.locations?.name ?? 'Unknown location'),
    requested_quantity: Number(request.requested_quantity ?? 1),
    request_note: request.request_note ?? null,
    requested_by: request.requested_by,
    status: request.status,
    requested_at: request.created_at,
    reviewed_at: request.reviewed_at ?? null,
    reviewed_by: request.reviewed_by ?? null,
    decision_note: request.decision_note ?? null,
  }))
}

async function reviewMerchantHardwareRequest(params: {
  requestId: string
  decision: 'approved' | 'denied'
  decisionNote?: string
}): Promise<{
  success: boolean
  notificationWarning?: string
  error?: string
}> {
  const { userId } = await assertHQPermission('system.billing.manage')
  if (!params.requestId)
    return { success: false, error: 'requestId is required.' }

  const serviceRole = createServiceRoleClient() as any
  const { data: request, error: requestError } = await serviceRole
    .from('subscription_hardware_requests')
    .select(
      'id, request_number, merchant_id, location_id, requested_quantity, status',
    )
    .eq('id', params.requestId)
    .maybeSingle()

  if (requestError || !request) {
    console.error(
      '[reviewMerchantHardwareRequest] request lookup failed:',
      requestError,
    )
    return { success: false, error: 'Hardware request not found.' }
  }
  if (request.status !== 'pending') {
    return {
      success: false,
      error: `Request ${request.request_number} is no longer pending.`,
    }
  }

  const [merchantResult, locationResult, billingProfileResult] =
    await Promise.all([
      serviceRole
        .from('merchants')
        .select('id, name, owner_email')
        .eq('id', request.merchant_id)
        .maybeSingle(),
      serviceRole
        .from('locations')
        .select('id, name')
        .eq('id', request.location_id)
        .eq('merchant_id', request.merchant_id)
        .maybeSingle(),
      serviceRole
        .from('merchant_billing_profiles')
        .select('billing_email')
        .eq('merchant_id', request.merchant_id)
        .eq('is_primary', true)
        .eq('is_active', true)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle(),
    ])

  if (
    merchantResult.error ||
    !merchantResult.data ||
    locationResult.error ||
    !locationResult.data
  ) {
    return {
      success: false,
      error: 'Failed to prepare the hardware request decision.',
    }
  }

  const now = new Date().toISOString()
  const note = params.decisionNote?.trim() || null
  const { data: updated, error: updateError } = await serviceRole
    .from('subscription_hardware_requests')
    .update({
      status: params.decision,
      reviewed_by: userId,
      reviewed_at: now,
      decision_note: note,
      updated_at: now,
    })
    .eq('id', request.id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()

  if (updateError || !updated) {
    console.error('[reviewMerchantHardwareRequest] update failed:', updateError)
    return {
      success: false,
      error:
        'The request changed before it could be reviewed. Refresh and try again.',
    }
  }

  const approved = params.decision === 'approved'
  const body = approved
    ? `DEXA approved ${request.request_number} for ${request.requested_quantity} device${request.requested_quantity === 1 ? '' : 's'} at ${locationResult.data.name}. Approval starts fulfillment; it does not automatically assign inventory.${note ? ` Note: ${note}` : ''}`
    : `DEXA did not approve ${request.request_number} for ${locationResult.data.name}.${note ? ` Note: ${note}` : ''}`
  const notificationResult = await createAppNotification({
    audience: 'merchant',
    merchantId: request.merchant_id,
    notificationType: approved
      ? 'subscription_hardware_request_approved'
      : 'subscription_hardware_request_denied',
    title: `Hardware request ${request.request_number} ${approved ? 'approved' : 'not approved'}`,
    body,
    href: '/dashboard/subscriptions',
    actorUserId: userId,
    metadata: {
      hardware_request_id: request.id,
      request_number: request.request_number,
      location_id: request.location_id,
      requested_quantity: request.requested_quantity,
      decision: params.decision,
    },
  })

  const recipient =
    billingProfileResult.data?.billing_email?.trim() ||
    merchantResult.data.owner_email?.trim() ||
    ''
  let emailError: string | undefined
  if (recipient) {
    const emailResult = await sendEmail(
      recipient,
      `DEXA hardware request update - ${request.request_number}`,
      buildEmailTemplate('DEXA POS', 'Hardware request update', body),
    )
    if ('error' in emailResult) emailError = emailResult.error
  }

  revalidatePath('/manage/subscriptions')
  revalidatePath(`/manage/subscriptions/${request.merchant_id}`)
  revalidatePath('/dashboard/subscriptions')

  if (notificationResult.error && emailError) {
    return {
      success: true,
      notificationWarning:
        'The decision was saved, but neither notification channel could be confirmed.',
    }
  }
  if (notificationResult.error) {
    return {
      success: true,
      notificationWarning:
        'The decision was emailed, but the in-app notification could not be confirmed.',
    }
  }
  if (emailError) {
    return {
      success: true,
      notificationWarning:
        'The decision was saved in-app, but email delivery could not be confirmed.',
    }
  }
  if (!recipient) {
    return {
      success: true,
      notificationWarning:
        'The decision was saved in-app; no merchant billing email is configured.',
    }
  }

  return { success: true }
}

export async function approveMerchantHardwareRequest(
  requestId: string,
  decisionNote?: string,
) {
  return reviewMerchantHardwareRequest({
    requestId,
    decision: 'approved',
    decisionNote,
  })
}

export async function denyMerchantHardwareRequest(
  requestId: string,
  decisionNote?: string,
) {
  return reviewMerchantHardwareRequest({
    requestId,
    decision: 'denied',
    decisionNote,
  })
}

export async function upsertMerchantTierSubscription(
  params: UpsertMerchantTierSubscriptionParams,
): Promise<{
  success: boolean
  subscriptionId?: string
  invoiceId?: string | null
  anchorLocationId?: string
  notificationWarning?: string
  error?: string
}> {
  const { userId } = await assertHQPermission('system.billing.manage')

  if (!params.merchantId || !params.planId) {
    return { success: false, error: 'merchantId and planId are required.' }
  }

  let billingPeriod: ReturnType<typeof resolveMonthlyBillingPeriod>
  try {
    billingPeriod = resolveMonthlyBillingPeriod(
      params.currentPeriodStart,
      params.currentPeriodEnd,
    )
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Invalid merchant billing period.',
    }
  }

  const serviceRole = createServiceRoleClient()
  const { data: existing, error: existingError } = await serviceRole
    .from('merchant_plan_subscriptions')
    .select(
      'id, plan_id, status, current_period_start, current_period_end, trial_ends_at',
    )
    .eq('merchant_id', params.merchantId)
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingError) {
    console.error(
      '[upsertMerchantTierSubscription] Existing lookup error:',
      existingError,
    )
    return { success: false, error: 'Failed to load existing merchant plan.' }
  }

  const payload = {
    merchant_id: params.merchantId,
    plan_id: params.planId,
    status: params.status,
    current_period_start: billingPeriod.startDate,
    current_period_end: billingPeriod.endDate,
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
    console.error(
      '[upsertMerchantTierSubscription] Upsert error:',
      result.error,
    )
    return {
      success: false,
      error: result.error?.message || 'Failed to save merchant plan.',
    }
  }

  const subscriptionChanged =
    !existing ||
    existing.plan_id !== params.planId ||
    existing.status !== params.status

  // A prior approval attempt may have saved billing successfully but failed
  // before closing the request. Finalize that request without generating a
  // second invoice or repeating location billing synchronization.
  if (!subscriptionChanged && params.requestId) {
    const notificationWarning = await notifyMerchantOfTierAssignment({
      merchantId: params.merchantId,
      planId: params.planId,
      requestId: params.requestId,
      status: params.status,
      adminUserId: userId,
      appliedMerchantPlanSubscriptionId: result.data.id as string,
    })

    revalidatePath('/manage/subscriptions')
    revalidatePath(`/manage/subscriptions/${params.merchantId}`)
    revalidatePath('/dashboard/subscriptions')
    revalidatePath(`/manage/merchants/${params.merchantId}`)
    revalidatePath(`/manage/merchants/${params.merchantId}/billing`)

    return {
      success: true,
      subscriptionId: result.data.id as string,
      invoiceId: null,
      notificationWarning,
    }
  }

  const synced = await syncMerchantTierBillingArtifacts({
    merchantId: params.merchantId,
    merchantTierSubscriptionId: result.data.id as string,
    planId: params.planId,
    status: params.status,
    currentPeriodStart: billingPeriod.startDate,
    currentPeriodEnd: billingPeriod.endDate,
  })

  if (!synced.success) {
    if (existing?.id) {
      const { error: rollbackError } = await serviceRole
        .from('merchant_plan_subscriptions')
        .update({
          plan_id: existing.plan_id,
          status: existing.status,
          current_period_start: existing.current_period_start,
          current_period_end: existing.current_period_end,
          trial_ends_at: existing.trial_ends_at,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
      if (rollbackError) {
        console.error(
          '[upsertMerchantTierSubscription] rollback error:',
          rollbackError,
        )
      }
    } else {
      const { error: rollbackError } = await serviceRole
        .from('merchant_plan_subscriptions')
        .delete()
        .eq('id', result.data.id as string)
      if (rollbackError) {
        console.error(
          '[upsertMerchantTierSubscription] insert rollback error:',
          rollbackError,
        )
      }
    }
    return { success: false, error: synced.error }
  }

  if (params.status === 'active' && synced.invoiceId) {
    const chargeResult = await chargeSubscriptionInvoiceViaValor(
      synced.invoiceId,
      'configuration',
    )

    if (!chargeResult.success) {
      const rollbackErrors: string[] = []
      const merchantPlanRollback = existing?.id
        ? await serviceRole
            .from('merchant_plan_subscriptions')
            .update({
              plan_id: existing.plan_id,
              status: existing.status,
              current_period_start: existing.current_period_start,
              current_period_end: existing.current_period_end,
              trial_ends_at: existing.trial_ends_at,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id)
        : await serviceRole
            .from('merchant_plan_subscriptions')
            .delete()
            .eq('id', result.data.id as string)

      if (merchantPlanRollback.error) {
        rollbackErrors.push(`merchant tier: ${merchantPlanRollback.error.message}`)
      }

      const previousAnchor = synced.previousAnchorSubscription
      const anchorRollback = previousAnchor
        ? await serviceRole
            .from('merchant_subscriptions')
            .update({
              metadata: previousAnchor.metadata,
              status: previousAnchor.status,
              plan_id: previousAnchor.plan_id,
              current_period_start: previousAnchor.current_period_start,
              current_period_end: previousAnchor.current_period_end,
              next_billing_date: previousAnchor.next_billing_date,
              trial_ends_at: previousAnchor.trial_ends_at,
              billing_profile_id: previousAnchor.billing_profile_id,
              monthly_amount: previousAnchor.monthly_amount,
              station_count: previousAnchor.station_count,
              processor: previousAnchor.processor,
              processor_account_id: previousAnchor.processor_account_id,
              processor_subscription_id: previousAnchor.processor_subscription_id,
              processor_subscription_status:
                previousAnchor.processor_subscription_status,
              processor_schedule_created_at:
                previousAnchor.processor_schedule_created_at,
              processor_next_payment_at:
                previousAnchor.processor_next_payment_at,
              updated_at: new Date().toISOString(),
            })
            .eq('id', synced.anchorSubscriptionId)
        : await serviceRole
            .from('merchant_subscriptions')
            .update({
              status: 'past_due',
              metadata: {
                billing_scope: 'merchant_tier',
                merchant_tier_subscription_id: result.data.id,
                merchant_tier_plan_id: params.planId,
                activation_failed: true,
              },
              updated_at: new Date().toISOString(),
            })
            .eq('id', synced.anchorSubscriptionId)

      if (anchorRollback.error) {
        rollbackErrors.push(`billing anchor: ${anchorRollback.error.message}`)
      }

      await serviceRole
        .from('subscription_invoices')
        .update({
          status: 'failed',
          last_payment_error:
            chargeResult.error || 'Valor rejected the automatic subscription charge.',
          updated_at: new Date().toISOString(),
        })
        .eq('id', synced.invoiceId)
        .in('status', ['open', 'processing'])

      return {
        success: false,
        error:
          `Valor did not approve the payment, so the merchant tier was not changed. ${chargeResult.error || ''}`.trim() +
          (rollbackErrors.length > 0
            ? ` Rollback needs review: ${rollbackErrors.join('; ')}.`
            : ''),
      }
    }
  }

  const notificationWarning =
    subscriptionChanged || Boolean(params.requestId)
    ? await notifyMerchantOfTierAssignment({
        merchantId: params.merchantId,
        planId: params.planId,
          requestId: params.requestId,
        status: params.status,
        adminUserId: userId,
        appliedMerchantPlanSubscriptionId: result.data.id as string,
      })
    : undefined

  revalidatePath('/manage/subscriptions')
  revalidatePath(`/manage/subscriptions/${params.merchantId}`)
  revalidatePath('/dashboard/subscriptions')
  revalidatePath(`/manage/merchants/${params.merchantId}`)
  revalidatePath(`/manage/merchants/${params.merchantId}/billing`)

  return {
    success: true,
    subscriptionId: result.data.id as string,
    invoiceId: synced.invoiceId,
    anchorLocationId: synced.anchorLocationId,
    notificationWarning,
  }
}

export async function getBillableServices(
  includeInactive = false,
): Promise<BillableServiceRecord[]> {
  await assertHQPermission('system.billing.manage')

  const supabase = createServerSupabaseClient() as any
  let { data, error } = await supabase.rpc('list_billable_services', {
    p_include_inactive: includeInactive,
  })

  if (
    error &&
    !includeInactive &&
    typeof error.message === 'string' &&
    error.message.includes('Could not find the function')
  ) {
    const fallbackResult = await supabase.rpc('list_billable_services')
    data = fallbackResult.data
    error = fallbackResult.error
  }

  if (error) {
    console.error('[getBillableServices] Error:', error)
    throw new Error('Failed to load billable services.')
  }

  return ((data ?? []) as BillableServiceRecord[]).map((row) => ({
    ...row,
    base_price_monthly: Number(row.base_price_monthly || 0),
    additional_unit_price:
      row.additional_unit_price === null
        ? null
        : Number(row.additional_unit_price || 0),
    included_quantity: Number(row.included_quantity || 0),
    card_surcharge_pct: Number(row.card_surcharge_pct || 0),
  }))
}

export async function upsertBillableService(
  params: UpsertBillableServiceParams,
): Promise<{ success: boolean; serviceId?: string; error?: string }> {
  await assertHQPermission('system.billing.manage')

  if (!params.serviceCode?.trim()) {
    return { success: false, error: 'Service code is required.' }
  }

  if (!params.displayName?.trim()) {
    return { success: false, error: 'Display name is required.' }
  }

  const supabase = createServerSupabaseClient() as any
  const { data, error } = await supabase.rpc('upsert_billable_service', {
    p_service_id: params.serviceId ?? null,
    p_service_code: params.serviceCode,
    p_display_name: params.displayName,
    p_service_category: params.serviceCategory,
    p_pricing_model: params.pricingModel,
    p_base_price_monthly: params.basePriceMonthly,
    p_additional_unit_price: params.additionalUnitPrice ?? null,
    p_included_quantity: params.includedQuantity ?? 0,
    p_card_surcharge_pct: params.cardSurchargePct ?? 4,
    p_unit_label: params.unitLabel ?? 'unit',
    p_is_active: params.isActive ?? true,
    p_metadata: params.metadata ?? {},
  })

  if (error) {
    console.error('[upsertBillableService] Error:', error)
    return { success: false, error: error.message }
  }

  revalidatePath('/manage/subscriptions')

  return { success: true, serviceId: data as string }
}

export async function getDeviceBillingServiceMappings(): Promise<
  DeviceBillingServiceMappingRecord[]
> {
  await assertHQPermission('system.billing.manage')

  const supabase = createServerSupabaseClient() as any
  const { data, error } = await supabase
    .from('device_billing_service_mappings')
    .select('*')
    .order('device_category', { ascending: true })

  if (error) {
    console.error('[getDeviceBillingServiceMappings] Error:', error)
    throw new Error('Failed to load device billing mappings.')
  }

  return (data ?? []) as DeviceBillingServiceMappingRecord[]
}

export async function upsertDeviceBillingServiceMapping(
  params: UpsertDeviceBillingServiceMappingParams,
): Promise<{ success: boolean; mappingId?: string; error?: string }> {
  await assertHQPermission('system.billing.manage')

  if (!params.deviceCategory?.trim()) {
    return { success: false, error: 'Device category is required.' }
  }

  if (!params.serviceCode?.trim()) {
    return { success: false, error: 'Billable service is required.' }
  }

  const supabase = createServerSupabaseClient() as any
  const { data, error } = await supabase.rpc(
    'upsert_device_billing_service_mapping',
    {
    p_device_category: params.deviceCategory,
    p_service_code: params.serviceCode,
    p_is_active: params.isActive ?? true,
    p_metadata: params.metadata ?? {},
    },
  )

  if (error) {
    console.error('[upsertDeviceBillingServiceMapping] Error:', error)
    return { success: false, error: error.message }
  }

  revalidatePath('/manage/subscriptions')
  revalidatePath('/dashboard/subscriptions')

  return { success: true, mappingId: data as string }
}

export async function calculateSubscriptionTotal(
  params: CalculateSubscriptionTotalParams,
): Promise<{
  success: boolean
  data?: SubscriptionQuoteResult
  error?: string
}> {
  await assertHQPermission('system.billing.manage')

  const supabase = createServerSupabaseClient() as any
  const { data, error } = await supabase.rpc('calculate_subscription_total', {
    p_plan_id: params.planId ?? null,
    p_station_count: params.stationCount,
    p_services: (params.services ?? []).map((service) => ({
      service_id: service.serviceId ?? undefined,
      service_code: service.serviceCode ?? undefined,
      quantity: service.quantity,
    })),
    p_billing_method: params.billingMethod ?? 'card',
  })

  if (error) {
    console.error('[calculateSubscriptionTotal] Error:', error)
    return { success: false, error: error.message }
  }

  const row = Array.isArray(data) ? data[0] : data
  if (!row) {
    return { success: false, error: 'No subscription quote returned.' }
  }

  return {
    success: true,
    data: {
      station_count: Number(row.station_count || 0),
      billing_method: (row.billing_method || 'card') as 'ach' | 'card',
      line_items: Array.isArray(row.line_items) ? row.line_items : [],
      subtotal: Number(row.subtotal || 0),
      card_surcharge: Number(row.card_surcharge || 0),
      total_amount: Number(row.total_amount || 0),
    },
  }
}

export async function recalculateMerchantSubscription(
  subscriptionId: string,
): Promise<{
  success: boolean
  data?: SubscriptionQuoteResult
  error?: string
}> {
  await assertHQPermission('system.billing.manage')

  if (!subscriptionId?.trim()) {
    return { success: false, error: 'subscriptionId is required.' }
  }

  const supabase = createServerSupabaseClient() as any
  const { data, error } = await supabase.rpc('recalc_subscription', {
    p_subscription_id: subscriptionId,
  })

  if (error) {
    console.error('[recalculateMerchantSubscription] Error:', error)
    return { success: false, error: error.message }
  }

  const row = Array.isArray(data) ? data[0] : data
  if (!row) {
    return { success: false, error: 'No recalculation result returned.' }
  }

  revalidatePath('/manage/subscriptions')
  revalidatePath('/dashboard/subscriptions')

  return {
    success: true,
    data: {
      station_count: Number(row.station_count || 0),
      billing_method: 'card',
      line_items: Array.isArray(row.line_items) ? row.line_items : [],
      subtotal: Number(row.subtotal || 0),
      card_surcharge: Number(row.card_surcharge || 0),
      total_amount: Number(row.monthly_amount || 0),
    },
  }
}

export async function getMerchantSubscriptions(
  merchantId: string,
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

  const serviceRole = createServiceRoleClient() as any
  const { data: graceRows, error: graceError } = await serviceRole
    .from('merchant_subscriptions')
    .select(
      'id, grace_period_ends_at, grace_reason, grace_extended_at, grace_extended_by',
    )
    .eq('merchant_id', merchantId)

  if (graceError && graceError.code !== '42703') {
    console.error('[getMerchantSubscriptions] Grace lookup error:', graceError)
    throw new Error('Failed to load subscription grace periods.')
  }

  const graceBySubscriptionId = new Map<
    string,
    {
      grace_period_ends_at: string | null
      grace_reason: string | null
      grace_extended_at: string | null
      grace_extended_by: string | null
    }
  >(
    (graceRows ?? []).map((row: any) => [row.id, row]),
  )

  return ((data ?? []) as MerchantSubscriptionRecord[]).map((row) => {
    const grace = graceBySubscriptionId.get(row.id)
    return {
      ...row,
      station_count: Number(row.station_count || 0),
      monthly_amount: Number(row.monthly_amount || 0),
      grace_period_ends_at: grace?.grace_period_ends_at ?? null,
      grace_reason: grace?.grace_reason ?? null,
      grace_extended_at: grace?.grace_extended_at ?? null,
      grace_extended_by: grace?.grace_extended_by ?? null,
    }
  })
}

export async function setMerchantSubscriptionGracePeriod(params: {
  subscriptionId: string
  gracePeriodEndsAt: string | null
  reason: string
}): Promise<{ success: boolean; error?: string }> {
  const { userId } = await assertHQPermission('system.billing.manage')
  const subscriptionId = params.subscriptionId?.trim()
  const reason = params.reason?.trim()

  if (!subscriptionId) {
    return { success: false, error: 'Subscription is required.' }
  }
  if (!reason || reason.length < 5) {
    return {
      success: false,
      error: 'Enter a reason of at least 5 characters for the audit log.',
    }
  }

  const gracePeriodEndsAt = params.gracePeriodEndsAt
    ? new Date(params.gracePeriodEndsAt)
    : null
  if (gracePeriodEndsAt && Number.isNaN(gracePeriodEndsAt.getTime())) {
    return { success: false, error: 'Grace-period end is invalid.' }
  }
  if (gracePeriodEndsAt && gracePeriodEndsAt.getTime() <= Date.now()) {
    return { success: false, error: 'Grace-period end must be in the future.' }
  }

  const serviceRole = createServiceRoleClient() as any
  const { data: subscription, error: lookupError } = await serviceRole
    .from('merchant_subscriptions')
    .select('id, merchant_id, location_id, grace_period_ends_at')
    .eq('id', subscriptionId)
    .maybeSingle()

  if (lookupError || !subscription) {
    return { success: false, error: 'Subscription not found.' }
  }

  const now = new Date().toISOString()
  const nextGraceEnd = gracePeriodEndsAt?.toISOString() ?? null
  const { error: updateError } = await serviceRole
    .from('merchant_subscriptions')
    .update({
      grace_period_ends_at: nextGraceEnd,
      grace_reason: reason,
      grace_extended_at: now,
      grace_extended_by: userId ?? null,
      updated_at: now,
    })
    .eq('id', subscriptionId)

  if (updateError) {
    console.error('[setMerchantSubscriptionGracePeriod] update error:', updateError)
    return { success: false, error: updateError.message }
  }

  await serviceRole.rpc('log_subscription_billing_event', {
    p_action: nextGraceEnd ? 'subscription_grace_extended' : 'subscription_grace_cleared',
    p_merchant_id: subscription.merchant_id,
    p_location_id: subscription.location_id,
    p_resource_type: 'merchant_subscription',
    p_resource_name: subscriptionId,
    p_resource_id: subscriptionId,
    p_changes: {
      grace_period_ends_at: {
        old: subscription.grace_period_ends_at,
        new: nextGraceEnd,
      },
      reason,
    },
    p_metadata: {
      source: 'hq_subscription_workspace',
      actor_user_id: userId ?? null,
    },
  })

  revalidatePath('/manage/subscriptions')
  revalidatePath('/dashboard/subscriptions')
  return { success: true }
}

export async function upsertMerchantSubscription(
  params: UpsertMerchantSubscriptionParams,
): Promise<{ success: boolean; subscriptionId?: string; error?: string }> {
  await assertHQPermission('system.billing.manage')

  if (!params.merchantId || !params.locationId) {
    return { success: false, error: 'merchantId and locationId are required.' }
  }

  const supabase = createServerSupabaseClient()
  const serviceRole = createServiceRoleClient() as any
  let previousSubscriptionQuery = serviceRole
    .from('merchant_subscriptions')
    .select('id, status')
  previousSubscriptionQuery = params.subscriptionId
    ? previousSubscriptionQuery.eq('id', params.subscriptionId)
    : previousSubscriptionQuery
        .eq('merchant_id', params.merchantId)
        .eq('location_id', params.locationId)
  const { data: previousSubscription } = await previousSubscriptionQuery.maybeSingle()

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

  const lifecycleResult = await syncValorSubscriptionLifecycle({
    subscriptionId: data as string,
    targetStatus: params.status ?? 'active',
  })
  if (!lifecycleResult.success) {
    if (previousSubscription?.status) {
      await serviceRole
        .from('merchant_subscriptions')
        .update({
          status: previousSubscription.status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', data as string)
    }
    return {
      success: false,
      error:
        lifecycleResult.error ||
        'The subscription was not saved because the Valor schedule could not be synchronized.',
    }
  }

  try {
    const [
      subscriptionRecord,
      locationRecord,
      merchantRecord,
      billingProfileRecord,
    ] = await Promise.all([
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
      billingProfileRecord.data?.billing_email?.trim() ||
      merchantRecord.data?.owner_email?.trim() ||
      ''

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
    console.error(
      '[upsertMerchantSubscription] Failed to send lifecycle email:',
      emailError,
    )
  }

  revalidatePath('/manage/billing')
  revalidatePath(`/manage/merchants/${params.merchantId}`)
  revalidatePath(`/manage/merchants/${params.merchantId}/billing`)

  return { success: true, subscriptionId: data as string }
}

export async function getSubscriptionServiceAssignments(
  subscriptionId: string,
): Promise<SubscriptionServiceAssignmentRecord[]> {
  await assertHQPermission('system.billing.manage')

  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase.rpc(
    'list_subscription_service_assignments',
    {
    p_subscription_id: subscriptionId,
    },
  )

  if (error) {
    console.error('[getSubscriptionServiceAssignments] Error:', error)
    throw new Error('Failed to load subscription service assignments.')
  }

  return ((data ?? []) as SubscriptionServiceAssignmentRecord[]).map((row) => ({
    ...row,
    quantity: Number(row.quantity || 0),
    base_price_monthly: Number(row.base_price_monthly || 0),
    additional_unit_price:
      row.additional_unit_price === null
        ? null
        : Number(row.additional_unit_price || 0),
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
  }>,
): Promise<{ success: boolean; error?: string }> {
  await assertHQPermission('system.billing.manage')

  if (!subscriptionId?.trim()) {
    return { success: false, error: 'subscriptionId is required.' }
  }

  const supabase = createServerSupabaseClient()
  const { error } = await supabase.rpc(
    'replace_merchant_subscription_services',
    {
    p_subscription_id: subscriptionId,
    p_services: services.map((service) => ({
      service_id: service.serviceId,
      quantity: service.quantity,
      enabled: service.enabled ?? true,
      metadata: service.metadata ?? {},
    })),
    },
  )

  if (error) {
    console.error('[replaceSubscriptionServiceAssignments] Error:', error)
    return { success: false, error: error.message }
  }

  try {
    const serviceRole = createServiceRoleClient()
    const [subscriptionRecord, assignmentRecord] = await Promise.all([
      serviceRole
        .from('merchant_subscriptions')
        .select(
          'id, merchant_id, location_id, monthly_amount, status, current_period_start, current_period_end, next_billing_date',
        )
        .eq('id', subscriptionId)
        .maybeSingle(),
      serviceRole.rpc('list_subscription_service_assignments', {
        p_subscription_id: subscriptionId,
      }),
    ])

    if (
      subscriptionRecord.data &&
      subscriptionRecord.data.status === 'active'
    ) {
      const [
        { data: merchantRecord },
        { data: locationRecord },
        { data: billingProfileRecord },
      ] = await Promise.all([
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
        billingProfileRecord?.billing_email?.trim() ||
        merchantRecord?.owner_email?.trim() ||
        ''

      if (recipientEmail) {
        const assignmentCount = Array.isArray(assignmentRecord.data)
          ? assignmentRecord.data.length
          : 0
        const locationName = locationRecord?.name || 'Location'
        const merchantName = merchantRecord?.name || 'Dexa POS'
        const monthlyAmount = Number(
          subscriptionRecord.data.monthly_amount || 0,
        )
        const periodStart =
          subscriptionRecord.data.current_period_start ||
          new Date().toISOString()
        const periodEnd =
          subscriptionRecord.data.current_period_end || periodStart
        const assignmentRows = (assignmentRecord.data ??
          []) as SubscriptionServiceAssignmentRecord[]
        const pricingPreview = buildAssignmentPreviewLineItems(
          assignmentRows,
          periodStart,
          periodEnd,
        )
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
          },
        )
      }
    }
  } catch (emailError) {
    console.error(
      '[replaceSubscriptionServiceAssignments] Failed to send lifecycle email:',
      emailError,
    )
  }

  revalidatePath('/manage/billing')
  return { success: true }
}

export async function saveAndChargeMerchantSubscription(
  params: SaveAndChargeMerchantSubscriptionParams,
): Promise<{
  success: boolean
  subscriptionId?: string
  invoiceId?: string
  transactionId?: string | null
  error?: string
}> {
  await assertHQPermission('system.billing.manage')

  const targetStatus = params.status ?? 'active'
  const serviceRole = createServiceRoleClient() as any
  let previousQuery = serviceRole
    .from('merchant_subscriptions')
    .select(
      'id, plan_id, status, current_period_start, current_period_end, next_billing_date, trial_ends_at, billing_profile_id, metadata, monthly_amount, station_count, processor, processor_account_id, processor_subscription_id, processor_subscription_status, processor_schedule_created_at, processor_next_payment_at',
    )

  previousQuery = params.subscriptionId
    ? previousQuery.eq('id', params.subscriptionId)
    : previousQuery
        .eq('merchant_id', params.merchantId)
        .eq('location_id', params.locationId)

  const { data: previousSubscription, error: previousSubscriptionError } =
    await previousQuery.maybeSingle()

  if (previousSubscriptionError) {
    return { success: false, error: 'Failed to snapshot the current subscription.' }
  }

  const { data: previousAssignments, error: previousAssignmentsError } =
    previousSubscription?.id
      ? await serviceRole
          .from('merchant_subscription_services')
          .select('service_id, quantity, is_enabled, metadata')
          .eq('subscription_id', previousSubscription.id)
      : { data: [], error: null }

  if (previousAssignmentsError) {
    return { success: false, error: 'Failed to snapshot the current paid services.' }
  }

  let billingProfileId = params.billingProfileId ?? null
  if (targetStatus === 'active') {
    const { data: valorProfile, error: valorProfileError } = await serviceRole
      .from('merchant_billing_profiles')
      .select('id')
      .eq('merchant_id', params.merchantId)
      .eq('billing_method', 'card')
      .eq('processor', 'valor')
      .eq('is_active', true)
      .eq('is_primary', true)
      .order('location_id', { ascending: true, nullsFirst: true })
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (valorProfileError || !valorProfile?.id) {
      return {
        success: false,
        error:
          'Save an active primary Valor billing card before activating paid services.',
      }
    }
    billingProfileId = valorProfile.id
  }

  // Active configurations remain non-entitled until Valor approves the charge.
  const subscriptionResult = await upsertMerchantSubscription({
    ...params,
    billingProfileId,
    status: targetStatus === 'active' ? 'past_due' : targetStatus,
  })

  if (!subscriptionResult.success || !subscriptionResult.subscriptionId) {
    return subscriptionResult
  }

  const subscriptionId = subscriptionResult.subscriptionId
  let invoiceId: string | undefined

  const rollback = async (reason: string) => {
    const rollbackErrors: string[] = []
    const restoreAssignments = (previousAssignments ?? []).map((assignment: any) => ({
      service_id: assignment.service_id,
      quantity: assignment.quantity,
      enabled: assignment.is_enabled,
      metadata: assignment.metadata ?? {},
    }))
    const { error: assignmentsRollbackError } = await serviceRole.rpc(
      'replace_merchant_subscription_services',
      {
        p_subscription_id: subscriptionId,
        p_services: previousSubscription ? restoreAssignments : [],
      },
    )
    if (assignmentsRollbackError) {
      rollbackErrors.push(`services: ${assignmentsRollbackError.message}`)
    }

    const subscriptionRollback = previousSubscription
      ? await serviceRole
          .from('merchant_subscriptions')
          .update({
            plan_id: previousSubscription.plan_id,
            status: previousSubscription.status,
            current_period_start: previousSubscription.current_period_start,
            current_period_end: previousSubscription.current_period_end,
            next_billing_date: previousSubscription.next_billing_date,
            trial_ends_at: previousSubscription.trial_ends_at,
            billing_profile_id: previousSubscription.billing_profile_id,
            metadata: previousSubscription.metadata,
            monthly_amount: previousSubscription.monthly_amount,
            station_count: previousSubscription.station_count,
            processor: previousSubscription.processor,
            processor_account_id: previousSubscription.processor_account_id,
            processor_subscription_id:
              previousSubscription.processor_subscription_id,
            processor_subscription_status:
              previousSubscription.processor_subscription_status,
            processor_schedule_created_at:
              previousSubscription.processor_schedule_created_at,
            processor_next_payment_at:
              previousSubscription.processor_next_payment_at,
            updated_at: new Date().toISOString(),
          })
          .eq('id', subscriptionId)
      : await serviceRole
          .from('merchant_subscriptions')
          .update({
            status: 'past_due',
            metadata: {
              ...(params.metadata ?? {}),
              activation_failed: true,
            },
            updated_at: new Date().toISOString(),
          })
          .eq('id', subscriptionId)

    if (subscriptionRollback.error) {
      rollbackErrors.push(`subscription: ${subscriptionRollback.error.message}`)
    }

    if (invoiceId) {
      await serviceRole
        .from('subscription_invoices')
        .update({
          status: 'failed',
          last_payment_error: reason,
          updated_at: new Date().toISOString(),
        })
        .eq('id', invoiceId)
        .in('status', ['open', 'processing'])
    }

    revalidatePath('/manage/subscriptions')
    revalidatePath(`/manage/subscriptions/${params.merchantId}`)
    revalidatePath('/dashboard/subscriptions')

    return rollbackErrors.length > 0
      ? `${reason} The prior configuration could not be fully restored: ${rollbackErrors.join('; ')}.`
      : reason
  }

  const serviceResult = await replaceSubscriptionServiceAssignments(
    subscriptionId,
    targetStatus === 'canceled' ? [] : params.services,
  )
  if (!serviceResult.success) {
    return {
      success: false,
      subscriptionId,
      error: await rollback(
        serviceResult.error || 'Failed to save paid service assignments.',
      ),
    }
  }

  if (targetStatus !== 'active') {
    return { success: true, subscriptionId }
  }

  const invoiceResult = await generateSubscriptionInvoiceManually(
    subscriptionId,
    null,
  )
  invoiceId = invoiceResult.invoiceId
  if (!invoiceResult.success || !invoiceId) {
    return {
      success: false,
      subscriptionId,
      error: await rollback(
        invoiceResult.error || 'Failed to generate the activation invoice.',
      ),
    }
  }

  const chargeResult = await chargeSubscriptionInvoiceViaValor(
    invoiceId,
    'configuration',
  )
  if (!chargeResult.success) {
    return {
      success: false,
      subscriptionId,
      invoiceId,
      error: await rollback(
        `Valor did not approve the payment, so the subscription was not activated or updated. ${chargeResult.error || ''}`.trim(),
      ),
    }
  }

  revalidatePath('/manage/subscriptions')
  revalidatePath(`/manage/subscriptions/${params.merchantId}`)
  revalidatePath('/dashboard/subscriptions')

  return {
    success: true,
    subscriptionId,
    invoiceId,
    transactionId: chargeResult.transactionId ?? null,
  }
}

export async function generateSubscriptionInvoiceManually(
  subscriptionId: string,
  dueDate?: string | null,
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
    const isDuplicatePeriodError =
      /invoice already exists for subscription/i.test(error.message || '')

    if (!isDuplicatePeriodError) {
      console.error('[generateSubscriptionInvoiceManually] Error:', error)
      return { success: false, error: error.message }
    }

    const serviceRole = createServiceRoleClient()
    const { data: duplicateInvoiceId, error: duplicateInvoiceError } =
      await serviceRole.rpc('generate_subscription_invoice_snapshot', {
        p_subscription_id: subscriptionId,
        p_due_date: dueDate ?? null,
      })

    if (duplicateInvoiceError || !duplicateInvoiceId) {
      console.error(
        '[generateSubscriptionInvoiceManually] Duplicate fallback snapshot error:',
        duplicateInvoiceError,
      )
      return {
        success: false,
        error: 'Failed to create a duplicate test invoice.',
      }
    }

    const { data: duplicateInvoice, error: duplicateInvoiceLookupError } =
      await serviceRole
      .from('subscription_invoices')
      .select('id, merchant_id')
      .eq('id', duplicateInvoiceId as string)
      .maybeSingle()

    if (duplicateInvoiceLookupError || !duplicateInvoice) {
      console.error(
        '[generateSubscriptionInvoiceManually] Duplicate fallback invoice lookup error:',
        duplicateInvoiceLookupError,
      )
      return {
        success: false,
        error: 'Failed to load the duplicate test invoice.',
      }
    }

    revalidatePath('/manage/billing')
    revalidatePath(`/manage/merchants/${duplicateInvoice.merchant_id}`)
    revalidatePath(`/manage/merchants/${duplicateInvoice.merchant_id}/billing`)
    revalidatePath('/manage/subscriptions')

    return { success: true, invoiceId: duplicateInvoice.id as string }
  }

  revalidatePath('/manage/billing')
  return { success: true, invoiceId: data as string }
}

export async function getSubscriptionInvoices(
  merchantId: string,
  locationId?: string | null,
  limit = 100,
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

  let invoices = ((data ?? []) as SubscriptionInvoiceRecord[]).map((row) => ({
    ...row,
    station_count_snapshot: Number(row.station_count_snapshot || 0),
    subtotal: Number(row.subtotal || 0),
    card_surcharge: Number(row.card_surcharge || 0),
    total_amount: Number(row.total_amount || 0),
    payment_attempt_count: Number(row.payment_attempt_count || 0),
    next_retry_at: row.next_retry_at ?? null,
    retry_exhausted_at: row.retry_exhausted_at ?? null,
  }))

  if (invoices.length > 0) {
    const serviceRole = createServiceRoleClient() as any
    const { data: retryRows, error: retryError } = await serviceRole
      .from('subscription_invoices')
      .select(
        'id, next_retry_at, retry_exhausted_at, processor, processor_account_id, processor_transaction_id, processor_response',
      )
      .in(
        'id',
        invoices.map((invoice) => invoice.id),
      )

    if (retryError && retryError.code !== '42703') {
      console.error('[getSubscriptionInvoices] Retry lookup error:', retryError)
      throw new Error('Failed to load invoice retry schedules.')
    }

    const retryByInvoiceId = new Map<
      string,
      {
        next_retry_at: string | null
        retry_exhausted_at: string | null
        processor: 'valor' | null
        processor_account_id: string | null
        processor_transaction_id: string | null
        processor_response: Record<string, unknown> | null
      }
    >(
      (retryRows ?? []).map((row: any) => [row.id, row]),
    )
    invoices = invoices.map((invoice) => ({
      ...invoice,
      next_retry_at:
        retryByInvoiceId.get(invoice.id)?.next_retry_at ?? null,
      retry_exhausted_at:
        retryByInvoiceId.get(invoice.id)?.retry_exhausted_at ?? null,
      processor: retryByInvoiceId.get(invoice.id)?.processor ?? null,
      processor_account_id:
        retryByInvoiceId.get(invoice.id)?.processor_account_id ?? null,
      processor_transaction_id:
        retryByInvoiceId.get(invoice.id)?.processor_transaction_id ?? null,
      processor_response:
        retryByInvoiceId.get(invoice.id)?.processor_response ?? null,
    }))
  }

  return invoices
}

export async function getSubscriptionInvoiceDocument(
  invoiceId: string,
): Promise<{
  success: boolean
  document?: SubscriptionInvoiceDocumentData
  error?: string
}> {
  await assertHQPermission('system.billing.manage')

  if (!invoiceId?.trim()) {
    return { success: false, error: 'invoiceId is required.' }
  }

  const serviceRole = createServiceRoleClient()
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
    .maybeSingle()

  if (invoiceError || !invoice) {
    console.error(
      '[getSubscriptionInvoiceDocument] Invoice lookup error:',
      invoiceError,
    )
    return { success: false, error: 'Invoice not found.' }
  }

  const [{ data: merchant }, { data: location }, billingProfileResult] =
    await Promise.all([
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
        accountHolderName:
          billingProfileResult.data?.account_holder_name || null,
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
  invoiceId: string,
): Promise<{
  success: boolean
  invoiceId?: string
  status?: string
  transactionId?: string | null
  error?: string
}> {
  await assertHQPermission('system.billing.manage')

  if (!invoiceId?.trim()) {
    return { success: false, error: 'invoiceId is required.' }
  }

  const chargeResult = await chargeSubscriptionInvoiceViaValor(
    invoiceId,
    'manual',
  )
  if (!chargeResult.success) return chargeResult

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
    invoiceId: chargeResult.invoiceId ?? invoiceId,
    status: chargeResult.status,
    transactionId: chargeResult.transactionId ?? null,
  }
}
