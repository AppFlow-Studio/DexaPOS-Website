"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Clock3,
  Loader2,
  Repeat2,
  ScanLine,
} from "lucide-react";
import {
  Panel,
  PanelSection,
  StatRow,
  StatTile,
} from "@/components/dashboard/shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getQrAnalyticsSnapshot, type QrAnalyticsSnapshot } from "../actions";
import { cn } from "@/lib/utils";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const percentFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
});

function formatCurrency(value: number) {
  return currencyFormatter.format(value || 0);
}

function formatPercent(value: number) {
  return `${percentFormatter.format(value || 0)}%`;
}

function FunnelMetric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "success" | "warning";
}) {
  // Tier-3 inset wells (§3.1), not bordered boxes: six of these sat inside a
  // bordered card inside a panel, which read as three nested frames.
  const toneClasses =
    tone === "success"
      ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-900/20 dark:text-emerald-200"
      : tone === "warning"
        ? "bg-amber-50 text-amber-900 dark:bg-amber-900/20 dark:text-amber-200"
        : "bg-muted/60 text-foreground";

  return (
    <div
      className={cn(
        "min-w-0 rounded-2xl border-0 px-3 py-3 shadow-none",
        toneClasses
      )}
    >
      {/* `tracking-[0.12em]` on an uppercase label is what pushed "CHECKOUT"
          and "ABANDONED" past their grid track. The letter-spacing is dropped
          and the label is allowed to wrap. */}
      <p className="min-w-0 break-words text-[11px] font-medium uppercase leading-tight text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export function QrAnalyticsPanel({
  locationId,
  qrEnabled,
}: {
  locationId: string;
  qrEnabled: boolean;
}) {
  const [rangeDays, setRangeDays] = useState<7 | 30>(30);

  const { data, isLoading, isFetching } = useQuery<QrAnalyticsSnapshot>({
    queryKey: ["merchant-qr-analytics", locationId, rangeDays],
    queryFn: () => getQrAnalyticsSnapshot(locationId, rangeDays),
    enabled: Boolean(locationId),
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const peakHour = useMemo(() => {
    const byHour = data?.byHour ?? [];
    return byHour.reduce(
      (best, current) => (current.scans > best.scans ? current : best),
      byHour[0] ?? { hour: 0, label: "12AM", scans: 0, paid: 0 }
    );
  }, [data?.byHour]);

  const hasAnyFunnelActivity = useMemo(() => {
    const stages = data?.stages;
    if (!stages) return false;
    return Object.values(stages).some((value) => value > 0);
  }, [data?.stages]);

  const hasHourlyActivity = useMemo(() => {
    return (data?.byHour ?? []).some(
      (entry) => entry.scans > 0 || entry.paid > 0
    );
  }, [data?.byHour]);

  const hourlyMax = useMemo(() => {
    return Math.max(
      1,
      ...(data?.byHour ?? []).map((entry) => Math.max(entry.scans, entry.paid))
    );
  }, [data?.byHour]);

  return (
    <Panel>
      <PanelSection
        icon={BarChart3}
        label="QR analytics"
        caption={`Merchant-level QR funnel and table-order performance for the last ${rangeDays} days.`}
        action={
          <div className="flex items-center gap-2" aria-label="QR analytics range">
            {[7, 30].map((days) => (
              <Button
                key={days}
                type="button"
                size="sm"
                variant={rangeDays === days ? "default" : "outline"}
                onClick={() => setRangeDays(days as 7 | 30)}
                className={
                  rangeDays === days
                    ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
                    : ""
                }
              >
                Last {days}d
              </Button>
            ))}
          </div>
        }
      >
        <div className="space-y-6">
        {!qrEnabled ? (
          <div className="border-l-2 border-border bg-muted px-4 py-3 text-sm text-foreground">
            QR analytics can still show historical activity, but new scans stay
            off until QR Table Ordering is enabled for this branch.
          </div>
        ) : null}
        {isLoading ? (
          <div
            className="flex items-center gap-2 text-sm text-muted-foreground"
            role="status"
            aria-live="polite"
          >
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading QR analytics...
          </div>
        ) : data?.error ? (
          <div className="rounded-2xl border-0 bg-destructive/10 px-4 py-3 text-sm text-destructive shadow-none">
            {data.error}
          </div>
        ) : (
          <>
            {/* Five bordered boxes → one hairline-separated StatRow (DS-CTL-07).
                Each box previously drew its own frame inside the panel's frame. */}
            {/* 3-up, not 5-up: `StatTile` truncates its label and meta, and at
                five columns "Funnel conversion" and the meta lines were cut
                off. Three columns give each tile ~290px, enough for the
                longest label here. */}
            <StatRow columns={3}>
              <StatTile
                label="QR scans"
                icon={<ScanLine />}
                value={data?.stages.scanned ?? 0}
                meta={`${data?.qrOrderCount ?? 0} paid orders from scanned tables`}
              />
              <StatTile
                label="QR revenue"
                icon={<Activity />}
                value={formatCurrency(data?.qrRevenue ?? 0)}
                meta={`QR AOV ${formatCurrency(data?.qrAov ?? 0)}`}
              />
              <StatTile
                label="Funnel conversion"
                icon={<ArrowRight />}
                value={formatPercent(data?.conversionRate ?? 0)}
                meta="Paid versus scanned"
              />
              <StatTile
                label="Abandonment"
                icon={<AlertTriangle />}
                value={formatPercent(data?.abandonmentRate ?? 0)}
                meta={`${data?.stages.abandoned ?? 0} expired QR sessions`}
              />
              <StatTile
                label="Repeat guests"
                icon={<Repeat2 />}
                value={formatPercent(data?.repeatPhoneRate ?? 0)}
                meta="Based on reused guest phone numbers"
              />
            </StatRow>

            {!hasAnyFunnelActivity ? (
              <div className="rounded-2xl border-0 bg-muted/60 px-4 py-5 text-sm text-muted-foreground shadow-none">
                No QR scans were recorded in this window yet. Generate a code,
                open a guest preview, and complete one table checkout to populate
                the funnel, top tables, and top items.
              </div>
            ) : null}

            {hasAnyFunnelActivity && (data?.stages.paid ?? 0) === 0 ? (
              <div className="rounded-2xl border-0 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-none dark:bg-amber-900/20 dark:text-amber-200">
                QR traffic is being recorded, but no paid QR orders landed in
                this window yet.
              </div>
            ) : null}

            <div className="grid min-w-0 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
              {/* Borderless: these were bordered cards sitting directly on the
                  panel surface, so the panel edge and the card edge doubled up. */}
              <div className="min-w-0 space-y-4">
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold">QR funnel</h3>
                    <p className="text-sm text-muted-foreground">
                      The scan-to-paid path for table ordering.
                    </p>
                  </div>
                  {isFetching ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                  ) : null}
                </div>
                {/* `xl:grid-cols-6` forced six tracks into the narrow `1.2fr`
                    column and clipped the last two stages. `auto-fit` lets the
                    stages reflow to whatever the column can actually hold. */}
                <div className="grid min-w-0 gap-3 [grid-template-columns:repeat(auto-fit,minmax(5.5rem,1fr))]">
                  <FunnelMetric label="Scanned" value={data?.stages.scanned ?? 0} />
                  <FunnelMetric
                    label="Menu"
                    value={data?.stages.menuViewed ?? 0}
                  />
                  <FunnelMetric
                    label="Cart"
                    value={data?.stages.cartStarted ?? 0}
                  />
                  <FunnelMetric
                    label="Checkout"
                    value={data?.stages.checkout ?? 0}
                  />
                  <FunnelMetric
                    label="Paid"
                    value={data?.stages.paid ?? 0}
                    tone="success"
                  />
                  <FunnelMetric
                    label="Abandoned"
                    value={data?.stages.abandoned ?? 0}
                    tone="warning"
                  />
                </div>
              </div>

              <div className="min-w-0 space-y-4">
                <div className="min-w-0">
                  <h3 className="font-semibold">AOV comparison</h3>
                  <p className="text-sm text-muted-foreground">
                    Compare QR table orders against server-led dine-in tickets.
                  </p>
                </div>
                <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                  <div className="min-w-0 rounded-2xl border-0 bg-muted/60 px-4 py-4 shadow-none">
                    <p className="min-w-0 break-words text-[11px] font-medium uppercase leading-tight text-muted-foreground">
                      QR table AOV
                    </p>
                    <p className="mt-2 text-2xl font-semibold tabular-nums">
                      {formatCurrency(data?.qrAov ?? 0)}
                    </p>
                  </div>
                  <div className="min-w-0 rounded-2xl border-0 bg-muted/60 px-4 py-4 shadow-none">
                    <p className="min-w-0 break-words text-[11px] font-medium uppercase leading-tight text-muted-foreground">
                      Server dine-in AOV
                    </p>
                    <p className="mt-2 text-2xl font-semibold tabular-nums">
                      {formatCurrency(data?.serverAov ?? 0)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid min-w-0 gap-6 xl:grid-cols-[1fr_1fr]">
              <div className="min-w-0 space-y-4">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold">Peak scan hours</h3>
                    <p className="text-sm text-muted-foreground">
                      Use this to see when QR traffic spikes.
                    </p>
                  </div>
                  <Badge variant="outline" className="shrink-0 gap-1">
                    <Clock3 className="h-3 w-3" />
                    {hasHourlyActivity ? `Peak ${peakHour.label}` : "No scan data yet"}
                  </Badge>
                </div>
                {/* 24 hourly rows × two bars each is the single tallest block on
                    the tab. Capped with its own scroller so the section keeps a
                    readable height instead of running the page. */}
                <div className="thin-scrollbar max-h-96 space-y-3 overflow-y-auto pr-1">
                  {(data?.byHour ?? []).map((entry) => (
                    <div key={entry.hour} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{entry.label}</span>
                        <span>
                          {entry.scans} scans - {entry.paid} paid
                        </span>
                      </div>
                      <div className="grid gap-1">
                        <div className="h-2 rounded-full bg-muted">
                          <div
                            className="h-2 rounded-full bg-[#0C4FD1]"
                            style={{ width: `${(entry.scans / hourlyMax) * 100}%` }}
                          />
                        </div>
                        <div className="h-2 rounded-full bg-muted">
                          <div
                            className="h-2 rounded-full bg-emerald-500"
                            style={{ width: `${(entry.paid / hourlyMax) * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="min-w-0 space-y-6">
                <div className="min-w-0 space-y-4">
                  <div className="min-w-0">
                    <h3 className="font-semibold">Top tables</h3>
                    <p className="text-sm text-muted-foreground">
                      Tables with the most QR activity in this window.
                    </p>
                  </div>
                  {/* Hairline-divided rows, not one bordered box per row (§5). */}
                  <div className="min-w-0 divide-y divide-border/60">
                    {(data?.topTables.length ?? 0) === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No QR table activity yet.
                      </p>
                    ) : (
                      data?.topTables.map((table) => (
                        <div
                          key={table.tableLabel}
                          className="flex min-w-0 items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium">{table.tableLabel}</p>
                            <p className="text-xs text-muted-foreground tabular-nums">
                              {table.scans} scans - {table.paidOrders} paid orders
                            </p>
                          </div>
                          <p className="shrink-0 font-semibold tabular-nums">
                            {formatCurrency(table.revenue)}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="min-w-0 space-y-4">
                  <div className="min-w-0">
                    <h3 className="font-semibold">Top QR items</h3>
                    <p className="text-sm text-muted-foreground">
                      Best-selling items from QR table orders only.
                    </p>
                  </div>
                  <div className="min-w-0 divide-y divide-border/60">
                    {(data?.topItems.length ?? 0) === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No QR item sales yet.
                      </p>
                    ) : (
                      data?.topItems.map((item) => (
                        <div
                          key={item.itemName}
                          className="flex min-w-0 items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium">{item.itemName}</p>
                            <p className="text-xs text-muted-foreground tabular-nums">
                              {item.quantity} sold
                            </p>
                          </div>
                          <p className="shrink-0 font-semibold tabular-nums">
                            {formatCurrency(item.revenue)}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
        </div>
      </PanelSection>
    </Panel>
  );
}
