"use client";

import { useEffect, useState } from "react";
import { Lock } from "lucide-react";

// Cycled while the charge is in flight so the wait feels like progress, not a
// frozen spinner. Timed to ~2s each — long enough to read, short enough that a
// fast Valor response never shows a stale step.
const STEPS = [
  "Securing your payment…",
  "Contacting your bank…",
  "Confirming your order…",
];

interface PaymentProcessingOverlayProps {
  total?: number;
}

/**
 * Full-screen branded overlay shown from payment submission until the payment
 * processor (Valor) resolves. Reads the storefront theme variables so it
 * matches each merchant's brand. Mount it only while a charge is in flight
 * (e.g. `{loading && <PaymentProcessingOverlay total={total} />}`) so each
 * submission starts the message cycle fresh.
 */
export function PaymentProcessingOverlay({ total }: PaymentProcessingOverlayProps) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setStep((s) => (s + 1) % STEPS.length);
    }, 2000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Processing your payment"
      className="fixed inset-0 z-[100] flex items-center justify-center p-6"
      style={{
        backgroundColor: "color-mix(in srgb, var(--text, #111827) 55%, transparent)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
      }}
    >
      <div
        className="flex w-full max-w-sm flex-col items-center gap-5 rounded-2xl px-8 py-10 text-center animate-in fade-in zoom-in-95 duration-300"
        style={{
          backgroundColor: "var(--card, #ffffff)",
          boxShadow: "0 24px 60px color-mix(in srgb, var(--text, #111827) 25%, transparent)",
        }}
      >
        {/* Spinning arc around a pulsing lock */}
        <div className="relative flex h-20 w-20 items-center justify-center">
          <span
            className="absolute inset-0 rounded-full"
            style={{
              border: "3px solid color-mix(in srgb, var(--primary, #4f46e5) 18%, transparent)",
            }}
          />
          <span
            className="absolute inset-0 rounded-full animate-spin"
            style={{
              border: "3px solid transparent",
              borderTopColor: "var(--primary, #4f46e5)",
              borderRightColor: "var(--primary, #4f46e5)",
              animationDuration: "0.9s",
            }}
          />
          <span
            className="flex h-11 w-11 items-center justify-center rounded-full animate-pulse"
            style={{
              backgroundColor: "color-mix(in srgb, var(--primary, #4f46e5) 12%, transparent)",
            }}
          >
            <Lock className="h-5 w-5" style={{ color: "var(--primary, #4f46e5)" }} />
          </span>
        </div>

        <div className="space-y-1">
          <p
            className="text-lg font-bold"
            style={{ fontFamily: "var(--font-display)", color: "var(--text, #111827)" }}
          >
            {typeof total === "number" ? `Processing $${total.toFixed(2)}` : "Processing payment"}
          </p>
          {/* key={step} re-triggers the slide/fade animation on each message */}
          <p
            key={step}
            className="text-sm animate-in fade-in slide-in-from-bottom-1 duration-500"
            style={{ color: "var(--text-secondary, #6b7280)" }}
          >
            {STEPS[step]}
          </p>
        </div>

        {/* Progress dots — the active step stretches into a pill */}
        <div className="flex items-center gap-1.5" aria-hidden="true">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className="h-1.5 rounded-full transition-all duration-300"
              style={{
                width: i === step ? "20px" : "6px",
                backgroundColor:
                  i === step
                    ? "var(--primary, #4f46e5)"
                    : "color-mix(in srgb, var(--primary, #4f46e5) 25%, transparent)",
              }}
            />
          ))}
        </div>

        <p className="text-xs" style={{ color: "var(--text-secondary, #6b7280)" }}>
          Please don&apos;t close this window.
        </p>
      </div>
    </div>
  );
}
