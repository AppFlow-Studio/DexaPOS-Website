'use client'

import { useMemo, useState } from 'react'
import {
  AlertCircle,
  Ban,
  CheckCheck,
  CheckCircle2,
  Clock,
  DollarSign,
  FileText,
  MoreHorizontal,
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { InvoiceStatusBadge } from '@/app/dashboard/invoices/components/InvoiceStatusBadge'
import type { Invoice, InvoiceStatus } from '@/app/dashboard/actions/invoices'
import type { LocationSummary } from '@/types/merchant'
import {
  useAdminDeleteInvoice,
  useAdminInvoices,
  useAdminUpdateInvoiceStatus,
} from '@/lib/queries/use-admin-financial'

const STATUS_TABS: Array<{ label: string; value: InvoiceStatus | 'all' }> = [
  { label: 'All', value: 'all' },
  { label: 'Draft', value: 'draft' },
  { label: 'Sent', value: 'sent' },
  { label: 'Paid', value: 'paid' },
  { label: 'Overdue', value: 'overdue' },
]

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

function getDueLabel(invoice: Invoice) {
  if (invoice.payment_due_type === 'upon_receipt') return 'Upon Receipt'
  if (invoice.payment_due_type === 'net_15') return 'Net 15'
  if (invoice.payment_due_type === 'net_30') return 'Net 30'
  if (invoice.payment_due_type === 'net_60') return 'Net 60'
  if (invoice.due_date) return formatDate(invoice.due_date)
  return '—'
}

interface InvoicesTabProps {
  merchantId: string
  locations: LocationSummary[]
}

export function InvoicesTab({ merchantId, locations }: InvoicesTabProps) {
  const [activeTab, setActiveTab] = useState<InvoiceStatus | 'all'>('all')
  const [selectedLocationId, setSelectedLocationId] = useState<string>('all')
  const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null)

  const effectiveLocationId = selectedLocationId === 'all' ? null : selectedLocationId

  const { data: invoices = [], isLoading } = useAdminInvoices(
    merchantId,
    effectiveLocationId,
    activeTab === 'all' ? null : activeTab
  )
  const { data: allInvoices = [] } = useAdminInvoices(
    merchantId,
    effectiveLocationId,
    null
  )

  const updateStatus = useAdminUpdateInvoiceStatus(merchantId)
  const deleteInvoice = useAdminDeleteInvoice(merchantId)

  const summary = useMemo(() => {
    const now = new Date()
    return {
      outstanding: allInvoices
        .filter((invoice) => invoice.status === 'sent' || invoice.status === 'viewed')
        .reduce((sum, invoice) => sum + invoice.total_amount, 0),
      paidThisMonth: allInvoices
        .filter(
          (invoice) =>
            invoice.status === 'paid' &&
            new Date(invoice.updated_at).getMonth() === now.getMonth() &&
            new Date(invoice.updated_at).getFullYear() === now.getFullYear()
        )
        .reduce((sum, invoice) => sum + invoice.total_amount, 0),
      overdueCount: allInvoices.filter((invoice) => invoice.status === 'overdue').length,
      draftCount: allInvoices.filter((invoice) => invoice.status === 'draft').length,
    }
  }, [allInvoices])

  const selectedLocation =
    selectedLocationId === 'all'
      ? null
      : locations.find((location) => location.id === selectedLocationId) || null

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Invoices</h2>
          <p className="text-sm text-muted-foreground">
            Review invoice status and balances for {selectedLocation ? selectedLocation.name : 'all locations'}.
          </p>
        </div>

        <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
          <SelectTrigger className="w-full lg:w-56">
            <SelectValue placeholder="Select location" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All locations</SelectItem>
            {locations.map((location) => (
              <SelectItem key={location.id} value={location.id}>
                {location.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Outstanding</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(summary.outstanding)}</div>
            <p className="text-xs text-muted-foreground">Sent + viewed</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Paid This Month</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(summary.paidThisMonth)}
            </div>
            <p className="text-xs text-muted-foreground">Current month</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overdue</CardTitle>
            <AlertCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{summary.overdueCount}</div>
            <p className="text-xs text-muted-foreground">Needs attention</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Drafts</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.draftCount}</div>
            <p className="text-xs text-muted-foreground">Not sent yet</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as InvoiceStatus | 'all')}
          >
            <TabsList>
              {STATUS_TABS.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value}>
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-3 p-6">
              {[...Array(5)].map((_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          ) : invoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
              <FileText className="mb-4 h-12 w-12 text-muted-foreground/30" />
              <h3 className="mb-1 text-lg font-semibold">No invoices found</h3>
              <p className="text-sm text-muted-foreground">
                Try another status or location filter.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Customer</TableHead>
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
                    <TableCell className="font-medium">{invoice.invoice_number}</TableCell>
                    <TableCell>
                      {invoice.customer?.name ||
                        invoice.customer?.email ||
                        invoice.customer?.phone || (
                          <span className="italic text-muted-foreground">No customer</span>
                        )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(invoice.created_at)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {getDueLabel(invoice)}
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
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete invoice?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete invoice{' '}
              <span className="font-medium">{deleteTarget?.invoice_number}</span>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) {
                  deleteInvoice.mutate(deleteTarget.id)
                }
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
