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
import { cn } from "@/lib/utils";
import {
  useInventoryCounts,
  useCreateInventoryCount,
} from "../hooks/useWasteAndCounts";
import { CreateCountDialog, CountPickItem } from "./CreateCountDialog";
import { CountDetailSheet } from "./CountDetailSheet";
import { CountStatus } from "../../actions/inventory-counts";

const STATUS_BADGE: Record<CountStatus, string> = {
  draft: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  in_progress:
    "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  completed: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  approved:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
};

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
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
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
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
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
                      className={cn("capitalize", STATUS_BADGE[count.status])}
                    >
                      {count.status.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
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
