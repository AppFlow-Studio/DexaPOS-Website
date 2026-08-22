"use client";

import { Calendar, History, ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ScrollableTabsBar } from "@/components/dashboard/ScrollableTabsBar";

type RangePreset = "today" | "yesterday" | "7d" | "30d";

interface ComparisonToolbarProps {
  activeRange: RangePreset;
  onRangeChange: (range: RangePreset) => void;
  compareMode: "previous" | "year";
  onCompareModeChange: (mode: "previous" | "year") => void;
  showComparison: boolean;
  onShowComparisonChange: (show: boolean) => void;
}

const presets: { id: RangePreset; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "7d", label: "7 Days" },
  { id: "30d", label: "30 Days" },
];

export function ComparisonToolbar({
  activeRange,
  onRangeChange,
  compareMode,
  onCompareModeChange,
  showComparison,
  onShowComparisonChange,
}: ComparisonToolbarProps) {
  return (
    <div className="flex min-w-0 flex-col gap-4 rounded-2xl border-0 bg-muted/60 p-4">
      {/* Range Selectors */}
      <ScrollableTabsBar activeValue={activeRange} className="pb-0">
        <div className="flex w-fit min-w-full items-center gap-0.5 rounded-full bg-background/70 p-1 sm:min-w-0">
          {presets.map((preset) => (
            <button
              key={preset.id}
              onClick={() => onRangeChange(preset.id)}
              data-active={activeRange === preset.id}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                activeRange === preset.id
                  ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </ScrollableTabsBar>

      {/* Comparison Controls */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {/* Toggle Show Comparison */}
        <div className="flex items-center space-x-2">
          <Switch
            id="show-comparison"
            checked={showComparison}
            onCheckedChange={onShowComparisonChange}
          />
          <Label
            htmlFor="show-comparison"
            className="cursor-pointer text-sm font-medium text-muted-foreground"
          >
            Compare to
          </Label>
        </div>

        {/* Comparison Mode Selection */}
        <div
          className={cn(
            "flex min-w-0 items-center gap-2 transition-opacity duration-300",
            !showComparison ? "opacity-30 pointer-events-none" : "opacity-100"
          )}
        >
          {/* The two labels are `whitespace-nowrap`, so this group cannot shrink
              to fit — without wrapping, "Same Period LY" ran past the panel edge
              on a narrow viewport. Wrapping keeps both pills inside the card. */}
          <div className="flex min-w-0 flex-wrap items-center gap-0.5 rounded-full bg-background/70 p-1">
            <button
              onClick={() => onCompareModeChange("previous")}
              className={cn(
                "flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors",
                compareMode === "previous"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              <History className="h-3 w-3" />
              Prev Period
            </button>
            <button
              onClick={() => onCompareModeChange("year")}
              className={cn(
                "flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors",
                compareMode === "year"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              <Calendar className="h-3 w-3" />
              Same Period LY
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
