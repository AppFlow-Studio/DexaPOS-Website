"use client";

import React, { useState, useMemo } from "react";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  BookOpen,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Clock,
  CreditCard,
  DollarSign,
  FileText,
  Flame,
  FolderOpen,
  GitBranch,
  LayoutGrid,
  ListPlus,
  LogOut,
  MapPin,
  Monitor,
  Package,
  Percent,
  Receipt,
  RefreshCw,
  Search,
  Settings,
  Shield,
  ShoppingBag,
  Square,
  StickyNote,
  Tablet,
  Tag,
  User,
  UserCircle,
  Users,
  Utensils,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuditLogs } from "../hooks/useAuditLogs";
import { useLocationStore } from "@/stores/location-store";
import { subDays, startOfDay, endOfDay, format } from "date-fns";
import { cn } from "@/lib/utils";
import {
  buildAuditSentence,
  formatRelativeTime,
  formatChangesForDisplay,
  SEVERITY_BORDER_CLASS,
  SEVERITY_ICON_BG,
  SEVERITY_ICON_COLOR,
  SEVERITY_CARD_BG,
} from "@/lib/audit/sentence-templates";
import type { AuditLogWithLocation } from "@/types/audit-log";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { DateRange } from "react-day-picker";

// ─── Icon Registry ────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, LucideIcon> = {
  Activity,
  BookOpen,
  Building2,
  CalendarDays,
  Clock,
  CreditCard,
  DollarSign,
  FileText,
  Flame,
  FolderOpen,
  GitBranch,
  LayoutGrid,
  ListPlus,
  LogOut,
  MapPin,
  Monitor,
  Package,
  Percent,
  Receipt,
  Settings,
  Shield,
  ShoppingBag,
  Square,
  StickyNote,
  Tablet,
  Tag,
  User,
  UserCircle,
  Users,
  Utensils,
};

function DynamicIcon({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const Icon = ICON_MAP[name] ?? Activity;
  return <Icon className={className} />;
}

// ─── Category Tabs ────────────────────────────────────────────────────────────

const CATEGORY_TABS = [
  { id: "all", label: "Everything", resourceTypes: null as string[] | null },
  {
    id: "menu",
    label: "Menu Changes",
    resourceTypes: ["menu", "menu_item", "category", "modifier_group", "discount"],
  },
  {
    id: "staff",
    label: "Staff & Access",
    resourceTypes: ["staff_profile", "staff_member", "location_member"],
  },
  {
    id: "orders",
    label: "Orders & Payments",
    resourceTypes: ["order", "order_item", "payment"],
  },
  {
    id: "kitchen",
    label: "Kitchen Setup",
    resourceTypes: ["kds_display", "prep_station", "kds_routing_rule"],
  },
  {
    id: "tables",
    label: "Tables & Floor",
    resourceTypes: ["floor_plan", "floor_plan_object", "table_sessions"],
  },
  {
    id: "settings",
    label: "Settings",
    resourceTypes: ["location", "station", "payment_terminal", "tax_rate"],
  },
  {
    id: "cash",
    label: "Cash & Sessions",
    resourceTypes: ["cash_drawer", "station_session", "role"],
  },
] as const;

type CategoryTabId = (typeof CATEGORY_TABS)[number]["id"];

// ─── Date Presets ─────────────────────────────────────────────────────────────

const DATE_PRESETS = [
  { label: "Today", days: 0 },
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
] as const;

function getPresetRange(days: number): { from: Date; to: Date } {
  const to = new Date();
  const from = days === 0 ? startOfDay(to) : subDays(to, days);
  return { from, to };
}

// ─── Category Label ───────────────────────────────────────────────────────────

function getCategoryLabel(log: AuditLogWithLocation): string {
  const tab = CATEGORY_TABS.find(
    (t) => t.resourceTypes && log.resource_type && (t.resourceTypes as readonly string[]).includes(log.resource_type)
  );
  if (tab) return tab.label;

  const catMap: Record<string, string> = {
    menu: "Menu Changes",
    staff: "Staff & Access",
    user_management: "Staff & Access",
    order: "Orders & Payments",
    inventory: "Inventory",
    settings: "Settings",
    device: "Kitchen Setup",
    authentication: "Authentication",
    purchase_order: "Purchase Orders",
    expense: "Expenses",
    merchant: "Settings",
    notes: "Notes",
  };
  return catMap[log.action_category] ?? log.action_category;
}

// ─── Timeline Card ────────────────────────────────────────────────────────────

function AuditCard({
  log,
  onOpen,
}: {
  log: AuditLogWithLocation;
  onOpen: (log: AuditLogWithLocation) => void;
}) {
  const { sentence, highlight, iconName } = buildAuditSentence(log);
  const severity = log.severity ?? "info";
  const borderClass = SEVERITY_BORDER_CLASS[severity] ?? SEVERITY_BORDER_CLASS.info;
  const cardBg = SEVERITY_CARD_BG[severity] ?? "";
  const iconBg = SEVERITY_ICON_BG[severity] ?? SEVERITY_ICON_BG.info;
  const iconColor = SEVERITY_ICON_COLOR[severity] ?? SEVERITY_ICON_COLOR.info;
  const categoryLabel = getCategoryLabel(log);
  const relativeTime = formatRelativeTime(log.created_at);

  return (
    <button
      type="button"
      onClick={() => onOpen(log)}
      className={cn(
        "w-full text-left group rounded-xl border border-l-4 p-4 transition-all",
        "hover:shadow-md hover:border-border/80",
        "bg-card",
        borderClass,
        cardBg,
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      )}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div
          className={cn(
            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
            iconBg
          )}
        >
          <DynamicIcon
            name={iconName}
            className={cn("h-4 w-4", iconColor)}
          />
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-snug text-foreground">
            {sentence}
          </p>

          {highlight && (
            <p className="mt-1 text-sm text-muted-foreground">{highlight}</p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3 shrink-0" />
            <span>{relativeTime}</span>
            <span>·</span>
            <span>{categoryLabel}</span>
            {severity !== "info" && (
              <>
                <span>·</span>
                <Badge
                  variant="secondary"
                  className={cn(
                    "h-4 px-1.5 text-[10px] border-none",
                    severity === "warning" &&
                      "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
                    severity === "critical" &&
                      "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
                    severity === "error" &&
                      "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                  )}
                >
                  {severity === "critical" ? (
                    <AlertCircle className="mr-0.5 h-2.5 w-2.5 inline" />
                  ) : (
                    <AlertTriangle className="mr-0.5 h-2.5 w-2.5 inline" />
                  )}
                  {severity}
                </Badge>
              </>
            )}
          </div>
        </div>

        {/* Expand hint */}
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 mt-0.5" />
      </div>
    </button>
  );
}

// ─── Detail Sheet ─────────────────────────────────────────────────────────────

function AuditDetailSheet({
  log,
  open,
  onClose,
}: {
  log: AuditLogWithLocation | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!log) return null;

  const { sentence, highlight, iconName } = buildAuditSentence(log);
  const severity = log.severity ?? "info";
  const iconBg = SEVERITY_ICON_BG[severity] ?? SEVERITY_ICON_BG.info;
  const iconColor = SEVERITY_ICON_COLOR[severity] ?? SEVERITY_ICON_COLOR.info;
  const changes = formatChangesForDisplay(log.changes);
  const categoryLabel = getCategoryLabel(log);

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="pb-4">
          <div className="flex items-start gap-3">
            <div
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                iconBg
              )}
            >
              <DynamicIcon name={iconName} className={cn("h-4 w-4", iconColor)} />
            </div>
            <div className="min-w-0">
              <SheetTitle className="text-base font-semibold leading-snug text-left">
                {sentence}
              </SheetTitle>
              {highlight && (
                <p className="mt-1 text-sm text-muted-foreground">{highlight}</p>
              )}
            </div>
          </div>
        </SheetHeader>

        {/* Meta info */}
        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-4 text-sm">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">
                Who
              </p>
              <p className="font-medium">{log.actor_name ?? "System"}</p>
              {log.actor_role && (
                <p className="text-xs text-muted-foreground capitalize">
                  {log.actor_role}
                </p>
              )}
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">
                When
              </p>
              <p className="font-medium">
                {format(new Date(log.created_at), "MMM d, yyyy")}
              </p>
              <p className="text-xs text-muted-foreground">
                {format(new Date(log.created_at), "h:mm:ss a")}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">
                Category
              </p>
              <p className="font-medium">{categoryLabel}</p>
            </div>
            {log.location && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">
                  Location
                </p>
                <p className="font-medium">{log.location.name}</p>
              </div>
            )}
          </div>

          {/* What changed */}
          {changes.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                What changed
              </p>
              <div className="rounded-lg border overflow-hidden divide-y">
                {changes.map((row, i) => (
                  <div key={i} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-2.5 text-sm bg-background">
                    {/* Field name spans top on mobile */}
                    <div className="col-span-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-0.5">
                      {row.field}
                    </div>
                    {/* From */}
                    <div
                      className={cn(
                        "rounded px-2 py-1 text-xs font-mono break-all",
                        row.from !== null
                          ? "bg-red-50 text-red-800 dark:bg-red-950/20 dark:text-red-300"
                          : "text-muted-foreground italic"
                      )}
                    >
                      {row.from ?? "(new)"}
                    </div>
                    {/* Arrow */}
                    <div className="flex justify-center text-muted-foreground text-xs">
                      →
                    </div>
                    {/* To */}
                    <div
                      className={cn(
                        "rounded px-2 py-1 text-xs font-mono break-all",
                        row.to !== null
                          ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-300"
                          : "text-muted-foreground italic"
                      )}
                    >
                      {row.to ?? "(removed)"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {changes.length === 0 && (
            <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
              No detailed change data recorded for this action.
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Skeleton Loader ──────────────────────────────────────────────────────────

function TimelineSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-l-4 border-l-transparent p-4 bg-card">
          <div className="flex items-start gap-3">
            <Skeleton className="h-8 w-8 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3.5 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AuditLogsPage() {
  const { locations } = useLocationStore();

  // Filters
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<CategoryTabId>("all");
  const [actorUserId, setActorUserId] = useState("");
  const [datePreset, setDatePreset] = useState<number>(7);
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [locationId, setLocationId] = useState("all");

  // Pagination
  const [page, setPage] = useState(1);
  const pageSize = 30;

  // Detail sheet
  const [selectedLog, setSelectedLog] = useState<AuditLogWithLocation | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Compute date range
  const dateRange = useMemo(() => {
    if (customRange?.from) {
      return {
        from: startOfDay(customRange.from).toISOString(),
        to: endOfDay(customRange.to ?? customRange.from).toISOString(),
      };
    }
    const { from, to } = getPresetRange(datePreset);
    return {
      from: startOfDay(from).toISOString(),
      to: endOfDay(to).toISOString(),
    };
  }, [datePreset, customRange]);

  // Active category tab → resource_types
  const activeTabConfig = CATEGORY_TABS.find((t) => t.id === activeTab)!;
  const resourceTypes = activeTabConfig.resourceTypes as string[] | null;

  // Build filters
  const filters = useMemo(
    () => ({
      search: search.trim() || undefined,
      location_id: locationId,
      resource_types: resourceTypes ?? undefined,
      actor_user_id: actorUserId || undefined,
      date_from: dateRange.from,
      date_to: dateRange.to,
    }),
    [search, locationId, resourceTypes, actorUserId, dateRange]
  );

  const { data, isLoading, isFetching, refetch } = useAuditLogs(
    filters,
    pageSize,
    (page - 1) * pageSize
  );

  const logs = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Build unique actor list from loaded logs for the staff dropdown
  const uniqueActors = useMemo(() => {
    const map = new Map<string, string>();
    logs.forEach((log) => {
      if (log.actor_user_id && log.actor_name) {
        map.set(log.actor_user_id, log.actor_name);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [logs]);

  const hasActiveFilters = !!(search || actorUserId || customRange);

  function handlePreset(days: number) {
    setDatePreset(days);
    setCustomRange(undefined);
    setPage(1);
  }

  function handleTabChange(id: CategoryTabId) {
    setActiveTab(id);
    setPage(1);
  }

  function openDetail(log: AuditLogWithLocation) {
    setSelectedLog(log);
    setSheetOpen(true);
  }

  function clearFilters() {
    setSearch("");
    setActorUserId("");
    setCustomRange(undefined);
    setDatePreset(7);
    setPage(1);
  }

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Activity Log</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            A plain-English record of every change made in your shop
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="h-8 px-3 gap-1.5 font-normal">
            <Activity className="h-3.5 w-3.5 text-emerald-500" />
            {total.toLocaleString()} entries
          </Badge>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5 mr-1.5", isFetching && "animate-spin")}
            />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-3">
        {/* Search + staff + location */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search what happened..."
              className="pl-9 h-10"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>

          {/* Staff filter */}
          <Select
            value={actorUserId || "all"}
            onValueChange={(v) => {
              setActorUserId(v === "all" ? "" : v);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-10 w-full sm:w-44">
              <div className="flex items-center gap-2">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                <SelectValue placeholder="All Staff" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Staff</SelectItem>
              {uniqueActors.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Location filter (only if merchant has multiple locations) */}
          {locations.length > 1 && (
            <Select
              value={locationId}
              onValueChange={(v) => {
                setLocationId(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="h-10 w-full sm:w-44">
                <div className="flex items-center gap-2">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                  <SelectValue placeholder="All Locations" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Locations</SelectItem>
                {locations.map((loc) => (
                  <SelectItem key={loc.id} value={loc.id}>
                    {loc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Date presets + custom picker */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground shrink-0">Showing:</span>
          {DATE_PRESETS.map((preset) => (
            <Button
              key={preset.days}
              variant={
                !customRange && datePreset === preset.days ? "default" : "outline"
              }
              size="sm"
              className="h-7 px-3 text-xs"
              onClick={() => handlePreset(preset.days)}
            >
              {preset.label}
            </Button>
          ))}

          {/* Custom date range */}
          <Popover open={showCustomPicker} onOpenChange={setShowCustomPicker}>
            <PopoverTrigger asChild>
              <Button
                variant={customRange ? "default" : "outline"}
                size="sm"
                className="h-7 px-3 text-xs"
              >
                {customRange?.from
                  ? customRange.to
                    ? `${format(customRange.from, "MMM d")} – ${format(customRange.to, "MMM d")}`
                    : format(customRange.from, "MMM d")
                  : "Custom..."}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                initialFocus
                mode="range"
                selected={customRange}
                onSelect={(range) => {
                  setCustomRange(range);
                  setPage(1);
                  if (range?.from && range.to) setShowCustomPicker(false);
                }}
                numberOfMonths={2}
              />
            </PopoverContent>
          </Popover>

          {/* Clear filters */}
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground"
              onClick={clearFilters}
            >
              <X className="h-3 w-3 mr-1" />
              Clear
            </Button>
          )}
        </div>

        {/* Category tabs */}
        <div className="flex flex-wrap gap-1.5">
          {CATEGORY_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id as CategoryTabId)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                activeTab === tab.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Timeline */}
      {isLoading ? (
        <TimelineSkeleton />
      ) : logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
          <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center">
            <Activity className="h-8 w-8 text-muted-foreground/30" />
          </div>
          <div>
            <p className="font-semibold text-foreground">All quiet!</p>
            <p className="text-sm text-muted-foreground mt-1">
              No changes were made during this period.
            </p>
          </div>
          {hasActiveFilters && (
            <Button variant="outline" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {logs.map((log) => (
            <AuditCard key={log.id} log={log} onOpen={openDetail} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {!isLoading && total > pageSize && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-muted-foreground">
            Showing{" "}
            <span className="font-medium text-foreground">
              {Math.min((page - 1) * pageSize + 1, total)}–
              {Math.min(page * pageSize, total)}
            </span>{" "}
            of <span className="font-medium text-foreground">{total}</span>
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Detail Sheet */}
      <AuditDetailSheet
        log={selectedLog}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
      />
    </div>
  );
}
