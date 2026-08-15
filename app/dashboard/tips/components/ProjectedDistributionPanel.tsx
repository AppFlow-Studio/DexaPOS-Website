"use client";

import { RefreshCw, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Panel, PanelSection, StatRow, StatTile } from "@/components/dashboard/shell";
import { formatMoney } from "../lib/constants";
import { usePreviewTipDistribution } from "../hooks/useTipDistribution";
import { useQueryClient } from "@tanstack/react-query";

/**
 * An in/out figure pair on a card. When neither side has a value the whole
 * pair collapses to one unstyled dash — a coloured "—" reads as a value that
 * failed to render rather than as "nothing moved".
 */
function FlowPair({
  label,
  inValue,
  outValue,
}: {
  label: string;
  inValue: number;
  outValue: number;
}) {
  const hasIn = inValue > 0;
  const hasOut = outValue > 0;

  return (
    <div className="min-w-0">
      <p className="text-[0.8125rem] text-muted-foreground">{label}</p>
      {!hasIn && !hasOut ? (
        <p className="mt-0.5 text-sm font-medium text-muted-foreground">—</p>
      ) : (
        <p className="mt-0.5 text-sm font-medium tabular-nums">
          {hasIn && (
            <span>
              +{formatMoney(inValue)}
            </span>
          )}
          {hasIn && hasOut && <span className="mx-1 text-muted-foreground">/</span>}
          {hasOut && (
            <span>
              −{formatMoney(outValue)}
            </span>
          )}
        </p>
      )}
    </div>
  );
}

interface ProjectedDistributionPanelProps {
  clerkOrgId: string | undefined;
  locationId: string | undefined;
  sessionDate: string;
}

export function ProjectedDistributionPanel({
  clerkOrgId,
  locationId,
  sessionDate,
}: ProjectedDistributionPanelProps) {
  const queryClient = useQueryClient();
  const { data: preview, isLoading, isError, error, dataUpdatedAt } =
    usePreviewTipDistribution(clerkOrgId, locationId, sessionDate);

  const handleRefresh = () => {
    queryClient.invalidateQueries({
      queryKey: ["preview-tip-distribution", clerkOrgId, locationId, sessionDate],
    });
  };

  const noLocation = !locationId || locationId === "all";
  const details = preview?.details || [];
  const hasData = details.length > 0;
  const updatedAt = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;

  /**
   * One heading for every state. The previous version repeated the section
   * header in four separate early returns, so each state re-declared its own
   * copy and they had already drifted apart.
   */
  const action =
    noLocation || isLoading ? undefined : (
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {updatedAt && (
          <span className="text-[0.8125rem] tabular-nums text-muted-foreground">
            Updated {updatedAt}
          </span>
        )}
        <Button
          variant="outline"
          size="sm"
          className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
          onClick={handleRefresh}
        >
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>
    );

  return (
    <Panel>
      <PanelSection
        icon={TrendingUp}
        label="Projected Distribution"
        caption="A live preview — final amounts may differ after close-out."
        action={action}
      >
        {noLocation ? (
          <div className="rounded-2xl border-0 bg-muted/60 p-10 text-center shadow-none">
            <p className="text-sm text-muted-foreground">
              Select a location to see projected tip distribution.
            </p>
          </div>
        ) : isLoading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-11 w-full rounded-2xl" />
            ))}
          </div>
        ) : isError ? (
          <div className="rounded-2xl border-0 bg-muted/60 p-10 text-center shadow-none">
            <p className="text-sm text-destructive">
              {(error as Error)?.message || "Failed to load preview"}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
              onClick={handleRefresh}
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Retry
            </Button>
          </div>
        ) : !hasData ? (
          <div className="rounded-2xl border-0 bg-muted/60 p-10 text-center shadow-none">
            <p className="font-medium text-foreground">No tip data for today yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Distribution appears once staff clock in and tips are recorded.
            </p>
          </div>
        ) : (
          <div className="min-w-0 space-y-6">
            {/* Four full-size stat tiles stack to four screenfuls on a phone,
                pushing the per-employee data below the fold. Wide screens keep
                the StatRow; phones get a compact 2×2 of the same figures. */}
            <div className="hidden sm:block">
              <StatRow columns={4}>
                <StatTile label="Total Collected" value={formatMoney(preview?.total_collected ?? 0)} />
                <StatTile label="Pooled" value={formatMoney(preview?.total_tips_pooled ?? 0)} />
                <StatTile label="Tip-Outs" value={formatMoney(preview?.total_tip_outs ?? 0)} />
                <StatTile label="Total Distributed" value={formatMoney(preview?.total_distributed ?? 0)} />
              </StatRow>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:hidden">
              {[
                { label: "Total Collected", value: preview?.total_collected ?? 0 },
                { label: "Pooled", value: preview?.total_tips_pooled ?? 0 },
                { label: "Tip-Outs", value: preview?.total_tip_outs ?? 0 },
                { label: "Total Distributed", value: preview?.total_distributed ?? 0 },
              ].map((s) => (
                <div key={s.label} className="min-w-0">
                  <p className="truncate text-[0.8125rem] text-muted-foreground">{s.label}</p>
                  <p className="mt-0.5 text-lg font-medium leading-tight tracking-[-0.02em] tabular-nums">
                    {formatMoney(s.value)}
                  </p>
                </div>
              ))}
            </div>

            {/* Wide screens get the table; phones and tablets get cards below,
                so a 9-column row never becomes a horizontal scroller. Matches
                StaffDataTable. */}
            <Table
              variant="data"
              containerClassName="hidden xl:block"
              className="min-w-[1100px]"
            >
              <TableHeader className="[&_tr]:border-0">
                <TableRow>
                  <TableHead className="text-[0.8125rem] font-normal text-muted-foreground">Employee</TableHead>
                  <TableHead className="text-[0.8125rem] font-normal text-muted-foreground">Role</TableHead>
                  <TableHead className="text-right text-[0.8125rem] font-normal text-muted-foreground">Hours</TableHead>
                  <TableHead className="text-right text-[0.8125rem] font-normal text-muted-foreground">Own Tips</TableHead>
                  <TableHead className="text-right text-[0.8125rem] font-normal text-muted-foreground">Pool In</TableHead>
                  <TableHead className="text-right text-[0.8125rem] font-normal text-muted-foreground">Pool Out</TableHead>
                  <TableHead className="text-right text-[0.8125rem] font-normal text-muted-foreground">T-Out In</TableHead>
                  <TableHead className="text-right text-[0.8125rem] font-normal text-muted-foreground">T-Out Out</TableHead>
                  <TableHead className="text-right text-[0.8125rem] font-normal text-foreground">Net Tips</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {details.map((d, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-sm font-medium">{d.staff_name}</TableCell>
                    <TableCell className="text-sm">
                      <span className="inline-flex shrink-0 items-center rounded-full bg-muted/60 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                        {d.role_code}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{d.hours_worked.toFixed(1)}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{formatMoney(d.individual_tips_earned)}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {d.tip_pool_received > 0 ? `+${formatMoney(d.tip_pool_received)}` : "—"}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {d.tip_pool_contributed > 0 ? `−${formatMoney(d.tip_pool_contributed)}` : "—"}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {d.tip_out_received > 0 ? `+${formatMoney(d.tip_out_received)}` : "—"}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {d.tip_out_given > 0 ? `−${formatMoney(d.tip_out_given)}` : "—"}
                    </TableCell>
                    <TableCell className="text-right text-sm font-semibold tabular-nums">
                      {formatMoney(d.net_tips)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Phones and tablets: cards instead of a scrolling table. */}
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:hidden">
              {details.map((d, i) => (
                <article key={i} className="min-w-0 rounded-2xl border-0 bg-muted/45 p-4">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{d.staff_name}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {d.role_code} · {d.hours_worked.toFixed(1)}h
                      </p>
                    </div>
                    <p className="shrink-0 text-[1.375rem] font-medium leading-tight tracking-[-0.02em] tabular-nums">
                      {formatMoney(d.net_tips)}
                    </p>
                  </div>

                  <div className="mt-5 grid min-w-0 grid-cols-2 gap-x-4 gap-y-5">
                    <div className="min-w-0">
                      <p className="text-[0.8125rem] text-muted-foreground">Own tips</p>
                      <p className="mt-0.5 text-sm font-medium tabular-nums">
                        {formatMoney(d.individual_tips_earned)}
                      </p>
                    </div>
                    <FlowPair
                      label="Pool in / out"
                      inValue={d.tip_pool_received}
                      outValue={d.tip_pool_contributed}
                    />
                    <FlowPair
                      label="Tip-out in / out"
                      inValue={d.tip_out_received}
                      outValue={d.tip_out_given}
                    />
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
      </PanelSection>
    </Panel>
  );
}
