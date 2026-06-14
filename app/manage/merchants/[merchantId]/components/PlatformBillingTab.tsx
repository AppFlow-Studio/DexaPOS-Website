'use client'

import { useState } from 'react'
import {
  Ban,
  CheckCheck,
  FileText,
  MoreHorizontal,
  Plus,
  Send,
  Trash2,
} from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { InvoiceStatusBadge } from '@/app/dashboard/invoices/components/InvoiceStatusBadge'
import { isSendable } from '@/lib/invoices/lifecycle'
import type { Invoice } from '@/app/dashboard/actions/invoices'
import {
  useAdminDeletePlatformInvoice,
  useAdminPlatformInvoices,
  useAdminUpdatePlatformInvoiceStatus,
  useSendPlatformInvoice,
} from '@/lib/queries/use-admin-financial'
import { PlatformInvoiceDialog } from './PlatformInvoiceDialog'

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount)
}

function dueLabel(invoice: Invoice) {
  if (invoice.payment_due_type === 'upon_receipt') return 'Upon Receipt'
  if (invoice.payment_due_type === 'net_15') return 'Net 15'
  if (invoice.payment_due_type === 'net_30') return 'Net 30'
  if (invoice.payment_due_type === 'net_60') return 'Net 60'
  if (invoice.due_date) return formatDate(invoice.due_date)
  return '—'
}

interface PlatformBillingTabProps {
  merchantId: string
  locations: Array<{ id: string; name: string }>
}

export function PlatformBillingTab({ merchantId, locations }: PlatformBillingTabProps) {
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null)

  const { data: invoices = [], isLoading } = useAdminPlatformInvoices(merchantId)
  const sendBill = useSendPlatformInvoice(merchantId)
  const updateStatus = useAdminUpdatePlatformInvoiceStatus(merchantId)
  const deleteBill = useAdminDeletePlatformInvoice(merchantId)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Platform Billing</h2>
          <p className="text-sm text-muted-foreground">
            Bills issued by Dexa POS to this merchant (hardware, setup, services).
          </p>
        </div>
        <Button className="self-start sm:self-auto" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Bill
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-3 p-6">
              {[...Array(4)].map((_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          ) : invoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
              <FileText className="mb-4 h-12 w-12 text-muted-foreground/30" />
              <h3 className="mb-1 text-lg font-semibold">No platform bills yet</h3>
              <p className="mb-4 text-sm text-muted-foreground">
                Create a bill to charge this merchant for hardware or services.
              </p>
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                New Bill
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[600px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Bill #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-medium">
                        {invoice.invoice_number}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(invoice.created_at)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {dueLabel(invoice)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatCurrency(invoice.total_amount)}
                      </TableCell>
                      <TableCell>
                        <InvoiceStatusBadge status={invoice.status} />
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {isSendable(invoice.status) && (
                              <DropdownMenuItem
                                onClick={() =>
                                  sendBill.mutate({
                                    invoiceId: invoice.id,
                                    channels: ['email'],
                                  })
                                }
                              >
                                <Send className="mr-2 h-4 w-4" />
                                {invoice.status === 'draft' ? 'Send' : 'Resend'}
                              </DropdownMenuItem>
                            )}
                            {invoice.status !== 'paid' && (
                              <DropdownMenuItem
                                onClick={() =>
                                  updateStatus.mutate({
                                    invoiceId: invoice.id,
                                    status: 'paid',
                                  })
                                }
                              >
                                <CheckCheck className="mr-2 h-4 w-4" />
                                Mark as Paid
                              </DropdownMenuItem>
                            )}
                            {invoice.status !== 'cancelled' && (
                              <DropdownMenuItem
                                onClick={() =>
                                  updateStatus.mutate({
                                    invoiceId: invoice.id,
                                    status: 'cancelled',
                                  })
                                }
                              >
                                <Ban className="mr-2 h-4 w-4" />
                                Cancel
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => setDeleteTarget(invoice)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <PlatformInvoiceDialog
        merchantId={merchantId}
        locations={locations}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete bill?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{' '}
              <span className="font-medium">{deleteTarget?.invoice_number}</span>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) deleteBill.mutate(deleteTarget.id)
                setDeleteTarget(null)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
