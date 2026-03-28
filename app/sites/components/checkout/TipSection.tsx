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
      <h2 className="text-lg font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--text)" }}>
        Add a Tip
      </h2>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={onSelectNoTip}
          className="flex-1 min-w-[70px] py-2.5 text-sm font-medium rounded-lg border transition-colors"
          style={{
            backgroundColor: selectedTipIndex === -1 ? "var(--primary)" : "transparent",
            color: selectedTipIndex === -1 ? "#fff" : "var(--text)",
            borderColor: selectedTipIndex === -1 ? "var(--primary)" : "var(--border)",
            borderRadius: "var(--radius)",
          }}
        >
          No Tip
        </button>
        {tipPresets.map((pct, i) => {
          const amount = Math.round(subtotal * (pct / 100) * 100) / 100;
          return (
            <button
              key={pct}
              onClick={() => onSelectPreset(i)}
              className="flex-1 min-w-[70px] py-2.5 text-center rounded-lg border transition-colors"
              style={{
                backgroundColor: selectedTipIndex === i ? "var(--primary)" : "transparent",
                color: selectedTipIndex === i ? "#fff" : "var(--text)",
                borderColor: selectedTipIndex === i ? "var(--primary)" : "var(--border)",
                borderRadius: "var(--radius)",
              }}
            >
              <span className="text-sm font-medium block">{pct}%</span>
              <span className="text-xs opacity-75 block">${amount.toFixed(2)}</span>
            </button>
          );
        })}
        <button
          onClick={onSelectCustom}
          className="flex-1 min-w-[70px] py-2.5 text-sm font-medium rounded-lg border transition-colors"
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
          placeholder="Enter tip amount"
          value={customTip}
          onChange={(e) => onCustomTipChange(e.target.value)}
          className="animate-in fade-in slide-in-from-top-2"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--bg)" }}
        />
      )}
    </section>
  );
}
