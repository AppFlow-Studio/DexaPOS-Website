"use client";

import { useState } from "react";
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
import { Plus, ClipboardList, MapPin, ChevronRight } from "lucide-react";
import {
  useInventoryCounts,
  useCreateInventoryCount,
} from "../hooks/useWasteAndCounts";
import { CreateCountDialog, CountPickItem } from "./CreateCountDialog";
import { CountDetailSheet } from "./CountDetailSheet";

interface CountsTabProps {
  items: CountPickItem[];
  isAllLocations: boolean;
}

export function CountsTab({ items, isAllLocations }: CountsTabProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedCountId, setSelectedCountId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const { data: counts = [], isLoading } = useInventoryCounts();
  const createCount = useCreateInventoryCount();

  const openCount = (id: string) => {
    setSelectedCountId(id);
    setSheetOpen(true);
  };

  if (isAllLocations) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="p-3 rounded-full bg-muted mb-3">
          <MapPin className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="font-medium">Select a specific location</p>
        <p className="text-sm text-muted-foreground mt-1">
          Counts are scoped to a location. Choose a location from the switcher
          to create and review count sheets.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {counts.length} count {counts.length === 1 ? "session" : "sessions"}
          </p>
        </div>
        <Button className="gap-2" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          New Count
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : counts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="p-3 rounded-full bg-muted mb-3">
            <ClipboardList className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="font-medium">No counts yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Create a count sheet to do a physical inventory check.
          </p>
        </div>
      ) : (
        <>
          {/* Wide-screen table */}
          <Table
            variant="data"
            containerClassName="hidden lg:block"
            className="min-w-[760px]"
          >
            <TableHeader className="[&_tr]:border-0">
              <TableRow className="hover:bg-transparent">
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead>Assigned To</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {counts.map((count) => (
                <TableRow
                  key={count.id}
                  className="cursor-pointer"
                  onClick={() => openCount(count.id)}
                >
                  <TableCell className="font-medium">
                    {count.count_name}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className="w-fit rounded-full border-0 px-2.5 text-xs font-medium capitalize"
                    >
                      {count.status.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {count.items_count ?? 0}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {count.assigned_to_name ?? "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                    {new Date(count.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Phones and tablets use cards instead of a horizontally scrolling table. */}
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
            {counts.map((count) => (
              <button
                key={count.id}
                type="button"
                onClick={() => openCount(count.id)}
                className="min-w-0 rounded-2xl border-0 bg-muted/45 p-4 text-left transition-colors hover:bg-muted/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {count.count_name}
                    </p>
                    <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                      {new Date(count.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge
                    variant="secondary"
                    className="shrink-0 rounded-full border-0 px-2.5 text-xs font-medium capitalize"
                  >
                    {count.status.replace("_", " ")}
                  </Badge>
                </div>

                <div className="mt-5 grid min-w-0 grid-cols-2 gap-x-4 gap-y-4">
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Items
                    </p>
                    <p className="mt-0.5 text-sm font-medium tabular-nums">
                      {count.items_count ?? 0}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Assigned To
                    </p>
                    <p className="mt-0.5 break-words text-sm font-medium leading-snug">
                      {count.assigned_to_name ?? "—"}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      <CreateCountDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        items={items}
        isPending={createCount.isPending}
        onConfirm={async (input) => {
          const res = await createCount.mutateAsync(input);
          if (res?.countId) openCount(res.countId);
        }}
      />

      <CountDetailSheet
        countId={selectedCountId}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </div>
  );
}
