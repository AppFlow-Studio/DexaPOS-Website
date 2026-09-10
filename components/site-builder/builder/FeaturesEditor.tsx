"use client";

import {
  BookOpen,
  Briefcase,
  Cake,
  Car,
  Clock,
  CreditCard,
  Gift,
  Globe,
  GripVertical,
  Heart,
  House,
  Leaf,
  MapPin,
  Mic,
  Phone,
  ShoppingBag,
  Star,
  Trash2,
  Truck,
  UtensilsCrossed,
  Users,
  WheatOff,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";

import { tintOn } from "@/lib/site-builder/color";
import type { ThemeTokens } from "@/lib/site-builder/render-context";
import {
  featureIconFor,
  FEATURE_ICON_NAMES,
  type FeatureIconName,
} from "@/lib/site-builder/sections/feature-icon";
import type { SectionStyle, TextTone } from "@/lib/site-builder/sections/primitives";
import type { FeaturesProps } from "@/lib/site-builder/sections/schemas/features";
import { cn } from "@/lib/utils";
import ColorPicker from "../shell/ColorPicker";
import { backdropColorFor } from "./backdrop-color";
import { inputClass } from "./field-chrome";

/** The same twenty the renderer draws, as the swatches the merchant clicks. */
const ICONS: Record<FeatureIconName, LucideIcon> = {
  Cake,
  Car,
  CreditCard,
  ShoppingBag,
  Mic,
  Truck,
  UtensilsCrossed,
  Globe,
  WheatOff,
  Heart,
  Leaf,
  House,
  Phone,
  MapPin,
  Star,
  BookOpen,
  Users,
  Clock,
  Gift,
  Briefcase,
};

export type FeatureItem = FeaturesProps["items"][number];

/** The cap the schema enforces, repeated here so the counter can show it. */
const TITLE_MAX = 50;
const DESCRIPTION_MAX = 300;
const MAX_ITEMS = 12;

/**
 * The highlights list: reorder, delete, and open one to edit.
 *
 * Modelled on Owner's Features editor, which is the one other place besides the
 * navigation where a list is short, flat and genuinely order-sensitive — so it
 * gets drag handles, the same bargain `NavEditor` already strikes. Everything
 * about an item that is not its order lives one level down, because a row
 * carrying three inputs is a card, and twelve cards is a scroll.
 */
export function FeaturesList({
  items,
  onChange,
  onEdit,
}: {
  items: FeatureItem[];
  onChange: (items: FeatureItem[]) => void;
  onEdit: (index: number) => void;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const drop = (target: number) => {
    if (dragIndex === null || dragIndex === target) return;
    const next = [...items];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(target, 0, moved);
    setDragIndex(null);
    onChange(next);
  };

  return (
    <div className="border-t pt-5">
      <span className="mb-1.5 block text-xs font-medium">Features</span>

      <ul className="space-y-2">
        {items.map((item, index) => {
          const Icon = ICONS[item.icon];
          return (
            <li
              key={`${item.title}-${index}`}
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => drop(index)}
              onDragEnd={() => setDragIndex(null)}
              className={cn(
                "flex items-center gap-2 rounded-md border bg-background px-2 py-2 transition-opacity",
                dragIndex === index && "opacity-40",
              )}
            >
              <GripVertical
                aria-hidden
                className="size-3.5 shrink-0 cursor-grab text-muted-foreground"
              />
              {/*
                The row is the way in, so the whole row is the button — not a
                pencil the merchant has to find. Drag handle and bin stay
                outside it so neither opens the editor by accident.
              */}
              <button
                type="button"
                onClick={() => onEdit(index)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <Icon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate text-xs font-medium">
                  {item.title || <span className="text-muted-foreground">Untitled</span>}
                </span>
              </button>
              <button
                type="button"
                aria-label={`Remove ${item.title || "feature"}`}
                onClick={() => onChange(items.filter((_, i) => i !== index))}
                className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        disabled={items.length >= MAX_ITEMS}
        onClick={() => {
          onChange([...items, { title: "", icon: "Star" }]);
          onEdit(items.length);
        }}
        className={cn(
          "mt-2 flex w-full items-center justify-center rounded-md border py-2 text-xs font-medium transition-colors",
          "hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-40",
        )}
      >
        {items.length >= MAX_ITEMS ? `Maximum ${MAX_ITEMS}` : "Add Feature"}
      </button>
    </div>
  );
}

/**
 * One highlight: title, description, icon.
 *
 * Replaces the panel rather than expanding inside it, so a merchant editing an
 * item sees only that item's fields — the shape Owner uses, and the reason
 * their list stays readable at a dozen entries.
 */
export function FeatureItemForm({
  item,
  onChange,
}: {
  item: FeatureItem;
  onChange: (item: FeatureItem) => void;
}) {
  /**
   * The icon follows the title until the merchant says otherwise.
   *
   * `touched` is what makes it a suggestion rather than a fight: typing
   * "Delivery" lands on the truck with no interaction, but once a swatch is
   * clicked the choice is theirs and no later keystroke moves it.
   */
  const [touched, setTouched] = useState(false);

  const setTitle = (title: string) => {
    const next = title.slice(0, TITLE_MAX);
    onChange({ ...item, title: next, icon: touched ? item.icon : featureIconFor(next) });
  };

  return (
    <div className="space-y-5 p-4">
      <label className="block">
        <span className="mb-1.5 flex items-baseline gap-1">
          <span className="text-xs font-medium">Title</span>
          <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
            {item.title.length}/{TITLE_MAX}
          </span>
        </span>
        <input
          value={item.title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={TITLE_MAX}
          className={inputClass}
          autoFocus
        />
      </label>

      <label className="block">
        <span className="mb-1.5 flex items-baseline gap-1">
          <span className="text-xs font-medium">Description</span>
          <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
            {(item.description ?? "").length}/{DESCRIPTION_MAX}
          </span>
        </span>
        <textarea
          value={item.description ?? ""}
          placeholder="Aa"
          rows={4}
          maxLength={DESCRIPTION_MAX}
          onChange={(event) =>
            onChange({ ...item, description: event.target.value.slice(0, DESCRIPTION_MAX) || undefined })
          }
          className={cn(inputClass, "h-auto resize-y py-2")}
        />
      </label>

      <div>
        <span className="mb-1.5 block text-xs font-medium">Icon</span>
        <div className="grid grid-cols-6 gap-1.5">
          {FEATURE_ICON_NAMES.map((name) => {
            const Icon = ICONS[name];
            const selected = item.icon === name;
            return (
              <button
                key={name}
                type="button"
                aria-label={name}
                aria-pressed={selected}
                onClick={() => {
                  setTouched(true);
                  onChange({ ...item, icon: name });
                }}
                className={cn(
                  "flex aspect-square items-center justify-center rounded-md border transition-colors",
                  "hover:bg-accent focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  selected && "border-foreground bg-accent",
                )}
              >
                <Icon aria-hidden className="size-4" strokeWidth={1.5} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const ICON_TONE_OPTIONS: Array<{ value: TextTone; label: string }> = [
  { value: "brand", label: "Brand colour" },
  { value: "default", label: "Default" },
  { value: "muted", label: "Muted" },
  { value: "custom", label: "Custom…" },
];

const DEFAULT_CUSTOM_ICON_COLOR = "#111827";

/**
 * Icon colour, in the same vocabulary section text already uses.
 *
 * Owner has no equivalent — their icons are always brand-coloured. This is ours
 * to add, so it borrows the control that already exists rather than inventing a
 * second way to say "colour": the same four tones, the same picker, the same
 * honest note when the contrast guard has to move the colour.
 */
export function IconColorControl({
  props,
  style,
  theme,
  onChange,
}: {
  props: FeaturesProps;
  style: SectionStyle | undefined;
  theme: ThemeTokens;
  onChange: (patch: Partial<FeaturesProps>) => void;
}) {
  const tone = props.iconTone ?? "brand";
  const requested = props.iconColor ?? DEFAULT_CUSTOM_ICON_COLOR;

  // A brand band has one readable foreground and no room for another, so the
  // renderer declines a custom colour there and the option is absent rather
  // than present-and-inert.
  const onBrandBand = (style?.background ?? "default") === "brand";
  const options = ICON_TONE_OPTIONS.filter(
    (option) => option.value !== "custom" || !onBrandBand || tone === "custom",
  );

  const backdrop = backdropColorFor(style?.background ?? "default", theme);
  const rendered = tintOn(requested, backdrop);
  const wasAdjusted = tone === "custom" && rendered.toUpperCase() !== requested.toUpperCase();

  return (
    <div className="border-t pt-5">
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium">Icon colour</span>
        <select
          value={tone}
          onChange={(event) => {
            const next = event.target.value as TextTone;
            onChange(
              next === "custom" ? { iconTone: next, iconColor: requested } : { iconTone: next },
            );
          }}
          className={inputClass}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {tone === "custom" && !onBrandBand && (
        <div className="mt-2.5 space-y-2">
          <ColorPicker
            value={requested}
            onChange={(iconColor) => onChange({ iconTone: "custom", iconColor })}
            label="Highlight icon colour"
          />
          {wasAdjusted && (
            <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
              <span
                aria-hidden="true"
                className="mt-0.5 size-3 shrink-0 rounded-sm ring-1 ring-inset ring-black/15"
                style={{ background: rendered }}
              />
              <span>
                Adjusted to <span className="font-mono uppercase">{rendered}</span> so it stays
                visible on this section’s background.
              </span>
            </p>
          )}
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            A custom colour stops following your site’s theme. The other three options update on
            their own when you change your brand colour.
          </p>
        </div>
      )}
    </div>
  );
}
