'use client'

import { useMemo, useState } from 'react'
import { Download, Eye, Loader2, MoreHorizontal, Zap } from 'lucide-react'
import { PaginationBar } from '@/components/dashboard/PaginationBar'
import { useClientPagination } from '@/lib/hooks/useClientPagination'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  MobileColumnsButton,
  initialHiddenColumns,
  type ReportColumn,
} from '@/components/dashboard/reports/MobileColumnsButton'
import { useIsMobile } from '@/hooks/use-mobile'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { subscriptionBillingScope } from '@/supabase/functions/_shared/subscription-billing-scope'
import type { SubscriptionInvoiceRecord } from '@/app/manage/actions/subscription-billing'
import { InfoHint } from './InfoHint'
import { formatDate, formatMoney } from './helpers'

const PAGE_SIZE = 10

// Invoice # and total identify the row and always show; on a phone everything
// else starts hidden and is toggled from the mobile column picker. The row's
// action menu isn't a column choice — it's always rendered.
const COLUMNS: ReportColumn[] = [
  { id: 'invoice', label: 'Invoice', locked: true },
  { id: 'scope', label: 'Scope', defaultHidden: true },
  { id: 'period', label: 'Period', defaultHidden: true },
  { id: 'total', label: 'Total', locked: true },
  { id: 'status', label: 'Status', defaultHidden: true },
  { id: 'due', label: 'Due', defaultHidden: true },
]

interface BillingHistorySectionProps {
  invoices: SubscriptionInvoiceRecord[]
  invoiceActionId: string | null
  isBusy: boolean
  onPreview: (invoiceId: string) => void
  onDownload: (invoiceId: string) => void
  onCharge: (invoiceId: string) => void
  /** Show only the newest N invoices (a snapshot); omit to page through all of them. */
  limit?: number
}

/**
 * Billing history for the whole merchant (tier + all locations), newest first,
 * paged 10 at a time (UI-DESIGN-SYSTEM §5.7), with per-invoice view / download /
 * charge actions.
 */
export function BillingHistorySection({
  invoices,
  invoiceActionId,
  isBusy,
  onPreview,
  onDownload,
  onCharge,
  limit,
}: BillingHistorySectionProps) {
  const rows = useMemo(() => {
    const sorted = [...invoices].sort((a, b) => {
      const aDate = a.paid_at || a.created_at || a.due_date || ''
      const bDate = b.paid_at || b.created_at || b.due_date || ''
      return bDate.localeCompare(aDate)
    })
    return limit === undefined ? sorted : sorted.slice(0, limit)
  }, [invoices, limit])

  const { pageRows, pagination, setPage } = useClientPagination(rows, PAGE_SIZE)
  const [hiddenCols, setHiddenCols] = useState(() => initialHiddenColumns(COLUMNS))
  const isMobile = useIsMobile()

  /** Column hiding only applies at mobile widths; desktop always shows all. */
  const isColVisible = (id: string) => !isMobile || !hiddenCols.has(id)

  return (
    <Card className="rounded-3xl">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base text-[#0C4FD1] dark:text-[#6CA0FF]">
            Billing history
            <InfoHint label="Recent subscription invoices across the merchant tier and every location. Use Charge to manually retry an open or failed card invoice." />
          </CardTitle>
          {rows.length > 0 && (
            <MobileColumnsButton columns={COLUMNS} hidden={hiddenCols} onChange={setHiddenCols} />
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.length === 0 ? (
          <div className="rounded-2xl bg-muted/30 p-8 text-center text-sm text-muted-foreground">
            No subscription invoices yet.
          </div>
        ) : (
          <>
            {/* The 760px floor keeps desktop columns from crushing; on a phone
                the picker trims columns instead, so the floor would only force
                a sideways scroll. Unbounded: paged at 10 rows, so an inner
                vertical scroll well only adds a second scrollbar. */}
            <Table
              variant="data"
              bounded={false}
              className={isMobile ? undefined : 'min-w-[760px]'}
            >
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  {isColVisible('scope') && <TableHead>Scope</TableHead>}
                  {isColVisible('period') && <TableHead>Period</TableHead>}
                  <TableHead className="text-right">Total</TableHead>
                  {isColVisible('status') && <TableHead>Status</TableHead>}
                  {isColVisible('due') && <TableHead>Due</TableHead>}
                  <TableHead className="w-10">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map((invoice) => {
                  const isTier = subscriptionBillingScope(invoice.metadata) === 'merchant_tier'
                  const canCharge =
                    invoice.billing_method === 'card' &&
                    (invoice.status === 'open' || invoice.status === 'failed')
                  const busyRow = invoiceActionId === invoice.id

                  return (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-medium">{invoice.invoice_number}</TableCell>
                      {isColVisible('scope') && (
                        <TableCell>{isTier ? 'Merchant tier' : invoice.location_name}</TableCell>
                      )}
                      {isColVisible('period') && (
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {formatDate(invoice.billing_period_start)} – {formatDate(invoice.billing_period_end)}
                        </TableCell>
                      )}
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatMoney(invoice.total_amount)}
                      </TableCell>
                      {isColVisible('status') && (
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {invoice.status}
                          </Badge>
                        </TableCell>
                      )}
                      {isColVisible('due') && (
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {formatDate(invoice.due_date)}
                        </TableCell>
                      )}
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              className="h-8 w-8 rounded-full p-0"
                              aria-label={`Actions for invoice ${invoice.invoice_number}`}
                            >
                              {busyRow ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <MoreHorizontal className="h-4 w-4" />
                              )}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => onPreview(invoice.id)}
                              disabled={isBusy && busyRow}
                            >
                              <Eye className="mr-2 h-4 w-4" />
                              View
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onDownload(invoice.id)}>
                              <Download className="mr-2 h-4 w-4" />
                              Download
                            </DropdownMenuItem>
                            {canCharge && (
                              <DropdownMenuItem onClick={() => onCharge(invoice.id)} disabled={isBusy}>
                                <Zap className="mr-2 h-4 w-4" />
                                Charge
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            <PaginationBar pagination={pagination} onPageChange={setPage} itemLabel="invoices" />
          </>
        )}
      </CardContent>
    </Card>
  )
}
