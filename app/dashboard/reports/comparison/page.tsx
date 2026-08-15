"use client";

import { useState, useMemo } from "react";
import {
  GitCompare,
  Download,
  Share2,
  Filter,
  LayoutGrid,
  RefreshCw,
} from "lucide-react";
import { useUserInfo } from "@/app/manage/hooks/useUserInfo.";
import { useLocations } from "../../hooks/useLocations";
import { LocationMultiSelector } from "./components/LocationMultiSelector";
import { ComparisonToolbar } from "./components/ComparisonToolbar";
import { RevenueComparisonChart } from "./components/RevenueComparisonChart";
import { DaypartComparisonChart } from "./components/DaypartComparisonChart";
import { PerformanceRadarChart } from "./components/PerformanceRadarChart";
import { SalesHeatMap } from "./components/SalesHeatMap";
import { LocationLeaderboard } from "./components/LocationLeaderboard";
import { useComparisonData } from "./hooks/useComparisonData";
import { Button } from "@/components/ui/button";
import { ReportPanel as Card, ReportPanelContent as CardContent } from "@/components/dashboard/reports/ReportPanel";
import { PageHeader, PageShell } from "@/components/dashboard/shell";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

type RangePreset = "today" | "yesterday" | "7d" | "30d";
type MetricType = "gross_sales" | "net_sales" | "order_count" | "avg_ticket";

export default function ComparisonDashboardPage() {
  const { data: userInfo } = useUserInfo();
  const clerkOrgId = userInfo?.members?.[0]?.organizations?.id;

  const { data: locations = [], isLoading: locationsLoading } = useLocations(
    clerkOrgId || "",
    userInfo?.id || ""
  );

  const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([]);
  const [activeRange, setActiveRange] = useState<RangePreset>("30d");
  const [selectedMetric, setSelectedMetric] = useState<MetricType>("net_sales");
  const [compareMode, setCompareMode] = useState<"previous" | "year">(
    "previous"
  );
  const [showComparison, setShowComparison] = useState(true);

  const effectiveLocationIds = useMemo(
    () =>
      selectedLocationIds.length > 0
        ? selectedLocationIds
        : locations.slice(0, 5).map((location) => location.id),
    [locations, selectedLocationIds],
  );

  // Get selected location names for charts
  const selectedLocationNames = useMemo(() => {
    return locations
      .filter((l) => effectiveLocationIds.includes(l.id))
      .map((l) => l.name);
  }, [effectiveLocationIds, locations]);

  // Fetch comparison data using clerkOrgId
  const {
    comparisonData,
    daypartData,
    summaryData,
    hourlyData,
    rankingsData,
    isLoading,
    refetchAll,
  } = useComparisonData(
    clerkOrgId,
    effectiveLocationIds,
    activeRange,
    effectiveLocationIds.length > 0
  );

  // Location list for heatmap
  const selectedLocations = useMemo(() => {
    return locations
      .filter((l) => effectiveLocationIds.includes(l.id))
      .map((l) => ({ id: l.id, name: l.name }));
  }, [effectiveLocationIds, locations]);

  return (
    <PageShell>
      <PageHeader
        title="Location Comparison"
        subtitle="Compare performance and metrics across your stores"
        backHref="/dashboard/reports"
        backLabel="Back to Reports"
        actions={
          <>
          <Button
            variant="outline"
            size="sm"
            onClick={refetchAll}
            disabled={isLoading}
            className="h-9 gap-2 px-4 text-[0.8125rem] font-medium shadow-sm"
          >
            <RefreshCw
              className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-2 px-4 text-[0.8125rem] font-medium shadow-sm"
          >
            <Share2 className="h-4 w-4" />
            Share
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-2 px-4 text-[0.8125rem] font-medium shadow-sm"
          >
            <Download className="h-4 w-4" />
            Export
          </Button>
          </>
        }
      />

      {/* Main Controls Card */}
      <Card>
        <CardContent className="p-6 space-y-6">
          {/* `min-w-0` on the tracks: a grid column takes an automatic minimum
              width from its content, so a nowrap child (the compare-mode pills)
              would otherwise push the column past the card edge. */}
          <div className="grid min-w-0 grid-cols-1 gap-8 lg:grid-cols-2">
            {/* Left: Location Selection */}
            <div className="min-w-0 space-y-3">
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
                <Label className="text-sm font-medium text-muted-foreground">
                  Choose Locations
                </Label>
                <div className="flex-1" />
                <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-muted/60 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                  <LayoutGrid className="h-3 w-3" />
                  LIMIT: 6
                </div>
              </div>
              <LocationMultiSelector
                locations={locations.map((l) => ({ id: l.id, name: l.name }))}
                selectedIds={effectiveLocationIds}
                onChange={setSelectedLocationIds}
                maxSelections={6}
              />
            </div>

            {/* Right: Metric Selection */}
            <div className="space-y-3">
              <Label className="text-sm font-medium text-muted-foreground">
                Comparison Metric
              </Label>
              <Select
                value={selectedMetric}
                onValueChange={(v) => setSelectedMetric(v as MetricType)}
              >
                {/* Matches the location selector beside it: borderless muted fill. */}
                <SelectTrigger className="h-auto min-h-11 w-full border-0 bg-muted/60 py-2 shadow-none hover:bg-muted">
                  <SelectValue placeholder="Select metric" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gross_sales">Gross Sales</SelectItem>
                  <SelectItem value="net_sales">Net Sales</SelectItem>
                  <SelectItem value="order_count">Order Count</SelectItem>
                  <SelectItem value="avg_ticket">Average Ticket</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <ComparisonToolbar
            activeRange={activeRange}
            onRangeChange={setActiveRange}
            compareMode={compareMode}
            onCompareModeChange={setCompareMode}
            showComparison={showComparison}
            onShowComparisonChange={setShowComparison}
          />
        </CardContent>
      </Card>

      {/* Charts Grid */}
      {effectiveLocationIds.length === 0 ? (
        <Card>
          <CardContent className="flex items-center justify-center h-[400px]">
            <div className="text-center space-y-3">
              <GitCompare className="h-12 w-12 mx-auto text-muted-foreground/30" />
              <p className="text-muted-foreground">
                Select locations to begin comparison
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2 min-w-0">
          {/* Chart 1: Revenue Comparison Line Chart */}
          <div className="lg:col-span-2 min-w-0">
            <RevenueComparisonChart
              data={comparisonData}
              locationNames={selectedLocationNames}
              metric={selectedMetric}
              isLoading={isLoading}
            />
          </div>

          {/* Chart 2: Daypart Comparison Bar Chart */}
          <DaypartComparisonChart
            data={daypartData}
            locationNames={selectedLocationNames}
            isLoading={isLoading}
          />

          {/* Chart 3: Performance Radar Chart */}
          <PerformanceRadarChart
            data={summaryData}
            locationNames={selectedLocationNames}
            isLoading={isLoading}
          />

          {/* Chart 4: Sales Heatmap */}
          <div className="lg:col-span-2 min-w-0">
            <SalesHeatMap
              data={hourlyData}
              locations={selectedLocations}
              isLoading={isLoading}
            />
          </div>

          {/* Leaderboard Table */}
          <div className="lg:col-span-2 min-w-0">
            <LocationLeaderboard
              rankings={rankingsData}
              isLoading={isLoading}
            />
          </div>
        </div>
      )}
    </PageShell>
  );
}
