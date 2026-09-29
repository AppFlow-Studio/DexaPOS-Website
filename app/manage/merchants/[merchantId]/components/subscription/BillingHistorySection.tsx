'use client'

import { useMemo } from 'react'
import { Download, Eye, Loader2, Zap } from 'lucide-react'
import { PaginationBar } from '@/components/dashboard/PaginationBar'
import { useClientPagination } from '@/lib/hooks/useClientPagination'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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

  return (
    <Card className="rounded-3xl">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          Billing history
          <InfoHint label="Recent subscription invoices across the merchant tier and every location. Use Charge to manually retry an open or failed card invoice." />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.length === 0 ? (
          <div className="rounded-2xl bg-muted/30 p-8 text-center text-sm text-muted-foreground">
            No subscription invoices yet.
          </div>
        ) : (
          <>
            <Table variant="data" className="min-w-[760px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
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
                      <TableCell>{isTier ? 'Merchant tier' : invoice.location_name}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {formatDate(invoice.billing_period_start)} – {formatDate(invoice.billing_period_end)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatMoney(invoice.total_amount)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {invoice.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {formatDate(invoice.due_date)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onPreview(invoice.id)}
                            disabled={isBusy && busyRow}
                            aria-label={`View invoice ${invoice.invoice_number}`}
                          >
                            {busyRow ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onDownload(invoice.id)}
                            aria-label={`Download invoice ${invoice.invoice_number}`}
                          >
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                          {canCharge && (
                            <Button variant="outline" size="sm" onClick={() => onCharge(invoice.id)} disabled={isBusy}>
                              <Zap className="mr-1 h-3.5 w-3.5" />
                              Charge
                            </Button>
                          )}
                        </div>
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
