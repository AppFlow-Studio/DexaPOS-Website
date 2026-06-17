'use server'

import { assertHQPermission } from '@/lib/admin/auth'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { LogAuditEvent } from '@/app/dashboard/actions/audit-logs'
import type {
  Invoice,
  PaymentDueType,
} from '@/app/dashboard/actions/invoices'
import {
  loadInvoiceForSend,
  dispatchInvoiceSend,
  type SendInvoiceChannel,
  type SendInvoiceResult,
} from '@/lib/messaging/invoice-send-core'

// §5 — HQ bills a merchant. One-off invoices on the shared `invoices` table,
// flagged bill_type='platform_to_merchant', customer_id NULL. HQ admins pass the
// invoices RLS because is_merchant_admin() short-circuits on is_dexapos_admin(),
// so these use the authenticated client (same pattern as adminUpdateInvoiceStatus).

export interface PlatformInvoiceItemInput {
  name: string
  description?: string | null
  quantity: number
  unit_price: number
  sort_order?: number
}

export interface CreatePlatformInvoiceInput {
  location_id?: string | null
  payment_due_type: PaymentDueType
  due_date?: string | null
  subtotal: number
  discount_amount?: number
  tax_rate?: number
  tax_amount?: number
  total_amount: number
  note?: string | null
  items: PlatformInvoiceItemInput[]
}

export async function getAdminPlatformInvoices(
  merchantId: string,
): Promise<Invoice[]> {
  if (!merchantId) return []

  await assertHQPermission('hq.merchant.view')

  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
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
      updated_at
    `,
    )
    .eq('merchant_id', merchantId)
    .eq('bill_type', 'platform_to_merchant')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[getAdminPlatformInvoices] error:', error)
    return []
  }

  return (data as Invoice[]) || []
}

export async function createPlatformInvoice(
  merchantId: string,
  input: CreatePlatformInvoiceInput,
): Promise<{ data?: Invoice; error?: string }> {
  if (!merchantId) return { error: 'Merchant is required' }

  const { userId } = await assertHQPermission('hq.merchant.update')
  const supabase = createServerSupabaseClient()

  // Per-merchant invoice number (shared sequence with the merchant's own invoices).
  const { data: invoiceNumberData } = await supabase.rpc('generate_invoice_number', {
    p_merchant_id: merchantId,
  })
  const invoiceNumber = (invoiceNumberData as string) || `INV-${Date.now()}`

  const discountAmount = input.discount_amount ?? 0
  const taxRate = input.tax_rate ?? 0
  const taxAmount =
    input.tax_amount ??
    Math.round(((input.subtotal - discountAmount) * taxRate) / 100 * 100) / 100
  const totalAmount =
    input.total_amount ?? input.subtotal - discountAmount + taxAmount

  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .insert({
      merchant_id: merchantId,
      location_id: input.location_id || null,
      customer_id: null,
      bill_type: 'platform_to_merchant',
      invoice_number: invoiceNumber,
      status: 'draft',
      payment_due_type: input.payment_due_type,
      due_date: input.due_date || null,
      subtotal: input.subtotal,
      discount_amount: discountAmount,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      total_amount: totalAmount,
      note: input.note || null,
    })
    .select()
    .single()

  if (invoiceError || !invoice) {
    console.error('[createPlatformInvoice] error:', invoiceError)
    return { error: invoiceError?.message || 'Failed to create platform invoice' }
  }

  if (input.items && input.items.length > 0) {
    const itemRows = input.items.map((item, idx) => ({
      invoice_id: invoice.id,
      menu_item_id: null,
      name: item.name,
      description: item.description || null,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total_price: Math.round(item.quantity * item.unit_price * 100) / 100,
      sort_order: item.sort_order ?? idx,
    }))

    const { error: itemsError } = await supabase
      .from('invoice_items')
      .insert(itemRows)

    if (itemsError) {
      console.error('[createPlatformInvoice] items insert error:', itemsError)
      await LogAuditEvent({
        merchantId,
        action: `HQ created platform bill: ${invoiceNumber}`,
        actionCategory: 'billing',
        resourceType: 'invoice',
        resourceId: invoice.id,
        resourceName: invoiceNumber,
        metadata: { created_by_admin: userId, total_amount: totalAmount, items_error: itemsError.message },
      })
      return {
        data: invoice as Invoice,
        error: 'Bill was created but line items could not be saved. Please edit and re-add them.',
      }
    }
  }

  await LogAuditEvent({
    merchantId,
    action: `HQ created platform bill: ${invoiceNumber}`,
    actionCategory: 'billing',
    resourceType: 'invoice',
    resourceId: invoice.id,
    resourceName: invoiceNumber,
    metadata: { created_by_admin: userId, total_amount: totalAmount, bill_type: 'platform_to_merchant' },
  })

  return { data: invoice as Invoice }
}

export interface SendPlatformInvoiceParams {
  merchantId: string
  invoiceId: string
  channels: SendInvoiceChannel[]
  /** Overrides the resolved merchant billing email. */
  email?: string
}

/** Resolves the merchant's billing recipient: primary billing_email → owner_email. */
async function resolveMerchantBillingEmail(
  supabase: ReturnType<typeof createServiceRoleClient>,
  merchantId: string,
): Promise<string> {
  const { data: profile } = await supabase
    .from('merchant_billing_profiles')
    .select('billing_email')
    .eq('merchant_id', merchantId)
    .eq('is_active', true)
    .eq('is_primary', true)
    .not('billing_email', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (profile?.billing_email?.trim()) return profile.billing_email.trim()

  const { data: merchant } = await supabase
    .from('merchants')
    .select('owner_email')
    .eq('id', merchantId)
    .maybeSingle()

  return (merchant?.owner_email as string | null)?.trim() || ''
}

export async function sendPlatformInvoice(
  params: SendPlatformInvoiceParams,
): Promise<SendInvoiceResult> {
  const { userId } = await assertHQPermission('hq.merchant.update')

  const channels = Array.from(new Set(params.channels ?? []))
  if (channels.length === 0) {
    return { success: false, message: 'Select at least one channel.', results: [] }
  }

  const supabase = createServiceRoleClient()
  const invoice = await loadInvoiceForSend(supabase, params.invoiceId)
  if (
    !invoice ||
    invoice.merchant_id !== params.merchantId ||
    invoice.bill_type !== 'platform_to_merchant'
  ) {
    return { success: false, message: 'Platform invoice not found', results: [] }
  }

  const emailRecipient =
    params.email?.trim() ||
    (await resolveMerchantBillingEmail(supabase, params.merchantId))

  return dispatchInvoiceSend({
    supabase,
    userId,
    invoice,
    channels,
    emailRecipient,
    phoneRecipient: '',
    emailSubject: `Invoice ${invoice.invoice_number as string} from Dexa POS`,
  })
}
