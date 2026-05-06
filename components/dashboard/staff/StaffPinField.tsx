"use client";

import * as React from "react";
import { Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ReauthDialog } from "./ReauthDialog";

// Tracks last successful re-auth across all instances in the same page session.
// Using module-level ref so it survives component unmounts (e.g. sheet close/open).
let lastPinAuthAt: number | null = null;

const REAUTH_TTL_MS = 5 * 60 * 1000;
const AUTO_HIDE_SECONDS = 10;

interface StaffPinFieldProps {
  /** Member ID (members.id) — used to call reveal endpoint */
  memberId: string;
  /** Location ID for this PIN assignment */
  locationId: string;
  locationName?: string;
  /** Whether a PIN is set for this assignment */
  hasPin: boolean;
  /** Whether the current user has staff-management permission to reveal PINs */
  canReveal: boolean;
  onGenerate: () => void;
  isGenerating?: boolean;
  disabled?: boolean;
  label?: string;
  buttonLabel?: string;
}

type RevealState = "hidden" | "loading" | "revealed" | "error";

export function StaffPinField({
  memberId,
  locationId,
  locationName,
  hasPin,
  canReveal,
  onGenerate,
  isGenerating = false,
  disabled = false,
  label = "PIN",
  buttonLabel,
}: StaffPinFieldProps) {
  const [revealState, setRevealState] = React.useState<RevealState>("hidden");
  const [pin, setPin] = React.useState<string | null>(null);
  const [countdown, setCountdown] = React.useState(AUTO_HIDE_SECONDS);
  const [showReauth, setShowReauth] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const countdownRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const effectiveButtonLabel =
    buttonLabel ?? (hasPin ? "Generate New PIN" : "Generate PIN");

  // Clear countdown timer on unmount
  React.useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  // Reset to hidden when memberId/locationId changes (different staff opened)
  React.useEffect(() => {
    hide();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId, locationId]);

  function hide() {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    setRevealState("hidden");
    setPin(null);
    setCountdown(AUTO_HIDE_SECONDS);
    setErrorMsg(null);
  }

  function startCountdown() {
    setCountdown(AUTO_HIDE_SECONDS);
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownRef.current!);
          countdownRef.current = null;
          hide();
          return AUTO_HIDE_SECONDS;
        }
        return prev - 1;
      });
    }, 1000);
  }

  async function fetchAndReveal() {
    setRevealState("loading");
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/staff/${memberId}/reveal-pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationId }),
      });

      if (res.status === 401) {
        const body = await res.json();
        if (body?.code === "REAUTH_REQUIRED") {
          // Cookie expired on server — force re-auth
          lastPinAuthAt = null;
          setRevealState("hidden");
          setShowReauth(true);
          return;
        }
        setRevealState("error");
        setErrorMsg("Session expired. Please refresh.");
        return;
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setRevealState("error");
        setErrorMsg(body?.error ?? "Failed to reveal PIN");
        return;
      }

      const { pin: fetchedPin } = await res.json();
      setPin(fetchedPin);
      setRevealState("revealed");
      startCountdown();
    } catch {
      setRevealState("error");
      setErrorMsg("Network error. Please try again.");
    }
  }

  function handleEyeClick() {
    if (revealState === "revealed") {
      hide();
      return;
    }
    if (revealState === "loading") return;

    const needsReauth =
      lastPinAuthAt === null ||
      Date.now() - lastPinAuthAt > REAUTH_TTL_MS;

    if (needsReauth) {
      setShowReauth(true);
    } else {
      fetchAndReveal();
    }
  }

  function handleReauthSuccess() {
    lastPinAuthAt = Date.now();
    fetchAndReveal();
  }

  // Display value
  const displayValue =
    revealState === "revealed" && pin ? pin : hasPin ? "••••" : "";

  const helperText =
    revealState === "error"
      ? errorMsg
      : revealState === "revealed"
        ? `Auto-hides in ${countdown}s · tap eye to hide`
        : canReveal && hasPin
          ? locationName
            ? `${locationName} · tap to reveal · auto-hides in ${AUTO_HIDE_SECONDS}s`
            : `Tap to reveal · auto-hides in ${AUTO_HIDE_SECONDS}s`
          : !hasPin
            ? "No PIN set yet. Generate one to enable POS login."
            : "Contact an admin to manage this PIN.";

  const showEyeButton = canReveal && hasPin;

  return (
    <>
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Input
              readOnly
              value={displayValue}
              placeholder={hasPin ? "••••" : "No PIN set"}
              className="pr-12 font-mono tracking-[0.35em]"
            />
            {showEyeButton && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                // Minimum 44×44px tap target per spec
                className="absolute right-1 top-1/2 h-11 w-11 -translate-y-1/2 touch-manipulation"
                onClick={handleEyeClick}
                disabled={revealState === "loading"}
                aria-label={
                  revealState === "revealed" ? "Hide PIN" : "Reveal PIN"
                }
              >
                {revealState === "loading" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : revealState === "revealed" ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            className="gap-2 sm:shrink-0"
            onClick={onGenerate}
            disabled={disabled || isGenerating}
          >
            {isGenerating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <KeyRound className="h-4 w-4" />
            )}
            {effectiveButtonLabel}
          </Button>
        </div>
        <p
          className={`text-xs ${
            revealState === "error"
              ? "text-destructive"
              : revealState === "revealed"
                ? "text-amber-600 dark:text-amber-400"
                : "text-muted-foreground"
          }`}
        >
          {helperText}
        </p>
      </div>

      <ReauthDialog
        open={showReauth}
        onOpenChange={setShowReauth}
        onSuccess={handleReauthSuccess}
      />
    </>
  );
}
