"use client";

import { useState, useEffect, useMemo } from "react";
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
import { Card, CardContent } from "@/components/ui/card";
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

  // Initialize with first 5 locations
  useEffect(() => {
    if (locations.length > 0 && selectedLocationIds.length === 0) {
      setSelectedLocationIds(locations.slice(0, 5).map((l) => l.id));
    }
  }, [locations, selectedLocationIds.length]);

  // Get selected location names for charts
  const selectedLocationNames = useMemo(() => {
    return locations
      .filter((l) => selectedLocationIds.includes(l.id))
      .map((l) => l.name);
  }, [locations, selectedLocationIds]);

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
    selectedLocationIds,
    activeRange,
    selectedLocationIds.length > 0
  );

  // Location list for heatmap
  const selectedLocations = useMemo(() => {
    return locations
      .filter((l) => selectedLocationIds.includes(l.id))
      .map((l) => ({ id: l.id, name: l.name }));
  }, [locations, selectedLocationIds]);

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-primary/10 border border-primary/20 shadow-sm shadow-primary/5">
            <GitCompare className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Location Comparison
            </h1>
            <p className="text-muted-foreground text-sm">
              Compare performance and metrics across your stores
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={refetchAll}
            disabled={isLoading}
            className="gap-2 bg-background/50 border-muted/30 hover:bg-muted/50 transition-colors"
          >
            <RefreshCw
              className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="hidden sm:flex gap-2 bg-background/50 border-muted/30 hover:bg-muted/50 transition-colors"
          >
            <Share2 className="h-4 w-4" />
            Share
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="hidden sm:flex gap-2 bg-background/50 border-muted/30 hover:bg-muted/50 transition-colors"
          >
            <Download className="h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      {/* Main Controls Card */}
      <Card className="border-none shadow-sm bg-card/30 backdrop-blur-md overflow-hidden ring-1 ring-white/5">
        <CardContent className="p-6 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left: Location Selection */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-1">
                  Choose Locations
                </Label>
                <div className="flex items-center gap-1.5 text-[10px] font-black text-primary px-2.5 py-0.5 rounded-full bg-primary/10 ring-1 ring-primary/20">
                  <LayoutGrid className="h-3 w-3" />
                  LIMIT: 6
                </div>
              </div>
              <LocationMultiSelector
                locations={locations.map((l) => ({ id: l.id, name: l.name }))}
                selectedIds={selectedLocationIds}
                onChange={setSelectedLocationIds}
                maxSelections={6}
              />
            </div>

            {/* Right: Metric Selection */}
            <div className="space-y-3">
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-1">
                Comparison Metric
              </Label>
              <Select
                value={selectedMetric}
                onValueChange={(v) => setSelectedMetric(v as MetricType)}
              >
                <SelectTrigger className="h-11 bg-background/50 border-muted-foreground/20 hover:border-primary/50 transition-all rounded-xl">
                  <SelectValue placeholder="Select metric" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-muted/30">
                  <SelectItem value="gross_sales" className="rounded-lg">
                    Gross Sales
                  </SelectItem>
                  <SelectItem value="net_sales" className="rounded-lg">
                    Net Sales
                  </SelectItem>
                  <SelectItem value="order_count" className="rounded-lg">
                    Order Count
                  </SelectItem>
                  <SelectItem value="avg_ticket" className="rounded-lg">
                    Average Ticket
                  </SelectItem>
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
      {selectedLocationIds.length === 0 ? (
        <Card className="border-none shadow-sm bg-card/30 backdrop-blur-md ring-1 ring-white/5">
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
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Chart 1: Revenue Comparison Line Chart */}
          <div className="lg:col-span-2">
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
          <div className="lg:col-span-2">
            <SalesHeatMap
              data={hourlyData}
              locations={selectedLocations}
              isLoading={isLoading}
            />
          </div>

          {/* Leaderboard Table */}
          <div className="lg:col-span-2">
            <LocationLeaderboard
              rankings={rankingsData}
              isLoading={isLoading}
            />
          </div>
        </div>
      )}
    </div>
  );
}
