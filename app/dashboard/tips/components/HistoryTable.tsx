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
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DatePopover } from "@/components/ui/date-popover";
import { TipStatusBadge } from "./TipStatusBadge";
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
import { SHIFT_LABELS, formatMoney, formatDate } from "../lib/constants";
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
      {/* Filter bar. Native `type="date"` fields render browser chrome that
          matches nothing else in the dashboard (§11.1) — DatePopover gives the
          same value contract with the app's own calendar. */}
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <DatePopover
          value={dateFrom}
          onChange={(v) => setDateFrom(v ?? "")}
          placeholder="From"
          max={dateTo || undefined}
          className="h-9 w-auto min-w-[9rem] rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
        />
        <DatePopover
          value={dateTo}
          onChange={(v) => setDateTo(v ?? "")}
          placeholder="To"
          min={dateFrom || undefined}
          className="h-9 w-auto min-w-[9rem] rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
        />

        {/* Toggle chips (DS-CTL-03) rather than a row of loose checkboxes —
            the checkbox+label pairs read as a form inside what is a toolbar. */}
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {FILTERABLE_STATUSES.map((s) => {
            const active = statusFilter.includes(s.value);
            return (
              <button
                key={s.value}
                type="button"
                aria-pressed={active}
                onClick={() => toggleStatus(s.value)}
                className={cn(
                  "inline-flex h-9 shrink-0 items-center rounded-full px-4 text-[0.8125rem] font-medium transition-colors",
                  active
                    ? "bg-muted text-foreground"
                    : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {s.label}
              </button>
            );
          })}
        </div>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="h-9 rounded-full px-4 text-[0.8125rem] font-medium text-muted-foreground"
          >
            <X className="mr-1.5 h-3.5 w-3.5" />
            Clear
          </Button>
        )}

        <span className="ml-auto shrink-0 text-[0.8125rem] tabular-nums text-muted-foreground">
          {sessions.length} session{sessions.length !== 1 ? "s" : ""}
        </span>
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
          {/* Wide screens get the table; phones and tablets get cards below,
              so an 8-column row never becomes a horizontal scroller. Matches
              StaffDataTable. */}
          <Table
            variant="data"
            containerClassName="hidden xl:block"
            className="min-w-[1000px]"
          >
            <TableHeader className="[&_tr]:border-0">
                <TableRow>
                  <TableHead className="text-[0.8125rem] font-normal text-muted-foreground">
                    <button className="flex items-center text-left" onClick={() => toggleSort("date")}>
                      Date <SortIcon field="date" />
                    </button>
                  </TableHead>
                  <TableHead className="text-[0.8125rem] font-normal text-muted-foreground">Shift</TableHead>
                  <TableHead className="text-[0.8125rem] font-normal text-muted-foreground">
                    <button className="flex items-center" onClick={() => toggleSort("status")}>
                      Status <SortIcon field="status" />
                    </button>
                  </TableHead>
                  <TableHead className="text-right text-[0.8125rem] font-normal text-muted-foreground">
                    <button className="flex items-center ml-auto" onClick={() => toggleSort("collected")}>
                      Collected <SortIcon field="collected" />
                    </button>
                  </TableHead>
                  <TableHead className="text-right text-[0.8125rem] font-normal text-muted-foreground">
                    <button className="flex items-center ml-auto" onClick={() => toggleSort("distributed")}>
                      Distributed <SortIcon field="distributed" />
                    </button>
                  </TableHead>
                  <TableHead className="text-right text-[0.8125rem] font-normal text-muted-foreground">
                    <button className="flex items-center ml-auto" onClick={() => toggleSort("pooled")}>
                      Pooled <SortIcon field="pooled" />
                    </button>
                  </TableHead>
                  <TableHead className="text-[0.8125rem] font-normal text-muted-foreground">Config</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((session) => {
                  const poolSummary = getPoolSummary(session.config_snapshot);
                  const ruleSummary = getRuleSummary(session.config_snapshot);

                  return (
                    <TableRow
                      key={session.id}
                      className="cursor-pointer"
                      onClick={() => router.push(`/dashboard/tips/${session.id}`)}
                    >
                      {/* Date + sequence */}
                      <TableCell className="text-sm font-medium">
                        <div className="flex items-center gap-1.5">
                          <span>{formatDate(session.session_date)}</span>
                          {session.sequence_number > 1 && (
                            <span className="shrink-0 rounded-full bg-muted/60 px-2 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
                              #{session.sequence_number}
                            </span>
                          )}
                        </div>
                        {session.data_start_after && session.data_cutoff_at && (
                          <span className="text-[0.75rem] tabular-nums text-muted-foreground">
                            {format(new Date(session.data_start_after), "h:mm a")} —{" "}
                            {format(new Date(session.data_cutoff_at), "h:mm a")}
                          </span>
                        )}
                      </TableCell>

                      {/* Shift */}
                      <TableCell className="text-sm">
                        <span className="inline-flex shrink-0 items-center rounded-full bg-muted/60 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                          {SHIFT_LABELS[session.shift_period] || session.shift_period || "—"}
                        </span>
                      </TableCell>

                      {/* Status + timestamps */}
                      <TableCell className="text-sm">
                        {/* A fixed cap, not just `truncate`: without a width
                            bound the reason string sets the column width and
                            pushes the money columns off the scroller. */}
                        <div className="w-[150px] max-w-[150px] space-y-1">
                          <TipStatusBadge status={session.status} />
                          {session.status === "voided" && session.void_reason && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <p className="truncate text-[0.75rem] text-muted-foreground">
                                  {session.void_reason}
                                </p>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="max-w-[250px]">{session.void_reason}</p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                          {session.approved_at && (
                            <p className="truncate text-[0.75rem] tabular-nums text-muted-foreground">
                              {format(new Date(session.approved_at), "MMM d, h:mm a")}
                            </p>
                          )}
                        </div>
                      </TableCell>

                      {/* Collected */}
                      <TableCell className="text-right text-sm font-medium tabular-nums">
                        {formatMoney(session.total_tips_collected)}
                      </TableCell>

                      {/* Distributed */}
                      <TableCell className="text-right text-sm font-medium tabular-nums">
                        {formatMoney(session.total_distributed)}
                      </TableCell>

                      {/* Pooled */}
                      <TableCell className="text-right text-sm text-muted-foreground tabular-nums">
                        {formatMoney(session.total_tips_pooled)}
                      </TableCell>

                      {/* Config snapshot summary */}
                      <TableCell className="text-sm">
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
                      <TableCell className="text-sm">
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {/* Phones and tablets: cards instead of a scrolling table. */}
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:hidden">
              {sorted.map((session) => {
                const poolSummary = getPoolSummary(session.config_snapshot);
                const variance =
                  session.total_tips_collected - session.total_distributed;

                return (
                  <article
                    key={session.id}
                    className="min-w-0 rounded-2xl border-0 bg-muted/45 p-4"
                  >
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate text-sm font-semibold">
                            {formatDate(session.session_date)}
                          </span>
                          {session.sequence_number > 1 && (
                            <span className="shrink-0 rounded-full bg-background px-2 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
                              #{session.sequence_number}
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {SHIFT_LABELS[session.shift_period] || session.shift_period || "—"}
                        </p>
                      </div>
                      <TipStatusBadge status={session.status} />
                    </div>

                    <div className="mt-5 grid min-w-0 grid-cols-2 gap-x-4 gap-y-5">
                      <div className="min-w-0">
                        <p className="text-[0.8125rem] text-muted-foreground">Collected</p>
                        <p className="mt-0.5 text-sm font-medium tabular-nums">
                          {formatMoney(session.total_tips_collected)}
                        </p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[0.8125rem] text-muted-foreground">Distributed</p>
                        <p className="mt-0.5 text-sm font-medium tabular-nums">
                          {formatMoney(session.total_distributed)}
                        </p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[0.8125rem] text-muted-foreground">Pooled</p>
                        <p className="mt-0.5 text-sm font-medium tabular-nums">
                          {formatMoney(session.total_tips_pooled)}
                        </p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[0.8125rem] text-muted-foreground">Variance</p>
                        <p
                          className={cn(
                            "mt-0.5 text-sm font-medium tabular-nums",
                            Math.abs(variance) > 0.01
                              ? "text-foreground"
                              : "text-muted-foreground"
                          )}
                        >
                          {formatMoney(variance)}
                        </p>
                      </div>
                    </div>

                    <p className="mt-5 truncate text-xs text-muted-foreground">
                      {poolSummary}
                    </p>

                    <div className="mt-4 flex items-center justify-end pt-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 shrink-0 rounded-full px-3 text-[0.8125rem] font-medium"
                        onClick={() => router.push(`/dashboard/tips/${session.id}`)}
                      >
                        Review
                        <ChevronRight className="ml-1 h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
        </TooltipProvider>
      )}
    </div>
  );
}
