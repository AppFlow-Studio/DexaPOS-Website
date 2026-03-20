"use client";

import { use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Edit, CheckCheck, Ban, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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
import { useInvoice, useUpdateInvoiceStatus, useDeleteInvoice } from "../hooks/useInvoices";
import { InvoiceStatusBadge } from "../components/InvoiceStatusBadge";
import { InvoiceForm } from "../components/InvoiceForm";

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
      <div className="space-y-6 max-w-3xl">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">Invoice not found.</p>
        <Button asChild variant="link" className="mt-2">
          <Link href="/dashboard/invoices">Back to Invoices</Link>
        </Button>
      </div>
    );
  }

  if (editMode) {
    return (
      <div className="space-y-6">
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 text-muted-foreground"
            onClick={() => setEditMode(false)}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Cancel edit
          </Button>
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Edit Invoice {invoice.invoice_number}
          </h2>
        </div>
        <InvoiceForm existing={invoice} />
      </div>
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
    <div className="space-y-6 max-w-3xl">
      {/* Back nav */}
      <div>
        <Button
          variant="ghost"
          size="sm"
          asChild
          className="-ml-2 text-muted-foreground"
        >
          <Link href="/dashboard/invoices">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Invoices
          </Link>
        </Button>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-2xl font-bold tracking-tight">
              {invoice.invoice_number}
            </h2>
            <InvoiceStatusBadge status={invoice.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            Created {formatDate(invoice.created_at)}
          </p>
        </div>
        <div className="flex gap-2">
          {invoice.status === "draft" && (
            <Button
              size="sm"
              onClick={() =>
                updateStatus.mutate({ invoiceId: invoice.id, status: "sent" })
              }
              disabled={updateStatus.isPending}
            >
              Send Invoice
            </Button>
          )}
          {invoice.status !== "paid" && invoice.status !== "cancelled" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                updateStatus.mutate({ invoiceId: invoice.id, status: "paid" })
              }
              disabled={updateStatus.isPending}
            >
              <CheckCheck className="h-4 w-4 mr-1" />
              Mark Paid
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setEditMode(true)}
          >
            <Edit className="h-4 w-4 mr-1" />
            Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => setShowDelete(true)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Invoice Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Invoice Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground mb-0.5">Customer</p>
              {invoice.customer ? (
                <div>
                  <p className="font-medium">
                    {invoice.customer.name || "—"}
                  </p>
                  {invoice.customer.email && (
                    <p className="text-muted-foreground text-xs">
                      {invoice.customer.email}
                    </p>
                  )}
                  {invoice.customer.phone && (
                    <p className="text-muted-foreground text-xs">
                      {invoice.customer.phone}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground italic">No customer</p>
              )}
            </div>
            <div>
              <p className="text-muted-foreground mb-0.5">Payment Due</p>
              <p className="font-medium">{paymentDueLabel}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Line Items */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Items</CardTitle>
        </CardHeader>
        <CardContent>
          {invoice.items && invoice.items.length > 0 ? (
            <>
              <div className="grid grid-cols-[1fr_60px_90px_90px] gap-2 text-xs text-muted-foreground pb-1 border-b mb-1">
                <span>Item</span>
                <span className="text-center">Qty</span>
                <span className="text-right">Price</span>
                <span className="text-right">Total</span>
              </div>
              {invoice.items.map((item) => (
                <div
                  key={item.id}
                  className="grid grid-cols-[1fr_60px_90px_90px] gap-2 items-start py-2 border-b last:border-b-0 text-sm"
                >
                  <div>
                    <p className="font-medium">{item.name}</p>
                    {item.description && (
                      <p className="text-xs text-muted-foreground">
                        {item.description}
                      </p>
                    )}
                  </div>
                  <span className="text-center tabular-nums">{item.quantity}</span>
                  <span className="text-right tabular-nums">
                    {formatCurrency(item.unit_price)}
                  </span>
                  <span className="text-right tabular-nums font-medium">
                    {formatCurrency(item.total_price)}
                  </span>
                </div>
              ))}
            </>
          ) : (
            <p className="text-sm text-muted-foreground italic">No items</p>
          )}

          <Separator className="mt-4 mb-3" />

          {/* Totals */}
          <div className="space-y-1.5 text-sm max-w-xs ml-auto">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular-nums">{formatCurrency(invoice.subtotal)}</span>
            </div>
            {invoice.discount_amount > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Discount</span>
                <span className="tabular-nums text-green-600">
                  -{formatCurrency(invoice.discount_amount)}
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
            <Separator />
            <div className="flex justify-between font-semibold text-base">
              <span>Total</span>
              <span className="tabular-nums">{formatCurrency(invoice.total_amount)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Note */}
      {invoice.note && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Note</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{invoice.note}</p>
          </CardContent>
        </Card>
      )}

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
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
