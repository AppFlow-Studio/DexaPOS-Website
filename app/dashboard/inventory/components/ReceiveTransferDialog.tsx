"use client";

import { useEffect, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PackageCheck, Loader2, ArrowRightLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { TransferDetail } from "../../actions/transfers";

interface ReceiveTransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detail: TransferDetail | null | undefined;
  isLoading?: boolean;
  isPending?: boolean;
  onConfirm: (
    receivedItems: { inventory_item_id: string; quantity_received: number }[],
  ) => Promise<void>;
}

export function ReceiveTransferDialog({
  open,
  onOpenChange,
  detail,
  isLoading,
  isPending,
  onConfirm,
}: ReceiveTransferDialogProps) {
  const [received, setReceived] = useState<Record<string, number>>({});

  // Default every received quantity to the sent quantity when the detail loads.
  useEffect(() => {
    if (detail) {
      const init: Record<string, number> = {};
      for (const item of detail.items) {
        init[item.inventory_item_id] = item.quantity_sent;
      }
      setReceived(init);
    }
  }, [detail]);

  const items = detail?.items ?? [];
  const isValid =
    items.length > 0 &&
    items.every((i) => {
      const v = received[i.inventory_item_id];
      return v != null && v >= 0;
    });

  const handleSubmit = async () => {
    if (!isValid) return;
    await onConfirm(
      items.map((i) => ({
        inventory_item_id: i.inventory_item_id,
        quantity_received: received[i.inventory_item_id] ?? 0,
      })),
    );
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] p-0 gap-0 overflow-hidden">
        <DialogHeader className="space-y-0 border-b bg-gradient-to-br from-emerald-500/10 via-background to-background px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/15 ring-1 ring-emerald-500/20">
              <PackageCheck className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <DialogTitle className="text-lg">
                Receive Transfer {detail?.transfer.transfer_number ?? ""}
              </DialogTitle>
              <DialogDescription className="flex items-center gap-1.5">
                {detail?.transfer.from_location?.name ?? "Source"}
                <ArrowRightLeft className="h-3 w-3" />
                {detail?.transfer.to_location?.name ?? "Destination"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="max-h-[55vh] space-y-3 overflow-y-auto px-6 py-5">
          {isLoading ? (
            <>
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </>
          ) : (
            <>
              <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <span>Item</span>
                <span className="w-20 text-right">Sent</span>
                <span className="w-28 text-right">Received</span>
              </div>
              {items.map((item) => {
                const recv = received[item.inventory_item_id] ?? 0;
                const mismatch = recv !== item.quantity_sent;
                return (
                  <div
                    key={item.id}
                    className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-lg border px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {item.inventory_item?.name ?? "Unknown item"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.inventory_item?.category ?? "Uncategorized"}
                      </p>
                    </div>
                    <div className="w-20 text-right text-sm tabular-nums">
                      {item.quantity_sent}{" "}
                      <span className="text-xs text-muted-foreground">
                        {item.inventory_item?.unit_type ?? ""}
                      </span>
                    </div>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={recv}
                      onChange={(e) =>
                        setReceived((prev) => ({
                          ...prev,
                          [item.inventory_item_id]:
                            parseFloat(e.target.value) || 0,
                        }))
                      }
                      className={cn(
                        "h-9 w-28 text-right text-sm tabular-nums",
                        mismatch && "border-amber-500/60 text-amber-600",
                      )}
                    />
                  </div>
                );
              })}
              {items.some(
                (i) => received[i.inventory_item_id] !== i.quantity_sent,
              ) && (
                <Badge
                  variant="outline"
                  className="border-amber-500/50 bg-amber-50 text-amber-600 dark:bg-amber-950/30"
                >
                  Quantities differ from sent — discrepancies will be logged.
                </Badge>
              )}
            </>
          )}
        </div>

        <DialogFooter className="border-t bg-muted/30 px-6 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending || isLoading || !isValid}
            className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Confirm Receipt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
