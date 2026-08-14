"use client";

import { RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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

  if (!locationId || locationId === "all") {
    return (
      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Projected Distribution
        </h3>
        <div className="rounded-2xl border-0 bg-muted/60 p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Select a location to see projected tip distribution.
          </p>
        </div>
      </section>
    );
  }

  if (isLoading) {
    return (
      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Projected Distribution
        </h3>
        <div className="rounded-2xl border bg-card p-4 space-y-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </section>
    );
  }

  if (isError) {
    return (
      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Projected Distribution
        </h3>
        <div className="rounded-2xl border-0 bg-muted/60 p-6 text-center">
          <p className="text-sm text-red-600 dark:text-red-400">
            {(error as Error)?.message || "Failed to load preview"}
          </p>
          <Button variant="outline" size="sm" className="mt-2" onClick={handleRefresh}>
            <RefreshCw className="mr-2 h-3 w-3" />
            Retry
          </Button>
        </div>
      </section>
    );
  }

  const details = preview?.details || [];
  const hasData = details.length > 0;
  const updatedAt = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Projected Distribution
          </h3>
          <Badge variant="secondary" className="text-xs">
            Preview
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {updatedAt && (
            <span className="text-xs text-muted-foreground">Updated {updatedAt}</span>
          )}
          <Button variant="ghost" size="sm" className="h-7" onClick={handleRefresh}>
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {!hasData ? (
        <div className="rounded-2xl border-0 bg-muted/60 p-6 text-center">
          <p className="text-sm text-muted-foreground">
            No tip data for today yet. Distribution will appear once staff clock in and tips are recorded.
          </p>
        </div>
      ) : (
        <div className="min-w-0 rounded-2xl border bg-card overflow-hidden">
          {/* Summary row */}
          <div className="grid grid-cols-4 gap-4 p-4 bg-muted/30 border-b border-border/60">
            <div>
              <p className="text-xs text-muted-foreground">Total Collected</p>
              <p className="text-sm font-semibold tabular-nums">{formatMoney(preview?.total_collected ?? 0)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pooled</p>
              <p className="text-sm font-semibold tabular-nums">{formatMoney(preview?.total_tips_pooled ?? 0)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Tip-Outs</p>
              <p className="text-sm font-semibold tabular-nums">{formatMoney(preview?.total_tip_outs ?? 0)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Distributed</p>
              <p className="text-sm font-semibold tabular-nums">{formatMoney(preview?.total_distributed ?? 0)}</p>
            </div>
          </div>

          {/* Detail table */}
          <div className="overflow-x-auto px-2">
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
                  <TableHead className="h-auto py-2.5 text-right text-[0.8125rem] font-semibold text-muted-foreground">Net Tips</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {details.map((d, i) => (
                  <TableRow key={i} className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50">
                    <TableCell className="py-3 text-sm font-medium">{d.staff_name}</TableCell>
                    <TableCell className="py-3 text-sm">
                      <Badge variant="outline" className="text-xs">
                        {d.role_code}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-3 text-right text-sm tabular-nums">{d.hours_worked.toFixed(1)}</TableCell>
                    <TableCell className="py-3 text-right text-sm tabular-nums">{formatMoney(d.individual_tips_earned)}</TableCell>
                    <TableCell className="py-3 text-right text-sm tabular-nums text-emerald-600 dark:text-emerald-400">
                      {d.tip_pool_received > 0 ? `+${formatMoney(d.tip_pool_received)}` : "-"}
                    </TableCell>
                    <TableCell className="py-3 text-right text-sm tabular-nums text-red-600 dark:text-red-400">
                      {d.tip_pool_contributed > 0 ? `-${formatMoney(d.tip_pool_contributed)}` : "-"}
                    </TableCell>
                    <TableCell className="py-3 text-right text-sm tabular-nums text-emerald-600 dark:text-emerald-400">
                      {d.tip_out_received > 0 ? `+${formatMoney(d.tip_out_received)}` : "-"}
                    </TableCell>
                    <TableCell className="py-3 text-right text-sm tabular-nums text-red-600 dark:text-red-400">
                      {d.tip_out_given > 0 ? `-${formatMoney(d.tip_out_given)}` : "-"}
                    </TableCell>
                    <TableCell className="py-3 text-right text-sm font-semibold tabular-nums">
                      {formatMoney(d.net_tips)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="px-4 py-2 bg-muted/20 border-t border-border/60">
            <p className="text-xs text-muted-foreground">
              This is a live preview. Final amounts may differ after close-out.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
