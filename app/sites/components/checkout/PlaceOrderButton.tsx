"use client";

import { Loader2, Lock } from "lucide-react";

interface PlaceOrderButtonProps {
  total: number;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
  isTestMode?: boolean;
}

export function PlaceOrderButton({ total, loading, disabled, onClick, isTestMode }: PlaceOrderButtonProps) {
  return (
    <div
      className="fixed bottom-0 left-0 right-0 p-4 md:static md:p-0 z-40"
      style={{ backgroundColor: "var(--bg)" }}
    >
      <div className="max-w-2xl mx-auto">
        <button
          onClick={onClick}
          disabled={disabled || loading}
          className="w-full py-4 font-bold text-base transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            backgroundColor: "var(--primary)",
            color: "#FFFFFF",
            borderRadius: "var(--radius)",
            border: "none",
            boxShadow: "0 4px 16px color-mix(in srgb, var(--primary) 40%, transparent)",
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
      </div>
    </div>
  );
}
