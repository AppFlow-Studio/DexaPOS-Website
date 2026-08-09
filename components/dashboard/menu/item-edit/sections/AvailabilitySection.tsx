"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useGatedLocationId, useIsSingleLocation } from "@/stores/location-store";
import { useUserInfo } from "@/app/manage/hooks/useUserInfo.";
import { useItemSnooze, useSetItemAvailability } from "@/lib/queries/use-snoozes";
import { AffectsTag } from "../../AffectsTag";
import { SectionHeader } from "./OverviewSection";
import { ItemSnoozeControl } from "../ItemSnoozeControl";
import type { SectionRenderCtx } from "@/app/dashboard/menu/items/[itemId]/edit/ItemEditLayout";

export function AvailabilitySection({ itemId, item, scope }: SectionRenderCtx) {
  // Availability is per-location (like 86). Resolve the concrete location the same
  // way the 86 control does: single-location accounts write their one store's
  // override (not the global core), so a per-location turn-off is visible AND
  // clearable here. Multi-location on "All" -> null -> global core (unchanged).
  const gatedLocationId = useGatedLocationId();
  const isSingleLocation = useIsSingleLocation();
  const { data: userInfo } = useUserInfo();
  const clerkOrgId: string | undefined = userInfo?.members?.[0]?.organizations?.id;

  // Seed from the gated location's override (is_available) when one exists, else
  // the global flag. This is what surfaces an item that was turned off at the
  // single store but still reads "available" globally.
  const { data: locState } = useItemSnooze(itemId, gatedLocationId);
  const seed =
    locState?.is_available ??
    item?.location_is_available ??
    item?.availability ??
    true;
  const [available, setAvailable] = React.useState<boolean>(seed);

  React.useEffect(() => {
    setAvailable(seed);
  }, [itemId, seed]);

  const setAvailability = useSetItemAvailability();

  const save = () => {
    if (!clerkOrgId) return;
    setAvailability.mutate({
      clerkOrgId,
      menuItemId: itemId,
      isAvailable: available,
      locationId: gatedLocationId,
      normalizeGlobal: isSingleLocation,
    });
  };

  return (
    <div className="space-y-4">
      <SectionHeader title="Availability" scope={scope} />
      <div className="space-y-4 rounded-2xl border bg-card p-6">
        <div className="flex items-center justify-between rounded-2xl border-0 bg-muted/60 px-3 py-2 shadow-none">
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
            onClick={save}
            disabled={setAvailability.isPending || !clerkOrgId}
          >
            {setAvailability.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <>
                Save Availability
                <AffectsTag ctx={scope} variant="save-button" />
              </>
            )}
          </Button>
        </div>

        {/* 86 / out-of-stock — marking out of stock also switches availability off
            (and restore switches it back on). */}
        <ItemSnoozeControl
          menuItemId={itemId}
          onOutOfStockChange={(oos) => setAvailable(!oos)}
        />
      </div>
    </div>
  );
}
