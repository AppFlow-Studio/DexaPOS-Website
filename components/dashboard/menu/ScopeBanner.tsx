"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  scopeColor,
  scopeIcon,
  scopeLabel,
  scopeDescription,
  type ScopeContext,
} from "@/lib/menu/cascade-labels";

/**
 * Banner describing the scope the merchant is currently editing.
 *
 * cascade-labels is the single source of truth for scope numbering and wording.
 * It requires that merchants never see the word "Level" (or a level number), so
 * all copy routes through scopeLabel()/scopeDescription() and no numeric badge
 * is rendered. An earlier banner used a second, conflicting numbering and showed
 * a raw "L2"-style chip; both are gone.
 */
export function ScopeBanner({
  className,
  ...ctx
}: ScopeContext & { className?: string }) {
  const color = scopeColor(ctx.level);
  const Icon = scopeIcon(ctx.level);

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border px-4 py-3",
        color.bg,
        color.border,
        className,
      )}
    >
      <div className={cn("rounded-full p-2", color.bg)}>
        <Icon className={cn("h-4 w-4", color.text)} />
      </div>
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm font-medium", color.text)}>
          {scopeLabel(ctx)}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {scopeDescription(ctx)}
        </p>
      </div>
    </div>
  );
}

export default ScopeBanner;
