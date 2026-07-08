"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  QrCode,
  ChefHat,
  Printer,
  X,
  RotateCcw,
  CreditCard,
  Clock,
  Store,
  Mail,
  Users,
  ChevronRight,
  ChevronDown,
  Ban,
  Tag,
  Flame,
  CheckCircle2,
  RefreshCw,
  ShieldOff,
  Code2,
  MessageSquare,
  AlertTriangle,
  MapPin,
  DollarSign,
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
import { DeliveryPlatformBadge } from "@/components/dashboard/orders/DeliveryPlatformBadge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { OrderFullTimeline } from "@/components/dashboard/orders/OrderFullTimeline";
import { EnhancedPaymentsList } from "@/components/dashboard/orders/EnhancedPayments";
import { ReversalsList } from "@/components/dashboard/orders/ReversalsSection";
import {
  KitchenSection,
  hasKitchenData,
} from "@/components/dashboard/orders/KitchenSection";
import { GetOrderDetails } from "@/app/dashboard/actions/order";
import { useOrderFullHistory } from "@/app/dashboard/hooks/useOrderFullHistory";
import { OrderFullHistoryDebugViewer } from "@/components/dashboard/orders/OrderFullHistoryDebugViewer";
import { SendReceiptModal } from "@/components/dashboard/orders/SendReceiptModal";
import { AssignCustomerModal } from "@/components/dashboard/orders/AssignCustomerModal";
import { AdjustTipModal } from "@/components/dashboard/orders/AdjustTipModal";
import { OrderActionBar } from "@/components/dashboard/orders/OrderActionBar";
import { assignCustomerToOrder } from "@/app/actions/orders/assign-customer";
import { getOrderBreakdown } from "@/lib/orders/order-breakdown";
import { useOrderActions } from "@/app/dashboard/hooks/useOrderActions";
import type { OrderActionsUserRole } from "@/app/dashboard/hooks/useOrderActions";
import { useLocationStore } from "@/stores/location-store";
import { toast } from "sonner";

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
  /** User role for action visibility. Derived from adminViewType when readOnly. */
  userRole?: OrderActionsUserRole;
  /** Permission codes from role_permissions. Empty = assume full merchant access. */
  permissions?: string[];
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

/** Format date and time; optionally in a given IANA timezone (e.g. "America/New_York"). */
function formatDateInTimezone(
  dateString: string,
  timezone?: string | null
): { date: string; time: string } {
  const date = new Date(dateString);
  const opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
  };
  const timeOpts: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
  };
  const dateStr = timezone
    ? date.toLocaleString("en-US", { ...opts, timeZone: timezone })
    : date.toLocaleDateString("en-US", opts);
  const timeStr = timezone
    ? date.toLocaleString("en-US", { ...timeOpts, timeZone: timezone })
    : date.toLocaleTimeString("en-US", timeOpts);
  return { date: dateStr, time: timeStr };
}

function orderChannelLabel(orderType: string): string {
  const map: Record<string, string> = {
    dine_in: "Dine-In",
    qr_dine_in: "QR Table",
    takeout: "Pickup",
    delivery: "Delivery",
    online: "Online",
    catering: "Catering",
  };
  return map[orderType] ?? orderType;
}

/** Format phone for display: 10-digit US as (555) 123-4567, else as-is */
function formatPhoneDisplay(phone: string | null | undefined): string {
  if (!phone || typeof phone !== "string") return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return phone;
}

function formatOrderType(type: string) {
  const labels: Record<string, string> = {
    dine_in: "Dine-In",
    qr_dine_in: "QR Dine-In",
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
    qr_dine_in: <QrCode className="h-4 w-4" />,
    takeout: <ShoppingBag className="h-4 w-4" />,
    delivery: <Truck className="h-4 w-4" />,
    online: <Globe className="h-4 w-4" />,
    catering: <ChefHat className="h-4 w-4" />,
  };
  return icons[type] || <ShoppingBag className="h-4 w-4" />;
}

type KitchenStatus = "new" | "preparing" | "ready" | "completed" | string;

function kitchenStatusConfig(status: KitchenStatus | null | undefined): {
  label: string;
  labelWithTime?: (time: string) => string;
  icon: React.ReactNode;
  color: string;
} | null {
  if (!status) return null;
  const map: Record<
    string,
    { label: string; icon: React.ReactNode; color: string; labelWithTime?: (time: string) => string }
  > = {
    new: {
      label: "New",
      icon: <span className="inline-block w-2 h-2 rounded-full bg-yellow-500 shrink-0" aria-hidden />,
      color: "text-yellow-700 dark:text-yellow-400",
    },
    preparing: {
      label: "Preparing",
      icon: <span className="inline-block w-2 h-2 rounded-full bg-blue-500 shrink-0" aria-hidden />,
      color: "text-blue-600 dark:text-blue-400",
    },
    ready: {
      label: "Ready for pickup",
      icon: <span className="inline-block w-2 h-2 rounded-full bg-orange-500 shrink-0" aria-hidden />,
      color: "text-orange-600 dark:text-orange-400",
    },
    completed: {
      label: "Completed",
      labelWithTime: (time) => `Completed at ${time}`,
      icon: <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400 shrink-0" />,
      color: "text-emerald-600 dark:text-emerald-400",
    },
  };
  return (
    map[status] ?? {
      label: status,
      icon: <Clock className="h-3 w-3 shrink-0" />,
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
/** Optional refund_info from API; when present, used for refund annotations instead of reversals */
type RefundInfoItem = {
  amount: number;
  method?: string | null;
  completed_at?: string | null;
};
type DisplayItem = RichItem & {
  selected_size_name?: string | null;
  refund_info?: RefundInfoItem[];
};
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

function PricingModeBadge({
  mode,
}: {
  mode: "card" | "cash" | "mixed" | null | undefined;
}) {
  if (!mode) return null;
  const config: Record<
    string,
    { label: string; className: string }
  > = {
    card: {
      label: "Card Only",
      className: "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-200 dark:border-blue-700",
    },
    cash: {
      label: "Cash Only",
      className: "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-200 dark:border-green-700",
    },
    mixed: {
      label: "Dual (Cash Discount)",
      className: "bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/30 dark:text-purple-200 dark:border-purple-700",
    },
  };
  const c = config[mode] ?? { label: mode, className: "bg-muted text-muted-foreground" };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
        c.className
      )}
    >
      {c.label}
    </span>
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
  const displayItems: DisplayItem[] = useRich
    ? richItems.map((r) => ({ ...r, selected_size_name: null }))
    : items.map((item) => {
        const o = item as OrderItem & { selected_size_name?: string };
        return {
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
          is_open_item: Boolean((o as { is_open_item?: boolean }).is_open_item),
          is_tax_exempt: Boolean((o as { is_tax_exempt?: boolean }).is_tax_exempt),
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
          selected_size_name: o.selected_size_name ?? null,
        };
      });

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
              : "No Course",
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
  const totalItems = displayItems.length;
  const totalUnits = displayItems.reduce((s, i) => s + i.quantity, 0);
  const voidedCount = displayItems.filter((i) => i.is_voided).length;
  const completedReversals = reversals?.filter(
    (r) => r.status === "completed" || r.status === "processed"
  ) ?? [];
  const orderLevelReversals = completedReversals.filter(
    (r) => !r.refund_items || r.refund_items.length === 0
  );

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
      <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
        <span className="font-medium text-foreground">
          {totalItems} item{totalItems !== 1 ? "s" : ""}
          {totalUnits !== totalItems ? ` (${totalUnits} units)` : ""}
        </span>
        {voidedCount > 0 && (
          <>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">
              {voidedCount} voided
            </span>
          </>
        )}
      </div>
      {courseGroups.map(([courseKey, group]) => (
        <div key={courseKey ?? "none"}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {group.label}
            </span>
            <div className="flex-1 h-px bg-border" />
          </div>
          <div className="space-y-0 divide-y rounded-lg border">
            {group.items.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                reversals={reversals}
                orderLevelReversals={orderLevelReversals}
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
  orderLevelReversals = [],
}: {
  item: DisplayItem;
  reversals: Reversal[] | null;
  orderLevelReversals?: Reversal[];
}) {
  const isVoided = item.is_voided;
  const qty = item.quantity;
  const discountAmount = Number(item.discount_amount) || 0;
  const hasDiscount = discountAmount > 0;
  const kitchenCfg = kitchenStatusConfig(item.kitchen_status);
  const fireTimeStr = formatShortTime(item.fire_time);
  const completedTimeStr = formatShortTime(item.completed_at);
  const sizeName = item.selected_size_name ?? null;

  const itemReversals =
    reversals?.filter(
      (r) =>
        (r.status === "completed" || r.status === "processed") &&
        r.refund_items?.some((ri) => ri.order_item_id === item.id)
    ) ?? [];

  // Refund annotations: from item.refund_info[] when present, else from reversals; include order-level refunds (no refund_items)
  const refundAnnotations: { amount: number; method: string; date: string; reason?: string; who?: string }[] =
    item.refund_info?.length
      ? item.refund_info.map((r) => ({
          amount: r.amount,
          method: r.method ?? "—",
          date: r.completed_at ? formatDate(r.completed_at) : "",
        }))
      : itemReversals.map((rev) => {
          const matched = rev.refund_items?.find((ri) => ri.order_item_id === item.id);
          const amount = matched?.amount ?? rev.amount;
          const method = rev.original_card_last_four
            ? `****${rev.original_card_last_four}`
            : rev.original_payment_method ?? "—";
          const date = rev.completed_at ? formatDate(rev.completed_at) : "";
          const reason = matched?.reason ?? rev.reason_description ?? rev.reason_code ?? undefined;
          const who = rev.initiated_by_name ?? rev.approved_by_name ?? undefined;
          return { amount, method, date, reason, who };
        });
  const orderLevelRefunds = orderLevelReversals.map((rev) => ({
    amount: rev.amount,
    method: rev.original_card_last_four
      ? `****${rev.original_card_last_four}`
      : rev.original_payment_method ?? "—",
    date: rev.completed_at ? formatDate(rev.completed_at) : "",
    reason: rev.reason_description ?? rev.reason_code ?? undefined,
    who: rev.initiated_by_name ?? rev.approved_by_name ?? undefined,
  }));
  const allRefundAnnotations = [...refundAnnotations, ...orderLevelRefunds];

  const kitchenLabel =
    kitchenCfg && item.kitchen_status === "completed" && completedTimeStr && kitchenCfg.labelWithTime
      ? kitchenCfg.labelWithTime(completedTimeStr)
      : kitchenCfg?.label ?? null;
  const preparingTimeStr = formatShortTime(item.preparing_at);
  const readyTimeStr = formatShortTime(item.ready_at);
  const kitchenStatusWithTime =
    kitchenLabel &&
    (item.kitchen_status === "preparing" && preparingTimeStr
      ? `Preparing since ${preparingTimeStr}`
      : item.kitchen_status === "ready" && readyTimeStr
        ? `Ready for pickup at ${readyTimeStr}`
        : kitchenLabel);

  return (
    <div
      className={cn(
        "px-4 py-3",
        isVoided && "bg-red-50/50 dark:bg-red-950/10 opacity-50"
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
          {/* Item name + price (right-aligned) */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
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
                    className="text-[10px] px-1.5 py-0 h-4 border-blue-300 text-blue-700 dark:text-blue-400"
                  >
                    <ShieldOff className="h-2.5 w-2.5 mr-0.5" />
                    Tax Exempt
                  </Badge>
                )}
              </div>
              {sizeName && (
                <p className={cn("text-xs text-muted-foreground mt-0.5", isVoided && "line-through")}>
                  {sizeName}
                </p>
              )}
            </div>
            <p
              className={cn(
                "text-sm font-semibold shrink-0",
                isVoided && "text-muted-foreground line-through"
              )}
            >
              {formatCurrency(item.subtotal)}
            </p>
          </div>

          {/* Modifiers: + Modifier Group: Modifier Name (+$0.50) */}
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
                  {mod.modifier_group_name && `${mod.modifier_group_name}: `}
                  {mod.modifier_name}
                  {mod.quantity > 1 && ` (x${mod.quantity})`}
                  {mod.price_modifier !== 0 && (
                    <span className="ml-1 text-muted-foreground/80">
                      ({mod.price_modifier > 0 ? "+" : ""}{formatCurrency(mod.price_modifier)})
                    </span>
                  )}
                </p>
              ))}
            </div>
          )}

          {/* Special instructions in italic */}
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

          {/* Kitchen status with icon + label + timestamp */}
          {item.kitchen_status != null ? (
            <div
              className={cn(
                "flex items-center gap-1.5 mt-1.5 text-xs",
                kitchenCfg?.color ?? "text-muted-foreground"
              )}
            >
              {kitchenCfg?.icon}
              <span className="font-medium">
                {kitchenStatusWithTime ?? kitchenCfg?.label ?? item.kitchen_status}
              </span>
            </div>
          ) : (
            !isVoided && (
              <div className="flex items-center gap-1.5 mt-1.5 text-xs text-muted-foreground">
                <span aria-hidden>—</span>
                <span>No kitchen tracking</span>
              </div>
            )
          )}

          {/* Fire time — show when set */}
          {fireTimeStr && (
            <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
              <Flame className="h-3 w-3 shrink-0" />
              <span>Fired at {fireTimeStr}</span>
            </div>
          )}

          {/* Discount: 🏷 {discount_name}: -$X.XX */}
          {hasDiscount && !isVoided && (
            <div className="flex items-center gap-1.5 mt-1.5 text-xs">
              <Tag className="h-3 w-3 text-green-600 dark:text-green-400 shrink-0" />
              <span className="text-green-700 dark:text-green-400">
                {item.discount_name ? `${item.discount_name}: ` : ""}
                -{formatCurrency(discountAmount)}
              </span>
            </div>
          )}

          {/* Void detail: who voided, when, reason — muted detail row */}
          {isVoided && (
            <div className="mt-2 pt-2 border-t border-border/50 space-y-0.5">
              <p className="text-[11px] text-muted-foreground leading-snug">
                Voided
                {item.voided_at ? ` ${formatDate(item.voided_at)}` : ""}
                {item.voided_by_name ? ` by ${item.voided_by_name}` : ""}
                {item.void_reason ? `. Reason: ${item.void_reason}` : ""}
              </p>
            </div>
          )}

          {/* Refund annotations: from refund_info[] or reversals — 🔄 Refunded: $X.XX → {method} on {date} */}
          {allRefundAnnotations.length > 0 && (
            <div className="mt-1.5 space-y-1">
              {allRefundAnnotations.map((ref, idx) => (
                <div key={idx} className="space-y-0.5">
                  <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                    <RefreshCw className="h-3 w-3 shrink-0" />
                    <span>
                      Refunded: {formatCurrency(ref.amount)} → {ref.method}
                      {ref.date ? ` on ${ref.date}` : ""}
                    </span>
                  </div>
                  {(ref.who || ref.reason) && (
                    <p className="text-[11px] text-muted-foreground pl-5 leading-snug">
                      {ref.who && `by ${ref.who}`}
                      {ref.who && ref.reason && ". "}
                      {ref.reason && `Reason: ${ref.reason}`}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Pricing Breakdown (sticky bottom) ───

/** Format as $X.XX with 2 decimal places */
function formatMoney(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function PricingBreakdown({
  order,
  payments,
  fullHistoryOrder,
}: {
  order: OrderResponse;
  payments: OrderPayment[];
  fullHistoryOrder?: OrderFullHistory["order"] | null;
}) {
  const pricingMode =
    (fullHistoryOrder?.pricing_mode as "card" | "cash" | "mixed") ??
    order.payment_pricing_mode ??
    null;
  const isMixed = pricingMode === "mixed";

  // Single source of truth: each pricing lane is assembled from its own track
  // columns (so it foots), and the lane actually charged drives the headline.
  const breakdown = getOrderBreakdown(order, payments);
  const cardLane = breakdown.card;
  const cashLane = breakdown.cash;
  const primaryLane = breakdown.primary;
  const laneLabel = breakdown.display === "cash" ? "Cash" : "Card";

  const cashSavings = cardLane.total - cashLane.total;
  const discountAmount = primaryLane.discount;

  // Tip shown is what was actually captured at tender (may post-date the total).
  const tipTotal = payments.reduce(
    (sum, p) => sum + (Number(p.tip_amount) || 0),
    0
  );
  const amountPaid =
    fullHistoryOrder?.amount_paid != null
      ? Number(fullHistoryOrder.amount_paid)
      : Number(order.amount_paid) || 0;

  // `effective_total` is always card_total and would show a phantom Amount Due
  // on cash orders; the charged lane's own total is authoritative.
  const chargedTotal = primaryLane.total;
  const displayAmountDue = Math.max(0, chargedTotal - amountPaid);

  const showDualColumns = isMixed;

  return (
    <div className="sticky bottom-0 z-10 border-t bg-white shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1),0_-2px_4px_-2px_rgba(0,0,0,0.1)] dark:bg-background dark:shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.3)]">
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        {/* Compact: small screens — Total, Amount Paid, Amount Due only */}
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-sm md:hidden">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <PriceRow label="Total" value={formatMoney(chargedTotal)} bold />
            <PriceRow
              label="Amount Paid"
              value={formatMoney(amountPaid)}
              valueClassName="text-green-600 dark:text-green-400"
            />
            <PriceRow
              label="Amount Due"
              value={formatMoney(displayAmountDue)}
              valueClassName={cn(
                displayAmountDue > 0 && "text-red-600 dark:text-red-400 font-semibold"
              )}
            />
          </div>
        </div>

        {/* Full: medium and up — full breakdown */}
        <div className="hidden md:block">
          {showDualColumns ? (
            <>
              {/* Two self-consistent lanes — each column foots on its own track */}
              <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    If all card
                  </p>
                  <PriceRow
                    label="Subtotal"
                    value={formatMoney(cardLane.subtotal)}
                  />
                  {discountAmount > 0 && (
                    <PriceRow
                      label="Discount"
                      value={formatMoney(-discountAmount)}
                    />
                  )}
                  {cardLane.serviceCharge > 0 && (
                    <PriceRow
                      label="Service Charge"
                      value={formatMoney(cardLane.serviceCharge)}
                    />
                  )}
                  <PriceRow label="Tax" value={formatMoney(cardLane.tax)} />
                  <PriceRow
                    label="Total (Card)"
                    value={formatMoney(cardLane.total)}
                    bold
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-green-700 dark:text-green-400">
                    If all cash
                  </p>
                  <PriceRow
                    label="Subtotal"
                    value={formatMoney(cashLane.subtotal)}
                  />
                  {discountAmount > 0 && (
                    <PriceRow
                      label="Discount"
                      value={formatMoney(-discountAmount)}
                    />
                  )}
                  {cashLane.serviceCharge > 0 && (
                    <PriceRow
                      label="Service Charge"
                      value={formatMoney(cashLane.serviceCharge)}
                    />
                  )}
                  <PriceRow label="Tax" value={formatMoney(cashLane.tax)} />
                  <PriceRow
                    label="Total (Cash)"
                    value={formatMoney(cashLane.total)}
                    bold
                    valueClassName="text-green-700 dark:text-green-400"
                  />
                </div>
              </div>
              <div className="my-2 border-t border-border" />
              <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
                <div className="space-y-1">
                  {cashSavings > 0 && (
                    <PriceRow
                      label="Cash Savings"
                      value={formatMoney(-cashSavings)}
                      valueClassName="text-teal-600 dark:text-teal-400 font-medium"
                    />
                  )}
                  {tipTotal > 0 && (
                    <PriceRow label="Tip" value={formatMoney(tipTotal)} />
                  )}
                </div>
                <div className="space-y-1">
                  <PriceRow
                    label="Amount Paid"
                    value={formatMoney(amountPaid)}
                    valueClassName="text-green-600 dark:text-green-400"
                  />
                  <PriceRow
                    label="Amount Due"
                    value={formatMoney(displayAmountDue)}
                    valueClassName={cn(
                      displayAmountDue > 0 && "text-red-600 dark:text-red-400 font-semibold"
                    )}
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Single track — every line foots to the displayed Total */}
              <div className="space-y-1 text-sm">
                <PriceRow
                  label="Subtotal"
                  value={formatMoney(primaryLane.subtotal)}
                />
                {discountAmount > 0 && (
                  <PriceRow
                    label="Discount"
                    value={formatMoney(-discountAmount)}
                  />
                )}
                {primaryLane.serviceCharge > 0 && (
                  <PriceRow
                    label="Service Charge"
                    value={formatMoney(primaryLane.serviceCharge)}
                  />
                )}
                <PriceRow label="Tax" value={formatMoney(primaryLane.tax)} />
                {tipTotal > 0 && (
                  <PriceRow label="Tip" value={formatMoney(tipTotal)} />
                )}
              </div>
              <div className="my-2 border-t border-border" />
              <div className="space-y-1 text-sm">
                <PriceRow
                  label={breakdown.dual ? `Total (${laneLabel})` : "Total"}
                  value={formatMoney(chargedTotal)}
                  bold
                />
                {breakdown.dual && cashSavings > 0 && (
                  <PriceRow
                    label="Cash savings"
                    value={formatMoney(-cashSavings)}
                    valueClassName="text-teal-600 dark:text-teal-400 font-medium"
                  />
                )}
                <PriceRow
                  label="Amount Paid"
                  value={formatMoney(amountPaid)}
                  valueClassName="text-green-600 dark:text-green-400"
                />
                <PriceRow
                  label="Amount Due"
                  value={formatMoney(displayAmountDue)}
                  valueClassName={cn(
                    displayAmountDue > 0 && "text-red-600 dark:text-red-400 font-semibold"
                  )}
                />
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
  orderId,
}: {
  fullHistory: OrderFullHistory | null;
  isLoading: boolean;
  orderId: string;
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
    <OrderFullHistoryDebugViewer data={fullHistory} orderId={orderId} />
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
  userRole: userRoleProp,
  permissions = [],
}: OrderDetailFullPageProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { setSelectedLocation } = useLocationStore();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [isAdjustTipOpen, setIsAdjustTipOpen] = React.useState(false);
  const [assignCustomerOpen, setAssignCustomerOpen] = React.useState(false);
  const [removingCustomer, setRemovingCustomer] = React.useState(false);
  const [isSendReceiptOpen, setIsSendReceiptOpen] = React.useState(false);

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

  const derivedUserRole: OrderActionsUserRole =
    userRoleProp ??
    (readOnly && adminViewType
      ? adminViewType === "hq"
        ? "hq_admin"
        : "carrier_admin"
      : "merchant");

  const richPayments = fullHistory?.payments ?? null;
  const items: (OrderItem & { order_item_modifiers?: OrderItemModifier[] })[] =
    orderDetails?.order_items || [];
  const payments: OrderPayment[] = orderDetails?.order_payments || [];

  const paymentsForActions = richPayments ??
    (payments.map((p) => ({
      ...p,
      id: p.id,
      payment_method: p.payment_method,
      amount: Number(p.amount) || 0,
      tip_amount: Number(p.tip_amount) || 0,
      total_amount: Number(p.total_amount) || 0,
      status: p.status,
      created_at: p.created_at ?? "",
    })) as OrderFullHistory["payments"]);

  const orderActions = useOrderActions({
    order:
      fullHistory?.order ??
      (order ? (order as unknown as OrderFullHistory["order"]) : null),
    payments: paymentsForActions,
    userRole: derivedUserRole,
    permissions,
    readOnly: !!readOnly,
  });

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
  const deviceDisplay =
    order?.station?.device_name ??
    (fullHistory?.order?.device_id
      ? String(fullHistory.order.device_id).length > 12
        ? `${String(fullHistory.order.device_id).slice(0, 12)}…`
        : fullHistory.order.device_id
      : null);
  const isQrDineIn = order?.order_type === "qr_dine_in";
  const isDineIn = order?.order_type === "dine_in";
  const isTableLabeledOrder = isDineIn || isQrDineIn;
  // Use order only so all customer fields update together (same query)
  const customerName = order?.customer_name ?? null;
  const customerPhone = order?.customer_phone ?? null;
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

  const eligibleTipPayments = React.useMemo(() => {
    const ELIGIBLE_STATUSES = ["captured", "paid"] as const;
    if (!payments.length) return [];
    return payments.filter((p) => {
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

  const handleAssignCustomerSuccess = React.useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["order-details", orderId] });
    queryClient.invalidateQueries({ queryKey: ["order-full-history", orderId] });
  }, [queryClient, orderId]);

  const handleAdjustTipSuccess = React.useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["order-details", orderId] });
    queryClient.invalidateQueries({ queryKey: ["order-full-history", orderId] });
  }, [queryClient, orderId]);

  const handleViewOnFloorPlan = React.useCallback(() => {
    if (order?.location_id) {
      setSelectedLocation(order.location_id);
    }
    router.push("/dashboard/tables");
  }, [order?.location_id, router, setSelectedLocation]);

  React.useEffect(() => {
    document.title = order
      ? `Order #${String(order.display_number || order.order_number).replace(/^#/, "")} | DEXA POS`
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
        <div className="sticky top-0 z-10 mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-800 shadow-sm dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
          Viewing as {adminViewType === "hq" ? "HQ Admin" : "Carrier Admin"} — Read Only
        </div>
      )}
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-4">
        {breadcrumbs.map((crumb, i) => {
          const isLast = i === breadcrumbs.length - 1;
          const label =
            isLast && order
              ? `Order #${String(order.display_number || order.order_number).replace(/^#/, "")}`
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

      {/* Rich order header */}
      <div className="space-y-4 mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => router.push(backUrl)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">
            Order #{String(order.display_number || order.order_number).replace(/^#/, "")}
          </h1>
          <OrderStatusBadge status={order.status} prefix="Order" />
          <span className="text-muted-foreground">●</span>
          <PaymentStatusBadge status={order.payment_status} prefix="Payment" />
          <div className="flex-1 min-w-0" />
          <div className="hidden md:block">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5">
                  Actions
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
              {isQrDineIn && tableName && (
                <DropdownMenuItem onClick={handleViewOnFloorPlan}>
                  <MapPin className="h-4 w-4 mr-2" />
                  View on Floor Plan
                </DropdownMenuItem>
              )}
              {orderActions.canSendReceipt && (
                <DropdownMenuItem onClick={() => setIsSendReceiptOpen(true)}>
                  <Mail className="h-4 w-4 mr-2" />
                  Send Receipt
                </DropdownMenuItem>
              )}
              {orderActions.canAssignCustomer && (
                <DropdownMenuItem onClick={() => setAssignCustomerOpen(true)}>
                  <User className="h-4 w-4 mr-2" />
                  Customer
                </DropdownMenuItem>
              )}
              {orderActions.canAdjustTip && (
                <DropdownMenuItem onClick={() => setIsAdjustTipOpen(true)}>
                  <DollarSign className="h-4 w-4 mr-2" />
                  Adjust Tip
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {order.order_number && (
          <p className="text-sm text-muted-foreground pl-10">
            {order.order_number.length > 20
              ? `ORD-${new Date(order.created_at).toISOString().slice(0, 10).replace(/-/g, "")}-${order.display_number || order.order_number}`
              : order.order_number}
          </p>
        )}

        {/* Metadata grid: Created, Type, Created by, Location */}
        {(() => {
          const createdDt = formatDateInTimezone(
            order.created_at,
            undefined
          );
          return (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="rounded-lg border bg-muted/30 p-3 space-y-0.5">
                <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> Created
                </p>
                <p className="text-sm font-medium">{createdDt.date}</p>
                <p className="text-xs text-muted-foreground">{createdDt.time}</p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-3 space-y-0.5">
                <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                  {getOrderTypeIcon(order.order_type)} Type
                </p>
                <p className="text-sm font-medium">
                  {formatOrderType(order.order_type)}
                </p>
                <DeliveryPlatformBadge order={order} className="mt-1" />
                <p className="text-xs text-muted-foreground">
                  Channel: {orderChannelLabel(order.order_type)}
                </p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-3 space-y-0.5">
                <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                  <User className="h-3 w-3" /> Created by
                </p>
                <p className="text-sm font-medium">
                  {createdByName ?? "—"}
                </p>
                {(stationName || deviceDisplay) && (
                  <p className="text-xs text-muted-foreground">
                    {[stationName, deviceDisplay].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
              <div className="rounded-lg border bg-muted/30 p-3 space-y-0.5">
                <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> Location
                </p>
                <p className="text-sm font-medium">
                  {locationName ?? "—"}
                </p>
              </div>
            </div>
          );
        })()}

        {/* Dine-in context (conditional) */}
        {isTableLabeledOrder && (tableName || (isDineIn && serverName) || (isDineIn && partySize != null)) && (
          <div className="rounded-lg border bg-muted/30 px-4 py-3">
            <p className="text-[11px] font-medium text-muted-foreground mb-2">
              {isQrDineIn ? "QR Table Context" : "Dine-In Context"}
            </p>
            <div className="flex flex-wrap gap-4 text-sm">
              {tableName && (
                <span className="flex items-center gap-1.5">
                  {isQrDineIn ? (
                    <QrCode className="h-3.5 w-3.5 text-[#0C4FD1]" />
                  ) : (
                    <Utensils className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  Table: {tableName}
                </span>
              )}
              {isDineIn && serverName && (
                <span className="flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  Server: {serverName}
                </span>
              )}
              {isDineIn && partySize != null && (
                <span className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                  Party: {partySize} guests
                </span>
              )}
              {isQrDineIn ? (
                <span className="flex items-center gap-1.5 text-[#0C4FD1]">
                  <QrCode className="h-3.5 w-3.5" />
                  Independent QR table order
                </span>
              ) : null}
            </div>
          </div>
        )}

        {/* Pricing mode */}
        {(order.payment_pricing_mode || fullHistory?.order?.pricing_mode) && (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Pricing:{" "}
            <PricingModeBadge
              mode={
                (fullHistory?.order?.pricing_mode as "card" | "cash" | "mixed") ??
                order.payment_pricing_mode
              }
            />
          </p>
        )}

        {/* Customer (always show, with Assign / Change / Remove) */}
        <div className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
          <User className="h-4 w-4 shrink-0" />
          {hasCustomer ? (
            <>
              <span>
                Customer:{" "}
                {[
                  customerName ?? null,
                  customerPhone ? formatPhoneDisplay(customerPhone) : null,
                  customerEmail ?? null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7"
                onClick={() => setAssignCustomerOpen(true)}
              >
                Change
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-destructive hover:text-destructive"
                disabled={removingCustomer}
                onClick={async () => {
                  if (!order?.id) return;
                  setRemovingCustomer(true);
                  try {
                    const res = await assignCustomerToOrder({
                      orderId: order.id,
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
            </>
          ) : (
            <>
              <span>No customer assigned</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7"
                onClick={() => setAssignCustomerOpen(true)}
              >
                Assign Customer
              </Button>
            </>
          )}
        </div>

        {/* Internal notes (conditional) */}
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
      </div>

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
          <div className="flex flex-col gap-4">
            {orderActions.canAdjustTip && (
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAdjustTipOpen(true)}
                >
                  <DollarSign className="h-3.5 w-3.5 mr-1.5" />
                  Adjust Tip
                </Button>
              </div>
            )}
            <EnhancedPaymentsList
            basicPayments={payments}
            richPayments={fullHistory?.payments ?? null}
            isLoading={isLoading || isHistoryLoading}
            cashDiscountApplied={!!order.cash_discount_applied}
            totalDue={order.total_amount}
            orderVoidedAt={fullHistory?.order?.voided_at ?? null}
            orderVoidedByName={fullHistory?.order?.voided_by_name ?? null}
            orderVoidedBy={fullHistory?.order?.voided_by ?? null}
            orderVoidReason={fullHistory?.order?.void_reason ?? null}
          />
          </div>
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
            orderId={orderId}
          />
        </TabsContent>
      </Tabs>

      {/* Sticky Pricing Breakdown + Actions */}
      <div className="sticky bottom-0 mt-6 -mx-4 sm:-mx-6 lg:-mx-8">
        <PricingBreakdown
          order={order}
          payments={payments}
          fullHistoryOrder={fullHistory?.order ?? null}
        />
        <div className="border-t bg-background">
          <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
            <OrderActionBar
              actions={orderActions}
              onSendReceipt={() => setIsSendReceiptOpen(true)}
              onAssignCustomer={() => setAssignCustomerOpen(true)}
              onAdjustTip={() => setIsAdjustTipOpen(true)}
            />
          </div>
        </div>
      </div>
      <SendReceiptModal
        order={order}
        open={isSendReceiptOpen}
        onOpenChange={setIsSendReceiptOpen}
      />
      {order && (
        <AssignCustomerModal
          order={order as OrderResponse & { merchant_id?: string }}
          open={assignCustomerOpen}
          onOpenChange={setAssignCustomerOpen}
          onSuccess={handleAssignCustomerSuccess}
        />
      )}
      {order && (
        <AdjustTipModal
          orderId={order.id}
          displayNumber={order.display_number ?? order.order_number}
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
      )}
    </div>
  );
}
