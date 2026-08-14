"use client";

import { useMemo, useState } from "react";
import { ReportPanel as Card, ReportPanelContent as CardContent, ReportPanelHeader as CardHeader, ReportPanelTitle as CardTitle } from "@/components/dashboard/reports/ReportPanel";
import { Skeleton } from "@/components/ui/skeleton";
import { Grid3X3, MapPin } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  transformToHeatmapData,
  HeatmapCell,
} from "../hooks/useComparisonData";
import { HourlyComparisonData } from "@/app/dashboard/actions/location-analytics";
import { cn } from "@/lib/utils";

interface SalesHeatMapProps {
  data: HourlyComparisonData[];
  locations: { id: string; name: string }[];
  isLoading?: boolean;
}

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon-Sun
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 6AM - 11PM

function getCellColor(intensity: number): string {
  if (intensity === 0) return "bg-muted/20";
  if (intensity < 0.2) return "bg-primary/10";
  if (intensity < 0.4) return "bg-primary/25";
  if (intensity < 0.6) return "bg-primary/40";
  if (intensity < 0.8) return "bg-primary/60";
  return "bg-primary/80";
}

function formatHour(hour: number): string {
  if (hour === 0) return "12AM";
  if (hour === 12) return "12PM";
  if (hour < 12) return `${hour}AM`;
  return `${hour - 12}PM`;
}

export function SalesHeatMap({
  data,
  locations,
  isLoading = false,
}: SalesHeatMapProps) {
  const [selectedLocationId, setSelectedLocationId] = useState<string>(
    locations[0]?.id || ""
  );

  const effectiveLocationId = locations.some(
    (location) => location.id === selectedLocationId,
  )
    ? selectedLocationId
    : locations[0]?.id || "";

  const heatmapData = useMemo(
    () => transformToHeatmapData(data, effectiveLocationId),
    [data, effectiveLocationId]
  );

  const selectedLocation = locations.find((l) => l.id === effectiveLocationId);

  // Create grid lookup
  const cellMap = useMemo(() => {
    const map = new Map<string, HeatmapCell>();
    heatmapData.forEach((cell) => {
      map.set(`${cell.dayOfWeek}-${cell.hour}`, cell);
    });
    return map;
  }, [heatmapData]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[280px] w-full rounded-xl" />
        </CardContent>
      </Card>
    );
  }

  if (locations.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Grid3X3 className="h-4 w-4 text-primary" />
            Sales Heat Map
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-[280px]">
          <p className="text-muted-foreground text-sm">
            Select locations to view heat map
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="col-span-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Grid3X3 className="h-4 w-4 text-primary" />
            Sales Heat Map
          </CardTitle>
          <Select
            value={effectiveLocationId}
            onValueChange={setSelectedLocationId}
          >
            <SelectTrigger className="w-full sm:w-[200px] h-9 bg-background/50 border-muted-foreground/20">
              <div className="flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5 text-primary" />
                <SelectValue placeholder="Select location" />
              </div>
            </SelectTrigger>
            <SelectContent>
              {locations.map((location) => (
                <SelectItem key={location.id} value={location.id}>
                  {location.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <div className="min-w-[600px]">
          {/* Header Row - Hours */}
          <div className="grid grid-cols-[60px_repeat(18,1fr)] gap-1 mb-1">
            <div className="text-[10px] text-muted-foreground font-medium"></div>
            {HOURS.map((hour) => (
              <div
                key={hour}
                className="text-[10px] text-muted-foreground font-medium text-center"
              >
                {formatHour(hour)}
              </div>
            ))}
          </div>

          {/* Data Rows - Days */}
          {DAY_ORDER.map((dayIndex) => (
            <div
              key={dayIndex}
              className="grid grid-cols-[60px_repeat(18,1fr)] gap-1 mb-1"
            >
              <div className="text-xs text-muted-foreground font-medium flex items-center">
                {DAY_LABELS[dayIndex]}
              </div>
              {HOURS.map((hour) => {
                const cell = cellMap.get(`${dayIndex}-${hour}`);
                const value = cell?.value || 0;
                const intensity = cell?.intensity || 0;

                return (
                  <div
                    key={`${dayIndex}-${hour}`}
                    className={cn(
                      "aspect-[2/1] rounded-sm transition-all duration-200 cursor-pointer hover:ring-2 hover:ring-primary/50 hover:scale-105",
                      getCellColor(intensity)
                    )}
                    title={`${DAY_LABELS[dayIndex]} ${formatHour(
                      hour
                    )}: $${value.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}`}
                  />
                );
              })}
            </div>
          ))}

          {/* Legend */}
          <div className="mt-4 flex items-center justify-end gap-2 pt-3">
            <span className="text-[10px] text-muted-foreground">Less</span>
            <div className="flex gap-0.5">
              <div className="w-4 h-3 rounded-sm bg-muted/20" />
              <div className="w-4 h-3 rounded-sm bg-primary/10" />
              <div className="w-4 h-3 rounded-sm bg-primary/25" />
              <div className="w-4 h-3 rounded-sm bg-primary/40" />
              <div className="w-4 h-3 rounded-sm bg-primary/60" />
              <div className="w-4 h-3 rounded-sm bg-primary/80" />
            </div>
            <span className="text-[10px] text-muted-foreground">More</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
