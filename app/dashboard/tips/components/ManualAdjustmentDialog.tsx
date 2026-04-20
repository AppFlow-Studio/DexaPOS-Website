"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { TipDetailWithStaff } from "@/app/dashboard/actions/tips";

interface ManualAdjustmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detail: TipDetailWithStaff | null;
  onSubmit: (detailId: string, amount: number, reason: string) => void;
  isLoading?: boolean;
}

export function ManualAdjustmentDialog({
  open,
  onOpenChange,
  detail,
  onSubmit,
  isLoading,
}: ManualAdjustmentDialogProps) {
  const [amount, setAmount] = useState<string>("");
  const [reason, setReason] = useState<string>("");

  // Pre-fill with current adjustment when dialog opens
  useEffect(() => {
    if (open && detail) {
      const currentAdj = detail.manual_adjustment;
      setAmount(currentAdj !== 0 ? currentAdj.toString() : "");
      setReason("");
    } else if (!open) {
      setAmount("");
      setReason("");
    }
  }, [open, detail]);

  const handleSubmit = () => {
    if (!detail) return;
    onSubmit(detail.id, parseFloat(amount) || 0, reason);
    onOpenChange(false);
  };

  const isValid = amount !== "" && !isNaN(parseFloat(amount));

  const previewNetTips = detail
    ? (
        detail.individual_tips_earned -
        detail.tip_pool_contributed +
        detail.tip_pool_received -
        detail.tip_out_given +
        detail.tip_out_received +
        (parseFloat(amount) || 0)
      ).toFixed(2)
    : "0.00";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust Tips</DialogTitle>
          <DialogDescription>
            {detail && (
              <>
                Adjusting tips for{" "}
                <span className="font-semibold">
                  {detail.staff_profiles.display_name ||
                    `${detail.staff_profiles.first_name} ${detail.staff_profiles.last_name}`}
                </span>
                {" "}({detail.role_code})
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {detail && (
            <div className="grid grid-cols-2 gap-4 p-3 bg-muted/50 rounded">
              <div>
                <p className="text-xs text-muted-foreground">Current Net Tips</p>
                <p className="font-semibold text-base">
                  ${detail.net_tips.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Preview Net Tips</p>
                <p className="font-semibold text-base text-primary">
                  ${previewNetTips}
                </p>
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="amount">Adjustment Amount ($)</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Positive adds tips, negative reduces them. This replaces any existing adjustment.
            </p>
          </div>

          <div>
            <Label htmlFor="reason">Reason</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Correcting duplicate tip entry, Refund"
              className="mt-1"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || isLoading}>
            {isLoading ? "Saving..." : "Save Adjustment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
