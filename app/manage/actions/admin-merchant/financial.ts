'use server'

import { LogAuditEvent } from '@/app/dashboard/actions/audit-logs'
import type { Invoice, InvoiceStatus } from '@/app/dashboard/actions/invoices'
import type {
  TipDistributionSession,
  TipSessionWithDetails,
} from '@/app/dashboard/actions/tips'
import { assertHQPermission } from '@/lib/admin/auth'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { PaymentFilters, PaymentRecord } from '@/types/payment'

export async function getAdminPayments(
  merchantId: string,
  locationId?: string | null,
  filters?: PaymentFilters
): Promise<PaymentRecord[]> {
  if (!merchantId) {
    return []
  }

  await assertHQPermission('hq.merchant.view')

  const supabase = createServerSupabaseClient()

  let query = supabase
    .from('order_payments')
    .select(
      `
      *,
      orders!inner(
        order_number,
        display_number,
        location_id,
        status,
        order_type,
        customer_name,
        created_at,
        merchant_id
      ),
      order_payment_items(
        *,
        order_items(id, item_name, quantity)
      ),
      reversals(
        *,
        order_refund_items(*)
      )
    `
    )
    .eq('orders.merchant_id', merchantId)

  if (locationId && locationId !== 'all') {
    query = query.eq('orders.location_id', locationId)
  }

  if (filters?.dateRange?.from) {
    const from = new Date(filters.dateRange.from)
    if (!Number.isNaN(from.getTime())) {
      query = query.gte('initiated_at', from.toISOString())
    }
  }

  if (filters?.dateRange?.to) {
    const to = new Date(filters.dateRange.to)
    if (!Number.isNaN(to.getTime())) {
      to.setHours(23, 59, 59, 999)
      query = query.lte('initiated_at', to.toISOString())
    }
  }

  if (filters?.paymentMethod?.length) {
    query = query.in('payment_method', filters.paymentMethod)
  }

  if (filters?.status?.length) {
    query = query.in('status', filters.status)
  }

  if (filters?.amountRange?.min !== undefined) {
    query = query.gte('total_amount', filters.amountRange.min)
  }

  if (filters?.amountRange?.max !== undefined) {
    query = query.lte('total_amount', filters.amountRange.max)
  }

  const { data, error } = await query.order('initiated_at', { ascending: false })

  if (error) {
    console.error('[getAdminPayments] Error getting payments:', error)
    return []
  }

  let result = (data as PaymentRecord[]) || []

  if (filters?.cardType?.length) {
    result = result.filter(
      (payment) => payment.card_type && filters.cardType!.includes(payment.card_type)
    )
  }

  if (filters?.searchQuery) {
    const search = filters.searchQuery.toLowerCase()
    result = result.filter(
      (payment) =>
        payment.orders?.order_number?.toLowerCase().includes(search) ||
        payment.orders?.display_number?.toLowerCase().includes(search) ||
        payment.authorization_code?.toLowerCase().includes(search) ||
        payment.card_last_four?.includes(search) ||
        payment.orders?.customer_name?.toLowerCase().includes(search) ||
        payment.reference_number?.toLowerCase().includes(search) ||
        payment.transaction_id?.toLowerCase().includes(search)
    )
  }

  return result
}

export async function getAdminInvoices(
  merchantId: string,
  locationId?: string | null,
  status?: InvoiceStatus | null
): Promise<Invoice[]> {
  if (!merchantId) {
    return []
  }

  await assertHQPermission('hq.merchant.view')

  const supabase = createServerSupabaseClient()

  let query = supabase
    .from('invoices')
    .select(
      `
      id,
      merchant_id,
      location_id,
      customer_id,
      invoice_number,
      status,
      payment_due_type,
      due_date,
      subtotal,
      discount_amount,
      tax_rate,
      tax_amount,
      total_amount,
      note,
      created_at,
      updated_at,
      customer:customers(id, name, email, phone)
    `
    )
    .eq('merchant_id', merchantId)
    .order('created_at', { ascending: false })

  if (locationId && locationId !== 'all') {
    query = query.eq('location_id', locationId)
  }

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error } = await query

  if (error) {
    console.error('[getAdminInvoices] error:', error)
    return []
  }

  return ((data as Array<Record<string, any>>) || []).map((invoice) => ({
    ...invoice,
    customer: Array.isArray(invoice.customer) ? invoice.customer[0] ?? null : invoice.customer,
  })) as Invoice[]
}

export async function adminUpdateInvoiceStatus(
  merchantId: string,
  invoiceId: string,
  status: InvoiceStatus
): Promise<{ success: boolean; error?: string }> {
  try {
    const { userId } = await assertHQPermission('hq.merchant.update')
    const supabase = createServerSupabaseClient()

    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('id, merchant_id, location_id, invoice_number, status')
      .eq('id', invoiceId)
      .single()

    if (invoiceError || !invoice || invoice.merchant_id !== merchantId) {
      return { success: false, error: 'Invoice not found' }
    }

    const { error } = await supabase
      .from('invoices')
      .update({ status })
      .eq('id', invoiceId)

    if (error) {
      return { success: false, error: error.message }
    }

    await LogAuditEvent({
      merchantId,
      locationId: invoice.location_id,
      action: `HQ admin updated invoice status to ${status}`,
      actionCategory: 'financial',
      resourceType: 'invoice',
      resourceId: invoiceId,
      resourceName: invoice.invoice_number,
      metadata: {
        updated_by_admin: userId,
        status,
      },
    })

    return { success: true }
  } catch (error) {
    console.error('[adminUpdateInvoiceStatus] error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

export async function adminDeleteInvoice(
  merchantId: string,
  invoiceId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { userId } = await assertHQPermission('hq.merchant.update')
    const supabase = createServerSupabaseClient()

    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('id, merchant_id, location_id, invoice_number, status')
      .eq('id', invoiceId)
      .single()

    if (invoiceError || !invoice || invoice.merchant_id !== merchantId) {
      return { success: false, error: 'Invoice not found' }
    }

    const { error } = await supabase.from('invoices').delete().eq('id', invoiceId)

    if (error) {
      return { success: false, error: error.message }
    }

    await LogAuditEvent({
      merchantId,
      locationId: invoice.location_id,
      action: 'HQ admin deleted invoice',
      actionCategory: 'financial',
      resourceType: 'invoice',
      resourceId: invoiceId,
      resourceName: invoice.invoice_number,
      metadata: {
        deleted_by_admin: userId,
        previous_status: invoice.status,
      },
    })

    return { success: true }
  } catch (error) {
    console.error('[adminDeleteInvoice] error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

export async function getAdminTipDistributionSession(
  merchantId: string,
  locationId: string,
  sessionDate: string,
  shiftPeriod: string
): Promise<{ success: boolean; data: TipSessionWithDetails | null; error: string | null }> {
  try {
    await assertHQPermission('hq.merchant.view')

    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
      .from('tip_distribution_sessions')
      .select(
        `
        *,
        tip_distribution_details(
          *,
          staff_profiles(id, first_name, last_name, display_name)
        )
      `
      )
      .eq('merchant_id', merchantId)
      .eq('location_id', locationId)
      .eq('session_date', sessionDate)
      .eq('shift_period', shiftPeriod)
      .single()

    if (error && error.code !== 'PGRST116') {
      return { success: false, data: null, error: error.message }
    }

    return { success: true, data: data as TipSessionWithDetails, error: null }
  } catch (error) {
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

export async function getAdminTipDistributionHistory(
  merchantId: string,
  locationId: string,
  limit: number = 20
): Promise<{ success: boolean; data: TipDistributionSession[] | null; error: string | null }> {
  try {
    await assertHQPermission('hq.merchant.view')

    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
      .from('tip_distribution_sessions')
      .select('*')
      .eq('merchant_id', merchantId)
      .eq('location_id', locationId)
      .order('session_date', { ascending: false })
      .limit(limit)

    if (error) {
      return { success: false, data: null, error: error.message }
    }

    return {
      success: true,
      data: (data as TipDistributionSession[]) || [],
      error: null,
    }
  } catch (error) {
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

export async function adminCalculateTipDistribution(
  merchantId: string,
  locationId: string,
  sessionDate: string,
  shiftPeriod: string = 'full_day',
  calculatedByStaffProfileId: string | null = null
): Promise<{
  success: boolean
  data: { session_id: string; total_collected: number; total_distributed: number } | null
  error: string | null
}> {
  try {
    await assertHQPermission('hq.merchant.update')
    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase.rpc('calculate_tip_distribution', {
      p_location_id: locationId,
      p_merchant_id: merchantId,
      p_session_date: sessionDate,
      p_shift_period: shiftPeriod,
      p_calculated_by: calculatedByStaffProfileId,
    })

    if (error) {
      return { success: false, data: null, error: error.message }
    }

    await LogAuditEvent({
      merchantId,
      locationId,
      action: `HQ admin calculated tip distribution for ${sessionDate} (${shiftPeriod})`,
      actionCategory: 'financial',
      resourceType: 'tip_distribution_session',
      resourceId: data.session_id,
      resourceName: sessionDate,
    })

    return {
      success: true,
      data: {
        session_id: data.session_id,
        total_collected: data.total_collected,
        total_distributed: data.total_distributed,
      },
      error: null,
    }
  } catch (error) {
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

export async function adminApproveTipDistribution(
  merchantId: string,
  sessionId: string,
  approvedByStaffProfileId: string | null = null
): Promise<{ success: boolean; error: string | null }> {
  try {
    await assertHQPermission('hq.merchant.update')
    const supabase = createServerSupabaseClient()

    const { data: session } = await supabase
      .from('tip_distribution_sessions')
      .select('id, merchant_id, location_id, session_date')
      .eq('id', sessionId)
      .single()

    if (!session || session.merchant_id !== merchantId) {
      return { success: false, error: 'Session not found' }
    }

    const { error } = await supabase.rpc('approve_tip_distribution', {
      p_session_id: sessionId,
      p_approved_by: approvedByStaffProfileId,
    })

    if (error) {
      return { success: false, error: error.message }
    }

    await LogAuditEvent({
      merchantId,
      locationId: session.location_id,
      action: `HQ admin approved tip distribution for ${session.session_date}`,
      actionCategory: 'financial',
      resourceType: 'tip_distribution_session',
      resourceId: sessionId,
      resourceName: session.session_date,
    })

    return { success: true, error: null }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

export async function adminUpdateTipManualAdjustment(
  merchantId: string,
  detailId: string,
  amount: number,
  reason?: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    await assertHQPermission('hq.merchant.update')
    const supabase = createServerSupabaseClient()

    const { data: detail } = await supabase
      .from('tip_distribution_details')
      .select('*')
      .eq('id', detailId)
      .single()

    if (!detail) {
      return { success: false, error: 'Detail not found' }
    }

    const { data: session } = await supabase
      .from('tip_distribution_sessions')
      .select('id, merchant_id, total_tips_collected, location_id')
      .eq('id', detail.session_id)
      .single()

    if (!session || session.merchant_id !== merchantId) {
      return { success: false, error: 'Session not found' }
    }

    const newNetTips =
      detail.individual_tips_earned -
      detail.tip_pool_contributed +
      detail.tip_pool_received -
      detail.tip_out_given +
      detail.tip_out_received +
      amount

    const { error: detailError } = await supabase
      .from('tip_distribution_details')
      .update({ manual_adjustment: amount, net_tips: newNetTips })
      .eq('id', detailId)

    if (detailError) {
      return { success: false, error: detailError.message }
    }

    const { data: aggregated } = await supabase
      .from('tip_distribution_details')
      .select('net_tips')
      .eq('session_id', detail.session_id)

    const newTotalDistributed =
      (aggregated as Array<{ net_tips: number | null }> | null)?.reduce(
        (sum, row) => sum + (row.net_tips || 0),
        0
      ) || 0

    const roundingAdjustment = session.total_tips_collected - newTotalDistributed

    const { error: sessionError } = await supabase
      .from('tip_distribution_sessions')
      .update({
        total_distributed: newTotalDistributed,
        rounding_adjustment: roundingAdjustment,
      })
      .eq('id', detail.session_id)

    if (sessionError) {
      return { success: false, error: sessionError.message }
    }

    await LogAuditEvent({
      merchantId,
      locationId: session.location_id,
      action: `HQ admin adjusted tip distribution (${reason || 'no reason'})`,
      actionCategory: 'financial',
      resourceType: 'tip_distribution_detail',
      resourceId: detailId,
      resourceName: `Manual adjustment: ${amount}`,
      changes: { after: { adjustment: amount, reason } as any },
    })

    return { success: true, error: null }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
