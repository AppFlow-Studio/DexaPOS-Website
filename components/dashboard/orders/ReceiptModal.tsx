"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  OrderResponse,
  OrderItem,
  OrderPayment,
  OrderItemModifier,
} from "@/types/order-management";
import { Location } from "@/types/merchant_locations";
import { X, RotateCcw, Ban, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { refundAdminOrder, voidAdminOrder } from "@/app/manage/actions/admin-merchant/transactions";
import { toast } from "sonner";
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

interface ReceiptModalProps {
  order: OrderResponse;
  location: Location | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Format currency
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
}

// Format date for receipt
function formatReceiptDate(dateString: string): { date: string; time: string } {
  const date = new Date(dateString);
  return {
    date: date.toLocaleDateString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
    }),
    time: date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }),
  };
}

// Get payment method display name
function getPaymentMethodName(method: string): string {
  const methods: Record<string, string> = {
    cash: "Cash",
    card_spinapi: "Card",
    card_dvpaylite: "Card",
    card_manual: "Card",
    gift_card: "Gift Card",
    house_account: "House Account",
    external: "External",
  };
  return methods[method] || method.replace("_", " ");
}

// Torn edge SVG for top
function TornEdgeTop() {
  return (
    <svg
      className="absolute -top-2 left-0 w-full h-3 text-[#faf9f6] dark:text-zinc-900"
      viewBox="0 0 400 12"
      preserveAspectRatio="none"
    >
      <path
        d="M0,12 L0,6 Q10,8 20,6 T40,6 T60,6 T80,6 T100,6 T120,6 T140,6 T160,6 T180,6 T200,6 T220,6 T240,6 T260,6 T280,6 T300,6 T320,6 T340,6 T360,6 T380,6 T400,6 L400,12 Z"
        fill="currentColor"
      />
    </svg>
  );
}

// Torn edge SVG for bottom
function TornEdgeBottom() {
  return (
    <svg
      className="absolute -bottom-2 left-0 w-full h-3 text-[#faf9f6] dark:text-zinc-900"
      viewBox="0 0 400 12"
      preserveAspectRatio="none"
    >
      <path
        d="M0,0 L0,6 Q10,4 20,6 T40,6 T60,6 T80,6 T100,6 T120,6 T140,6 T160,6 T180,6 T200,6 T220,6 T240,6 T260,6 T280,6 T300,6 T320,6 T340,6 T360,6 T380,6 T400,6 L400,0 Z"
        fill="currentColor"
      />
    </svg>
  );
}

// Dotted separator line
function DottedLine() {
  return (
    <div className="border-b border-dashed border-zinc-400 dark:border-zinc-600 my-2" />
  );
}

// Double line separator
function DoubleLine() {
  return (
    <div className="my-2">
      <div className="border-b border-zinc-400 dark:border-zinc-600" />
      <div className="border-b border-zinc-400 dark:border-zinc-600 mt-0.5" />
    </div>
  );
}

export function ReceiptModal({
  order,
  location,
  open,
  onOpenChange,
  showAdminActions = false,
  onOrderUpdate,
}: ReceiptModalProps & { showAdminActions?: boolean; onOrderUpdate?: () => void }) {
  const [isRefunding, setIsRefunding] = React.useState(false);
  const [isVoiding, setIsVoiding] = React.useState(false);
  const [confirmRefundOpen, setConfirmRefundOpen] = React.useState(false);
  const [confirmVoidOpen, setConfirmVoidOpen] = React.useState(false);

  const handleRefund = async () => {
    setIsRefunding(true);
    try {
      const result = await refundAdminOrder(order.merchant_id, order.id);
      if (result.success) {
        toast.success("Order refunded successfully");
        onOrderUpdate?.();
        onOpenChange(false);
      } else {
        toast.error(result.error || "Failed to refund order");
      }
    } catch (error) {
      toast.error("An unexpected error occurred");
    } finally {
      setIsRefunding(false);
      setConfirmRefundOpen(false);
    }
  };

  const handleVoid = async () => {
    setIsVoiding(true);
    try {
      const result = await voidAdminOrder(order.merchant_id, order.id);
      if (result.success) {
        toast.success("Order voided successfully");
        onOrderUpdate?.();
        onOpenChange(false);
      } else {
        toast.error(result.error || "Failed to void order");
      }
    } catch (error) {
      toast.error("An unexpected error occurred");
    } finally {
      setIsVoiding(false);
      setConfirmVoidOpen(false);
    }
  };

  const items = (order.order_items || []) as (OrderItem & {
    order_item_modifiers?: OrderItemModifier[];
  })[];
  const payments = (order.order_payments || []) as OrderPayment[];
  const { date, time } = formatReceiptDate(order.created_at);

  // Get completed payments only
  const completedPayments = payments.filter(
    (p) => p.status === "captured" || p.status === "paid"
  );

  // Build location address
  const locationAddress = location
    ? [
        location.address_line1,
        location.address_line2,
        `${location.city}, ${location.state} ${location.postal_code}`,
      ]
        .filter(Boolean)
        .join("\n")
    : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md p-0 gap-0 bg-transparent border-none shadow-none overflow-visible"
        showCloseButton={false}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Receipt Preview</DialogTitle>
        </DialogHeader>

        {/* Receipt Container with paper effect */}
        <div className="relative">
          {/* Paper curl shadow effect */}
          <div
            className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/10 rounded-sm pointer-events-none"
            style={{
              transform: "perspective(1000px) rotateX(2deg)",
              transformOrigin: "top center",
            }}
          />

          {/* Receipt Paper */}
          <div
            className={cn(
              "relative mx-auto w-full max-w-[350px]",
              "bg-[#faf9f6] dark:bg-zinc-900",
              "font-mono text-xs leading-relaxed",
              "text-zinc-800 dark:text-zinc-200",
              "px-4 py-6",
              "shadow-lg",
              // Paper texture effect
              "before:absolute before:inset-0 before:bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPjxyZWN0IHdpZHRoPSI0IiBoZWlnaHQ9IjQiIGZpbGw9IiNmYWY5ZjYiLz48cmVjdCB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSJyZ2JhKDAsMCwwLDAuMDIpIi8+PC9zdmc+')] before:opacity-50 before:pointer-events-none"
            )}
          >
            <TornEdgeTop />
            <TornEdgeBottom />

            {/* Business Header */}
            <div className="receipt-header text-center mb-4 relative z-10">
              <h2 className="business-name text-base font-semibold tracking-tight">
                {location?.name || "Restaurant Name"}
              </h2>
              {locationAddress && (
                <p className="business-address text-[10px] text-zinc-600 dark:text-zinc-400 whitespace-pre-line mt-1">
                  {locationAddress}
                </p>
              )}
              {location?.phone && (
                <p className="text-[10px] text-zinc-600 dark:text-zinc-400">
                  {location.phone}
                </p>
              )}
            </div>

            <DottedLine />

            {/* Order Info */}
            <div className="order-info space-y-1 relative z-10">
              <div className="order-info-row flex justify-between">
                <span>Order #:</span>
                <span className="font-medium">
                  {order.display_number || order.order_number}
                </span>
              </div>
              <div className="order-info-row flex justify-between">
                <span>Date:</span>
                <span>{date}</span>
              </div>
              <div className="order-info-row flex justify-between">
                <span>Time:</span>
                <span>{time}</span>
              </div>
              <div className="order-info-row flex justify-between">
                <span>Type:</span>
                <span className="capitalize">
                  {order.order_type.replace("_", " ")}
                </span>
              </div>
              {order.table_number && (
                <div className="order-info-row flex justify-between">
                  <span>Table:</span>
                  <span>{order.table_number}</span>
                </div>
              )}
              {order.customer_name && (
                <div className="order-info-row flex justify-between">
                  <span>Customer:</span>
                  <span>{order.customer_name}</span>
                </div>
              )}
            </div>

            <DoubleLine />

            {/* Items */}
            <div className="items-section relative z-10">
              {items.map((item) => (
                <div key={item.id} className="item-row mb-2">
                  <div className="item-main flex justify-between">
                    <span className="item-name flex-1 pr-2">
                      {item.quantity > 1 && `${item.quantity}x `}
                      {item.item_name}
                      {item.is_voided && (
                        <span className="text-red-500 ml-1">(VOID)</span>
                      )}
                    </span>
                    <span className="item-price whitespace-nowrap">
                      {formatCurrency(item.subtotal)}
                    </span>
                  </div>
                  {item.selected_size_name && (
                    <div className="item-modifier text-[10px] pl-3 text-zinc-500 dark:text-zinc-400">
                      Size: {item.selected_size_name}
                    </div>
                  )}
                  {item.order_item_modifiers &&
                    item.order_item_modifiers.length > 0 &&
                    item.order_item_modifiers.map((mod) => (
                      <div
                        key={mod.id}
                        className="item-modifier text-[10px] pl-3 text-zinc-500 dark:text-zinc-400 flex justify-between"
                      >
                        <span>
                          + {mod.modifier_name}
                          {mod.quantity > 1 && ` (×${mod.quantity})`}
                        </span>
                        {mod.price_modifier > 0 && (
                          <span>
                            {formatCurrency(mod.price_modifier * mod.quantity)}
                          </span>
                        )}
                      </div>
                    ))}
                  {item.special_instructions && (
                    <div className="item-modifier text-[10px] pl-3 text-zinc-500 dark:text-zinc-400 italic">
                      Note: {item.special_instructions}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <DottedLine />

            {/* Totals */}
            <div className="totals-section space-y-1 relative z-10">
              <div className="totals-row flex justify-between">
                <span>Subtotal</span>
                <span>{formatCurrency(order.subtotal)}</span>
              </div>
              {order.tax_amount > 0 && (
                <div className="totals-row flex justify-between">
                  <span>Tax</span>
                  <span>{formatCurrency(order.tax_amount)}</span>
                </div>
              )}
              {order.discount_amount > 0 && (
                <div className="totals-row flex justify-between text-green-600 dark:text-green-400">
                  <span>Discount</span>
                  <span>-{formatCurrency(order.discount_amount)}</span>
                </div>
              )}
              {order.service_charge > 0 && (
                <div className="totals-row flex justify-between">
                  <span>Service Charge</span>
                  <span>{formatCurrency(order.service_charge)}</span>
                </div>
              )}
              {order.tip_amount > 0 && (
                <div className="totals-row flex justify-between">
                  <span>Tip</span>
                  <span>{formatCurrency(order.tip_amount)}</span>
                </div>
              )}
              <div className="totals-row grand-total flex justify-between font-semibold text-sm pt-2 border-t border-zinc-300 dark:border-zinc-700">
                <span>TOTAL</span>
                <span>{formatCurrency(order.total_amount)}</span>
              </div>
            </div>

            {/* Payments */}
            {completedPayments.length > 0 && (
              <>
                <DottedLine />
                <div className="payment-section relative z-10">
                  <div className="text-center text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">
                    Payment
                  </div>
                  {completedPayments.map((payment) => (
                    <div key={payment.id} className="flex justify-between">
                      <span>
                        {getPaymentMethodName(payment.payment_method)}
                        {payment.card_last_four &&
                          ` ****${payment.card_last_four}`}
                      </span>
                      <span>{formatCurrency(payment.total_amount)}</span>
                    </div>
                  ))}
                  {order.amount_paid > 0 && (
                    <div className="flex justify-between mt-1 pt-1 border-t border-dashed border-zinc-300 dark:border-zinc-600">
                      <span>Amount Paid</span>
                      <span>{formatCurrency(order.amount_paid)}</span>
                    </div>
                  )}
                  {order.amount_due > 0 && (
                    <div className="flex justify-between text-amber-600 dark:text-amber-400">
                      <span>Amount Due</span>
                      <span>{formatCurrency(order.amount_due)}</span>
                    </div>
                  )}
                </div>
              </>
            )}

            <DoubleLine />

            {/* Footer */}
            <div className="footer text-center relative z-10">
              <p className="footer-thanks font-medium">Thank You!</p>
              <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
                We appreciate your business
              </p>
              <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-2">
                {new Date().toLocaleDateString("en-US", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 justify-center mt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="bg-white dark:bg-zinc-800"
          >
            <X className="h-4 w-4 mr-2" />
            Close
          </Button>
          {showAdminActions && order.status !== 'refunded' && order.status !== 'void' && (
            <>
              <Button 
                variant="outline" 
                size="sm" 
                className="text-amber-600 border-amber-200 hover:bg-amber-50"
                onClick={() => setConfirmRefundOpen(true)}
                disabled={isRefunding || isVoiding}
              >
                {isRefunding ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-2" />}
                Refund
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="text-red-600 border-red-200 hover:bg-red-50"
                onClick={() => setConfirmVoidOpen(true)}
                disabled={isRefunding || isVoiding}
              >
                {isVoiding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4 mr-2" />}
                Void
              </Button>
            </>
          )}
        </div>

        {/* Confirmation Dialogs */}
        <AlertDialog open={confirmRefundOpen} onOpenChange={setConfirmRefundOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm Refund</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to refund this order? This will mark the order and all payments as refunded.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleRefund} className="bg-amber-600 hover:bg-amber-700">
                Refund Order
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={confirmVoidOpen} onOpenChange={setConfirmVoidOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm Void</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to void this order? This will cancel any pending payments and invalidate the order.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleVoid} className="bg-red-600 hover:bg-red-700">
                Void Order
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
