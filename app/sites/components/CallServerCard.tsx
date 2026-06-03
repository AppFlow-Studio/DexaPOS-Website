"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { raiseQrGuestAlert } from "../qr-actions";
import { useSession } from "../hooks/useSession";

const COOLDOWN_SECONDS = 30;

export function CallServerCard() {
  const sessionToken = useSession((state) => state.sessionToken);
  const qrTableLabel = useSession((state) => state.qrTableLabel);
  const [message, setMessage] = useState("");
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [lastRaisedAt, setLastRaisedAt] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!cooldownUntil) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [cooldownUntil]);

  const remainingSeconds = useMemo(() => {
    if (!cooldownUntil) return 0;
    return Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
  }, [cooldownUntil, now]);

  useEffect(() => {
    if (cooldownUntil && remainingSeconds <= 0) {
      setCooldownUntil(null);
    }
  }, [cooldownUntil, remainingSeconds]);

  if (!sessionToken || !qrTableLabel) {
    return null;
  }

  const handleRaiseAlert = () => {
    startTransition(async () => {
      const result = await raiseQrGuestAlert(sessionToken, message);

      if (!result.success) {
        toast.error(result.error || "Failed to notify the restaurant");
        return;
      }

      setLastRaisedAt(Date.now());
      setCooldownUntil(Date.now() + COOLDOWN_SECONDS * 1000);
      toast.success("A team member has been notified.");
    });
  };

  const buttonLabel =
    remainingSeconds > 0
      ? `Try again in ${remainingSeconds}s`
      : lastRaisedAt
        ? "Notify again"
        : "Call your server";

  return (
    <div
      className="rounded-xl border px-4 py-4"
      style={{
        borderColor: "color-mix(in srgb, var(--primary) 22%, #D6E4FF)",
        backgroundColor: "color-mix(in srgb, var(--primary) 4%, #FFFFFF)",
      }}
    >
      <div className="flex flex-col gap-3">
        <div>
          <p
            className="text-xs font-semibold uppercase tracking-[0.18em]"
            style={{ color: "var(--primary)" }}
          >
            Need help?
          </p>
          <p className="mt-1 text-sm font-semibold" style={{ color: "var(--text)" }}>
            Call your server for Table {qrTableLabel}
          </p>
          <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
            A team member will be notified on the order line and kitchen screens.
          </p>
        </div>

        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Optional note for the staff"
          rows={2}
          className="w-full resize-none rounded-lg px-3 py-2 text-sm outline-none"
          style={{
            border: "1px solid var(--border)",
            backgroundColor: "#FFFFFF",
            color: "var(--text)",
            borderRadius: "var(--radius)",
          }}
        />

        <button
          type="button"
          onClick={handleRaiseAlert}
          disabled={isPending || remainingSeconds > 0}
          className="inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
          style={{ backgroundColor: "var(--primary)", color: "#FFFFFF" }}
        >
          {isPending ? "Notifying..." : buttonLabel}
        </button>
      </div>
    </div>
  );
}
