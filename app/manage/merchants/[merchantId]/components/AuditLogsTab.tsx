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
import { Card, CardContent } from "@/components/ui/card";
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
  Filter,
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

const SEVERITY_COLORS: Record<AuditSeverity, string> = {
  info: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  warning:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  critical: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

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

const CATEGORY_COLORS: Record<string, string> = {
  menu: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
  staff:
    "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  order:
    "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  inventory:
    "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  merchant:
    "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
  user_management:
    "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300",
  device:
    "bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300",
  notes:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  settings: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  authentication:
    "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  purchase_order:
    "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  expense:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
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
      {/* Premium Header */}
      {/* Standard Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Audit Logs</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Track all administrative actions for {merchantInfo.name}
          </p>
        </div>

        <div className="flex items-center gap-3">
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
            {isExporting ? 'Exporting...' : 'Export CSV'}
          </Button>
        </div>
      </div>

      {/* Filters Card */}
      <Card className="border-none shadow-lg bg-card/80 backdrop-blur-sm">
        <CardContent className="p-6">
          <div className="flex flex-col gap-4">
            {/* Top row - Search and Date Range */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search actions, actors, resources..."
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
                      "h-11 justify-start text-left font-normal bg-background/50",
                      !dateRange && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                    {dateRange?.from ? (
                      dateRange.to ? (
                        <>
                          {format(dateRange.from, "MMM d, yyyy")} -{" "}
                          {format(dateRange.to, "MMM d, yyyy")}
                        </>
                      ) : (
                        format(dateRange.from, "MMM d, yyyy")
                      )
                    ) : (
                      <span>Select date range</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    initialFocus
                    mode="range"
                    defaultMonth={dateRange?.from}
                    selected={dateRange}
                    onSelect={setDateRange}
                    numberOfMonths={2}
                  />
                  <div className="flex gap-2 p-3 border-t">
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
                </PopoverContent>
              </Popover>
            </div>

            {/* Bottom row - Filters */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* Location Filter */}
              <Select
                value={filters.location_id}
                onValueChange={(val) => handleFilterChange("location_id", val)}
              >
                <SelectTrigger className="h-11 bg-background/50">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
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
                <SelectTrigger className="h-11 bg-background/50">
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-muted-foreground" />
                    <SelectValue placeholder="All Categories" />
                  </div>
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
                <SelectTrigger className="h-11 bg-background/50">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-muted-foreground" />
                    <SelectValue placeholder="All Severities" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all_severities">All Severities</SelectItem>
                  <SelectItem value="info">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-blue-500" />
                      Info
                    </div>
                  </SelectItem>
                  <SelectItem value="warning">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-amber-500" />
                      Warning
                    </div>
                  </SelectItem>
                  <SelectItem value="critical">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-red-500" />
                      Critical
                    </div>
                  </SelectItem>
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
                <SelectTrigger className="h-11 bg-background/50">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <SelectValue placeholder="All Staff" />
                  </div>
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
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Card className="border-none shadow-lg overflow-hidden">
        <Table>
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
                      "group cursor-pointer hover:bg-muted/30 transition-colors",
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
                          CATEGORY_COLORS[log.action_category] || "bg-gray-100",
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
                          SEVERITY_COLORS[
                            log.severity as keyof typeof SEVERITY_COLORS
                          ],
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
                        <ChevronDown className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      )}
                    </TableCell>
                  </TableRow>
                  {expandedRow === log.id && (
                    <TableRow className="bg-muted/20 border-none">
                      <TableCell
                        colSpan={isAllLocations ? 7 : 6}
                        className="p-0"
                      >
                        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8 animate-in slide-in-from-top-2 duration-200">
                          {/* Changes Section */}
                          <div className="space-y-3">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">
                              Action Details
                            </h4>
                            <div className="rounded-xl border bg-background/80 p-5 space-y-4">
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">
                                    Action Category
                                  </p>
                                  <Badge
                                    variant="outline"
                                    className="capitalize"
                                  >
                                    {log.action_category.replace("_", " ")}
                                  </Badge>
                                </div>
                                <div>
                                  <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">
                                    Resource Type
                                  </p>
                                  <Badge
                                    variant="outline"
                                    className="capitalize"
                                  >
                                    {log.resource_type || "N/A"}
                                  </Badge>
                                </div>
                              </div>
                              {/* Resource ID hidden - managers don't need to see raw UUIDs */}
                              {log.metadata &&
                                Object.keys(log.metadata).length > 0 && (
                                  <div>
                                    <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-2">
                                      Metadata
                                    </p>
                                    <div className="p-4 rounded-xl border border-dashed">
                                      <RenderObject
                                        data={log.metadata}
                                        className="grid-cols-1 sm:grid-cols-1"
                                      />
                                    </div>
                                  </div>
                                )}
                            </div>
                          </div>

                          {/* Data Changes */}
                          <div className="space-y-3">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">
                              Data Changes
                            </h4>
                            <div className="rounded-xl border bg-background/80 overflow-hidden">
                              {log.changes ? (
                                <div className="p-5">
                                  {/* Check for before/after structure or flat object */}
                                  {(log.changes as any).after ||
                                  (log.changes as any).before ? (
                                    <div className="space-y-6">
                                      {(log.changes as any).after && (
                                        <div className="space-y-2">
                                          <div className="flex items-center gap-2">
                                            <div className="h-2 w-2 rounded-full bg-emerald-500" />
                                            <h5 className="text-[10px] uppercase font-bold text-muted-foreground">
                                              New Values
                                            </h5>
                                          </div>
                                          <div className="bg-emerald-500/5 p-4 rounded-lg border border-emerald-500/10">
                                            <RenderObject
                                              data={(log.changes as any).after}
                                            />
                                          </div>
                                        </div>
                                      )}
                                      {(log.changes as any).before &&
                                        Object.keys(
                                          (log.changes as any).before || {},
                                        ).length > 0 && (
                                          <div className="space-y-2">
                                            <div className="flex items-center gap-2">
                                              <div className="h-2 w-2 rounded-full bg-amber-500" />
                                              <h5 className="text-[10px] uppercase font-bold text-muted-foreground">
                                                Previous Values
                                              </h5>
                                            </div>
                                            <div className="bg-amber-500/5 p-4 rounded-lg border border-amber-500/10 opacity-75">
                                              <RenderObject
                                                data={
                                                  (log.changes as any).before
                                                }
                                              />
                                            </div>
                                          </div>
                                        )}
                                    </div>
                                  ) : (
                                    <RenderObject data={log.changes} />
                                  )}
                                </div>
                              ) : (
                                <div className="p-8 text-center text-muted-foreground italic text-sm">
                                  No structured data changes recorded for this
                                  action.
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
      
      {/* Pagination (Simple for now) */}
      <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
          <span className="text-sm">Page {page}</span>
          <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={logs.length < pageSize}>Next</Button>
      </div>
    </div>
  );
}
