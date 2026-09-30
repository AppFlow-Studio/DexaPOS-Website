'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { AlertTriangle, Download, ShieldCheck } from 'lucide-react'
import { InfoIcon } from '@/components/ui/info-icon'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PaginationBar } from '@/components/dashboard/PaginationBar'
import { PermissionGate } from '@/components/admin/PermissionGate'
import { useClientPagination } from '@/lib/hooks/useClientPagination'
import { usePlatformSettlementBatchPayments } from '@/lib/queries/use-platform-analytics'
import type {
  PlatformSettlementBatch,
  PlatformSettlementBatchPayment,
} from '@/app/manage/actions/hq-platform/transactions'
import { paymentDetailHref } from '../routes'
import { ManualBatchoutDialog } from './ManualBatchoutDialog'
import {
  CardGridEmpty,
  LoadError,
  RecordCardSkeletons,
  RecordLinkCard,
  RowLink,
  TableEmptyRow,
} from './ledger-primitives'

/*
 * One settlement batch's linked payments, plus its export and the super-admin
 * manual batchout. Rendered on the batch detail page, and inline under the
 * selected batch on merchant detail → Settlements.
 */

// Batch statuses for which a manual batchout is a no-op (already closed out).
const SETTLED_BATCH_STATUSES = new Set(['settled', 'funded', 'closed'])

const PAYMENT_PAGE_SIZE = 10
const XL_ONLY = 'hidden xl:table-cell'
/** Per-column visibility, in table order, shared by the loading rows. */
const PAYMENT_COLUMN_CLASSES = ['', XL_ONLY, '', '', '', '', XL_ONLY, '', '']

// ─── Batch wording, shared with the batch list and the detail page ─────────

export function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatDateOnly(dateValue?: string): string {
  if (!dateValue) return '—'
  return format(parseISO(dateValue), 'MMM d, yyyy')
}

export function formatDateTime(dateValue?: string): string {
  if (!dateValue) return '—'
  return format(new Date(dateValue), 'MMM d, yyyy h:mm a')
}

/** `under_review` → "Under review". */
export function formatLabel(value: string): string {
  const words = value.replace(/_/g, ' ').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export function pluralize(count: number, singular: string, plural: string): string {
  return `${count.toLocaleString()} ${count === 1 ? singular : plural}`
}

/**
 * Display label for a batch. Prefer the host batch_number ("009") with the
 * acquirer prefix ("TSYS-009"); fall back to the legacy batch_id text only
 * for pre-Wave-A.1 rows where batch_number was never populated.
 */
export function formatBatchLabel(batch: Pick<PlatformSettlementBatch, 'batch_number' | 'acquirer' | 'batch_id'>): string {
  if (batch.batch_number) {
    return batch.acquirer ? `${batch.acquirer}-${batch.batch_number}` : batch.batch_number
  }
  return batch.batch_id
}

// How the batch was settled — auto (Valor webhook / POS auto) vs manual.
export function getOriginLabel(origin?: string | null): string | null {
  switch (origin) {
    case 'valor_webhook':
      return 'Auto · Webhook'
    case 'pos_auto':
      return 'Auto'
    case 'hq_manual':
      return 'Manual · HQ'
    case 'pos_manual':
      return 'Manual'
    default:
      return null
  }
}

function formatPaymentFlags(payment: PlatformSettlementBatchPayment): string {
  if (payment.is_voided && payment.is_returned) return 'Void / Returned'
  if (payment.is_voided) return 'Void'
  if (payment.is_returned) return 'Returned'
  return '—'
}

/**
 * The reconciliation alarm (UI-DESIGN-SYSTEM §3.5 use 4, HQ-2): the glyph is
 * amber, the figure and the screen-reader word carry the meaning.
 */
export function DiscrepancyValue({ batch }: { batch: PlatformSettlementBatch }) {
  if (!batch.has_discrepancy) {
    return <span className="font-normal text-muted-foreground">Matched</span>
  }
  return (
    <span className="inline-flex items-center justify-end gap-1 font-medium tabular-nums">
      <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" aria-hidden />
      {formatCurrency(batch.discrepancy_amount)}
      <span className="sr-only">discrepancy</span>
    </span>
  )
}

export function batchErrorTitle(code: string): string {
  if (code === '57014') return 'Batch reconciliation timed out'
  if (code === 'PGRST202' || code === '42883') return 'Batch reconciliation is not installed on this database'
  return 'Batch reconciliation could not load'
}

export function batchErrorDetail(code: string): string {
  if (code === '57014') return `Narrow the date range or filter to one merchant. Error ${code}`
  if (code === 'PGRST202' || code === '42883') return `Apply the settlement batch migrations. Error ${code}`
  return `Error ${code}`
}

function buildBatchExportCsv(batch: PlatformSettlementBatch, rows: PlatformSettlementBatchPayment[]): string {
  const headers = [
    'batch_id',
    'business_date',
    'merchant',
    'location',
    'batch_status',
    'batch_gross_amount',
    'linked_payment_amount',
    'discrepancy_amount',
    'payment_id',
    'order_number',
    'payment_method',
    'payment_status',
    'total_amount',
    'tip_amount',
    'refund_amount',
    'is_voided',
    'is_returned',
    'captured_at',
    'initiated_at',
  ]

  const bodyRows = rows.map((row) => [
    batch.batch_id,
    batch.business_date,
    batch.merchant_name,
    batch.location_name || '',
    batch.status,
    batch.gross_amount,
    batch.linked_payment_amount,
    batch.discrepancy_amount,
    row.payment_id,
    row.order_number || '',
    row.payment_method,
    row.payment_status,
    row.total_amount,
    row.tip_amount,
    row.refund_amount,
    row.is_voided ? 'yes' : 'no',
    row.is_returned ? 'yes' : 'no',
    row.captured_at || '',
    row.initiated_at || '',
  ])

  const allRows = [headers, ...bodyRows]
  return allRows
    .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n')
}

function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

// ─── The panel ──────────────────────────────────────────────────────────────

export function SettlementBatchPanel({
  batch,
  renderBatchPayments,
  onBatchChanged,
  showSummary = true,
}: {
  batch: PlatformSettlementBatch
  /** Replaces the linked-payments list (merchant detail shows its own). */
  renderBatchPayments?: (batch: PlatformSettlementBatch) => React.ReactNode
  /** Called after a manual batchout so the host can refetch the batch. */
  onBatchChanged?: () => void | Promise<unknown>
  /** The one-line linked-vs-gross summary; the detail page shows it as tiles instead. */
  showSummary?: boolean
}) {
  const router = useRouter()
  const [manualBatchoutOpen, setManualBatchoutOpen] = useState(false)

  // Pass the settlement_batches UUID. The RPC resolves it to the canonical
  // (batch_number, acquirer) tuple and joins on order_payments.batch_number,
  // so lazy-created rows ('LAZY-...' batch_id) link correctly.
  const {
    data: batchPaymentsResult,
    isLoading: batchPaymentsLoading,
    isFetching: batchPaymentsFetching,
    refetch: refetchBatchPayments,
  } = usePlatformSettlementBatchPayments(batch.id, batch.merchant_id)

  const batchPayments = useMemo(() => batchPaymentsResult?.data || [], [batchPaymentsResult])
  const batchPaymentsErrorCode = batchPaymentsResult?.errorCode

  const {
    pageRows: paymentPageRows,
    pagination: paymentPagination,
    setPage: setPaymentPage,
  } = useClientPagination(batchPayments, PAYMENT_PAGE_SIZE)

  // A newly shown batch's payments start on page 1.
  useEffect(() => {
    setPaymentPage(1)
  }, [batch.id, setPaymentPage])

  const handleExport = () => {
    if (batchPayments.length === 0) return
    const csv = buildBatchExportCsv(batch, batchPayments)
    downloadCsv(csv, `DEXA_Batch_${formatBatchLabel(batch)}_${batch.business_date}.csv`)
  }

  const handleBatchoutSuccess = async (): Promise<void> => {
    await onBatchChanged?.()
    await refetchBatchPayments()
  }

  return (
    <div className="min-w-0 space-y-3">
      {showSummary && (
        <div className="hidden flex-wrap items-center gap-x-4 gap-y-1 text-sm sm:flex">
          <span>
            <span className="text-muted-foreground">Selected batch </span>
            <span className="font-mono font-medium">{formatBatchLabel(batch)}</span>
          </span>
          <span>
            <span className="text-muted-foreground">Linked payments </span>
            <span className="font-medium tabular-nums">{batch.linked_payment_count.toLocaleString()}</span>
          </span>
          <span>
            <span className="text-muted-foreground">Linked amount </span>
            <span className="font-medium tabular-nums">{formatCurrency(batch.linked_payment_amount)}</span>
          </span>
          <span>
            <span className="text-muted-foreground">Batch gross </span>
            <span className="font-medium tabular-nums">{formatCurrency(batch.gross_amount)}</span>
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-9 px-4"
          onClick={handleExport}
          disabled={batchPayments.length === 0}
        >
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
        <PermissionGate minLevel={10}>
          <Button
            variant="outline"
            size="sm"
            className="h-9 px-4"
            onClick={() => setManualBatchoutOpen(true)}
            disabled={SETTLED_BATCH_STATUSES.has(batch.status.toLowerCase())}
          >
            <ShieldCheck className="mr-2 h-4 w-4" />
            Manual batchout
          </Button>
          <span className="text-xs text-muted-foreground">
            Super-admin only · marks this batch settled (reconciliation, not a terminal batchout).
          </span>
        </PermissionGate>
      </div>

      {batchPaymentsErrorCode && (
        <LoadError
          className="bg-card"
          title="Batch payment details could not load"
          detail={`Error ${batchPaymentsErrorCode}`}
          onRetry={() => void refetchBatchPayments()}
        />
      )}

      {renderBatchPayments ? (
        renderBatchPayments(batch)
      ) : (
        <div>

          <Table
            variant="data"
            bounded={false}
            containerClassName="hidden md:block"
            className="md:min-w-[680px] xl:min-w-[960px]"
          >
            <TableHeader>
              <TableRow>
                <TableHead>Order #</TableHead>
                <TableHead className={XL_ONLY}>
                  <span className="inline-flex items-center gap-1">Payment ID <InfoIcon tip="Internal payment record ID linked to this batch entry." side="bottom" /></span>
                </TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right tabular-nums">
                  <span className="inline-flex items-center justify-end gap-1">Total <InfoIcon tip="Full charge amount for this payment including tip." side="bottom" /></span>
                </TableHead>
                <TableHead className="text-right tabular-nums">Tip</TableHead>
                <TableHead className={`${XL_ONLY} text-right tabular-nums`}>Refund</TableHead>
                <TableHead>
                  <span className="inline-flex items-center gap-1">Flags <InfoIcon tip="Void = cancelled before settlement. Returned = reversed after capture." side="bottom" /></span>
                </TableHead>
                <TableHead>Captured</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batchPaymentsLoading ? (
                Array.from({ length: 4 }).map((_, idx) => (
                  <TableRow key={`payment-loading-${idx}`}>
                    {PAYMENT_COLUMN_CLASSES.map((cellClass, cellIdx) => (
                      <TableCell key={`payment-loading-${idx}-${cellIdx}`} className={cellClass}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : batchPayments.length === 0 ? (
                <TableEmptyRow colSpan={PAYMENT_COLUMN_CLASSES.length} title="No payments linked to this batch" />
              ) : (
                paymentPageRows.map((payment) => {
                  const href = paymentDetailHref(payment.payment_id)
                  return (
                    <TableRow
                      key={payment.payment_id}
                      className="cursor-pointer"
                      onClick={() => router.push(href)}
                    >
                      <TableCell className="font-mono text-xs">
                        <RowLink href={href}>{payment.order_number || '—'}</RowLink>
                      </TableCell>
                      <TableCell className={`${XL_ONLY} font-mono text-xs`}>{payment.payment_id}</TableCell>
                      <TableCell>{formatLabel(payment.payment_method)}</TableCell>
                      <TableCell>{formatLabel(payment.payment_status)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(payment.total_amount)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(payment.tip_amount)}</TableCell>
                      <TableCell className={`${XL_ONLY} text-right tabular-nums`}>{formatCurrency(payment.refund_amount)}</TableCell>
                      <TableCell className="text-xs">{formatPaymentFlags(payment)}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatDateTime(payment.captured_at || payment.initiated_at)}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>

          {/* Phones: order, amount, status and when; the rest is on the payment's page. */}
          <div className="grid min-w-0 grid-cols-1 gap-3 md:hidden">
            {batchPaymentsLoading ? (
              <RecordCardSkeletons count={2} />
            ) : batchPayments.length === 0 ? (
              <CardGridEmpty title="No payments linked to this batch" />
            ) : (
              paymentPageRows.map((payment) => (
                <RecordLinkCard
                  key={payment.payment_id}
                  href={paymentDetailHref(payment.payment_id)}
                  title={<span className="font-mono">{payment.order_number || '—'}</span>}
                  figure={formatCurrency(payment.total_amount)}
                  subtitle={formatDateTime(payment.captured_at || payment.initiated_at)}
                  status={formatLabel(payment.payment_status)}
                />
              ))
            )}
          </div>

          <PaginationBar
            pagination={paymentPagination}
            onPageChange={setPaymentPage}
            itemLabel="payments"
            isLoading={batchPaymentsFetching}
          />
          {!batchPaymentsLoading &&
            batchPayments.length > 0 &&
            batchPayments.length <= PAYMENT_PAGE_SIZE && (
              <p className="mt-3 text-xs text-muted-foreground sm:text-sm tabular-nums">
                {pluralize(batchPayments.length, 'payment', 'payments')}
              </p>
            )}
        </div>
      )}

      <ManualBatchoutDialog
        batch={batch}
        open={manualBatchoutOpen}
        onOpenChange={setManualBatchoutOpen}
        onSuccess={handleBatchoutSuccess}
      />
    </div>
  )
}
