"use client";

import * as React from "react";
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
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Order,
  OrderItem,
  OrderPayment,
  OrderPaymentItem,
  OrderItemModifier,
  OrderResponse,
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
  MapPin,
  Store,
  Users,
  CreditCard,
  Mail,
  Clock,
  Hash,
  Receipt,
  ChevronRight,
  MoreHorizontal,
  ExternalLink,
  MessageSquare,
  CheckCircle2,
  Flame,
  Ban,
  Tag,
  ShieldOff,
  FileText,
  RefreshCw,
  Wifi,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  GetOrderDetails,
  GetOrderFullHistory,
} from "@/app/dashboard/actions/order";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowRight, ChevronDown, ChevronUp } from "lucide-react";
import { OrderFullTimeline } from "./OrderFullTimeline";
import { ReceiptModal } from "./ReceiptModal";
import { useSelectedLocation } from "@/stores/location-store";
import type { OrderFullHistory } from "@/types/order-full-history";
import {
  EnhancedPaymentsList,
  type RichPayment,
} from "./EnhancedPayments";
import { ReversalsList } from "./ReversalsSection";
import { KitchenSection, hasKitchenData } from "./KitchenSection";
import { RefundModal } from "./RefundModal";
import { VoidModal } from "./VoidModal";
import { SendReceiptModal } from "./SendReceiptModal";
import { AssignCustomerModal } from "./AssignCustomerModal";
import { AdjustTipModal } from "./AdjustTipModal";
import { ReprintDropdown } from "./ReprintDropdown";
import { assignCustomerToOrder } from "@/app/actions/orders/assign-customer";
import { toast } from "sonner";

interface OrderDetailSheetProps {
  order: Order | OrderResponse | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Override the full-details page URL. Defaults to `/dashboard/orders/{id}` */
  fullPageUrlPattern?: (orderId: string) => string;
  /** When true (e.g. HQ/Carrier admin view), hide Refund/Void actions */
  readOnly?: boolean;
  /** When true, show Refund button (requires refund permission). Defaults to true. */
  canRefund?: boolean;
  /** When true, show Void button (requires void permission). Defaults to true. Hidden for admins. */
  canVoid?: boolean;
}

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

function getOrderTypeIcon(type: string) {
  const icons: Record<string, React.ReactNode> = {
    dine_in: <Utensils className="h-3.5 w-3.5" />,
    takeout: <ShoppingBag className="h-3.5 w-3.5" />,
    delivery: <Truck className="h-3.5 w-3.5" />,
    online: <Globe className="h-3.5 w-3.5" />,
    catering: <ChefHat className="h-3.5 w-3.5" />,
  };
  return icons[type] || <ShoppingBag className="h-3.5 w-3.5" />;
}

function formatDateShort(dateString: string) {
  const d = new Date(dateString);
  return {
    date: d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    time: d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    }),
  };
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

function getChannelLabel(orderType: string) {
  const channels: Record<string, string> = {
    dine_in: "In-Store",
    takeout: "Pickup",
    delivery: "Delivery",
    online: "Online",
    catering: "Catering",
  };
  return channels[orderType] || "In-Store";
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
  const full = `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim();
  return full || null;
}

function getPricingModeLabel(
  mode?: string | null,
  cashDiscount?: boolean
): string {
  if (!mode) return "Standard";
  if (mode === "card") return "Card Only";
  if (mode === "cash") return "Cash Only";
  if (mode === "mixed" && cashDiscount) return "Dual (Cash Discount)";
  if (mode === "mixed") return "Dual";
  return "Standard";
}

function looksLikeUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    s
  );
}

// --- Sub-components ---

// ─── Enhanced Payments Section (wraps shared EnhancedPaymentsList in SectionCard) ───

function EnhancedPaymentsSection({
  basicPayments,
  richPayments,
  isLoading,
  cashDiscountApplied,
  totalDue,
  orderVoidedAt = null,
  orderVoidedByName = null,
  orderVoidedBy = null,
  orderVoidReason = null,
  onAdjustTip,
  showAdjustTip,
}: {
  basicPayments: OrderPayment[];
  richPayments: RichPayment[] | null;
  isLoading: boolean;
  cashDiscountApplied: boolean;
  totalDue: number;
  orderVoidedAt?: string | null;
  orderVoidedByName?: string | null;
  orderVoidedBy?: string | null;
  orderVoidReason?: string | null;
  onAdjustTip?: () => void;
  showAdjustTip?: boolean;
}) {
  const useRich = richPayments && richPayments.length > 0;
  const paymentCount = useRich ? richPayments.length : basicPayments.length;

  return (
    <SectionCard
      title={`Payments${paymentCount > 0 ? ` (${paymentCount})` : ""}`}
      icon={<CreditCard className="h-4 w-4" />}
      action={
        showAdjustTip && onAdjustTip ? (
          <Button variant="outline" size="sm" onClick={onAdjustTip}>
            <DollarSign className="h-3.5 w-3.5 mr-1.5" />
            Adjust Tip
          </Button>
        ) : undefined
      }
    >
      <EnhancedPaymentsList
        basicPayments={basicPayments}
        richPayments={richPayments}
        isLoading={isLoading}
        cashDiscountApplied={cashDiscountApplied}
        totalDue={totalDue}
        orderVoidedAt={orderVoidedAt}
        orderVoidedByName={orderVoidedByName}
        orderVoidedBy={orderVoidedBy}
        orderVoidReason={orderVoidReason}
      />
    </SectionCard>
  );
}

function SectionCard({
  title,
  icon,
  children,
  className,
  action,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-card shadow-sm overflow-hidden",
        className
      )}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          {icon && (
            <span className="text-muted-foreground">{icon}</span>
          )}
          <h3 className="text-sm font-semibold">{title}</h3>
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
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

// --- Pricing rows ---
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
    <div
      className={cn("flex items-center justify-between", className)}
    >
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

// ─── Kitchen status helpers ───

type KitchenStatus = "new" | "preparing" | "ready" | "completed" | string;

function kitchenStatusConfig(status: KitchenStatus | null | undefined) {
  if (!status) return null;
  const map: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
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
  return map[status] ?? { label: status, icon: <Clock className="h-3 w-3" />, color: "text-muted-foreground" };
}

function formatShortTime(dateString: string | null | undefined): string | null {
  if (!dateString) return null;
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

// ─── Enhanced Items Section ───

type RichItem = NonNullable<OrderFullHistory["items"]>[number];
type Reversal = NonNullable<OrderFullHistory["reversals"]>[number];

function EnhancedItemsSection({
  items,
  richItems,
  reversals,
  isLoading,
  itemCount,
  voidedCount,
}: {
  items: (OrderItem & { order_item_modifiers?: OrderItemModifier[] })[];
  richItems: RichItem[] | null;
  reversals: Reversal[] | null;
  isLoading: boolean;
  itemCount: number;
  voidedCount: number;
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

  // Group by course_number
  const courseGroups = React.useMemo(() => {
    const groups = new Map<number | null, { label: string; items: RichItem[] }>();

    for (const item of displayItems) {
      const course = item.course_number;
      if (!groups.has(course)) {
        groups.set(course, {
          label:
            course != null
              ? `Course ${course}${item.category_name ? ` — ${item.category_name}` : ""}`
              : item.category_name
                ? item.category_name
                : "No Course",
          items: [],
        });
      }
      groups.get(course)!.items.push(item);
    }

    // Sort: numbered courses first (ascending), then null
    return [...groups.entries()].sort(([a], [b]) => {
      if (a === null && b === null) return 0;
      if (a === null) return 1;
      if (b === null) return -1;
      return a - b;
    });
  }, [displayItems]);

  const hasCourses = courseGroups.some(([key]) => key !== null);

  const titleSuffix = [
    !isLoading && displayItems.length > 0 ? `${itemCount}` : "",
    voidedCount > 0 ? `${voidedCount} voided` : "",
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <SectionCard
      title={`Items${titleSuffix ? ` (${titleSuffix})` : ""}`}
      icon={<ShoppingBag className="h-4 w-4" />}
    >
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-10 w-3/4 rounded-lg" />
        </div>
      ) : displayItems.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">No items found</p>
      ) : (
        <div className="space-y-4">
          {courseGroups.map(([courseKey, group]) => (
            <div key={courseKey ?? "none"}>
              {/* Course header */}
              {(hasCourses || group.label !== "No Course") && (
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {group.label}
                  </span>
                  <div className="flex-1 h-px bg-border" />
                </div>
              )}

              {/* Items in this group */}
              <div className="space-y-0 divide-y">
                {group.items.map((item) => (
                  <EnhancedItemRow
                    key={item.id}
                    item={item}
                    reversals={reversals}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function EnhancedItemRow({
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

  const itemReversals = reversals?.filter(
    (r) =>
      (r.status === "completed" || r.status === "processed") &&
      r.refund_items?.some((ri) => ri.order_item_id === item.id)
  ) ?? [];

  return (
    <div
      className={cn(
        "py-3 first:pt-0 last:pb-0",
        isVoided && "bg-red-50/50 dark:bg-red-950/10 -mx-4 px-4 border-red-100 dark:border-red-900/30"
      )}
    >
      <div className="flex items-start gap-3">
        {/* Quantity badge */}
        <div
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold mt-0.5",
            isVoided
              ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
              : "bg-muted text-foreground"
          )}
        >
          {isVoided ? <Ban className="h-3.5 w-3.5" /> : qty}
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0">
          {/* Name row with badges */}
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

          {/* Modifiers inline */}
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

          {/* Qty x Price line */}
          <p
            className={cn(
              "text-xs text-muted-foreground mt-1",
              isVoided && "line-through"
            )}
          >
            Qty: {qty} &times; {formatCurrency(item.unit_price)}
          </p>

          {/* Special instructions */}
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

          {/* Kitchen status row */}
          {kitchenCfg ? (
            <div className={cn("flex items-center gap-1.5 mt-1.5 text-xs", kitchenCfg.color)}>
              {kitchenCfg.icon}
              <span className="font-medium">Kitchen: {kitchenCfg.label}</span>
              {completedTimeStr && (
                <span className="text-muted-foreground">at {completedTimeStr}</span>
              )}
            </div>
          ) : !isVoided && (
            <div className="flex items-center gap-1.5 mt-1.5 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>Kitchen: N/A</span>
            </div>
          )}

          {/* Fire time */}
          {fireTimeStr && !kitchenCfg && (
            <div className="flex items-center gap-1.5 mt-1.5 text-xs text-orange-600 dark:text-orange-400">
              <Flame className="h-3 w-3" />
              <span>Fired at {fireTimeStr}</span>
            </div>
          )}
          {fireTimeStr && kitchenCfg && item.kitchen_status !== "completed" && item.kitchen_status !== "ready" && (
            <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
              <Flame className="h-3 w-3" />
              <span>Fired at {fireTimeStr}</span>
            </div>
          )}

          {/* Discount */}
          {hasDiscount && !isVoided && (
            <div className="flex items-center gap-1.5 mt-1.5">
              <Badge
                variant="secondary"
                className="text-[10px] px-1.5 py-0 h-4 text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/30 border-0"
              >
                <Tag className="h-2.5 w-2.5 mr-0.5" />
                -{formatCurrency(discountAmount)}
                {item.discount_type === "percentage"
                  ? ""
                  : ""}
              </Badge>
              {item.discount_name && (
                <span className="text-[10px] text-muted-foreground">
                  {item.discount_name}
                </span>
              )}
            </div>
          )}

          {/* Void details */}
          {isVoided && (
            <div className="mt-2 pt-2 border-t border-dashed border-red-200 dark:border-red-800/50 space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
                <Ban className="h-3 w-3" />
                <span className="font-medium">
                  Voided{item.voided_at ? `: ${formatDate(item.voided_at)}` : ""}
                  {item.voided_by_name ? ` by ${item.voided_by_name}` : ""}
                </span>
              </div>
              {item.void_reason && (
                <p className="text-xs text-red-600/80 dark:text-red-400/80 pl-[18px]">
                  Reason: {item.void_reason}
                </p>
              )}
            </div>
          )}

          {/* Refund annotation (matched by order_item_id) */}
          {itemReversals.length > 0 && (
            <div className="mt-1.5 space-y-1">
              {itemReversals.map((rev) => {
                const matchedRefundItem = rev.refund_items?.find(
                  (ri) => ri.order_item_id === item.id
                );
                const refundAmount = matchedRefundItem?.amount ?? rev.amount;

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
                        Reason: {rev.reason_description || rev.reason_code}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Price */}
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

// ======== Main Component ========

export function OrderDetailSheet({
  order,
  open,
  onOpenChange,
  fullPageUrlPattern,
  readOnly = false,
  canRefund = true,
  canVoid = true,
}: OrderDetailSheetProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const selectedLocation = useSelectedLocation();
  const [isReceiptOpen, setIsReceiptOpen] = React.useState(false);
  const [isSendReceiptOpen, setIsSendReceiptOpen] = React.useState(false);
  const [isRefundOpen, setIsRefundOpen] = React.useState(false);
  const [isVoidOpen, setIsVoidOpen] = React.useState(false);
  const [isAdjustTipOpen, setIsAdjustTipOpen] = React.useState(false);
  const [assignCustomerOpen, setAssignCustomerOpen] = React.useState(false);
  const [removingCustomer, setRemovingCustomer] = React.useState(false);

  const { data: orderDetails, isLoading } = useQuery({
    queryKey: ["order-details", order?.id],
    queryFn: async () => {
      if (!order) return null;
      try {
        return await GetOrderDetails(order.id);
      } catch (error) {
        console.error("Error fetching order details:", error);
        return null;
      }
    },
    enabled: !!order && open,
  });

  const { data: fullHistory, isLoading: isHistoryLoading } = useQuery({
    queryKey: ["order-full-history", order?.id],
    queryFn: async (): Promise<OrderFullHistory | null> => {
      if (!order) return null;
      try {
        return await GetOrderFullHistory(order.id);
      } catch (error) {
        console.error("Error fetching full history:", error);
        return null;
      }
    },
    enabled: !!order && open,
  });

  const handleRefundSuccess = React.useCallback(() => {
    const orderId = order?.id;
    if (!orderId) return;
    queryClient.invalidateQueries({ queryKey: ["order-details", orderId] });
    queryClient.invalidateQueries({ queryKey: ["order-full-history", orderId] });
  }, [queryClient, order?.id]);

  const handleAssignCustomerSuccess = React.useCallback(() => {
    const orderId = order?.id;
    if (!orderId) return;
    queryClient.invalidateQueries({ queryKey: ["order-details", orderId] });
    queryClient.invalidateQueries({ queryKey: ["order-full-history", orderId] });
  }, [queryClient, order?.id]);

  const handleAdjustTipSuccess = React.useCallback(() => {
    const orderId = order?.id;
    if (!orderId) return;
    queryClient.invalidateQueries({ queryKey: ["order-details", orderId] });
    queryClient.invalidateQueries({ queryKey: ["order-full-history", orderId] });
  }, [queryClient, order?.id]);

  // Derive payments before early return so useMemo runs unconditionally (Rules of Hooks)
  const payments = ((orderDetails || order) as OrderResponse | null)?.order_payments ?? [];
  const eligibleTipPayments = React.useMemo(() => {
    const ELIGIBLE_STATUSES = ["captured", "paid"] as const;
    return (payments as OrderPayment[]).filter((p) => {
      const method = String(p.payment_method ?? "").toLowerCase();
      const isCard =
        method.startsWith("card_") ||
        ["card_spinapi", "card_dvpaylite", "card_manual"].includes(method);
      if (!isCard) return false;
      const status = String(p.status ?? "").toLowerCase().replace(/-/g, "_");
      if (!ELIGIBLE_STATUSES.includes(status)) return false;
      if (status === "void") return false;
      const pm = p as { is_voided?: boolean; is_settled?: boolean };
      if (pm.is_voided) return false;
      if (pm.is_settled) return false;
      return true;
    });
  }, [payments]);

  if (!order) return null;

  const displayOrder = (orderDetails || order) as OrderResponse;
  const items = (displayOrder.order_items || []) as (OrderItem & {
    order_item_modifiers?: OrderItemModifier[];
  })[];
  const tableSessions = (displayOrder.table_sessions ||
    []) as TableSessionWithEvents[];

  const handleViewMoreDetails = () => {
    onOpenChange(false);
    const url = fullPageUrlPattern
      ? fullPageUrlPattern(displayOrder.id)
      : `/dashboard/orders/${displayOrder.id}`;
    router.push(url);
  };

  // Derived metadata
  const { date, time } = formatDateShort(displayOrder.created_at);
  const isMetadataLoading = isLoading || isHistoryLoading;
  const locationName =
    fullHistory?.order?.location_name ??
    displayOrder.location?.name ??
    displayOrder.locations?.name ??
    selectedLocation?.name ??
    null;
  const createdByName =
    fullHistory?.order?.created_by_staff_name ??
    fullHistory?.order?.created_by_user_name ??
    formatStaffName(displayOrder.created_by_staff);
  const serverName =
    fullHistory?.order?.server_name ??
    formatStaffName(tableSessions[0]?.server) ??
    formatStaffName(displayOrder.assigned_server);
  const tableName =
    fullHistory?.order?.table_name ?? displayOrder.table_number ?? null;
  const partySize =
    fullHistory?.order?.party_size ?? tableSessions[0]?.party_size;
  const pricingMode =
    fullHistory?.order?.pricing_mode ?? displayOrder.payment_pricing_mode;
  const pricingLabel = getPricingModeLabel(
    pricingMode,
    displayOrder.cash_discount_applied
  );
  const stationName =
    fullHistory?.order?.station_name ??
    displayOrder.station?.station_name ??
    null;
  const isDineIn = displayOrder.order_type === "dine_in";

  // Use displayOrder only so all customer fields update together (same query)
  const customerName = displayOrder.customer_name ?? null;
  const customerPhone = displayOrder.customer_phone ?? null;
  const customerEmail = displayOrder.customer_email ?? null;
  const hasCustomer = !!(customerName || customerPhone || customerEmail);

  const notes =
    fullHistory?.order?.internal_notes ?? displayOrder.internal_notes ?? null;

  const itemCount = items.reduce((sum, i) => sum + (i.is_voided ? 0 : Number(i.quantity) || 1), 0);

  const hasRefundablePayment = (payments as OrderPayment[]).some((p) =>
    ["captured", "paid"].includes(p.status)
  );

  const canShowAdjustTip =
    !readOnly &&
    eligibleTipPayments.length > 0 &&
    displayOrder.status !== "void" &&
    displayOrder.status !== "cancelled";

  const canShowRefund =
    canRefund &&
    !readOnly &&
    displayOrder.status !== "void" &&
    displayOrder.status !== "refunded" &&
    displayOrder.status !== "cancelled" &&
    hasRefundablePayment;

  const VOID_DISABLED_STATUSES = ["completed", "void", "cancelled", "refunded"];
  const canShowVoid =
    canVoid &&
    !readOnly &&
    !VOID_DISABLED_STATUSES.includes(displayOrder.status);

  return (
    <>
      <BottomSheet open={open} onOpenChange={onOpenChange}>
        <BottomSheetContent height="95">
          {/* ─── Header ─── */}
          <BottomSheetHeader className="shrink-0">
            <div className="space-y-3">
              {/* Title row */}
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <BottomSheetTitle className="text-xl font-bold tracking-tight">
                    Order #{displayOrder.display_number || displayOrder.order_number}
                  </BottomSheetTitle>
                  <BottomSheetDescription className="flex items-center gap-2 text-xs">
                    <span>{date} at {time}</span>
                    <span className="text-muted-foreground/40">|</span>
                    <span className="flex items-center gap-1">
                      {getOrderTypeIcon(displayOrder.order_type)}
                      {formatOrderType(displayOrder.order_type)}
                    </span>
                    {locationName && (
                      <>
                        <span className="text-muted-foreground/40">|</span>
                        <span>{locationName}</span>
                      </>
                    )}
                  </BottomSheetDescription>
                </div>
                <div className="flex items-center gap-2 shrink-0 mr-8">
                  <OrderStatusBadge status={displayOrder.status} />
                  <ReprintDropdown
                    orderId={displayOrder.id}
                    locationId={displayOrder.location_id ?? null}
                    dialogElevation="high"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsSendReceiptOpen(true)}
                  >
                    <Mail className="h-4 w-4 mr-1.5" />
                    Send Receipt
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={handleViewMoreDetails}>
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Full Details
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setIsReceiptOpen(true)}>
                        <Printer className="h-4 w-4 mr-2" />
                        Print Receipt
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setIsSendReceiptOpen(true)}>
                        <Mail className="h-4 w-4 mr-2" />
                        Send Receipt
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {/* Quick-glance total bar */}
              <div className="flex items-center justify-between rounded-xl bg-primary/5 border border-primary/10 px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                    <Receipt className="h-4.5 w-4.5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {itemCount} {itemCount === 1 ? "item" : "items"}
                    </p>
                    <PaymentStatusBadge
                      status={displayOrder.payment_status}
                    />
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold tracking-tight">
                    {formatCurrency(displayOrder.total_amount)}
                  </p>
                </div>
              </div>
            </div>
          </BottomSheetHeader>

          {/* ─── Body ─── */}
          <BottomSheetBody>
            <div className="space-y-4">
              {/* Meta chips row */}
              {(() => {
                const chips: { icon: React.ReactNode; label: string; value: string | React.ReactNode }[] = [];

                if (createdByName) {
                  chips.push({
                    icon: <User className="h-3.5 w-3.5" />,
                    label: "Created by",
                    value: createdByName,
                  });
                }
                if (isDineIn && tableName) {
                  chips.push({
                    icon: <Utensils className="h-3.5 w-3.5" />,
                    label: "Table",
                    value: tableName,
                  });
                }
                if (isDineIn && serverName) {
                  chips.push({
                    icon: <User className="h-3.5 w-3.5" />,
                    label: "Server",
                    value: serverName,
                  });
                }
                if (isDineIn && partySize != null) {
                  chips.push({
                    icon: <Users className="h-3.5 w-3.5" />,
                    label: "Party",
                    value: `${partySize} guests`,
                  });
                }
                if (stationName) {
                  chips.push({
                    icon: <Store className="h-3.5 w-3.5" />,
                    label: "Station",
                    value: stationName,
                  });
                }
                if (pricingMode && pricingMode !== "card") {
                  chips.push({
                    icon: <CreditCard className="h-3.5 w-3.5" />,
                    label: "Pricing",
                    value: pricingLabel,
                  });
                }

                if (chips.length === 0 && isMetadataLoading) {
                  return (
                    <div className="grid grid-cols-2 gap-2">
                      <Skeleton className="h-12 rounded-lg" />
                      <Skeleton className="h-12 rounded-lg" />
                    </div>
                  );
                }
                if (chips.length === 0) return null;
                return (
                  <div className="grid grid-cols-2 gap-2">
                    {chips.map((chip, i) => (
                      <MetaChip key={i} {...chip} />
                    ))}
                  </div>
                );
              })()}

              {/* Internal notes */}
              {notes && (
                <div className="flex items-start gap-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 px-4 py-3">
                  <MessageSquare className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-0.5">
                      Internal Note
                    </p>
                    <p className="text-sm">&ldquo;{notes}&rdquo;</p>
                  </div>
                </div>
              )}

              {/* Customer card */}
              <SectionCard
                title="Customer"
                icon={<User className="h-4 w-4" />}
              >
                {hasCustomer ? (
                  <div className="space-y-2">
                    {customerName && (
                      <div className="flex items-center gap-2 text-sm">
                        <User className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-medium">{customerName}</span>
                      </div>
                    )}
                    {customerEmail && (
                      <div className="flex items-center gap-2 text-sm">
                        <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{customerEmail}</span>
                      </div>
                    )}
                    {customerPhone && (
                      <div className="flex items-center gap-2 text-sm">
                        <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{customerPhone}</span>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2 pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setAssignCustomerOpen(true)}
                      >
                        Change
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        disabled={removingCustomer}
                        onClick={async () => {
                          if (!displayOrder?.id) return;
                          setRemovingCustomer(true);
                          try {
                            const res = await assignCustomerToOrder({
                              orderId: displayOrder.id,
                              remove: true,
                            });
                            if (res.success) {
                              toast.success("Customer removed from order.");
                              handleAssignCustomerSuccess();
                            } else {
                              toast.error(res.error ?? "Failed to remove customer");
                            }
                          } finally {
                            setRemovingCustomer(false);
                          }
                        }}
                      >
                        {removingCustomer ? "Removing…" : "Remove"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">No customer assigned</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setAssignCustomerOpen(true)}
                    >
                      Assign Customer
                    </Button>
                  </div>
                )}
              </SectionCard>

              {/* ─── Order Items (Enhanced) ─── */}
              <EnhancedItemsSection
                items={items}
                richItems={fullHistory?.items ?? null}
                reversals={fullHistory?.reversals ?? null}
                isLoading={isLoading || isHistoryLoading}
                itemCount={itemCount}
                voidedCount={items.filter((i) => i.is_voided).length}
              />

              {/* ─── Kitchen ─── */}
              {fullHistory?.items && hasKitchenData(fullHistory.items) && (
                <SectionCard
                  title="Kitchen"
                  icon={<ChefHat className="h-4 w-4" />}
                >
                  <KitchenSection items={fullHistory.items} />
                </SectionCard>
              )}

              {/* ─── Pricing Breakdown ─── */}
              <SectionCard
                title="Summary"
                icon={<DollarSign className="h-4 w-4" />}
              >
                {(() => {
                  const cardSubtotal =
                    Number(displayOrder.card_subtotal) ||
                    displayOrder.subtotal;
                  const cashSubtotal =
                    Number(displayOrder.cash_subtotal) ||
                    displayOrder.subtotal;
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

                  const paidPayments = payments.filter(
                    (p) => p.status === "paid" || p.status === "captured"
                  );
                  const cashPayments = paidPayments
                    .filter((p) => p.payment_method === "cash")
                    .reduce(
                      (sum, p) => sum + Number(p.total_amount),
                      0
                    );
                  const cardPayments = paidPayments
                    .filter((p) => p.payment_method !== "cash")
                    .reduce(
                      (sum, p) => sum + Number(p.total_amount),
                      0
                    );
                  const totalPaid = cashPayments + cardPayments;

                  return (
                    <div className="space-y-2 text-sm">
                      {isMixedPayment ? (
                        <>
                          <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800 mb-3">
                            <DollarSign className="h-3.5 w-3.5 text-amber-600" />
                            <span className="text-xs text-amber-700 dark:text-amber-400">
                              Mixed Payment: Paid with both cash and card
                            </span>
                          </div>

                          {hasDualPricing && (
                            <div className="grid grid-cols-2 gap-2 mb-3">
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
                            <div className="flex justify-between items-center p-3 bg-green-100 dark:bg-green-900/30 rounded-lg mb-3">
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
                                value={formatCurrency(displayOrder.subtotal)}
                              />
                              {Number(displayOrder.tax_amount) > 0 && (
                                <PriceRow
                                  label="Tax"
                                  value={formatCurrency(
                                    Number(displayOrder.tax_amount)
                                  )}
                                />
                              )}
                            </>
                          )}

                          <div className="border-t pt-3 mt-3 space-y-1.5">
                            <p className="text-xs font-medium text-muted-foreground mb-1">
                              Payments
                            </p>
                            {cashPayments > 0 && (
                              <PriceRow
                                label={`Cash${hasDualPricing ? " (discounted)" : ""}`}
                                value={formatCurrency(cashPayments)}
                                valueClassName={
                                  hasDualPricing
                                    ? "text-green-600 dark:text-green-400 font-medium"
                                    : ""
                                }
                              />
                            )}
                            {cardPayments > 0 && (
                              <PriceRow
                                label={`Card${hasDualPricing ? " (full rate)" : ""}`}
                                value={formatCurrency(cardPayments)}
                              />
                            )}
                          </div>

                          <div className="border-t pt-3 mt-2">
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
                          <PriceRow
                            label="Card Subtotal"
                            value={formatCurrency(cardSubtotal)}
                            valueClassName="text-muted-foreground"
                          />
                          <PriceRow
                            label="Cash Subtotal"
                            value={formatCurrency(cashSubtotal)}
                          />
                          {totalSavings > 0 && (
                            <PriceRow
                              label="Cash Savings"
                              value={`-${formatCurrency(totalSavings)}`}
                              valueClassName="text-green-600 dark:text-green-400 font-medium"
                              className="text-green-600 dark:text-green-400"
                            />
                          )}
                          {Number(displayOrder.tax_amount) > 0 && (
                            <PriceRow
                              label="Tax"
                              value={formatCurrency(
                                Number(displayOrder.tax_amount)
                              )}
                            />
                          )}
                          {Number(displayOrder.tip_amount) > 0 && (
                            <PriceRow
                              label="Tip"
                              value={formatCurrency(
                                Number(displayOrder.tip_amount)
                              )}
                            />
                          )}
                          {Number(displayOrder.discount_amount) > 0 && (
                            <PriceRow
                              label="Discount"
                              value={`-${formatCurrency(Number(displayOrder.discount_amount))}`}
                              valueClassName="text-green-600"
                            />
                          )}
                          <div className="border-t pt-3 mt-2 space-y-1">
                            <PriceRow
                              label="Total (Card)"
                              value={formatCurrency(cardTotal)}
                              valueClassName="text-muted-foreground line-through"
                            />
                            <PriceRow
                              label="Total (Cash)"
                              value={formatCurrency(cashTotal)}
                              bold
                              className="text-base"
                            />
                          </div>
                          {totalPaid > 0 && (
                            <PriceRow
                              label="Amount Paid"
                              value={formatCurrency(totalPaid)}
                              valueClassName="text-green-600"
                            />
                          )}
                        </>
                      ) : (
                        <>
                          <PriceRow
                            label="Subtotal"
                            value={formatCurrency(displayOrder.subtotal)}
                          />
                          {Number(displayOrder.tax_amount) > 0 && (
                            <PriceRow
                              label="Tax"
                              value={formatCurrency(
                                Number(displayOrder.tax_amount)
                              )}
                            />
                          )}
                          {Number(displayOrder.tip_amount) > 0 && (
                            <PriceRow
                              label="Tip"
                              value={formatCurrency(
                                Number(displayOrder.tip_amount)
                              )}
                            />
                          )}
                          {Number(displayOrder.discount_amount) > 0 && (
                            <PriceRow
                              label="Discount"
                              value={`-${formatCurrency(Number(displayOrder.discount_amount))}`}
                              valueClassName="text-green-600"
                            />
                          )}
                          {Number(displayOrder.service_charge) > 0 && (
                            <PriceRow
                              label="Service Charge"
                              value={formatCurrency(
                                Number(displayOrder.service_charge)
                              )}
                            />
                          )}
                          <div className="border-t pt-3 mt-2">
                            <PriceRow
                              label="Total"
                              value={formatCurrency(
                                displayOrder.total_amount
                              )}
                              bold
                              className="text-base"
                            />
                          </div>
                          {totalPaid > 0 && (
                            <PriceRow
                              label="Amount Paid"
                              value={formatCurrency(totalPaid)}
                              valueClassName="text-green-600"
                            />
                          )}
                          {Number(displayOrder.amount_due) > 0 && (
                            <PriceRow
                              label="Amount Due"
                              value={formatCurrency(
                                Number(displayOrder.amount_due)
                              )}
                              valueClassName="text-amber-600"
                            />
                          )}
                        </>
                      )}
                    </div>
                  );
                })()}
              </SectionCard>

              {/* ─── Payments (Enhanced) ─── */}
              <EnhancedPaymentsSection
                basicPayments={payments}
                richPayments={fullHistory?.payments ?? null}
                isLoading={isLoading || isHistoryLoading}
                cashDiscountApplied={!!displayOrder.cash_discount_applied}
                totalDue={displayOrder.total_amount}
                orderVoidedAt={fullHistory?.order?.voided_at ?? null}
                orderVoidedByName={fullHistory?.order?.voided_by_name ?? null}
                orderVoidedBy={fullHistory?.order?.voided_by ?? null}
                orderVoidReason={fullHistory?.order?.void_reason ?? null}
                onAdjustTip={canShowAdjustTip ? () => setIsAdjustTipOpen(true) : undefined}
                showAdjustTip={canShowAdjustTip}
              />

              {/* ─── Refunds & Reversals ─── */}
              {((fullHistory?.reversals?.length ?? 0) > 0 ||
                (fullHistory?.chargebacks?.length ?? 0) > 0 ||
                isHistoryLoading) && (
                <SectionCard
                  title={`Refunds & Reversals${
                    !isHistoryLoading
                      ? ` (${(fullHistory?.reversals?.length ?? 0) + (fullHistory?.chargebacks?.length ?? 0)})`
                      : ""
                  }`}
                  icon={<RotateCcw className="h-4 w-4" />}
                >
                  <ReversalsList
                    reversals={fullHistory?.reversals ?? null}
                    chargebacks={fullHistory?.chargebacks ?? null}
                    isLoading={isHistoryLoading}
                  />
                </SectionCard>
              )}

              {/* Special Instructions */}
              {displayOrder.special_instructions && (
                <SectionCard
                  title="Special Instructions"
                  icon={<MessageSquare className="h-4 w-4" />}
                >
                  <p className="text-sm text-muted-foreground">
                    {displayOrder.special_instructions}
                  </p>
                </SectionCard>
              )}

              {/* ─── Complete Timeline ─── */}
              <SectionCard
                title="Complete Timeline"
                icon={<Clock className="h-4 w-4" />}
              >
                <OrderFullTimeline
                  fullHistory={fullHistory ?? null}
                  isLoading={isHistoryLoading}
                />
              </SectionCard>
            </div>
          </BottomSheetBody>

          {/* ─── Footer ─── */}
          <BottomSheetFooter>
            <div className="flex flex-col gap-2 w-full">
              <Button
                className="w-full"
                size="default"
                onClick={handleViewMoreDetails}
              >
                View Full Details
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  size="sm"
                  onClick={() => setIsReceiptOpen(true)}
                >
                  <Printer className="h-4 w-4 mr-1.5" />
                  Receipt
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  size="sm"
                  onClick={() => setIsSendReceiptOpen(true)}
                >
                  <Mail className="h-4 w-4 mr-1.5" />
                  Send Receipt
                </Button>
                {!readOnly && (canShowRefund || canShowVoid || canShowAdjustTip) && (
                  <>
                    {canShowAdjustTip && (
                      <Button
                        variant="outline"
                        className="flex-1"
                        size="sm"
                        onClick={() => setIsAdjustTipOpen(true)}
                      >
                        <DollarSign className="h-4 w-4 mr-1.5" />
                        Adjust Tip
                      </Button>
                    )}
                    {canShowRefund && (
                      <Button
                        variant="outline"
                        className="flex-1"
                        size="sm"
                        onClick={() => setIsRefundOpen(true)}
                      >
                        <RotateCcw className="h-4 w-4 mr-1.5" />
                        Refund
                      </Button>
                    )}
                    {canShowVoid && (
                      <Button
                        variant="destructive"
                        className="flex-1"
                        size="sm"
                        onClick={() => setIsVoidOpen(true)}
                      >
                        <Ban className="h-4 w-4 mr-1.5" />
                        Void Order
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          </BottomSheetFooter>
        </BottomSheetContent>
      </BottomSheet>

      <ReceiptModal
        order={displayOrder}
        location={selectedLocation}
        open={isReceiptOpen}
        onOpenChange={setIsReceiptOpen}
      />
      <SendReceiptModal
        order={displayOrder}
        open={isSendReceiptOpen}
        onOpenChange={setIsSendReceiptOpen}
      />
      <RefundModal
        order={displayOrder}
        fullHistory={fullHistory ?? undefined}
        open={isRefundOpen}
        onOpenChange={setIsRefundOpen}
        onSuccess={handleRefundSuccess}
      />
      <VoidModal
        order={displayOrder}
        open={isVoidOpen}
        onOpenChange={setIsVoidOpen}
        onSuccess={handleRefundSuccess}
      />
      <AssignCustomerModal
        order={displayOrder as OrderResponse & { merchant_id?: string }}
        open={assignCustomerOpen}
        onOpenChange={setAssignCustomerOpen}
        onSuccess={handleAssignCustomerSuccess}
      />
      <AdjustTipModal
        orderId={displayOrder.id}
        displayNumber={displayOrder.display_number ?? displayOrder.order_number}
        eligiblePayments={eligibleTipPayments.map((p) => ({
          id: p.id,
          amount: Number(p.amount) || 0,
          tip_amount: Number(p.tip_amount) || 0,
          total_amount: Number(p.total_amount) || 0,
          payment_method: p.payment_method,
          status: p.status,
          card_type: (p as { card_type?: string }).card_type,
          card_last_four: (p as { card_last_four?: string }).card_last_four,
        }))}
        open={isAdjustTipOpen}
        onOpenChange={setIsAdjustTipOpen}
        onSuccess={handleAdjustTipSuccess}
      />
    </>
  );
}
