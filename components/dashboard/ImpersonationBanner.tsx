"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShieldAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useImpersonatedMerchant,
  useImpersonationStore,
} from "@/stores/impersonation-store";
import { endImpersonation } from "@/lib/admin/impersonation";

// =============================================================================
// ImpersonationBanner — sticky top warning while HQ is acting as a merchant.
// =============================================================================
// Shows merchant name, a live countdown to the 30-min sliding TTL, and an
// Exit button. On exit OR auto-expire we cancel + remove all React Query
// data (stale cached merchant data must not bleed back into /manage), clear
// pending toasts (stale onSuccess banners would otherwise pop on /manage),
// then route back to the merchants list.
// =============================================================================

function formatRemaining(ms: number): string {
  if (ms <= 0) return "0:00";
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function ImpersonationBanner() {
  const merchant = useImpersonatedMerchant();
  const clearImpersonation = useImpersonationStore((s) => s.clearImpersonation);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const [now, setNow] = useState(() => Date.now());

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

  const handleExit = (
    reason: "user_exit" | "idle_timeout" = "user_exit",
  ) => {
    startTransition(async () => {
      try {
        // 1. Stop in-flight queries from completing under the wrong context.
        await queryClient.cancelQueries();
        // 2. Drop cached merchant data so /manage doesn't re-render it.
        queryClient.removeQueries();
        // 3. Clear stale pending toasts.
        toast.dismiss();
        // 4. Tell the server to close the session + clear cookies.
        await endImpersonation(reason);
        // 5. Sync the client store.
        clearImpersonation();
        // 6. Land back on the merchants list.
        router.push("/manage/merchants");
        toast.success(
          reason === "idle_timeout"
            ? "Impersonation session expired"
            : "Exited impersonation",
        );
      } catch (e) {
        // Even on failure, leave the banner — server will re-deny on next
        // action. Surface the error so the user knows.
        toast.error("Could not cleanly end impersonation; try again.");
      }
    });
  };

  // Auto-exit when the countdown hits zero. Server will also end the session
  // on the next touch — this just keeps the UI honest.
  useEffect(() => {
    if (!merchant) return;
    if (remainingMs <= 0) handleExit("idle_timeout");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingMs <= 0, merchant?.sessionId]);

  if (!merchant) return null;

  return (
    <div className="sticky top-0 z-50 border-b border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200">
      <div className="flex items-center gap-3 px-4 py-2 text-sm">
        <ShieldAlert className="h-4 w-4 shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="font-medium">
            Viewing as {merchant.merchantName}
          </span>
          <span className="hidden md:inline">
            {" "}— actions are logged under your HQ account. Session expires in{" "}
            <span className="tabular-nums font-medium">
              {formatRemaining(remainingMs)}
            </span>
            .
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="border-amber-400 bg-amber-100 hover:bg-amber-200 dark:border-amber-700 dark:bg-amber-900/40 dark:hover:bg-amber-900/60 text-amber-900 dark:text-amber-100"
          disabled={isPending}
          onClick={() => handleExit("user_exit")}
        >
          <X className="h-3.5 w-3.5 mr-1" />
          Exit impersonation
        </Button>
      </div>
    </div>
  );
}
