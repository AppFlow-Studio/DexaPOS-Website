'use client'

import React, { useState, useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Panel } from "@/components/dashboard/shell/Panel";
import { PanelSection } from "@/components/dashboard/shell/PanelSection";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Search,
  Calendar as CalendarIcon,
  User,
  MapPin,
  RefreshCw,
  Download,
  GitCompare,
  ChevronDown,
  ChevronUp,
  Info,
  AlertTriangle,
  AlertCircle,
  Clock,
  Activity,
  Shield,
  FileText,
  X,
} from "lucide-react";
import { useAuditLogs } from "@/app/dashboard/hooks/useAuditLogs";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { AuditCategory, AuditSeverity } from "@/types/audit-log";
import { DateRange } from "react-day-picker";
import { MerchantInfoModel } from "@/types/db-modles";

// One neutral pill for every severity (D-03): foreground text on a faded fill.
// The per-severity icon in SEVERITY_ICONS still distinguishes them at a glance,
// so the colour was saying the same thing a second time.
const SEVERITY_BADGE = "bg-muted text-foreground";

const SEVERITY_ICONS = {
  info: <Info className="h-3 w-3" />,
  warning: <AlertTriangle className="h-3 w-3" />,
  critical: <AlertCircle className="h-3 w-3" />,
};

const formatKey = (key: string) => {
  return key
    .replace(/([A-Z])/g, " $1") // Add space before capital letters
    .replace(/^./, (str) => str.toUpperCase()) // Capitalize first letter
    .replace(/_/g, " ") // Replace underscores with spaces
    .trim();
};

const escapeCsvValue = (value: unknown): string => {
  const raw = value == null ? '' : String(value)
  return `"${raw.replace(/"/g, '""')}"`
}

const downloadCsv = (filename: string, content: string): void => {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

const RenderObject = ({
  data,
  className,
}: {
  data: any;
  className?: string;
}) => {
  if (!data || typeof data !== "object") return null;

  return (
    <div
      className={cn(
        "grid gap-4 grid-cols-1",
        Object.keys(data).length > 1 && "sm:grid-cols-2",
        className,
      )}
    >
      {Object.entries(data).map(([key, value]) => {
        if (value === null || value === undefined) return null;
        return (
          <div key={key} className="flex flex-col gap-1.5 min-w-0">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
              {formatKey(key)}
            </span>
            <div className="text-sm font-mono bg-muted/30 px-3 py-2 rounded-md break-all border border-muted/20 text-foreground/90">
              {typeof value === "object" ? (
                <div className="pl-2 border-l-2 border-muted mt-1">
                  <RenderObject data={value} className="grid-cols-1 gap-y-2" />
                </div>
              ) : (
                String(value)
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

/**
 * Turn a raw user agent into something a reviewer can read at a glance —
 * "Chrome 152 on Windows" rather than 120 characters of tokens. Deliberately
 * approximate: this is an at-a-glance label, and the raw string stays available
 * on hover via `title`, so a wrong guess costs nothing.
 */
const describeUserAgent = (ua: string): string | null => {
  const os =
    /Windows NT 10/.test(ua) ? "Windows" :
    /Windows/.test(ua) ? "Windows" :
    /iPhone|iPad/.test(ua) ? "iOS" :
    /Android/.test(ua) ? "Android" :
    /Mac OS X/.test(ua) ? "macOS" :
    /Linux/.test(ua) ? "Linux" : null;

  // Order matters: Edge and Opera both carry "Chrome" in their UA string, and
  // Chrome carries "Safari", so the more specific brands are tested first.
  const browser =
    /Edg\/(\d+)/.exec(ua) ? `Edge ${/Edg\/(\d+)/.exec(ua)![1]}` :
    /OPR\/(\d+)/.exec(ua) ? `Opera ${/OPR\/(\d+)/.exec(ua)![1]}` :
    /Firefox\/(\d+)/.exec(ua) ? `Firefox ${/Firefox\/(\d+)/.exec(ua)![1]}` :
    /Chrome\/(\d+)/.exec(ua) ? `Chrome ${/Chrome\/(\d+)/.exec(ua)![1]}` :
    /Version\/(\d+).*Safari/.exec(ua) ? `Safari ${/Version\/(\d+)/.exec(ua)![1]}` :
    null;

  if (!browser && !os) return null;
  if (!browser) return os;
  return os ? `${browser} on ${os}` : browser;
};

/** Loopback and private ranges mean "this server" / "internal network". */
const describeIpAddress = (ip: string): string | null => {
  if (ip === "::1" || ip === "127.0.0.1") return "Local machine";
  if (/^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(ip)) {
    return "Internal network";
  }
  return null;
};

/**
 * Metadata rendered for people rather than machines: a plain-language label,
 * with the raw value kept underneath (and in `title`) so nothing is lost for
 * anyone who needs the exact string.
 */
const FRIENDLY_METADATA: Record<string, (v: string) => string | null> = {
  ip_address: describeIpAddress,
  user_agent: describeUserAgent,
};

const RenderMetadata = ({ data }: { data: Record<string, unknown> }) => (
  <div className="grid gap-4 sm:grid-cols-2">
    {Object.entries(data).map(([key, value]) => {
      if (value === null || value === undefined) return null;
      if (typeof value === "object") {
        return (
          <div key={key} className="flex min-w-0 flex-col gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {formatKey(key)}
            </span>
            <RenderObject data={value} className="grid-cols-1 gap-y-2" />
          </div>
        );
      }

      const raw = String(value);
      const friendly = FRIENDLY_METADATA[key]?.(raw) ?? null;

      return (
        <div key={key} className="flex min-w-0 flex-col gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {formatKey(key)}
          </span>
          {friendly ? (
            <div className="min-w-0">
              <p className="text-sm text-foreground">{friendly}</p>
              <p
                className="mt-0.5 font-mono text-xs break-words text-muted-foreground"
                title={raw}
              >
                {raw}
              </p>
            </div>
          ) : (
            <span className="font-mono text-sm break-words text-foreground">
              {raw}
            </span>
          )}
        </div>
      );
    })}
  </div>
);

/** Renders one scalar audit value, or a nested object via RenderObject. */
const DiffValue = ({ value, muted }: { value: unknown; muted?: boolean }) => {
  if (value === null || value === undefined || value === "") {
    return <span className="text-sm italic text-muted-foreground">empty</span>;
  }
  if (typeof value === "object") {
    return <RenderObject data={value} className="grid-cols-1 gap-y-2" />;
  }
  return (
    <span
      className={cn(
        // `break-words`, not `break-all`: a user agent string should wrap at
        // spaces rather than mid-token and run off the panel.
        "font-mono text-sm break-words",
        muted ? "text-muted-foreground line-through" : "text-foreground",
      )}
    >
      {String(value)}
    </span>
  );
};

/**
 * A before -> after diff, one row per field.
 *
 * `buildAuditChanges` on the write side already drops unchanged fields and
 * keeps the two sides' keys aligned, so every row here is a real change. The
 * key union still guards the cases it cannot: `sanitizeAuditRecord` can strip a
 * key from one side only, and rows written before that diffing existed carry
 * full snapshots.
 */
const RenderDiff = ({
  before,
  after,
}: {
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}) => {
  const keys = Array.from(
    new Set([...Object.keys(before || {}), ...Object.keys(after || {})]),
  );
  if (keys.length === 0) return null;

  return (
    <div className="divide-y divide-border/60">
      {keys.map((key) => {
        const from = before?.[key];
        const to = after?.[key];
        const changed = JSON.stringify(from) !== JSON.stringify(to);
        const hasBefore = before && key in before;

        return (
          <div key={key} className="grid gap-1 py-3 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)] sm:gap-4">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground sm:pt-0.5">
              {formatKey(key)}
            </span>
            {/* Stacks below `sm` so a long value never forces a horizontal
                scroll on a phone; inline with an arrow from `sm` up. */}
            <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-2">
              {changed && hasBefore && (
                <>
                  <DiffValue value={from} muted />
                  <span aria-hidden className="text-muted-foreground">→</span>
                </>
              )}
              <DiffValue value={to !== undefined ? to : from} />
            </div>
          </div>
        );
      })}
    </div>
  );
};

// One neutral pill for every category (D-03), same as SEVERITY_BADGE: the
// CATEGORY_ICONS glyph below already distinguishes them, and an 11-colour map
// made the column read as a rainbow rather than as data.
/**
 * The expanded detail for one audit entry. Shared by the desktop table row and
 * the mobile card so the two views cannot drift apart.
 */
const AuditLogDetail = ({ log }: { log: any }) => (
<div className="space-y-6 p-6">
  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
    <span className="font-bold uppercase tracking-wider">Action Details</span>
    <span aria-hidden>·</span>
    <span className="capitalize text-foreground">
      {log.action_category.replace("_", " ")}
    </span>
    {log.resource_type && (
      <>
        <span aria-hidden>·</span>
        <span className="capitalize text-foreground">
          {log.resource_type}
        </span>
      </>
    )}
  </div>

  <div className="space-y-2">
    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
      Data Changes
    </h4>
    <div className="rounded-2xl border-0 bg-background/80 px-4 py-1">
      {log.changes ? (
        (log.changes as any).after ||
        (log.changes as any).before ? (
          <RenderDiff
            before={(log.changes as any).before}
            after={(log.changes as any).after}
          />
        ) : (
          <div className="py-3">
            <RenderObject data={log.changes} />
          </div>
        )
      ) : (
        <div className="py-6 text-center text-sm text-muted-foreground">
          This action didn&apos;t change any data.
        </div>
      )}
    </div>
  </div>

  {log.metadata &&
    Object.keys(log.metadata).length > 0 && (
      <div className="space-y-2">
        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Metadata
        </h4>
        <div className="rounded-2xl border-0 bg-background/80 p-4">
          <RenderMetadata
            data={log.metadata as Record<string, unknown>}
          />
        </div>
      </div>
    )}
</div>
);
const CATEGORY_BADGE = "bg-muted text-foreground";

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  menu: <FileText className="h-3.5 w-3.5" />,
  staff: <User className="h-3.5 w-3.5" />,
  order: <Activity className="h-3.5 w-3.5" />,
  inventory: <FileText className="h-3.5 w-3.5" />,
  merchant: <Shield className="h-3.5 w-3.5" />,
  user_management: <User className="h-3.5 w-3.5" />,
  device: <Activity className="h-3.5 w-3.5" />,
  notes: <FileText className="h-3.5 w-3.5" />,
  settings: <Shield className="h-3.5 w-3.5" />,
  authentication: <Shield className="h-3.5 w-3.5" />,
  purchase_order: <FileText className="h-3.5 w-3.5" />,
  expense: <FileText className="h-3.5 w-3.5" />,
};


interface AuditLogsTabProps {
    merchantInfo: MerchantInfoModel;
}

export function AuditLogsTab({ merchantInfo }: AuditLogsTabProps) {
  // Admin view assumes all locations for now
  const locations: {id: string, name: string}[] = []; 
  const isAllLocations = true; 
  const selectedLocationId = null;

  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 7),
    to: new Date(),
  });

  const [filters, setFilters] = useState({
    search: "",
    location_id: "all",
    action_category: "" as AuditCategory | "",
    severity: "" as AuditSeverity | "",
    actor_user_id: "",
  });

  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const { data, isLoading, refetch, isFetching } = useAuditLogs(
    {
      search: filters.search,
      location_id: filters.location_id === "all" ? undefined : filters.location_id,
      action_category: filters.action_category || undefined,
      severity: filters.severity || undefined,
      date_from: dateRange?.from
        ? startOfDay(dateRange.from).toISOString()
        : undefined,
      date_to: dateRange?.to ? endOfDay(dateRange.to).toISOString() : undefined,
    },
    pageSize,
    (page - 1) * pageSize,
    merchantInfo?.clerk_org_id // Pass orgIdOverride
  );

  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1); // Reset to first page on filter change
  };

  const clearFilters = () => {
    setFilters({
      search: "",
      location_id: "all",
      action_category: "",
      severity: "",
      actor_user_id: "",
    });
    setDateRange({
      from: subDays(new Date(), 7),
      to: new Date(),
    });
    setPage(1);
  };

  const handleExport = () => {
    setIsExporting(true)

    try {
      const headers = [
        'Timestamp',
        'Action',
        'Category',
        'Actor',
        'Severity',
        'Resource Type',
        'Resource Name',
        'Location',
        'Changes',
        'Metadata',
      ]

      const rowsCsv = logs.map((log) => [
        log.created_at,
        log.action,
        log.action_category,
        log.actor_name,
        log.severity,
        log.resource_type,
        log.resource_name,
        log.location?.name || 'Global',
        log.changes ? JSON.stringify(log.changes) : '',
        log.metadata ? JSON.stringify(log.metadata) : '',
      ].map(escapeCsvValue).join(','))

      const csv = [headers.map(escapeCsvValue).join(','), ...rowsCsv].join('\\n')
      const timestamp = format(new Date(), 'yyyy-MM-dd_HHmm')
      downloadCsv(`DEXA_Merchant_Audit_${timestamp}.csv`, csv)
    } finally {
      setIsExporting(false)
    }
  }

  const logs = data?.data || [];
  const total = data?.total || 0;

  // Get unique actors from logs for the actor filter
  const uniqueActors = useMemo(() => {
    const actors = new Map<string, string>();
    logs.forEach((log) => {
      if (log.actor_user_id && log.actor_name) {
        actors.set(log.actor_user_id, log.actor_name);
      }
    });
    return Array.from(actors.entries()).map(([id, name]) => ({ id, name }));
  }, [logs]);

  const hasActiveFilters =
    filters.search ||
    filters.action_category ||
    filters.severity ||
    filters.actor_user_id;

  if (!merchantInfo?.clerk_org_id) {
      return <div>Loading merchant configuration...</div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* This tab renders inside the merchant detail page, which already owns
          the page `<h1>` via `MerchantHeaderBar`. The section heading is a
          `PanelSection` label, not a second page title. */}
      <Panel>
        <PanelSection
          icon={Activity}
          label="Audit Logs"
          caption={`Track all administrative actions for ${merchantInfo.name}`}
          action={
            <div className="flex items-center gap-2 flex-wrap">
              <Badge
                variant="outline"
                className="h-9 px-3 text-sm font-normal gap-2"
              >
                <Activity className="h-3.5 w-3.5 text-emerald-500" />
                {total} logs
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isFetching}
                className="h-9"
              >
                <RefreshCw
                  className={cn("h-4 w-4 mr-2", isFetching && "animate-spin")}
                />
                Refresh
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                disabled={isExporting || logs.length === 0}
                className="h-9"
              >
                <Download className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">{isExporting ? 'Exporting...' : 'Export CSV'}</span>
                <span className="sm:hidden">Export</span>
              </Button>
            </div>
          }
        />
      </Panel>

      {/* Filters */}
      <Panel className="p-3 sm:p-6">
          <div className="flex flex-col gap-4">
            {/* Top row - Search and Date Range */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search actions, actors..."
                  className="pl-10 h-11 bg-background/50"
                  value={filters.search}
                  onChange={(e) => handleFilterChange("search", e.target.value)}
                />
              </div>

              {/* Date Range Picker */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "h-10 justify-start text-left font-normal bg-background/50 w-full min-w-0 truncate",
                      !dateRange && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="truncate text-sm">
                    {dateRange?.from ? (
                      dateRange.to ? (
                        `${format(dateRange.from, "MMM d")} – ${format(dateRange.to, "MMM d, yyyy")}`
                      ) : (
                        format(dateRange.from, "MMM d, yyyy")
                      )
                    ) : (
                      "Select date range"
                    )}
                    </span>
                  </Button>
                </PopoverTrigger>
                {/* Matches `app/manage/components/DateRangePicker`: one panel,
                    a single month in range mode. The old two-month layout had
                    no collision padding, so the second month overflowed the
                    viewport. `collisionPadding` keeps it off the edge and the
                    panel is sized to the space between those gutters, which
                    leaves Radix no room to favour a side. */}
                <PopoverContent
                  className="w-auto rounded-xl border p-0 shadow-lg"
                  align="end"
                  collisionPadding={16}
                >
                  <div className="w-[calc(100vw-2rem)] space-y-3 p-4 sm:w-[19rem]">
                    <div className="flex items-baseline justify-between gap-2">
                      <label className="text-sm font-medium text-foreground">
                        Select range
                      </label>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {dateRange?.from
                          ? `${format(dateRange.from, 'MMM d')} - ${
                              dateRange.to ? format(dateRange.to, 'MMM d') : '…'
                            }`
                          : 'Pick a start date'}
                      </span>
                    </div>
                    <Calendar
                      mode="range"
                      defaultMonth={dateRange?.from}
                      selected={dateRange}
                      onSelect={setDateRange}
                      numberOfMonths={1}
                      className="p-0"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() =>
                          setDateRange({
                            from: subDays(new Date(), 7),
                            to: new Date(),
                          })
                        }
                      >
                        Last 7 days
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() =>
                          setDateRange({
                            from: subDays(new Date(), 30),
                            to: new Date(),
                          })
                        }
                      >
                        Last 30 days
                      </Button>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* Bottom row - Filters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              {/* Location Filter */}
              <Select
                value={filters.location_id}
                onValueChange={(val) => handleFilterChange("location_id", val)}
              >
                <SelectTrigger className="h-10 w-full min-w-0 bg-background/50">
                  <SelectValue placeholder="All Locations" />
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

              {/* Category Filter */}
              <Select
                value={filters.action_category}
                onValueChange={(val) =>
                  handleFilterChange(
                    "action_category",
                    val === "all_categories" ? "" : val,
                  )
                }
              >
                <SelectTrigger className="h-10 w-full min-w-0 bg-background/50">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all_categories">All Categories</SelectItem>
                  <SelectItem value="menu">Menu & Items</SelectItem>
                  <SelectItem value="staff">Staff & Access</SelectItem>
                  <SelectItem value="order">Orders & Payments</SelectItem>
                  <SelectItem value="inventory">Inventory</SelectItem>
                  <SelectItem value="merchant">Merchant</SelectItem>
                  <SelectItem value="user_management">User Management</SelectItem>
                  <SelectItem value="device">Device</SelectItem>
                  <SelectItem value="notes">Notes</SelectItem>
                  <SelectItem value="settings">Settings</SelectItem>
                  <SelectItem value="authentication">Authentication</SelectItem>
                  <SelectItem value="purchase_order">
                    Purchase Orders
                  </SelectItem>
                  <SelectItem value="expense">Expenses</SelectItem>
                </SelectContent>
              </Select>

              {/* Severity Filter */}
              <Select
                value={filters.severity}
                onValueChange={(val) =>
                  handleFilterChange(
                    "severity",
                    val === "all_severities" ? "" : val,
                  )
                }
              >
                <SelectTrigger className="h-10 w-full min-w-0 bg-background/50">
                  <SelectValue placeholder="All Severities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all_severities">All Severities</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>

              {/* Actor Filter */}
              <Select
                value={filters.actor_user_id}
                onValueChange={(val) =>
                  handleFilterChange(
                    "actor_user_id",
                    val === "all_actors" ? "" : val,
                  )
                }
              >
                <SelectTrigger className="h-10 w-full min-w-0 bg-background/50">
                  <SelectValue placeholder="All Staff" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all_actors">All Staff</SelectItem>
                  {uniqueActors.map((actor) => (
                    <SelectItem key={actor.id} value={actor.id}>
                      {actor.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Active Filters */}
            {hasActiveFilters && (
              <div className="flex items-center gap-2 pt-2">
                <span className="text-xs text-muted-foreground">
                  Active filters:
                </span>
                <div className="flex flex-wrap gap-2">
                  {filters.search && (
                    <Badge variant="secondary" className="gap-1 pr-1">
                      Search: {filters.search}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-4 w-4 p-0 hover:bg-transparent"
                        onClick={() => handleFilterChange("search", "")}
                        aria-label="Clear search filter"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </Badge>
                  )}
                  {filters.action_category && (
                    <Badge
                      variant="secondary"
                      className="gap-1 pr-1 capitalize"
                    >
                      {filters.action_category.replace("_", " ")}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-4 w-4 p-0 hover:bg-transparent"
                        onClick={() =>
                          handleFilterChange("action_category", "")
                        }
                        aria-label="Clear category filter"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </Badge>
                  )}
                  {filters.severity && (
                    <Badge
                      variant="secondary"
                      className="gap-1 pr-1 capitalize"
                    >
                      {filters.severity}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-4 w-4 p-0 hover:bg-transparent"
                        onClick={() => handleFilterChange("severity", "")}
                        aria-label="Clear severity filter"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </Badge>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={clearFilters}
                >
                  Clear all
                </Button>
              </div>
            )}
          </div>
      </Panel>

      {/* Logs Table */}
      <Panel>
        <div className="overflow-x-auto">
        <Table variant="data" className="min-w-[640px]" containerClassName="hidden lg:block">
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="w-45">
                <div className="flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5" />
                  Timestamp
                </div>
              </TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Actor</TableHead>
              {isAllLocations && <TableHead>Location</TableHead>}
              <TableHead>Severity</TableHead>
              <TableHead className="w-12.5"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-48" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-6 w-20 rounded-full" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-32" />
                  </TableCell>
                  {isAllLocations && (
                    <TableCell>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                  )}
                  <TableCell>
                    <Skeleton className="h-6 w-16 rounded-full" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-4" />
                  </TableCell>
                </TableRow>
              ))
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={isAllLocations ? 7 : 6}
                  className="h-64 text-center text-muted-foreground"
                >
                  <div className="flex flex-col items-center justify-center gap-3">
                    <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center">
                      <GitCompare className="h-8 w-8 opacity-20" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">
                        No audit logs found
                      </p>
                      <p className="text-sm mt-1">
                        Try adjusting your filters or date range
                      </p>
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => (
                <React.Fragment key={log.id}>
                  <TableRow
                    className={cn(
                      "cursor-pointer hover:bg-muted/30",
                      expandedRow === log.id && "bg-muted/40",
                    )}
                    onClick={() =>
                      setExpandedRow(expandedRow === log.id ? null : log.id)
                    }
                  >
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      <div className="flex flex-col">
                        <span>
                          {format(new Date(log.created_at), "MMM d, yyyy")}
                        </span>
                        <span className="text-[10px]">
                          {format(new Date(log.created_at), "HH:mm:ss")}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium text-sm">
                          {log.action}
                        </span>
                        {log.resource_name && (
                          <span className="text-xs text-muted-foreground">
                            {log.resource_type}: {log.resource_name}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={cn(
                          "text-[10px] h-6 px-2 gap-1.5 border-none capitalize",
                          CATEGORY_BADGE,
                        )}
                      >
                        {CATEGORY_ICONS[log.action_category]}
                        {log.action_category.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-linear-to-br from-primary/20 to-primary/10 flex items-center justify-center shrink-0 ring-2 ring-primary/10">
                          <User className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <span className="text-sm font-medium">
                          {log.actor_name}
                        </span>
                      </div>
                    </TableCell>
                    {isAllLocations && (
                      <TableCell>
                        <Badge
                          variant="outline"
                          className="font-normal text-[10px] h-5 px-2 flex items-center gap-1 w-fit"
                        >
                          <MapPin className="h-2.5 w-2.5" />
                          {log.location?.name || "Global"}
                        </Badge>
                      </TableCell>
                    )}
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={cn(
                          "text-[10px] h-6 px-2 gap-1.5 border-none",
                          SEVERITY_BADGE,
                        )}
                      >
                        {
                          SEVERITY_ICONS[
                            log.severity as keyof typeof SEVERITY_ICONS
                          ]
                        }
                        <span className="capitalize">{log.severity}</span>
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {expandedRow === log.id ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </TableCell>
                  </TableRow>
                  {expandedRow === log.id && (
                    <TableRow className="bg-muted/20 border-none">
                      <TableCell colSpan={isAllLocations ? 7 : 6} className="p-0">
                        <AuditLogDetail log={log} />
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              ))
            )}
          </TableBody>
        </Table>

        {/* Mirrors the table's `hidden lg:block`. Each card is the row plus the
            same expandable detail, so mobile loses no information. */}
        <div className="grid min-w-0 grid-cols-1 gap-3 lg:hidden">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-2xl" />
            ))
          ) : logs.length === 0 ? (
            <div className="rounded-2xl bg-muted/45 py-10 text-center text-sm text-muted-foreground">
              No audit logs found
            </div>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="min-w-0 overflow-hidden rounded-2xl bg-muted/45">
                <button
                  type="button"
                  onClick={() => setExpandedRow(expandedRow === log.id ? null : log.id)}
                  aria-expanded={expandedRow === log.id}
                  className="flex w-full min-w-0 items-start justify-between gap-3 p-4 text-left"
                >
                  <div className="min-w-0 space-y-1.5">
                    <p className="truncate font-medium">{log.action}</p>
                    {log.resource_name && (
                      <p className="truncate text-xs text-muted-foreground">
                        {log.resource_type}: {log.resource_name}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      <Badge
                        variant="secondary"
                        className={cn("h-6 gap-1.5 border-none px-2 text-[10px] capitalize", CATEGORY_BADGE)}
                      >
                        {CATEGORY_ICONS[log.action_category]}
                        {log.action_category.replace("_", " ")}
                      </Badge>
                      <Badge
                        variant="secondary"
                        className={cn("h-6 gap-1.5 border-none px-2 text-[10px]", SEVERITY_BADGE)}
                      >
                        {SEVERITY_ICONS[log.severity as keyof typeof SEVERITY_ICONS]}
                        <span className="capitalize">{log.severity}</span>
                      </Badge>
                    </div>
                    <p className="pt-0.5 text-xs text-muted-foreground">
                      {format(new Date(log.created_at), "MMM d, yyyy HH:mm")} · {log.actor_name}
                    </p>
                  </div>
                  {expandedRow === log.id ? (
                    <ChevronUp className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                </button>

                {expandedRow === log.id && (
                  <div className="border-t border-border/60 bg-background/60">
                    <AuditLogDetail log={log} />
                  </div>
                )}
              </div>
            ))
          )}
        </div>
        </div>
      </Panel>
      
      {/* Pagination (Simple for now) */}
      <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
          <span className="text-sm">Page {page}</span>
          <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={logs.length < pageSize}>Next</Button>
      </div>
    </div>
  );
}
