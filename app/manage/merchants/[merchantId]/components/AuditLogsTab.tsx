'use client'

import React, { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
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
  Download,
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
import { PaginationBar } from "@/components/dashboard/PaginationBar";
import type { PaginationMeta } from "@/types/pagination";
import {
  RecordLinkCard,
  RowLink,
} from "@/app/manage/transactions/components/ledger-primitives";
import { merchantAuditLogHref } from "../audit/routes";
import { formatKey } from "../audit/[logId]/audit-detail-parts";

// The borderless cell pill (§5.2, §4.6b) for every category and severity: the
// word carries the meaning; the merchant-detail page raises no alarms (§14.3).
const CELL_BADGE = "w-fit gap-1.5 rounded-full border-0 px-2.5 text-xs font-medium";

const SEVERITY_ICONS = {
  info: <Info className="h-3 w-3" />,
  warning: <AlertTriangle className="h-3 w-3" />,
  critical: <AlertCircle className="h-3 w-3" />,
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


type AuditTabFilters = {
  search: string;
  location_id: string;
  action_category: AuditCategory | "";
  severity: AuditSeverity | "";
  actor_user_id: string;
};

const DEFAULT_FILTERS: AuditTabFilters = {
  search: "",
  location_id: "all",
  action_category: "",
  severity: "",
  actor_user_id: "",
};

const defaultDateRange = (): DateRange => ({
  from: subDays(new Date(), 7),
  to: new Date(),
});

/**
 * Each entry opens on its own page, so the tab unmounts on the way there.
 * Filters, range and page are kept per merchant for the browser tab's session
 * so "Back to audit log" lands where the reviewer left off.
 */
type SavedAuditTabState = {
  filters: AuditTabFilters;
  from?: string;
  to?: string;
  page: number;
};

const savedStateKey = (merchantId: string) => `hq-merchant-audit:${merchantId}`;

function readSavedState(merchantId: string | undefined): SavedAuditTabState | null {
  if (!merchantId) return null;
  try {
    const raw = sessionStorage.getItem(savedStateKey(merchantId));
    return raw ? (JSON.parse(raw) as SavedAuditTabState) : null;
  } catch {
    return null;
  }
}

interface AuditLogsTabProps {
    merchantInfo: MerchantInfoModel;
}

export function AuditLogsTab({ merchantInfo }: AuditLogsTabProps) {
  const router = useRouter();
  // Admin view assumes all locations for now
  const locations: {id: string, name: string}[] = [];
  const isAllLocations = true;
  const selectedLocationId = null;

  const [saved] = useState(() => readSavedState(merchantInfo?.id));

  const [dateRange, setDateRange] = useState<DateRange | undefined>(() =>
    saved
      ? saved.from
        ? { from: new Date(saved.from), to: saved.to ? new Date(saved.to) : undefined }
        : undefined
      : defaultDateRange(),
  );

  const [filters, setFilters] = useState<AuditTabFilters>(
    () => ({ ...DEFAULT_FILTERS, ...saved?.filters }),
  );

  const [page, setPage] = useState(saved?.page ?? 1);
  // §5.7: a data table shows at most 10 rows per page.
  const pageSize = 10;
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    if (!merchantInfo?.id) return;
    const state: SavedAuditTabState = {
      filters,
      from: dateRange?.from?.toISOString(),
      to: dateRange?.to?.toISOString(),
      page,
    };
    try {
      sessionStorage.setItem(savedStateKey(merchantInfo.id), JSON.stringify(state));
    } catch {
      // Storage blocked (private mode): the tab still works, it just forgets.
    }
  }, [merchantInfo?.id, filters, dateRange, page]);

  // A new date range is a new result set — start it from the first page.
  const changeDateRange = (range: DateRange | undefined) => {
    setDateRange(range);
    setPage(1);
  };

  const { data, isLoading } = useAuditLogs(
    {
      search: filters.search,
      location_id: filters.location_id === "all" ? undefined : filters.location_id,
      action_category: filters.action_category || undefined,
      severity: filters.severity || undefined,
      actor_user_id: filters.actor_user_id || undefined,
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
    setFilters(DEFAULT_FILTERS);
    setDateRange(defaultDateRange());
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

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pagination: PaginationMeta = {
    page,
    pageSize,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };

  if (!merchantInfo?.clerk_org_id) {
    return (
      <Panel>
        <PanelSection icon={Activity} label="Audit Logs">
          <p className="text-sm text-muted-foreground">
            Loading merchant configuration…
          </p>
        </PanelSection>
      </Panel>
    );
  }

  const columnCount = isAllLocations ? 6 : 5;

  return (
    // This tab renders inside the merchant detail page, which already owns the
    // page `<h1>`. The section heading is a `PanelSection` label, and the
    // toolbar, table and pager share that one section (§5.2).
    <Panel>
      <PanelSection
        icon={Activity}
        label="Audit Logs"
        caption={`Track all administrative actions for ${merchantInfo.name}`}
        action={
          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-muted-foreground tabular-nums sm:inline">
              {total.toLocaleString()} logs
            </span>
            <Button
              variant="outline"
              onClick={handleExport}
              disabled={isExporting || logs.length === 0}
              className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
            >
              <Download className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">{isExporting ? 'Exporting...' : 'Export CSV'}</span>
              <span className="sm:hidden">Export</span>
            </Button>
          </div>
        }
      >
        {/* Filters */}
        <div className="flex flex-col gap-3">
          {/* Top row - Search and Date Range */}
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2 [&>*]:min-w-0">
            {/* Search */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
              <Input
                placeholder="Search actions, actors..."
                className="h-10 pl-10"
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
                    "h-10 w-full min-w-0 justify-start truncate rounded-full px-4 text-left text-[0.8125rem] font-medium shadow-sm",
                    !dateRange && "text-muted-foreground",
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate tabular-nums">
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
                  leaves Radix no room to favour a side. On a short phone
                  screen the panel is also taller than the space under the
                  trigger, so it is capped at Radix's measured available
                  height and scrolls inside; mobile day cells drop the
                  square aspect so it usually fits without scrolling. */}
              <PopoverContent
                className="max-h-[var(--radix-popover-content-available-height)] w-auto overflow-y-auto overscroll-contain rounded-2xl p-0"
                align="end"
                collisionPadding={16}
              >
                <div className="w-[calc(100vw-2rem)] space-y-2 p-3 sm:w-[19rem] sm:space-y-3 sm:p-4">
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
                    onSelect={changeDateRange}
                    numberOfMonths={1}
                    className="p-0"
                    classNames={{
                      day: "relative flex h-9 items-center justify-center p-0 text-center text-sm sm:aspect-square sm:h-auto",
                    }}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() =>
                        changeDateRange({
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
                        changeDateRange({
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 [&>*]:min-w-0">
            {/* Location Filter */}
            <Select
              value={filters.location_id}
              onValueChange={(val) => handleFilterChange("location_id", val)}
            >
              <SelectTrigger className="h-10 w-full min-w-0">
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
              <SelectTrigger className="h-10 w-full min-w-0">
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
              <SelectTrigger className="h-10 w-full min-w-0">
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
              <SelectTrigger className="h-10 w-full min-w-0">
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
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-xs text-muted-foreground">
                Active filters:
              </span>
              <div className="flex flex-wrap gap-2">
                {filters.search && (
                  <Badge variant="outline" className="gap-1 pr-1">
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
                    variant="outline"
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
                    variant="outline"
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

        {/* Logs Table */}
        <div className="mt-5 min-w-0">
          {/* Unbounded: the log is already paged, so the page scrolls rather
              than a second scroller nested under the pinned section bar. */}
          <Table variant="data" bounded={false} className="min-w-[640px]" containerClassName="hidden lg:block">
            <TableHeader>
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
                  </TableRow>
                ))
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columnCount} className="h-24 text-center">
                    <p className="text-sm font-medium">No audit logs in this period</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Widen the date range or clear the filters to see more.
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => {
                  // Each entry opens on its own page. The row is clickable
                  // for the mouse; the action is the real link for keyboard,
                  // middle-click and open-in-new-tab.
                  const href = merchantAuditLogHref(merchantInfo.id, log.id);
                  return (
                    <TableRow
                      key={log.id}
                      className="cursor-pointer"
                      onClick={() => router.push(href)}
                    >
                      <TableCell className="font-mono text-xs text-muted-foreground tabular-nums">
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
                          <RowLink href={href} className="text-sm font-medium">
                            {log.action}
                          </RowLink>
                          {log.resource_name && (
                            <span className="text-xs text-muted-foreground">
                              {log.resource_type}: {log.resource_name}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={cn(CELL_BADGE, "capitalize")}>
                          {CATEGORY_ICONS[log.action_category]}
                          {log.action_category.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                            <User className="h-3.5 w-3.5" />
                          </div>
                          <span className="text-sm font-medium">
                            {log.actor_name}
                          </span>
                        </div>
                      </TableCell>
                      {isAllLocations && (
                        <TableCell>
                          <Badge variant="secondary" className={CELL_BADGE}>
                            <MapPin className="h-3 w-3" />
                            {log.location?.name || "Global"}
                          </Badge>
                        </TableCell>
                      )}
                      <TableCell>
                        <Badge variant="secondary" className={CELL_BADGE}>
                          {
                            SEVERITY_ICONS[
                              log.severity as keyof typeof SEVERITY_ICONS
                            ]
                          }
                          <span className="capitalize">{log.severity}</span>
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>

          {/* Mirrors the table's `hidden lg:block` (§5.3). Phone cards are a
              lean summary — what, who, when; the rest is on the entry's page. */}
          <div className="grid min-w-0 grid-cols-1 gap-3 lg:hidden">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="space-y-3 rounded-2xl bg-muted/45 p-4">
                  <Skeleton className="h-4 w-2/3" />
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                </div>
              ))
            ) : logs.length === 0 ? (
              <div className="rounded-2xl bg-muted/30 px-4 py-10 text-center">
                <p className="text-sm font-medium">No audit logs in this period</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Widen the date range or clear the filters to see more.
                </p>
              </div>
            ) : (
              logs.map((log) => (
                <RecordLinkCard
                  key={log.id}
                  href={merchantAuditLogHref(merchantInfo.id, log.id)}
                  title={log.action}
                  subtitle={[log.actor_name, formatKey(log.action_category)]
                    .filter(Boolean)
                    .join(" · ")}
                  status={format(new Date(log.created_at), "MMM d, HH:mm")}
                />
              ))
            )}
          </div>

          {/* Only the first load locks the pager. Every query on this page is a
              server action, and Next runs those one at a time, so a page fetch
              can wait behind other tabs' refetches; `isFetching` would keep
              Previous/Next disabled for all of it. The previous page's rows
              stay on screen meanwhile (keepPreviousData). */}
          <PaginationBar
            pagination={pagination}
            onPageChange={setPage}
            isLoading={isLoading}
            itemLabel="logs"
          />
        </div>
      </PanelSection>
    </Panel>
  );
}
