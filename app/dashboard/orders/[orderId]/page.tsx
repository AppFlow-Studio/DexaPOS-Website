"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useClerkOrgId } from "../../hooks/useLocationScoped";
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
import { GetOrderDetails, RefundOrder, VoidOrder } from "../../actions/order";
import { GetOrderFullHistory } from "../../actions/order-full-history";
import { OrderStatusBadge } from "@/components/dashboard/orders/OrderStatusBadge";
import { PaymentStatusBadge } from "@/components/dashboard/orders/PaymentStatusBadge";
import { OrderStatusTimeline } from "@/components/dashboard/orders/OrderStatusTimeline";
import { RichTimeline } from "@/components/dashboard/orders/RichTimeline";
import { KitchenActivitySection } from "@/components/dashboard/orders/KitchenActivitySection";
import { cn } from "@/lib/utils";
import { orderTypeLabel } from "@/lib/constants/order-type";
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
  Loader2,
} from "lucide-react";
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
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
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
import { OrderFullHistory } from "@/types/order-full-history";
import { getOrderBreakdown } from "@/lib/orders/order-breakdown";

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
  const queryClient = useQueryClient();
  const orderId = params.orderId as string;
  const clerkOrgId = useClerkOrgId();
  const [confirmRefundOpen, setConfirmRefundOpen] = React.useState(false);
  const [confirmVoidOpen, setConfirmVoidOpen] = React.useState(false);
  const [isRefunding, setIsRefunding] = React.useState(false);
  const [isVoiding, setIsVoiding] = React.useState(false);

  const handleRefund = async () => {
    if (!clerkOrgId || !orderId) return;
    setIsRefunding(true);
    try {
      const result = await RefundOrder(clerkOrgId, orderId);
      if (result.success) {
        toast.success("Order refunded successfully");
        queryClient.invalidateQueries({ queryKey: ["order-details", orderId] });
        queryClient.invalidateQueries({ queryKey: ["orders"] });
        setConfirmRefundOpen(false);
      } else {
        toast.error(result.error || "Failed to refund order");
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setIsRefunding(false);
    }
  };

  const handleVoid = async () => {
    if (!clerkOrgId || !orderId) return;
    setIsVoiding(true);
    try {
      const result = await VoidOrder(clerkOrgId, orderId);
      if (result.success) {
        toast.success("Order voided successfully");
        queryClient.invalidateQueries({ queryKey: ["order-details", orderId] });
        queryClient.invalidateQueries({ queryKey: ["orders"] });
        setConfirmVoidOpen(false);
      } else {
        toast.error(result.error || "Failed to void order");
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setIsVoiding(false);
    }
  };

  React.useEffect(() => {
    if (orderId) {
      console.log("[OrderDetailPage] Loading order:", orderId, "Org:", clerkOrgId);
    }
  }, [orderId, clerkOrgId]);

  const { data: orderDetails, isLoading, error: orderError } = useQuery({
    queryKey: ["order-details", orderId, clerkOrgId],
    queryFn: async () => {
      try {
        console.log("[OrderDetailPage] Fetching order:", orderId, "Org:", clerkOrgId);
        const details = await GetOrderDetails(orderId, clerkOrgId);
        console.log("[OrderDetailPage] Order details:", details);
        return details;
      } catch (error) {
        console.error("[OrderDetailPage] Error fetching order details:", error);
        throw error;
      }
    },
    enabled: !!orderId && !!clerkOrgId,
  });

  const { data: orderFullHistory, isLoading: isLoadingFullHistory } = useQuery({
    queryKey: ["order-full-history", orderId],
    queryFn: async () => {
      try {
        const history = await GetOrderFullHistory(orderId);
        return history;
      } catch (error) {
        console.error("Error fetching order full history:", error);
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

  // Show the skeleton while the query is fetching OR while the merchant org is
  // still resolving (clerkOrgId is "" until useUserInfo loads, which keeps the
  // query disabled). Without this guard the page would flash "Order not found".
  if (isLoading || !clerkOrgId) {
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
          <CardContent className="py-12">
            <div className="text-center space-y-4">
              <p className="text-muted-foreground text-lg font-medium">Order not found</p>
              <p className="text-xs text-muted-foreground">
                Order ID: <code className="bg-muted px-2 py-1 rounded">{orderId}</code>
              </p>
              {orderError && (
                <p className="text-xs text-red-600">
                  Error: {orderError instanceof Error ? orderError.message : "Unknown error"}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {isLoading ? "Loading..." : "The order does not exist or you don't have access to it."}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Single source of truth: one consistent pricing track per render (foots).
  const breakdown = getOrderBreakdown(order, payments);
  const primaryLane = breakdown.primary;
  const laneLabel = breakdown.display === "cash" ? "Cash" : "Card";
  const cashSavings = breakdown.card.total - breakdown.cash.total;
  const isMixedPayment =
    order.payment_pricing_mode === "mixed" || breakdown.charged === "mixed";

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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <Button variant="ghost" size="icon" className="shrink-0 mt-0.5" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
                Order #{order.display_number || order.order_number}
              </h1>
              <OrderStatusBadge status={order.status} />
            </div>
            <div className="flex items-center gap-3 text-muted-foreground mt-1 flex-wrap text-sm">
              <span className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4 shrink-0" />
                {formatDate(order.created_at)}
              </span>
              {order.location_id && (
                <span className="flex items-center gap-1.5">
                  <Store className="h-4 w-4 shrink-0" />
                  Location
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap shrink-0 pl-12 sm:pl-0">
          <Button variant="outline" size="sm">
            <Printer className="h-4 w-4 mr-1.5" />
            Print Receipt
          </Button>
          {order.status !== "void" && order.status !== "voided" && order.status !== "cancelled" && order.status !== "refunded" && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmRefundOpen(true)}
                disabled={isRefunding || isVoiding}
              >
                {isRefunding ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-1.5" />}
                Refund
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setConfirmVoidOpen(true)}
                disabled={isRefunding || isVoiding}
              >
                {isVoiding ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <X className="h-4 w-4 mr-1.5" />}
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
                    <p className="font-semibold">
                      {orderTypeLabel(order.order_type)}
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

          {/* Kitchen Activity - per-item KDS lifecycle */}
          {orderFullHistory && (
            <KitchenActivitySection items={orderFullHistory.items} />
          )}

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

          {/* Complete Order Timeline - TICKET DM-011-01 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Complete Timeline</CardTitle>
              <CardDescription>
                Full order history including items, payments, refunds, and more
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingFullHistory ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Skeleton className="h-64 w-full" />
                </div>
              ) : orderFullHistory ? (
                <RichTimeline events={orderFullHistory.timeline} />
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Unable to load timeline
                </p>
              )}
            </CardContent>
          </Card>

          {/* Refunds Section - TICKET DM-011-01 */}
          {orderFullHistory && orderFullHistory.reversals && orderFullHistory.reversals.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Refunds & Reversals</CardTitle>
                <CardDescription>
                  {orderFullHistory.reversals.length} reversal{orderFullHistory.reversals.length > 1 ? "s" : ""}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {orderFullHistory.reversals.map((reversal) => (
                  <div key={reversal.id} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-sm capitalize">
                          {reversal.reversal_type.replace("_", " ")}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {reversal.reason_description || reversal.reason_code}
                        </p>
                      </div>
                      <Badge variant={reversal.status === "completed" ? "secondary" : "outline"}>
                        {reversal.status}
                      </Badge>
                    </div>
                    <div className="flex justify-between text-sm font-medium">
                      <span>Amount: {formatCurrency(reversal.amount)}</span>
                    </div>
                    {reversal.initiated_by_name && (
                      <p className="text-xs text-muted-foreground">
                        Initiated by: {reversal.initiated_by_name}
                      </p>
                    )}
                    {reversal.refund_items && reversal.refund_items.length > 0 && (
                      <div className="mt-2 pt-2 border-t space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">Items refunded:</p>
                        {reversal.refund_items.map((item, idx) => (
                          <p key={idx} className="text-xs text-muted-foreground">
                            • {item.item_name} ({item.quantity_refunded}×) - {formatCurrency(item.total_refunded)}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Discounts Section - TICKET DM-011-01 */}
          {orderFullHistory && orderFullHistory.discounts && orderFullHistory.discounts.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Discounts Applied</CardTitle>
                <CardDescription>
                  {orderFullHistory.discounts.length} discount{orderFullHistory.discounts.length > 1 ? "s" : ""}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {orderFullHistory.discounts.map((discount, idx) => (
                  <div key={idx} className="flex items-start justify-between rounded-lg border p-3">
                    <div className="flex-1">
                      <p className="font-medium text-sm">{discount.discount_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {discount.voided ? "Voided at " : "Applied at "} {
                          new Date(discount.voided ? discount.voided_at! : discount.applied_at).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })
                        }
                      </p>
                      {discount.target_item_name && (
                        <p className="text-xs text-muted-foreground mt-1">
                          On: {discount.target_item_name}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className={cn(
                        "font-semibold text-sm",
                        discount.voided ? "line-through text-muted-foreground" : "text-green-600"
                      )}>
                        -{formatCurrency(discount.discount_amount)}
                      </p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Chargebacks Section - TICKET DM-011-01 */}
          {orderFullHistory && orderFullHistory.chargebacks && orderFullHistory.chargebacks.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base text-red-600">Chargebacks</CardTitle>
                <CardDescription>
                  {orderFullHistory.chargebacks.length} chargeback{orderFullHistory.chargebacks.length > 1 ? "s" : ""}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {orderFullHistory.chargebacks.map((chargeback) => (
                  <div key={chargeback.id} className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 p-3 space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-sm text-red-900 dark:text-red-100">
                          Chargeback - {chargeback.reason_code}
                        </p>
                        <p className="text-xs text-red-700 dark:text-red-300">
                          {chargeback.reason_description}
                        </p>
                      </div>
                      <Badge variant="destructive">{chargeback.status}</Badge>
                    </div>
                    <p className="font-semibold text-red-600 dark:text-red-400">
                      -{formatCurrency(chargeback.amount)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Received: {new Date(chargeback.received_at).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                    {chargeback.defense_deadline && (
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        Defense deadline: {new Date(chargeback.defense_deadline).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </p>
                    )}
                  </div>
                ))}
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
                    {formatCurrency(primaryLane.total)}
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
              {/* Single source of truth: every line below comes from the same
                  pricing track (the lane actually charged), so the visible
                  lines always sum to the displayed Total. */}
              {isMixedPayment && (
                <div className="flex items-center gap-2 p-2 bg-amber-50 dark:bg-amber-950/30 rounded-md border border-amber-200 dark:border-amber-800">
                  <DollarSign className="h-4 w-4 text-amber-600" />
                  <span className="text-xs text-amber-700 dark:text-amber-400">
                    Mixed Payment: Paid with both cash and card
                  </span>
                </div>
              )}

              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatCurrency(primaryLane.subtotal)}</span>
              </div>
              {primaryLane.discount > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Discount</span>
                  <span className="text-green-600">
                    -{formatCurrency(primaryLane.discount)}
                  </span>
                </div>
              )}
              {primaryLane.serviceCharge > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Service Charge</span>
                  <span>{formatCurrency(primaryLane.serviceCharge)}</span>
                </div>
              )}
              {primaryLane.tax > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tax</span>
                  <span>{formatCurrency(primaryLane.tax)}</span>
                </div>
              )}
              {primaryLane.tip > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tip</span>
                  <span>{formatCurrency(primaryLane.tip)}</span>
                </div>
              )}

              {breakdown.mixedCashDiscount > 0 && (
                <div className="flex justify-between">
                  <span className="text-green-600 dark:text-green-400 font-medium">
                    Cash Discount
                  </span>
                  <span className="text-green-600 dark:text-green-400 font-medium">
                    -{formatCurrency(breakdown.mixedCashDiscount)}
                  </span>
                </div>
              )}

              <Separator />
              <div className="flex justify-between font-semibold text-base">
                <span>
                  {isMixedPayment
                    ? "Total"
                    : breakdown.dual
                    ? `Total (${laneLabel})`
                    : "Total"}
                </span>
                <span
                  className={
                    !isMixedPayment && breakdown.display === "card"
                      ? "text-[#0C4FD1]"
                      : undefined
                  }
                >
                  {formatCurrency(
                    isMixedPayment && primaryLane.amountPaid > 0
                      ? primaryLane.amountPaid
                      : primaryLane.total
                  )}
                </span>
              </div>

              {breakdown.dual && !isMixedPayment && cashSavings > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-green-600 dark:text-green-400 font-medium">
                    Cash savings
                  </span>
                  <span className="text-green-600 dark:text-green-400 font-medium">
                    -{formatCurrency(cashSavings)}
                  </span>
                </div>
              )}

              {isMixedPayment && (
                <>
                  <Separator />
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">
                      Tendered
                    </p>
                    {cashPayments > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Cash</span>
                        <span className="text-green-600 dark:text-green-400 font-medium">
                          {formatCurrency(cashPayments)}
                        </span>
                      </div>
                    )}
                    {cardPayments > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Card</span>
                        <span>{formatCurrency(cardPayments)}</span>
                      </div>
                    )}
                  </div>
                </>
              )}

              {!isMixedPayment && primaryLane.amountPaid > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Amount Paid</span>
                  <span className="text-green-600">
                    {formatCurrency(primaryLane.amountPaid)}
                  </span>
                </div>
              )}
              {primaryLane.amountDue > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Amount Due</span>
                  <span className="text-amber-600">
                    {formatCurrency(primaryLane.amountDue)}
                  </span>
                </div>
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

      {/* Refund Confirmation */}
      <AlertDialog open={confirmRefundOpen} onOpenChange={setConfirmRefundOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Refund this order?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark the order and all captured payments as refunded. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRefunding}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRefund} disabled={isRefunding}>
              {isRefunding && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Confirm Refund
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Void Confirmation */}
      <AlertDialog open={confirmVoidOpen} onOpenChange={setConfirmVoidOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Void this order?</AlertDialogTitle>
            <AlertDialogDescription>
              This will void the order and all pending payments. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isVoiding}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleVoid}
              disabled={isVoiding}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isVoiding && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Confirm Void
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
