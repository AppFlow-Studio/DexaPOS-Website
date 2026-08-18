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
import { DeliveryPlatformBadge } from "./DeliveryPlatformBadge";
import { cn } from "@/lib/utils";
import {
  Calendar,
  User,
  Phone,
  Utensils,
  ShoppingBag,
  Truck,
  Globe,
  QrCode,
  ChefHat,
  DollarSign,
  RotateCcw,
  MapPin,
  Store,
  Users,
  CreditCard,
  Mail,
  Clock,
  Receipt,
  MessageSquare,
  CheckCircle2,
  Flame,
  Ban,
  Tag,
  ShieldOff,
  RefreshCw,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { GetOrderDetails } from "@/app/dashboard/actions/order";
import { GetOrderFullHistory } from "@/app/dashboard/actions/order-full-history";
import { KDSRoutingTraceSection } from "@/components/dashboard/orders/KDSRoutingTraceSection";
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
import { useLocationStore, useSelectedLocation } from "@/stores/location-store";
import { orderTypeLabel } from "@/lib/constants/order-type";
import type { OrderFullHistory } from "@/types/order-full-history";
import {
  EnhancedPaymentsList,
  type RichPayment,
} from "./EnhancedPayments";
import { ReversalsList } from "./ReversalsSection";
import { KitchenSection, hasKitchenData } from "./KitchenSection";
import { SendReceiptModal } from "./SendReceiptModal";
import { AssignCustomerModal } from "./AssignCustomerModal";
import { AdjustTipModal } from "./AdjustTipModal";
import { assignCustomerToOrder } from "@/app/actions/orders/assign-customer";
import { getOrderBreakdown } from "@/lib/orders/order-breakdown";
import {
  orderSourceLabel,
  platformLabel,
  isKnownPlatform,
} from "@/lib/orderout/platform";
import { PlatformBadge } from "./PlatformBadge";
import { toast } from "sonner";

interface OrderDetailSheetProps {
  order: Order | OrderResponse | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Override the full-details page URL. Defaults to `/dashboard/orders/{id}` */
  fullPageUrlPattern?: (orderId: string) => string;
  /** When true (e.g. HQ/Carrier admin view), hide merchant-only actions */
  readOnly?: boolean;
  /**
   * Render above a parent Sheet (e.g. when opened from the Customer Profile
   * Orders tab) so it appears in the foreground instead of behind the sheet.
   */
  elevated?: boolean;
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
    qr_dine_in: <QrCode className="h-3.5 w-3.5" />,
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
  return orderTypeLabel(type);
}

function getChannelLabel(orderType: string) {
  const channels: Record<string, string> = {
    dine_in: "In-Store",
    qr_dine_in: "QR Table",
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
          <Button
            variant="outline"
            size="sm"
            className="rounded-full border-0 bg-muted/60 shadow-none hover:bg-muted"
            onClick={onAdjustTip}
          >
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
  // A section, not a card: no border, no shadow, no gradient, no boxed icon.
  // The heading carries the brand blue exactly as on the dashboard Overview,
  // and a hairline above each section does the separating. The old "SECTION"
  // eyebrow was pure noise — the title already says what this is.
  return (
    <section
      className={cn(
        "border-t border-border/60 px-1 py-7 first:border-t-0 first:pt-1",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-[1.0625rem] font-semibold text-[#0C4FD1] dark:text-[#6CA0FF]">
          {icon && <span className="shrink-0">{icon}</span>}
          <h3 className="truncate">{title}</h3>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="mt-4">{children}</div>
    </section>
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
  // Just a label over its value. No box, no tinted icon tile — the icon sits
  // inline with the label at muted weight so the value is what reads.
  return (
    <div className="min-w-0 text-sm">
      <p className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
        <span className="shrink-0 [&_svg]:h-3.5 [&_svg]:w-3.5">{icon}</span>
        {label}
      </p>
      <div className="mt-1 truncate font-medium leading-tight text-foreground">
        {value}
      </div>
    </div>
  );
}

function HeroStatCard({
  label,
  value,
  description,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: React.ReactNode;
  description?: React.ReactNode;
  icon: React.ReactNode;
  tone?: "neutral" | "primary" | "success" | "warning";
}) {
  // Tone now colors the figure alone. Previously each stat was a tinted,
  // bordered box with a bordered icon tile inside it — three nested boxes to
  // show one number. The number itself is the thing worth looking at.
  const valueStyles = {
    neutral: "text-foreground",
    primary: "text-foreground",
    success: "text-emerald-600 dark:text-emerald-400",
    warning: "text-amber-600 dark:text-amber-400",
  };

  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
        <span className="shrink-0 [&_svg]:h-3.5 [&_svg]:w-3.5">{icon}</span>
        {label}
      </p>
      <div
        className={cn(
          "mt-1 text-[1.375rem] font-medium leading-tight tracking-[-0.02em] break-words",
          valueStyles[tone]
        )}
      >
        {value}
      </div>
      {description && (
        <div className="mt-1 text-xs text-muted-foreground break-words">
          {description}
        </div>
      )}
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
      className={cn("flex items-center justify-between gap-4 py-1", className)}
    >
      <span
        className={cn(
          "text-sm text-muted-foreground",
          bold && "text-foreground font-semibold"
        )}
      >
        {label}
      </span>
      <span className={cn("text-sm", bold && "font-semibold", valueClassName)}>
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
              <div className="space-y-0 divide-y divide-border/50">
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
  elevated = false,
}: OrderDetailSheetProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { setSelectedLocation } = useLocationStore();
  const selectedLocation = useSelectedLocation();
  const [isSendReceiptOpen, setIsSendReceiptOpen] = React.useState(false);
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

  const handleViewOnFloorPlan = () => {
    if (displayOrder.location_id) {
      setSelectedLocation(displayOrder.location_id);
    }
    onOpenChange(false);
    router.push("/dashboard/tables");
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
  const isQrDineIn = displayOrder.order_type === "qr_dine_in";
  const isDineIn = displayOrder.order_type === "dine_in";
  const isTableLabeledOrder = isDineIn || isQrDineIn;

  // Use displayOrder only so all customer fields update together (same query)
  const customerName = displayOrder.customer_name ?? null;
  const customerPhone = displayOrder.customer_phone ?? null;
  const customerEmail = displayOrder.customer_email ?? null;
  const hasCustomer = !!(customerName || customerPhone || customerEmail);

  const notes =
    fullHistory?.order?.internal_notes ?? displayOrder.internal_notes ?? null;

  // ─── Channel / delivery origin ───
  // order_source is the canonical taxonomy; delivery_platform is the marketplace
  // for orderout orders. Fall back to metadata.* so rows created before the
  // backfill migration still render the platform/order-number.
  const orderMeta = (displayOrder.metadata ?? {}) as Record<string, any>;
  const orderSource = displayOrder.order_source ?? null;
  const isOrderOut =
    orderSource === "orderout" || orderMeta.provider === "orderout";
  // Show the channel section for anything that isn't plain in-store POS.
  const showChannelSection = !!orderSource && orderSource !== "pos";
  const deliveryPlatformRaw =
    displayOrder.delivery_platform ??
    (orderMeta.delivery_company as string | undefined) ??
    null;
  // True only when a real marketplace name is present (not a placeholder 'orderout').
  const hasKnownPlatform = isOrderOut && isKnownPlatform(deliveryPlatformRaw);
  const platformOrderNumber =
    displayOrder.platform_order_number ??
    (orderMeta.provider_order_id as string | undefined) ??
    null;
  const platformExternalRef =
    (orderMeta.external_reference as string | undefined) ?? null;
  const deliveryAddress = (displayOrder.delivery_address ?? null) as {
    street?: string | null;
    unit?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    delivery_notes?: string | null;
  } | null;
  const deliveryAddressLine = deliveryAddress
    ? [
        [deliveryAddress.street, deliveryAddress.unit].filter(Boolean).join(" "),
        deliveryAddress.city,
        [deliveryAddress.state, deliveryAddress.zip].filter(Boolean).join(" "),
      ]
        .filter((s) => s && String(s).trim())
        .join(", ")
    : null;
  const deliveryNotes = deliveryAddress?.delivery_notes ?? null;
  const estimatedTime =
    displayOrder.estimated_delivery_time ?? null;

  const itemCount = items.reduce(
    (sum, i) => sum + (i.is_voided ? 0 : Number(i.quantity) || 1),
    0
  );
  const voidedCount = items.filter((i) => i.is_voided).length;
  const paymentCount = payments.length;
  const totalAmount = Number(displayOrder.total_amount) || 0;
  const amountDue = Number(displayOrder.amount_due) || 0;
  const fulfillmentValue = isTableLabeledOrder
    ? tableName ?? "Dining Room"
    : formatOrderType(displayOrder.order_type);
  const fulfillmentDescription = isTableLabeledOrder
    ? [
        locationName,
        isDineIn && partySize != null ? `${partySize} guests` : null,
        isDineIn && serverName ? `Server: ${serverName}` : null,
        isQrDineIn ? "Pay-before-kitchen QR order" : null,
      ]
        .filter(Boolean)
        .join(" • ")
    : [locationName, getChannelLabel(displayOrder.order_type), stationName]
        .filter(Boolean)
        .join(" • ");
  const customerSummary = customerName ?? "Walk-in / Unassigned";
  const customerDescription =
    customerEmail ??
    customerPhone ??
    (hasCustomer
      ? "Customer attached to this order"
      : "No customer profile attached");
  const totalDescription =
    amountDue > 0
      ? `${formatCurrency(amountDue)} still due`
      : paymentCount > 0
        ? `${paymentCount} payment${paymentCount === 1 ? "" : "s"} recorded`
        : "Paid in full";
  const locationOrChannel =
    locationName ?? getChannelLabel(displayOrder.order_type);

  const metaChips: {
    icon: React.ReactNode;
    label: string;
    value: string | React.ReactNode;
  }[] = [];
  if (createdByName) {
    metaChips.push({
      icon: <User className="h-3.5 w-3.5" />,
      label: "Created by",
      value: createdByName,
    });
  }
  if (isTableLabeledOrder && tableName) {
    metaChips.push({
      icon: isQrDineIn ? <QrCode className="h-3.5 w-3.5" /> : <Utensils className="h-3.5 w-3.5" />,
      label: isQrDineIn ? "QR Table" : "Table",
      value: tableName,
    });
  }
  if (isDineIn && serverName) {
    metaChips.push({
      icon: <User className="h-3.5 w-3.5" />,
      label: "Server",
      value: serverName,
    });
  }
  if (isDineIn && partySize != null) {
    metaChips.push({
      icon: <Users className="h-3.5 w-3.5" />,
      label: "Party",
      value: `${partySize} guests`,
    });
  }
  if (stationName) {
    metaChips.push({
      icon: <Store className="h-3.5 w-3.5" />,
      label: "Station",
      value: stationName,
    });
  }
  if (pricingMode && pricingMode !== "card") {
    metaChips.push({
      icon: <CreditCard className="h-3.5 w-3.5" />,
      label: "Pricing",
      value: pricingLabel,
    });
  }

  const canShowAdjustTip =
    !readOnly &&
    eligibleTipPayments.length > 0 &&
    displayOrder.status !== "void" &&
    displayOrder.status !== "cancelled";

  return (
    <>
      <BottomSheet open={open} onOpenChange={onOpenChange} elevated={elevated}>
        <BottomSheetContent
          height="95"
          // overflow-hidden is what actually clips the footer to the rounded
          // corners: the sheet only rounds its top by default, and the footer's
          // opaque background filled the bottom corners square.
          className="border-x-0 border-t border-border/60 bg-background sm:inset-x-4 sm:bottom-4 sm:mx-auto sm:h-[calc(100dvh-2rem)] sm:max-w-6xl sm:overflow-hidden sm:rounded-[32px] sm:border"
        >
          {/* ─── Header (non-scrollable part — capped at half the sheet, scrolls internally if it overflows) ─── */}
          <BottomSheetHeader className="max-h-[50%] min-h-0 shrink-0 overflow-y-auto border-b border-border/60 bg-background px-4 pb-6 pt-2 sm:px-8">
            <div className="space-y-6">
              <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0 space-y-4 pr-10 xl:pr-0">
                  {/* The "Order Details" chip said nothing the title doesn't —
                      dropped so the two status badges read immediately. */}
                  <div className="flex flex-wrap items-center gap-2">
                    <OrderStatusBadge status={displayOrder.status} prefix="Order" />
                    <PaymentStatusBadge status={displayOrder.payment_status} prefix="Payment" />
                  </div>

                  <div className="space-y-2">
                    <BottomSheetTitle className="text-2xl font-semibold tracking-tight break-words sm:text-3xl">
                      Order #{String(displayOrder.display_number || displayOrder.order_number).replace(/^#/, "")}
                    </BottomSheetTitle>
                    <BottomSheetDescription className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />
                        {date}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" />
                        {time}
                      </span>
                      <span className="flex items-center gap-1.5 text-foreground">
                        {getOrderTypeIcon(displayOrder.order_type)}
                        {formatOrderType(displayOrder.order_type)}
                      </span>
                      {/* Delivery-marketplace chip. Uses the shared resolver
                          (lib/orders/delivery-platform) which self-gates: returns
                          null for POS / no-platform orders, so no extra guard needed. */}
                      <DeliveryPlatformBadge order={displayOrder} />
                      {locationOrChannel && (
                        <span className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5" />
                          {locationOrChannel}
                        </span>
                      )}
                    </BottomSheetDescription>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 xl:max-w-[360px] xl:justify-end">
                  {isQrDineIn && tableName ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 rounded-full border-0 bg-[#0C4FD1]/10 text-[#0C4FD1] shadow-none hover:bg-[#0C4FD1]/15 xl:flex-none"
                      onClick={handleViewOnFloorPlan}
                    >
                      <MapPin className="mr-1.5 h-4 w-4" />
                      View on Floor Plan
                    </Button>
                  ) : null}
                </div>
              </div>

              {/* Hero stats. Boxes gone, so a hairline above the row and
                  generous column gaps do the separating instead. */}
              <div className="grid gap-x-10 gap-y-5 border-t border-border/60 pt-5 sm:grid-cols-2 lg:grid-cols-3">
                <HeroStatCard
                  label="Order Total"
                  value={formatCurrency(totalAmount)}
                  description={totalDescription}
                  icon={<Receipt className="h-5 w-5" />}
                  tone={amountDue > 0 ? "warning" : "success"}
                />
                <HeroStatCard
                  label={isTableLabeledOrder ? (isQrDineIn ? "QR Table" : "Table") : "Fulfillment"}
                  value={fulfillmentValue}
                  description={
                    fulfillmentDescription ||
                    (isTableLabeledOrder
                      ? "Dining room service details"
                      : "Order channel details")
                  }
                  icon={
                    isTableLabeledOrder ? (
                      isQrDineIn ? <QrCode className="h-5 w-5" /> : <Utensils className="h-5 w-5" />
                    ) : (
                      <span className="flex h-5 w-5 items-center justify-center">
                        {getOrderTypeIcon(displayOrder.order_type)}
                      </span>
                    )
                  }
                  tone="primary"
                />
                <HeroStatCard
                  label="Customer"
                  value={customerSummary}
                  description={customerDescription}
                  icon={<User className="h-5 w-5" />}
                />
              </div>
            </div>
          </BottomSheetHeader>

          {/* ─── Body ─── */}
          <BottomSheetBody className="bg-transparent px-4 py-6 sm:px-8">
            <div>
              {metaChips.length === 0 && isMetadataLoading ? (
                <div className="grid grid-cols-1 gap-x-10 gap-y-5 pb-2 sm:grid-cols-2 xl:grid-cols-3">
                  <Skeleton className="h-10" />
                  <Skeleton className="h-10" />
                  <Skeleton className="h-10" />
                </div>
              ) : metaChips.length > 0 ? (
                <div className="grid grid-cols-1 gap-x-10 gap-y-5 pb-2 sm:grid-cols-2 xl:grid-cols-3">
                  {metaChips.map((chip, i) => (
                    <MetaChip key={i} {...chip} />
                  ))}
                </div>
              ) : null}

              {/* Internal note. Keeps its amber tint (it's a genuine callout)
                  but loses the border, shadow and boxed icon. */}
              {notes && (
                <div className="mt-6 rounded-2xl bg-amber-50 px-4 py-3.5 dark:bg-amber-950/20">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                    <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                    Internal note
                  </p>
                  <p className="mt-1 text-sm text-foreground">{notes}</p>
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
                        {removingCustomer ? "Removing..." : "Remove"}
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

              {/* ─── Delivery / Channel (online + delivery-app orders) ─── */}
              {showChannelSection && (
                <SectionCard
                  title={isOrderOut ? "Delivery / Channel" : "Channel"}
                  icon={isOrderOut ? <Truck className="h-4 w-4" /> : <Globe className="h-4 w-4" />}
                >
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      <MetaChip
                        icon={<Globe className="h-3.5 w-3.5" />}
                        label="Source"
                        value={orderSourceLabel(orderSource) || "—"}
                      />
                      {hasKnownPlatform && (
                        <MetaChip
                          icon={
                            <PlatformBadge
                              platform={deliveryPlatformRaw}
                              size={18}
                              iconOnly
                            />
                          }
                          label="Platform"
                          value={platformLabel(deliveryPlatformRaw)}
                        />
                      )}
                      {platformOrderNumber && (
                        <MetaChip
                          icon={<Receipt className="h-3.5 w-3.5" />}
                          label="Platform order #"
                          value={platformOrderNumber}
                        />
                      )}
                      {platformExternalRef && (
                        <MetaChip
                          icon={<Receipt className="h-3.5 w-3.5" />}
                          label="External reference"
                          value={platformExternalRef}
                        />
                      )}
                      {estimatedTime && (
                        <MetaChip
                          icon={<Clock className="h-3.5 w-3.5" />}
                          label="Estimated ready / delivery"
                          value={formatDate(estimatedTime)}
                        />
                      )}
                    </div>

                    {(deliveryAddressLine || deliveryNotes) && (
                      <div className="rounded-2xl border border-border/60 bg-background/80 px-4 py-3 shadow-sm">
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                          Delivery
                        </p>
                        {deliveryAddressLine && (
                          <div className="flex items-start gap-2 text-sm">
                            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <span>{deliveryAddressLine}</span>
                          </div>
                        )}
                        {deliveryNotes && (
                          <div className="mt-2 flex items-start gap-2 text-sm text-muted-foreground">
                            <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span className="italic">&ldquo;{deliveryNotes}&rdquo;</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </SectionCard>
              )}

              {/* ─── Order Items (Enhanced) ─── */}
              <EnhancedItemsSection
                items={items}
                richItems={fullHistory?.items ?? null}
                reversals={fullHistory?.reversals ?? null}
                isLoading={isLoading || isHistoryLoading}
                itemCount={itemCount}
                voidedCount={voidedCount}
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

              {/* ─── KDS Routing (where each fired item was routed) ─── */}
              <KDSRoutingTraceSection
                orderId={order?.id}
                enabled={open}
                variant="sheet"
              />

              {/* ─── Pricing Breakdown ─── */}
              <SectionCard
                title="Summary"
                icon={<DollarSign className="h-4 w-4" />}
              >
                {(() => {
                  // Single source of truth: one consistent pricing track per
                  // render. The breakdown ladder always foots; the alternate
                  // lane and split tenders are shown as separate context rows.
                  const b = getOrderBreakdown(displayOrder, payments);
                  const lane = b.primary;
                  const isMixedPayment =
                    displayOrder.payment_pricing_mode === "mixed" ||
                    b.charged === "mixed";
                  const laneLabel = b.display === "cash" ? "Cash" : "Card";
                  const cashSavings = b.card.total - b.cash.total;

                  const paidPayments = payments.filter(
                    (p) => p.status === "paid" || p.status === "captured"
                  );
                  const cashPayments = paidPayments
                    .filter((p) => p.payment_method === "cash")
                    .reduce((sum, p) => sum + Number(p.total_amount), 0);
                  const cardPayments = paidPayments
                    .filter((p) => p.payment_method !== "cash")
                    .reduce((sum, p) => sum + Number(p.total_amount), 0);

                  return (
                    <div className="space-y-2 text-sm">
                      {isMixedPayment && (
                        <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800 mb-3">
                          <DollarSign className="h-3.5 w-3.5 text-amber-600" />
                          <span className="text-xs text-amber-700 dark:text-amber-400">
                            Mixed Payment: Paid with both cash and card
                          </span>
                        </div>
                      )}

                      {/* Footing ladder — every line from the charged track */}
                      <PriceRow
                        label="Subtotal"
                        value={formatCurrency(lane.subtotal)}
                      />
                      {lane.discount > 0 && (
                        <PriceRow
                          label="Discount"
                          value={`-${formatCurrency(lane.discount)}`}
                          valueClassName="text-green-600"
                        />
                      )}
                      {lane.serviceCharge > 0 && (
                        <PriceRow
                          label="Service Charge"
                          value={formatCurrency(lane.serviceCharge)}
                        />
                      )}
                      {lane.tax > 0 && (
                        <PriceRow label="Tax" value={formatCurrency(lane.tax)} />
                      )}
                      {lane.tip > 0 && (
                        <PriceRow label="Tip" value={formatCurrency(lane.tip)} />
                      )}
                      {b.mixedCashDiscount > 0 && (
                        <PriceRow
                          label="Cash Discount"
                          value={`-${formatCurrency(b.mixedCashDiscount)}`}
                          valueClassName="text-green-600 dark:text-green-400 font-medium"
                        />
                      )}
                      <div className="border-t pt-3 mt-2">
                        <PriceRow
                          label={
                            isMixedPayment
                              ? "Total"
                              : b.dual
                              ? `Total (${laneLabel})`
                              : "Total"
                          }
                          value={formatCurrency(
                            isMixedPayment && lane.amountPaid > 0
                              ? lane.amountPaid
                              : lane.total
                          )}
                          bold
                          className="text-base"
                          valueClassName={
                            !isMixedPayment && b.display === "card"
                              ? "text-[#0C4FD1]"
                              : undefined
                          }
                        />
                      </div>

                      {b.dual && !isMixedPayment && cashSavings > 0 && (
                        <PriceRow
                          label="Cash savings"
                          value={`-${formatCurrency(cashSavings)}`}
                          valueClassName="text-green-600 dark:text-green-400 font-medium"
                        />
                      )}

                      {isMixedPayment && (
                        <div className="border-t pt-3 mt-3 space-y-1.5">
                          <p className="text-xs font-medium text-muted-foreground mb-1">
                            Tendered
                          </p>
                          {cashPayments > 0 && (
                            <PriceRow
                              label="Cash"
                              value={formatCurrency(cashPayments)}
                              valueClassName="text-green-600 dark:text-green-400 font-medium"
                            />
                          )}
                          {cardPayments > 0 && (
                            <PriceRow
                              label="Card"
                              value={formatCurrency(cardPayments)}
                            />
                          )}
                        </div>
                      )}

                      {!isMixedPayment && lane.amountPaid > 0 && (
                        <PriceRow
                          label="Amount Paid"
                          value={formatCurrency(lane.amountPaid)}
                          valueClassName="text-green-600"
                        />
                      )}
                      {lane.amountDue > 0 && (
                        <PriceRow
                          label="Amount Due"
                          value={formatCurrency(lane.amountDue)}
                          valueClassName="text-amber-600"
                        />
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
          {/* Send Receipt lives here rather than in the header, where it sat
              under the close button and collided with it. */}
          <BottomSheetFooter className="border-t border-border/60 bg-background px-6 py-5 sm:px-8">
            <div className="flex w-full flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <Button
                className="w-full rounded-full lg:w-auto"
                size="default"
                onClick={handleViewMoreDetails}
              >
                View Full Details
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                <Button
                  variant="outline"
                  className="rounded-full border-0 bg-muted/60 shadow-none hover:bg-muted"
                  size="sm"
                  onClick={() => setIsSendReceiptOpen(true)}
                >
                  <Mail className="mr-1.5 h-4 w-4" />
                  Send Receipt
                </Button>
                {!readOnly && canShowAdjustTip && (
                  <Button
                    variant="outline"
                    className="rounded-full border-0 bg-muted/60 shadow-none hover:bg-muted"
                    size="sm"
                    onClick={() => setIsAdjustTipOpen(true)}
                  >
                    <DollarSign className="mr-1.5 h-4 w-4" />
                    Adjust Tip
                  </Button>
                )}
              </div>
            </div>
          </BottomSheetFooter>
        </BottomSheetContent>
      </BottomSheet>

      <SendReceiptModal
        order={displayOrder}
        open={isSendReceiptOpen}
        onOpenChange={setIsSendReceiptOpen}
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
