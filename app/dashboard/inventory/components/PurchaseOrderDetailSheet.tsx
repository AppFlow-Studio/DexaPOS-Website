"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Package,
  Truck,
  CreditCard,
  DollarSign,
  Check,
  X,
  AlertTriangle,
  Loader2,
  Clock,
  User,
  Calendar,
  Hash,
  Building,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  GetPurchaseOrderDetails,
  LogPurchaseOrderDelivery,
  LogPurchaseOrderPayment,
  GetDiscrepancyReport,
} from "@/app/dashboard/actions/purchase-orders";
import {
  PurchaseOrderWithDetails,
  DiscrepancyReportItem,
} from "@/types/inventory";
import { useUpdatePurchaseOrderStatus } from "../hooks/useInventoryManagement";

interface PurchaseOrderDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purchaseOrderId: string | null;
}

// ============================================================================
// Status Badge Component
// ============================================================================
function POStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: "bg-gray-500/20 text-gray-500 border-gray-500/20",
    pending: "bg-amber-500/20 text-amber-600 border-amber-500/20",
    received: "bg-blue-500/20 text-blue-600 border-blue-500/20",
    paid: "bg-emerald-500/20 text-emerald-600 border-emerald-500/20",
    cancelled: "bg-red-500/20 text-red-500 border-red-500/20",
  };

  const labels: Record<string, string> = {
    draft: "Draft",
    pending: "Pending",
    received: "Received",
    paid: "Paid",
    cancelled: "Cancelled",
  };

  return (
    <Badge variant="outline" className={cn("font-medium", styles[status])}>
      {labels[status] || status}
    </Badge>
  );
}

// ============================================================================
// Discrepancy Status Badge
// ============================================================================
function DiscrepancyStatusBadge({
  status,
}: {
  status: "missing" | "shorted" | "received";
}) {
  const styles = {
    missing: "bg-red-500/20 text-red-500",
    shorted: "bg-amber-500/20 text-amber-600",
    received: "bg-emerald-500/20 text-emerald-600",
  };

  const labels = {
    missing: "Missing",
    shorted: "Shorted",
    received: "Received",
  };

  return (
    <Badge variant="outline" className={cn("text-xs", styles[status])}>
      {labels[status]}
    </Badge>
  );
}

// ============================================================================
// Main Component
// ============================================================================
export function PurchaseOrderDetailSheet({
  open,
  onOpenChange,
  purchaseOrderId,
}: PurchaseOrderDetailSheetProps) {
  const queryClient = useQueryClient();
  const updatePOStatus = useUpdatePurchaseOrderStatus();
  const [showDeliveryDialog, setShowDeliveryDialog] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);

  // Fetch PO details
  const { data: po, isLoading } = useQuery({
    queryKey: ["purchase-order-details", purchaseOrderId],
    queryFn: async () => {
      if (!purchaseOrderId) return null;
      const result = await GetPurchaseOrderDetails(purchaseOrderId);
      return result.data || null;
    },
    enabled: !!purchaseOrderId && open,
  });

  // Fetch discrepancy report
  const { data: discrepancies } = useQuery({
    queryKey: ["discrepancy-report", purchaseOrderId],
    queryFn: async () => {
      if (!purchaseOrderId) return [];
      const result = await GetDiscrepancyReport(purchaseOrderId);
      return result.data || [];
    },
    enabled: !!purchaseOrderId && open,
  });

  if (!purchaseOrderId) return null;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="sm:max-w-[600px] overflow-y-auto px-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : po ? (
            <>
              <SheetHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 border border-emerald-500/10">
                    <Package className="h-5 w-5 text-emerald-500" />
                  </div>
                  <div className="flex-1">
                    <SheetTitle className="flex items-center gap-2">
                      {po.po_number}
                      <POStatusBadge status={po.status} />
                    </SheetTitle>
                    <SheetDescription>
                      Created{" "}
                      {new Date(po.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </SheetDescription>
                  </div>
                </div>
              </SheetHeader>

              <div className="space-y-6 mt-6">
                {/* Summary Grid */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Building className="h-3 w-3" />
                      Vendor
                    </p>
                    <p className="font-medium">
                      {po.vendor?.name || "Unknown"}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Hash className="h-3 w-3" />
                      Location
                    </p>
                    <p className="font-medium">
                      {po.location?.name || "Unknown"}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Package className="h-3 w-3" />
                      Items
                    </p>
                    <p className="font-medium">{po.items.length} items</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <DollarSign className="h-3 w-3" />
                      Total
                    </p>
                    <p className="font-semibold text-lg">
                      ${po.total_amount.toFixed(2)}
                    </p>
                  </div>
                </div>

                <Separator />

                {/* Action Buttons */}
                {po.status === "draft" && (
                  <div className="space-y-3">
                    <h4 className="font-medium flex items-center gap-2">
                      Action
                    </h4>
                    <Button
                      className="w-full gap-2"
                      onClick={() =>
                        updatePOStatus.mutate({
                          poId: po.id,
                          status: "pending",
                        })
                      }
                      disabled={updatePOStatus.isPending}
                    >
                      {updatePOStatus.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                      Submit Order
                    </Button>
                  </div>
                )}

                {po.status === "pending" && (
                  <div className="space-y-3">
                    <h4 className="font-medium flex items-center gap-2">
                      <Truck className="h-4 w-4" />
                      Log Delivery
                    </h4>
                    <Button
                      className="w-full gap-2"
                      variant="default"
                      onClick={() => setShowDeliveryDialog(true)}
                    >
                      <Package className="h-4 w-4" />
                      Log Goods Received
                    </Button>
                  </div>
                )}

                {po.status === "received" && !po.payments?.length && (
                  <div className="space-y-3">
                    <h4 className="font-medium flex items-center gap-2">
                      <CreditCard className="h-4 w-4" />
                      Log Payment
                    </h4>
                    <Button
                      className="w-full gap-2"
                      variant="default"
                      onClick={() => setShowPaymentDialog(true)}
                    >
                      <DollarSign className="h-4 w-4" />
                      Log Payment
                    </Button>
                  </div>
                )}

                {/* Delivery History */}
                {po.delivered_at && (
                  <div className="space-y-3">
                    <h4 className="font-medium flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Delivery History
                    </h4>
                    <div className="rounded-lg border p-4 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                          Delivered At
                        </span>
                        <span className="font-medium">
                          {new Date(po.delivered_at).toLocaleString()}
                        </span>
                      </div>
                      {po.delivered_by && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">
                            Delivered By
                          </span>
                          <span className="font-medium">{po.delivered_by}</span>
                        </div>
                      )}
                      {po.delivery_logged_by_name && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">
                            Logged By
                          </span>
                          <span className="font-medium">
                            {po.delivery_logged_by_name}
                          </span>
                        </div>
                      )}
                      {po.delivery_notes && (
                        <div className="pt-2 border-t text-sm">
                          <span className="text-muted-foreground">Notes: </span>
                          {po.delivery_notes}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Payment History */}
                {po.payments && po.payments.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="font-medium flex items-center gap-2">
                      <CreditCard className="h-4 w-4" />
                      Payment History
                    </h4>
                    {po.payments.map((payment) => (
                      <div
                        key={payment.id}
                        className="rounded-lg border p-4 space-y-2"
                      >
                        <div className="flex justify-between items-center">
                          <Badge
                            variant="outline"
                            className={cn(
                              payment.payment_method === "card"
                                ? "bg-blue-500/20 text-blue-600"
                                : "bg-emerald-500/20 text-emerald-600"
                            )}
                          >
                            {payment.payment_method === "card" ? (
                              <>
                                <CreditCard className="h-3 w-3 mr-1" />
                                Card ****{payment.card_last_four}
                              </>
                            ) : (
                              <>
                                <DollarSign className="h-3 w-3 mr-1" />
                                {payment.payment_method
                                  .charAt(0)
                                  .toUpperCase() +
                                  payment.payment_method.slice(1)}
                              </>
                            )}
                          </Badge>
                          <span className="font-semibold">
                            ${payment.amount.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Paid At</span>
                          <span>
                            {new Date(payment.paid_at).toLocaleString()}
                          </span>
                        </div>
                        {payment.paid_to && (
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">
                              Paid To
                            </span>
                            <span>{payment.paid_to}</span>
                          </div>
                        )}
                        {payment.paid_by_name && (
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">
                              Paid By
                            </span>
                            <span>{payment.paid_by_name}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <Separator />

                {/* Items List */}
                <div className="space-y-3">
                  <h4 className="font-medium">Order Items</h4>
                  <div className="rounded-lg border divide-y">
                    {po.items.map((item) => (
                      <div
                        key={item.id}
                        className="p-3 flex justify-between items-center"
                      >
                        <div>
                          <p className="font-medium">
                            {item.item_name ||
                              item.inventory_item?.name ||
                              "Unknown Item"}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {item.quantity_ordered}{" "}
                            {item.item_unit_type ||
                              item.inventory_item?.unit_type ||
                              "units"}{" "}
                            × ${item.unit_cost.toFixed(2)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">
                            ${item.line_total.toFixed(2)}
                          </p>
                          {item.quantity_received > 0 && (
                            <p className="text-xs text-muted-foreground">
                              Received: {item.quantity_received}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Discrepancy Report */}
                {discrepancies &&
                  discrepancies.length > 0 &&
                  po.status !== "draft" &&
                  po.status !== "pending" && (
                    <div className="space-y-3">
                      <h4 className="font-medium flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4" />
                        Discrepancy Report
                      </h4>
                      <div className="rounded-lg border divide-y">
                        <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-muted/50 text-xs font-medium text-muted-foreground">
                          <div className="col-span-5">Item</div>
                          <div className="col-span-2 text-center">Req</div>
                          <div className="col-span-2 text-center">Rec</div>
                          <div className="col-span-3 text-center">Status</div>
                        </div>
                        {discrepancies.map((item) => (
                          <div
                            key={item.item_id}
                            className="grid grid-cols-12 gap-2 px-4 py-3 items-center"
                          >
                            <div className="col-span-5 truncate">
                              {item.item_name || "Unknown"}
                            </div>
                            <div className="col-span-2 text-center">
                              {item.quantity_ordered}
                            </div>
                            <div className="col-span-2 text-center">
                              {item.quantity_received}
                            </div>
                            <div className="col-span-3 flex justify-center">
                              <DiscrepancyStatusBadge status={item.status} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              Purchase order not found
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Log Delivery Dialog */}
      {po && (
        <LogDeliveryDialog
          open={showDeliveryDialog}
          onOpenChange={setShowDeliveryDialog}
          purchaseOrder={po}
          onSuccess={() => {
            queryClient.invalidateQueries({
              queryKey: ["purchase-order-details", purchaseOrderId],
            });
            queryClient.invalidateQueries({
              queryKey: ["discrepancy-report", purchaseOrderId],
            });
            queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
            queryClient.invalidateQueries({ queryKey: ["inventory-items"] });
            queryClient.invalidateQueries({ queryKey: ["inventory-stats"] });
          }}
        />
      )}

      {/* Log Payment Dialog */}
      {po && (
        <LogPaymentDialog
          open={showPaymentDialog}
          onOpenChange={setShowPaymentDialog}
          purchaseOrder={po}
          onSuccess={() => {
            queryClient.invalidateQueries({
              queryKey: ["purchase-order-details", purchaseOrderId],
            });
            queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
          }}
        />
      )}
    </>
  );
}

// ============================================================================
// Log Delivery Dialog
// ============================================================================
interface LogDeliveryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purchaseOrder: PurchaseOrderWithDetails;
  onSuccess: () => void;
}

function LogDeliveryDialog({
  open,
  onOpenChange,
  purchaseOrder,
  onSuccess,
}: LogDeliveryDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deliveredBy, setDeliveredBy] = useState("");
  const [notes, setNotes] = useState("");
  const [receivedQuantities, setReceivedQuantities] = useState<
    Record<string, number>
  >({});

  // Initialize quantities from ordered amounts
  useEffect(() => {
    const initial: Record<string, number> = {};
    purchaseOrder.items.forEach((item) => {
      initial[item.id] = item.quantity_ordered;
    });
    setReceivedQuantities(initial);
  }, [purchaseOrder.items]);

  const handleSubmit = async () => {
    setIsSubmitting(true);

    const receivedItems = Object.entries(receivedQuantities).map(
      ([itemId, qty]) => ({
        item_id: itemId,
        quantity_received: qty,
      })
    );

    const result = await LogPurchaseOrderDelivery({
      purchaseOrderId: purchaseOrder.id,
      deliveredBy,
      deliveryNotes: notes,
      receivedItems,
    });

    setIsSubmitting(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success(`Delivery logged for PO #${purchaseOrder.po_number}`);
    onOpenChange(false);
    onSuccess();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/20 border border-blue-500/10">
              <Truck className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <DialogTitle>Log Delivery</DialogTitle>
              <DialogDescription>
                Record received quantities for {purchaseOrder.po_number}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Delivered By */}
          <div className="space-y-2">
            <Label htmlFor="deliveredBy">Delivered By</Label>
            <Input
              id="deliveredBy"
              placeholder="Delivery person's name"
              value={deliveredBy}
              onChange={(e) => setDeliveredBy(e.target.value)}
            />
          </div>

          {/* Items */}
          <div className="space-y-3">
            <Label>Received Quantities</Label>
            <div className="rounded-lg border divide-y">
              <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-muted/50 text-sm font-medium text-muted-foreground">
                <div className="col-span-6">Item</div>
                <div className="col-span-3 text-center">Ordered</div>
                <div className="col-span-3 text-center">Received</div>
              </div>
              {purchaseOrder.items.map((item) => (
                <div
                  key={item.id}
                  className="grid grid-cols-12 gap-2 px-4 py-3 items-center"
                >
                  <div className="col-span-6">
                    <p className="font-medium">
                      {item.item_name || item.inventory_item?.name || "Unknown"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      ${item.unit_cost.toFixed(2)} each
                    </p>
                  </div>
                  <div className="col-span-3 text-center">
                    {item.quantity_ordered}{" "}
                    {item.item_unit_type || item.inventory_item?.unit_type}
                  </div>
                  <div className="col-span-3">
                    <Input
                      type="number"
                      min={0}
                      max={item.quantity_ordered * 2}
                      value={receivedQuantities[item.id] || 0}
                      onChange={(e) =>
                        setReceivedQuantities({
                          ...receivedQuantities,
                          [item.id]: parseFloat(e.target.value) || 0,
                        })
                      }
                      className="text-center h-8"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="deliveryNotes">Notes (Optional)</Label>
            <Textarea
              id="deliveryNotes"
              placeholder="Any notes about the delivery..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="gap-2"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Log Goods Received
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Log Payment Dialog
// ============================================================================
interface LogPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purchaseOrder: PurchaseOrderWithDetails;
  onSuccess: () => void;
}

function LogPaymentDialog({
  open,
  onOpenChange,
  purchaseOrder,
  onSuccess,
}: LogPaymentDialogProps) {
  // Calculate billable total based on received quantities
  const receivedTotal = purchaseOrder.items.reduce(
    (sum, item) => sum + item.quantity_received * item.unit_cost,
    0
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<
    "card" | "cash" | "check" | "bank_transfer"
  >("card");
  const [cardLastFour, setCardLastFour] = useState("");
  // Default to received total if available, otherwise original total
  const [amount, setAmount] = useState(
    receivedTotal > 0 ? receivedTotal : purchaseOrder.total_amount
  );
  const [paidTo, setPaidTo] = useState("");
  const [notes, setNotes] = useState("");

  const handleSubmit = async () => {
    if (paymentMethod === "card" && cardLastFour.length !== 4) {
      toast.error("Please enter the last 4 digits of the card");
      return;
    }

    setIsSubmitting(true);

    const result = await LogPurchaseOrderPayment({
      purchaseOrderId: purchaseOrder.id,
      paymentMethod,
      cardLastFour: paymentMethod === "card" ? cardLastFour : undefined,
      amount,
      paidTo,
      notes,
    });

    setIsSubmitting(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success(`Payment logged for PO #${purchaseOrder.po_number}`);
    onOpenChange(false);
    onSuccess();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/10">
              <DollarSign className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <DialogTitle>Log Payment</DialogTitle>
              <DialogDescription>
                Record payment for {purchaseOrder.po_number}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Payment Method Toggle */}
          <div className="space-y-2">
            <Label>Method</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={paymentMethod === "card" ? "default" : "outline"}
                onClick={() => setPaymentMethod("card")}
                className="gap-2"
              >
                <CreditCard className="h-4 w-4" />
                Card
              </Button>
              <Button
                type="button"
                variant={paymentMethod === "cash" ? "default" : "outline"}
                onClick={() => setPaymentMethod("cash")}
                className="gap-2"
              >
                <DollarSign className="h-4 w-4" />
                Cash
              </Button>
            </div>
          </div>

          {/* Card Last 4 */}
          {paymentMethod === "card" && (
            <div className="space-y-2">
              <Label htmlFor="cardLastFour">Card Last 4</Label>
              <Input
                id="cardLastFour"
                placeholder="1234"
                maxLength={4}
                value={cardLastFour}
                onChange={(e) =>
                  setCardLastFour(e.target.value.replace(/\D/g, ""))
                }
              />
            </div>
          )}

          {/* Amount */}
          <div className="space-y-2">
            <Label htmlFor="amount">Amount</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                $
              </span>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min={0}
                className="pl-7"
                value={amount}
                onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground px-1">
              <span>
                Original PO Total: ${purchaseOrder.total_amount.toFixed(2)}
              </span>
              {receivedTotal !== purchaseOrder.total_amount && (
                <span className="font-medium text-blue-600">
                  Billable (Received): ${receivedTotal.toFixed(2)}
                </span>
              )}
            </div>
          </div>

          {/* Vendor (read-only) */}
          <div className="space-y-2">
            <Label>Vendor</Label>
            <div className="px-3 py-2 bg-muted/50 rounded-md text-sm">
              {purchaseOrder.vendor?.name || "Unknown Vendor"}
            </div>
          </div>

          {/* Paid To */}
          <div className="space-y-2">
            <Label htmlFor="paidTo">Paid To</Label>
            <Input
              id="paidTo"
              placeholder="Recipient's name"
              value={paidTo}
              onChange={(e) => setPaidTo(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="gap-2"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
