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
            <StatRow columns={4}>
              <StatTile label="Total Collected" value={formatMoney(preview?.total_collected ?? 0)} />
              <StatTile label="Pooled" value={formatMoney(preview?.total_tips_pooled ?? 0)} />
              <StatTile label="Tip-Outs" value={formatMoney(preview?.total_tip_outs ?? 0)} />
              <StatTile label="Total Distributed" value={formatMoney(preview?.total_distributed ?? 0)} />
            </StatRow>

            <div className="-mx-2 overflow-x-auto border-t border-border/60 px-2 pt-2">
              <Table className="min-w-max">
                <TableHeader>
                  <TableRow className="border-b border-border/60 hover:bg-transparent">
                    <TableHead className="h-auto py-2.5 text-[0.8125rem] font-normal text-muted-foreground">Employee</TableHead>
                    <TableHead className="h-auto py-2.5 text-[0.8125rem] font-normal text-muted-foreground">Role</TableHead>
                    <TableHead className="h-auto py-2.5 text-right text-[0.8125rem] font-normal text-muted-foreground">Hours</TableHead>
                    <TableHead className="h-auto py-2.5 text-right text-[0.8125rem] font-normal text-muted-foreground">Own Tips</TableHead>
                    <TableHead className="h-auto py-2.5 text-right text-[0.8125rem] font-normal text-muted-foreground">Pool In</TableHead>
                    <TableHead className="h-auto py-2.5 text-right text-[0.8125rem] font-normal text-muted-foreground">Pool Out</TableHead>
                    <TableHead className="h-auto py-2.5 text-right text-[0.8125rem] font-normal text-muted-foreground">T-Out In</TableHead>
                    <TableHead className="h-auto py-2.5 text-right text-[0.8125rem] font-normal text-muted-foreground">T-Out Out</TableHead>
                    <TableHead className="h-auto py-2.5 text-right text-[0.8125rem] font-normal text-foreground">Net Tips</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {details.map((d, i) => (
                    <TableRow key={i} className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50">
                      <TableCell className="py-3 text-sm font-medium">{d.staff_name}</TableCell>
                      <TableCell className="py-3 text-sm">
                        <span className="inline-flex shrink-0 items-center rounded-full bg-muted/60 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                          {d.role_code}
                        </span>
                      </TableCell>
                      <TableCell className="py-3 text-right text-sm tabular-nums">{d.hours_worked.toFixed(1)}</TableCell>
                      <TableCell className="py-3 text-right text-sm tabular-nums">{formatMoney(d.individual_tips_earned)}</TableCell>
                      <TableCell className="py-3 text-right text-sm tabular-nums text-emerald-700 dark:text-emerald-400">
                        {d.tip_pool_received > 0 ? `+${formatMoney(d.tip_pool_received)}` : "—"}
                      </TableCell>
                      <TableCell className="py-3 text-right text-sm tabular-nums text-rose-700 dark:text-rose-400">
                        {d.tip_pool_contributed > 0 ? `−${formatMoney(d.tip_pool_contributed)}` : "—"}
                      </TableCell>
                      <TableCell className="py-3 text-right text-sm tabular-nums text-emerald-700 dark:text-emerald-400">
                        {d.tip_out_received > 0 ? `+${formatMoney(d.tip_out_received)}` : "—"}
                      </TableCell>
                      <TableCell className="py-3 text-right text-sm tabular-nums text-rose-700 dark:text-rose-400">
                        {d.tip_out_given > 0 ? `−${formatMoney(d.tip_out_given)}` : "—"}
                      </TableCell>
                      <TableCell className="py-3 text-right text-sm font-semibold tabular-nums">
                        {formatMoney(d.net_tips)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </PanelSection>
    </Panel>
  );
}
