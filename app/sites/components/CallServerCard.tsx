"use client";

import { useEffect, useId, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { raiseQrGuestAlert } from "../qr-actions";
import { useSession } from "../hooks/useSession";

const COOLDOWN_SECONDS = 30;
const MAX_MESSAGE_LENGTH = 180;

function getAlertErrorMessage(
  reason: string | null | undefined,
  fallback?: string
) {
  if (reason === "rate_limit_exceeded") {
    return "Please wait a moment before notifying the staff again.";
  }

  if (fallback === "Invalid or expired session") {
    return "This table session expired. Scan the QR code again before requesting help.";
  }

  return fallback || "Failed to notify the restaurant";
}

export function CallServerCard() {
  const sessionToken = useSession((state) => state.sessionToken);
  const qrTableLabel = useSession((state) => state.qrTableLabel);
  const [message, setMessage] = useState("");
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [lastRaisedAt, setLastRaisedAt] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const [now, setNow] = useState(Date.now());
  const noteFieldId = useId();
  const noteHelpId = useId();
  const statusId = useId();

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
        toast.error(getAlertErrorMessage(result.reason, result.error));
        return;
      }

      setMessage("");
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

  const statusMessage =
    remainingSeconds > 0
      ? `You can notify the staff again in ${remainingSeconds} seconds.`
      : lastRaisedAt
        ? "Your last request was sent. Use the button again only if you still need help."
        : "Add an optional note if the staff needs extra context.";

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

        <label
          htmlFor={noteFieldId}
          className="text-xs font-medium uppercase tracking-[0.14em]"
          style={{ color: "var(--text-secondary)" }}
        >
          Optional note
        </label>
        <textarea
          id={noteFieldId}
          value={message}
          onChange={(event) =>
            setMessage(event.target.value.slice(0, MAX_MESSAGE_LENGTH))
          }
          placeholder="Optional note for the staff"
          rows={2}
          maxLength={MAX_MESSAGE_LENGTH}
          aria-describedby={`${noteHelpId} ${statusId}`}
          className="w-full resize-none rounded-lg px-3 py-2 text-sm outline-none"
          style={{
            border: "1px solid var(--border)",
            backgroundColor: "#FFFFFF",
            color: "var(--text)",
            borderRadius: "var(--radius)",
          }}
        />
        <div
          id={noteHelpId}
          className="flex items-center justify-between text-xs"
          style={{ color: "var(--text-secondary)" }}
        >
          <span>The note is shown to staff with the table alert.</span>
          <span>{message.length}/{MAX_MESSAGE_LENGTH}</span>
        </div>

        <button
          type="button"
          onClick={handleRaiseAlert}
          disabled={isPending || remainingSeconds > 0}
          aria-describedby={statusId}
          className="inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
          style={{ backgroundColor: "var(--primary)", color: "#FFFFFF" }}
        >
          {isPending ? "Notifying..." : buttonLabel}
        </button>
        <p
          id={statusId}
          role="status"
          aria-live="polite"
          className="text-xs"
          style={{ color: "var(--text-secondary)" }}
        >
          {statusMessage}
        </p>
      </div>
    </div>
  );
}
