"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  refundAdminOrder,
  voidAdminOrder,
} from "@/app/manage/actions/admin-merchant/transactions";
import type { OrderResponse } from "@/types/order-management";

export type RefundVoidAction = "refund" | "void";

/**
 * Rises from below on open and drops back down on close, matching the order
 * details sheet. `alert-rise` is defined in globals.css alongside the other
 * panel animations — see the note there on why this can't be done with
 * tw-animate-css utilities or by overriding their CSS variables.
 */
const RISE_FROM_BOTTOM = "alert-rise";

const COPY: Record<
  RefundVoidAction,
  { title: string; description: string; confirm: string; className: string }
> = {
  refund: {
    title: "Confirm Refund",
    description:
      "Are you sure you want to refund this order? This will mark the order and all payments as refunded.",
    confirm: "Refund Order",
    className: "bg-amber-600 hover:bg-amber-700",
  },
  void: {
    title: "Confirm Void",
    description:
      "Are you sure you want to void this order? This will cancel any pending payments and invalidate the order.",
    confirm: "Void Order",
    className: "bg-red-600 hover:bg-red-700",
  },
};

/**
 * Refund / void confirmation, standalone so it can be opened directly from a
 * row action without routing through the receipt.
 *
 * It must be rendered as a SIBLING of any dialog it accompanies, never nested
 * inside one: an AlertDialog portals at the same layer as its parent Dialog, so
 * a nested one renders *underneath* that dialog's overlay and can't be clicked.
 */
export function RefundVoidDialog({
  order,
  action,
  open,
  onOpenChange,
  onCompleted,
}: {
  order: OrderResponse | null;
  action: RefundVoidAction;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fired after a successful refund/void so callers can refetch. */
  onCompleted?: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const copy = COPY[action];

  const handleConfirm = async (e: React.MouseEvent) => {
    // Keep the dialog mounted while the request is in flight so the spinner is
    // visible; we close it ourselves once the result is known.
    e.preventDefault();
    if (!order) return;

    setIsSubmitting(true);
    try {
      const result =
        action === "refund"
          ? await refundAdminOrder(order.merchant_id, order.id)
          : await voidAdminOrder(order.merchant_id, order.id);

      if (result.success) {
        toast.success(
          action === "refund"
            ? "Order refunded successfully"
            : "Order voided successfully"
        );
        onCompleted?.();
        onOpenChange(false);
      } else {
        toast.error(
          result.error ||
            (action === "refund"
              ? "Failed to refund order"
              : "Failed to void order")
        );
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        className={cn("rounded-[2rem] sm:rounded-[2rem]", RISE_FROM_BOTTOM)}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{copy.title}</AlertDialogTitle>
          <AlertDialogDescription>{copy.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSubmitting} className="rounded-full">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isSubmitting}
            className={`rounded-full ${copy.className}`}
          >
            {isSubmitting && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {copy.confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
