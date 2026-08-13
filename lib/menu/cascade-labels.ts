/**
 * Cascade Labels — single source of truth for all merchant-facing
 * pricing-scope wording in the menu UI.
 *
 * The 5-level price cascade:
 *   L1 = Global item base            (menu_items)
 *   L2 = Global category item base   (category_items, no location scope)
 *   L3 = Branch category item base   (location_category_item_overrides)
 *   L4 = Global menu category base   (category_items in menu context, no location scope)
 *   L5 = Branch menu category base   (location_menu_item_overrides)
 *
 * Merchants should NEVER see the word "Level" in UI copy. Always route
 * through scopeLabel() / affectsLabel().
 */

import {
  Globe,
  Tag,
  Building2,
  BookOpen,
  Layers,
  type LucideIcon,
} from "lucide-react";

export type CascadeLevel = 1 | 2 | 3 | 4 | 5;

export interface ScopeContext {
  level: CascadeLevel;
  /**
   * A branch-level item override does not belong to the category cascade, but
   * it still uses the branch colour/icon treatment. Mark it explicitly so the
   * UI does not describe an item-only save as a category change.
   */
  scopeType?: "cascade" | "location-item";
  locationName?: string | null;
  categoryName?: string | null;
  menuName?: string | null;
}

// ============================================================================
// Label: "What scope am I editing?"
// ============================================================================

/**
 * Short label for the current scope (used in headers, badges).
 * Examples:
 *   {level:1} → "Everywhere"
 *   {level:2, categoryName:"Burgers"} → "Burgers category"
 *   {level:3, categoryName:"Burgers", locationName:"Downtown"} → "Burgers at Downtown"
 *   {level:4, menuName:"Lunch", categoryName:"Burgers"} → "Lunch menu – Burgers"
 *   {level:5, menuName:"Lunch", locationName:"Downtown"} → "Lunch menu at Downtown"
 */
export function scopeLabel(ctx: ScopeContext): string {
  if (ctx.scopeType === "location-item") {
    return ctx.locationName ? `${ctx.locationName} only` : "This location only";
  }

  switch (ctx.level) {
    case 1:
      return "Everywhere";
    case 2:
      return ctx.categoryName
        ? `${ctx.categoryName} category`
        : "Category default";
    case 3: {
      const cat = ctx.categoryName || "this category";
      const loc = ctx.locationName || "this branch";
      return `${cat} at ${loc}`;
    }
    case 4:
      if (ctx.menuName && ctx.categoryName) {
        return `${ctx.menuName} menu – ${ctx.categoryName}`;
      }
      if (ctx.menuName) return `${ctx.menuName} menu`;
      if (ctx.categoryName) return `${ctx.categoryName} (menu)`;
      return "Menu category";
    case 5:
      if (ctx.menuName && ctx.locationName) {
        return `${ctx.menuName} menu at ${ctx.locationName}`;
      }
      if (ctx.menuName) return `${ctx.menuName} menu`;
      if (ctx.locationName) return `Menu at ${ctx.locationName}`;
      return "Branch menu";
  }
}

// ============================================================================
// Label: "What does my save affect?"
// ============================================================================

/**
 * Human label for the blast-radius of a save at this scope.
 * Used in AffectsTag next to Save buttons.
 * Examples:
 *   {level:1} → "all locations"
 *   {level:2, categoryName:"Burgers"} → "Burgers category, all locations"
 *   {level:3, categoryName:"Burgers", locationName:"Downtown"} → "Burgers category at Downtown only"
 *   {level:4, menuName:"Lunch"} → "Lunch menu category, all locations"
 *   {level:5, menuName:"Lunch", locationName:"Downtown"} → "Lunch menu at Downtown only"
 */
export function affectsLabel(ctx: ScopeContext): string {
  if (ctx.scopeType === "location-item") {
    return ctx.locationName ? `${ctx.locationName} only` : "this location only";
  }

  switch (ctx.level) {
    case 1:
      return "all locations";
    case 2:
      return ctx.categoryName
        ? `${ctx.categoryName} category, all locations`
        : "this category, all locations";
    case 3: {
      const loc = ctx.locationName || "this branch";
      return ctx.categoryName
        ? `${ctx.categoryName} category at ${loc} only`
        : `this category at ${loc} only`;
    }
    case 4: {
      const menu = ctx.menuName ? `${ctx.menuName} menu` : "this menu";
      const cat = ctx.categoryName ? ` – ${ctx.categoryName}` : "";
      return `${menu}${cat}, all locations`;
    }
    case 5: {
      const menu = ctx.menuName ? `${ctx.menuName} menu` : "this menu";
      const loc = ctx.locationName || "this branch";
      return `${menu} at ${loc} only`;
    }
  }
}

// ============================================================================
// Verbose scope description (used in banners / tooltips)
// ============================================================================

export function scopeDescription(ctx: ScopeContext): string {
  if (ctx.scopeType === "location-item") {
    const loc = ctx.locationName || "this location";
    return `Changes apply to this item at ${loc} only.`;
  }

  switch (ctx.level) {
    case 1:
      return "Changes here apply everywhere by default.";
    case 2:
      return ctx.categoryName
        ? `Sets the default price for ${ctx.categoryName} across every location and menu.`
        : "Sets the default price for this category across every location.";
    case 3: {
      const cat = ctx.categoryName || "this category";
      const loc = ctx.locationName || "this branch";
      return `Applies to ${cat} at ${loc} only. Overrides the global category price.`;
    }
    case 4: {
      const menu = ctx.menuName || "this menu";
      return `Sets the price for this item in the ${menu} menu across all locations.`;
    }
    case 5: {
      const menu = ctx.menuName || "this menu";
      const loc = ctx.locationName || "this branch";
      return `Applies to the ${menu} menu at ${loc} only.`;
    }
  }
}

// ============================================================================
// Short scope name (used in cascade ladder rungs)
// ============================================================================

export function scopeShortName(level: CascadeLevel): string {
  switch (level) {
    case 1:
      return "Global";
    case 2:
      return "Global Category";
    case 3:
      return "Branch Category";
    case 4:
      return "Global Menu";
    case 5:
      return "Branch Menu";
  }
}

// ============================================================================
// Icons & colors
// ============================================================================

export function scopeIcon(level: CascadeLevel): LucideIcon {
  switch (level) {
    case 1:
      return Globe;
    case 2:
      return Tag;
    case 3:
      return Building2;
    case 4:
      return BookOpen;
    case 5:
      return Layers;
  }
}

export interface ScopeColor {
  text: string;
  bg: string;
  border: string;
  dot: string;
}

/**
 * Tailwind classes for each scope level. Color hierarchy:
 *   emerald = safe-global (L1, affects everything)
 *   violet  = category default (L2, global category)
 *   blue    = branch-scoped (L3, branch category)
 *   amber   = menu-global (L4, global menu)
 *   rose    = branch menu (L5, most specific)
 *
 * Every entry carries a `dark:` variant. Without one, a `bg-*-50` tint renders
 * as a near-white block on the dark dashboard card, which is a class of bug an
 * engineer testing in light mode never reproduces (C4 in the design system).
 *
 * ⚠️ These strings live in a `.ts` file, which Tailwind does not scan (C7).
 * They generate CSS only because each class is also written literally in some
 * `.tsx`. Before introducing a *new* class here, grep the `.tsx` files for it —
 * an unmatched class lands in the DOM with no rule behind it and the element
 * silently inherits.
 */
export function scopeColor(level: CascadeLevel): ScopeColor {
  switch (level) {
    case 1:
      return {
        text: "text-emerald-700 dark:text-emerald-400",
        bg: "bg-emerald-50 dark:bg-emerald-900/20",
        border: "border-emerald-200 dark:border-emerald-900",
        dot: "bg-emerald-500",
      };
    case 2:
      return {
        text: "text-violet-700 dark:text-violet-400",
        bg: "bg-violet-50 dark:bg-violet-900/20",
        border: "border-violet-200 dark:border-violet-900",
        dot: "bg-violet-500",
      };
    case 3:
      return {
        text: "text-blue-700 dark:text-blue-400",
        bg: "bg-blue-50 dark:bg-blue-900/20",
        border: "border-blue-200 dark:border-blue-900",
        dot: "bg-blue-500",
      };
    case 4:
      return {
        text: "text-amber-700 dark:text-amber-400",
        bg: "bg-amber-50 dark:bg-amber-900/20",
        border: "border-amber-200 dark:border-amber-900",
        dot: "bg-amber-500",
      };
    case 5:
      return {
        text: "text-rose-700 dark:text-rose-400",
        bg: "bg-rose-50 dark:bg-rose-900/20",
        border: "border-rose-200 dark:border-rose-900",
        dot: "bg-rose-500",
      };
  }
}

// ============================================================================
// Helpers for inferring scope from location-store + URL context
// ============================================================================

/**
 * Map the `price_source` string returned by DB RPCs to a cascade level.
 * Safe to import from UI components.
 */
export function priceSourceToLevel(
  src: string | null | undefined,
): CascadeLevel {
  switch (src) {
    case "location_menu":
      return 5;
    case "location_category":
      return 3;  // old L4 → new L3 (branch category)
    case "category":
      return 2;  // old L3 → new L2 (global category)
    case "location_item":
      return 1;  // not a main level in the new hierarchy, treat as base
    case "base":
    default:
      return 1;
  }
}

/**
 * Derive a ScopeContext from the common "item list" routing signals.
 * Matches the getEditingContext() logic in NewEditItemFormSheet but returns
 * a minimal merchant-facing ScopeContext instead of the table-bound EditingContext.
 */
export function deriveScopeFromContext(args: {
  isAllLocations: boolean;
  locationName?: string | null;
  categoryName?: string | null;
  menuName?: string | null;
  hasCategory?: boolean;
  hasMenu?: boolean;
}): ScopeContext {
  const {
    isAllLocations,
    locationName,
    categoryName,
    menuName,
    hasCategory = !!args.categoryName,
    hasMenu = !!args.menuName,
  } = args;

  // L5: Branch Menu (menu + category + specific location)
  if (hasMenu && hasCategory && !isAllLocations) {
    return { level: 5, menuName, locationName, categoryName };
  }
  // L4: Global Menu (menu + category + all locations)
  if (hasMenu && hasCategory && isAllLocations) {
    return { level: 4, menuName, categoryName };
  }
  // L3: Branch Category (category + specific location, no menu)
  if (hasCategory && !isAllLocations) {
    return { level: 3, categoryName, locationName };
  }
  // L2: Global Category (category + all locations, no menu)
  if (hasCategory && isAllLocations) {
    return { level: 2, categoryName };
  }
  // L1: Global Base
  return { level: 1 };
}
