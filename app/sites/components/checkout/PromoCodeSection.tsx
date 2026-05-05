"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tag, CheckCircle2, X, Loader2 } from "lucide-react";

export interface AppliedPromo {
  code: string;
  promotionName: string;
  discountAmount: number;
}

interface PromoCodeSectionProps {
  subtotal: number;
  appliedPromo: AppliedPromo | null;
  /** Returns an error string on failure, undefined on success. */
  onApply: (code: string) => Promise<string | undefined>;
  onRemove: () => void;
}

export function PromoCodeSection({
  appliedPromo,
  onApply,
  onRemove,
}: PromoCodeSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (appliedPromo) {
    return (
      <section>
        <div
          className="flex items-center justify-between px-3 py-2 rounded-lg text-sm"
          style={{
            backgroundColor: "color-mix(in srgb, #22c55e 10%, var(--bg))",
            border: "1px solid color-mix(in srgb, #22c55e 40%, transparent)",
            borderRadius: "var(--radius)",
          }}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: "#16a34a" }} />
            <div>
              <span className="font-semibold" style={{ color: "#15803d" }}>
                {appliedPromo.code}
              </span>
              <span className="ml-1" style={{ color: "#16a34a" }}>
                −${appliedPromo.discountAmount.toFixed(2)} off
              </span>
            </div>
          </div>
          <button
            onClick={onRemove}
            className="p-1 rounded-full transition-colors"
            style={{ color: "#16a34a" }}
            aria-label="Remove promo code"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </section>
    );
  }

  const handleApply = async () => {
    const trimmed = code.trim();
    if (!trimmed) return;
    setError(null);
    setLoading(true);
    const err = await onApply(trimmed);
    setLoading(false);
    if (err) setError(err);
    // On success the parent sets appliedPromo and this component re-renders to the success state.
  };

  return (
    <section>
      {!expanded ? (
        <button
          onClick={() => setExpanded(true)}
          className="flex items-center gap-2 text-sm font-medium"
          style={{ color: "var(--primary)" }}
        >
          <Tag className="h-4 w-4" />
          Add Promo Code +
        </button>
      ) : (
        <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
          <div className="flex gap-2">
            <Input
              value={code}
              onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(null); }}
              onKeyDown={(e) => e.key === "Enter" && handleApply()}
              placeholder="Enter promo code"
              className="flex-1 !bg-white !text-gray-900"
              style={{ borderColor: error ? "#ef4444" : "#e5e7eb", backgroundColor: "#ffffff" }}
              disabled={loading}
              autoFocus
            />
            <Button
              variant="outline"
              onClick={handleApply}
              disabled={!code.trim() || loading}
              style={{
                borderColor: "var(--primary)",
                color: "var(--primary)",
                borderRadius: "var(--radius)",
              }}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}
            </Button>
          </div>
          {error && (
            <p className="text-xs" style={{ color: "#dc2626" }}>
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
