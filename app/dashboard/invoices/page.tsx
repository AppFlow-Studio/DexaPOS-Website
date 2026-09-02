"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
import { PaginationBar } from "@/components/dashboard/PaginationBar";
import { buildPaginationMeta } from "@/lib/pagination";

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

const PAYMENT_DUE_LABELS: Record<string, string> = {
  upon_receipt: "Upon Receipt",
  net_15: "Net 15",
  net_30: "Net 30",
  net_60: "Net 60",
};

function formatDueLabel(invoice: Invoice) {
  return (
    PAYMENT_DUE_LABELS[invoice.payment_due_type] ??
    (invoice.due_date ? formatDate(invoice.due_date) : "—")
  );
}

/**
 * The per-row action menu. Defined at module scope so the table and the mobile
 * card grid share one definition — a component created inside the page body
 * would be re-created on every render.
 */
function InvoiceRowMenu({
  invoice,
  router,
  updateStatus,
  onSend,
  onDelete,
}: {
  invoice: Invoice;
  router: ReturnType<typeof useRouter>;
  updateStatus: ReturnType<typeof useUpdateInvoiceStatus>;
  onSend: (invoice: Invoice) => void;
  onDelete: (invoice: Invoice) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full"
          aria-label={`Actions for ${invoice.invoice_number}`}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="rounded-2xl">
        <DropdownMenuItem
          onClick={() => router.push(`/dashboard/invoices/${invoice.id}`)}
        >
          <Eye className="mr-2 h-4 w-4" />
          View
        </DropdownMenuItem>
        {isSendable(invoice.status) && (
          <DropdownMenuItem onClick={() => onSend(invoice)}>
            <Send className="mr-2 h-4 w-4" />
            {invoice.status === "draft" ? "Send" : "Resend"}
          </DropdownMenuItem>
        )}
        {/* Disabled while a status change is in flight: a dropdown item stays
            clickable otherwise, so a double click fires the mutation twice. */}
        {invoice.status !== "paid" && (
          <DropdownMenuItem
            disabled={updateStatus.isPending}
            onClick={() =>
              updateStatus.mutate({ invoiceId: invoice.id, status: "paid" })
            }
          >
            <CheckCheck className="mr-2 h-4 w-4" />
            Mark as Paid
          </DropdownMenuItem>
        )}
        {invoice.status !== "cancelled" && (
          <DropdownMenuItem
            disabled={updateStatus.isPending}
            onClick={() =>
              updateStatus.mutate({ invoiceId: invoice.id, status: "cancelled" })
            }
          >
            <Ban className="mr-2 h-4 w-4" />
            Cancel
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive"
          onClick={() => onDelete(invoice)}
        >
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function InvoicesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<InvoiceStatus | "all">("all");

  // Keep the active status pill visible in the rail on narrow screens (§13.2).
  // `block: "nearest"` stops the browser scrolling the page vertically too.
  const tabRailRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    tabRailRef.current
      ?.querySelector('[data-state="active"]')
      ?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [activeTab]);

  const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null);
  const [sendTarget, setSendTarget] = useState<Invoice | null>(null);

  const requestedPage = Number(searchParams.get("page"));
  const page = Number.isFinite(requestedPage)
    ? Math.max(1, Math.floor(requestedPage))
    : 1;
  const pageSize = 25;

  const {
    data: invoiceResult,
    isLoading: isInvoicesLoading,
    isFetching,
    isPlaceholderData,
  } = useInvoices(
    activeTab === "all" ? null : activeTab,
    { page, pageSize },
  );

  // The query uses keepPreviousData, so switching status tab leaves the
  // PREVIOUS filter's invoices on screen under the new tab. Those rows are
  // not what the tab claims to show, so they are replaced by the skeleton.
  // A plain refetch of the same key is not placeholder data, so manual
  // refresh still keeps its rows visible.
  const isLoading = isInvoicesLoading || isPlaceholderData;
  const invoices = invoiceResult?.data ?? [];
  const pagination =
    invoiceResult?.pagination ?? buildPaginationMeta(0, { page, pageSize });

  const setPage = useCallback(
    (nextPage: number) => {
      const params = new URLSearchParams(searchParams.toString());
      if (nextPage <= 1) params.delete("page");
      else params.set("page", String(nextPage));

      const query = params.toString();
      router.replace(
        query ? `/dashboard/invoices?${query}` : "/dashboard/invoices",
        { scroll: false },
      );
    },
    [router, searchParams],
  );

  useEffect(() => {
    if (invoiceResult && page > invoiceResult.pagination.totalPages) {
      setPage(invoiceResult.pagination.totalPages);
    }
  }, [invoiceResult, page, setPage]);

  const updateStatus = useUpdateInvoiceStatus();
  const deleteInvoice = useDeleteInvoice();

  // DB-authoritative, location-scoped KPIs (§4) — derived server-side from
  // amount_paid/paid_at/status; overdue is read-time derived. Refetched via
  // React Query invalidation whenever any invoice mutation runs.
  // The `?? 0` fallbacks below are the right resting value but the wrong
  // pending one: while the query is in flight they render "$0.00 / 0", which
  // reads as a settled, empty ledger rather than an unfinished request. The
  // tiles take `isLoading` so the figure skeletonises and the label stays.
  const { data: kpi, isLoading: isKpiLoading } = useInvoiceKpis();
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
              isLoading={isKpiLoading}
            />
            <StatTile
              label="Paid This Month"
              icon={<CheckCircle2 />}
              value={formatCurrency(paidThisMonth)}
              meta="Current month"
              isLoading={isKpiLoading}
            />
            <StatTile
              label="Overdue"
              icon={<AlertCircle />}
              value={overdueCount}
              meta="Needs attention"
              isLoading={isKpiLoading}
            />
            <StatTile
              label="Drafts"
              icon={<Clock />}
              value={draftCount}
              meta="Not sent yet"
              isLoading={isKpiLoading}
            />
          </StatRow>
        </div>
      </Panel>

      {/* Tabs + table. Not wrapped in a Panel: the data table draws its own
          tinted well, and nesting it in a panel gave two stacked boxes (§5). */}
      <div className="min-w-0 space-y-4">
        <Tabs
          value={activeTab}
          onValueChange={(v) => {
            setActiveTab(v as InvoiceStatus | "all");
            setPage(1);
          }}
        >
          <div
            ref={tabRailRef}
            className="thin-scrollbar w-full min-w-0 overflow-x-auto pb-1"
          >
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
              <div className="rounded-2xl bg-muted/20 p-3">
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full rounded-2xl" />
                  ))}
                </div>
              </div>
            ) : invoices.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl bg-muted/20 px-4 py-16 text-center">
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
              <>
                {/* Wide-screen table */}
                <Table
                  variant="data"
                  containerClassName="hidden xl:block"
                  className="min-w-[760px]"
                >
                  <TableHeader className="[&_tr]:border-0">
                    <TableRow>
                      <TableHead className="text-[0.8125rem] font-normal text-muted-foreground">Invoice #</TableHead>
                      <TableHead className="text-[0.8125rem] font-normal text-muted-foreground">Customer</TableHead>
                      <TableHead className="text-[0.8125rem] font-normal text-muted-foreground">Date</TableHead>
                      <TableHead className="text-[0.8125rem] font-normal text-muted-foreground">Due</TableHead>
                      <TableHead className="text-right text-[0.8125rem] font-normal text-muted-foreground">Amount</TableHead>
                      <TableHead className="text-[0.8125rem] font-normal text-muted-foreground">Status</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((invoice) => (
                      <TableRow
                        key={invoice.id}
                        className="cursor-pointer border-0 bg-card/70 hover:bg-muted/40"
                        onClick={() => router.push(`/dashboard/invoices/${invoice.id}`)}
                      >
                        <TableCell className="text-sm font-medium">
                          {invoice.invoice_number}
                        </TableCell>
                        <TableCell className="text-sm">
                          {invoice.customer?.name ||
                            invoice.customer?.email ||
                            invoice.customer?.phone || (
                              <span className="italic text-muted-foreground">
                                No customer
                              </span>
                            )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(invoice.created_at)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDueLabel(invoice)}
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium tabular-nums">
                          {formatCurrency(invoice.total_amount)}
                        </TableCell>
                        <TableCell className="text-sm">
                          <InvoiceStatusBadge status={invoice.status} />
                        </TableCell>
                        <TableCell className="text-sm" onClick={(e) => e.stopPropagation()}>
                          <InvoiceRowMenu
                            invoice={invoice}
                            router={router}
                            updateStatus={updateStatus}
                            onSend={setSendTarget}
                            onDelete={setDeleteTarget}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Phones and tablets use cards instead of a horizontally
                    scrolling table (§5.3). */}
                <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:hidden">
                  {invoices.map((invoice) => (
                    <div
                      key={invoice.id}
                      className="min-w-0 rounded-2xl bg-muted/45 p-4 transition-colors hover:bg-muted"
                    >
                      <div className="flex min-w-0 items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => router.push(`/dashboard/invoices/${invoice.id}`)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <span className="block truncate text-sm font-semibold">
                            {invoice.invoice_number}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                            {invoice.customer?.name ||
                              invoice.customer?.email ||
                              invoice.customer?.phone ||
                              "No customer"}
                          </span>
                        </button>
                        <div className="flex shrink-0 items-center gap-1">
                          <InvoiceStatusBadge status={invoice.status} />
                          <InvoiceRowMenu
                            invoice={invoice}
                            router={router}
                            updateStatus={updateStatus}
                            onSend={setSendTarget}
                            onDelete={setDeleteTarget}
                          />
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => router.push(`/dashboard/invoices/${invoice.id}`)}
                        className="mt-4 grid w-full min-w-0 grid-cols-2 gap-x-4 gap-y-3 text-left text-sm"
                      >
                        <div className="min-w-0">
                          <p className="text-xs text-muted-foreground">Amount</p>
                          <p className="mt-0.5 font-semibold tabular-nums">
                            {formatCurrency(invoice.total_amount)}
                          </p>
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs text-muted-foreground">Due</p>
                          <p className="mt-0.5 truncate">{formatDueLabel(invoice)}</p>
                        </div>
                        <div className="col-span-2 min-w-0">
                          <p className="text-xs text-muted-foreground">Created</p>
                          <p className="mt-0.5">{formatDate(invoice.created_at)}</p>
                        </div>
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
          <PaginationBar
            pagination={pagination}
            onPageChange={setPage}
            isLoading={isFetching}
            itemLabel="invoices"
          />
        </Tabs>
      </div>

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
            <AlertDialogCancel className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="h-9 rounded-full bg-destructive px-4 text-[0.8125rem] font-medium text-destructive-foreground shadow-sm hover:bg-destructive/90"
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
