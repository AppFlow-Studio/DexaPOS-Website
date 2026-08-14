"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronRight,
  X,
} from "lucide-react";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTipDistributionHistory } from "../hooks/useTipDistribution";
import {
  STATUS_CONFIG,
  SHIFT_LABELS,
  formatMoney,
  formatDate,
} from "../lib/constants";
import { cn } from "@/lib/utils";
import type { TipDistributionSession } from "@/app/dashboard/actions/tips";

interface HistoryTableProps {
  clerkOrgId: string | undefined;
  locationId: string | undefined;
}

const FILTERABLE_STATUSES = [
  { value: "calculated", label: "Calculated" },
  { value: "approved", label: "Approved" },
  { value: "voided", label: "Voided" },
] as const;

type SortField = "date" | "collected" | "distributed" | "pooled" | "status";
type SortDir = "asc" | "desc";

function getPoolSummary(snapshot: any): string {
  if (!snapshot?.pools || snapshot.pools.length === 0) return "No pools";
  return snapshot.pools
    .map((p: any) => `${p.name} (${(p.distribution_method || "").replace("_", " ")})`)
    .join(", ");
}

function getRuleSummary(snapshot: any): string {
  if (!snapshot?.tip_out_rules || snapshot.tip_out_rules.length === 0) return "No rules";
  return snapshot.tip_out_rules
    .map((r: any) => `${r.from_role_code}→${r.to_role_code}`)
    .join(", ");
}

export function HistoryTable({ clerkOrgId, locationId }: HistoryTableProps) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<string[]>(["calculated", "approved", "voided"]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const { data: sessions = [], isLoading } = useTipDistributionHistory(
    clerkOrgId,
    locationId,
    100,
    statusFilter.length > 0 ? statusFilter : undefined,
    dateFrom || undefined,
    dateTo || undefined
  );

  // Client-side sorting
  const sorted = useMemo(() => {
    const copy = [...sessions];
    copy.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "date":
          cmp = a.session_date.localeCompare(b.session_date);
          if (cmp === 0) cmp = a.sequence_number - b.sequence_number;
          break;
        case "collected":
          cmp = a.total_tips_collected - b.total_tips_collected;
          break;
        case "distributed":
          cmp = a.total_distributed - b.total_distributed;
          break;
        case "pooled":
          cmp = a.total_tips_pooled - b.total_tips_pooled;
          break;
        case "status":
          cmp = a.status.localeCompare(b.status);
          break;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
    return copy;
  }, [sessions, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const toggleStatus = (status: string) => {
    setStatusFilter((prev) =>
      prev.includes(status)
        ? prev.filter((s) => s !== status)
        : [...prev, status]
    );
  };

  const clearFilters = () => {
    setDateFrom("");
    setDateTo("");
    setStatusFilter(["calculated", "approved", "voided"]);
  };

  const hasActiveFilters = dateFrom || dateTo || statusFilter.length < 3;

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-30" />;
    return sortDir === "desc"
      ? <ArrowDown className="w-3 h-3 ml-1" />
      : <ArrowUp className="w-3 h-3 ml-1" />;
  };

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <Label className="text-xs text-muted-foreground">From</Label>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="mt-1 w-36 h-9"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">To</Label>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="mt-1 w-36 h-9"
          />
        </div>
        <div className="flex items-center gap-3">
          {FILTERABLE_STATUSES.map((s) => (
            <label key={s.value} className="flex items-center gap-1.5 cursor-pointer">
              <Checkbox
                checked={statusFilter.includes(s.value)}
                onCheckedChange={() => toggleStatus(s.value)}
              />
              <span className="text-sm">{s.label}</span>
            </label>
          ))}
        </div>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 text-xs text-muted-foreground">
            <X className="w-3 h-3 mr-1" />
            Clear
          </Button>
        )}
        <div className="ml-auto text-xs text-muted-foreground">
          {sessions.length} session{sessions.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <div className="rounded-2xl border-0 bg-muted/60 p-10 text-center">
          <Search className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            No distribution records for the selected filters
          </p>
        </div>
      ) : (
        <TooltipProvider>
          <div className="-mx-2 overflow-x-auto px-2">
            <Table className="min-w-max">
              <TableHeader>
                <TableRow className="border-b border-border/60 hover:bg-transparent">
                  <TableHead className="h-auto py-2.5 text-[0.8125rem] font-normal text-muted-foreground">
                    <button className="flex items-center text-left" onClick={() => toggleSort("date")}>
                      Date <SortIcon field="date" />
                    </button>
                  </TableHead>
                  <TableHead className="h-auto py-2.5 text-[0.8125rem] font-normal text-muted-foreground">Shift</TableHead>
                  <TableHead className="h-auto py-2.5 text-[0.8125rem] font-normal text-muted-foreground">
                    <button className="flex items-center" onClick={() => toggleSort("status")}>
                      Status <SortIcon field="status" />
                    </button>
                  </TableHead>
                  <TableHead className="h-auto py-2.5 text-right text-[0.8125rem] font-normal text-muted-foreground">
                    <button className="flex items-center ml-auto" onClick={() => toggleSort("collected")}>
                      Collected <SortIcon field="collected" />
                    </button>
                  </TableHead>
                  <TableHead className="h-auto py-2.5 text-right text-[0.8125rem] font-normal text-muted-foreground">
                    <button className="flex items-center ml-auto" onClick={() => toggleSort("distributed")}>
                      Distributed <SortIcon field="distributed" />
                    </button>
                  </TableHead>
                  <TableHead className="h-auto py-2.5 text-right text-[0.8125rem] font-normal text-muted-foreground">
                    <button className="flex items-center ml-auto" onClick={() => toggleSort("pooled")}>
                      Pooled <SortIcon field="pooled" />
                    </button>
                  </TableHead>
                  <TableHead className="h-auto py-2.5 text-[0.8125rem] font-normal text-muted-foreground">Config</TableHead>
                  <TableHead className="h-auto py-2.5 text-[0.8125rem] font-normal text-muted-foreground"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((session) => {
                  const cfg = STATUS_CONFIG[session.status] ?? STATUS_CONFIG.draft;
                  const poolSummary = getPoolSummary(session.config_snapshot);
                  const ruleSummary = getRuleSummary(session.config_snapshot);

                  return (
                    <TableRow
                      key={session.id}
                      className="cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50"
                      onClick={() => router.push(`/dashboard/tips/${session.id}`)}
                    >
                      {/* Date + sequence */}
                      <TableCell className="py-3 text-sm font-medium">
                        <div className="flex items-center gap-1.5">
                          <span>{formatDate(session.session_date)}</span>
                          {session.sequence_number > 1 && (
                            <Badge variant="outline" className="text-[10px] font-mono">
                              #{session.sequence_number}
                            </Badge>
                          )}
                        </div>
                        {session.data_start_after && session.data_cutoff_at && (
                          <span className="text-[10px] text-muted-foreground">
                            {format(new Date(session.data_start_after), "h:mm a")} —{" "}
                            {format(new Date(session.data_cutoff_at), "h:mm a")}
                          </span>
                        )}
                      </TableCell>

                      {/* Shift */}
                      <TableCell className="py-3 text-sm">
                        <Badge variant="secondary" className="text-xs">
                          {SHIFT_LABELS[session.shift_period] || session.shift_period}
                        </Badge>
                      </TableCell>

                      {/* Status + timestamps */}
                      <TableCell className="py-3 text-sm">
                        <div className="space-y-0.5">
                          <Badge
                            variant="outline"
                            className={cn("text-xs font-medium border-0", cfg.className)}
                          >
                            {cfg.label}
                          </Badge>
                          {session.status === "voided" && session.void_reason && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <p className="text-[10px] text-red-500 dark:text-red-400 truncate max-w-[120px]">
                                  {session.void_reason}
                                </p>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="max-w-[250px]">{session.void_reason}</p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                          {session.approved_at && (
                            <p className="text-[10px] text-muted-foreground">
                              {format(new Date(session.approved_at), "MMM d, h:mm a")}
                            </p>
                          )}
                        </div>
                      </TableCell>

                      {/* Collected */}
                      <TableCell className="py-3 text-right text-sm font-medium tabular-nums">
                        {formatMoney(session.total_tips_collected)}
                      </TableCell>

                      {/* Distributed */}
                      <TableCell className="py-3 text-right text-sm font-medium tabular-nums">
                        {formatMoney(session.total_distributed)}
                      </TableCell>

                      {/* Pooled */}
                      <TableCell className="py-3 text-right text-sm text-muted-foreground tabular-nums">
                        {formatMoney(session.total_tips_pooled)}
                      </TableCell>

                      {/* Config snapshot summary */}
                      <TableCell className="py-3 text-sm">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="max-w-[150px]">
                              <p className="text-xs truncate text-muted-foreground">
                                {poolSummary}
                              </p>
                              {ruleSummary !== "No rules" && (
                                <p className="text-[10px] truncate text-muted-foreground/70">
                                  {ruleSummary}
                                </p>
                              )}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="left" className="max-w-[300px]">
                            <p className="font-medium text-xs mb-1">Pools:</p>
                            <p className="text-xs">{poolSummary}</p>
                            <p className="font-medium text-xs mt-1.5 mb-0.5">Tip-Out Rules:</p>
                            <p className="text-xs">{ruleSummary}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>

                      {/* Arrow */}
                      <TableCell className="py-3 text-sm">
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </TooltipProvider>
      )}
    </div>
  );
}
