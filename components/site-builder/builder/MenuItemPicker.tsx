"use client";

import { ChevronDown, ChevronUp, ImageOff, Plus, TriangleAlert, X, Zap } from "lucide-react";
import { useMemo, useState } from "react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { CatalogItem } from "@/app/dashboard/website/builder/menu-catalog";
import type { Binding } from "@/lib/site-builder/bindings/types";
import { cn } from "@/lib/utils";

/**
 * Choosing which dishes a section shows.
 *
 * No other builder surveyed has this control, because no other builder has a
 * POS behind the page. Two rules make it what it is, and both are correctness
 * properties rather than polish:
 *
 * 1. **A broken reference is shown, never hidden.** The renderer drops an
 *    unavailable item silently — right for a public page, wrong here. A merchant
 *    should learn their signature dish is 86'd from this panel, not from a
 *    customer. Broken rows stay, explain themselves, and offer removal.
 *
 * 2. **Nothing here is editable.** There is no price field and no name field,
 *    because there is nowhere in a section's props to put them (decision A4).
 *    The *absence* of those controls is the explanation: a merchant looking for
 *    somewhere to fix a price learns, correctly, that they fix it in the menu.
 *
 * The list a merchant chooses from is the resolvable set — items on a menu
 * actually serving this location — never the raw `menu_items` table. Offering
 * the wider set is how a page gets built out of dishes that silently vanish at
 * render (HANDOFF §6b).
 */

export interface MenuItemPickerProps {
  bindings: Binding[];
  onChange: (next: Binding[]) => void;
  maxItems?: number;
  catalog: CatalogItem[] | null;
  showPrices: boolean;
  error: string | null;
}

export default function MenuItemPicker({
  bindings,
  onChange,
  maxItems,
  catalog,
  showPrices,
  error,
}: MenuItemPickerProps) {
  const [open, setOpen] = useState(false);

  const byId = useMemo(
    () => new Map((catalog ?? []).map((item) => [item.id, item])),
    [catalog],
  );

  const available = useMemo(() => {
    const chosen = new Set(bindings.map((b) => b.id));
    return (catalog ?? []).filter((item) => !chosen.has(item.id));
  }, [catalog, bindings]);

  const atMax = maxItems != null && bindings.length >= maxItems;

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= bindings.length) return;
    const next = [...bindings];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  if (error) {
    return (
      <p className="rounded-md border border-dashed border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
        {error}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {catalog === null ? (
        <div className="space-y-1.5" aria-label="Loading your menu">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-11 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      ) : bindings.length === 0 ? (
        <p className="rounded-md border border-dashed border-input p-3 text-xs text-muted-foreground">
          No dishes chosen yet. Everything you add shows its current price and
          hides itself automatically when you 86 it.
        </p>
      ) : (
        <ul className="space-y-1">
          {bindings.map((binding, index) => (
            <Row
              key={`${binding.id}-${index}`}
              item={byId.get(binding.id)}
              showPrices={showPrices}
              canMoveUp={index > 0}
              canMoveDown={index < bindings.length - 1}
              onMoveUp={() => move(index, -1)}
              onMoveDown={() => move(index, 1)}
              onRemove={() => onChange(bindings.filter((_, i) => i !== index))}
            />
          ))}
        </ul>
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          disabled={atMax || catalog === null}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-input py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-ring hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-40"
        >
          {atMax ? (
            `Maximum ${maxItems} items`
          ) : (
            <>
              <Plus className="size-3.5" />
              Add a dish
            </>
          )}
        </PopoverTrigger>

        <PopoverContent align="start" className="w-72 p-0">
          <Command>
            <CommandInput placeholder="Search your menu…" />
            <CommandList>
              <CommandEmpty className="py-6 text-center text-xs text-muted-foreground">
                {available.length === 0 && (catalog?.length ?? 0) > 0
                  ? "Every dish on your menu is already here."
                  : "No dishes match."}
              </CommandEmpty>
              <CommandGroup>
                {available.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={`${item.name} ${item.description ?? ""}`}
                    onSelect={() => {
                      onChange([...bindings, { type: "menu_item", id: item.id }]);
                      setOpen(false);
                    }}
                    className="gap-2"
                  >
                    <Thumb src={item.image} className="size-7" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px]">{item.name}</span>
                      {!item.available && (
                        <span className="block text-[10px] text-amber-600">
                          Unavailable right now
                        </span>
                      )}
                    </span>
                    {showPrices && (
                      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                        {money(item.price)}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Decision A4, said out loud at the point of confusion. A merchant hunting
          for a price field finds this instead. */}
      <p className="flex gap-1.5 pt-0.5 text-[11px] leading-relaxed text-muted-foreground">
        <Zap className="mt-px size-3 shrink-0" />
        <span>
          {showPrices
            ? "Names, photos and prices come from your menu — edit them there and this page follows."
            : "Names and photos come from your menu. Prices appear once a visitor picks a restaurant."}
        </span>
      </p>
    </div>
  );
}

function Row({
  item,
  showPrices,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  item: CatalogItem | undefined;
  showPrices: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}) {
  // Absent from the catalog entirely — deleted, or no longer on a menu serving
  // this location. The renderer would drop it without a word.
  const missing = !item;
  const unavailable = !!item && !item.available;
  const broken = missing || unavailable;

  return (
    <li
      className={cn(
        "group flex items-center gap-2 rounded-md border py-1.5 pl-1.5 pr-1 transition-colors",
        broken ? "border-amber-500/40 bg-amber-50/50" : "border-border bg-card",
      )}
    >
      <Thumb src={item?.image ?? null} className="size-8" />

      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-[13px]", missing && "text-muted-foreground")}>
          {item?.name ?? "Removed from your menu"}
        </p>
        {broken && (
          <p className="flex items-center gap-1 text-[10px] font-medium text-amber-700">
            <TriangleAlert className="size-2.5" />
            {missing ? "No longer on a menu here" : "86’d — hidden until you bring it back"}
          </p>
        )}
      </div>

      {showPrices && item && !broken && (
        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
          {money(item.price)}
        </span>
      )}

      <span className="flex shrink-0 items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <IconButton label="Move up" disabled={!canMoveUp} onClick={onMoveUp}>
          <ChevronUp className="size-3.5" />
        </IconButton>
        <IconButton label="Move down" disabled={!canMoveDown} onClick={onMoveDown}>
          <ChevronDown className="size-3.5" />
        </IconButton>
        <IconButton label="Remove" onClick={onRemove} destructive>
          <X className="size-3.5" />
        </IconButton>
      </span>
    </li>
  );
}

function Thumb({ src, className }: { src: string | null; className?: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className={cn("shrink-0 rounded object-cover", className)}
      loading="lazy"
    />
  ) : (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded bg-muted text-muted-foreground",
        className,
      )}
    >
      <ImageOff className="size-3" />
    </span>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  destructive,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
          className={cn(
            "flex size-6 items-center justify-center rounded text-muted-foreground transition-colors disabled:pointer-events-none disabled:opacity-30",
            destructive
              ? "hover:bg-destructive/10 hover:text-destructive"
              : "hover:bg-accent hover:text-accent-foreground",
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function money(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}
