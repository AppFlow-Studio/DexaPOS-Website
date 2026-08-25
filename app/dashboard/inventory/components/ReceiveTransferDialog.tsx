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
      <DialogContent className="flex h-[min(680px,calc(100dvh-1rem))] max-h-[90vh] flex-col gap-0 overflow-hidden bg-card p-0 sm:max-w-[560px]">
        <DialogHeader className="shrink-0 space-y-0 px-5 py-5 pr-14 sm:px-6 sm:pr-16">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/60">
              <PackageCheck className="h-4 w-4 text-muted-foreground" />
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

        <div className="thin-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4 sm:px-6">
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
                    className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 rounded-2xl border-0 bg-muted/50 px-3 py-2.5"
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
                  className="bg-muted/60 text-muted-foreground"
                >
                  Quantities differ from sent — discrepancies will be logged.
                </Badge>
              )}
            </>
          )}
        </div>

        <DialogFooter className="shrink-0 bg-card px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 sm:px-6">
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
            className="gap-2"
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Confirm Receipt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
