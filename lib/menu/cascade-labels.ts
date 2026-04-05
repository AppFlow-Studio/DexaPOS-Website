/**
 * Cascade Labels — single source of truth for all merchant-facing
 * pricing-scope wording in the menu UI.
 *
 * The 5-level price cascade:
 *   L1 = Global base             (menu_items)
 *   L2 = Location base override  (location_item_overrides)
 *   L3 = Category (global)       (category_items)
 *   L4 = Location + Category     (location_category_item_overrides)
 *   L5 = Menu @ Location         (location_menu_item_overrides)
 *
 * Merchants should NEVER see the word "Level" in UI copy. Always route
 * through scopeLabel() / affectsLabel().
 */

import {
  Globe,
  Building2,
  Tag,
  Layers,
  BookOpen,
  type LucideIcon,
} from "lucide-react";

export type CascadeLevel = 1 | 2 | 3 | 4 | 5;

export interface ScopeContext {
  level: CascadeLevel;
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
 *   {level:2, locationName:"Downtown"} → "Downtown override"
 *   {level:3, categoryName:"Burgers"} → "Burgers category"
 *   {level:4, categoryName:"Burgers", locationName:"Downtown"} → "Burgers at Downtown"
 *   {level:5, menuName:"Lunch", locationName:"Downtown"} → "Lunch menu at Downtown"
 */
export function scopeLabel(ctx: ScopeContext): string {
  switch (ctx.level) {
    case 1:
      return "Everywhere";
    case 2:
      return ctx.locationName
        ? `${ctx.locationName} override`
        : "Location override";
    case 3:
      return ctx.categoryName
        ? `${ctx.categoryName} category`
        : "Category default";
    case 4:
      if (ctx.categoryName && ctx.locationName) {
        return `${ctx.categoryName} at ${ctx.locationName}`;
      }
      if (ctx.locationName) return `${ctx.locationName} category`;
      if (ctx.categoryName) return `${ctx.categoryName} at location`;
      return "Category at location";
    case 5:
      if (ctx.menuName && ctx.locationName) {
        return `${ctx.menuName} menu at ${ctx.locationName}`;
      }
      if (ctx.menuName) return `${ctx.menuName} menu`;
      if (ctx.locationName) return `Menu at ${ctx.locationName}`;
      return "Menu at location";
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
 *   {level:2, locationName:"Downtown"} → "Downtown only"
 *   {level:5, menuName:"Lunch", locationName:"Downtown"} → "Lunch menu at Downtown only"
 */
export function affectsLabel(ctx: ScopeContext): string {
  switch (ctx.level) {
    case 1:
      return "all locations";
    case 2:
      return ctx.locationName
        ? `${ctx.locationName} only`
        : "this location only";
    case 3:
      return ctx.categoryName
        ? `${ctx.categoryName} category, all locations`
        : "this category, all locations";
    case 4: {
      const cat = ctx.categoryName || "this category";
      const loc = ctx.locationName || "this location";
      return `${cat} at ${loc} only`;
    }
    case 5: {
      const menu = ctx.menuName || "this menu";
      const loc = ctx.locationName || "this location";
      return `${menu} menu at ${loc} only`;
    }
  }
}

// ============================================================================
// Verbose scope description (used in banners / tooltips)
// ============================================================================

export function scopeDescription(ctx: ScopeContext): string {
  switch (ctx.level) {
    case 1:
      return "Changes here apply everywhere by default.";
    case 2:
      return ctx.locationName
        ? `Changes here apply only at ${ctx.locationName}.`
        : "Changes here apply only at this location.";
    case 3:
      return ctx.categoryName
        ? `Sets the default price for ${ctx.categoryName} across every location.`
        : "Sets the default price for this category across every location.";
    case 4: {
      const cat = ctx.categoryName || "this category";
      const loc = ctx.locationName || "this location";
      return `Applies to ${cat} at ${loc} only.`;
    }
    case 5: {
      const menu = ctx.menuName || "this menu";
      const loc = ctx.locationName || "this location";
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
      return "Location";
    case 3:
      return "Category";
    case 4:
      return "Category @ Location";
    case 5:
      return "Menu @ Location";
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
      return Building2;
    case 3:
      return Tag;
    case 4:
      return Layers;
    case 5:
      return BookOpen;
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
 *   emerald = safe-global (affects everything)
 *   blue    = safe-local (location-scoped)
 *   violet  = category default
 *   amber   = category+location
 *   rose    = menu+location (most specific)
 */
export function scopeColor(level: CascadeLevel): ScopeColor {
  switch (level) {
    case 1:
      return {
        text: "text-emerald-700",
        bg: "bg-emerald-50",
        border: "border-emerald-200",
        dot: "bg-emerald-500",
      };
    case 2:
      return {
        text: "text-blue-700",
        bg: "bg-blue-50",
        border: "border-blue-200",
        dot: "bg-blue-500",
      };
    case 3:
      return {
        text: "text-violet-700",
        bg: "bg-violet-50",
        border: "border-violet-200",
        dot: "bg-violet-500",
      };
    case 4:
      return {
        text: "text-amber-700",
        bg: "bg-amber-50",
        border: "border-amber-200",
        dot: "bg-amber-500",
      };
    case 5:
      return {
        text: "text-rose-700",
        bg: "bg-rose-50",
        border: "border-rose-200",
        dot: "bg-rose-500",
      };
  }
}

// ============================================================================
// Helpers for inferring scope from location-store + URL context
// ============================================================================

/**
 * Map the legacy `PriceSource` string enum from `types/menu.ts` to a
 * cascade level. Safe to import from UI components.
 */
export function priceSourceToLevel(
  src: string | null | undefined,
): CascadeLevel {
  switch (src) {
    case "location_menu":
      return 5;
    case "location_category":
      return 4;
    case "category":
      return 3;
    case "location_item":
      return 2;
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

  // Menu + Category + Location -> L5
  if (hasMenu && hasCategory && !isAllLocations) {
    return { level: 5, menuName, locationName, categoryName };
  }
  // Category + Location -> L4
  if (hasCategory && !isAllLocations) {
    return { level: 4, categoryName, locationName };
  }
  // Category + All -> L3
  if (hasCategory && isAllLocations) {
    return { level: 3, categoryName };
  }
  // Location only -> L2
  if (!isAllLocations) {
    return { level: 2, locationName };
  }
  // All -> L1
  return { level: 1 };
}
