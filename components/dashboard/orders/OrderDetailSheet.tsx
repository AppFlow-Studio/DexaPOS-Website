"use client";

import * as React from "react";
import { useOrganization } from "@clerk/nextjs";
import {
  BottomSheet,
  BottomSheetContent,
  BottomSheetHeader,
  BottomSheetBody,
  BottomSheetFooter,
  BottomSheetTitle,
  BottomSheetDescription,
} from "@/components/ui/bottom-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Order,
  OrderItem,
  OrderPayment,
  OrderPaymentItem,
  OrderItemModifier,
  OrderResponse,
  OrderStatusHistory,
  TableSessionWithEvents,
} from "@/types/order-management";
import { OrderStatusBadge } from "./OrderStatusBadge";
import { PaymentStatusBadge } from "./PaymentStatusBadge";
import { cn } from "@/lib/utils";
import {
  Calendar,
  User,
  Phone,
  Utensils,
  ShoppingBag,
  Truck,
  Globe,
  ChefHat,
  DollarSign,
  Printer,
  X,
  RotateCcw,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { GetOrderDetails } from "@/app/dashboard/actions/order";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, ChevronDown, ChevronUp } from "lucide-react";
import { OrderStatusTimeline } from "./OrderStatusTimeline";
import { ReceiptModal } from "./ReceiptModal";
import { useSelectedLocation } from "@/stores/location-store";

interface OrderDetailSheetProps {
  order: Order | OrderResponse | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Format currency
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

// Format date
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Get order type icon
function getOrderTypeIcon(type: string) {
  const icons: Record<string, React.ReactNode> = {
    dine_in: <Utensils className="h-4 w-4" />,
    takeout: <ShoppingBag className="h-4 w-4" />,
    delivery: <Truck className="h-4 w-4" />,
    online: <Globe className="h-4 w-4" />,
    catering: <ChefHat className="h-4 w-4" />,
  };
  return icons[type] || <ShoppingBag className="h-4 w-4" />;
}

// Payment Card with collapsible item attribution
function PaymentCard({ payment }: { payment: OrderPayment }) {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const paymentItems = payment.order_payment_items || [];
  const hasItems = paymentItems.length > 0;

  // Safe access to payment fields
  const paymentMethod = payment.payment_method?.replace("_", " ") || "Unknown";
  const paymentDate = payment.initiated_at
    ? formatDate(payment.initiated_at)
    : "Date not available";
  const paymentAmount = Number(payment.total_amount) || 0;

  return (
    <div className="rounded-lg border overflow-hidden">
      {/* Payment Header */}
      <div
        className={cn(
          "flex items-center justify-between p-3",
          hasItems && "cursor-pointer hover:bg-muted/50 transition-colors"
        )}
        onClick={() => hasItems && setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          {hasItems && (
            <span className="text-muted-foreground">
              {isExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </span>
          )}
          <div>
            <p className="text-sm font-medium capitalize">{paymentMethod}</p>
            <p className="text-xs text-muted-foreground">{paymentDate}</p>
          </div>
        </div>
        <div className="text-right">
          {payment.status && <PaymentStatusBadge status={payment.status} />}
          <p className="text-sm font-medium mt-1">
            {formatCurrency(paymentAmount)}
          </p>
        </div>
      </div>

      {/* Collapsible Item Attribution */}
      {isExpanded && (
        <div className="border-t bg-muted/30 px-3 py-2">
          <p className="text-xs font-medium text-muted-foreground mb-2">
            This payment covered:
          </p>
          {hasItems ? (
            <div className="space-y-1.5">
              {paymentItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="text-foreground">
                    {item.order_items?.item_name || "Unknown Item"}{" "}
                    <span className="text-muted-foreground">
                      ({item.quantity_paid}×)
                    </span>
                  </span>
                  <span className="font-medium">
                    {formatCurrency(Number(item.subtotal_paid) || 0)}
                  </span>
                </div>
              ))}
              {/* Show tax if any payment item has tax */}
              {paymentItems.some((item) => Number(item.tax_paid) > 0) && (
                <div className="flex items-center justify-between text-xs border-t pt-1.5 mt-1.5">
                  <span className="text-muted-foreground">Tax</span>
                  <span className="font-medium">
                    {formatCurrency(
                      paymentItems.reduce(
                        (sum, item) => sum + (Number(item.tax_paid) || 0),
                        0
                      )
                    )}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              No item-level attribution available
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function OrderDetailSheet({
  order,
  open,
  onOpenChange,
}: OrderDetailSheetProps) {
  const router = useRouter();
  const { organization } = useOrganization();
  const selectedLocation = useSelectedLocation();
  const [isReceiptOpen, setIsReceiptOpen] = React.useState(false);

  // Fetch full order details when sheet opens
  const { data: orderDetails, isLoading } = useQuery({
    queryKey: ["order-details", order?.id, organization?.id],
    queryFn: async () => {
      if (!order) return null;
      try {
        const details = await GetOrderDetails(order.id, organization?.id);
        return details;
      } catch (error) {
        console.error("Error fetching order details:", error);
        return null;
      }
    },
    enabled: !!order && open && !!organization?.id,
  });

  if (!order) return null;

  // Use fetched details if available, otherwise use the passed order
  // If order is OrderResponse, use it directly; if Order, we need to fetch details
  const displayOrder = (orderDetails || order) as OrderResponse;
  const items = (displayOrder.order_items || []) as (OrderItem & {
    order_item_modifiers?: OrderItemModifier[];
  })[];
  const payments = (displayOrder.order_payments || []) as OrderPayment[];
  const statusHistory = (displayOrder.order_status_history ||
    []) as OrderStatusHistory[];
  const tableSessions = (displayOrder.table_sessions ||
    []) as TableSessionWithEvents[];

  const handleViewMoreDetails = () => {
    onOpenChange(false);
    router.push(`/dashboard/orders/${displayOrder.id}`);
  };

  return (
    <>
      <BottomSheet open={open} onOpenChange={onOpenChange}>
        <BottomSheetContent height="95">
          <BottomSheetHeader>
            <div className="flex items-center justify-between">
              <div>
                <BottomSheetTitle>
                  Order #
                  {displayOrder.display_number || displayOrder.order_number}
                </BottomSheetTitle>
                <BottomSheetDescription>
                  {formatDate(displayOrder.created_at)}
                </BottomSheetDescription>
              </div>
              <OrderStatusBadge status={displayOrder.status} />
            </div>
          </BottomSheetHeader>

          <BottomSheetBody>
            <div className="space-y-6">
              {/* Order Info */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  {getOrderTypeIcon(displayOrder.order_type)}
                  <span className="text-sm font-medium capitalize">
                    {displayOrder.order_type.replace("_", " ")}
                  </span>
                </div>

                {/* Customer Info */}
                {(displayOrder.customer_name ||
                  displayOrder.customer_phone ||
                  displayOrder.table_number) && (
                  <div className="space-y-2 rounded-lg border p-4">
                    <h3 className="text-sm font-semibold">
                      Customer Information
                    </h3>
                    <div className="space-y-1.5 text-sm">
                      {displayOrder.customer_name && (
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span>{displayOrder.customer_name}</span>
                        </div>
                      )}
                      {displayOrder.customer_phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          <span>{displayOrder.customer_phone}</span>
                        </div>
                      )}
                      {displayOrder.table_number && (
                        <div className="flex items-center gap-2">
                          <Utensils className="h-4 w-4 text-muted-foreground" />
                          <span>Table {displayOrder.table_number}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Payment Status */}
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Payment Status
                    </p>
                    <PaymentStatusBadge
                      status={displayOrder.payment_status}
                      className="mt-1"
                    />
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Total</p>
                    <p className="text-lg font-bold">
                      {formatCurrency(displayOrder.total_amount)}
                    </p>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Order Items */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold">Order Items</h3>
                {isLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                ) : items.length > 0 ? (
                  <div className="space-y-3">
                    {items.map((item) => {
                      const discountAmount = Number(item.discount_amount) || 0;
                      const hasDiscount = discountAmount > 0;
                      const isVoided = item.is_voided;

                      // Safe number conversions for price fields
                      const safeQuantity = Number(item.quantity) || 1;
                      const safeUnitPrice = Number(item.unit_price) || 0;
                      const safeSubtotal = Number(item.subtotal) || 0;
                      const safePreDiscountSubtotal =
                        Number(item.pre_discount_subtotal) || 0;

                      return (
                        <div
                          key={item.id}
                          className={cn(
                            "flex items-start justify-between rounded-lg border p-3",
                            isVoided && "bg-muted/50 border-muted"
                          )}
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span
                                className={cn(
                                  "font-medium",
                                  isVoided &&
                                    "text-muted-foreground line-through"
                                )}
                              >
                                {item.item_name}
                              </span>
                              {isVoided && (
                                <Badge
                                  variant="destructive"
                                  className="text-xs"
                                >
                                  Voided
                                </Badge>
                              )}
                            </div>
                            {item.item_description && (
                              <p
                                className={cn(
                                  "text-xs text-muted-foreground mt-1",
                                  isVoided && "line-through"
                                )}
                              >
                                {item.item_description}
                              </p>
                            )}
                            {item.selected_size_name && (
                              <p
                                className={cn(
                                  "text-xs text-muted-foreground",
                                  isVoided && "line-through"
                                )}
                              >
                                Size: {item.selected_size_name}
                              </p>
                            )}
                            {/* Modifiers */}
                            {item.order_item_modifiers &&
                              item.order_item_modifiers.length > 0 && (
                                <div className="mt-2 space-y-1">
                                  {item.order_item_modifiers.map((modifier) => (
                                    <div
                                      key={modifier.id}
                                      className={cn(
                                        "text-xs text-muted-foreground pl-3 border-l-2 border-muted",
                                        isVoided && "line-through"
                                      )}
                                    >
                                      {modifier.modifier_group_name}:{" "}
                                      {modifier.modifier_name}
                                      {modifier.quantity > 1 &&
                                        ` (×${modifier.quantity})`}
                                      {modifier.price_modifier > 0 && (
                                        <span className="ml-1">
                                          +
                                          {formatCurrency(
                                            modifier.price_modifier
                                          )}
                                        </span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            {item.special_instructions && (
                              <p
                                className={cn(
                                  "text-xs text-muted-foreground italic mt-1",
                                  isVoided && "line-through"
                                )}
                              >
                                Note: {item.special_instructions}
                              </p>
                            )}

                            {/* Price and Quantity */}
                            <p
                              className={cn(
                                "text-xs text-muted-foreground mt-1",
                                isVoided && "line-through"
                              )}
                            >
                              Qty: {safeQuantity} ×{" "}
                              {hasDiscount && safePreDiscountSubtotal > 0 ? (
                                <>
                                  <span className="line-through mr-1">
                                    {formatCurrency(
                                      safePreDiscountSubtotal / safeQuantity
                                    )}
                                  </span>
                                  {formatCurrency(safeSubtotal / safeQuantity)}
                                </>
                              ) : (
                                formatCurrency(safeUnitPrice)
                              )}
                            </p>

                            {/* Discount Info */}
                            {hasDiscount && !isVoided && (
                              <div className="flex items-center gap-1.5 mt-1.5">
                                <span className="inline-flex items-center text-xs font-medium text-green-600 dark:text-green-400">
                                  <DollarSign className="h-3 w-3 mr-0.5" />-
                                  {formatCurrency(discountAmount)}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {item.discount_type === "percentage" &&
                                  item.discount_value
                                    ? `${item.discount_value}%`
                                    : "Fixed"}
                                </span>
                                {item.discount_source && (
                                  <Badge
                                    variant="secondary"
                                    className="text-[10px] px-1.5 py-0 h-4 capitalize"
                                  >
                                    {item.discount_source.replace("_", " ")}
                                  </Badge>
                                )}
                                {item.discount_name && (
                                  <span className="text-xs text-muted-foreground">
                                    • {item.discount_name}
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Voided item exclusion note */}
                            {isVoided && (
                              <p className="text-xs text-muted-foreground italic mt-1">
                                Excluded from total
                              </p>
                            )}
                          </div>

                          {/* Item Total */}
                          <div className="text-right ml-4">
                            {hasDiscount &&
                            !isVoided &&
                            safePreDiscountSubtotal > 0 ? (
                              <div>
                                <p className="text-xs text-muted-foreground line-through">
                                  {formatCurrency(safePreDiscountSubtotal)}
                                </p>
                                <p className="font-medium text-green-600 dark:text-green-400">
                                  {formatCurrency(safeSubtotal)}
                                </p>
                              </div>
                            ) : (
                              <p
                                className={cn(
                                  "font-medium",
                                  isVoided &&
                                    "text-muted-foreground line-through"
                                )}
                              >
                                {formatCurrency(safeSubtotal)}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No items found
                  </p>
                )}
              </div>

              <Separator />

              {/* Pricing Breakdown */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Pricing Breakdown</h3>
                {(() => {
                  // Get pricing values
                  const cardSubtotal =
                    Number(displayOrder.card_subtotal) || displayOrder.subtotal;
                  const cashSubtotal =
                    Number(displayOrder.cash_subtotal) || displayOrder.subtotal;
                  const cardTax =
                    Number(displayOrder.card_tax_amount) ||
                    Number(displayOrder.tax_amount) ||
                    0;
                  const cashTax =
                    Number(displayOrder.cash_tax_amount) ||
                    Number(displayOrder.tax_amount) ||
                    0;
                  const cardTotal =
                    Number(displayOrder.card_total) ||
                    displayOrder.total_amount;
                  const cashTotal =
                    Number(displayOrder.cash_total) ||
                    displayOrder.total_amount;

                  const hasDualPricing = cardSubtotal !== cashSubtotal;
                  const totalSavings = hasDualPricing
                    ? cardTotal - cashTotal
                    : 0;
                  const isMixedPayment =
                    displayOrder.payment_pricing_mode === "mixed";

                  // Calculate actual payments by method
                  const paidPayments = payments.filter(
                    (p) => p.status === "paid" || p.status === "captured"
                  );
                  const cashPayments = paidPayments
                    .filter((p) => p.payment_method === "cash")
                    .reduce((sum, p) => sum + Number(p.total_amount), 0);
                  const cardPayments = paidPayments
                    .filter((p) => p.payment_method !== "cash")
                    .reduce((sum, p) => sum + Number(p.total_amount), 0);
                  const totalPaid = cashPayments + cardPayments;

                  return (
                    <div className="space-y-3 text-sm">
                      {/* Mixed Payment Mode - Show Payment Breakdown */}
                      {isMixedPayment ? (
                        <>
                          {/* Explanation Badge */}
                          <div className="flex items-center gap-2 p-2 bg-amber-50 dark:bg-amber-950/30 rounded-md border border-amber-200 dark:border-amber-800">
                            <DollarSign className="h-4 w-4 text-amber-600" />
                            <span className="text-xs text-amber-700 dark:text-amber-400">
                              Mixed Payment: Paid with both cash and card
                            </span>
                          </div>

                          {/* Side by Side Comparison - only if prices differ */}
                          {hasDualPricing && (
                            <div className="grid grid-cols-2 gap-3">
                              {/* Card Pricing Column */}
                              <div className="p-2 rounded-md bg-muted/50 border">
                                <p className="text-xs font-medium text-muted-foreground mb-2">
                                  If All Card
                                </p>
                                <div className="space-y-1">
                                  <div className="flex justify-between text-xs">
                                    <span className="text-muted-foreground">
                                      Subtotal
                                    </span>
                                    <span>{formatCurrency(cardSubtotal)}</span>
                                  </div>
                                  <div className="flex justify-between text-xs">
                                    <span className="text-muted-foreground">
                                      Tax
                                    </span>
                                    <span>{formatCurrency(cardTax)}</span>
                                  </div>
                                  <div className="flex justify-between text-xs font-medium border-t pt-1 mt-1">
                                    <span>Total</span>
                                    <span>{formatCurrency(cardTotal)}</span>
                                  </div>
                                </div>
                              </div>

                              {/* Cash Pricing Column */}
                              <div className="p-2 rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
                                <p className="text-xs font-medium text-green-700 dark:text-green-400 mb-2">
                                  If All Cash
                                </p>
                                <div className="space-y-1">
                                  <div className="flex justify-between text-xs">
                                    <span className="text-muted-foreground">
                                      Subtotal
                                    </span>
                                    <span>{formatCurrency(cashSubtotal)}</span>
                                  </div>
                                  <div className="flex justify-between text-xs">
                                    <span className="text-muted-foreground">
                                      Tax
                                    </span>
                                    <span>{formatCurrency(cashTax)}</span>
                                  </div>
                                  <div className="flex justify-between text-xs font-medium text-green-700 dark:text-green-400 border-t pt-1 mt-1">
                                    <span>Total</span>
                                    <span>{formatCurrency(cashTotal)}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Savings Highlight - only if prices differ */}
                          {totalSavings > 0 && (
                            <div className="flex justify-between items-center p-2 bg-green-100 dark:bg-green-900/30 rounded-md">
                              <span className="text-xs font-medium text-green-700 dark:text-green-400">
                                💰 Cash Discount Available
                              </span>
                              <span className="text-sm font-bold text-green-700 dark:text-green-400">
                                -{formatCurrency(totalSavings)}
                              </span>
                            </div>
                          )}

                          {/* Standard pricing info when no dual pricing */}
                          {!hasDualPricing && (
                            <>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">
                                  Subtotal
                                </span>
                                <span>
                                  {formatCurrency(displayOrder.subtotal)}
                                </span>
                              </div>
                              {Number(displayOrder.tax_amount) > 0 && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">
                                    Tax
                                  </span>
                                  <span>
                                    {formatCurrency(
                                      Number(displayOrder.tax_amount)
                                    )}
                                  </span>
                                </div>
                              )}
                            </>
                          )}

                          <Separator />

                          {/* Actual Payments Made */}
                          <div className="space-y-1.5">
                            <p className="text-xs font-medium text-muted-foreground">
                              Actual Payments
                            </p>
                            {cashPayments > 0 && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">
                                  Cash
                                  {hasDualPricing ? " (discounted rate)" : ""}
                                </span>
                                <span
                                  className={
                                    hasDualPricing
                                      ? "text-green-600 dark:text-green-400 font-medium"
                                      : ""
                                  }
                                >
                                  {formatCurrency(cashPayments)}
                                </span>
                              </div>
                            )}
                            {cardPayments > 0 && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">
                                  Card{hasDualPricing ? " (full rate)" : ""}
                                </span>
                                <span>{formatCurrency(cardPayments)}</span>
                              </div>
                            )}
                          </div>

                          <Separator />

                          {/* Final Total */}
                          <div className="flex justify-between font-semibold text-base">
                            <span>Total Paid</span>
                            <span>{formatCurrency(totalPaid)}</span>
                          </div>
                        </>
                      ) : hasDualPricing ? (
                        /* Single Payment Method with Dual Pricing Available */
                        <>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">
                              Card Subtotal
                            </span>
                            <span className="text-muted-foreground ">
                              {formatCurrency(cardSubtotal)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">
                              Cash Subtotal
                            </span>
                            <span>{formatCurrency(cashSubtotal)}</span>
                          </div>
                          {totalSavings > 0 && (
                            <div className="flex justify-between">
                              <span className="text-green-600 dark:text-green-400 font-medium">
                                Cash Savings
                              </span>
                              <span className="text-green-600 dark:text-green-400 font-medium">
                                -{formatCurrency(totalSavings)}
                              </span>
                            </div>
                          )}
                          {Number(displayOrder.tax_amount) > 0 && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Tax</span>
                              <span>
                                {formatCurrency(
                                  Number(displayOrder.tax_amount)
                                )}
                              </span>
                            </div>
                          )}
                          {Number(displayOrder.tip_amount) > 0 && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Tip</span>
                              <span>
                                {formatCurrency(
                                  Number(displayOrder.tip_amount)
                                )}
                              </span>
                            </div>
                          )}
                          {Number(displayOrder.discount_amount) > 0 && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">
                                Discount
                              </span>
                              <span className="text-green-600">
                                -
                                {formatCurrency(
                                  Number(displayOrder.discount_amount)
                                )}
                              </span>
                            </div>
                          )}
                          <Separator />
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">
                              Total (Card)
                            </span>
                            <span className="text-muted-foreground line-through">
                              {formatCurrency(cardTotal)}
                            </span>
                          </div>
                          <div className="flex justify-between font-semibold text-base">
                            <span>Total (Cash)</span>
                            <span>{formatCurrency(cashTotal)}</span>
                          </div>
                          {totalPaid > 0 && (
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">
                                Amount Paid
                              </span>
                              <span className="text-green-600">
                                {formatCurrency(totalPaid)}
                              </span>
                            </div>
                          )}
                        </>
                      ) : (
                        /* Standard Pricing (No Dual Pricing) */
                        <>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">
                              Subtotal
                            </span>
                            <span>{formatCurrency(displayOrder.subtotal)}</span>
                          </div>
                          {Number(displayOrder.tax_amount) > 0 && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Tax</span>
                              <span>
                                {formatCurrency(
                                  Number(displayOrder.tax_amount)
                                )}
                              </span>
                            </div>
                          )}
                          {Number(displayOrder.tip_amount) > 0 && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Tip</span>
                              <span>
                                {formatCurrency(
                                  Number(displayOrder.tip_amount)
                                )}
                              </span>
                            </div>
                          )}
                          {Number(displayOrder.discount_amount) > 0 && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">
                                Discount
                              </span>
                              <span className="text-green-600">
                                -
                                {formatCurrency(
                                  Number(displayOrder.discount_amount)
                                )}
                              </span>
                            </div>
                          )}
                          {Number(displayOrder.service_charge) > 0 && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">
                                Service Charge
                              </span>
                              <span>
                                {formatCurrency(
                                  Number(displayOrder.service_charge)
                                )}
                              </span>
                            </div>
                          )}
                          <Separator />
                          <div className="flex justify-between font-semibold text-base">
                            <span>Total</span>
                            <span>
                              {formatCurrency(displayOrder.total_amount)}
                            </span>
                          </div>
                          {totalPaid > 0 && (
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">
                                Amount Paid
                              </span>
                              <span className="text-green-600">
                                {formatCurrency(totalPaid)}
                              </span>
                            </div>
                          )}
                          {Number(displayOrder.amount_due) > 0 && (
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">
                                Amount Due
                              </span>
                              <span className="text-amber-600">
                                {formatCurrency(
                                  Number(displayOrder.amount_due)
                                )}
                              </span>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Payment History */}
              {payments.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold">Payment History</h3>
                    <div className="space-y-2">
                      {payments.map((payment: OrderPayment) => (
                        <PaymentCard key={payment.id} payment={payment} />
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Special Instructions */}
              {displayOrder.special_instructions && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold">
                      Special Instructions
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {displayOrder.special_instructions}
                    </p>
                  </div>
                </>
              )}

              {/* Order Status Timeline */}
              {(statusHistory.length > 0 ||
                tableSessions.length > 0 ||
                displayOrder.created_at) && (
                <>
                  <Separator />
                  <OrderStatusTimeline
                    statusHistory={statusHistory}
                    currentStatus={displayOrder.status}
                    createdAt={displayOrder.created_at}
                    tableSessions={tableSessions}
                  />
                </>
              )}
            </div>
          </BottomSheetBody>

          <BottomSheetFooter>
            <div className="flex flex-col gap-2 w-full">
              <Button
                variant="default"
                className="w-full"
                size="sm"
                onClick={handleViewMoreDetails}
              >
                View More Details
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  size="sm"
                  onClick={() => setIsReceiptOpen(true)}
                >
                  <Printer className="h-4 w-4 mr-2" />
                  Print Receipt
                </Button>
                {displayOrder.status !== "void" &&
                  displayOrder.status !== "cancelled" && (
                    <>
                      <Button variant="outline" className="flex-1" size="sm">
                        <RotateCcw className="h-4 w-4 mr-2" />
                        Refund
                      </Button>
                      <Button
                        variant="destructive"
                        className="flex-1"
                        size="sm"
                      >
                        <X className="h-4 w-4 mr-2" />
                        Void
                      </Button>
                    </>
                  )}
              </div>
            </div>
          </BottomSheetFooter>
        </BottomSheetContent>
      </BottomSheet>

      {/* Receipt Modal */}
      <ReceiptModal
        order={displayOrder}
        location={selectedLocation}
        open={isReceiptOpen}
        onOpenChange={setIsReceiptOpen}
      />
    </>
  );
}
