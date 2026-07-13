"use client";

import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
  AlertTriangle,
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
  CATEGORY_COLORS,
  SEVERITY_COLORS,
  AUDIT_CATEGORIES,
} from "@/types/audit-log";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl px-4">
        <SheetHeader className="pb-4 border-b">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-violet-500/20 to-violet-500/5 border border-violet-500/10">
              <Clock className="h-5 w-5 text-violet-500" />
            </div>
            <div>
              <SheetTitle>Activity Log</SheetTitle>
              <SheetDescription>
                Recent actions and changes at your location
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        {/* Filters */}
        <div className="py-4 space-y-3 border-b">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search activity..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw
                className={cn("h-4 w-4", isFetching && "animate-spin")}
              />
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {AUDIT_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {CATEGORY_LABELS[cat]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Activity List */}
        <ScrollArea className="h-[calc(100vh-220px)] w-full min-w-0 [&_[data-slot=scroll-area-viewport]>div]:!block [&_[data-slot=scroll-area-viewport]>div]:!w-full">
          <div className="py-4 space-y-3 px-1 w-full min-w-0">
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
      </SheetContent>
    </Sheet>
  );
}

// Individual log item component
function ActivityLogItem({ log }: { log: AuditLogWithLocation }) {
  const [expanded, setExpanded] = useState(false);

  const ActionIcon =
    ACTION_ICONS[log.action] ||
    (log.action_category === "inventory"
      ? Package
      : log.action_category === "purchase_order"
      ? ShoppingCart
      : log.action_category === "expense"
      ? DollarSign
      : Info);

  const isStockUpdate = log.action === "inventory.stock_updated";
  const changeAmount = log.metadata?.change_amount as number | undefined;
  const isIncrease = changeAmount && changeAmount > 0;

  return (
    <div
      className={cn(
        "w-full min-w-0 rounded-lg border p-3 transition-all hover:shadow-sm cursor-pointer",
        expanded ? "bg-muted/30" : "hover:bg-muted/20"
      )}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div
          className={cn(
            "p-2 rounded-lg shrink-0",
            log.severity === "warning"
              ? "bg-amber-500/10"
              : log.severity === "critical"
              ? "bg-red-500/10"
              : "bg-primary/10"
          )}
        >
          <ActionIcon
            className={cn(
              "h-4 w-4",
              log.severity === "warning"
                ? "text-amber-500"
                : log.severity === "critical"
                ? "text-red-500"
                : "text-primary"
            )}
          />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 min-w-0">
            <span className="font-medium text-sm truncate min-w-0">
              {formatAction(log.action)}
            </span>
            <Badge
              variant="outline"
              className={cn(
                "text-xs shrink-0",
                CATEGORY_COLORS[log.action_category as AuditCategory]
              )}
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
                className={cn(
                  "gap-1 text-xs",
                  isIncrease
                    ? "text-emerald-600 border-emerald-200"
                    : "text-red-600 border-red-200"
                )}
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

        <ChevronRight
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform shrink-0",
            expanded && "rotate-90"
          )}
        />
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="mt-3 pt-3 border-t space-y-3">
          {/* Reason - for all logs that have it */}
          {log.changes?.reason && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-muted/50">
              <FileText className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Reason</p>
                <p className="text-sm font-medium">{log.changes.reason}</p>
              </div>
            </div>
          )}

          {/* Stock Update Details */}
          {log.action === "inventory.stock_updated" && log.changes && (
            <div className="space-y-2">
              <div className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/50">
                <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-red-600">
                    {String(log.changes.before?.stock ?? "?")}
                  </span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-emerald-600">
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
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30">
                  <DollarSign className="h-4 w-4 text-emerald-600 shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Amount</p>
                    <p className="text-sm font-semibold text-emerald-600">
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
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/30">
                <CheckCircle className="h-4 w-4 text-blue-600 shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <p className="text-sm font-medium text-blue-600">Received</p>
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
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30">
                  <DollarSign className="h-4 w-4 text-emerald-600 shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Total</p>
                    <p className="text-sm font-semibold text-emerald-600">
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
    </div>
  );
}
