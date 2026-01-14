"use client";

import { Calendar, History, ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

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
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-2xl bg-card/50 backdrop-blur-sm border border-muted/30">
      {/* Range Selectors */}
      <div className="flex items-center gap-1.5 p-1 bg-muted/40 rounded-xl w-fit">
        {presets.map((preset) => (
          <button
            key={preset.id}
            onClick={() => onRangeChange(preset.id)}
            className={cn(
              "px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200",
              activeRange === preset.id
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted"
            )}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Comparison Controls */}
      <div className="flex items-center gap-6 divide-x divide-muted/30">
        {/* Toggle Show Comparison */}
        <div className="flex items-center space-x-2">
          <Switch
            id="show-comparison"
            checked={showComparison}
            onCheckedChange={onShowComparisonChange}
          />
          <Label
            htmlFor="show-comparison"
            className="text-xs font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer"
          >
            Compare to
          </Label>
        </div>

        {/* Comparison Mode Selection */}
        <div
          className={cn(
            "flex items-center gap-2 pl-6 transition-opacity duration-300",
            !showComparison ? "opacity-30 pointer-events-none" : "opacity-100"
          )}
        >
          <div className="flex items-center gap-1 p-1 bg-muted/40 rounded-lg">
            <button
              onClick={() => onCompareModeChange("previous")}
              className={cn(
                "flex items-center gap-2 px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-tight transition-all",
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
                "flex items-center gap-2 px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-tight transition-all",
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
