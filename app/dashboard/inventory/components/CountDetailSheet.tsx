"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useCountDetail,
  useSubmitInventoryCount,
  useApproveInventoryCount,
} from "../hooks/useWasteAndCounts";
import { CountStatus } from "../../actions/inventory-counts";

const STATUS_BADGE: Record<CountStatus, string> = {
  draft: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  in_progress:
    "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  completed: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  approved:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
};

interface CountDetailSheetProps {
  countId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CountDetailSheet({
  countId,
  open,
  onOpenChange,
}: CountDetailSheetProps) {
  const { data: detail, isLoading } = useCountDetail(countId);
  const submitCount = useSubmitInventoryCount();
  const approveCount = useApproveInventoryCount();

  const [counts, setCounts] = useState<Record<string, string>>({});
  const [applyAdjustments, setApplyAdjustments] = useState(true);
  const [blindCount, setBlindCount] = useState(false);

  const status = detail?.count.status;
  const isEditable = status === "draft" || status === "in_progress";

  // Seed inputs from any previously counted quantities
  useEffect(() => {
    if (!detail) return;
    const seed: Record<string, string> = {};
    for (const item of detail.items) {
      seed[item.inventory_item_id] =
        item.counted_quantity != null ? String(item.counted_quantity) : "";
    }
    setCounts(seed);
  }, [detail]);

  const countedItems = useMemo(() => {
    return Object.entries(counts)
      .filter(([, v]) => v.trim() !== "" && !Number.isNaN(parseFloat(v)))
      .map(([inventory_item_id, v]) => ({
        inventory_item_id,
        counted_quantity: parseFloat(v),
      }));
  }, [counts]);

  const handleSubmit = async () => {
    if (!countId || countedItems.length === 0) return;
    await submitCount.mutateAsync({
      countId,
      countedItems,
      applyAdjustments,
    });
  };

  const handleApprove = async () => {
    if (!countId) return;
    await approveCount.mutateAsync(countId);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-dvh w-full max-w-none flex-col gap-0 overflow-hidden max-sm:overflow-hidden rounded-none bg-card p-0 max-sm:h-auto max-sm:top-auto max-sm:translate-y-0 sm:h-[min(760px,calc(100dvh-2rem))] sm:max-h-[90vh] sm:w-[calc(100%-1rem)] sm:max-w-2xl sm:rounded-3xl">
        <DialogHeader className="shrink-0 bg-card px-5 pb-4 pt-5 pr-14 text-left sm:px-6 sm:pt-6 sm:pr-16">
          <DialogTitle className="flex items-center gap-2">
            {detail?.count.count_name ?? "Inventory Count"}
            {status && (
              <Badge
                className={cn("capitalize", STATUS_BADGE[status])}
                variant="secondary"
              >
                {status.replace("_", " ")}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {detail?.count.assigned_to_name
              ? `Assigned to ${detail.count.assigned_to_name}`
              : "Enter the physical counted quantity for each item."}
          </DialogDescription>
        </DialogHeader>

        {isLoading || !detail ? (
          <div className="space-y-2 bg-card px-5 pb-6 sm:px-6">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <>
            {/* Controls */}
            <div className="flex shrink-0 items-center justify-between bg-card px-5 py-2 sm:px-6">
              <span className="text-sm text-muted-foreground">
                {detail.items.length} items
              </span>
              <button
                type="button"
                onClick={() => setBlindCount((b) => !b)}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
              >
                {blindCount ? (
                  <>
                    <EyeOff className="h-4 w-4" /> Expected hidden
                  </>
                ) : (
                  <>
                    <Eye className="h-4 w-4" /> Expected shown
                  </>
                )}
              </button>
            </div>

            {/* Items table */}
            <div className="min-h-0 flex-1 overflow-y-auto bg-card px-5 sm:px-6">
              <Table>
                <TableHeader className="sticky top-0 bg-card [&_tr]:border-0">
                  <TableRow className="border-0">
                    <TableHead>Item</TableHead>
                    {!blindCount && (
                      <TableHead className="text-right">Expected</TableHead>
                    )}
                    <TableHead className="text-right w-32">Counted</TableHead>
                    <TableHead className="text-right">Variance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="[&_tr]:border-0">
                  {detail.items.map((item) => {
                    const raw = counts[item.inventory_item_id] ?? "";
                    const counted =
                      raw.trim() === "" ? null : parseFloat(raw);
                    const variance =
                      counted != null
                        ? counted - item.expected_quantity
                        : null;
                    return (
                      <TableRow key={item.id} className="border-0">
                        <TableCell>
                          <div className="font-medium">
                            {item.inventory_item?.name ?? "—"}
                          </div>
                          {item.inventory_item?.category && (
                            <div className="text-xs text-muted-foreground">
                              {item.inventory_item.category}
                            </div>
                          )}
                        </TableCell>
                        {!blindCount && (
                          <TableCell className="text-right text-muted-foreground">
                            {item.expected_quantity}{" "}
                            {item.inventory_item?.unit_type ?? ""}
                          </TableCell>
                        )}
                        <TableCell className="text-right">
                          {isEditable ? (
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={raw}
                              placeholder="—"
                              onChange={(e) =>
                                setCounts((prev) => ({
                                  ...prev,
                                  [item.inventory_item_id]: e.target.value,
                                }))
                              }
                              className="h-8 text-right"
                            />
                          ) : (
                            <span>
                              {item.counted_quantity ?? "—"}
                            </span>
                          )}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right font-medium",
                            variance == null
                              ? "text-muted-foreground"
                              : variance === 0
                                ? "text-emerald-600"
                                : variance > 0
                                  ? "text-blue-600"
                                  : "text-red-600",
                          )}
                        >
                          {variance == null
                            ? "—"
                            : `${variance > 0 ? "+" : ""}${variance.toFixed(2)}`}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Footer actions */}
            <div className="shrink-0 space-y-3 bg-card px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-6">
              {isEditable && (
                <>
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="apply-adj"
                      className="text-sm font-normal cursor-pointer"
                    >
                      Adjust stock to match counted quantities
                    </Label>
                    <Switch
                      id="apply-adj"
                      checked={applyAdjustments}
                      onCheckedChange={setApplyAdjustments}
                    />
                  </div>
                  <Button
                    className="w-full gap-2"
                    disabled={
                      submitCount.isPending || countedItems.length === 0
                    }
                    onClick={handleSubmit}
                  >
                    {submitCount.isPending && (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    )}
                    Submit Count ({countedItems.length} entered)
                  </Button>
                </>
              )}

              {status === "completed" && (
                <Button
                  className="w-full gap-2"
                  disabled={approveCount.isPending}
                  onClick={handleApprove}
                >
                  {approveCount.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  Approve Count
                </Button>
              )}

              {status === "approved" && (
                <p className="text-center text-sm text-emerald-600 flex items-center justify-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4" />
                  Approved
                  {detail.count.approved_by_name
                    ? ` by ${detail.count.approved_by_name}`
                    : ""}
                </p>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
