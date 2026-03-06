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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ChevronLeft, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { processRefund, type RefundRequest } from "@/app/actions/orders/process-refund";
import type {
  OrderResponse,
  OrderItem,
  OrderPayment,
} from "@/types/order-management";
import type { OrderFullHistory } from "@/types/order-full-history";

// ─── Constants ───

const REFUND_REASON_OPTIONS = [
  { value: "customer_request", label: "Customer Request" },
  { value: "item_quality", label: "Item Quality" },
  { value: "wrong_item", label: "Wrong Item" },
  { value: "never_received", label: "Never Received" },
  { value: "duplicate_charge", label: "Duplicate Charge" },
  { value: "price_adjustment", label: "Price Adjustment" },
  { value: "order_cancelled", label: "Order Cancelled" },
  { value: "kitchen_error", label: "Kitchen Error" },
  { value: "manager_comp", label: "Manager Comp" },
  { value: "other", label: "Other" },
] as const;

const MANAGER_PIN_THRESHOLD = 50;

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

// ─── Types ───

type RefundType = "full" | "partial" | "item_return";

type Step = "select_type" | "details" | "confirm";

interface RefundableItem extends OrderItem {
  quantityRefunded?: number;
}

// ─── Props ───

export interface RefundModalProps {
  order: OrderResponse;
  fullHistory?: OrderFullHistory | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

// ─── Component ───

export function RefundModal({
  order,
  fullHistory,
  open,
  onOpenChange,
  onSuccess,
}: RefundModalProps) {
  const [step, setStep] = React.useState<Step>("select_type");
  const [refundType, setRefundType] = React.useState<RefundType | null>(null);

  // Full / Partial
  const [amount, setAmount] = React.useState("");
  const [reasonCode, setReasonCode] = React.useState<string>("");
  const [reasonDetail, setReasonDetail] = React.useState("");

  // Item Return
  const [selectedItems, setSelectedItems] = React.useState<
    Map<string, { quantity: number; returnToInventory: boolean; reason: string }>
  >(new Map());

  // Manager PIN
  const [managerPin, setManagerPin] = React.useState("");

  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const payments = order.order_payments || [];
  const items = (order.order_items || []) as RefundableItem[];

  // Eligible payments: captured or paid (from order; use fullHistory.payments when order has no payments)
  const historyPayments = fullHistory?.payments ?? [];
  const paymentsForEligible =
    payments.length > 0 ? payments : historyPayments;
  const eligiblePayments = paymentsForEligible.filter((p: { status?: string }) =>
    ["captured", "paid"].includes(String(p.status ?? "").toLowerCase())
  );
  const primaryPayment = eligiblePayments[0];

  // Total paid: prefer fullHistory.order.amount_paid, else order.amount_paid, else sum from fullHistory.payments, else sum from order.order_payments
  const fromOrderAmount =
    fullHistory?.order?.amount_paid != null
      ? Number(fullHistory.order.amount_paid)
      : Number(order.amount_paid);
  const fromEligibleSum =
    eligiblePayments.length > 0
      ? eligiblePayments.reduce(
          (sum: number, p: { amount?: number; total_amount?: number }) =>
            sum + Number(p.amount ?? p.total_amount ?? 0),
          0
        )
      : 0;
  const totalPaid = fromOrderAmount > 0 ? fromOrderAmount : fromEligibleSum;
  const totalRefunded =
    payments.reduce(
      (sum, p) => sum + Number((p as { refunded_amount?: number }).refunded_amount ?? 0),
      0
    ) ||
    (fullHistory?.reversals ?? [])
      .filter((r) => r.status === "completed" || r.status === "processed")
      .reduce((sum, r) => sum + Number(r.amount ?? 0), 0);
  const refundableAmount = Math.max(0, totalPaid - totalRefunded);

  // Per-item refunded quantities from reversals
  const refundedQtyByItem = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const rev of fullHistory?.reversals ?? []) {
      if (rev.status !== "completed" && rev.status !== "processed") continue;
      for (const ri of rev.refund_items ?? []) {
        const key = ri.order_item_id;
        map.set(key, (map.get(key) ?? 0) + (ri.quantity_refunded ?? 0));
      }
    }
    return map;
  }, [fullHistory?.reversals]);

  // Non-voided, non-fully-refunded items for item return
  const refundableItems = React.useMemo(() => {
    return items.filter((item) => {
      if (item.is_voided) return false;
      const qty = Number(item.quantity) || 1;
      const refunded = refundedQtyByItem.get(item.id) ?? 0;
      return refunded < qty;
    });
  }, [items, refundedQtyByItem]);

  const fullRefundAmount = refundableAmount;
  const partialAmountNum = parseFloat(amount) || 0;
  const isValidPartial = partialAmountNum > 0 && partialAmountNum <= refundableAmount;

  // Item return total
  const itemReturnTotal = React.useMemo(() => {
    let subtotal = 0;
    let taxTotal = 0;
    const taxRate = order.tax_amount && order.subtotal ? order.tax_amount / order.subtotal : 0;
    for (const [itemId, sel] of selectedItems) {
      if (sel.quantity <= 0) continue;
      const item = items.find((i) => i.id === itemId);
      if (!item || item.is_voided) continue;
      const unitPrice = Number(item.unit_price) || 0;
      const itemSubtotal = unitPrice * sel.quantity;
      subtotal += itemSubtotal;
      const itemTax = (item as { is_tax_exempt?: boolean }).is_tax_exempt ? 0 : itemSubtotal * taxRate;
      taxTotal += itemTax;
    }
    return subtotal + taxTotal;
  }, [selectedItems, items, order.tax_amount, order.subtotal]);

  const needsManagerPin =
    (refundType === "full" && fullRefundAmount > MANAGER_PIN_THRESHOLD) ||
    (refundType === "partial" && partialAmountNum > MANAGER_PIN_THRESHOLD) ||
    (refundType === "item_return" && itemReturnTotal > MANAGER_PIN_THRESHOLD);

  const finalAmount =
    refundType === "full"
      ? fullRefundAmount
      : refundType === "partial"
        ? partialAmountNum
        : itemReturnTotal;

  const canProceedFromDetails =
    (refundType === "full" && reasonCode) ||
    (refundType === "partial" && reasonCode && isValidPartial) ||
    (refundType === "item_return" &&
      selectedItems.size > 0 &&
      Array.from(selectedItems.entries()).every(
        ([_, v]) => v.quantity > 0 && v.reason
      ));

  const canProceedToConfirm =
    canProceedFromDetails && (!needsManagerPin || managerPin.trim().length >= 4);

  const handleClose = React.useCallback(() => {
    setStep("select_type");
    setRefundType(null);
    setAmount("");
    setReasonCode("");
    setReasonDetail("");
    setSelectedItems(new Map());
    setManagerPin("");
    onOpenChange(false);
  }, [onOpenChange]);

  const handleBack = () => {
    if (step === "confirm") setStep("details");
    else if (step === "details") setStep("select_type");
  };

  const handleNext = () => {
    if (step === "select_type" && refundType) setStep("details");
    else if (step === "details" && canProceedToConfirm) setStep("confirm");
  };

  const handleSubmit = async () => {
    if (!primaryPayment || !reasonCode) return;
    setIsSubmitting(true);
    try {
      const payload: RefundRequest = {
        orderId: order.id,
        refundType: refundType!,
        amount: finalAmount,
        paymentId: primaryPayment.id,
        reasonCode,
        reasonDetail: reasonDetail.trim() || undefined,
        approvedBy: needsManagerPin ? managerPin : undefined,
        items:
          refundType === "item_return"
            ? Array.from(selectedItems.entries())
                .filter(([, v]) => v.quantity > 0 && v.reason)
                .map(([orderItemId, v]) => ({
                  orderItemId,
                  quantity: v.quantity,
                  returnToInventory: v.returnToInventory,
                  reason: v.reason,
                }))
            : undefined,
      };
      const result = await processRefund(payload);
      if (result.stub) {
        toast.info(result.message, {
          description: "This action will be enabled once payment provider integration is complete.",
        });
        onSuccess?.();
        handleClose();
      } else if (result.success) {
        toast.success("Refund processed");
        onSuccess?.();
        handleClose();
      } else {
        toast.error(result.message);
      }
    } catch (err) {
      toast.error("An unexpected error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleItemSelection = (itemId: string, item: RefundableItem) => {
    const qty = Number(item.quantity) || 1;
    const refunded = refundedQtyByItem.get(itemId) ?? 0;
    const maxQty = qty - refunded;
    setSelectedItems((prev) => {
      const next = new Map(prev);
      if (next.has(itemId)) next.delete(itemId);
      else
        next.set(itemId, {
          quantity: Math.min(1, maxQty),
          returnToInventory: true,
          reason: REFUND_REASON_OPTIONS[0]!.value,
        });
      return next;
    });
  };

  const updateItemSelection = (
    itemId: string,
    updates: Partial<{ quantity: number; returnToInventory: boolean; reason: string }>
  ) => {
    setSelectedItems((prev) => {
      const next = new Map(prev);
      const current = next.get(itemId);
      if (!current) return prev;
      next.set(itemId, { ...current, ...updates });
      return next;
    });
  };

  if (eligiblePayments.length === 0) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : handleClose())}>
      <DialogContent
        className="max-w-lg max-h-[90vh] overflow-y-auto"
        elevation="high"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5" />
            Process Refund
          </DialogTitle>
          <DialogDescription>
            Order #{order.display_number ?? order.order_number} —{" "}
            {formatCurrency(refundableAmount)} refundable
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex gap-2 text-sm">
          <span
            className={cn(
              "font-medium",
              step === "select_type" ? "text-primary" : "text-muted-foreground"
            )}
          >
            1. Type
          </span>
          <span className="text-muted-foreground">→</span>
          <span
            className={cn(
              "font-medium",
              step === "details" ? "text-primary" : "text-muted-foreground"
            )}
          >
            2. Details
          </span>
          <span className="text-muted-foreground">→</span>
          <span
            className={cn(
              "font-medium",
              step === "confirm" ? "text-primary" : "text-muted-foreground"
            )}
          >
            3. Confirm
          </span>
        </div>

        {/* Step 1: Select refund type */}
        {step === "select_type" && (
          <div className="space-y-4">
            <RadioGroup
              value={refundType ?? ""}
              onValueChange={(v) => setRefundType(v as RefundType)}
              className="gap-3"
            >
              <label className="flex items-center gap-3 rounded-lg border p-4 cursor-pointer hover:bg-muted/50">
                <RadioGroupItem value="full" />
                <div>
                  <p className="font-medium">Full Refund</p>
                  <p className="text-sm text-muted-foreground">
                    Refund entire order ({formatCurrency(fullRefundAmount)})
                  </p>
                </div>
              </label>
              <label className="flex items-center gap-3 rounded-lg border p-4 cursor-pointer hover:bg-muted/50">
                <RadioGroupItem value="partial" />
                <div>
                  <p className="font-medium">Partial Refund</p>
                  <p className="text-sm text-muted-foreground">
                    Enter custom amount (max {formatCurrency(refundableAmount)})
                  </p>
                </div>
              </label>
              <label className="flex items-center gap-3 rounded-lg border p-4 cursor-pointer hover:bg-muted/50">
                <RadioGroupItem value="item_return" />
                <div>
                  <p className="font-medium">Item Return</p>
                  <p className="text-sm text-muted-foreground">
                    Select specific items to refund
                  </p>
                </div>
              </label>
            </RadioGroup>
          </div>
        )}

        {/* Step 2: Details */}
        {step === "details" && (
          <div className="space-y-4">
            {refundType === "full" && (
              <>
                <p className="text-sm">
                  Refund amount: <strong>{formatCurrency(fullRefundAmount)}</strong>
                </p>
                <div className="space-y-2">
                  <Label>Reason *</Label>
                  <Select value={reasonCode} onValueChange={setReasonCode}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select reason" />
                    </SelectTrigger>
                    <SelectContent>
                      {REFUND_REASON_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Additional details (optional)</Label>
                  <Textarea
                    value={reasonDetail}
                    onChange={(e) => setReasonDetail(e.target.value)}
                    placeholder="Add any additional context..."
                    rows={2}
                  />
                </div>
              </>
            )}

            {refundType === "partial" && (
              <>
                <div className="space-y-2">
                  <Label>Amount * (max {formatCurrency(refundableAmount)})</Label>
                  <Input
                    type="number"
                    min={0.01}
                    max={refundableAmount}
                    step={0.01}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                  />
                  {partialAmountNum > refundableAmount && (
                    <p className="text-sm text-destructive">
                      Amount cannot exceed {formatCurrency(refundableAmount)}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Reason *</Label>
                  <Select value={reasonCode} onValueChange={setReasonCode}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select reason" />
                    </SelectTrigger>
                    <SelectContent>
                      {REFUND_REASON_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Additional details (optional)</Label>
                  <Textarea
                    value={reasonDetail}
                    onChange={(e) => setReasonDetail(e.target.value)}
                    placeholder="Add any additional context..."
                    rows={2}
                  />
                </div>
              </>
            )}

            {refundType === "item_return" && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Select items and quantities to refund. Each item requires a reason.
                </p>
                <div className="max-h-64 overflow-y-auto space-y-3 border rounded-lg p-3">
                  {refundableItems.map((item) => {
                    const qty = Number(item.quantity) || 1;
                    const refunded = refundedQtyByItem.get(item.id) ?? 0;
                    const maxQty = qty - refunded;
                    const sel = selectedItems.get(item.id);
                    const isSelected = !!sel;
                    return (
                      <div
                        key={item.id}
                        className={cn(
                          "rounded-md border p-3 space-y-2",
                          isSelected && "border-primary bg-primary/5"
                        )}
                      >
                        <label className="flex items-center gap-3 cursor-pointer">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() =>
                              toggleItemSelection(item.id, item)
                            }
                          />
                          <span className="font-medium">{item.item_name}</span>
                          <span className="text-sm text-muted-foreground">
                            × {maxQty} available
                          </span>
                        </label>
                        {isSelected && (
                          <div className="pl-7 space-y-2">
                            <div className="flex items-center gap-2">
                              <Label className="text-xs">Qty</Label>
                              <select
                                className="h-8 w-16 rounded border px-2 text-sm"
                                value={sel.quantity}
                                onChange={(e) =>
                                  updateItemSelection(item.id, {
                                    quantity: parseInt(e.target.value, 10) || 1,
                                  })
                                }
                              >
                                {Array.from({ length: maxQty }, (_, i) => i + 1).map(
                                  (n) => (
                                    <option key={n} value={n}>
                                      {n}
                                    </option>
                                  )
                                )}
                              </select>
                            </div>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={sel.returnToInventory}
                                onCheckedChange={(v) =>
                                  updateItemSelection(item.id, {
                                    returnToInventory: v,
                                  })
                                }
                              />
                              <Label className="text-xs">
                                Return to inventory
                              </Label>
                            </div>
                            <div>
                              <Label className="text-xs">Reason *</Label>
                              <Select
                                value={sel.reason}
                                onValueChange={(v) =>
                                  updateItemSelection(item.id, { reason: v })
                                }
                              >
                                <SelectTrigger className="h-8 mt-1">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {REFUND_REASON_OPTIONS.map((o) => (
                                    <SelectItem key={o.value} value={o.value}>
                                      {o.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {refundableItems.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No refundable items (all items are voided or fully refunded).
                  </p>
                )}
                {selectedItems.size > 0 && (
                  <p className="font-medium">
                    Total (subtotal + tax): {formatCurrency(itemReturnTotal)}
                  </p>
                )}
              </div>
            )}

            {needsManagerPin && (
              <div className="space-y-2 border-t pt-4">
                <Label>Manager approval PIN * (required for amounts over {formatCurrency(MANAGER_PIN_THRESHOLD)})</Label>
                <Input
                  type="password"
                  inputMode="numeric"
                  placeholder="Enter PIN"
                  value={managerPin}
                  onChange={(e) => setManagerPin(e.target.value)}
                  maxLength={8}
                />
              </div>
            )}
          </div>
        )}

        {/* Step 3: Confirm */}
        {step === "confirm" && (
          <div className="space-y-4 rounded-lg border p-4">
            <p>
              <strong>Refund type:</strong>{" "}
              {refundType === "full"
                ? "Full Refund"
                : refundType === "partial"
                  ? "Partial Refund"
                  : "Item Return"}
            </p>
            <p>
              <strong>Amount:</strong> {formatCurrency(finalAmount)}
            </p>
            {refundType === "item_return" && selectedItems.size > 0 && (
              <div>
                <strong>Items:</strong>
                <ul className="mt-1 list-disc list-inside text-sm">
                  {Array.from(selectedItems.entries()).map(
                    ([itemId, sel]) => {
                      const item = items.find((i) => i.id === itemId);
                      const reasonLabel =
                        REFUND_REASON_OPTIONS.find((o) => o.value === sel.reason)
                          ?.label ?? sel.reason;
                      return (
                        <li key={itemId}>
                          {item?.item_name ?? "Item"} × {sel.quantity}
                          {sel.returnToInventory && " (return to inventory)"} — {reasonLabel}
                        </li>
                      );
                    }
                  )}
                </ul>
              </div>
            )}
            <p>
              <strong>Reason:</strong>{" "}
              {REFUND_REASON_OPTIONS.find((o) => o.value === reasonCode)?.label ??
                reasonCode}
            </p>
            {reasonDetail && (
              <p>
                <strong>Details:</strong> {reasonDetail}
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              Refund will be sent to the original payment method.
            </p>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {step !== "select_type" && (
            <Button variant="outline" onClick={handleBack}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          )}
          <div className="flex-1" />
          {step === "select_type" && (
            <Button
              disabled={!refundType}
              onClick={handleNext}
            >
              Next
            </Button>
          )}
          {step === "details" && (
            <Button
              disabled={!canProceedToConfirm}
              onClick={handleNext}
            >
              Next
            </Button>
          )}
          {step === "confirm" && (
            <Button
              disabled={isSubmitting}
              onClick={handleSubmit}
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RotateCcw className="h-4 w-4 mr-2" />
              )}
              Process Refund
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

