"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Filter,
  RefreshCw,
  Clock,
  User,
  Package,
  ShoppingCart,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Info,
  ChevronRight,
  MapPin,
  ArrowRight,
  CreditCard,
  Banknote,
  Truck,
  Tag,
  FileText,
  CheckCircle,
  Receipt,
  RotateCcw,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { GetAuditLogs } from "@/app/dashboard/actions/audit-logs";
import { useUserInfo } from "@/app/manage/hooks/useUserInfo.";
import { useLocationStore } from "@/stores/location-store";
import {
  AuditLogWithLocation,
  AuditCategory,
  CATEGORY_LABELS,
  AUDIT_CATEGORIES,
} from "@/types/audit-log";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useIsMobile } from "@/hooks/use-mobile";

interface ActivityLogSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Action icons mapping
const ACTION_ICONS: Record<string, React.ElementType> = {
  "inventory.stock_updated": Package,
  "inventory.item_created": Package,
  "inventory.item_updated": Package,
  "inventory.item_deleted": Package,
  "purchase_order.created": ShoppingCart,
  "purchase_order.received": ShoppingCart,
  "purchase_order.paid": DollarSign,
  "expense.logged": DollarSign,
  "staff.clock_in": Clock,
  "staff.clock_out": Clock,
  "staff.pin_reset": RotateCcw,
  "order.created": Receipt,
};

// Format action for display
function formatAction(action: string): string {
  const parts = action.split(".");
  if (parts.length < 2) return action;

  const actionPart = parts[1]
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  return actionPart;
}

// Format relative time
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function ActivityLogSheet({
  open,
  onOpenChange,
}: ActivityLogSheetProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const { data: userInfo } = useUserInfo();
  const clerkOrgId = userInfo?.members?.[0]?.organizations?.id;
  const { selectedLocationId } = useLocationStore();

  const {
    data: logsResponse,
    isLoading,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: [
      "audit-logs",
      clerkOrgId,
      selectedLocationId,
      categoryFilter,
      searchTerm,
    ],
    queryFn: async () => {
      if (!clerkOrgId) return null;
      return GetAuditLogs(
        clerkOrgId,
        {
          location_id: selectedLocationId === "all" ? null : selectedLocationId,
          action_category:
            categoryFilter !== "all"
              ? (categoryFilter as AuditCategory)
              : undefined,
          search: searchTerm || undefined,
        },
        50
      );
    },
    enabled: open && !!clerkOrgId,
  });

  const logs = logsResponse?.data || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-dvh w-full max-w-none flex-col gap-0 overflow-hidden max-sm:overflow-hidden rounded-none bg-card p-0 sm:h-[min(800px,calc(100dvh-2rem))] sm:max-w-4xl sm:rounded-3xl">
        <DialogHeader className="bg-card px-5 py-5 pr-14 text-left sm:px-6 sm:pr-16">
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-muted-foreground" />
            Activity log
          </DialogTitle>
          <DialogDescription>
            Recent inventory and purchasing activity for the selected location.
          </DialogDescription>
        </DialogHeader>

        <section className="shrink-0 bg-card px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search activity..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-10 pl-10 focus-visible:ring-1"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="hidden h-4 w-4 text-muted-foreground sm:block" />
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="h-10 min-w-0 flex-1 rounded-full bg-muted/45 shadow-none sm:w-[200px] sm:flex-none">
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {AUDIT_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {CATEGORY_LABELS[cat]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10 shrink-0 rounded-full"
                onClick={() => refetch()}
                disabled={isFetching}
              >
                <RefreshCw
                  className={cn("h-4 w-4", isFetching && "animate-spin")}
                />
                <span className="sr-only">Refresh activity</span>
              </Button>
            </div>
          </div>
        </section>

        <ScrollArea className="min-h-0 w-full min-w-0 flex-1 bg-card [&_[data-slot=scroll-area-viewport]>div]:!block [&_[data-slot=scroll-area-viewport]>div]:!w-full">
          <div className="w-full min-w-0 space-y-3 p-4 sm:p-6">
            {isLoading ? (
              // Loading skeletons
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3 p-3">
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))
            ) : logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="p-4 rounded-full bg-muted mb-4">
                  <Clock className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">No activity yet</h3>
                <p className="text-muted-foreground text-sm max-w-sm">
                  Activity will appear here as you make changes to inventory,
                  create purchase orders, and more.
                </p>
              </div>
            ) : (
              logs.map((log) => <ActivityLogItem key={log.id} log={log} />)
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// Turns a snake_case field name into a readable label, e.g. "reorder_point" -> "Reorder point"
function formatFieldLabel(field: string): string {
  const words = field.split("_").join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

// Individual log item component
function ActivityLogItem({ log }: { log: AuditLogWithLocation }) {
  const [expanded, setExpanded] = useState(false);
  const isMobile = useIsMobile();
  // The chevron/expand interaction is desktop & tablet only — on mobile the
  // card is flat with no details drill-down.
  const canExpand = !isMobile;

  const isStockUpdate = log.action === "inventory.stock_updated";
  const isItemUpdate = log.action === "inventory.item_updated";
  const changeAmount = log.metadata?.change_amount as number | undefined;
  const isIncrease = changeAmount && changeAmount > 0;

  // Fields that changed between before/after, for the item-updated diff block.
  const changedFields = isItemUpdate && log.changes?.before && log.changes?.after
    ? Object.keys(log.changes.after).filter((key) => {
        if (key === "updated_at") return false;
        const before = log.changes!.before![key];
        const after = log.changes!.after![key];
        return JSON.stringify(before) !== JSON.stringify(after);
      })
    : [];

  const Wrapper = canExpand ? "button" : "div";

  return (
    <Wrapper
      type={canExpand ? "button" : undefined}
      aria-expanded={canExpand ? expanded : undefined}
      className={cn(
        "w-full min-w-0 rounded-2xl border-0 p-4 text-left transition-colors",
        canExpand &&
          "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        canExpand && expanded ? "bg-muted/50" : "bg-muted/25",
        canExpand && !expanded && "hover:bg-muted/40"
      )}
      onClick={canExpand ? () => setExpanded(!expanded) : undefined}
    >
      <div className="flex items-start gap-3">
        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 min-w-0">
            <span className="font-medium text-sm truncate min-w-0">
              {formatAction(log.action)}
            </span>
            <Badge
              variant="outline"
              className="shrink-0 bg-muted/60 text-xs text-muted-foreground"
            >
              {CATEGORY_LABELS[log.action_category as AuditCategory] ||
                log.action_category}
            </Badge>
          </div>

          {/* Resource name and change info */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground min-w-0">
            {log.resource_name && (
              <span className="truncate min-w-0">{log.resource_name}</span>
            )}
            {isStockUpdate && changeAmount !== undefined && (
              <Badge
                variant="outline"
                className="gap-1 bg-muted/60 text-xs text-muted-foreground"
              >
                {isIncrease ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                {isIncrease ? "+" : ""}
                {changeAmount} {String(log.metadata?.unit_type || "units")}
              </Badge>
            )}
          </div>

          {/* Actor and time */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1 min-w-0">
              <User className="h-3 w-3 shrink-0" />
              <span className="truncate">{log.actor_name || "System"}</span>
            </span>
            <span className="flex items-center gap-1 shrink-0">
              <Clock className="h-3 w-3 shrink-0" />
              {formatRelativeTime(log.created_at)}
            </span>
            {log.location && (
              <span className="flex items-center gap-1 min-w-0">
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">{log.location.name}</span>
              </span>
            )}
          </div>
        </div>

        {canExpand && (
          <ChevronRight
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform shrink-0",
              expanded && "rotate-90"
            )}
          />
        )}
      </div>

      {/* Expanded details — desktop & tablet only */}
      {canExpand && expanded && (
        <div className="mt-3 space-y-3 pt-3">
          {/* Reason - for all logs that have it */}
          {log.changes?.reason && (
            <div className="flex items-start gap-2 rounded-2xl bg-muted/60 p-2.5">
              <FileText className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Reason</p>
                <p className="text-sm font-medium">{log.changes.reason}</p>
              </div>
            </div>
          )}

          {/* Item Updated Details — field-by-field before/after diff */}
          {isItemUpdate && changedFields.length > 0 && (
            <div className="space-y-2">
              {changedFields.map((field) => (
                <div
                  key={field}
                  className="flex items-center gap-3 rounded-2xl bg-muted/60 p-2.5"
                >
                  <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">
                      {formatFieldLabel(field)}
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium tabular-nums truncate">
                        {formatFieldValue(log.changes!.before?.[field])}
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-sm font-medium tabular-nums truncate">
                        {formatFieldValue(log.changes!.after?.[field])}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Stock Update Details */}
          {log.action === "inventory.stock_updated" && log.changes && (
            <div className="space-y-2">
              <div className="flex items-center gap-3 rounded-2xl bg-muted/60 p-2.5">
                <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium tabular-nums">
                    {String(log.changes.before?.stock ?? "?")}
                  </span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium tabular-nums">
                    {String(log.changes.after?.stock ?? "?")}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {String(log.metadata?.unit_type || "units")}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Purchase Order Payment Details */}
          {log.action === "purchase_order.paid" && log.changes?.after && (
            <div className="grid grid-cols-2 gap-2">
              {log.changes.after.amount !== undefined && (
                <div className="flex items-center gap-2 rounded-2xl bg-muted/60 p-2.5">
                  <DollarSign className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Amount</p>
                    <p className="text-sm font-semibold tabular-nums">
                      ${Number(log.changes.after.amount).toFixed(2)}
                    </p>
                  </div>
                </div>
              )}
              {!!log.changes.after.payment_method && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/50">
                  {log.changes.after.payment_method === "card" ? (
                    <CreditCard className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <Banknote className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                  <div>
                    <p className="text-xs text-muted-foreground">Payment</p>
                    <p className="text-sm font-medium capitalize">
                      {String(log.changes.after.payment_method)}
                    </p>
                  </div>
                </div>
              )}
              {!!log.changes.after.status && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/50">
                  <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Status</p>
                    <p className="text-sm font-medium capitalize">
                      {String(log.changes.after.status)}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Purchase Order Delivery Details */}
          {log.action === "purchase_order.received" && log.changes?.after && (
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center gap-2 rounded-2xl bg-muted/60 p-2.5">
                <CheckCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <p className="text-sm font-medium">Received</p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/50">
                <Truck className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Delivered By</p>
                  <p className="text-sm font-medium">
                    {String(log.changes.after.delivered_by || "Not specified")}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Expense Details */}
          {log.action === "expense.logged" && log.changes?.after && (
            <div className="grid grid-cols-2 gap-2">
              {!!log.changes.after.vendor_name && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/50">
                  <ShoppingCart className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Vendor</p>
                    <p className="text-sm font-medium">
                      {String(log.changes.after.vendor_name)}
                    </p>
                  </div>
                </div>
              )}
              {!!log.changes.after.category && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/50">
                  <Tag className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Category</p>
                    <p className="text-sm font-medium">
                      {String(log.changes.after.category)}
                    </p>
                  </div>
                </div>
              )}
              {log.changes.after.total_amount !== undefined && (
                <div className="flex items-center gap-2 rounded-2xl bg-muted/60 p-2.5">
                  <DollarSign className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Total</p>
                    <p className="text-sm font-semibold tabular-nums">
                      ${Number(log.changes.after.total_amount).toFixed(2)}
                    </p>
                  </div>
                </div>
              )}
              {!!log.changes.after.payment_method && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/50">
                  {log.changes.after.payment_method === "card" ? (
                    <CreditCard className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <Banknote className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                  <div>
                    <p className="text-xs text-muted-foreground">Payment</p>
                    <p className="text-sm font-medium capitalize">
                      {String(log.changes.after.payment_method)}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Wrapper>
  );
}
