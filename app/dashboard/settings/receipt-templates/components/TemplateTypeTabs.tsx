"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { TEMPLATE_TYPES } from "../constants";
import type { TemplateType } from "../types";

interface TemplateTypeTabsProps {
  activeTab: TemplateType;
  onChange: (tab: TemplateType) => void;
}

export function TemplateTypeTabs({
  activeTab,
  onChange,
}: TemplateTypeTabsProps) {
  const railRef = React.useRef<HTMLDivElement>(null);

  // §13.2 — the selected tab scrolls itself into view so the active template is
  // always the one you can see. `block: "nearest"` stops the browser scrolling
  // the page vertically to the rail as well.
  React.useEffect(() => {
    railRef.current
      ?.querySelector('[data-state="active"]')
      ?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [activeTab]);

  return (
    // Pill rail, not the retired underline style (§4.5). Classes are literal
    // rather than imported from `tokens.ts` — Tailwind does not scan `.ts` (C7).
    <div
      ref={railRef}
      className="thin-scrollbar w-full min-w-0 overflow-x-auto pb-1"
    >
      <div className="inline-flex h-auto w-max flex-nowrap gap-0.5 rounded-full bg-muted/70 p-1">
        {TEMPLATE_TYPES.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              data-state={isActive ? "active" : "inactive"}
              aria-pressed={isActive}
              onClick={() => onChange(tab.id)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-medium transition-colors",
                isActive
                  ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
