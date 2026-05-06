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
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
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
      <div
        role="status"
        aria-live="polite"
        className={cn(
          "sticky top-0 z-50 border-b-2 transition-colors",
          isUrgent
            ? "border-red-500 bg-gradient-to-r from-red-100 to-red-50 text-red-950 dark:border-red-700 dark:from-red-950/60 dark:to-red-900/30 dark:text-red-100"
            : "border-amber-500 bg-gradient-to-r from-amber-100 to-amber-50 text-amber-950 dark:border-amber-700 dark:from-amber-950/60 dark:to-amber-900/30 dark:text-amber-100",
        )}
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, rgba(0,0,0,0.025) 0 8px, transparent 8px 16px)",
        }}
      >
        <div className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center">
          {/* Identity cluster */}
          <div className="flex items-start gap-3 md:flex-1 min-w-0">
            <div
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-white shadow-sm",
                isUrgent ? "bg-red-600" : "bg-amber-600",
              )}
              aria-hidden
            >
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-sm md:text-base truncate">
                  Impersonating {merchant.merchantName}
                </span>
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="opacity-70 hover:opacity-100 transition-opacity"
                      aria-label="What does impersonation mean?"
                    >
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 text-xs space-y-2" align="start">
                    <p className="font-medium text-sm">About impersonation</p>
                    <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
                      <li>Every action you take is audit-logged under your HQ account.</li>
                      <li>RLS still applies — you only see what the merchant owner sees.</li>
                      <li>Refunds and voids remain POS-only and aren't available here.</li>
                      <li>The session auto-expires after 30 minutes of inactivity.</li>
                    </ul>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="text-xs opacity-80 truncate">
                Acting as{" "}
                <span className="font-medium">{hqUserName}</span>
                {hqRoleName && (
                  <span className="opacity-70"> · {hqRoleName}</span>
                )}
              </div>
            </div>
          </div>

          {/* Session metadata */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs opacity-90 md:border-l md:border-current/20 md:pl-4">
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 opacity-70" />
              <span>
                Started {formatRelative(merchant.startedAt, now)}
              </span>
            </div>
            <button
              type="button"
              onClick={handleCopySessionId}
              className="flex items-center gap-1 font-mono opacity-80 hover:opacity-100 transition-opacity"
              title="Copy full session ID"
            >
              <span>ID: {merchant.sessionId.slice(0, 8)}…</span>
              {copied ? (
                <Check className="h-3 w-3" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </button>
            {merchant.reason && (
              <div className="italic opacity-80 truncate max-w-[28ch]" title={merchant.reason}>
                “{merchant.reason}”
              </div>
            )}
          </div>

          {/* Countdown + exit */}
          <div className="flex items-center gap-3 md:border-l md:border-current/20 md:pl-4">
            <div className="text-right leading-tight">
              <div className="text-[10px] uppercase tracking-wide opacity-70">
                Auto-exits in
              </div>
              <div
                className={cn(
                  "tabular-nums font-semibold text-lg",
                  isUrgent && "animate-pulse text-red-700 dark:text-red-300",
                )}
              >
                {formatRemaining(remainingMs)}
              </div>
            </div>
            <Button
              size="sm"
              disabled={showOverlay}
              onClick={() => handleExit("user_exit")}
              className={cn(
                "shadow-sm",
                isUrgent
                  ? "bg-red-600 hover:bg-red-700 text-white"
                  : "bg-amber-600 hover:bg-amber-700 text-white",
              )}
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
          <div className="flex flex-col items-center gap-3 rounded-lg border bg-card px-6 py-5 shadow-lg">
            <Loader2 className="h-6 w-6 animate-spin text-amber-600" />
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
