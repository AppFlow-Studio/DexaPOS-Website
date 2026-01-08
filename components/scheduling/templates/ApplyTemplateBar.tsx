import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApplyMode } from "@/types/schedule";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle, Info, X } from "lucide-react";
import React from "react";

interface ApplyTemplateBarProps {
  templateName: string;
  shiftsToAdd: number;
  conflictsDetected: number;
  applyMode: ApplyMode;
  onApplyModeChange: (mode: ApplyMode) => void;
  onCancel: () => void;
  onViewDetails: () => void;
  onApply: () => void;
  className?: string;
}

const APPLY_MODES: {
  value: ApplyMode;
  label: string;
  description: string;
}[] = [
  {
    value: "merge",
    label: "Merge",
    description: "Keep existing shifts, add new",
  },
  {
    value: "replace-all",
    label: "Replace All",
    description: "Delete all existing shifts",
  },
  {
    value: "fill-gaps",
    label: "Fill Gaps",
    description: "Only add shifts into empty slots",
  },
];

export function ApplyTemplateBar({
  templateName,
  shiftsToAdd,
  conflictsDetected,
  applyMode,
  onApplyModeChange,
  onCancel,
  onViewDetails,
  onApply,
  className,
}: ApplyTemplateBarProps) {
  const currentMode = APPLY_MODES.find((m) => m.value === applyMode)!;

  return (
    <div
      className={cn(
        "fixed bottom-8 left-1/2 -translate-x-1/2 w-[95%] max-w-5xl z-50 animate-in slide-in-from-bottom-8 duration-500 ease-out",
        className
      )}
    >
      <div className="bg-[#1C1C1E]/95 backdrop-blur-md text-white rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] border border-white/10 p-4 flex flex-col sm:flex-row items-center justify-between gap-4 ring-1 ring-white/5">
        {/* Left: Template Info */}
        <div className="flex items-center gap-4 min-w-0">
          <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
            <Info className="w-5 h-5 text-primary" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[10px] uppercase tracking-wider text-white/50 font-semibold">
              Previewing Template
            </span>
            <span className="text-lg font-bold text-white truncate pr-4">
              {templateName}
            </span>
          </div>
        </div>

        {/* Divider (Hidden on mobile) */}
        <div className="hidden sm:block h-10 w-px bg-white/10" />

        {/* Middle: Controls & Stats */}
        <div className="flex flex-1 items-center justify-center gap-6">
          <Select
            value={applyMode}
            onValueChange={(val) => onApplyModeChange(val as ApplyMode)}
          >
            <SelectTrigger className="w-[180px] h-10 bg-white/5 border-white/10 text-white focus:ring-0 focus:ring-offset-0 focus:border-white/20 transition-colors hover:bg-white/10 rounded-lg">
              <SelectValue>{currentMode.label}</SelectValue>
            </SelectTrigger>
            <SelectContent
              className="bg-[#2C2C2E] border-white/10 text-white shadow-xl"
              side="top"
            >
              {APPLY_MODES.map((mode) => (
                <SelectItem
                  key={mode.value}
                  value={mode.value}
                  className="focus:bg-white/10 focus:text-white data-[state=checked]:bg-primary/20 data-[state=checked]:text-primary-foreground py-2"
                >
                  <div className="flex flex-col text-left">
                    <span className="font-medium">{mode.label}</span>
                    <span className="text-[10px] text-white/50">
                      {mode.description}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-4 text-sm font-medium">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20">
              <CheckCircle className="w-4 h-4 text-green-400" />
              <span className="text-green-400">{shiftsToAdd} New</span>
            </div>

            {conflictsDetected > 0 ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-yellow-500/10 border border-yellow-500/20">
                <AlertTriangle className="w-4 h-4 text-yellow-500" />
                <span className="text-yellow-500">
                  {conflictsDetected} Conflicts
                </span>
              </div>
            ) : (
              <div className="text-white/30 text-xs">No conflicts</div>
            )}
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            variant="ghost"
            onClick={onCancel}
            className="h-10 text-white/70 hover:text-white hover:bg-white/10 rounded-lg"
          >
            Cancel
          </Button>

          {conflictsDetected > 0 && (
            <Button
              variant="outline"
              onClick={onViewDetails}
              className="h-10 bg-transparent border border-white/20 text-white hover:bg-white/10 hover:text-white rounded-lg hidden lg:flex"
            >
              Review Conflicts
            </Button>
          )}

          <Button
            onClick={onApply}
            className={cn(
              "h-10 px-6 font-semibold shadow-lg transition-all active:scale-95 rounded-lg",
              conflictsDetected > 0
                ? "bg-yellow-600 hover:bg-yellow-700 text-white ring-2 ring-yellow-600/20"
                : "bg-primary hover:bg-primary/90 text-primary-foreground ring-2 ring-primary/20"
            )}
          >
            {conflictsDetected > 0 ? "Resolve & Apply" : "Apply Changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}
