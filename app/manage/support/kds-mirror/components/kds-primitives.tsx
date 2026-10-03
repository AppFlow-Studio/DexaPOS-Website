"use client";

import * as React from "react";
import { Info } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/*
 * The pieces every KDS tab repeats: the explanatory callout, the time-window
 * select and the pill filter rail. Written once so the four tabs cannot drift.
 *
 * ⚠️ Classes are literal strings in this .tsx on purpose (UI-DESIGN-SYSTEM C7).
 */

/**
 * A neutral callout (§3.5): the notices on this page explain what a view can
 * and cannot prove. They are not alarms, so they take no tint — emphasis comes
 * from the bold lead sentence.
 */
export function KdsNotice({
  icon: Icon,
  children,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-2xl bg-muted/60 px-4 py-3 text-[0.8125rem] text-muted-foreground",
        className
      )}
    >
      {Icon && <Icon className="mt-0.5 h-4 w-4 shrink-0" />}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/**
 * The phone form of a `KdsNotice` (§13.4 "move, don't delete"): an ⓘ button
 * that drops down the same explanation. A tap, not a hover tooltip, because
 * phones have no hover. Pair it with `max-sm:hidden` on the full notice and
 * `sm:hidden` on this button.
 *
 * A floating drop-down centred under the icon, held 24px off both screen edges
 * (`collisionPadding`), so it never hugs an edge. The key sentence leads in
 * bold; body children that are `<span>`s (the notice's sentences, run inline
 * in the notice) stack as short paragraphs.
 *
 * `size="toolbar"` matches a 44px toolbar control; `size="inline"` sits beside
 * a heading.
 */
export function NoticeInfoButton({
  title,
  description,
  children,
  size = "toolbar",
  className,
}: {
  title: string;
  description: React.ReactNode;
  children: React.ReactNode;
  size?: "toolbar" | "inline";
  className?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={title}
          className={cn(
            // A bare icon, no fill (user request 2026-10-03); the glyph darkens on
            // hover and while open.
            "shrink-0 border-0 bg-transparent text-muted-foreground shadow-none hover:bg-transparent hover:text-foreground data-[state=open]:text-foreground",
            size === "toolbar" ? "size-11" : "size-8",
            className
          )}
        >
          <Info className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      {/* popover.tsx has no data-slot for the global overlay radius (§4.6). */}
      <PopoverContent
        align="center"
        sideOffset={8}
        collisionPadding={24}
        aria-label={title}
        className="w-[min(20rem,calc(100vw-3rem))] space-y-2 rounded-2xl p-4 text-[0.8125rem] font-normal leading-relaxed tracking-normal text-muted-foreground [&>span]:block"
      >
        <p className="font-medium text-foreground">{description}</p>
        {children}
      </PopoverContent>
    </Popover>
  );
}

/**
 * An order type in words. Matches the board's own filter labels ("To Go",
 * "Dine-In"), so the same order never reads two ways on one page.
 */
export function orderTypeLabel(orderType: string | null): string | null {
  if (!orderType) return null;
  const t = orderType.toLowerCase();
  if (t === "delivery") return "Delivery";
  if (t === "takeout" || t === "to_go" || t === "to go") return "To Go";
  if (t === "dine_in" || t === "dine in") return "Dine-In";
  if (t === "qr_dine_in") return "QR Dine-In";
  const words = t.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The bold lead of a `KdsNotice`. */
export function NoticeLead({ children }: { children: React.ReactNode }) {
  return <span className="font-medium text-foreground">{children}</span>;
}

/**
 * The one neutral status pill (§4.6b, DS-CTL-09). The word carries the
 * meaning; an alarm colours only the glyph passed in `icon`, never the pill.
 * On a muted record card, render the words as plain text instead (§5.3).
 */
export function Pill({
  icon,
  title,
  children,
  className,
}: {
  icon?: React.ReactNode;
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full border-0 bg-muted/60 px-2.5 py-0.5 text-xs font-medium [&_svg]:h-3 [&_svg]:w-3 [&_svg]:shrink-0",
        className
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/**
 * A time-window select as a muted toolbar pill (§4.2, §5.2). `SelectTrigger`
 * still ships a border by default (§11), so the material is spelled out.
 */
export function WindowSelect<K extends string>({
  value,
  onValueChange,
  options,
  ariaLabel = "Time window",
  disabled,
}: {
  value: K;
  onValueChange: (value: K) => void;
  options: readonly { key: K; label: string }[];
  ariaLabel?: string;
  disabled?: boolean;
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => onValueChange(v as K)}
      disabled={disabled}
    >
      <SelectTrigger
        aria-label={ariaLabel}
        className="w-full min-w-0 border-0 bg-muted/60 px-3 text-[0.8125rem] shadow-none data-[size=default]:h-11 dark:bg-muted/60 sm:data-[size=default]:h-9 sm:w-40"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.key} value={option.key}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** How many items an expanded row or card shows before the rest move to a dialog. */
export const EXPANDED_ITEM_CAP = 5;

/**
 * The item list inside an expanded send or order, capped at
 * `EXPANDED_ITEM_CAP` with the full list one tap away in a centred dialog.
 *
 * Expanding in place is a recorded exception to §5.9 (§14.3): most sends and
 * unsent orders hold 1–3 items (measured 2026-09-30: median 1, p90 4), so a
 * detail page would be a route for one line, and support reads the items
 * beside the send they belong to. The cap stops the rare 25–30-item order from
 * pushing the page of 10 and its pager a screen away.
 *
 * `rank` orders the preview ("rank before you slice", §5.7), so problem items
 * are never the ones hidden; the dialog keeps the original order.
 * `renderItem` gets each item's original index.
 */
export function CappedItemList<T>({
  items,
  getKey,
  renderItem,
  rank,
  ordered = false,
  dialogTitle,
  dialogDescription,
}: {
  items: T[];
  getKey: (item: T) => string;
  renderItem: (item: T, index: number) => React.ReactNode;
  rank?: (item: T) => number;
  ordered?: boolean;
  dialogTitle: string;
  dialogDescription: string;
}) {
  const List = ordered ? "ol" : "ul";
  const indexed = items.map((item, index) => ({ item, index }));
  const preview = (
    rank ? [...indexed].sort((a, b) => rank(a.item) - rank(b.item)) : indexed
  ).slice(0, EXPANDED_ITEM_CAP);
  const hiddenCount = items.length - preview.length;
  // Only say "problems first" when the ranking actually moved something up.
  const reordered = preview.some((row, position) => row.index !== position);

  // The row fill is `bg-background/70` on the expanded row's muted cell; on
  // the dialog's own background that would vanish, so it takes the muted card.
  const renderRows = (
    rows: { item: T; index: number }[],
    surface: "row" | "dialog"
  ) =>
    rows.map(({ item, index }) => (
      <li
        key={getKey(item)}
        className={cn(
          "flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl px-3 py-2",
          surface === "row" ? "bg-background/70" : "bg-muted/45"
        )}
      >
        {renderItem(item, index)}
      </li>
    ));

  return (
    <div>
      <List className="space-y-1.5">{renderRows(preview, "row")}</List>
      {hiddenCount > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <Dialog>
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-9 px-3 text-[0.8125rem]"
              >
                Show all <span className="tabular-nums">{items.length}</span>{" "}
                items
              </Button>
            </DialogTrigger>
            {/* A list the user works through: full screen on phones (§13.1).
                The dialog clips; only the body scrolls (§12). */}
            <DialogContent className="h-dvh max-h-dvh w-screen max-w-none grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-none p-0 sm:h-auto sm:max-h-[85vh] sm:w-full sm:max-w-2xl sm:rounded-3xl">
              <DialogHeader className="shrink-0 px-6 pt-6">
                <DialogTitle>{dialogTitle}</DialogTitle>
                <DialogDescription>{dialogDescription}</DialogDescription>
              </DialogHeader>
              <div className="thin-scrollbar min-h-0 overflow-y-auto px-6 pb-6">
                <List className="space-y-1.5">
                  {renderRows(indexed, "dialog")}
                </List>
              </div>
            </DialogContent>
          </Dialog>
          <span className="text-xs text-muted-foreground">
            <span className="tabular-nums">{preview.length}</span> of{" "}
            <span className="tabular-nums">{items.length}</span> shown
            {reordered ? ", problems first" : ""}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * The phone form of a short `PillRail` (2–4 options): equal segments that
 * always fit the width, the label over its count, so nothing scrolls or is
 * cut off. Same material as the rail: a muted track, the active segment
 * neutral (§4.5), each segment at least 44px tall (§13.6).
 */
export function SegmentedFilter<K extends string>({
  options,
  value,
  onValueChange,
  ariaLabel,
  className,
}: {
  options: { key: K; label: string; count?: number }[];
  value: K;
  onValueChange: (value: K) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        "grid gap-0.5 rounded-2xl bg-muted/70 p-1",
        // Literal classes (C7): one column per option.
        options.length === 2
          ? "grid-cols-2"
          : options.length === 3
            ? "grid-cols-3"
            : "grid-cols-4",
        className
      )}
    >
      {options.map((option) => {
        const isActive = option.key === value;
        return (
          <button
            key={option.key}
            type="button"
            aria-pressed={isActive}
            onClick={() => onValueChange(option.key)}
            className={cn(
              "flex min-h-11 min-w-0 flex-col items-center justify-center rounded-2xl px-1 py-1 text-xs font-medium transition-colors",
              isActive
                ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <span className="max-w-full truncate">{option.label}</span>
            {option.count !== undefined && (
              <span className="text-[0.8125rem] tabular-nums">
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * A row of mutually exclusive filter pills on the tab-rail material (§4.5):
 * the active pill is neutral, never a brand fill. Scrolls sideways inside
 * itself on a narrow screen rather than wrapping, with the scrollbar hidden
 * (§13.2: the peeking pill is the affordance, not a scrollbar).
 */
export function PillRail<K extends string>({
  options,
  value,
  onValueChange,
  ariaLabel,
  className,
}: {
  options: { key: K; label: string; count?: number }[];
  value: K;
  onValueChange: (value: K) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div
      className={cn("no-scrollbar min-w-0 max-w-full overflow-x-auto", className)}
    >
      <div
        role="group"
        aria-label={ariaLabel}
        className="inline-flex w-max flex-nowrap gap-0.5 rounded-full bg-muted/70 p-1"
      >
        {options.map((option) => {
          const isActive = option.key === value;
          return (
            <button
              key={option.key}
              type="button"
              aria-pressed={isActive}
              onClick={() => onValueChange(option.key)}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[0.8125rem] font-medium transition-colors",
                isActive
                  ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {option.label}
              {option.count !== undefined && (
                <span className="ml-1.5 tabular-nums text-muted-foreground">
                  {option.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
