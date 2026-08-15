"use client";

import { LocationRanking } from "@/app/dashboard/actions/location-analytics";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ReportPanel as Card, ReportPanelContent as CardContent, ReportPanelHeader as CardHeader, ReportPanelTitle as CardTitle } from "@/components/dashboard/reports/ReportPanel";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useLocationStore } from "@/stores/location-store";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  ExternalLink,
  Minus,
  Trophy,
} from "lucide-react";
import { useRouter } from "next/navigation";

interface LocationLeaderboardProps {
  rankings: LocationRanking[];
  isLoading: boolean;
}

export function LocationLeaderboard({
  rankings,
  isLoading,
}: LocationLeaderboardProps) {
  const router = useRouter();
  const { setSelectedLocation } = useLocationStore();

  const handleDrillDown = (locationId: string) => {
    setSelectedLocation(locationId);
    router.push("/dashboard");
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatPercent = (val: number) => {
    const sign = val > 0 ? "+" : "";
    return `${sign}${val.toFixed(1)}%`;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <CardTitle className="text-base font-semibold">
          Location Rankings by Gross Sales
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {/* Staff-table treatment: tinted rounded container, tinted header band,
            borderless rows. See components/dashboard/staff/StaffDataTable.tsx. */}
        <Table variant="data" className="min-w-[500px]">
          <TableHeader className="[&_tr]:border-0">
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[80px] text-[0.8125rem] font-normal text-muted-foreground">
                Rank
              </TableHead>
              <TableHead className="text-[0.8125rem] font-normal text-muted-foreground">
                Location
              </TableHead>
              <TableHead className="text-right text-[0.8125rem] font-normal text-muted-foreground">
                Gross Sales
              </TableHead>
              <TableHead className="text-right text-[0.8125rem] font-normal text-muted-foreground">
                Vs Avg
              </TableHead>
              <TableHead className="text-right text-[0.8125rem] font-normal text-muted-foreground">
                Trend
              </TableHead>
              <TableHead className="w-[100px] text-right text-[0.8125rem] font-normal text-muted-foreground">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rankings.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-24 text-center text-muted-foreground"
                >
                  No ranking data available
                </TableCell>
              </TableRow>
            ) : (
              rankings.map((location) => (
                <TableRow
                  key={location.location_id}
                  className="group border-0 bg-card/70 transition-colors hover:bg-muted/40"
                >
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <span className={cn("text-sm text-muted-foreground", location.rank === 1 && "font-bold text-foreground")}>
                        #{location.rank}
                      </span>
                      {location.rank === 1 && (
                        <Trophy className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {location.location_name}
                      </span>
                      {location.rank === 1 && (
                        <span className="text-[10px] text-muted-foreground">
                          Top performer
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-bold tabular-nums">
                    {formatCurrency(location.metric_value)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge
                      variant="secondary"
                      className="bg-muted/60 font-mono text-[10px] text-muted-foreground tabular-nums hover:bg-muted"
                    >
                      {formatPercent(location.metric_vs_avg_pct)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div
                      className="flex items-center justify-end gap-1 text-xs font-medium text-muted-foreground tabular-nums"
                    >
                      {location.trend_pct > 0 ? (
                        <ArrowUpRight className="h-3 w-3" />
                      ) : location.trend_pct < 0 ? (
                        <ArrowDownRight className="h-3 w-3" />
                      ) : (
                        <Minus className="h-3 w-3" />
                      )}
                      {Math.abs(location.trend_pct).toFixed(1)}%
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => handleDrillDown(location.location_id)}
                    >
                      View
                      <ExternalLink className="ml-2 h-3 w-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
