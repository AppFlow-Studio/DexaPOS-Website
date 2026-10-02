"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ShieldAlert,
  X,
  Info,
  Copy,
  Check,
  Clock,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  useImpersonatedMerchant,
  useImpersonationStore,
} from "@/stores/impersonation-store";
import { endImpersonation } from "@/lib/admin/impersonation";
import { IMPERSONATION_TTL_HOURS } from "@/lib/admin/impersonation-config";
import { useUserInfo } from "@/app/manage/hooks/useUserInfo.";
import { useAdminAuth } from "@/lib/hooks/useAdminAuth";
import { cn } from "@/lib/utils";

// =============================================================================
// ImpersonationBanner — sticky, high-visibility warning while HQ is acting
// as a merchant. Shows merchant + HQ admin identity, session metadata,
// countdown to auto-expiry, and a prominent exit button. On exit (manual or
// idle timeout) we cancel + remove all React Query data, dismiss toasts,
// then HARD-RELOAD to /manage/merchants so the admin shell rehydrates from
// scratch (Clerk session, RSC, stores) — avoids the "had to refresh" bug
// where useUserInfo / admin permissions stayed pinned to the synthesized
// merchant.owner membership.
// =============================================================================

const FIVE_MIN_MS = 5 * 60 * 1000;

function formatRemaining(ms: number): string {
  if (ms <= 0) return "0:00";
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = m.toString().padStart(2, "0");
  const ss = s.toString().padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

function formatRelative(fromIso: string, now: number): string {
  const diff = Math.max(0, now - new Date(fromIso).getTime());
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  return `${hr} hr ago`;
}

export function ImpersonationBanner() {
  const merchant = useImpersonatedMerchant();
  const clearImpersonation = useImpersonationStore((s) => s.clearImpersonation);
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const [isNavigating, setIsNavigating] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState(false);

  const { data: userInfo } = useUserInfo();
  const { role } = useAdminAuth();

  // Live countdown — updates every second while impersonating.
  useEffect(() => {
    if (!merchant) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [merchant]);

  const remainingMs = useMemo(() => {
    if (!merchant) return 0;
    return new Date(merchant.expiresAt).getTime() - now;
  }, [merchant, now]);

  const isUrgent = remainingMs > 0 && remainingMs < FIVE_MIN_MS;

  const handleExit = (
    reason: "user_exit" | "idle_timeout" = "user_exit",
  ) => {
    startTransition(async () => {
      try {
        await queryClient.cancelQueries();
        queryClient.removeQueries();
        toast.dismiss();
        await endImpersonation(reason);
        clearImpersonation();
        // Hard reload so the admin layout re-fetches user info, permissions,
        // and RSC payloads from scratch under the cleared cookies.
        setIsNavigating(true);
        if (reason === "idle_timeout") {
          toast.success("Impersonation session expired");
        }
        window.location.assign("/manage/merchants");
      } catch {
        toast.error("Could not cleanly end impersonation; try again.");
      }
    });
  };

  // Auto-exit when the countdown hits zero.
  useEffect(() => {
    if (!merchant) return;
    if (remainingMs <= 0) handleExit("idle_timeout");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingMs <= 0, merchant?.sessionId]);

  const handleCopySessionId = async () => {
    if (!merchant) return;
    try {
      await navigator.clipboard.writeText(merchant.sessionId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy session ID");
    }
  };

  if (!merchant) return null;

  // userInfo may be `Error | null | undefined` in failure cases; only read names
  // off of it when it looks like the success shape.
  const hqUser =
    userInfo && typeof userInfo === "object" && "name" in userInfo
      ? (userInfo as { name?: string; email?: string })
      : null;
  const hqUserName = hqUser?.name || hqUser?.email || "HQ admin";
  const hqRoleName = role?.role_name ?? null;

  const showOverlay = isPending || isNavigating;

  return (
    <>
      {/* Neutral by design (UI-DESIGN-SYSTEM §3.5): the words "Impersonating …"
          carry the warning, and a change of surface (opaque `bg-muted`, which the
          onboarding layout needs because the window scrolls under it) separates
          it from the page — no coloured border or rule (§5.5). The one colour is
          the countdown figure in its last five minutes, a real alarm. */}
      <div
        role="status"
        aria-live="polite"
        className="sticky top-0 z-50 bg-muted text-foreground"
      >
        <div className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:gap-6">
          {/* Identity cluster */}
          <div className="flex items-start gap-3 md:flex-1 min-w-0">
            <ShieldAlert
              className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-sm md:text-base truncate">
                  Impersonating {merchant.merchantName}
                </span>
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
                      aria-label="What does impersonation mean?"
                    >
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 rounded-2xl text-xs space-y-2" align="start">
                    <p className="font-medium text-sm">About impersonation</p>
                    <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
                      <li>Every action you take is audit-logged under your HQ account.</li>
                      <li>RLS still applies — you only see what the merchant owner sees.</li>
                      <li>Refunds and voids remain POS-only and aren't available here.</li>
                      <li>The session auto-expires after {IMPERSONATION_TTL_HOURS} hours of inactivity.</li>
                    </ul>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="text-xs text-muted-foreground truncate">
                Acting as{" "}
                <span className="font-medium text-foreground">{hqUserName}</span>
                {hqRoleName && <span> · {hqRoleName}</span>}
              </div>
            </div>
          </div>

          {/* Session metadata — spacing, not a rule, separates the clusters (§5.5). */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" aria-hidden />
              <span>
                Started {formatRelative(merchant.startedAt, now)}
              </span>
            </div>
            <button
              type="button"
              onClick={handleCopySessionId}
              className="flex items-center gap-1 font-mono transition-colors hover:text-foreground"
              title="Copy full session ID"
              aria-label={copied ? "Session ID copied" : "Copy session ID"}
            >
              <span>ID: {merchant.sessionId.slice(0, 8)}…</span>
              {copied ? (
                <Check className="h-3 w-3" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </button>
            {merchant.reason && (
              <div className="italic truncate max-w-[28ch]" title={merchant.reason}>
                “{merchant.reason}”
              </div>
            )}
          </div>

          {/* Countdown + exit */}
          <div className="flex items-center gap-3">
            <div className="text-right leading-tight">
              <div className="text-xs text-muted-foreground">
                Auto-exits in
              </div>
              {/* A real alarm (§3.5, use 4): the figure alone turns red in the
                  last five minutes; the label above says what it means. */}
              <div
                className={cn(
                  "tabular-nums font-semibold text-lg",
                  isUrgent && "text-red-600 dark:text-red-400",
                )}
              >
                {formatRemaining(remainingMs)}
              </div>
            </div>
            <Button
              variant="outline"
              disabled={showOverlay}
              onClick={() => handleExit("user_exit")}
              className="h-11 px-4 sm:h-9"
            >
              <X className="h-3.5 w-3.5 mr-1" />
              Exit
            </Button>
          </div>
        </div>
      </div>

      {showOverlay && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-background/70 backdrop-blur-sm"
          aria-live="polite"
          role="status"
        >
          <div className="flex flex-col items-center gap-3 rounded-3xl border bg-card px-6 py-5">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <div className="text-sm font-medium">Returning to admin…</div>
            <div className="text-xs text-muted-foreground">
              Closing impersonation session
            </div>
          </div>
        </div>
      )}
    </>
  );
}
