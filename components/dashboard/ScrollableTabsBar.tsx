"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface ScrollableTabsBarProps {
  /** The active tab's value. Changing it scrolls that trigger into view. */
  activeValue: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Horizontal scroll container for a `TabsList` that keeps the selected tab
 * visible.
 *
 * On mobile the report tab bars overflow their row, so tabs past the fold are
 * off-screen. Selecting one (via keyboard, or by restoring a tab from state on
 * load) would otherwise leave it scrolled out of sight. This scrolls the active
 * trigger back into view whenever the selection changes.
 *
 * The active tab is found by attribute rather than by index, so it keeps
 * working regardless of how the triggers are built: Radix sets
 * `data-state="active"`, and plain-button bars can opt in with
 * `data-active="true"` or `aria-selected`.
 */
export function ScrollableTabsBar({
  activeValue,
  children,
  className,
}: ScrollableTabsBarProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const active = container.querySelector<HTMLElement>(
      '[data-state="active"], [data-active="true"], [aria-selected="true"]',
    );
    if (!active) return;

    // Nothing to do when the bar isn't actually overflowing — calling
    // scrollIntoView anyway can nudge the whole page on some browsers.
    if (container.scrollWidth <= container.clientWidth) return;

    // Center the tab in the visible strip so neighbours on both sides stay
    // discoverable, instead of parking it hard against an edge.
    const target =
      active.offsetLeft - (container.clientWidth - active.offsetWidth) / 2;

    container.scrollTo({
      left: Math.max(0, target),
      behavior: "smooth",
    });
  }, [activeValue]);

  return (
    <div
      ref={scrollRef}
      className={cn(
        // `no-scrollbar` (defined in globals.css) keeps the strip clean; the
        // bar stays swipeable on touch and reachable by keyboard either way.
        "w-full min-w-0 overflow-x-auto pb-1 no-scrollbar",
        className,
      )}
    >
      {children}
    </div>
  );
}
