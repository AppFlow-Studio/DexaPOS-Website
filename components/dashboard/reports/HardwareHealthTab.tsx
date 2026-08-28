"use client";

// ============================================================================
// Cash Drawer → Hardware Health tab
// ============================================================================
// The physical-hardware companion to the money-focused Cash Drawer reports.
// Shows, per drawer: the bound printer + its connectivity, recent kick outcomes
// (confirmed / unconfirmed / failed), the durable kick-event log, and a
// movement↔kick correlation that flags "No Sale recorded but the drawer never
// confirmed open". Read-only — the drawer↔printer binding is set on the POS
// tablet's Test Pop screen.
// ============================================================================

import React, { useMemo, useState } from "react";
import { format } from "date-fns";
import Papa from "papaparse";
import {
  Zap,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Download,
  ChevronLeft,
  ChevronRight,
  Printer,
  Link2Off,
  InboxIcon,
} from "lucide-react";

import { Panel, StatRow, StatTile } from "@/components/dashboard/shell";
import {
  ReportPanel as Card,
  ReportPanelContent as CardContent,
  ReportPanelHeader as CardHeader,
  ReportPanelTitle as CardTitle,
} from "@/components/dashboard/reports/ReportPanel";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MobileColumnsButton,
  initialHiddenColumns,
  type ReportColumn,
} from "@/components/dashboard/reports/MobileColumnsButton";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  useCashDrawerHardwareStatus,
  useCashDrawerKickEvents,
  useKickHealthSummary,
  useMovementKickCorrelation,
} from "@/app/dashboard/hooks/useCashDrawerHardware";
import type { KickOutcome } from "@/app/dashboard/actions/cash-drawer-hardware";

const ITEMS_PER_PAGE = 15;

// ─── Shared bits ────────────────────────────────────────────────────────────

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 py-10 text-center">
      <InboxIcon className="h-8 w-8 text-muted-foreground/40" />
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

const OUTCOME_META: Record<
  KickOutcome,
  { label: string; cls: string; Icon: typeof CheckCircle2 }
> = {
  ok: {
    label: "Confirmed",
    cls: "border-emerald-200 bg-emerald-50 text-emerald-700",
    Icon: CheckCircle2,
  },
  unconfirmed: {
    label: "Unconfirmed",
    cls: "border-amber-200 bg-amber-50 text-amber-700",
    Icon: AlertTriangle,
  },
  failed: {
    label: "Failed",
    cls: "border-red-200 bg-red-50 text-red-700",
    Icon: AlertOctagon,
  },
};

function OutcomeBadge({ outcome }: { outcome: KickOutcome }) {
  const m = OUTCOME_META[outcome];
  const { Icon } = m;
  return (
    <Badge variant="outline" className={`gap-1 font-medium ${m.cls}`}>
      <Icon className="h-3 w-3" />
      {m.label}
    </Badge>
  );
}

function ConnectivityDot({ connected }: { connected: boolean | null }) {
  const color =
    connected === true ? "bg-emerald-500" : connected === false ? "bg-red-500" : "bg-muted-foreground/40";
  const label = connected === true ? "Connected" : connected === false ? "Offline" : "Unknown";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}

function confirmLabel(v: boolean | null): string {
  return v === true ? "Opened" : v === false ? "Did not open" : "Unknown";
}

/** Short "vs prev period" meta, colored by whether the movement is good. */
function DeltaMeta({
  current,
  prev,
  inverse = false,
}: {
  current: number;
  prev: number;
  inverse?: boolean;
}) {
  if (prev === 0 && current === 0)
    return <span className="text-xs text-muted-foreground">No prior data</span>;
  const diff = current - prev;
  if (Math.abs(diff) < 0.0001)
    return <span className="text-xs text-muted-foreground">No change vs prev</span>;
  const up = diff > 0;
  const good = inverse ? !up : up;
  return (
    <span
      className={`text-xs font-medium ${good ? "text-emerald-600" : "text-red-600"}`}
      title="Compared to the previous period of equal length"
    >
      {up ? "▲" : "▼"} vs prev period
    </span>
  );
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

// ─── Column meta ────────────────────────────────────────────────────────────

const KICK_COLUMNS: ReportColumn[] = [
  { id: "time", label: "Time", locked: true },
  { id: "drawer", label: "Drawer" },
  { id: "printer", label: "Printer", defaultHidden: true },
  { id: "outcome", label: "Outcome", locked: true },
  { id: "confirmed", label: "Opened?" },
  { id: "source", label: "Trigger", defaultHidden: true },
  { id: "error", label: "Error", defaultHidden: true },
];

// ─── Per-drawer status panel ─────────────────────────────────────────────────

function DrawerStatusPanel({ dateFrom, dateTo }: { dateFrom: Date; dateTo: Date }) {
  const { data: statuses = [], isLoading } = useCashDrawerHardwareStatus();

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">Drawer → Printer Status</CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">
          What each drawer is wired to, live connectivity, and its last kick (last 30 days of kicks).
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-lg" />
            ))}
          </div>
        ) : statuses.length === 0 ? (
          <EmptyState title="No active cash drawers" description="Add a drawer under Cash Drawers to see hardware status" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {statuses.map((s) => (
              <div key={s.cash_drawer_id} className="rounded-lg border bg-card p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{s.drawer_name}</p>
                    {s.host_printer_id ? (
                      <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                        <Printer className="h-3 w-3 shrink-0" />
                        {s.printer_name ?? "Bound printer"}
                        {s.printer_model ? ` · ${s.printer_model}` : ""}
                      </p>
                    ) : (
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-amber-600">
                        <Link2Off className="h-3 w-3 shrink-0" />
                        No printer bound — set on the POS Test Pop screen
                      </p>
                    )}
                  </div>
                  {s.last_kick_outcome ? (
                    <OutcomeBadge outcome={s.last_kick_outcome} />
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      No kicks
                    </Badge>
                  )}
                </div>

                <div className="mt-2 flex items-center justify-between gap-2">
                  {s.host_printer_id ? (
                    <ConnectivityDot connected={s.printer_connected} />
                  ) : (
                    <span className="text-xs text-muted-foreground/60">—</span>
                  )}
                  <div className="flex items-center gap-2 text-xs tabular-nums text-muted-foreground">
                    <span className="text-emerald-600">{s.okCount} ok</span>
                    <span className="text-amber-600">{s.unconfirmedCount} unconf</span>
                    <span className="text-red-600">{s.failedCount} fail</span>
                  </div>
                </div>

                {s.last_kick_at && (
                  <p className="mt-1.5 text-[11px] text-muted-foreground/70">
                    Last kick {format(new Date(s.last_kick_at), "MMM d, h:mm a")}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Kick-event log table ─────────────────────────────────────────────────────

function KickEventsTable({ dateFrom, dateTo }: { dateFrom: Date; dateTo: Date }) {
  const { data: statuses = [] } = useCashDrawerHardwareStatus();
  const [drawerFilter, setDrawerFilter] = useState<string>("all");
  const [outcomeFilter, setOutcomeFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [hiddenCols, setHiddenCols] = useState(() => initialHiddenColumns(KICK_COLUMNS));
  const isMobile = useIsMobile();

  const { data: events = [], isLoading } = useCashDrawerKickEvents(dateFrom, dateTo, {
    drawerId: drawerFilter === "all" ? null : drawerFilter,
    outcome: outcomeFilter === "all" ? null : (outcomeFilter as KickOutcome),
  });

  const isColVisible = (id: string) => !isMobile || !hiddenCols.has(id);
  const visibleCols = KICK_COLUMNS.filter((c) => isColVisible(c.id));

  // Reset to the first page when filters change — React's adjust-state-during-
  // render pattern, preferred over a setState-in-effect.
  const filterSig = `${drawerFilter}|${outcomeFilter}`;
  const [prevFilterSig, setPrevFilterSig] = useState(filterSig);
  if (prevFilterSig !== filterSig) {
    setPrevFilterSig(filterSig);
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(events.length / ITEMS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const paginated = useMemo(
    () => events.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE),
    [events, safePage]
  );

  function exportCSV() {
    const rows = events.map((e) => ({
      Time: format(new Date(e.kicked_at), "MMM d, yyyy h:mm:ss a"),
      Drawer: e.drawer_name ?? "",
      Printer: e.printer_name ?? "",
      Outcome: e.outcome,
      "Drawer Opened": confirmLabel(e.drawer_confirmed),
      "Command Acked": e.command_acked === null ? "" : e.command_acked ? "yes" : "no",
      Trigger: e.source ?? "",
      Error: e.error_message ?? "",
    }));
    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cash-drawer-kicks-${format(dateFrom, "yyyy-MM-dd")}-${format(dateTo, "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const skeletonRows = Array.from({ length: 5 });

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={drawerFilter} onValueChange={setDrawerFilter}>
            <SelectTrigger className="h-8 w-[180px] text-xs">
              <SelectValue placeholder="All drawers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All drawers</SelectItem>
              {statuses.map((s) => (
                <SelectItem key={s.cash_drawer_id} value={s.cash_drawer_id}>
                  {s.drawer_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={outcomeFilter} onValueChange={setOutcomeFilter}>
            <SelectTrigger className="h-8 w-[150px] text-xs">
              <SelectValue placeholder="All outcomes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All outcomes</SelectItem>
              <SelectItem value="ok">Confirmed</SelectItem>
              <SelectItem value="unconfirmed">Unconfirmed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <MobileColumnsButton columns={KICK_COLUMNS} hidden={hiddenCols} onChange={setHiddenCols} />
          <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5" disabled={events.length === 0}>
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="-mx-2 overflow-x-auto px-2">
        <Table variant="data">
          <TableHeader className="[&_tr]:border-0">
            <TableRow className="bg-muted/50">
              {isColVisible("time") && <TableHead className="whitespace-nowrap">Time</TableHead>}
              {isColVisible("drawer") && <TableHead>Drawer</TableHead>}
              {isColVisible("printer") && <TableHead>Printer</TableHead>}
              {isColVisible("outcome") && <TableHead>Outcome</TableHead>}
              {isColVisible("confirmed") && <TableHead>Opened?</TableHead>}
              {isColVisible("source") && <TableHead>Trigger</TableHead>}
              {isColVisible("error") && <TableHead>Error</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              skeletonRows.map((_, i) => (
                <TableRow key={i}>
                  {visibleCols.map((c) => (
                    <TableCell key={c.id}>
                      <Skeleton className={c.id === "outcome" ? "h-5 w-24 rounded-full" : "h-4 w-20"} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : paginated.length === 0 ? (
              <TableRow>
                <TableCell colSpan={visibleCols.length} className="p-0">
                  <EmptyState title="No kick events" description="No cash-drawer kicks in this period. Try widening the date range." />
                </TableCell>
              </TableRow>
            ) : (
              paginated.map((e) => (
                <TableRow key={e.id} className="hover:bg-muted/40">
                  {isColVisible("time") && (
                    <TableCell className="whitespace-nowrap font-medium">
                      {format(new Date(e.kicked_at), "MMM d, h:mm:ss a")}
                    </TableCell>
                  )}
                  {isColVisible("drawer") && <TableCell>{e.drawer_name ?? "—"}</TableCell>}
                  {isColVisible("printer") && (
                    <TableCell className="text-muted-foreground">{e.printer_name ?? "—"}</TableCell>
                  )}
                  {isColVisible("outcome") && (
                    <TableCell>
                      <OutcomeBadge outcome={e.outcome} />
                    </TableCell>
                  )}
                  {isColVisible("confirmed") && (
                    <TableCell className="text-xs text-muted-foreground">
                      {confirmLabel(e.drawer_confirmed)}
                    </TableCell>
                  )}
                  {isColVisible("source") && (
                    <TableCell className="text-xs text-muted-foreground">{e.source ?? "—"}</TableCell>
                  )}
                  {isColVisible("error") && (
                    <TableCell className="max-w-[220px] truncate text-xs text-red-600" title={e.error_message ?? ""}>
                      {e.error_message ?? ""}
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Footer */}
      {!isLoading && events.length > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {events.length} kick{events.length !== 1 ? "s" : ""}
          </span>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="h-7 w-7" disabled={safePage === 1} onClick={() => setPage(safePage - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs">
                Page {safePage} of {totalPages}
              </span>
              <Button variant="outline" size="icon" className="h-7 w-7" disabled={safePage === totalPages} onClick={() => setPage(safePage + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Movement ↔ kick correlation ──────────────────────────────────────────────

function MovementCorrelation({ dateFrom, dateTo }: { dateFrom: Date; dateTo: Date }) {
  const { data: rows = [], isLoading } = useMovementKickCorrelation(dateFrom, dateTo);

  const problems = rows.filter((r) => r.kick_outcome !== "ok").length;

  function exportCSV() {
    const out = rows.map((r) => ({
      Time: format(new Date(r.performed_at), "MMM d, yyyy h:mm:ss a"),
      Type: r.operation_type,
      Drawer: r.drawer_name,
      By: r.performed_by_name,
      Amount: r.amount.toFixed(2),
      "Kick Outcome": r.kick_outcome ?? "no kick recorded",
      "Δ seconds": r.kick_delta_seconds ?? "",
    }));
    const csv = Papa.unparse(out);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cash-movement-kick-correlation-${format(dateFrom, "yyyy-MM-dd")}-${format(dateTo, "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base font-semibold">Movements vs Drawer Kicks</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Each No Sale / Pay In / Pay Out beside the nearest drawer kick. Rows where the drawer
              did not confirm open are highlighted — the No-Sale-but-nothing-opened case.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5" disabled={rows.length === 0}>
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </Button>
        </div>
        {!isLoading && problems > 0 && (
          <p className="mt-1 flex items-center gap-1 text-xs text-amber-600">
            <AlertTriangle className="h-3 w-3" />
            {problems} movement{problems !== 1 ? "s" : ""} without a confirmed drawer open
          </p>
        )}
      </CardHeader>
      <CardContent>
        <div className="-mx-2 overflow-x-auto px-2">
          <Table variant="data">
            <TableHeader className="[&_tr]:border-0">
              <TableRow className="bg-muted/50">
                <TableHead className="whitespace-nowrap">Time</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Drawer</TableHead>
                <TableHead>By</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Drawer Kick</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((__, j) => (
                      <TableCell key={j}>
                        <Skeleton className={j === 5 ? "h-5 w-24 rounded-full" : "h-4 w-16"} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="p-0">
                    <EmptyState title="No movements" description="No No Sale / Pay In / Pay Out operations in this period" />
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => {
                  const problem = r.kick_outcome !== "ok";
                  return (
                    <TableRow key={r.operation_id} className={problem ? "bg-amber-50/50 hover:bg-amber-50" : "hover:bg-muted/40"}>
                      <TableCell className="whitespace-nowrap font-medium">
                        {format(new Date(r.performed_at), "MMM d, h:mm:ss a")}
                      </TableCell>
                      <TableCell className="capitalize">{r.operation_type.replace("_", " ")}</TableCell>
                      <TableCell>{r.drawer_name}</TableCell>
                      <TableCell className="text-muted-foreground">{r.performed_by_name}</TableCell>
                      <TableCell className="text-right tabular-nums">${r.amount.toFixed(2)}</TableCell>
                      <TableCell>
                        {r.kick_outcome ? (
                          <span className="inline-flex items-center gap-2">
                            <OutcomeBadge outcome={r.kick_outcome} />
                            {r.kick_delta_seconds != null && (
                              <span className="text-[11px] text-muted-foreground/70">±{r.kick_delta_seconds}s</span>
                            )}
                          </span>
                        ) : (
                          <span className="text-xs italic text-muted-foreground/70">No kick recorded</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Tab ──────────────────────────────────────────────────────────────────────

export function HardwareHealthTab({ dateFrom, dateTo }: { dateFrom: Date; dateTo: Date }) {
  const { data: summary, isLoading } = useKickHealthSummary(dateFrom, dateTo);

  const tiles = [
    {
      label: "Kick attempts",
      value: summary?.totalKicks ?? 0,
      meta: <DeltaMeta current={summary?.totalKicks ?? 0} prev={summary?.prevTotalKicks ?? 0} />,
      icon: <Zap className="h-4 w-4" />,
    },
    {
      label: "Confirmed rate",
      value: pct(summary?.confirmedRate ?? 0),
      meta: <DeltaMeta current={summary?.confirmedRate ?? 0} prev={summary?.prevConfirmedRate ?? 0} />,
      icon: <CheckCircle2 className="h-4 w-4" />,
      valueClass: "text-emerald-600",
    },
    {
      label: "Unconfirmed",
      value: summary?.unconfirmedCount ?? 0,
      meta: <DeltaMeta current={summary?.unconfirmedCount ?? 0} prev={summary?.prevUnconfirmedCount ?? 0} inverse />,
      icon: <AlertTriangle className="h-4 w-4" />,
      valueClass: "text-amber-600",
    },
    {
      label: "Failed",
      value: summary?.failedCount ?? 0,
      meta: <DeltaMeta current={summary?.failedCount ?? 0} prev={summary?.prevFailedCount ?? 0} inverse />,
      icon: <AlertOctagon className="h-4 w-4" />,
      valueClass: "text-red-600",
    },
  ];

  return (
    <div className="space-y-6">
      <Panel padded>
        <StatRow columns={4}>
          {tiles.map((t) => (
            <StatTile
              key={t.label}
              label={t.label}
              value={<span className={t.valueClass}>{t.value}</span>}
              meta={t.meta}
              icon={t.icon}
              isLoading={isLoading}
            />
          ))}
        </StatRow>
      </Panel>

      <DrawerStatusPanel dateFrom={dateFrom} dateTo={dateTo} />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Kick Event Log</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Every recorded drawer-kick attempt and whether the drawer physically opened.
          </p>
        </CardHeader>
        <CardContent>
          <KickEventsTable dateFrom={dateFrom} dateTo={dateTo} />
        </CardContent>
      </Card>

      <MovementCorrelation dateFrom={dateFrom} dateTo={dateTo} />
    </div>
  );
}

export default HardwareHealthTab;
