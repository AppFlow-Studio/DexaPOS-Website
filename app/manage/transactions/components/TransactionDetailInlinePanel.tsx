'use client'

import { useMemo } from 'react'
import { format, formatDistanceToNow } from 'date-fns'
import { AlertCircle, Copy, RotateCcw, ShieldCheck, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { InfoIcon } from '@/components/ui/info-icon'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { usePlatformTransactionDetails } from '@/lib/queries/use-platform-analytics'

interface TransactionDetailInlinePanelProps {
  transactionId: string
}

function formatCurrency(value?: number) {
  return `$${Number(value || 0).toFixed(2)}`
}

function formatNegativeCurrency(value?: number) {
  const amount = Math.abs(Number(value || 0))
  if (!amount) return '$0.00'
  return `-${formatCurrency(amount)}`
}

function formatSignedCurrency(value?: number) {
  const amount = Number(value || 0)
  if (!amount) return '—'
  const sign = amount > 0 ? '+' : '-'
  return `${sign}${formatCurrency(Math.abs(amount))}`
}

function formatDateTime(value?: string) {
  if (!value) return '—'
  return format(new Date(value), 'MMM d, yyyy h:mm a')
}

function toLabel(value?: string) {
  if (!value) return '—'
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function getEntryModeLabel(raw?: string) {
  if (!raw) return 'N/A'
  const value = raw.toLowerCase()
  if (value.includes('contact') || value.includes('tap')) return 'Contactless'
  if (value.includes('chip') || value.includes('emv') || value.includes('insert')) return 'Chip'
  if (value.includes('swipe') || value.includes('magstripe') || value.includes('mag')) return 'Swipe'
  if (value.includes('manual') || value.includes('keyed') || value.includes('key')) return 'Manual'
  return 'N/A'
}

async function copyToClipboard(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value)
    toast.success(`${label} copied`)
  } catch {
    toast.error(`Failed to copy ${label.toLowerCase()}`)
  }
}

function CopyValue({ label, value }: { label: string; value?: string }) {
  if (!value) return <span className="text-muted-foreground">—</span>
  return (
    <div className="flex items-center justify-end gap-1">
      <span className="font-mono text-xs">{value}</span>
      <Button
        variant="ghost"
        size="icon"
        // 32px hit target (§13.6); the negative margin keeps the dense row's height.
        className="-my-1.5 h-8 w-8 rounded-full"
        aria-label={`Copy ${label}`}
        onClick={(event) => {
          event.stopPropagation()
          void copyToClipboard(value, label)
        }}
      >
        <Copy className="h-3 w-3" />
      </Button>
    </div>
  )
}

function PlatformFeeBreakdownSection({
  data,
}: {
  data: {
    subtotal_portion?: number
    tax_portion?: number
    dual_pricing_fee?: number
    tip_fee?: number
    refunded_dual_pricing_fee?: number
    refunded_tip_fee?: number
    original_tip_fee?: number
    dual_pricing_percentage_snapshot?: number
    tip_surcharge_percentage_snapshot?: number
  }
}) {
  const dualFee = Number(data.dual_pricing_fee ?? 0)
  const tipFee = Number(data.tip_fee ?? 0)
  const refundedDualFee = Number(data.refunded_dual_pricing_fee ?? 0)
  const refundedTipFee = Number(data.refunded_tip_fee ?? 0)
  const dualPct = Number(data.dual_pricing_percentage_snapshot ?? 0)
  const tipPct = Number(data.tip_surcharge_percentage_snapshot ?? 0)
  const subtotalPortion = data.subtotal_portion
  const taxPortion = data.tax_portion
  const originalTipFee = data.original_tip_fee
  const tipFeeAdjusted =
    originalTipFee !== undefined && Math.abs(Number(originalTipFee) - tipFee) > 0.001

  const hasAnyFee =
    dualFee > 0 ||
    tipFee > 0 ||
    refundedDualFee > 0 ||
    refundedTipFee > 0 ||
    dualPct > 0 ||
    tipPct > 0 ||
    (subtotalPortion !== undefined && Number(subtotalPortion) > 0) ||
    (taxPortion !== undefined && Number(taxPortion) > 0)

  const netDualFee = Math.max(0, dualFee - refundedDualFee)
  const netTipFee = Math.max(0, tipFee - refundedTipFee)
  const netTotal = netDualFee + netTipFee

  return (
    <section className="rounded-2xl bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-1 text-sm font-semibold text-foreground">
          Fees &amp; Surcharges
          <InfoIcon tip="Platform fees collected on this transaction. Net fee applies to the subtotal; Net fee on tip applies to the gratuity. Both reconcile line-for-line with TSYS. Net deposit = gross amount minus these fees." />
        </h4>
        {netTotal > 0 && (
          <Badge variant="outline" className="text-xs tabular-nums">
            Net fee {formatCurrency(netTotal)}
          </Badge>
        )}
      </div>
      {!hasAnyFee ? (
        <div className="text-xs text-muted-foreground">No platform fees on this payment.</div>
      ) : (
        <div className="grid gap-1 text-xs md:grid-cols-2">
          {subtotalPortion !== undefined && (
            <div className="flex justify-between">
              <span className="text-muted-foreground flex items-center gap-1">
                Subtotal Portion
                <InfoIcon tip="The portion of the order subtotal that the net fee is calculated on." side="right" />
              </span>
              <span className="tabular-nums">{formatCurrency(Number(subtotalPortion))}</span>
            </div>
          )}
          {taxPortion !== undefined && (
            <div className="flex justify-between">
              <span className="text-muted-foreground flex items-center gap-1">
                Tax Portion
                <InfoIcon tip="The portion of tax included in the fee base. Some fee structures include tax in the calculation." side="right" />
              </span>
              <span className="tabular-nums">{formatCurrency(Number(taxPortion))}</span>
            </div>
          )}
          {(dualFee > 0 || dualPct > 0) && (
            <div className="flex justify-between">
              <span className="text-muted-foreground flex items-center gap-1">
                Net fee{dualPct > 0 ? ` (${dualPct}%)` : ''}
                <InfoIcon tip="The platform fee applied to the order subtotal (excluding tip). Calculated as a percentage of the subtotal portion and reconciled with TSYS." side="right" />
              </span>
              <span className="tabular-nums">{formatCurrency(dualFee)}</span>
            </div>
          )}
          {refundedDualFee > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground pl-3">↳ Refunded Portion</span>
              <span className="tabular-nums text-muted-foreground">
                -{formatCurrency(refundedDualFee)}
              </span>
            </div>
          )}
          {(tipFee > 0 || tipPct > 0) && (
            <div className="flex justify-between">
              <span className="text-muted-foreground flex items-center gap-1">
                Net fee on tip{tipPct > 0 ? ` (${tipPct}%)` : ''}
                <InfoIcon tip="The platform fee applied to the tip amount. Calculated as a percentage of the gratuity and reconciled separately with TSYS." side="right" />
              </span>
              <span className="tabular-nums">{formatCurrency(tipFee)}</span>
            </div>
          )}
          {tipFeeAdjusted && originalTipFee !== undefined && (
            <div className="flex justify-between">
              <span className="text-muted-foreground pl-3">↳ Original</span>
              <span className="tabular-nums line-through text-muted-foreground">
                {formatCurrency(Number(originalTipFee))}
              </span>
            </div>
          )}
          {refundedTipFee > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground pl-3">↳ Refunded Portion</span>
              <span className="tabular-nums text-muted-foreground">
                -{formatCurrency(refundedTipFee)}
              </span>
            </div>
          )}
          {netTotal > 0 && (
            <div className="col-span-full mt-2 flex justify-between font-medium">
              <span className="flex items-center gap-1">
                Net fee after refund
                <InfoIcon tip="Total fees collected after subtracting any refunded fee portions. This is the amount TSYS will debit from the merchant's net deposit." side="right" />
              </span>
              <span className="tabular-nums">{formatCurrency(netTotal)}</span>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function getTimelineIcon(eventType?: string, newStatus?: string) {
  const type = `${eventType || ''} ${newStatus || ''}`.toLowerCase()
  if (type.includes('fail') || type.includes('declin') || type.includes('error')) {
    return <XCircle className="h-4 w-4 text-muted-foreground" />
  }
  if (type.includes('refund') || type.includes('return') || type.includes('void')) {
    return <RotateCcw className="h-4 w-4 text-muted-foreground" />
  }
  if (type.includes('approve') || type.includes('captur') || type.includes('authoriz') || type.includes('settl')) {
    return <ShieldCheck className="h-4 w-4 text-muted-foreground" />
  }
  return <AlertCircle className="h-4 w-4 text-muted-foreground" />
}

function DetailLoadingSkeleton() {
  return (
    <div className="space-y-4 p-0 sm:p-4" aria-busy="true">
      <span className="sr-only">Loading transaction detail…</span>
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-6 w-28 rounded-full" />
        <Skeleton className="h-6 w-32 rounded-full" />
        <Skeleton className="h-6 w-28 rounded-full" />
      </div>
      <div className="space-y-2 rounded-2xl bg-card p-4">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
        <Skeleton className="h-3 w-2/3" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {[0, 1].map((key) => (
          <div key={key} className="space-y-2 rounded-2xl bg-card p-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function TransactionDetailInlinePanel({ transactionId }: TransactionDetailInlinePanelProps) {
  const { data, isLoading, isFetching, error } = usePlatformTransactionDetails(transactionId, true)

  const emv = useMemo(() => {
    const direct = (data?.emv_data ?? null) as Record<string, unknown> | null
    const fromProcessor = (data?.processor_response?.emv_data ?? null) as Record<string, unknown> | null
    const fromMetadata = (data?.metadata?.emv_data ?? null) as Record<string, unknown> | null
    return direct || fromProcessor || fromMetadata || null
  }, [data])

  if (isLoading || isFetching) {
    return <DetailLoadingSkeleton />
  }

  if (error || !data) {
    return (
      <div className="p-0 sm:p-4">
        <div className="rounded-2xl bg-muted/60 px-4 py-3 text-sm">
          <div>Transaction details failed to load.</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Collapse and reopen the row to try again.
          </div>
        </div>
      </div>
    )
  }

  const serialFromProcessor = (data.processor_response?.serial_number as string | undefined) || undefined
  const terminalTpn = (data.processor_response?.tpn as string | undefined) || undefined
  const connectionType = (data.processor_response?.connection_type as string | undefined) || undefined
  const apiEnvironment = (data.processor_response?.api_environment as string | undefined) || undefined
  const paymentEvents = data.payment_events ?? []
  const paymentSegments = data.payment_segments ?? []
  const orderItems = data.order_items_full ?? []
  const orderDiscounts = data.order_discounts ?? []
  const paymentTimeline = [
    { label: 'Initiated', value: data.initiated_at },
    { label: 'Authorized', value: data.authorized_at },
    { label: 'Approved', value: data.approved_at },
    { label: 'Captured', value: data.captured_at },
  ].filter((step) => Boolean(step.value))
  const hasAdjustments =
    data.is_voided ||
    Boolean(data.voided_at) ||
    Boolean(data.returned_at) ||
    Boolean(data.return_amount && data.return_amount > 0) ||
    Boolean(data.refunded_amount && data.refunded_amount > 0) ||
    Boolean(data.tip_adjusted_at) ||
    Boolean(data.original_tip_amount !== undefined && data.original_tip_amount !== null)

  return (
    <div className="space-y-4 p-0 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="tabular-nums">
          Order: {data.order_number || data.display_number || data.order_id}
        </Badge>
        <Badge variant="outline">Payment: {toLabel(data.status)}</Badge>
        <Badge variant="outline">Method: {toLabel(data.payment_method)}</Badge>
        {data.is_split_payment && (
          <span className="inline-flex items-center gap-1">
            <Badge variant="outline" className="tabular-nums">Split #{data.split_sequence ?? '?'}</Badge>
            <InfoIcon tip="This order was paid using multiple payment methods or cards. Each split shows the portion charged to that card/method." side="right" />
          </span>
        )}
      </div>

      <section className="rounded-2xl bg-card p-4">
        <h4 className="mb-3 flex items-center gap-1 text-sm font-semibold text-foreground">
          Payment Segments
          <InfoIcon tip="A payment segment is one leg of a split payment. If a customer paid with two cards, there will be two segments. Each segment is authorized and captured independently." />
        </h4>
        {paymentSegments.length === 0 ? (
          <div className="text-xs text-muted-foreground">No payment segments found for this order.</div>
        ) : (
          <>
            {paymentSegments.length === 1 && !paymentSegments[0]?.is_split_payment && (
              <div className="mb-3 text-xs text-muted-foreground">
                This order has a single payment segment (not split).
              </div>
            )}
            <div className="grid gap-3 md:grid-cols-2">
              {paymentSegments.map((segment, index) => (
                <div key={segment.id} className="rounded-xl bg-muted/50 p-3 text-xs">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="font-medium tabular-nums">
                      Segment {segment.split_sequence ?? index + 1}
                    </div>
                    <Badge variant="outline">{toLabel(segment.status)}</Badge>
                  </div>
                  <div className="grid gap-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Method</span>
                      <span>{toLabel(segment.payment_method)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total</span>
                      <span className="tabular-nums">{formatCurrency(segment.total_amount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Amount</span>
                      <span className="tabular-nums">{formatCurrency(segment.amount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tip</span>
                      <span className="tabular-nums">{formatCurrency(segment.tip_amount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Card</span>
                      <span className="font-mono">
                        {segment.card_last_four ? `${toLabel(segment.card_type)} ****${segment.card_last_four}` : '—'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Entry</span>
                      <span>{getEntryModeLabel(segment.card_entry_mode)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Auth</span>
                      <span className="font-mono">{segment.authorization_code || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Ref #</span>
                      <span className="font-mono">{segment.reference_number || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Txn ID</span>
                      <span className="font-mono">{segment.transaction_id || '—'}</span>
                    </div>
                    {(segment.is_voided || segment.is_returned) && (
                      <div className="mt-1 rounded-xl bg-muted/60 p-2 text-[11px] tabular-nums">
                        {segment.is_voided && (
                          <div>
                            Voided{segment.voided_at ? ` at ${formatDateTime(segment.voided_at)}` : ''}{segment.void_reason ? ` (${segment.void_reason})` : ''}
                          </div>
                        )}
                        {segment.is_returned && (
                          <div>
                            Returned {segment.return_amount ? formatCurrency(segment.return_amount) : ''}{segment.returned_at ? ` at ${formatDateTime(segment.returned_at)}` : ''}{segment.return_reason ? ` (${segment.return_reason})` : ''}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <div className="grid items-start gap-4 md:grid-cols-2">
        <section className="rounded-2xl bg-card p-4">
          <h4 className="mb-3 text-sm font-semibold text-foreground">Transaction Details</h4>
          <div className="space-y-1 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Auth Code</span>
              <CopyValue label="Auth code" value={data.authorization_code} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Transaction ID</span>
              <CopyValue label="Transaction ID" value={data.transaction_id} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Reference #</span>
              <CopyValue label="Reference number" value={data.reference_number} />
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Response Code</span>
              <span className="font-mono">{data.dejavoo_response_code || data.error_code || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Payment Method</span>
              <span>{toLabel(data.payment_method)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Batch #</span>
              <span className="font-mono">{data.batch_number || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Entry Mode</span>
              <span>{getEntryModeLabel(data.card_entry_mode)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Settled</span>
              <span className="tabular-nums">{data.settled_at ? formatDateTime(data.settled_at) : 'No'}</span>
            </div>
            {paymentTimeline.map((step) => (
              <div key={step.label} className="flex justify-between">
                <span className="text-muted-foreground">{step.label}</span>
                <span className="tabular-nums">{formatDateTime(step.value)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl bg-card p-4">
          <h4 className="mb-3 text-sm font-semibold text-foreground">Terminal Info</h4>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Terminal</span>
              <span>{data.terminal_type || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Terminal ID</span>
              <span className="font-mono">{data.terminal_id || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Serial #</span>
              <span className="font-mono">{serialFromProcessor || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">TPN</span>
              <span className="font-mono">{terminalTpn || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Device ID</span>
              <span className="font-mono">{data.device_id || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Settlement Batch</span>
              <span className="font-mono">{data.settlement_batch_id || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Connection</span>
              <span>{connectionType || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">API Env</span>
              <span>{apiEnvironment || '—'}</span>
            </div>
          </div>
        </section>

        <section className="min-w-0 rounded-2xl bg-card p-4">
          <h4 className="mb-3 text-sm font-semibold text-foreground">Items Paid</h4>
          {data.paid_items.length === 0 ? (
            <div className="text-xs text-muted-foreground">No payment-item breakdown available.</div>
          ) : (
            <Table variant="data" bounded={false} className="text-xs [&_td]:py-2">
              <TableHeader>
                <TableRow>
                  <TableHead className="h-8 text-muted-foreground">Item</TableHead>
                  <TableHead className="h-8 text-right text-muted-foreground">Qty</TableHead>
                  <TableHead className="h-8 text-right text-muted-foreground">Subtotal</TableHead>
                  <TableHead className="h-8 text-right text-muted-foreground">Tax</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.paid_items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="whitespace-normal">
                      {item.item_name || item.order_item_id || '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{item.quantity_paid}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(item.subtotal_paid)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(item.tax_paid)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>

        <section className="rounded-2xl bg-card p-4">
          <h4 className="mb-3 flex items-center gap-1 text-sm font-semibold text-foreground">
            EMV Data
            <InfoIcon tip="Chip card cryptographic data from the card network. AID identifies the card application (e.g. Visa Credit). TVR/TSI are the terminal and transaction status indicators. TC is the transaction certificate proving the chip authorized this payment." />
          </h4>
          {!emv ? (
            <div className="text-xs text-muted-foreground">No EMV payload for this payment.</div>
          ) : (
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">AID</span>
                <span className="font-mono">{String(emv.aid ?? '—')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Application</span>
                <span className="font-mono">
                  {String(emv.applicationName ?? emv.application_name ?? emv.app_name ?? '—')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">TVR</span>
                <span className="font-mono">{String(emv.tvr ?? '—')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">TSI</span>
                <span className="font-mono">{String(emv.tsi ?? '—')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">TC</span>
                <span className="font-mono">{String(emv.tc ?? '—')}</span>
              </div>
            </div>
          )}
        </section>
      </div>

      <section className="min-w-0 rounded-2xl bg-card p-4">
        <h4 className="mb-3 text-sm font-semibold text-foreground">Order Breakdown (All Items)</h4>
        {orderItems.length === 0 ? (
          <div className="text-xs text-muted-foreground">No order items found.</div>
        ) : (
          <Table variant="data" bounded={false} className="text-xs [&_td]:py-2">
            <TableHeader>
              <TableRow>
                <TableHead className="h-8 text-muted-foreground">Item</TableHead>
                <TableHead className="h-8 text-muted-foreground">Size</TableHead>
                <TableHead className="h-8 text-right text-muted-foreground">Qty</TableHead>
                <TableHead className="h-8 text-right text-muted-foreground">Unit</TableHead>
                <TableHead className="h-8 text-right text-muted-foreground">Subtotal</TableHead>
                <TableHead className="h-8 text-right text-muted-foreground">Tax</TableHead>
                <TableHead className="h-8 text-right text-muted-foreground">Discount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orderItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="whitespace-normal align-top">
                    <div className={item.is_voided ? 'line-through text-muted-foreground' : ''}>
                      {item.item_name}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {item.is_voided && <Badge variant="outline" className="h-4 px-1 text-[10px]">Voided</Badge>}
                      {item.is_open_item && <Badge variant="outline" className="h-4 px-1 text-[10px]">Open Item</Badge>}
                      {item.is_tax_exempt && <Badge variant="outline" className="h-4 px-1 text-[10px]">Tax Exempt</Badge>}
                    </div>
                    {item.is_voided && item.void_reason && (
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        Reason: {item.void_reason}
                      </div>
                    )}
                    {item.modifiers.length > 0 && (
                      <div className="mt-1 space-y-1 pl-3">
                        {item.modifiers.map((modifier) => (
                          <div key={modifier.id} className="text-[11px] text-muted-foreground tabular-nums">
                            {modifier.modifier_group_name ? `${modifier.modifier_group_name}: ` : ''}
                            {modifier.modifier_name || 'Modifier'}
                            {modifier.quantity > 1 ? ` x${modifier.quantity}` : ''}
                            {modifier.price_modifier !== 0 ? ` (${formatSignedCurrency(modifier.price_modifier)})` : ''}
                          </div>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="align-top">{item.size_name || '—'}</TableCell>
                  <TableCell className="text-right tabular-nums align-top">{item.quantity}</TableCell>
                  <TableCell className="text-right tabular-nums align-top">{formatCurrency(item.unit_price)}</TableCell>
                  <TableCell className="text-right tabular-nums align-top">{formatCurrency(item.subtotal)}</TableCell>
                  <TableCell className="text-right tabular-nums align-top">
                    {item.tax !== undefined ? formatCurrency(item.tax) : '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums align-top">
                    {item.discount !== undefined && item.discount !== 0 ? formatCurrency(item.discount) : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <div className="mt-4 space-y-2">
          <div className="text-xs font-medium">Order-level Discounts</div>
          {orderDiscounts.length === 0 ? (
            <div className="text-xs text-muted-foreground">No order-level discounts recorded.</div>
          ) : (
            <div className="space-y-1">
              {orderDiscounts.map((discount) => (
                <div key={discount.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-muted-foreground tabular-nums">
                    {discount.discount_name || 'Discount'}
                    {discount.discount_type ? ` (${toLabel(discount.discount_type)})` : ''}
                    {discount.discount_value !== undefined ? ` ${discount.discount_value}` : ''}
                  </span>
                  <span className="tabular-nums">{formatNegativeCurrency(discount.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 grid gap-1 text-xs tabular-nums md:grid-cols-2">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span>{formatCurrency(data.order_subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Tax</span>
            <span>{formatCurrency(data.order_tax_amount)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Tip</span>
            <span>{formatCurrency(data.order_tip_amount)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Discount</span>
            <span>{formatNegativeCurrency(data.order_discount_amount)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Service Charge</span>
            <span>{formatCurrency(data.order_service_charge)}</span>
          </div>
          <div className="flex justify-between font-semibold">
            <span>Total</span>
            <span>{formatCurrency(data.order_total_amount)}</span>
          </div>
        </div>
      </section>

      <PlatformFeeBreakdownSection data={data} />

      <section className="rounded-2xl bg-card p-4">
        <h4 className="mb-3 text-sm font-semibold text-foreground">Adjustments & Reversals</h4>
        {!hasAdjustments && (
          <div className="mb-3 text-xs text-muted-foreground">
            No reversals or tip adjustments were recorded for this payment.
          </div>
        )}
        <div className="grid gap-2 text-xs tabular-nums md:grid-cols-2">
          <div className="rounded-xl bg-muted/50 p-3">
            <div className="mb-1 font-medium">Void</div>
            <div>Voided: {data.is_voided ? 'Yes' : 'No'}</div>
            <div>At: {formatDateTime(data.voided_at)}</div>
            <div>By: {data.voided_by || '—'}</div>
            <div>Reason: {data.void_reason || '—'}</div>
          </div>
          <div className="rounded-xl bg-muted/50 p-3">
            <div className="mb-1 font-medium">Return</div>
            <div>Returned: {data.is_returned ? 'Yes' : 'No'}</div>
            <div>Amount: {data.return_amount ? formatCurrency(data.return_amount) : '—'}</div>
            <div>At: {formatDateTime(data.returned_at)}</div>
            <div>By: {data.returned_by || '—'}</div>
            <div>Reason: {data.return_reason || '—'}</div>
          </div>
          <div className="rounded-xl bg-muted/50 p-3">
            <div className="mb-1 font-medium">Refund</div>
            <div>Amount: {data.refunded_amount ? formatCurrency(data.refunded_amount) : '—'}</div>
            <div>At: {formatDateTime(data.refunded_at)}</div>
            <div>Reason: {data.refund_reason || '—'}</div>
          </div>
          <div className="rounded-xl bg-muted/50 p-3">
            <div className="mb-1 font-medium">Tip Adjustment</div>
            <div>Original Tip: {data.original_tip_amount ? formatCurrency(data.original_tip_amount) : '—'}</div>
            <div>Current Tip: {formatCurrency(data.tip_amount)}</div>
            <div>Adjusted At: {formatDateTime(data.tip_adjusted_at)}</div>
            <div>Adjusted By: {data.tip_adjusted_by || '—'}</div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl bg-card p-4">
        <h4 className="mb-3 flex items-center gap-1 text-sm font-semibold text-foreground">
          Payment Timeline
          <InfoIcon tip="Chronological log of every status change on this payment — from initiation through authorization, capture, and any reversals. Each entry shows the event type, result code, and terminal that processed it." />
        </h4>
        {paymentEvents.length === 0 ? (
          <div className="text-xs text-muted-foreground">No payment events found for this transaction.</div>
        ) : (
          <ol className="space-y-3">
            {paymentEvents.map((event, index) => {
              const absoluteTime = formatDateTime(event.timestamp)
              const relativeTime = event.timestamp
                ? formatDistanceToNow(new Date(event.timestamp), { addSuffix: true })
                : '—'
              const hasRaw = Boolean(event.raw_response && Object.keys(event.raw_response).length > 0)

              return (
                <li key={event.id} className="relative pl-7">
                  {index < paymentEvents.length - 1 && (
                    <span className="absolute left-[11px] top-5 h-[calc(100%-12px)] w-px bg-border" />
                  )}
                  <span className="absolute left-0 top-0.5">{getTimelineIcon(event.event_type, event.new_status)}</span>
                  <div className="rounded-xl bg-muted/50 p-3 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-medium">{toLabel(event.event_type)}</div>
                      <span className="text-muted-foreground tabular-nums" title={absoluteTime}>
                        {relativeTime}
                      </span>
                    </div>
                    <div className="mt-1 grid gap-1 sm:grid-cols-2">
                      <div>
                        <span className="text-muted-foreground">Status:</span>{' '}
                        <span>
                          {event.previous_status ? toLabel(event.previous_status) : 'N/A'}{' '}
                          {'→'}{' '}
                          {event.new_status ? toLabel(event.new_status) : 'N/A'}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Terminal:</span>{' '}
                        <span className="font-mono">{event.terminal_id || '—'}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Result Code:</span>{' '}
                        <span className="font-mono">{event.result_code || '—'}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Message:</span>{' '}
                        <span>{event.response_message || '—'}</span>
                      </div>
                    </div>
                    {hasRaw && (
                      <details className="mt-2 rounded-xl bg-muted/50 p-3">
                        <summary className="cursor-pointer text-muted-foreground">Raw response JSON</summary>
                        <pre className="mt-2 overflow-auto rounded-lg bg-card p-2 text-[11px]">
                          {JSON.stringify(event.raw_response, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </section>
    </div>
  )
}
