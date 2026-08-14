"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  FileText,
  DollarSign,
  AlertCircle,
  CheckCircle2,
  Clock,
  MoreHorizontal,
  Eye,
  CheckCheck,
  Ban,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { PageShell, PageHeader, Panel, StatRow, StatTile } from "@/components/dashboard/shell";
import {
  useInvoices,
  useInvoiceKpis,
  useUpdateInvoiceStatus,
  useDeleteInvoice,
} from "./hooks/useInvoices";
import { InvoiceStatusBadge } from "./components/InvoiceStatusBadge";
import { SendInvoiceDialog } from "./components/SendInvoiceDialog";
import { isSendable } from "@/lib/invoices/lifecycle";
import type { Invoice, InvoiceStatus } from "@/app/dashboard/actions/invoices";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const STATUS_TABS: Array<{ label: string; value: InvoiceStatus | "all" }> = [
  { label: "All", value: "all" },
  { label: "Draft", value: "draft" },
  { label: "Sent", value: "sent" },
  { label: "Paid", value: "paid" },
  { label: "Overdue", value: "overdue" },
];

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

export default function InvoicesPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<InvoiceStatus | "all">("all");
  const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null);
  const [sendTarget, setSendTarget] = useState<Invoice | null>(null);

  const { data: invoices = [], isLoading } = useInvoices(
    activeTab === "all" ? null : activeTab
  );
  const updateStatus = useUpdateInvoiceStatus();
  const deleteInvoice = useDeleteInvoice();

  // DB-authoritative, location-scoped KPIs (§4) — derived server-side from
  // amount_paid/paid_at/status; overdue is read-time derived. Refetched via
  // React Query invalidation whenever any invoice mutation runs.
  const { data: kpi } = useInvoiceKpis();
  const outstanding = kpi?.outstanding ?? 0;
  const paidThisMonth = kpi?.paidThisMonth ?? 0;
  const overdueCount = kpi?.overdueCount ?? 0;
  const draftCount = kpi?.draftCount ?? 0;

  return (
    <PageShell>
      <PageHeader
        title="Invoices"
        subtitle="Create and manage customer invoices"
        actions={
          <Button asChild className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm">
            <Link href="/dashboard/invoices/new">
              <Plus className="h-4 w-4 mr-2" />
              New Invoice
            </Link>
          </Button>
        }
      />

      {/* Summary */}
      <Panel>
        <div className="px-6 py-6">
          <StatRow columns={4}>
            <StatTile
              label="Outstanding"
              icon={<DollarSign />}
              value={formatCurrency(outstanding)}
              meta="Unpaid balance"
            />
            <StatTile
              label="Paid This Month"
              icon={<CheckCircle2 />}
              value={formatCurrency(paidThisMonth)}
              meta="Current month"
            />
            <StatTile
              label="Overdue"
              icon={<AlertCircle />}
              value={overdueCount}
              meta="Needs attention"
            />
            <StatTile
              label="Drafts"
              icon={<Clock />}
              value={draftCount}
              meta="Not sent yet"
            />
          </StatRow>
        </div>
      </Panel>

      {/* Table with tabs */}
      <Panel padded>
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as InvoiceStatus | "all")}
        >
          <div className="w-full min-w-0 overflow-x-auto pb-1">
            <TabsList className="inline-flex h-auto w-max flex-nowrap gap-0.5 rounded-full bg-muted/70 p-1">
              {STATUS_TABS.map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border"
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="mt-4">
            {isLoading ? (
              <div className="space-y-3 py-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : invoices.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
                <FileText className="mb-4 h-12 w-12 text-muted-foreground/30" />
                <h3 className="mb-1 text-lg font-semibold">No invoices yet</h3>
                <p className="mb-4 text-sm text-muted-foreground">
                  Create your first invoice to get started.
                </p>
                <Button asChild size="sm" className="rounded-full">
                  <Link href="/dashboard/invoices/new">
                    <Plus className="h-4 w-4 mr-2" />
                    New Invoice
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="-mx-2 overflow-x-auto px-2">
                <Table className="min-w-[600px]">
                  <TableHeader>
                    <TableRow className="border-b border-border/60 hover:bg-transparent">
                      <TableHead className="h-auto py-2.5 text-[0.8125rem] font-normal text-muted-foreground">Invoice #</TableHead>
                      <TableHead className="h-auto py-2.5 text-[0.8125rem] font-normal text-muted-foreground">Customer</TableHead>
                      <TableHead className="h-auto py-2.5 text-[0.8125rem] font-normal text-muted-foreground">Date</TableHead>
                      <TableHead className="h-auto py-2.5 text-[0.8125rem] font-normal text-muted-foreground">Due</TableHead>
                      <TableHead className="h-auto py-2.5 text-right text-[0.8125rem] font-normal text-muted-foreground">Amount</TableHead>
                      <TableHead className="h-auto py-2.5 text-[0.8125rem] font-normal text-muted-foreground">Status</TableHead>
                      <TableHead className="h-auto w-10 py-2.5" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((invoice) => (
                      <TableRow
                        key={invoice.id}
                        className="cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50"
                        onClick={() => router.push(`/dashboard/invoices/${invoice.id}`)}
                      >
                        <TableCell className="py-3 text-sm font-medium">
                          {invoice.invoice_number}
                        </TableCell>
                        <TableCell className="py-3 text-sm">
                          {invoice.customer?.name ||
                            invoice.customer?.email ||
                            invoice.customer?.phone || (
                              <span className="text-muted-foreground italic">
                                No customer
                              </span>
                            )}
                        </TableCell>
                        <TableCell className="py-3 text-sm text-muted-foreground">
                          {formatDate(invoice.created_at)}
                        </TableCell>
                        <TableCell className="py-3 text-sm text-muted-foreground">
                          {invoice.payment_due_type === "upon_receipt"
                            ? "Upon Receipt"
                            : invoice.payment_due_type === "net_15"
                            ? "Net 15"
                            : invoice.payment_due_type === "net_30"
                            ? "Net 30"
                            : invoice.payment_due_type === "net_60"
                            ? "Net 60"
                            : invoice.due_date
                            ? formatDate(invoice.due_date)
                            : "—"}
                        </TableCell>
                        <TableCell className="py-3 text-right text-sm font-medium tabular-nums">
                          {formatCurrency(invoice.total_amount)}
                        </TableCell>
                        <TableCell className="py-3 text-sm">
                          <InvoiceStatusBadge status={invoice.status} />
                        </TableCell>
                        <TableCell className="py-3 text-sm" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() =>
                                  router.push(`/dashboard/invoices/${invoice.id}`)
                                }
                              >
                                <Eye className="mr-2 h-4 w-4" />
                                View
                              </DropdownMenuItem>
                              {isSendable(invoice.status) && (
                                <DropdownMenuItem
                                  onClick={() => setSendTarget(invoice)}
                                >
                                  <Send className="mr-2 h-4 w-4" />
                                  {invoice.status === "draft" ? "Send" : "Resend"}
                                </DropdownMenuItem>
                              )}
                              {invoice.status !== "paid" && (
                                <DropdownMenuItem
                                  onClick={() =>
                                    updateStatus.mutate({
                                      invoiceId: invoice.id,
                                      status: "paid",
                                    })
                                  }
                                >
                                  <CheckCheck className="mr-2 h-4 w-4" />
                                  Mark as Paid
                                </DropdownMenuItem>
                              )}
                              {invoice.status !== "cancelled" && (
                                <DropdownMenuItem
                                  onClick={() =>
                                    updateStatus.mutate({
                                      invoiceId: invoice.id,
                                      status: "cancelled",
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
          </div>
        </Tabs>
      </Panel>

      {/* Send dialog */}
      {sendTarget && (
        <SendInvoiceDialog
          open={!!sendTarget}
          onOpenChange={(v) => !v && setSendTarget(null)}
          invoice={sendTarget}
        />
      )}

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Invoice?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{" "}
              <strong>{deleteTarget?.invoice_number}</strong>? This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) {
                  deleteInvoice.mutate(deleteTarget.id);
                  setDeleteTarget(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
