"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { SectionHeader } from "./OverviewSection";
import type { SectionRenderCtx } from "@/app/dashboard/menu/items/[itemId]/edit/ItemEditLayout";

export function ModifiersSection({ item, globalScope }: SectionRenderCtx) {
  const groups: Array<{ modifier_group?: { id: string; name: string } | null }> =
    item?.menu_item_modifier_groups ?? [];

  return (
    <div className="space-y-4">
      <SectionHeader title="Modifiers" scope={globalScope} />
      <div className="space-y-3 rounded-lg border bg-card p-4">
        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No modifier groups attached. Attach from the Modifiers page.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {groups.map((g, i) => (
              <Badge key={i} variant="secondary">
                {g.modifier_group?.name ?? "Unnamed"}
              </Badge>
            ))}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">
          Modifier attachment is always Global.
        </p>
      </div>
    </div>
  );
}
