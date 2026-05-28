"use client";

import { Input } from "@/components/ui/input";

interface TipSectionProps {
  subtotal: number;
  tipPresets: number[];
  selectedTipIndex: number | null;
  customTip: string;
  onSelectPreset: (index: number) => void;
  onSelectCustom: () => void;
  onSelectNoTip: () => void;
  onCustomTipChange: (value: string) => void;
}

export function TipSection({
  subtotal,
  tipPresets,
  selectedTipIndex,
  customTip,
  onSelectPreset,
  onSelectCustom,
  onSelectNoTip,
  onCustomTipChange,
}: TipSectionProps) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline gap-2">
        <h2 className="text-lg font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--text)" }}>
          Add a Tip
        </h2>
        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>on subtotal</span>
      </div>

      {/* Percentage presets — equal columns, just the % pills so each has room */}
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${Math.max(1, tipPresets.length)}, minmax(0,1fr))` }}
      >
        {tipPresets.map((pct, i) => {
          const amount = Math.round(subtotal * (pct / 100) * 100) / 100;
          const isSelected = selectedTipIndex === i;
          return (
            <button
              key={`${pct}-${i}`}
              onClick={() => onSelectPreset(i)}
              className="py-2.5 px-1 text-center rounded-lg border transition-colors min-w-0"
              style={{
                backgroundColor: isSelected ? "var(--primary)" : "transparent",
                color: isSelected ? "#fff" : "var(--text)",
                borderColor: isSelected ? "var(--primary)" : "var(--border)",
                borderRadius: "var(--radius)",
              }}
            >
              <span className="text-sm font-semibold block leading-tight">{pct}%</span>
              <span className="text-[11px] block mt-0.5 truncate" style={{ opacity: 0.75 }}>
                ${amount.toFixed(2)}
              </span>
            </button>
          );
        })}
      </div>

      {/* No Tip / Custom — own row so the word labels never clip */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={onSelectNoTip}
          className="py-2.5 px-2 text-sm font-semibold rounded-lg border transition-colors"
          style={{
            backgroundColor: selectedTipIndex === -1 ? "var(--primary)" : "transparent",
            color: selectedTipIndex === -1 ? "#fff" : "var(--text)",
            borderColor: selectedTipIndex === -1 ? "var(--primary)" : "var(--border)",
            borderRadius: "var(--radius)",
          }}
        >
          No Tip
        </button>
        <button
          onClick={onSelectCustom}
          className="py-2.5 px-2 text-sm font-semibold rounded-lg border transition-colors"
          style={{
            backgroundColor: selectedTipIndex === null ? "var(--primary)" : "transparent",
            color: selectedTipIndex === null ? "#fff" : "var(--text)",
            borderColor: selectedTipIndex === null ? "var(--primary)" : "var(--border)",
            borderRadius: "var(--radius)",
          }}
        >
          Custom
        </button>
      </div>

      {selectedTipIndex === null && (
        <Input
          type="number"
          min="0"
          step="0.01"
          placeholder="Enter tip amount"
          value={customTip}
          onChange={(e) => {
            const val = e.target.value;
            if (val === "" || Number(val) >= 0) onCustomTipChange(val);
          }}
          className="animate-in fade-in slide-in-from-top-2"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--bg)" }}
        />
      )}
    </section>
  );
}
