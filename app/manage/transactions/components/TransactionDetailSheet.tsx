'use client'

import { format } from 'date-fns'
import { AlertCircle, CreditCard, Store, User } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { CardBrandIcon } from '@/app/dashboard/payments/components/CardBrandIcon'
import { usePlatformTransactionDetails } from '@/lib/queries/use-platform-analytics'

interface TransactionDetailSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  transactionId: string | null
}

function formatCurrency(value?: number) {
  return `$${Number(value || 0).toFixed(2)}`
}

function formatDateTime(value?: string) {
  if (!value) return '-'
  return format(new Date(value), 'MMM d, yyyy h:mm a')
}

function toLabel(value?: string) {
  if (!value) return '-'
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function StatusPill({ label, value }: { label: string; value?: string }) {
  if (!value) return null
  return (
    <Badge variant="outline" className="text-xs">
      {label}: {toLabel(value)}
    </Badge>
  )
}

function Field({
  label,
  value,
}: {
  label: string
  value?: string | number | null
}) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm">{value !== null && value !== undefined && value !== '' ? value : '-'}</div>
    </div>
  )
}

export function TransactionDetailSheet({
  open,
  onOpenChange,
  transactionId,
}: TransactionDetailSheetProps) {
  const { data, isLoading, error } = usePlatformTransactionDetails(transactionId, open)

  const timeline = [
    { label: 'Initiated', value: data?.initiated_at },
    { label: 'Authorized', value: data?.authorized_at },
    { label: 'Approved', value: data?.approved_at },
    { label: 'Captured', value: data?.captured_at },
    { label: 'Returned', value: data?.returned_at },
    { label: 'Refunded', value: data?.refunded_at },
    { label: 'Voided', value: data?.voided_at },
    { label: 'Failed', value: data?.failed_at },
    { label: 'Order Completed', value: data?.completed_at },
  ].filter((step) => Boolean(step.value))

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[620px] max-w-[96vw] overflow-hidden p-0">
        <div className="flex h-full flex-col">
          <SheetHeader className="border-b pr-14">
            <SheetTitle>Transaction Details</SheetTitle>
            <SheetDescription>
              {transactionId ? `Payment ID: ${transactionId}` : 'Select a transaction to inspect details'}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-4">
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            ) : error ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                Failed to load transaction details.
              </div>
            ) : !data ? (
              <div className="text-sm text-muted-foreground">Transaction not found.</div>
            ) : (
              <div className="space-y-5">
                <div className="rounded-lg border bg-muted/20 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Order</div>
                      <div className="font-semibold">
                        {data.order_number || data.display_number || data.order_id}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Created {formatDateTime(data.created_at)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Payment Total</div>
                      <div className="font-mono text-2xl font-bold">{formatCurrency(data.total_amount)}</div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <StatusPill label="Payment" value={data.status} />
                    <StatusPill label="Order" value={data.order_status} />
                    <StatusPill label="Order Pay" value={data.payment_status} />
                  </div>
                </div>

                <div className="grid gap-3 rounded-lg border p-4 md:grid-cols-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Store className="h-4 w-4 text-muted-foreground" />
                    Merchant Context
                  </div>
                  <div className="grid gap-3 md:col-span-2 md:grid-cols-2">
                    <Field label="Merchant" value={data.merchant_name} />
                    <Field label="Location" value={data.location_name} />
                    <Field label="Order Type" value={toLabel(data.order_type)} />
                    <Field label="Table" value={data.table_number} />
                  </div>
                </div>

                <div className="grid gap-3 rounded-lg border p-4 md:grid-cols-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <User className="h-4 w-4 text-muted-foreground" />
                    Customer
                  </div>
                  <div className="grid gap-3 md:col-span-2 md:grid-cols-2">
                    <Field label="Name" value={data.customer_name} />
                    <Field label="Phone" value={data.customer_phone} />
                    <Field label="Email" value={data.customer_email} />
                    <Field label="Staff" value={data.staff_name} />
                  </div>
                </div>

                <div className="grid gap-3 rounded-lg border p-4 md:grid-cols-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <CreditCard className="h-4 w-4 text-muted-foreground" />
                    Payment
                  </div>
                  <div className="grid gap-3 md:col-span-2 md:grid-cols-2">
                    <Field label="Method" value={toLabel(data.payment_method)} />
                    <div className="space-y-1">
                      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Card</div>
                      {data.card_last_four ? (
                        <div className="flex items-center gap-1.5 text-sm font-mono">
                          <CardBrandIcon brand={data.card_type} className="h-5 w-auto" />
                          <span>****{data.card_last_four}</span>
                        </div>
                      ) : (
                        <div className="text-sm">-</div>
                      )}
                    </div>
                    <Field label="Authorization" value={data.authorization_code} />
                    <Field label="Reference" value={data.reference_number} />
                    <Field label="Processor" value={data.processor_name} />
                    <Field label="Terminal" value={data.terminal_id || data.terminal_type} />
                  </div>
                </div>

                <div className="grid gap-3 rounded-lg border p-4 md:grid-cols-3">
                  <Field label="Payment Amount" value={formatCurrency(data.amount)} />
                  <Field label="Payment Tip" value={formatCurrency(data.tip_amount)} />
                  <Field label="Payment Total" value={formatCurrency(data.total_amount)} />
                  <Field label="Order Subtotal" value={formatCurrency(data.order_subtotal)} />
                  <Field label="Order Tax" value={formatCurrency(data.order_tax_amount)} />
                  <Field label="Order Tip" value={formatCurrency(data.order_tip_amount)} />
                  <Field label="Order Discount" value={formatCurrency(data.order_discount_amount)} />
                  <Field label="Service Charge" value={formatCurrency(data.order_service_charge)} />
                  <Field label="Order Total" value={formatCurrency(data.order_total_amount)} />
                  {data.refunded_amount !== undefined && (
                    <Field label="Refunded" value={formatCurrency(data.refunded_amount)} />
                  )}
                  {data.return_amount !== undefined && (
                    <Field label="Returned" value={formatCurrency(data.return_amount)} />
                  )}
                  {data.gateway_fee !== undefined && (
                    <Field label="Gateway Fee" value={formatCurrency(data.gateway_fee)} />
                  )}
                </div>

                {(data.error_code || data.error_message || data.is_voided || data.refund_reason || data.return_reason) && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
                    <div className="mb-2 flex items-center gap-2 text-sm font-medium text-amber-900">
                      <AlertCircle className="h-4 w-4" />
                      Flags
                    </div>
                    <div className="grid gap-2 text-sm md:grid-cols-2">
                      <Field label="Voided" value={data.is_voided ? 'Yes' : 'No'} />
                      <Field label="Void Reason" value={data.void_reason} />
                      <Field label="Refund Reason" value={data.refund_reason} />
                      <Field label="Return Reason" value={data.return_reason} />
                      <Field label="Error Code" value={data.error_code} />
                      <Field label="Error Message" value={data.error_message} />
                    </div>
                  </div>
                )}

                {data.items.length > 0 && (
                  <div className="rounded-lg border p-4">
                    <div className="mb-3 text-sm font-medium">Order Items ({data.items.length})</div>
                    <div className="space-y-2">
                      {data.items.map((item) => (
                        <div key={item.id} className="flex items-start justify-between gap-3 rounded-md border p-2">
                          <div>
                            <div className="text-sm font-medium">{item.quantity}x {item.item_name}</div>
                            {item.special_instructions && (
                              <div className="text-xs text-muted-foreground">{item.special_instructions}</div>
                            )}
                          </div>
                          <div className="text-right text-sm font-mono">{formatCurrency(item.subtotal)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {timeline.length > 0 && (
                  <div className="rounded-lg border p-4">
                    <div className="mb-3 text-sm font-medium">Timeline</div>
                    <div className="space-y-2">
                      {timeline.map((step, index) => (
                        <div key={step.label}>
                          <div className="flex items-center justify-between gap-3 text-sm">
                            <span className="text-muted-foreground">{step.label}</span>
                            <span>{formatDateTime(step.value)}</span>
                          </div>
                          {index < timeline.length - 1 && <Separator className="mt-2" />}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {data.notes && (
                  <div className="rounded-lg border p-4">
                    <div className="mb-1 text-sm font-medium">Notes</div>
                    <div className="text-sm text-muted-foreground whitespace-pre-wrap">{data.notes}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
