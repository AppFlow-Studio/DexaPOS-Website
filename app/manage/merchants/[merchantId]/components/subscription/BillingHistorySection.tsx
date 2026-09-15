'use client'

import { useMemo } from 'react'
import { Download, Eye, Loader2, Zap } from 'lucide-react'
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
import { formatDate, formatMoney, invoiceStatusVariant } from './helpers'

interface BillingHistorySectionProps {
  invoices: SubscriptionInvoiceRecord[]
  invoiceActionId: string | null
  isBusy: boolean
  onPreview: (invoiceId: string) => void
  onDownload: (invoiceId: string) => void
  onCharge: (invoiceId: string) => void
  limit?: number
}

/**
 * Read-only billing history for the whole merchant (tier + all locations),
 * newest first, with per-invoice view / download / charge actions.
 */
export function BillingHistorySection({
  invoices,
  invoiceActionId,
  isBusy,
  onPreview,
  onDownload,
  onCharge,
  limit = 12,
}: BillingHistorySectionProps) {
  const rows = useMemo(
    () =>
      [...invoices]
        .sort((a, b) => {
          const aDate = a.paid_at || a.created_at || a.due_date || ''
          const bDate = b.paid_at || b.created_at || b.due_date || ''
          return bDate.localeCompare(aDate)
        })
        .slice(0, limit),
    [invoices, limit],
  )

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          Billing history
          <InfoHint label="Recent subscription invoices across the merchant tier and every location. Use Charge to manually retry an open or failed card invoice." />
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            No subscription invoices yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((invoice) => {
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
                      <TableCell className="font-medium">{formatMoney(invoice.total_amount)}</TableCell>
                      <TableCell>
                        <Badge variant={invoiceStatusVariant(invoice.status)} className="capitalize">
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
                          >
                            {busyRow ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => onDownload(invoice.id)}>
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
          </div>
        )}
      </CardContent>
    </Card>
  )
}
