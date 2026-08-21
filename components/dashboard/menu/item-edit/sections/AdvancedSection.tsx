"use client";

import * as React from "react";
import { SectionHeader } from "./OverviewSection";
import type { SectionRenderCtx } from "@/app/dashboard/menu/items/[itemId]/edit/ItemEditLayout";

export function AdvancedSection({ item, globalScope }: SectionRenderCtx) {
  return (
    <div className="space-y-4">
      <SectionHeader title="Advanced" scope={globalScope} />
      <div className="space-y-2 rounded-2xl border bg-card p-6">
        <p className="text-xs text-muted-foreground">
          Tax category, prep station, card background and recipe details are
          managed in the full editor sheet today. This section is a
          lightweight read-only summary until migrated fully.
        </p>
        <dl className="grid grid-cols-2 gap-2 text-xs">
          <dt className="text-muted-foreground">Tax category</dt>
          <dd className="font-medium">{item?.tax_category ?? "—"}</dd>
          <dt className="text-muted-foreground">Stock tracking</dt>
          <dd className="font-medium">{item?.stock_tracking_mode ?? "—"}</dd>
          <dt className="text-muted-foreground">Card bg color</dt>
          <dd className="font-medium">{item?.card_bg_color ?? "—"}</dd>
        </dl>
      </div>
    </div>
  );
}
