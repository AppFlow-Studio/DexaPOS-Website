"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { AlertTriangle, Ban, CreditCard, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { voidOrder, type VoidOrderRequest } from "@/app/actions/orders/void-order";
import type { OrderResponse, OrderPayment } from "@/types/order-management";

// ─── Constants ───

const VOID_REASON_OPTIONS = [
  { value: "duplicate_order", label: "Duplicate order" },
  { value: "test_training", label: "Test / training order" },
  { value: "customer_changed_mind", label: "Customer changed mind" },
  { value: "system_error", label: "System error" },
  { value: "other", label: "Other" },
] as const;

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function formatPaymentDisplay(payment: OrderPayment): string {
  if (payment.payment_method === "cash") {
    return `Cash — ${formatCurrency(Number(payment.amount) || 0)}`;
  }
  const cardType = (payment as { card_type?: string }).card_type ?? "Card";
  const lastFour = (payment as { card_last_four?: string }).card_last_four ?? "****";
  return `${cardType} ****${lastFour} — ${formatCurrency(Number(payment.amount) || 0)}`;
}

// ─── Props ───

export interface VoidModalProps {
  order: OrderResponse;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

// ─── Component ───

export function VoidModal({
  order,
  open,
  onOpenChange,
  onSuccess,
}: VoidModalProps) {
  const [reason, setReason] = React.useState<string>("");
  const [reasonDetail, setReasonDetail] = React.useState("");
  const [managerPin, setManagerPin] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const payments = order.order_payments || [];

  // Payments that would be reversed: captured, paid, or authorized (not yet voided/refunded)
  const paymentsToVoid = React.useMemo(() => {
    return payments.filter((p) =>
      ["captured", "paid", "authorized"].includes(p.status)
    );
  }, [payments]);

  const totalToVoid = React.useMemo(() => {
    return paymentsToVoid.reduce(
      (sum, p) => sum + (Number(p.amount) || 0),
      0
    );
  }, [paymentsToVoid]);

  const isValid =
    reason &&
    managerPin.trim().length >= 4 &&
    (reason !== "other" || reasonDetail.trim().length > 0);

  const handleClose = React.useCallback(() => {
    setReason("");
    setReasonDetail("");
    setManagerPin("");
    onOpenChange(false);
  }, [onOpenChange]);

  const handleSubmit = async () => {
    if (!isValid || paymentsToVoid.length === 0) return;
    setIsSubmitting(true);
    try {
      const payload: VoidOrderRequest = {
        orderId: order.id,
        reason,
        reasonDetail: reasonDetail.trim() || undefined,
        approvedBy: managerPin,
        paymentIds: paymentsToVoid.map((p) => p.id),
      };
      const result = await voidOrder(payload);
      if (result.stub) {
        toast.info(result.message, {
          description:
            "This action will be enabled once payment provider integration is complete.",
        });
        onSuccess?.();
        handleClose();
      } else if (result.success) {
        toast.success("Order voided");
        onSuccess?.();
        handleClose();
      } else {
        toast.error(result.message);
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (paymentsToVoid.length === 0) {
    return null;
  }

  const displayNumber = order.display_number ?? order.order_number;

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : handleClose())}>
      <DialogContent
        className="max-w-md max-h-[90vh] overflow-y-auto"
        elevation="high"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ban className="h-5 w-5 text-destructive" />
            Void Order #{displayNumber}
          </DialogTitle>
          <DialogDescription asChild>
            <p className="text-sm text-muted-foreground">
              This action cannot be undone.
            </p>
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30 p-3 flex gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800 dark:text-amber-200">
            This will void the entire order and reverse all payments. This action
            cannot be undone.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Reason *</Label>
          <RadioGroup
            value={reason}
            onValueChange={setReason}
            className="gap-2 space-y-1"
          >
            {VOID_REASON_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className="flex items-center gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/50"
              >
                <RadioGroupItem value={opt.value} />
                <span className="text-sm">
                  {opt.value === "other" ? (
                    <span className="flex items-center gap-2 flex-wrap">
                      {opt.label}
                      {reason === "other" && (
                        <Input
                          placeholder="Specify reason"
                          value={reasonDetail}
                          onChange={(e) => setReasonDetail(e.target.value)}
                          className="h-8 w-48 inline-flex"
                        />
                      )}
                    </span>
                  ) : (
                    opt.label
                  )}
                </span>
              </label>
            ))}
          </RadioGroup>
        </div>

        <div className="space-y-2">
          <Label>Payments to void:</Label>
          <ul className="rounded-lg border divide-y bg-muted/30">
            {paymentsToVoid.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-2 px-3 py-2 text-sm"
              >
                <CreditCard className="h-4 w-4 text-muted-foreground shrink-0" />
                <span>{formatPaymentDisplay(p)}</span>
                <span className="text-muted-foreground text-xs">
                  (will be reversed)
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-2">
          <Label htmlFor="void-manager-pin">Manager PIN *</Label>
          <Input
            id="void-manager-pin"
            type="password"
            inputMode="numeric"
            placeholder="Enter PIN"
            value={managerPin}
            onChange={(e) => setManagerPin(e.target.value)}
            maxLength={8}
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={!isValid || isSubmitting}
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Ban className="h-4 w-4 mr-2" />
            )}
            Void Order — {formatCurrency(totalToVoid)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
