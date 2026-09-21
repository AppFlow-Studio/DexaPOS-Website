"use client";

import * as React from "react";
import { Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { useReverification } from "@clerk/nextjs";
import { isReverificationCancelledError } from "@clerk/nextjs/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
  /** Whether the current user has staff-management permission to generate/reset PINs */
  canManage?: boolean;
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
  canManage = true,
  onGenerate,
  isGenerating = false,
  disabled = false,
  label = "PIN",
  buttonLabel,
}: StaffPinFieldProps) {
  const [revealState, setRevealState] = React.useState<RevealState>("hidden");
  const [pin, setPin] = React.useState<string | null>(null);
  const [countdown, setCountdown] = React.useState(AUTO_HIDE_SECONDS);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const countdownRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  // Enhanced fetcher: if the reveal endpoint returns a Clerk reverification hint
  // (stale first-factor verification), Clerk pops its own step-up modal — password
  // for password users, email code for SSO/OAuth users — then retries automatically.
  const revealPin = useReverification(async () => {
    const res = await fetch(`/api/staff/${memberId}/reveal-pin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locationId }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) return body as { pin: string; expiresAt: string };
    // Reverification hint → return as-is so useReverification intercepts + retries.
    if (body?.clerk_error) return body;
    throw Object.assign(new Error(body?.error ?? "Failed to reveal PIN"), {
      status: res.status,
    });
  });

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
      // Clerk handles any required step-up reverification inside revealPin().
      const { pin: fetchedPin } = await revealPin();
      setPin(fetchedPin);
      setRevealState("revealed");
      startCountdown();
    } catch (err) {
      // User closed the reverification modal — quietly return to hidden.
      if (isReverificationCancelledError(err)) {
        setRevealState("hidden");
        return;
      }
      setRevealState("error");
      setErrorMsg(
        err instanceof Error ? err.message : "Failed to reveal PIN",
      );
    }
  }

  function handleEyeClick() {
    if (revealState === "revealed") {
      hide();
      return;
    }
    if (revealState === "loading") return;
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
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                {/* span needed so Tooltip works on a disabled button */}
                <span className="sm:shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2 w-full"
                    onClick={onGenerate}
                    disabled={disabled || isGenerating || !canManage}
                  >
                    {isGenerating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <KeyRound className="h-4 w-4" />
                    )}
                    {effectiveButtonLabel}
                  </Button>
                </span>
              </TooltipTrigger>
              {!canManage && (
                <TooltipContent side="top">
                  You don&apos;t have permission to manage staff
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
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
    </>
  );
}
