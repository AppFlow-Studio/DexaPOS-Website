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
import { DollarSign, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { adjustTip, getCurrentStaffProfileId } from "@/app/actions/orders/adjust-tip";

// ─── Constants ───

const TIP_REASON_OPTIONS = [
  { value: "signed_receipt_differs", label: "Signed receipt differs" },
  { value: "customer_correction", label: "Customer correction" },
  { value: "staff_entry_error", label: "Staff entry error" },
  { value: "merchant_adjustment", label: "Merchant adjustment" },
  { value: "other", label: "Other" },
] as const;

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

// ─── Types ───

export interface AdjustablePayment {
  id: string;
  amount: number;
  tip_amount: number;
  total_amount: number;
  payment_method: string;
  status: string;
  card_type?: string | null;
  card_last_four?: string | null;
}

export interface AdjustTipModalProps {
  orderId: string;
  displayNumber: string;
  /** Only unsettled card payments that are captured or paid */
  eligiblePayments: AdjustablePayment[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

// ─── Component ───

export function AdjustTipModal({
  orderId,
  displayNumber,
  eligiblePayments,
  open,
  onOpenChange,
  onSuccess,
}: AdjustTipModalProps) {
  const [selectedPaymentId, setSelectedPaymentId] = React.useState<string>("");
  const [newTipInput, setNewTipInput] = React.useState("");
  const [reason, setReason] = React.useState<string>("");
  const [staffId, setStaffId] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const selectedPayment = eligiblePayments.find((p) => p.id === selectedPaymentId);
  const currentTip = selectedPayment ? Number(selectedPayment.tip_amount) || 0 : 0;
  const amount = selectedPayment ? Number(selectedPayment.amount) || 0 : 0;

  const newTipNum = parseFloat(newTipInput) || 0;
  const newTotal = amount + newTipNum;
  const currentTotal = selectedPayment ? Number(selectedPayment.total_amount) || 0 : 0;

  const isValidTip = newTipNum >= 0 && newTipNum <= amount;
  const canSubmit =
    selectedPaymentId &&
    isValidTip &&
    reason.trim().length > 0 &&
    staffId &&
    !isSubmitting;

  // Resolve staff ID on open
  React.useEffect(() => {
    if (open && !staffId) {
      getCurrentStaffProfileId().then(setStaffId);
    }
  }, [open, staffId]);

  // Sync selected payment when dropdown or list changes
  React.useEffect(() => {
    if (eligiblePayments.length > 0 && !selectedPaymentId) {
      setSelectedPaymentId(eligiblePayments[0]!.id);
      const p = eligiblePayments[0]!;
      setNewTipInput(String(Number(p.tip_amount) || 0));
    }
  }, [eligiblePayments, selectedPaymentId]);

  React.useEffect(() => {
    if (selectedPayment) {
      setNewTipInput(String(currentTip));
    }
  }, [selectedPaymentId, currentTip, selectedPayment?.id]);

  const handleClose = React.useCallback(() => {
    setSelectedPaymentId("");
    setNewTipInput("");
    setReason("");
    onOpenChange(false);
  }, [onOpenChange]);

  const handleSubmit = async () => {
    if (!canSubmit || !staffId || !selectedPaymentId) return;
    setIsSubmitting(true);
    try {
      const result = await adjustTip({
        paymentId: selectedPaymentId,
        orderId,
        newTipAmount: newTipNum,
        reason: reason.trim(),
        staffId,
      });
      if (result.success) {
        toast.success("Tip adjusted");
        onSuccess?.();
        handleClose();
      } else {
        toast.error(result.error ?? "Failed to adjust tip");
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (eligiblePayments.length === 0) {
    return null;
  }

  const paymentLabel = (p: AdjustablePayment) => {
    if (p.card_type && p.card_last_four) {
      return `${p.card_type} ****${p.card_last_four} — ${formatCurrency(p.amount)}`;
    }
    if (p.card_last_four) {
      return `Card ****${p.card_last_four} — ${formatCurrency(p.amount)}`;
    }
    return `Payment — ${formatCurrency(p.amount)}`;
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : handleClose())}>
      <DialogContent
        className="max-w-md"
        elevation="high"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Adjust Tip
            {eligiblePayments.length > 0 && (
              <span className="text-muted-foreground font-normal">
                — Payment
                {eligiblePayments.length > 1
                  ? ` #${eligiblePayments.findIndex((p) => p.id === selectedPaymentId) + 1}`
                  : ""}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            Order #{displayNumber} — Database-only update. Terminal adjustment happens at settlement.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {eligiblePayments.length > 1 && (
            <div className="space-y-2">
              <Label htmlFor="adjust-tip-payment">Select payment</Label>
              <select
                id="adjust-tip-payment"
                value={selectedPaymentId}
                onChange={(e) => {
                  const v = e.target.value;
                  setSelectedPaymentId(v);
                  const p = eligiblePayments.find((x) => x.id === v);
                  if (p) setNewTipInput(String(Number(p.tip_amount) || 0));
                }}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                {eligiblePayments.map((p, i) => (
                  <option key={p.id} value={p.id}>
                    Payment #{i + 1}: {paymentLabel(p)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {selectedPayment && (
            <>
              <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <span className="text-muted-foreground">Current Tip</span>
                <span>{formatCurrency(currentTip)}</span>
                <span className="text-muted-foreground">Payment Amount</span>
                <span>{formatCurrency(amount)}</span>
              </div>

              <div className="space-y-2">
                <Label htmlFor="new-tip">New Tip *</Label>
                <Input
                  id="new-tip"
                  type="number"
                  min={0}
                  max={amount}
                  step={0.01}
                  placeholder="0.00"
                  value={newTipInput}
                  onChange={(e) => setNewTipInput(e.target.value)}
                />
                {!isValidTip && newTipInput !== "" && (
                  <p className="text-sm text-destructive">
                    Tip must be between $0 and {formatCurrency(amount)} (100% of payment)
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <Label>New Total</Label>
                <p className="text-sm font-medium">
                  {formatCurrency(currentTotal)} → {formatCurrency(newTotal)}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="adjust-tip-reason">Reason *</Label>
                <select
                  id="adjust-tip-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="">Select reason</option>
                  {TIP_REASON_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>

        {!staffId && (
          <p className="text-sm text-amber-600 dark:text-amber-400">
            Resolving staff profile…
          </p>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <DollarSign className="h-4 w-4 mr-2" />
            )}
            Adjust Tip
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
