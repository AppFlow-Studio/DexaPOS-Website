"use client";

import { useState, useTransition } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Eye, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAdminAuth } from "@/lib/hooks/useAdminAuth";
import { useAdminMerchantAccess } from "@/app/manage/hooks/useAdminMerchantAccess";
import { startImpersonation } from "@/lib/admin/impersonation";

// =============================================================================
// ImpersonateMerchantButton — opens a reason dialog and starts an HQ session.
// =============================================================================
// Visibility:
//   * Hidden unless current user is HQ at platform_admin (level 8) or higher.
//   * Hidden for hq.manager (level 5) unless they have an active
//     admin_merchant_access row for this specific merchant. The SQL gate
//     hq_can_impersonate_merchant is the security boundary; this is the UX
//     mirror so users without permission don't see a button that errors.
// =============================================================================

const REASON_MAX = 200;

interface Props {
  merchantId: string;
  merchantName: string;
  /** Visual variant; "card" stops propagation so a card-level click handler doesn't fire. */
  variant?: "card" | "page";
}

export function ImpersonateMerchantButton({
  merchantId,
  merchantName,
  variant = "page",
}: Props) {
  const { userId } = useAuth();
  const { role, isSuperAdmin } = useAdminAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const [isNavigating, setIsNavigating] = useState(false);

  // Super admins can impersonate every merchant unconditionally — they
  // bypass admin_merchant_access at the SQL layer too. Other HQ tiers need
  // an explicit grant (the SQL gate hq_can_impersonate_merchant enforces
  // the same rule; this is the UX mirror).
  const { data: access } = useAdminMerchantAccess(
    !isSuperAdmin ? userId ?? "" : "",
  );
  const hasMerchantGrant =
    isSuperAdmin || !!access?.some((a) => a.merchantId === merchantId);

  const isVisible = !!role && (isSuperAdmin || role.level >= 8) && hasMerchantGrant;

  if (!isVisible) return null;

  const handleStart = () => {
    startTransition(async () => {
      // Cancel anything in flight under the HQ context first; we're about to
      // flip the world to a different merchant.
      await queryClient.cancelQueries();
      queryClient.removeQueries();

      const trimmed = reason.trim();
      const result = await startImpersonation(
        merchantId,
        trimmed.length > 0 ? trimmed : undefined,
      );

      if (result.error || !result.context) {
        toast.error(result.error ?? "Failed to start impersonation");
        return;
      }

      // Hard navigate so Clerk session, RSC payloads, and every Zustand store
      // start fresh under the impersonation cookies. The dashboard's
      // ImpersonationHydrator will repopulate the client store on mount.
      setIsNavigating(true);
      window.location.assign("/dashboard");
    });
  };

  const showOverlay = isPending || isNavigating;

  const handleClick = (e: React.MouseEvent) => {
    if (variant === "card") e.stopPropagation();
    setOpen(true);
  };

  return (
    <>
      <Button
        variant="outline"
        size={variant === "card" ? "sm" : "default"}
        onClick={handleClick}
        className="gap-1.5"
      >
        <Eye className="h-4 w-4" />
        View as merchant
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-md"
          onClick={(e) => e.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle>View as {merchantName}?</DialogTitle>
            <DialogDescription>
              You will navigate the merchant&apos;s dashboard as if you were
              them. Every action is audit-logged under your HQ account and
              flagged as impersonation. Session expires after 24 hours of
              inactivity.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="impersonation-reason">
              Reason (optional, helps support reviews)
            </Label>
            <Textarea
              id="impersonation-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, REASON_MAX))}
              placeholder="e.g. debugging order #1234 reported by owner"
              rows={3}
            />
            <p className="text-xs text-muted-foreground text-right tabular-nums">
              {reason.length}/{REASON_MAX}
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={showOverlay}
            >
              Cancel
            </Button>
            <Button onClick={handleStart} disabled={showOverlay}>
              {showOverlay ? "Starting…" : "Start session"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showOverlay && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-background/70 backdrop-blur-sm"
          aria-live="polite"
          role="status"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col items-center gap-3 rounded-lg border bg-card px-6 py-5 shadow-lg">
            <Loader2 className="h-6 w-6 animate-spin text-amber-600" />
            <div className="text-sm font-medium">
              Switching to {merchantName}…
            </div>
            <div className="text-xs text-muted-foreground">
              Loading merchant dashboard
            </div>
          </div>
        </div>
      )}
    </>
  );
}
