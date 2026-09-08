"use client";

import { Monitor, Smartphone, Tablet } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { PREVIEW_DEVICES, type PreviewDevice } from "./preview-device";

const ICONS = {
  desktop: Monitor,
  tablet: Tablet,
  mobile: Smartphone,
} satisfies Record<PreviewDevice, typeof Monitor>;

export default function DeviceSwitch({
  device,
  onChange,
}: {
  device: PreviewDevice;
  onChange: (device: PreviewDevice) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Preview device"
      className="flex items-center gap-0.5 rounded-lg border bg-muted/60 p-0.5"
    >
      {PREVIEW_DEVICES.map((preset) => {
        const Icon = ICONS[preset.id];

        return (
          <Tooltip key={preset.id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={`${preset.label} preview`}
                aria-pressed={device === preset.id}
                onClick={() => onChange(preset.id)}
                className={cn(
                  "flex size-7 items-center justify-center rounded-md transition-all",
                  device === preset.id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {preset.label} · {preset.width} × {preset.height}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
