"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Trash2, MapPin, AlertCircle } from "lucide-react";
import { useWasteLogs, useLogWaste } from "../hooks/useWasteAndCounts";
import { LogWasteDialog, WastePickItem } from "./LogWasteDialog";
import { WasteReason } from "../../actions/waste";
import { StatRow, StatTile } from "@/components/dashboard/shell";

const REASON_LABELS: Record<WasteReason, string> = {
  spoilage: "Spoilage",
  overproduction: "Overproduction",
  spill: "Spill",
  damaged: "Damaged",
  expired: "Expired",
  theft: "Theft",
  other: "Other",
};

/** `waste_date` is a date-only string; parse as local time so the day never
 *  shifts backwards the way `new Date("2026-05-18")` (UTC) would. */
const formatWasteDate = (value: string) => {
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return value;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

interface WasteTabProps {
  items: WastePickItem[];
  isAllLocations: boolean;
}

export function WasteTab({ items, isAllLocations }: WasteTabProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { data: logs = [], isLoading } = useWasteLogs();
  const logWaste = useLogWaste();

  // Today's waste cost
  const todayISO = new Date().toISOString().slice(0, 10);
  const { todayCost, periodCost } = useMemo(() => {
    let today = 0;
    let total = 0;
    for (const log of logs) {
      total += log.estimated_cost ?? 0;
      if (log.waste_date === todayISO) today += log.estimated_cost ?? 0;
    }
    return { todayCost: today, periodCost: total };
  }, [logs, todayISO]);

  if (isAllLocations) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="p-3 rounded-full bg-muted mb-3">
          <MapPin className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="font-medium">Select a specific location</p>
        <p className="text-sm text-muted-foreground mt-1">
          Waste is tracked per location. Choose a location from the switcher to
          log and view waste.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6">
      {/* Summary + action */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <StatRow columns={2} className="flex-1">
          <StatTile label="Today’s waste" value={`$${todayCost.toFixed(2)}`} meta="Estimated cost today" />
          <StatTile label="Total logged" value={`$${periodCost.toFixed(2)}`} meta={`${logs.length} entries`} />
        </StatRow>
        <Button className="gap-2" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          Log Waste
        </Button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="p-3 rounded-full bg-muted mb-3">
            <Trash2 className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="font-medium">No waste logged yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Use &quot;Log Waste&quot; to record spoilage, spills, or other loss.
          </p>
        </div>
      ) : (
        <>
          {/* Wide-screen table */}
          <Table
            variant="data"
            containerClassName="hidden lg:block"
            className="min-w-[840px]"
          >
            <TableHeader className="[&_tr]:border-0">
              <TableRow className="hover:bg-transparent">
                <TableHead>Date</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Est. Cost</TableHead>
                <TableHead>Logged By</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {formatWasteDate(log.waste_date)}
                  </TableCell>
                  <TableCell className="font-medium">
                    {log.inventory_item?.name ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className="w-fit rounded-full border-0 px-2.5 text-xs font-medium"
                    >
                      {REASON_LABELS[log.reason] ?? log.reason}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {log.quantity} {log.inventory_item?.unit_type ?? ""}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    ${(log.estimated_cost ?? 0).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {log.logged_by_name ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate text-muted-foreground">
                    {log.notes ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Phones and tablets use cards instead of a horizontally scrolling table. */}
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
            {logs.map((log) => (
              <article
                key={log.id}
                className="min-w-0 rounded-2xl border-0 bg-muted/45 p-4"
              >
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {log.inventory_item?.name ?? "—"}
                    </p>
                    <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                      {formatWasteDate(log.waste_date)}
                    </p>
                  </div>
                  <Badge
                    variant="secondary"
                    className="shrink-0 rounded-full border-0 px-2.5 text-xs font-medium"
                  >
                    {REASON_LABELS[log.reason] ?? log.reason}
                  </Badge>
                </div>

                <div className="mt-5 grid min-w-0 grid-cols-2 gap-x-4 gap-y-4">
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Quantity
                    </p>
                    <p className="mt-0.5 break-words text-sm font-medium tabular-nums">
                      {log.quantity} {log.inventory_item?.unit_type ?? ""}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Est. Cost
                    </p>
                    <p className="mt-0.5 text-sm font-medium tabular-nums">
                      ${(log.estimated_cost ?? 0).toFixed(2)}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Logged By
                    </p>
                    <p className="mt-0.5 break-words text-sm font-medium leading-snug">
                      {log.logged_by_name ?? "—"}
                    </p>
                  </div>
                  {log.notes && (
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Notes
                      </p>
                      <p className="mt-0.5 break-words text-sm leading-snug text-muted-foreground">
                        {log.notes}
                      </p>
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {items.length === 0 && !isLoading && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <AlertCircle className="h-3.5 w-3.5" />
          Add inventory items in the Catalog tab before logging waste.
        </p>
      )}

      <LogWasteDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        items={items}
        isPending={logWaste.isPending}
        onConfirm={async (input) => {
          await logWaste.mutateAsync(input);
        }}
      />
    </div>
  );
}
