"use client";

import { use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Edit, CheckCheck, Trash2, Send, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  PageShell,
  PageHeader,
  Panel,
  PanelSection,
} from "@/components/dashboard/shell";
import { Skeleton } from "@/components/ui/skeleton";
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
import { useState } from "react";
import { formatPhoneForDisplay } from "@/lib/phone";
import { useInvoice, useUpdateInvoiceStatus, useDeleteInvoice } from "../hooks/useInvoices";
import { InvoiceStatusBadge } from "../components/InvoiceStatusBadge";
import { InvoiceForm } from "../components/InvoiceForm";
import { SendInvoiceDialog } from "../components/SendInvoiceDialog";
import { isSendable } from "@/lib/invoices/lifecycle";

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "long",
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

export default function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [editMode, setEditMode] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showSend, setShowSend] = useState(false);

  const { data: invoice, isLoading } = useInvoice(id);
  const updateStatus = useUpdateInvoiceStatus();
  const deleteInvoice = useDeleteInvoice();

  const handleDelete = () => {
    deleteInvoice.mutate(id, {
      onSuccess: (res) => {
        if (res.success) router.push("/dashboard/invoices");
      },
    });
  };

  if (isLoading) {
    return (
      <PageShell width="narrow">
        <Skeleton className="h-8 w-32 rounded-full" />
        <Skeleton className="h-64 w-full rounded-3xl" />
      </PageShell>
    );
  }

  if (!invoice) {
    return (
      <PageShell width="narrow">
        <div className="rounded-2xl bg-muted/20 py-16 text-center">
          <p className="text-muted-foreground">Invoice not found.</p>
          <Button asChild variant="ghost" className="mt-2 rounded-full">
            <Link href="/dashboard/invoices">Back to Invoices</Link>
          </Button>
        </div>
      </PageShell>
    );
  }

  if (editMode) {
    return (
      <PageShell width="narrow">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 h-8 w-fit gap-1.5 rounded-full text-muted-foreground"
          onClick={() => setEditMode(false)}
        >
          <ArrowLeft className="h-4 w-4" />
          Cancel edit
        </Button>
        <PageHeader title={`Edit Invoice ${invoice.invoice_number}`} />
        <InvoiceForm existing={invoice} />
      </PageShell>
    );
  }

  const paymentDueLabel = {
    upon_receipt: "Upon Receipt",
    net_15: "Net 15",
    net_30: "Net 30",
    net_60: "Net 60",
    custom: invoice.due_date ? formatDate(invoice.due_date) : "Custom",
  }[invoice.payment_due_type];

  return (
    <PageShell width="narrow">
      <PageHeader
        backHref="/dashboard/invoices"
        backLabel="Invoices"
        title={invoice.invoice_number}
        subtitle={`Created ${formatDate(invoice.created_at)}`}
        indicator={<InvoiceStatusBadge status={invoice.status} />}
        actions={
          <div className="flex min-w-0 flex-wrap gap-2">
            {isSendable(invoice.status) && (
              <Button
                size="sm"
                className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
                onClick={() => setShowSend(true)}
              >
                <Send className="mr-1 h-4 w-4" />
                {invoice.status === "draft" ? "Send Invoice" : "Resend"}
              </Button>
            )}
            {invoice.status !== "paid" && invoice.status !== "cancelled" && (
              <Button
                size="sm"
                variant="outline"
                className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
                onClick={() =>
                  updateStatus.mutate({ invoiceId: invoice.id, status: "paid" })
                }
                disabled={updateStatus.isPending}
              >
                <CheckCheck className="mr-1 h-4 w-4" />
                Mark Paid
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
              asChild
            >
              <a
                href={`/api/invoices/${invoice.id}/pdf`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Download className="mr-1 h-4 w-4" />
                Download PDF
              </a>
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
              onClick={() => setEditMode(true)}
            >
              <Edit className="mr-1 h-4 w-4" />
              Edit
            </Button>
            {/* Destructive action keeps its colour (§4.6b exempts these). */}
            <Button
              size="sm"
              variant="ghost"
              className="h-9 rounded-full px-3 text-destructive hover:text-destructive"
              onClick={() => setShowDelete(true)}
              aria-label="Delete invoice"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        }
        stackActionsBelowIndicatorOnMobile
      />

      {/* Invoice Details */}
      <Panel>
        <PanelSection label="Invoice Details">
          <div className="grid min-w-0 grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <div className="min-w-0">
              <p className="mb-0.5 text-muted-foreground">Customer</p>
              {invoice.customer ? (
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {invoice.customer.name || "—"}
                  </p>
                  {invoice.customer.email && (
                    <p className="truncate text-xs text-muted-foreground">
                      {invoice.customer.email}
                    </p>
                  )}
                  {invoice.customer.phone && (
                    <p className="truncate text-xs text-muted-foreground">
                      {formatPhoneForDisplay(invoice.customer.phone)}
                    </p>
                  )}
                </div>
              ) : (
                <p className="italic text-muted-foreground">No customer</p>
              )}
            </div>
            <div className="min-w-0">
              <p className="mb-0.5 text-muted-foreground">Payment Due</p>
              <p className="font-medium">{paymentDueLabel}</p>
            </div>
          </div>
        </PanelSection>
      </Panel>

      {/* Line Items */}
      <Panel>
        <PanelSection label="Items">
          {invoice.items && invoice.items.length > 0 ? (
            <>
              {/* Column labels — no rule beneath (§5.5). Hidden on phones,
                  where each row becomes a stacked card instead. */}
              <div className="mb-1 hidden grid-cols-[1fr_60px_90px_90px] gap-2 pb-1 text-xs text-muted-foreground sm:grid">
                <span>Item</span>
                <span className="text-center">Qty</span>
                <span className="text-right">Price</span>
                <span className="text-right">Total</span>
              </div>
              <div className="space-y-1">
                {invoice.items.map((item) => (
                  <div
                    key={item.id}
                    className="-mx-2 min-w-0 rounded-2xl px-2 py-2 text-sm transition-colors hover:bg-muted/40 sm:grid sm:grid-cols-[1fr_60px_90px_90px] sm:items-start sm:gap-2"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{item.name}</p>
                      {item.description && (
                        <p className="text-xs text-muted-foreground">
                          {item.description}
                        </p>
                      )}
                    </div>
                    {/* Below `sm` the three figures sit on one labelled line
                        rather than in columns too narrow to hold them. */}
                    <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground sm:hidden">
                      <span className="tabular-nums">
                        {item.quantity} × {formatCurrency(item.unit_price)}
                      </span>
                      <span className="ml-auto text-sm font-medium tabular-nums text-foreground">
                        {formatCurrency(item.total_price)}
                      </span>
                    </div>
                    <span className="hidden text-center tabular-nums sm:block">
                      {item.quantity}
                    </span>
                    <span className="hidden text-right tabular-nums sm:block">
                      {formatCurrency(item.unit_price)}
                    </span>
                    <span className="hidden text-right font-medium tabular-nums sm:block">
                      {formatCurrency(item.total_price)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm italic text-muted-foreground">No items</p>
          )}

          {/* Totals — an inset well rather than a pair of rules (§5.5). */}
          <div className="ml-auto mt-4 w-full max-w-xs space-y-1.5 rounded-2xl bg-muted/60 px-4 py-3 text-sm sm:max-w-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular-nums">{formatCurrency(invoice.subtotal)}</span>
            </div>
            {invoice.discount_amount > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Discount</span>
                {/* No green (D-12) — the minus carries it. */}
                <span className="tabular-nums">
                  −{formatCurrency(invoice.discount_amount)}
                </span>
              </div>
            )}
            {invoice.tax_rate > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Tax ({invoice.tax_rate}%)
                </span>
                <span className="tabular-nums">{formatCurrency(invoice.tax_amount)}</span>
              </div>
            )}
            <div className="flex justify-between pt-1.5 text-base font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{formatCurrency(invoice.total_amount)}</span>
            </div>
          </div>
        </PanelSection>
      </Panel>

      {/* Note */}
      {invoice.note && (
        <Panel>
          <PanelSection label="Note">
            <p className="whitespace-pre-wrap text-sm">{invoice.note}</p>
          </PanelSection>
        </Panel>
      )}

      {/* Send Dialog */}
      <SendInvoiceDialog
        open={showSend}
        onOpenChange={setShowSend}
        invoice={invoice}
      />

      {/* Delete Dialog */}
      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Invoice?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{" "}
              <strong>{invoice.invoice_number}</strong>? This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="h-9 rounded-full bg-destructive px-4 text-[0.8125rem] font-medium text-destructive-foreground shadow-sm hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
