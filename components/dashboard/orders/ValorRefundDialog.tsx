"use client";

/**
 * [C5] Refund / void dialog for an online Valor order payment.
 *
 * Card-not-present web sales can't be reversed on a POS terminal, so this is the
 * merchant-facing entry point for the RefundOnlineOrder server action. Void vs
 * refund is decided server-side from settlement state; this dialog only shows
 * which will happen. The amount field follows the project rule for numeric
 * inputs — type="text" + inputMode with string state, so it can be cleared.
 */

import * as React from "react";
import { toast } from "sonner";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  RefundOnlineOrder,
  type RefundReasonCode,
} from "@/app/dashboard/actions/refund-online-order";
import type { OrderPayment } from "@/types/order-management";

const REASONS: { value: RefundReasonCode; label: string }[] = [
  { value: "customer_request", label: "Customer request" },
  { value: "item_quality", label: "Item quality" },
  { value: "wrong_item", label: "Wrong item" },
  { value: "never_received", label: "Never received" },
  { value: "duplicate_charge", label: "Duplicate charge" },
  { value: "price_adjustment", label: "Price adjustment" },
  { value: "order_cancelled", label: "Order cancelled" },
  { value: "kitchen_error", label: "Kitchen error" },
  { value: "manager_comp", label: "Manager comp" },
  { value: "other", label: "Other" },
];

interface ValorRefundDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clerkOrgId: string;
  orderId: string;
  payment: OrderPayment;
  onRefunded: () => void;
}

export function ValorRefundDialog({
  open,
  onOpenChange,
  clerkOrgId,
  orderId,
  payment,
  onRefunded,
}: ValorRefundDialogProps) {
  const baseCents = Math.round(Number(payment.amount ?? 0) * 100);
  const refundedCents = Math.round(Number(payment.refunded_amount ?? 0) * 100);
  const maxRefundableCents = Math.max(0, baseCents - refundedCents);
  const isSettled = Boolean(
    payment.is_settled || payment.settled_at || payment.settlement_batch_id
  );

  const [amountStr, setAmountStr] = React.useState("");
  const [reason, setReason] = React.useState<RefundReasonCode>("customer_request");
  const [note, setNote] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  // Reset the form on each open using React's "adjust state when a prop changes"
  // pattern (during render, not in an effect) so the amount defaults to the full
  // refundable each time without triggering a cascading-render effect.
  const [wasOpen, setWasOpen] = React.useState(false);
  if (open && !wasOpen) {
    setWasOpen(true);
    setAmountStr((maxRefundableCents / 100).toFixed(2));
    setReason("customer_request");
    setNote("");
    setSubmitting(false);
  } else if (!open && wasOpen) {
    setWasOpen(false);
  }

  const parsedAmount = Number(amountStr);
  const amountValid =
    amountStr.trim() !== "" &&
    Number.isFinite(parsedAmount) &&
    parsedAmount > 0 &&
    Math.round(parsedAmount * 100) <= maxRefundableCents;
  const amountCents = Math.round(parsedAmount * 100);
  const willVoid = !isSettled && amountValid && amountCents >= maxRefundableCents;

  async function handleSubmit() {
    if (!amountValid || submitting) return;
    setSubmitting(true);
    try {
      const result = await RefundOnlineOrder({
        clerkOrgId,
        orderId,
        paymentId: payment.id,
        amountCents,
        reasonCode: reason,
        reasonDescription: note.trim() || undefined,
        idempotencyKey:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : undefined,
      });

      if (result.success) {
        toast.success(
          `${result.mode === "void" ? "Voided" : "Refunded"} $${parsedAmount.toFixed(2)}` +
            (result.refundNumber ? ` · ${result.refundNumber}` : "")
        );
        onRefunded();
        onOpenChange(false);
      } else {
        toast.error(result.error ?? "Refund failed.");
      }
    } catch {
      toast.error("Refund failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Refund online payment</DialogTitle>
          <DialogDescription>
            {isSettled
              ? "This charge has settled — funds will be refunded to the card."
              : willVoid
                ? "Not yet settled — a full reversal will be voided."
                : "Not yet settled — a partial reversal will be refunded."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="valor-refund-amount">Refund amount</Label>
            <Input
              id="valor-refund-amount"
              type="text"
              inputMode="decimal"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              placeholder="0.00"
              disabled={submitting}
            />
            <p className="text-xs text-muted-foreground">
              Up to ${(maxRefundableCents / 100).toFixed(2)} refundable
              {refundedCents > 0
                ? ` (already refunded $${(refundedCents / 100).toFixed(2)})`
                : ""}
              .
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Select
              value={reason}
              onValueChange={(v) => setReason(v as RefundReasonCode)}
              disabled={submitting}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="valor-refund-note">Note (optional)</Label>
            <Textarea
              id="valor-refund-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add context for this refund…"
              rows={2}
              disabled={submitting}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!amountValid || submitting}>
            {submitting
              ? "Processing…"
              : willVoid
                ? `Void $${parsedAmount.toFixed(2)}`
                : `Refund $${(amountValid ? parsedAmount : 0).toFixed(2)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
