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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/dashboard/shell/Panel'
import { PanelSection } from '@/components/dashboard/shell/PanelSection'
import { PaginationBar } from '@/components/dashboard/PaginationBar'
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useClientPagination } from '@/lib/hooks/useClientPagination'
import { getInvoiceStatusLabel } from '@/lib/constants/invoice-status'
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

  const { pageRows, pagination, setPage } = useClientPagination(invoices, 10)

  // One menu for both the table row and the phone card, so the two cannot drift.
  const renderActions = (invoice: Invoice) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-8 w-8 rounded-full p-0"
          aria-label={`Actions for invoice ${invoice.invoice_number}`}
        >
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
        <DropdownMenuItem
          className="text-destructive"
          onClick={() => setDeleteTarget(invoice)}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  return (
    <div className="space-y-6">
      <Panel>
        <PanelSection
          label="Platform Billing"
          caption="Bills issued by Dexa POS to this merchant (hardware, setup, services)."
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New Bill
            </Button>
          }
        >
          {isLoading ? (
            <>
              <div className="hidden space-y-2 rounded-2xl bg-muted/20 p-3 lg:block">
                {[...Array(4)].map((_, index) => (
                  <Skeleton key={index} className="h-10 w-full rounded-2xl" />
                ))}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
                {[...Array(2)].map((_, index) => (
                  <div key={index} className="rounded-2xl border-0 bg-muted/45 p-4">
                    <Skeleton className="h-4 w-28" />
                    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
                      <Skeleton className="h-8 w-full" />
                      <Skeleton className="h-8 w-full" />
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : invoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl bg-muted/30 px-4 py-16 text-center">
              <FileText className="mb-4 h-12 w-12 text-muted-foreground/30" />
              <h3 className="mb-1 text-lg font-semibold">No platform bills yet</h3>
              <p className="text-sm text-muted-foreground">
                Create a bill to charge this merchant for hardware or services.
              </p>
            </div>
          ) : (
            <>
              {/* 600px table fits the 720px content column from `lg` (§5.3). */}
              <Table variant="data" containerClassName="hidden lg:block" className="min-w-[600px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Bill #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-10">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-medium tabular-nums">
                        {invoice.invoice_number}
                      </TableCell>
                      <TableCell className="text-muted-foreground tabular-nums">
                        {formatDate(invoice.created_at)}
                      </TableCell>
                      <TableCell className="text-muted-foreground tabular-nums">
                        {dueLabel(invoice)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatCurrency(invoice.total_amount)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className="w-fit rounded-full border-0 px-2.5 text-xs font-medium"
                        >
                          {getInvoiceStatusLabel(invoice.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>{renderActions(invoice)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
                {pageRows.map((invoice) => (
                  <div key={invoice.id} className="min-w-0 rounded-2xl border-0 bg-muted/45 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium tabular-nums">
                          {invoice.invoice_number}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {getInvoiceStatusLabel(invoice.status)}
                        </p>
                      </div>
                      {renderActions(invoice)}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">Date</p>
                        <p className="truncate font-medium tabular-nums">
                          {formatDate(invoice.created_at)}
                        </p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">Due</p>
                        <p className="truncate font-medium tabular-nums">{dueLabel(invoice)}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">Amount</p>
                        <p className="truncate font-medium tabular-nums">
                          {formatCurrency(invoice.total_amount)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <PaginationBar pagination={pagination} onPageChange={setPage} itemLabel="bills" />
            </>
          )}
        </PanelSection>
      </Panel>

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
