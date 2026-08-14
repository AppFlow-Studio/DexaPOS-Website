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
        <div className="-mx-2 overflow-x-auto px-2">
          <Table>
            <TableHeader>
              <TableRow className="border-border/60 hover:bg-transparent">
                <TableHead className="h-auto py-2.5 text-[0.8125rem] font-normal">Name</TableHead>
                <TableHead className="h-auto py-2.5 text-[0.8125rem] font-normal">Status</TableHead>
                <TableHead className="h-auto py-2.5 text-right text-[0.8125rem] font-normal">Items</TableHead>
                <TableHead className="h-auto py-2.5 text-[0.8125rem] font-normal">Assigned To</TableHead>
                <TableHead className="h-auto py-2.5 text-[0.8125rem] font-normal">Created</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {counts.map((count) => (
                <TableRow
                  key={count.id}
                  className="cursor-pointer border-border/60 last:border-0 hover:bg-muted/50"
                  onClick={() => openCount(count.id)}
                >
                  <TableCell className="font-medium">
                    {count.count_name}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="capitalize">
                      {count.status.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {count.items_count ?? 0}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {count.assigned_to_name ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {new Date(count.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
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
