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

const REASON_LABELS: Record<WasteReason, string> = {
  spoilage: "Spoilage",
  overproduction: "Overproduction",
  spill: "Spill",
  damaged: "Damaged",
  expired: "Expired",
  theft: "Theft",
  other: "Other",
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
    <div className="p-6 space-y-6">
      {/* Summary + action */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-4">
          <div className="rounded-xl border bg-card px-5 py-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              Today&apos;s Waste
            </p>
            <p className="text-2xl font-bold text-red-600">
              ${todayCost.toFixed(2)}
            </p>
          </div>
          <div className="rounded-xl border bg-card px-5 py-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              Total Logged ({logs.length})
            </p>
            <p className="text-2xl font-bold">${periodCost.toFixed(2)}</p>
          </div>
        </div>
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
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
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
                  <TableCell className="whitespace-nowrap">
                    {log.waste_date}
                  </TableCell>
                  <TableCell className="font-medium">
                    {log.inventory_item?.name ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {REASON_LABELS[log.reason] ?? log.reason}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {log.quantity} {log.inventory_item?.unit_type ?? ""}
                  </TableCell>
                  <TableCell className="text-right font-medium text-red-600">
                    ${(log.estimated_cost ?? 0).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {log.logged_by_name ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate text-muted-foreground">
                    {log.notes ?? ""}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
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
