"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Calendar,
  User,
  Utensils,
  ShoppingBag,
  Truck,
  Globe,
  ChefHat,
  Printer,
  X,
  RotateCcw,
  CreditCard,
  DollarSign,
  Clock,
  Store,
  Mail,
  Users,
  ChevronRight,
  Ban,
  Tag,
  Flame,
  CheckCircle2,
  RefreshCw,
  ShieldOff,
  Code2,
  MessageSquare,
  AlertTriangle,
} from "lucide-react";
import type {
  OrderItem,
  OrderPayment,
  OrderItemModifier,
  OrderResponse,
} from "@/types/order-management";
import type { OrderFullHistory } from "@/types/order-full-history";
import { OrderStatusBadge } from "@/components/dashboard/orders/OrderStatusBadge";
import { PaymentStatusBadge } from "@/components/dashboard/orders/PaymentStatusBadge";
import { OrderFullTimeline } from "@/components/dashboard/orders/OrderFullTimeline";
import { EnhancedPaymentsList } from "@/components/dashboard/orders/EnhancedPayments";
import { ReversalsList } from "@/components/dashboard/orders/ReversalsSection";
import {
  KitchenSection,
  hasKitchenData,
} from "@/components/dashboard/orders/KitchenSection";
import { GetOrderDetails } from "@/app/dashboard/actions/order";
import { useOrderFullHistory } from "@/app/dashboard/hooks/useOrderFullHistory";

// ─── Props ───

interface BreadcrumbItem {
  label: string;
  href?: string;
}

const TAB_VALUES = ["items", "payments", "timeline", "kitchen", "refunds", "raw"] as const;
type TabValue = (typeof TAB_VALUES)[number];

interface OrderDetailFullPageProps {
  orderId: string;
  backUrl: string;
  backLabel?: string;
  breadcrumbs: BreadcrumbItem[];
  readOnly?: boolean;
  /** When provided, shows "Viewing as [HQ Admin / Carrier Admin] — Read Only" banner */
  adminViewType?: "hq" | "carrier" | null;
}

// ─── Utilities ───

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

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

function formatOrderType(type: string) {
  const labels: Record<string, string> = {
    dine_in: "Dine-In",
    takeout: "Takeout",
    delivery: "Delivery",
    online: "Online",
    catering: "Catering",
  };
  return labels[type] || type.replace("_", " ");
}

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

type KitchenStatus = "new" | "preparing" | "ready" | "completed" | string;

function kitchenStatusConfig(status: KitchenStatus | null | undefined) {
  if (!status) return null;
  const map: Record<
    string,
    { label: string; icon: React.ReactNode; color: string }
  > = {
    new: {
      label: "New",
      icon: <Clock className="h-3 w-3" />,
      color: "text-muted-foreground",
    },
    preparing: {
      label: "Preparing",
      icon: <Flame className="h-3 w-3" />,
      color: "text-blue-600 dark:text-blue-400",
    },
    ready: {
      label: "Ready",
      icon: <CheckCircle2 className="h-3 w-3" />,
      color: "text-emerald-600 dark:text-emerald-400",
    },
    completed: {
      label: "Completed",
      icon: <CheckCircle2 className="h-3 w-3" />,
      color: "text-emerald-600 dark:text-emerald-400",
    },
  };
  return (
    map[status] ?? {
      label: status,
      icon: <Clock className="h-3 w-3" />,
      color: "text-muted-foreground",
    }
  );
}

function formatShortTime(
  dateString: string | null | undefined
): string | null {
  if (!dateString) return null;
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatStaffName(
  profile?: {
    first_name?: string;
    last_name?: string;
    display_name?: string;
  } | null
): string | null {
  if (!profile) return null;
  if (profile.display_name) return profile.display_name;
  const full =
    `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim();
  return full || null;
}

// ─── Sub-components ───

type RichItem = NonNullable<OrderFullHistory["items"]>[number];
type Reversal = NonNullable<OrderFullHistory["reversals"]>[number];

function PriceRow({
  label,
  value,
  className,
  valueClassName,
  bold,
}: {
  label: string;
  value: string;
  className?: string;
  valueClassName?: string;
  bold?: boolean;
}) {
  return (
    <div className={cn("flex items-center justify-between", className)}>
      <span
        className={cn(
          "text-muted-foreground",
          bold && "text-foreground font-semibold"
        )}
      >
        {label}
      </span>
      <span className={cn(bold && "font-semibold", valueClassName)}>
        {value}
      </span>
    </div>
  );
}

function MetaChip({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">
      <span className="text-muted-foreground shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground leading-none mb-0.5">
          {label}
        </p>
        <div className="font-medium truncate leading-tight">{value}</div>
      </div>
    </div>
  );
}

// ─── Items Tab Content ───

function ItemsTabContent({
  items,
  richItems,
  reversals,
  isLoading,
}: {
  items: (OrderItem & { order_item_modifiers?: OrderItemModifier[] })[];
  richItems: RichItem[] | null;
  reversals: Reversal[] | null;
  isLoading: boolean;
}) {
  const useRich = richItems && richItems.length > 0;
  const displayItems: RichItem[] = useRich
    ? richItems
    : items.map((item) => ({
        id: item.id,
        item_name: item.item_name,
        quantity: Number(item.quantity) || 1,
        unit_price: Number(item.unit_price) || 0,
        subtotal: Number(item.subtotal) || 0,
        cash_unit_price: null,
        category_name: item.category_name ?? null,
        course_number: null,
        is_voided: item.is_voided,
        void_reason: item.void_reason ?? null,
        voided_at: item.voided_at ?? null,
        voided_by_name: null,
        is_open_item: false,
        is_tax_exempt: false,
        special_instructions: item.special_instructions ?? null,
        kitchen_status: null,
        kitchen_notes: null,
        fire_time: null,
        preparing_at: null,
        ready_at: null,
        completed_at: null,
        item_status: item.item_status,
        created_at: item.created_at,
        discount_name: item.discount_name ?? null,
        discount_amount: Number(item.discount_amount) || null,
        discount_type: item.discount_type ?? null,
        modifiers: (item.order_item_modifiers || []).map((m) => ({
          modifier_group_name: m.modifier_group_name,
          modifier_name: m.modifier_name,
          price_modifier: m.price_modifier,
          quantity: m.quantity,
        })),
      }));

  const courseGroups = React.useMemo(() => {
    const groups = new Map<
      number | null,
      { label: string; items: RichItem[] }
    >();
    for (const item of displayItems) {
      const course = item.course_number;
      if (!groups.has(course)) {
        groups.set(course, {
          label:
            course != null
              ? `Course ${course}${item.category_name ? ` — ${item.category_name}` : ""}`
              : item.category_name
                ? item.category_name
                : "Items",
          items: [],
        });
      }
      groups.get(course)!.items.push(item);
    }
    return [...groups.entries()].sort(([a], [b]) => {
      if (a === null && b === null) return 0;
      if (a === null) return 1;
      if (b === null) return -1;
      return a - b;
    });
  }, [displayItems]);

  const hasCourses = courseGroups.some(([key]) => key !== null);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
      </div>
    );
  }

  if (displayItems.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">No items found</p>
    );
  }

  return (
    <div className="space-y-6">
      {courseGroups.map(([courseKey, group]) => (
        <div key={courseKey ?? "none"}>
          {(hasCourses || group.label !== "Items") && (
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </span>
              <div className="flex-1 h-px bg-border" />
            </div>
          )}
          <div className="space-y-0 divide-y rounded-lg border">
            {group.items.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                reversals={reversals}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ItemRow({
  item,
  reversals,
}: {
  item: RichItem;
  reversals: Reversal[] | null;
}) {
  const isVoided = item.is_voided;
  const qty = item.quantity;
  const discountAmount = Number(item.discount_amount) || 0;
  const hasDiscount = discountAmount > 0;
  const kitchenCfg = kitchenStatusConfig(item.kitchen_status);
  const fireTimeStr = formatShortTime(item.fire_time);
  const completedTimeStr = formatShortTime(item.completed_at);

  const itemReversals =
    reversals?.filter(
      (r) =>
        (r.status === "completed" || r.status === "processed") &&
        r.refund_items?.some((ri) => ri.order_item_id === item.id)
    ) ?? [];

  return (
    <div
      className={cn(
        "px-4 py-3",
        isVoided && "bg-red-50/50 dark:bg-red-950/10"
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm font-semibold mt-0.5",
            isVoided
              ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
              : "bg-muted text-foreground"
          )}
        >
          {isVoided ? <Ban className="h-4 w-4" /> : qty}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className={cn(
                "text-sm font-medium",
                isVoided && "line-through text-muted-foreground"
              )}
            >
              {item.item_name}
            </span>
            {isVoided && (
              <Badge
                variant="destructive"
                className="text-[10px] px-1.5 py-0 h-4"
              >
                VOIDED
              </Badge>
            )}
            {item.is_open_item && (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 h-4 border-amber-300 text-amber-700 dark:text-amber-400"
              >
                Open Item
              </Badge>
            )}
            {item.is_tax_exempt && (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 h-4 border-purple-300 text-purple-700 dark:text-purple-400"
              >
                <ShieldOff className="h-2.5 w-2.5 mr-0.5" />
                Tax Exempt
              </Badge>
            )}
          </div>

          {item.modifiers.length > 0 && (
            <div className="mt-1 space-y-0.5">
              {item.modifiers.map((mod, i) => (
                <p
                  key={i}
                  className={cn(
                    "text-xs text-muted-foreground",
                    isVoided && "line-through"
                  )}
                >
                  <span className="text-muted-foreground/50">+ </span>
                  {mod.modifier_name}
                  {mod.quantity > 1 && ` (x${mod.quantity})`}
                  {mod.price_modifier > 0 && (
                    <span className="ml-1 text-muted-foreground/80">
                      (+{formatCurrency(mod.price_modifier)})
                    </span>
                  )}
                </p>
              ))}
            </div>
          )}

          <p
            className={cn(
              "text-xs text-muted-foreground mt-1",
              isVoided && "line-through"
            )}
          >
            Qty: {qty} &times; {formatCurrency(item.unit_price)}
          </p>

          {item.special_instructions && (
            <p
              className={cn(
                "text-xs italic text-muted-foreground mt-1",
                isVoided && "line-through"
              )}
            >
              &ldquo;{item.special_instructions}&rdquo;
            </p>
          )}

          {kitchenCfg ? (
            <div
              className={cn(
                "flex items-center gap-1.5 mt-1.5 text-xs",
                kitchenCfg.color
              )}
            >
              {kitchenCfg.icon}
              <span className="font-medium">
                Kitchen: {kitchenCfg.label}
              </span>
              {completedTimeStr && (
                <span className="text-muted-foreground">
                  at {completedTimeStr}
                </span>
              )}
            </div>
          ) : (
            !isVoided && (
              <div className="flex items-center gap-1.5 mt-1.5 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>Kitchen: N/A</span>
              </div>
            )
          )}

          {fireTimeStr && !kitchenCfg && (
            <div className="flex items-center gap-1.5 mt-1.5 text-xs text-orange-600 dark:text-orange-400">
              <Flame className="h-3 w-3" />
              <span>Fired at {fireTimeStr}</span>
            </div>
          )}
          {fireTimeStr &&
            kitchenCfg &&
            item.kitchen_status !== "completed" &&
            item.kitchen_status !== "ready" && (
              <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
                <Flame className="h-3 w-3" />
                <span>Fired at {fireTimeStr}</span>
              </div>
            )}

          {hasDiscount && !isVoided && (
            <div className="flex items-center gap-1.5 mt-1.5">
              <Badge
                variant="secondary"
                className="text-[10px] px-1.5 py-0 h-4 text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/30 border-0"
              >
                <Tag className="h-2.5 w-2.5 mr-0.5" />-
                {formatCurrency(discountAmount)}
              </Badge>
              {item.discount_name && (
                <span className="text-[10px] text-muted-foreground">
                  {item.discount_name}
                </span>
              )}
            </div>
          )}

          {isVoided && (
            <div className="mt-2 pt-2 border-t border-dashed border-red-200 dark:border-red-800/50 space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
                <Ban className="h-3 w-3" />
                <span className="font-medium">
                  Voided
                  {item.voided_at ? `: ${formatDate(item.voided_at)}` : ""}
                  {item.voided_by_name
                    ? ` by ${item.voided_by_name}`
                    : ""}
                </span>
              </div>
              {item.void_reason && (
                <p className="text-xs text-red-600/80 dark:text-red-400/80 pl-[18px]">
                  Reason: {item.void_reason}
                </p>
              )}
            </div>
          )}

          {itemReversals.length > 0 && (
            <div className="mt-1.5 space-y-1">
              {itemReversals.map((rev) => {
                const matchedRefundItem = rev.refund_items?.find(
                  (ri) => ri.order_item_id === item.id
                );
                const refundAmount =
                  matchedRefundItem?.amount ?? rev.amount;
                return (
                  <div key={rev.id} className="space-y-0.5">
                    <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                      <RefreshCw className="h-3 w-3" />
                      <span>
                        Refunded: {formatCurrency(refundAmount)}
                        {rev.original_card_last_four
                          ? ` → ****${rev.original_card_last_four}`
                          : rev.original_payment_method
                            ? ` → ${rev.original_payment_method}`
                            : ""}
                        {rev.completed_at
                          ? ` on ${formatDate(rev.completed_at)}`
                          : ""}
                      </span>
                    </div>
                    {(rev.reason_description || rev.reason_code) && (
                      <p className="text-xs text-amber-600/80 dark:text-amber-400/80 pl-[18px]">
                        Reason:{" "}
                        {rev.reason_description || rev.reason_code}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="text-right shrink-0">
          <p
            className={cn(
              "text-sm font-semibold",
              isVoided && "text-muted-foreground line-through"
            )}
          >
            {formatCurrency(item.subtotal)}
          </p>
          {isVoided && (
            <p className="text-[10px] text-muted-foreground italic">
              excluded
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Pricing Breakdown (sticky bottom) ───

function PricingBreakdown({
  order,
  payments,
}: {
  order: OrderResponse;
  payments: OrderPayment[];
}) {
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

  const paidPayments = payments.filter(
    (p) => p.status === "paid" || p.status === "captured"
  );
  const cashPaid = paidPayments
    .filter((p) => p.payment_method === "cash")
    .reduce((sum, p) => sum + Number(p.total_amount), 0);
  const cardPaid = paidPayments
    .filter((p) => p.payment_method !== "cash")
    .reduce((sum, p) => sum + Number(p.total_amount), 0);
  const totalPaid = cashPaid + cardPaid;

  return (
    <div className="border-t bg-background">
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="space-y-2 text-sm">
          {isMixedPayment ? (
            <>
              <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800 mb-2">
                <DollarSign className="h-3.5 w-3.5 text-amber-600" />
                <span className="text-xs text-amber-700 dark:text-amber-400">
                  Mixed Payment: Paid with both cash and card
                </span>
              </div>
              {hasDualPricing && (
                <div className="grid grid-cols-2 gap-3 mb-2">
                  <div className="p-3 rounded-lg bg-muted/50 border space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">
                      If All Card
                    </p>
                    <PriceRow
                      label="Subtotal"
                      value={formatCurrency(cardSubtotal)}
                    />
                    <PriceRow
                      label="Tax"
                      value={formatCurrency(cardTax)}
                    />
                    <div className="border-t pt-1.5 mt-1.5">
                      <PriceRow
                        label="Total"
                        value={formatCurrency(cardTotal)}
                        bold
                      />
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 space-y-1.5">
                    <p className="text-xs font-medium text-green-700 dark:text-green-400">
                      If All Cash
                    </p>
                    <PriceRow
                      label="Subtotal"
                      value={formatCurrency(cashSubtotal)}
                    />
                    <PriceRow
                      label="Tax"
                      value={formatCurrency(cashTax)}
                    />
                    <div className="border-t border-green-200 dark:border-green-800 pt-1.5 mt-1.5">
                      <PriceRow
                        label="Total"
                        value={formatCurrency(cashTotal)}
                        bold
                        valueClassName="text-green-700 dark:text-green-400"
                      />
                    </div>
                  </div>
                </div>
              )}
              {totalSavings > 0 && (
                <div className="flex justify-between items-center p-3 bg-green-100 dark:bg-green-900/30 rounded-lg mb-2">
                  <span className="text-xs font-medium text-green-700 dark:text-green-400">
                    Cash Discount Available
                  </span>
                  <span className="text-sm font-bold text-green-700 dark:text-green-400">
                    -{formatCurrency(totalSavings)}
                  </span>
                </div>
              )}
              {!hasDualPricing && (
                <>
                  <PriceRow
                    label="Subtotal"
                    value={formatCurrency(order.subtotal)}
                  />
                  {Number(order.tax_amount) > 0 && (
                    <PriceRow
                      label="Tax"
                      value={formatCurrency(Number(order.tax_amount))}
                    />
                  )}
                </>
              )}
              <div className="border-t pt-2 mt-2 space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">
                  Payments
                </p>
                {cashPaid > 0 && (
                  <PriceRow
                    label={`Cash${hasDualPricing ? " (discounted)" : ""}`}
                    value={formatCurrency(cashPaid)}
                    valueClassName={
                      hasDualPricing
                        ? "text-green-600 dark:text-green-400 font-medium"
                        : ""
                    }
                  />
                )}
                {cardPaid > 0 && (
                  <PriceRow
                    label={`Card${hasDualPricing ? " (full rate)" : ""}`}
                    value={formatCurrency(cardPaid)}
                  />
                )}
              </div>
              <div className="border-t pt-2 mt-2">
                <PriceRow
                  label="Total Paid"
                  value={formatCurrency(totalPaid)}
                  bold
                  className="text-base"
                />
              </div>
            </>
          ) : hasDualPricing ? (
            <>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
                <PriceRow
                  label="Card Subtotal"
                  value={formatCurrency(cardSubtotal)}
                  valueClassName="text-muted-foreground line-through"
                />
                <PriceRow
                  label="Cash Subtotal"
                  value={formatCurrency(cashSubtotal)}
                />
                {totalSavings > 0 && (
                  <PriceRow
                    label="Savings"
                    value={`-${formatCurrency(totalSavings)}`}
                    valueClassName="text-green-600 dark:text-green-400 font-medium"
                  />
                )}
                {Number(order.tax_amount) > 0 && (
                  <PriceRow
                    label="Tax"
                    value={formatCurrency(Number(order.tax_amount))}
                  />
                )}
                {Number(order.tip_amount) > 0 && (
                  <PriceRow
                    label="Tip"
                    value={formatCurrency(Number(order.tip_amount))}
                  />
                )}
              </div>
              <Separator />
              <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
                <PriceRow
                  label="Total"
                  value={formatCurrency(cashTotal)}
                  bold
                  className="text-base"
                />
                {totalPaid > 0 && (
                  <PriceRow
                    label="Amount Paid"
                    value={formatCurrency(totalPaid)}
                    valueClassName="text-green-600"
                  />
                )}
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
                <PriceRow
                  label="Subtotal"
                  value={formatCurrency(order.subtotal)}
                />
                {Number(order.tax_amount) > 0 && (
                  <PriceRow
                    label="Tax"
                    value={formatCurrency(Number(order.tax_amount))}
                  />
                )}
                {Number(order.tip_amount) > 0 && (
                  <PriceRow
                    label="Tip"
                    value={formatCurrency(Number(order.tip_amount))}
                  />
                )}
                {Number(order.discount_amount) > 0 && (
                  <PriceRow
                    label="Discount"
                    value={`-${formatCurrency(Number(order.discount_amount))}`}
                    valueClassName="text-green-600"
                  />
                )}
                {Number(order.service_charge) > 0 && (
                  <PriceRow
                    label="Service Charge"
                    value={formatCurrency(Number(order.service_charge))}
                  />
                )}
              </div>
              <Separator />
              <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
                <PriceRow
                  label="Total"
                  value={formatCurrency(order.total_amount)}
                  bold
                  className="text-base"
                />
                {totalPaid > 0 && (
                  <PriceRow
                    label="Amount Paid"
                    value={formatCurrency(totalPaid)}
                    valueClassName="text-green-600"
                  />
                )}
                {Number(order.amount_due) > 0 && (
                  <PriceRow
                    label="Amount Due"
                    value={formatCurrency(Number(order.amount_due))}
                    valueClassName="text-amber-600"
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Raw Data Tab ───

function RawDataTab({
  fullHistory,
  isLoading,
}: {
  fullHistory: OrderFullHistory | null;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[400px] w-full rounded-lg" />
      </div>
    );
  }

  if (!fullHistory) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        No data available
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Full response from <code className="text-xs">get_order_full_history</code> RPC
      </p>
      <pre className="bg-muted/50 border rounded-lg p-4 text-xs font-mono overflow-auto max-h-[600px] whitespace-pre-wrap break-words">
        {JSON.stringify(fullHistory, null, 2)}
      </pre>
    </div>
  );
}

// ─── Loading Skeleton ───

function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center gap-2">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-5 w-4" />
        <Skeleton className="h-5 w-24" />
      </div>
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-5 w-48" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-24" />
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Skeleton className="h-14 rounded-lg" />
        <Skeleton className="h-14 rounded-lg" />
        <Skeleton className="h-14 rounded-lg" />
      </div>
      <Skeleton className="h-10 w-full" />
      <div className="space-y-3">
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
      </div>
    </div>
  );
}

// ─── Error State ───

function ErrorState({
  backUrl,
  title,
  message,
  onRetry,
}: {
  backUrl: string;
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  const router = useRouter();
  return (
    <div className="flex flex-col items-center justify-center py-20 space-y-4 animate-in fade-in duration-500">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="h-7 w-7 text-destructive" />
      </div>
      <div className="text-center space-y-1">
        <h2 className="text-lg font-semibold">{title ?? "Order not found"}</h2>
        <p className="text-sm text-muted-foreground max-w-md">{message}</p>
      </div>
      <div className="flex flex-wrap gap-2 justify-center">
        {onRetry && (
          <Button variant="default" onClick={onRetry}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        )}
        <Button variant="outline" onClick={() => router.push(backUrl)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Orders
        </Button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// ─── Main Component ───
// ═══════════════════════════════════════════════════

export function OrderDetailFullPage({
  orderId,
  backUrl,
  backLabel = "Back to Orders",
  breadcrumbs,
  readOnly = false,
  adminViewType = null,
}: OrderDetailFullPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const tabFromUrl = (searchParams.get("tab") ?? "items") as TabValue;
  const activeTab = TAB_VALUES.includes(tabFromUrl) ? tabFromUrl : "items";

  const setTab = React.useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", value);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const {
    data: orderDetails,
    isLoading,
    isError: isOrderError,
  } = useQuery({
    queryKey: ["order-details", orderId],
    queryFn: async () => {
      const details = await GetOrderDetails(orderId);
      return details;
    },
    enabled: !!orderId,
  });

  const {
    data: fullHistory,
    isLoading: isHistoryLoading,
    isError: isHistoryError,
    error: historyError,
    refetch: refetchHistory,
  } = useOrderFullHistory(orderId);

  const order = orderDetails as OrderResponse | null;
  const items: (OrderItem & { order_item_modifiers?: OrderItemModifier[] })[] =
    orderDetails?.order_items || [];
  const payments: OrderPayment[] = orderDetails?.order_payments || [];

  // Derived metadata
  const locationName =
    fullHistory?.order?.location_name ??
    order?.location?.name ??
    order?.locations?.name ??
    null;
  const createdByName =
    fullHistory?.order?.created_by_staff_name ??
    fullHistory?.order?.created_by_user_name ??
    formatStaffName(order?.created_by_staff);
  const serverName =
    fullHistory?.order?.server_name ??
    formatStaffName(order?.table_sessions?.[0]?.server) ??
    formatStaffName(order?.assigned_server);
  const tableName =
    fullHistory?.order?.table_name ?? order?.table_number ?? null;
  const partySize =
    fullHistory?.order?.party_size ?? order?.table_sessions?.[0]?.party_size;
  const stationName =
    fullHistory?.order?.station_name ??
    order?.station?.station_name ??
    null;
  const isDineIn = order?.order_type === "dine_in";
  const customerName =
    fullHistory?.order?.customer_name ?? order?.customer_name ?? null;
  const customerPhone =
    fullHistory?.order?.customer_phone ?? order?.customer_phone ?? null;
  const customerEmail = order?.customer_email ?? null;
  const hasCustomer = !!(customerName || customerPhone || customerEmail);
  const notes =
    fullHistory?.order?.internal_notes ?? order?.internal_notes ?? null;

  const activeItemCount = items.reduce(
    (sum, i) => sum + (i.is_voided ? 0 : Number(i.quantity) || 1),
    0
  );
  const paymentCount =
    fullHistory?.payments?.length ?? payments.length;
  const timelineCount = fullHistory?.timeline?.length ?? 0;
  const kitchenItemCount =
    fullHistory?.items?.filter(
      (i) => i.kitchen_status != null || i.course_number != null
    ).length ?? 0;
  const showKitchen =
    fullHistory?.items != null && hasKitchenData(fullHistory.items);
  const reversalsCount =
    (fullHistory?.reversals?.length ?? 0) +
    (fullHistory?.chargebacks?.length ?? 0);
  const showRefunds = reversalsCount > 0;

  const visibleTabs: TabValue[] = React.useMemo(() => {
    const t: TabValue[] = ["items", "payments", "timeline"];
    if (showKitchen) t.push("kitchen");
    if (showRefunds) t.push("refunds");
    t.push("raw");
    return t;
  }, [showKitchen, showRefunds]);

  React.useEffect(() => {
    document.title = order
      ? `Order #${order.display_number || order.order_number} | DEXA POS`
      : "Order | DEXA POS";
    return () => {
      document.title = "DEXA POS";
    };
  }, [order]);

  React.useEffect(() => {
    if (!visibleTabs.includes(activeTab)) {
      setTab("items");
    }
  }, [activeTab, visibleTabs, setTab]);

  const handleKeyDown = React.useCallback(
    (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const idx = visibleTabs.indexOf(activeTab);
      if (e.key === "ArrowRight" && idx < visibleTabs.length - 1) {
        e.preventDefault();
        setTab(visibleTabs[idx + 1]!);
      } else if (e.key === "ArrowLeft" && idx > 0) {
        e.preventDefault();
        setTab(visibleTabs[idx - 1]!);
      }
    },
    [activeTab, visibleTabs, setTab]
  );

  React.useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (!order || isOrderError) {
    return (
      <ErrorState
        backUrl={backUrl}
        title="Order not found"
        message="The order you're looking for doesn't exist."
      />
    );
  }

  if (isHistoryError && historyError) {
    const err = historyError as Error & { errorType?: string };
    if (err.errorType === "access_denied") {
      return (
        <ErrorState
          backUrl={backUrl}
          title="Access denied"
          message="You don't have permission to view this order."
        />
      );
    }
    if (err.errorType === "network" || err.status === 500) {
      return (
        <ErrorState
          backUrl={backUrl}
          title="Something went wrong"
          message="Unable to load order details. Please try again."
          onRetry={() => refetchHistory()}
        />
      );
    }
    return (
      <ErrorState
        backUrl={backUrl}
        title="Order not found"
        message={historyError.message ?? "The order you're looking for doesn't exist."}
      />
    );
  }

  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)] animate-in fade-in duration-500">
      {readOnly && adminViewType && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          Viewing as {adminViewType === "hq" ? "HQ Admin" : "Carrier Admin"} — Read Only
        </div>
      )}
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-4">
        {breadcrumbs.map((crumb, i) => {
          const isLast = i === breadcrumbs.length - 1;
          const label =
            isLast && order
              ? `Order #${order.display_number || order.order_number}`
              : crumb.label;
          return (
            <React.Fragment key={i}>
              {i > 0 && <ChevronRight className="h-3.5 w-3.5" />}
              {crumb.href ? (
                <button
                  onClick={() => router.push(crumb.href!)}
                  className="hover:text-foreground transition-colors"
                >
                  {label}
                </button>
              ) : (
                <span className="text-foreground font-medium">
                  {label}
                </span>
              )}
            </React.Fragment>
          );
        })}
      </nav>

      {/* Order Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => router.push(backUrl)}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl font-bold tracking-tight">
              Order #{order.display_number || order.order_number}
            </h1>
            <OrderStatusBadge status={order.status} />
            <PaymentStatusBadge status={order.payment_status} />
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground ml-11">
            <span className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              {formatDate(order.created_at)}
            </span>
            <span className="flex items-center gap-1.5">
              {getOrderTypeIcon(order.order_type)}
              {formatOrderType(order.order_type)}
            </span>
            {locationName && (
              <span className="flex items-center gap-1.5">
                <Store className="h-3.5 w-3.5" />
                {locationName}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 ml-11 sm:ml-0">
          <span className="text-2xl font-bold tracking-tight mr-2">
            {formatCurrency(order.total_amount)}
          </span>
        </div>
      </div>

      {/* Meta chips */}
      {(() => {
        const chips: {
          icon: React.ReactNode;
          label: string;
          value: string | React.ReactNode;
        }[] = [];
        if (createdByName)
          chips.push({
            icon: <User className="h-3.5 w-3.5" />,
            label: "Created by",
            value: createdByName,
          });
        if (isDineIn && tableName)
          chips.push({
            icon: <Utensils className="h-3.5 w-3.5" />,
            label: "Table",
            value: tableName,
          });
        if (isDineIn && serverName)
          chips.push({
            icon: <User className="h-3.5 w-3.5" />,
            label: "Server",
            value: serverName,
          });
        if (isDineIn && partySize != null)
          chips.push({
            icon: <Users className="h-3.5 w-3.5" />,
            label: "Party",
            value: `${partySize} guests`,
          });
        if (stationName)
          chips.push({
            icon: <Store className="h-3.5 w-3.5" />,
            label: "Station",
            value: stationName,
          });
        if (hasCustomer)
          chips.push({
            icon: <User className="h-3.5 w-3.5" />,
            label: "Customer",
            value: customerName || customerPhone || customerEmail || "",
          });

        if (chips.length === 0) return null;
        return (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 mb-6">
            {chips.map((chip, i) => (
              <MetaChip key={i} {...chip} />
            ))}
          </div>
        );
      })()}

      {/* Internal notes */}
      {notes && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 px-4 py-3 mb-6">
          <MessageSquare className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-0.5">
              Internal Note
            </p>
            <p className="text-sm">&ldquo;{notes}&rdquo;</p>
          </div>
        </div>
      )}

      {/* Tabbed Interface */}
      <Tabs value={activeTab} onValueChange={setTab} className="flex-1">
        <TabsList className="w-full justify-start flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="items" className="gap-1.5">
            <ShoppingBag className="h-3.5 w-3.5" />
            Items
            {activeItemCount > 0 && (
              <Badge
                variant="secondary"
                className="ml-1 h-5 min-w-[20px] px-1.5 text-[10px]"
              >
                {activeItemCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="payments" className="gap-1.5">
            <CreditCard className="h-3.5 w-3.5" />
            Payments
            {paymentCount > 0 && (
              <Badge
                variant="secondary"
                className="ml-1 h-5 min-w-[20px] px-1.5 text-[10px]"
              >
                {paymentCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="timeline" className="gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            Timeline
            {timelineCount > 0 && (
              <Badge
                variant="secondary"
                className="ml-1 h-5 min-w-[20px] px-1.5 text-[10px]"
              >
                {timelineCount}
              </Badge>
            )}
          </TabsTrigger>
          {showKitchen && (
            <TabsTrigger value="kitchen" className="gap-1.5">
              <ChefHat className="h-3.5 w-3.5" />
              Kitchen
              {kitchenItemCount > 0 && (
                <Badge
                  variant="secondary"
                  className="ml-1 h-5 min-w-[20px] px-1.5 text-[10px]"
                >
                  {kitchenItemCount}
                </Badge>
              )}
            </TabsTrigger>
          )}
          {showRefunds && (
            <TabsTrigger value="refunds" className="gap-1.5">
              <RotateCcw className="h-3.5 w-3.5" />
              Refunds
              {reversalsCount > 0 && (
                <Badge
                  variant="secondary"
                  className="ml-1 h-5 min-w-[20px] px-1.5 text-[10px]"
                >
                  {reversalsCount}
                </Badge>
              )}
            </TabsTrigger>
          )}
          <TabsTrigger value="raw" className="gap-1.5">
            <Code2 className="h-3.5 w-3.5" />
            Raw Data
          </TabsTrigger>
        </TabsList>

        {/* Items Tab */}
        <TabsContent value="items" className="mt-4">
          <ItemsTabContent
            items={items}
            richItems={fullHistory?.items ?? null}
            reversals={fullHistory?.reversals ?? null}
            isLoading={isLoading || isHistoryLoading}
          />
        </TabsContent>

        {/* Payments Tab */}
        <TabsContent value="payments" className="mt-4">
          <EnhancedPaymentsList
            basicPayments={payments}
            richPayments={fullHistory?.payments ?? null}
            isLoading={isLoading || isHistoryLoading}
            cashDiscountApplied={!!order.cash_discount_applied}
            totalDue={order.total_amount}
          />
        </TabsContent>

        {/* Timeline Tab */}
        <TabsContent value="timeline" className="mt-4">
          <OrderFullTimeline
            fullHistory={fullHistory ?? null}
            isLoading={isHistoryLoading}
          />
        </TabsContent>

        {/* Kitchen Tab */}
        {showKitchen && (
          <TabsContent value="kitchen" className="mt-4">
            <KitchenSection items={fullHistory!.items} />
          </TabsContent>
        )}

        {/* Refunds Tab */}
        {showRefunds && (
          <TabsContent value="refunds" className="mt-4">
            <ReversalsList
              reversals={fullHistory?.reversals ?? null}
              chargebacks={fullHistory?.chargebacks ?? null}
              isLoading={isHistoryLoading}
            />
          </TabsContent>
        )}

        {/* Raw Data Tab */}
        <TabsContent value="raw" className="mt-4">
          <RawDataTab
            fullHistory={fullHistory ?? null}
            isLoading={isHistoryLoading}
          />
        </TabsContent>
      </Tabs>

      {/* Sticky Pricing Breakdown + Actions */}
      <div className="sticky bottom-0 mt-6 -mx-4 sm:-mx-6 lg:-mx-8">
        <PricingBreakdown order={order} payments={payments} />
        <div className="border-t bg-background">
          <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm">
              <Printer className="h-4 w-4 mr-1.5" />
              Print Receipt
            </Button>
            <Button variant="outline" size="sm">
              <Mail className="h-4 w-4 mr-1.5" />
              Email Receipt
            </Button>
            {!readOnly &&
              order.status !== "void" &&
              order.status !== "cancelled" && (
                <>
                  <div className="flex-1" />
                  <Button variant="outline" size="sm">
                    <RotateCcw className="h-4 w-4 mr-1.5" />
                    Refund
                  </Button>
                  <Button variant="destructive" size="sm">
                    <X className="h-4 w-4 mr-1.5" />
                    Void
                  </Button>
                </>
              )}
          </div>
        </div>
      </div>
    </div>
  );
}
