"use client";

import { Loader2, Lock } from "lucide-react";

interface PlaceOrderButtonProps {
  total: number;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
  isTestMode?: boolean;
  /**
   * `fixed` — full-width bar pinned to the bottom of the viewport (mobile).
   * `inline` — block button only; place inside the checkout sidebar on desktop.
   */
  layout?: "fixed" | "inline";
}

export function PlaceOrderButton({
  total,
  loading,
  disabled,
  onClick,
  isTestMode,
  layout = "fixed",
}: PlaceOrderButtonProps) {
  const button = (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className="w-full py-4 font-bold text-base transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
      style={{
        backgroundColor: "var(--primary, #4f46e5)",
        color: "#111111",
        borderRadius: "var(--radius)",
        border: "1px solid color-mix(in srgb, var(--primary, #4f46e5) 75%, #312e81)",
        boxShadow: "0 4px 16px color-mix(in srgb, var(--primary, #4f46e5) 40%, transparent)",
        fontFamily: "var(--font)",
      }}
    >
      {loading ? (
        <>
          <Loader2 className="h-5 w-5 animate-spin" />
          {isTestMode ? "Placing Order..." : "Processing Payment..."}
        </>
      ) : isTestMode ? (
        <>{`Place Order — $${total.toFixed(2)}`}</>
      ) : (
        <>
          <Lock className="h-4 w-4" />
          {`Pay $${total.toFixed(2)}`}
        </>
      )}
    </button>
  );

  if (layout === "inline") {
    return <div className="w-full">{button}</div>;
  }

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      style={{
        backgroundColor: "var(--bg)",
        borderTop: "1px solid var(--border)",
        boxShadow: "0 -8px 24px color-mix(in srgb, var(--text) 8%, transparent)",
      }}
    >
      <div className="pointer-events-auto w-full max-w-6xl px-4">{button}</div>
    </div>
  );
}
