"use client";

import * as React from "react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MoreVertical, Copy } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UpdateMenuItem } from "@/app/dashboard/actions/menu-items";
import {
  useIsAllLocations,
  useLocationStore,
} from "@/stores/location-store";

interface ItemQuickActionsProps {
  itemId: string;
  item: any;
}

export function ItemQuickActions({ itemId, item }: ItemQuickActionsProps) {
  const queryClient = useQueryClient();
  const isAllLocations = useIsAllLocations();
  const { selectedLocationId } = useLocationStore();

  const availability = item?.location_is_available ?? item?.availability ?? true;

  const toggleAvailability = useMutation({
    mutationFn: async (next: boolean) => {
      const res = await UpdateMenuItem(
        itemId,
        { availability: next },
        isAllLocations ? undefined : selectedLocationId,
      );
      if (res.error) throw new Error(res.error);
      return res;
    },
    onMutate: () => {
      // optimistic - toast after success
    },
    onSuccess: () => {
      toast.success("Availability updated");
      queryClient.invalidateQueries({ queryKey: ["menu-item", itemId] });
      queryClient.invalidateQueries({ queryKey: ["menu-items"] });
    },
    onError: (err) =>
      toast.error("Update failed", {
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2">
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-lg font-bold leading-tight">
          {item?.name ?? "Untitled item"}
        </h2>
      </div>
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-xs">
          <Switch
            checked={!!availability}
            onCheckedChange={(v) => toggleAvailability.mutate(v)}
          />
          <span>Available</span>
        </label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() =>
                toast.info("Duplicate coming soon", {
                  description: "Item duplication is not yet implemented.",
                })
              }
            >
              <Copy className="mr-2 h-3.5 w-3.5" /> Duplicate
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export default ItemQuickActions;
