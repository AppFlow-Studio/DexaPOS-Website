"use client";

import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Search, Loader2, CheckCircle2, Globe, MapPin, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { GetMenuItems } from "@/app/dashboard/actions/menu-items";
import {
  AssignModifierToItems,
  GetLocationModifierItemIds,
} from "@/app/dashboard/actions/modifier-assignments";
import { MenuItemsModel } from "@/types/db-modles";

interface ModifierGroupForAssignment {
  id: string;
  name: string;
  merchant_id: string;
  menu_item_modifier_groups?: Array<{
    id: string;
    menu_item?: { id: string; name: string };
  }>;
}

interface AssignModifierToItemsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modifierGroup: ModifierGroupForAssignment;
  clerkOrgId?: string;
  locationId: string | null;
  isAllLocations: boolean;
  onSuccess?: () => void;
}

export function AssignModifierToItemsDialog({
  open,
  onOpenChange,
  modifierGroup,
  clerkOrgId,
  locationId,
  isAllLocations,
  onSuccess,
}: AssignModifierToItemsDialogProps) {
  const queryClient = useQueryClient();

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [allItems, setAllItems] = useState<MenuItemsModel[]>([]);
  const [locationAssignedIds, setLocationAssignedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // IDs of items that have this modifier group assigned GLOBALLY
  const globalAssignedIds = useMemo(() => {
    return new Set(
      modifierGroup.menu_item_modifier_groups
        ?.map((g) => g.menu_item?.id)
        .filter(Boolean) as string[],
    );
  }, [modifierGroup.menu_item_modifier_groups]);

  // Combined: all items already assigned (global + location)
  const allAssignedIds = useMemo(() => {
    return new Set([...globalAssignedIds, ...locationAssignedIds]);
  }, [globalAssignedIds, locationAssignedIds]);

  // Load items + location assignments when dialog opens
  useEffect(() => {
    if (!open || !clerkOrgId) return;

    setIsLoading(true);
    setSelectedIds(new Set());
    setSearchTerm("");

    const promises: Promise<any>[] = [
      GetMenuItems(clerkOrgId, isAllLocations ? null : locationId),
    ];

    // Also fetch location-scoped assignments if viewing a specific location
    if (!isAllLocations && locationId) {
      promises.push(GetLocationModifierItemIds(modifierGroup.id, locationId));
    }

    Promise.all(promises)
      .then(([items, locItemIds]) => {
        setAllItems(items || []);
        setLocationAssignedIds(new Set(locItemIds || []));
      })
      .finally(() => setIsLoading(false));
  }, [open, clerkOrgId, locationId, isAllLocations, modifierGroup.id]);

  const filteredItems = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return allItems.filter(
      (item) =>
        item.name.toLowerCase().includes(term) ||
        item.description?.toLowerCase().includes(term),
    );
  }, [allItems, searchTerm]);

  const toggleItem = (itemId: string) => {
    if (allAssignedIds.has(itemId)) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const handleAssign = async () => {
    if (!selectedIds.size) return;

    setIsSaving(true);
    try {
      const result = await AssignModifierToItems(
        modifierGroup.id,
        Array.from(selectedIds),
        modifierGroup.merchant_id,
        isAllLocations ? null : locationId,
      );

      if (result.error) {
        toast.error("Assignment failed", { description: result.error });
        return;
      }

      const scope = isAllLocations ? "globally" : "at this location";
      const msg =
        result.skippedCount && result.skippedCount > 0
          ? `Assigned ${scope} to ${result.assignedCount} item(s) (${result.skippedCount} already had it)`
          : `Assigned ${scope} to ${result.assignedCount} item(s)`;
      toast.success(msg);

      queryClient.invalidateQueries({ queryKey: ["modifier-groups"] });
      queryClient.invalidateQueries({ queryKey: ["menu-items"] });
      onSuccess?.();
    } catch (e: any) {
      toast.error("Assignment failed", {
        description: e?.message || "Try again",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>
            Add &quot;{modifierGroup.name}&quot; to Items
          </DialogTitle>
          <DialogDescription>
            Select items to assign this modifier group to.
          </DialogDescription>
        </DialogHeader>

        {/* Scope context banner */}
        {!isAllLocations ? (
          <div className="flex items-start gap-2 p-2.5 bg-blue-50 text-blue-800 rounded-lg text-xs border border-blue-100">
            <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              Assignments from this view apply <strong>only to this location</strong>.
              Items assigned globally will show at all locations.
            </span>
          </div>
        ) : (
          <div className="flex items-start gap-2 p-2.5 bg-emerald-50 text-emerald-800 rounded-lg text-xs border border-emerald-100">
            <Globe className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              Assignments from this view apply <strong>to all locations</strong>.
            </span>
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search items..."
            className="pl-9"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 max-h-[400px] space-y-1 pr-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Loading items...
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {searchTerm ? "No items match your search." : "No items found."}
            </div>
          ) : (
            filteredItems.map((item) => {
              const isGlobalAssigned = globalAssignedIds.has(item.id);
              const isLocationAssigned = locationAssignedIds.has(item.id);
              const isAssigned = isGlobalAssigned || isLocationAssigned;
              const isSelected = selectedIds.has(item.id);

              return (
                <div
                  key={item.id}
                  className={cn(
                    "flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors",
                    isAssigned
                      ? "bg-muted/50 opacity-60 cursor-default"
                      : isSelected
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted/30",
                  )}
                  onClick={() => toggleItem(item.id)}
                >
                  <Checkbox
                    checked={isAssigned || isSelected}
                    disabled={isAssigned}
                    onCheckedChange={() => toggleItem(item.id)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">
                      {item.name}
                    </div>
                    {item.description && (
                      <div className="text-xs text-muted-foreground truncate">
                        {item.description}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {item.price != null && (
                      <span className="text-xs text-muted-foreground">
                        ${Number(item.price).toFixed(2)}
                      </span>
                    )}
                    {isGlobalAssigned && (
                      <Badge
                        variant="outline"
                        className="text-[10px] gap-1 bg-emerald-50 text-emerald-700 border-emerald-200"
                      >
                        <Globe className="h-2.5 w-2.5" />
                        Global
                      </Badge>
                    )}
                    {isLocationAssigned && !isGlobalAssigned && (
                      <Badge
                        variant="outline"
                        className="text-[10px] gap-1 bg-blue-50 text-blue-700 border-blue-200"
                      >
                        <MapPin className="h-2.5 w-2.5" />
                        Location
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <div className="flex-1 text-sm text-muted-foreground">
            {selectedIds.size > 0
              ? `${selectedIds.size} item(s) selected`
              : `${allAssignedIds.size} already assigned`}
          </div>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleAssign}
            disabled={isSaving || selectedIds.size === 0}
            className="gap-2"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Assigning...
              </>
            ) : (
              `Assign to ${selectedIds.size} Item${selectedIds.size !== 1 ? "s" : ""}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
