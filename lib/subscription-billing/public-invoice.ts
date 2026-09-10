import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type {
  SubscriptionInvoiceDocumentData,
  SubscriptionInvoiceLineItem,
} from './invoice-template'
import { formatLongDate, formatShortDateRange, formatUsd } from './invoice-template'

/**
 * Shared, org-agnostic loaders for the hosted invoice page + PDF routes.
 * The public page/route resolve by `public_token` (opaque, unguessable); the
 * internal route resolves by id behind the internal-billing secret. Both map a
 * `subscription_invoices` row into the presentation `SubscriptionInvoiceDocumentData`
 * used by `renderSubscriptionInvoiceHtml` and the PDF builder — display fields
 * only (never card/processor data).
 */

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'billing@dexaposai.com'

interface RawInvoiceRow {
  invoice_number: string | null
  status: string | null
  billing_method: string | null
  billing_period_start: string | null
  billing_period_end: string | null
  line_items: unknown
  subtotal: number | string | null
  card_surcharge: number | string | null
  total_amount: number | string | null
  due_date: string | null
  paid_at: string | null
  created_at: string | null
}

function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

function normalizeLineItems(
  raw: unknown,
  periodStart: string | null,
  periodEnd: string | null,
): SubscriptionInvoiceLineItem[] {
  if (!Array.isArray(raw)) return []
  const periodLabel = formatShortDateRange(periodStart, periodEnd)
  return raw.map((entry) => {
    const item = (entry ?? {}) as Record<string, unknown>
    const quantity = Math.max(1, Number(item.quantity ?? 1) || 1)
    const amount = toNumber(
      (item.amount ?? item.subtotal ?? item.total_amount) as number | string | null,
    )
    const unitPrice =
      item.unit_price !== undefined
        ? toNumber(item.unit_price as number | string)
        : quantity > 0
          ? amount / quantity
          : amount
    return {
      code: (item.code ?? item.service_code ?? null) as string | undefined,
      description: String(
        item.description ?? item.display_name ?? item.code ?? 'Line item',
      ),
      periodLabel,
      quantity,
      unitPrice,
      amount,
    }
  })
}

export function mapRowToDocument(
  row: RawInvoiceRow,
  merchantName: string,
  locationName: string | null,
): SubscriptionInvoiceDocumentData {
  const total = toNumber(row.total_amount)
  const paid = row.status === 'paid'
  const summaryTitle = paid
    ? `${formatUsd(total)} paid ${row.paid_at ? `on ${formatLongDate(row.paid_at)}` : ''}`.trim()
    : `${formatUsd(total)} due ${row.due_date ? formatLongDate(row.due_date) : ''}`.trim()

  return {
    title: 'Invoice',
    invoiceNumber: row.invoice_number,
    issuedOn: row.created_at,
    dueDate: row.due_date,
    statusLabel: paid ? 'Paid' : row.status === 'failed' ? 'Payment failed' : 'Open',
    summaryTitle,
    fromParty: { title: 'Bill from', lines: ['Dexa POS Billing', FROM_EMAIL] },
    toParty: {
      title: 'Bill to',
      lines: [merchantName, locationName || ''].filter(Boolean),
    },
    lineItems: normalizeLineItems(row.line_items, row.billing_period_start, row.billing_period_end),
    subtotal: toNumber(row.subtotal),
    surcharge: toNumber(row.card_surcharge),
    total,
    finalAmountLabel: paid ? 'Amount paid' : 'Amount due',
    finalAmountValue: total,
    footerNote: paid
      ? 'Paid automatically with the card on file. Thank you for using Dexa POS.'
      : 'The card on file will be charged automatically on the due date. No action is required.',
  }
}

const SELECT_COLUMNS =
  'invoice_number, status, billing_method, billing_period_start, billing_period_end, line_items, subtotal, card_surcharge, total_amount, due_date, paid_at, created_at, merchant_id, location_id'

async function resolveNames(
  supabase: ReturnType<typeof createServiceRoleClient>,
  merchantId: string,
  locationId: string | null,
): Promise<{ merchantName: string; locationName: string | null }> {
  const [{ data: merchant }, locationResult] = await Promise.all([
    supabase.from('merchants').select('name, dba_name').eq('id', merchantId).maybeSingle(),
    locationId
      ? supabase.from('locations').select('name').eq('id', locationId).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  return {
    merchantName:
      (merchant?.dba_name as string | null) || (merchant?.name as string | null) || 'Dexa POS merchant',
    locationName: (locationResult?.data?.name as string | null) ?? null,
  }
}

/** Public: resolve a hosted invoice document by opaque token. Null if not found. */
export async function loadPublicSubscriptionInvoiceDocument(
  token: string,
): Promise<{ document: SubscriptionInvoiceDocumentData; status: string } | null> {
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('subscription_invoices')
    .select(SELECT_COLUMNS)
    .eq('public_token', token)
    .maybeSingle()
  if (!data) return null
  const { merchantName, locationName } = await resolveNames(
    supabase,
    data.merchant_id as string,
    (data.location_id as string | null) ?? null,
  )
  return {
    document: mapRowToDocument(data as unknown as RawInvoiceRow, merchantName, locationName),
    status: (data.status as string) ?? 'open',
  }
}

/** Internal: resolve by invoice id (behind the internal-billing secret). */
export async function loadSubscriptionInvoiceDocumentById(
  invoiceId: string,
): Promise<{ document: SubscriptionInvoiceDocumentData; status: string } | null> {
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('subscription_invoices')
    .select(SELECT_COLUMNS)
    .eq('id', invoiceId)
    .maybeSingle()
  if (!data) return null
  const { merchantName, locationName } = await resolveNames(
    supabase,
    data.merchant_id as string,
    (data.location_id as string | null) ?? null,
  )
  return {
    document: mapRowToDocument(data as unknown as RawInvoiceRow, merchantName, locationName),
    status: (data.status as string) ?? 'open',
  }
}
