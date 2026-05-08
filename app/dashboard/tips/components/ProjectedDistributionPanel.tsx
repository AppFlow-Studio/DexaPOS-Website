"use client";

import { RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
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
        <Card className="p-6 text-center border-dashed">
          <p className="text-sm text-muted-foreground">
            Select a location to see projected tip distribution.
          </p>
        </Card>
      </section>
    );
  }

  if (isLoading) {
    return (
      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Projected Distribution
        </h3>
        <Card className="p-4 space-y-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </Card>
      </section>
    );
  }

  if (isError) {
    return (
      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Projected Distribution
        </h3>
        <Card className="p-6 text-center border-dashed">
          <p className="text-sm text-red-600">
            {(error as Error)?.message || "Failed to load preview"}
          </p>
          <Button variant="outline" size="sm" className="mt-2" onClick={handleRefresh}>
            <RefreshCw className="mr-2 h-3 w-3" />
            Retry
          </Button>
        </Card>
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
        <Card className="p-6 text-center border-dashed">
          <p className="text-sm text-muted-foreground">
            No tip data for today yet. Distribution will appear once staff clock in and tips are recorded.
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {/* Summary row */}
          <div className="grid grid-cols-4 gap-4 p-4 bg-muted/30 border-b">
            <div>
              <p className="text-xs text-muted-foreground">Total Collected</p>
              <p className="text-sm font-semibold">{formatMoney(preview?.total_collected ?? 0)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pooled</p>
              <p className="text-sm font-semibold">{formatMoney(preview?.total_tips_pooled ?? 0)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Tip-Outs</p>
              <p className="text-sm font-semibold">{formatMoney(preview?.total_tip_outs ?? 0)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Distributed</p>
              <p className="text-sm font-semibold">{formatMoney(preview?.total_distributed ?? 0)}</p>
            </div>
          </div>

          {/* Detail table */}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead className="text-right">Own Tips</TableHead>
                  <TableHead className="text-right">Pool In</TableHead>
                  <TableHead className="text-right">Pool Out</TableHead>
                  <TableHead className="text-right">T-Out In</TableHead>
                  <TableHead className="text-right">T-Out Out</TableHead>
                  <TableHead className="text-right font-semibold">Net Tips</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {details.map((d, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{d.staff_name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {d.role_code}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{d.hours_worked.toFixed(1)}</TableCell>
                    <TableCell className="text-right">{formatMoney(d.individual_tips_earned)}</TableCell>
                    <TableCell className="text-right text-green-600">
                      {d.tip_pool_received > 0 ? `+${formatMoney(d.tip_pool_received)}` : "-"}
                    </TableCell>
                    <TableCell className="text-right text-red-600">
                      {d.tip_pool_contributed > 0 ? `-${formatMoney(d.tip_pool_contributed)}` : "-"}
                    </TableCell>
                    <TableCell className="text-right text-green-600">
                      {d.tip_out_received > 0 ? `+${formatMoney(d.tip_out_received)}` : "-"}
                    </TableCell>
                    <TableCell className="text-right text-red-600">
                      {d.tip_out_given > 0 ? `-${formatMoney(d.tip_out_given)}` : "-"}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatMoney(d.net_tips)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="px-4 py-2 bg-muted/20 border-t">
            <p className="text-xs text-muted-foreground">
              This is a live preview. Final amounts may differ after close-out.
            </p>
          </div>
        </Card>
      )}
    </section>
  );
}
