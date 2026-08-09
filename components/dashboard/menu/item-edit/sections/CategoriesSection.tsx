"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { useIsSingleLocation } from "@/stores/location-store";
import { SectionHeader } from "./OverviewSection";
import type { SectionRenderCtx } from "@/app/dashboard/menu/items/[itemId]/edit/ItemEditLayout";

export function CategoriesSection({ item, globalScope }: SectionRenderCtx) {
  const isSingleLocation = useIsSingleLocation();
  const categoryItems: Array<{ category?: { id: string; name: string } | null }> =
    item?.category_items ?? [];

  return (
    <div className="space-y-4">
      <SectionHeader title="Categories" scope={globalScope} />
      <div className="space-y-3 rounded-2xl border bg-card p-6">
        {categoryItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            This item isn't attached to any category yet. Attach from the
            Categories page.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {categoryItems.map((ci, i) => (
              <Badge key={i} variant="secondary">
                {ci.category?.name ?? "Unnamed"}
              </Badge>
            ))}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">
          {isSingleLocation
            ? "Category attachment is shared across your menu. Managing categories happens from the Categories page."
            : "Category attachment is always Global. Managing categories happens from the Categories page."}
        </p>
      </div>
    </div>
  );
}
