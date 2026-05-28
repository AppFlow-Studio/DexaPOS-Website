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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  const toneClasses =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-border bg-background text-foreground";

  return (
    <div className={cn("rounded-lg border px-3 py-3", toneClasses)}>
      <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
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
      (best, current) =>
        current.scans > best.scans ? current : best,
      byHour[0] ?? { hour: 0, label: "12AM", scans: 0, paid: 0 }
    );
  }, [data?.byHour]);

  const hourlyMax = useMemo(() => {
    return Math.max(
      1,
      ...(data?.byHour ?? []).map((entry) => Math.max(entry.scans, entry.paid))
    );
  }, [data?.byHour]);

  return (
    <Card>
      <CardHeader className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-[#0C4FD1]" />
              QR Analytics
            </CardTitle>
            <CardDescription>
              Merchant-level QR funnel and table-order performance for the last {rangeDays} days.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {[7, 30].map((days) => (
              <Button
                key={days}
                type="button"
                size="sm"
                variant={rangeDays === days ? "default" : "outline"}
                onClick={() => setRangeDays(days as 7 | 30)}
                className={rangeDays === days ? "bg-[#0C4FD1] hover:bg-[#0A43B0]" : ""}
              >
                Last {days}d
              </Button>
            ))}
          </div>
        </div>
        {!qrEnabled ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            QR analytics can still show historical activity, but new scans stay off until QR Table Ordering is enabled for this branch.
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading QR analytics…
          </div>
        ) : data?.error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {data.error}
          </div>
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-5">
              <div className="rounded-xl border bg-background p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <ScanLine className="h-4 w-4 text-[#0C4FD1]" />
                  QR scans
                </div>
                <p className="mt-3 text-3xl font-semibold">
                  {data?.stages.scanned ?? 0}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {data?.qrOrderCount ?? 0} paid orders from scanned tables
                </p>
              </div>

              <div className="rounded-xl border bg-background p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Activity className="h-4 w-4 text-emerald-600" />
                  QR revenue
                </div>
                <p className="mt-3 text-3xl font-semibold">
                  {formatCurrency(data?.qrRevenue ?? 0)}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  QR AOV {formatCurrency(data?.qrAov ?? 0)}
                </p>
              </div>

              <div className="rounded-xl border bg-background p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <ArrowRight className="h-4 w-4 text-[#0C4FD1]" />
                  Funnel conversion
                </div>
                <p className="mt-3 text-3xl font-semibold">
                  {formatPercent(data?.conversionRate ?? 0)}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Paid versus scanned
                </p>
              </div>

              <div className="rounded-xl border bg-background p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  Abandonment
                </div>
                <p className="mt-3 text-3xl font-semibold">
                  {formatPercent(data?.abandonmentRate ?? 0)}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {data?.stages.abandoned ?? 0} expired QR sessions
                </p>
              </div>

              <div className="rounded-xl border bg-background p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Repeat2 className="h-4 w-4 text-[#0C4FD1]" />
                  Repeat guests
                </div>
                <p className="mt-3 text-3xl font-semibold">
                  {formatPercent(data?.repeatPhoneRate ?? 0)}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Based on reused guest phone numbers
                </p>
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-4 rounded-xl border bg-background p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold">QR funnel</h3>
                    <p className="text-sm text-muted-foreground">
                      The scan-to-paid path for table ordering.
                    </p>
                  </div>
                  {isFetching ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : null}
                </div>
                <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                  <FunnelMetric label="Scanned" value={data?.stages.scanned ?? 0} />
                  <FunnelMetric label="Menu" value={data?.stages.menuViewed ?? 0} />
                  <FunnelMetric label="Cart" value={data?.stages.cartStarted ?? 0} />
                  <FunnelMetric label="Checkout" value={data?.stages.checkout ?? 0} />
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

              <div className="space-y-4 rounded-xl border bg-background p-4">
                <div>
                  <h3 className="font-semibold">AOV comparison</h3>
                  <p className="text-sm text-muted-foreground">
                    Compare QR table orders against server-led dine-in tickets.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                      QR table AOV
                    </p>
                    <p className="mt-2 text-2xl font-semibold">
                      {formatCurrency(data?.qrAov ?? 0)}
                    </p>
                  </div>
                  <div className="rounded-lg border px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                      Server dine-in AOV
                    </p>
                    <p className="mt-2 text-2xl font-semibold">
                      {formatCurrency(data?.serverAov ?? 0)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
              <div className="space-y-4 rounded-xl border bg-background p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold">Peak scan hours</h3>
                    <p className="text-sm text-muted-foreground">
                      Use this to see when QR traffic spikes.
                    </p>
                  </div>
                  <Badge variant="outline" className="gap-1">
                    <Clock3 className="h-3 w-3" />
                    Peak {peakHour.label}
                  </Badge>
                </div>
                <div className="space-y-3">
                  {(data?.byHour ?? []).map((entry) => (
                    <div key={entry.hour} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{entry.label}</span>
                        <span>
                          {entry.scans} scans · {entry.paid} paid
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

              <div className="space-y-6">
                <div className="space-y-4 rounded-xl border bg-background p-4">
                  <div>
                    <h3 className="font-semibold">Top tables</h3>
                    <p className="text-sm text-muted-foreground">
                      Tables with the most QR activity in this window.
                    </p>
                  </div>
                  <div className="space-y-3">
                    {(data?.topTables.length ?? 0) === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No QR table activity yet.
                      </p>
                    ) : (
                      data?.topTables.map((table) => (
                        <div
                          key={table.tableLabel}
                          className="flex items-center justify-between rounded-lg border px-3 py-3"
                        >
                          <div>
                            <p className="font-medium">{table.tableLabel}</p>
                            <p className="text-xs text-muted-foreground">
                              {table.scans} scans · {table.paidOrders} paid orders
                            </p>
                          </div>
                          <p className="font-semibold">{formatCurrency(table.revenue)}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="space-y-4 rounded-xl border bg-background p-4">
                  <div>
                    <h3 className="font-semibold">Top QR items</h3>
                    <p className="text-sm text-muted-foreground">
                      Best-selling items from QR table orders only.
                    </p>
                  </div>
                  <div className="space-y-3">
                    {(data?.topItems.length ?? 0) === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No QR item sales yet.
                      </p>
                    ) : (
                      data?.topItems.map((item) => (
                        <div
                          key={item.itemName}
                          className="flex items-center justify-between rounded-lg border px-3 py-3"
                        >
                          <div>
                            <p className="font-medium">{item.itemName}</p>
                            <p className="text-xs text-muted-foreground">
                              {item.quantity} sold
                            </p>
                          </div>
                          <p className="font-semibold">{formatCurrency(item.revenue)}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
