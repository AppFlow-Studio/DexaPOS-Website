"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { GetOrderDetails } from "../../actions/order";
import { OrderStatusBadge } from "@/components/dashboard/orders/OrderStatusBadge";
import { PaymentStatusBadge } from "@/components/dashboard/orders/PaymentStatusBadge";
import { OrderStatusTimeline } from "@/components/dashboard/orders/OrderStatusTimeline";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Calendar,
  User,
  Phone,
  Utensils,
  ShoppingBag,
  Truck,
  Globe,
  ChefHat,
  Printer,
  X,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  DollarSign,
  MapPin,
  Clock,
  Hash,
  Store,
} from "lucide-react";
import {
  Order,
  OrderItem,
  OrderPayment,
  OrderPaymentItem,
  OrderResponse,
  OrderItemModifier,
  OrderStatusHistory,
  TableSessionWithEvents,
} from "@/types/order-management";

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

// Get order type color
function getOrderTypeColor(type: string) {
  const colors: Record<string, string> = {
    dine_in: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    takeout:
      "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    delivery:
      "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
    online:
      "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    catering:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  };
  return (
    colors[type] ||
    "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400"
  );
}

// Payment Card with collapsible item attribution
function PaymentCard({ payment }: { payment: OrderPayment }) {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const paymentItems = payment.order_payment_items || [];
  const hasItems = paymentItems.length > 0;

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
          "flex items-center justify-between p-4",
          hasItems && "cursor-pointer hover:bg-muted/50 transition-colors"
        )}
        onClick={() => hasItems && setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
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
            <p className="font-medium capitalize">{paymentMethod}</p>
            <p className="text-sm text-muted-foreground">{paymentDate}</p>
          </div>
        </div>
        <div className="text-right">
          {payment.status && <PaymentStatusBadge status={payment.status} />}
          <p className="font-semibold mt-1">{formatCurrency(paymentAmount)}</p>
        </div>
      </div>

      {/* Collapsible Item Attribution */}
      {isExpanded && (
        <div className="border-t bg-muted/30 px-4 py-3">
          <p className="text-xs font-medium text-muted-foreground mb-2">
            This payment covered:
          </p>
          {hasItems ? (
            <div className="space-y-2">
              {paymentItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between text-sm"
                >
                  <span>
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
              {/* Tax Row */}
              {paymentItems.some((item) => Number(item.tax_paid) > 0) && (
                <div className="flex items-center justify-between text-sm border-t pt-2 mt-2">
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
            <p className="text-sm text-muted-foreground italic">
              No item-level attribution available
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function OrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params.orderId as string;

  const { data: orderDetails, isLoading } = useQuery({
    queryKey: ["order-details", orderId],
    queryFn: async () => {
      try {
        const details = await GetOrderDetails(orderId);
        return details;
      } catch (error) {
        console.error("Error fetching order details:", error);
        throw error;
      }
    },
    enabled: !!orderId,
  });

  // Extract order data from OrderResponse structure
  const order = orderDetails as OrderResponse | null;
  const items: (OrderItem & { order_item_modifiers?: OrderItemModifier[] })[] =
    orderDetails?.order_items || [];
  const payments: OrderPayment[] = orderDetails?.order_payments || [];
  const statusHistory: OrderStatusHistory[] =
    orderDetails?.order_status_history || [];
  const tableSessions: TableSessionWithEvents[] =
    orderDetails?.table_sessions || [];

  if (isLoading) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-8 w-64" />
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          <div className="md:col-span-2 space-y-6">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
          <div className="space-y-6">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Orders
        </Button>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Order not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Calculate dual pricing values
  const cardSubtotal = Number(order.card_subtotal) || order.subtotal;
  const cashSubtotal = Number(order.cash_subtotal) || order.subtotal;
  const cardTax =
    Number(order.card_tax_amount) || Number(order.tax_amount) || 0;
  const cashTax =
    Number(order.cash_tax_amount) || Number(order.tax_amount) || 0;
  const cardTotal = Number(order.card_total) || order.total_amount;
  const cashTotal = Number(order.cash_total) || order.total_amount;
  const hasDualPricing = cardSubtotal !== cashSubtotal;
  const totalSavings = hasDualPricing ? cardTotal - cashTotal : 0;
  const isMixedPayment = order.payment_pricing_mode === "mixed";

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
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">
                Order #{order.display_number || order.order_number}
              </h1>
              <OrderStatusBadge status={order.status} />
            </div>
            <div className="flex items-center gap-4 text-muted-foreground mt-1">
              <span className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4" />
                {formatDate(order.created_at)}
              </span>
              {order.location_id && (
                <span className="flex items-center gap-1.5">
                  <Store className="h-4 w-4" />
                  Location
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Printer className="h-4 w-4 mr-2" />
            Print Receipt
          </Button>
          {order.status !== "void" && order.status !== "cancelled" && (
            <>
              <Button variant="outline" size="sm">
                <RotateCcw className="h-4 w-4 mr-2" />
                Refund
              </Button>
              <Button variant="destructive" size="sm">
                <X className="h-4 w-4 mr-2" />
                Void
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Main Content */}
        <div className="md:col-span-2 space-y-6">
          {/* Order Type & Quick Info */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "p-2.5 rounded-lg",
                      getOrderTypeColor(order.order_type)
                    )}
                  >
                    {getOrderTypeIcon(order.order_type)}
                  </div>
                  <div>
                    <p className="font-semibold capitalize">
                      {order.order_type.replace("_", " ")}
                    </p>
                    <p className="text-sm text-muted-foreground">Order Type</p>
                  </div>
                </div>
                {order.table_number && (
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-lg bg-muted">
                      <Utensils className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-semibold">
                        Table {order.table_number}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Table Number
                      </p>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-muted">
                    <Hash className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-semibold">{items.length}</p>
                    <p className="text-sm text-muted-foreground">Items</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Customer Information */}
          {(order.customer_name || order.customer_phone) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Customer Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-start gap-6 flex-wrap">
                  {order.customer_name && (
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{order.customer_name}</span>
                    </div>
                  )}
                  {order.customer_phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <span>{order.customer_phone}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Order Items */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Order Items</CardTitle>
              <CardDescription>
                {items.filter((i) => !i.is_voided).length} active items •{" "}
                {items.filter((i) => i.is_voided).length > 0 &&
                  `${items.filter((i) => i.is_voided).length} voided`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {items.length > 0 ? (
                <div className="space-y-3">
                  {items.map((item) => {
                    const discountAmount = Number(item.discount_amount) || 0;
                    const hasDiscount = discountAmount > 0;
                    const isVoided = item.is_voided;

                    const safeQuantity = Number(item.quantity) || 1;
                    const safeUnitPrice = Number(item.unit_price) || 0;
                    const safeSubtotal = Number(item.subtotal) || 0;
                    const safePreDiscountSubtotal =
                      Number(item.pre_discount_subtotal) || 0;

                    return (
                      <div
                        key={item.id}
                        className={cn(
                          "flex items-start justify-between rounded-lg border p-4",
                          isVoided && "bg-muted/50 border-muted"
                        )}
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                "font-medium",
                                isVoided && "text-muted-foreground line-through"
                              )}
                            >
                              {item.item_name}
                            </span>
                            {isVoided && (
                              <Badge variant="destructive" className="text-xs">
                                Voided
                              </Badge>
                            )}
                            {hasDiscount && !isVoided && (
                              <Badge
                                variant="secondary"
                                className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                              >
                                Discounted
                              </Badge>
                            )}
                          </div>
                          {item.item_description && (
                            <p
                              className={cn(
                                "text-sm text-muted-foreground mt-1",
                                isVoided && "line-through"
                              )}
                            >
                              {item.item_description}
                            </p>
                          )}
                          {item.selected_size_name && (
                            <p
                              className={cn(
                                "text-sm text-muted-foreground",
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
                                      "text-sm text-muted-foreground pl-3 border-l-2 border-muted",
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
                                "text-sm text-muted-foreground italic mt-1",
                                isVoided && "line-through"
                              )}
                            >
                              Note: {item.special_instructions}
                            </p>
                          )}

                          {/* Quantity & Unit Price */}
                          <p
                            className={cn(
                              "text-sm text-muted-foreground mt-2",
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

                          {/* Discount Details */}
                          {hasDiscount && !isVoided && (
                            <div className="flex items-center gap-1.5 mt-2">
                              <span className="inline-flex items-center text-sm font-medium text-green-600 dark:text-green-400">
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
                              <p className="text-sm text-muted-foreground line-through">
                                {formatCurrency(safePreDiscountSubtotal)}
                              </p>
                              <p className="font-semibold text-green-600 dark:text-green-400">
                                {formatCurrency(safeSubtotal)}
                              </p>
                            </div>
                          ) : (
                            <p
                              className={cn(
                                "font-semibold",
                                isVoided && "text-muted-foreground line-through"
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
                <p className="text-sm text-muted-foreground">No items found</p>
              )}
            </CardContent>
          </Card>

          {/* Payment History */}
          {payments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Payment History</CardTitle>
                <CardDescription>
                  {payments.length} payment{payments.length > 1 ? "s" : ""} •
                  Click to see item attribution
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {payments.map((payment) => (
                    <PaymentCard key={payment.id} payment={payment} />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Order Status Timeline */}
          {(statusHistory.length > 0 ||
            tableSessions.length > 0 ||
            order.created_at) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Order Timeline</CardTitle>
                <CardDescription>Track the order's journey</CardDescription>
              </CardHeader>
              <CardContent>
                <OrderStatusTimeline
                  statusHistory={statusHistory}
                  currentStatus={order.status}
                  createdAt={order.created_at}
                  tableSessions={tableSessions}
                />
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Payment Status */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Payment Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <PaymentStatusBadge status={order.payment_status} />
              <Separator />
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total</span>
                  <span className="font-semibold text-lg">
                    {formatCurrency(order.total_amount)}
                  </span>
                </div>
                {totalPaid > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Amount Paid</span>
                    <span className="text-green-600 font-medium">
                      {formatCurrency(totalPaid)}
                    </span>
                  </div>
                )}
                {Number(order.amount_due) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Amount Due</span>
                    <span className="text-amber-600 font-medium">
                      {formatCurrency(Number(order.amount_due))}
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Pricing Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pricing Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
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
                      <div className="p-3 rounded-md bg-muted/50 border">
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
                            <span className="text-muted-foreground">Tax</span>
                            <span>{formatCurrency(cardTax)}</span>
                          </div>
                          <div className="flex justify-between text-xs font-medium border-t pt-1 mt-1">
                            <span>Total</span>
                            <span>{formatCurrency(cardTotal)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Cash Pricing Column */}
                      <div className="p-3 rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
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
                            <span className="text-muted-foreground">Tax</span>
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
                        <span className="text-muted-foreground">Subtotal</span>
                        <span>{formatCurrency(order.subtotal)}</span>
                      </div>
                      {Number(order.tax_amount) > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Tax</span>
                          <span>
                            {formatCurrency(Number(order.tax_amount))}
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
                          Cash{hasDualPricing ? " (discounted rate)" : ""}
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
                    <span className="text-muted-foreground">Card Subtotal</span>
                    <span className="text-muted-foreground line-through">
                      {formatCurrency(cardSubtotal)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Cash Subtotal</span>
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
                  {Number(order.tax_amount) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tax</span>
                      <span>{formatCurrency(Number(order.tax_amount))}</span>
                    </div>
                  )}
                  {Number(order.tip_amount) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tip</span>
                      <span>{formatCurrency(Number(order.tip_amount))}</span>
                    </div>
                  )}
                  {Number(order.discount_amount) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Discount</span>
                      <span className="text-green-600">
                        -{formatCurrency(Number(order.discount_amount))}
                      </span>
                    </div>
                  )}
                  <Separator />
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total (Card)</span>
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
                      <span className="text-muted-foreground">Amount Paid</span>
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
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>{formatCurrency(order.subtotal)}</span>
                  </div>
                  {Number(order.tax_amount) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tax</span>
                      <span>{formatCurrency(Number(order.tax_amount))}</span>
                    </div>
                  )}
                  {Number(order.tip_amount) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tip</span>
                      <span>{formatCurrency(Number(order.tip_amount))}</span>
                    </div>
                  )}
                  {Number(order.discount_amount) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Discount</span>
                      <span className="text-green-600">
                        -{formatCurrency(Number(order.discount_amount))}
                      </span>
                    </div>
                  )}
                  {Number(order.service_charge) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Service Charge
                      </span>
                      <span>
                        {formatCurrency(Number(order.service_charge))}
                      </span>
                    </div>
                  )}
                  <Separator />
                  <div className="flex justify-between font-semibold text-base">
                    <span>Total</span>
                    <span>{formatCurrency(order.total_amount)}</span>
                  </div>
                  {totalPaid > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Amount Paid</span>
                      <span className="text-green-600">
                        {formatCurrency(totalPaid)}
                      </span>
                    </div>
                  )}
                  {Number(order.amount_due) > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Amount Due</span>
                      <span className="text-amber-600">
                        {formatCurrency(Number(order.amount_due))}
                      </span>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Special Instructions */}
          {order.special_instructions && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Special Instructions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {order.special_instructions}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Order Meta Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Order Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Order ID</span>
                <span className="font-mono text-xs">
                  {order.id.slice(0, 8)}...
                </span>
              </div>
              {order.order_number && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Order #</span>
                  <span>{order.order_number}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span>{formatDate(order.created_at)}</span>
              </div>
              {order.updated_at && order.updated_at !== order.created_at && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last Updated</span>
                  <span>{formatDate(order.updated_at)}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
