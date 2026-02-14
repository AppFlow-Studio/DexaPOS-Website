"use client";

import { cn } from "@/lib/utils";

const PRESET_COLORS = [
  { label: "Blue", value: "#3B82F6" },
  { label: "Red", value: "#EF4444" },
  { label: "Green", value: "#22C55E" },
  { label: "Amber", value: "#F59E0B" },
  { label: "Purple", value: "#A855F7" },
  { label: "Pink", value: "#EC4899" },
  { label: "Cyan", value: "#06B6D4" },
  { label: "Orange", value: "#F97316" },
] as const;

interface ColorSwatchPickerProps {
  value: string;
  onChange: (color: string) => void;
}

export function ColorSwatchPicker({ value, onChange }: ColorSwatchPickerProps) {
  return (
    <div className="flex gap-2 flex-wrap">
      {PRESET_COLORS.map((color) => (
        <button
          key={color.value}
          type="button"
          title={color.label}
          onClick={() => onChange(color.value)}
          className={cn(
            "h-8 w-8 rounded-full transition-all border-2",
            value === color.value
              ? "ring-2 ring-offset-2 ring-primary border-primary"
              : "border-transparent hover:scale-110"
          )}
          style={{ backgroundColor: color.value }}
        />
      ))}
    </div>
  );
}
