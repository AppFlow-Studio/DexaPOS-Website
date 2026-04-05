"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { UpdateMenuItem } from "@/app/dashboard/actions/menu-items";
import {
  useIsAllLocations,
  useLocationStore,
} from "@/stores/location-store";
import { AffectsTag } from "../../AffectsTag";
import { SectionHeader } from "./OverviewSection";
import type { SectionRenderCtx } from "@/app/dashboard/menu/items/[itemId]/edit/ItemEditLayout";

export function AvailabilitySection({ itemId, item, scope }: SectionRenderCtx) {
  const queryClient = useQueryClient();
  const isAllLocations = useIsAllLocations();
  const { selectedLocationId } = useLocationStore();
  const locationId = isAllLocations ? null : selectedLocationId;

  const initial: boolean =
    item?.location_is_available ?? item?.availability ?? true;
  const [available, setAvailable] = React.useState<boolean>(initial);

  React.useEffect(() => {
    setAvailable(item?.location_is_available ?? item?.availability ?? true);
  }, [item?.id, item?.location_is_available, item?.availability]);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await UpdateMenuItem(
        itemId,
        { availability: available },
        locationId ?? undefined,
      );
      if (res.error) throw new Error(res.error);
      return res;
    },
    onSuccess: () => {
      toast.success("Availability saved");
      queryClient.invalidateQueries({ queryKey: ["menu-item", itemId] });
      queryClient.invalidateQueries({ queryKey: ["menu-items"] });
    },
    onError: (err) =>
      toast.error("Save failed", {
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  return (
    <div className="space-y-4">
      <SectionHeader title="Availability" scope={scope} />
      <div className="space-y-4 rounded-lg border bg-card p-4">
        <div className="flex items-center justify-between rounded-md border px-3 py-2">
          <Label htmlFor="avail-toggle" className="text-sm font-medium">
            Available for sale
          </Label>
          <Switch
            id="avail-toggle"
            checked={available}
            onCheckedChange={setAvailable}
          />
        </div>
        <div className="flex items-center justify-end">
          <Button
            type="button"
            size="sm"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <>
                Save Availability
                <AffectsTag ctx={scope} variant="save-button" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
