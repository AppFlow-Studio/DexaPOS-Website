// components/dashboard/menus/NewEditItemFormSheet.tsx

"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CdnImageUploadField } from "@/components/ui/cdn-image-upload-field";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { ItemPreviewCard } from "./ItemPreviewCard";
import {
  ChevronDown,
  ChevronRight,
  DollarSign,
  Tag,
  Layers,
  Settings2,
  AlertCircle,
  Sparkles,
  MapPin,
  RotateCcw,
  Info,
  Globe,
  Building2,
  Menu as MenuIcon,
  CheckCircle2,
  Plus,
  X,
  Grip,
  Search,
  Loader2,
  Flame,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useMerchantCdnImageUpload } from "@/lib/cdn/use-merchant-cdn-image-upload";
import {
  clearLocalStorageDraft,
  readLocalStorageDraft,
  writeLocalStorageDraft,
} from "@/lib/browser/local-storage-draft";
import {
  UpdateMenuItem,
  CreateMenuItem,
  ResetMenuItemToGlobal,
} from "@/app/dashboard/actions/menu-items";
import { AddItemToCategory, RemoveItemFromCategory } from "@/app/dashboard/actions/item-assignments";
import {
  CategoriesModel,
  ModifierGroupsModel,
  ModifierGroupItemsModel,
} from "@/types/db-modles";
import { useLocationStore, useIsAllLocations } from "@/stores/location-store";
import ModifierItemRow, { ExtendedModifierItem } from "./ModifierItemRow";
import { LocationLibraryItem, ModifierGroup, ModifierItem } from "@/types/menu";
import {
  LevelIndicator,
  EditingContextBanner,
  getEditingLevel,
  type PricingLevel,
} from "./LevelIndicator";
import { AffectsTag } from "./AffectsTag";
import { DisabledFieldBanner } from "./DisabledFieldBanner";
import { CascadeLadder } from "./CascadeLadder";
import {
  TAX_CATEGORIES,
  TAX_CATEGORY_LABELS,
  TAX_CATEGORY_DESCRIPTIONS,
  TaxCategory,
} from "@/types/tax";
import {
  AVAILABLE_CHANNELS,
  CHANNEL_LABELS,
  CHANNEL_DESCRIPTIONS,
} from "@/types/inventory";
import { useLocationTaxRates } from "@/app/dashboard/hooks/useTaxRates";
import Link from "next/link";
import {
  resetItemToLevel,
  updateItemOverride,
  UpdateItemParams,
  FlatItem,
  getItemModifierGroups,
} from "@/app/dashboard/actions/menu-items-rpc";
import {
  GetItemIsPopular,
  SetItemPopular,
  GetItemIsNew,
  SetItemNew,
} from "@/app/dashboard/actions/location-menu-overrides";
import { RecipeManager } from "@/app/dashboard/menu/components/RecipeManager";
import { PriceInputGroup } from "@/components/dashboard/locations/PriceInputGroup";
import { useEffectivePricing } from "@/app/dashboard/hooks/useEffectivePricing";
import {
  usePrepStations,
  useCategoryPrepDefaults,
} from "@/app/dashboard/hooks/usePrepStations";
import { useUserInfo } from "@/app/manage/hooks/useUserInfo.";

// ============================================================================
// TYPES
// ============================================================================

interface PriceLevels {
  level_1_base: number;
  level_1_cash: number | null;
  level_2_location_item: number | null;
  level_2_location_item_cash?: number | null;
  level_2_modifier: number | null;
  level_2_modifier_type: "add" | "percent" | null;
  level_3_category: number | null;           // UI L2: Global category price
  level_3_category_cash?: number | null;
  level_3_menu_category: number | null;      // UI L4: Global menu category price (new)
  level_3_menu_category_cash?: number | null;
  level_4_location_category: number | null;  // UI L3: Branch category price
  level_4_location_category_cash?: number | null;
  level_5_location_menu: number | null;      // UI L5: Branch menu price
  level_5_location_menu_cash?: number | null;
  // Delivery pricing
  level_1_delivery: number | null;
  level_2_location_item_delivery?: number | null;
  level_3_category_delivery?: number | null;
  level_3_menu_category_delivery?: number | null;
  level_4_location_category_delivery?: number | null;
  level_5_location_menu_delivery?: number | null;
}

export interface EditItemWithOverrides {
  id: string;
  name: string;
  description?: string;
  price: number;
  cash_price?: number | null;
  location_id?: string | null;
  image?: string;
  image_url?: string;
  availability: boolean;
  allergens?: string[];
  card_bg_color?: string;
  stock_tracking_mode?: string;
  meal_types?: string[];
  /** @deprecated Use category_items instead */
  menu_item_categories?: Array<{
    category_id: string;
    category?: { id: string; name: string };
  }>;
  // Support multiple formats: full category_items from DB, or simple { id, name } from RPC
  category_items?: Array<
    | {
        category_id: string;
        custom_price?: number | null;
        category?: { id: string; name: string };
      }
    | { id: string; name: string }
  >;
  // Support multiple formats: junction table format or direct ModifierGroup[]
  menu_item_modifier_groups?: Array<{
    id: string;
    name: string;
    description: string | null;
    base_min_selections: number;
    base_max_selections: number | null;
    base_is_required: boolean;
    base_is_active: boolean;
    location_override: {
      id: string;
      custom_price: number | null;
      custom_cash_price: number | null;
      price_modifier: number | null;
      price_modifier_type: string | null;
      is_available: boolean;
      stock_tracking_mode: string | null;
      current_stock: number | null;
      tax_category: string | null;
      is_tax_exempt: boolean | null;
      available_channels: string[] | null;
    } | null;
    effective_availability: boolean;
    has_location_override: boolean;
    items: Array<{
      id: string;
      name: string;
      description: string | null;
      base_price: number;
      base_is_default: boolean;
      base_is_active: boolean;
      location_override: {
        id: string;
        custom_price: number | null;
        price_modifier: number | null;
        price_modifier_type: string | null;
        is_available: boolean;
        stock_tracking_mode: string | null;
        current_stock: number | null;
      } | null;
      effective_price: number;
      effective_is_active: boolean;
      has_location_override: boolean;
    }>;
  }>;

  // Price level data (5-level cascade)
  price_levels?: PriceLevels;
  effective_price?: number;
  effective_cash_price?: number | null;
  effective_delivery_price?: number | null;
  current_level?: 1 | 2 | 3 | 4 | 5;

  // Delivery pricing
  delivery_price?: number | null;

  // Prep Station (KDS Routing - migration 022)
  prep_station_id?: string | null;

  // Override flags for 5-level cascade
  has_location_item_override?: boolean;
  has_category_override?: boolean; // NEW: L3
  has_location_category_override?: boolean; // NEW: L4
  has_location_menu_override?: boolean; // L5

  // Override data
  location_item_override?: {
    id: string;
    custom_price?: number | null;
    custom_cash_price?: number | null;
  };
  category_item?: {
    id: string;
    custom_price?: number | null;
    custom_cash_price?: number | null;
  };
  location_category_override?: {
    id: string;
    custom_price?: number | null;
    custom_cash_price?: number | null;
  };
  location_menu_override?: {
    id: string;
    custom_price?: number | null;
    custom_cash_price?: number | null;
  };
}

interface NewEditItemFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clerkOrgId: string | undefined;
  categories?: (CategoriesModel & { is_global?: boolean; location_name?: string | null })[];
  modifierGroups?: (ModifierGroupsModel & {
    modifier_group_items: ModifierGroupItemsModel[];
  })[];
  onSuccess?: () => void;

  // Item data
  editItem?: EditItemWithOverrides;

  // Context - IMPORTANT: This determines which table gets updated
  menuId?: string | null; // null = Items Library, string = within a menu
  categoryId?: string | null; // null = no category context, string = within a category
  categoryName?: string; // For display purposes
  menuName?: string; // For display purposes
  isMenuLocationOwned?: boolean; // Is the menu a location-specific menu (Level 5)?
  /**
   * Controls how much of the form renders.
   * - "full" (default): the entire mega-form
   * - "inline-price": only the Pricing section, used for quick price edits
   *    triggered from matrix cells / PriceSourcePopover.
   * When NEXT_PUBLIC_NEW_ITEM_EDIT is "true" and mode is "full", the
   * component logs a warning in dev since callers should route to the
   * dedicated edit page instead.
   */
  mode?: "full" | "inline-price";
  /** Called when the user clicks "Open Global Edit". Should navigate to /dashboard/menu/items/[id]/edit */
  onOpenGlobalEdit?: () => void;
}

interface NewEditItemDraft {
  values: ItemFormValues;
  selectedCategories: string[];
  selectedModifiers: string[];
}

// Form schema
const itemSchema = z.object({
  name: z
    .string()
    .min(2, "Item name must be at least 2 characters")
    .max(100, "Item name must be less than 100 characters"),
  description: z
    .string()
    .max(500, "Description must be less than 500 characters")
    .optional(),
  price: z.number().min(0, "Price must be positive"),
  cash_price: z
    .number()
    .min(0, "Cash price must be positive")
    .optional()
    .nullable(),
  delivery_price: z.number().min(0).optional().nullable(),
  image_url: z.string().optional(),
  availability: z.boolean().default(true),
  allergens: z.array(z.string()).default([]),
  card_bg_color: z.string().optional().nullable(),
  stock_tracking_mode: z
    .enum(["in_stock", "out_of_stock", "quantity"])
    .default("in_stock"),

  // Tax & Inventory Control fields (migration 014)
  tax_category: z
    .enum(["standard", "alcohol", "food", "grocery", "retail", "service"])
    .default("standard"),
  is_tax_exempt: z.boolean().default(false),
  available_channels: z
    .array(z.enum(["pos", "online", "kiosk"]))
    .default(["pos", "online"]),

  // Prep Station (KDS Routing - migration 022)
  prep_station_id: z.string().nullable().optional(),
});

type ItemFormValues = z.infer<typeof itemSchema>;

const COMMON_ALLERGENS = [
  "Dairy",
  "Eggs",
  "Fish",
  "Shellfish",
  "Tree Nuts",
  "Peanuts",
  "Wheat",
  "Soy",
  "Sesame",
];

// ============================================================================
// HELPER: Determine editing context
// ============================================================================

type EditingContext = {
  level: 1 | 2 | 3 | 4 | 5;
  table: string;
  description: string;
  canEditBaseFields: boolean;
  priceLabel: string;
  resetToLevel: 1 | 2 | 3 | 4 | 5 | null;
  resetLabel: string | null;
};

function getEditingContext(
  isAllLocations: boolean,
  menuId: string | null | undefined,
  categoryId: string | null | undefined,
  isMenuLocationOwned: boolean | undefined,
): EditingContext {
  // Items Library + All Locations + No Category = Level 1 (Global Base)
  if (!menuId && !categoryId && isAllLocations) {
    return {
      level: 1,
      table: "menu_items",
      description:
        "Editing global item. Changes affect all locations and menus.",
      canEditBaseFields: true,
      priceLabel: "Base Price",
      resetToLevel: null,
      resetLabel: null,
    };
  }

  // Level 2: Global Category Base (category, no menu, all locations)
  if (categoryId && isAllLocations && !menuId) {
    return {
      level: 2,
      table: "category_items",
      description:
        "Editing category-specific pricing. This price applies at all locations for this category.",
      canEditBaseFields: false,
      priceLabel: "Category Price",
      resetToLevel: 1,   // RPC target: 1 = clears category_items, back to global base
      resetLabel: "Reset to Base Price",
    };
  }

  // Level 3: Branch Category Base (category, no menu, specific location)
  if (categoryId && !isAllLocations && !menuId) {
    return {
      level: 3,
      table: "location_category_item_overrides",
      description:
        "Editing branch category pricing. This price applies to this category at this branch only.",
      canEditBaseFields: false,
      priceLabel: "Branch Category Price",
      resetToLevel: 3,   // RPC target: 3 = clears location_category (old L4), keeps category_items (old L3 = new L2)
      resetLabel: "Reset to Category Price",
    };
  }

  // Level 4: Global Menu Category Base (menu + category, all locations / global menu)
  if (menuId && categoryId && isAllLocations) {
    return {
      level: 4,
      table: "category_items",
      description:
        "Editing menu category pricing. This price applies to all locations in this menu.",
      canEditBaseFields: false,
      priceLabel: "Menu Category Price",
      resetToLevel: 1,   // RPC target: 1 = clears category_items, back to global base
      resetLabel: "Reset to Base Price",
    };
  }

  // Level 5: Branch Menu Category Base (menu + category + specific location)
  if (menuId && categoryId && !isAllLocations) {
    return {
      level: 5,
      table: "location_menu_item_overrides",
      description: isMenuLocationOwned
        ? "Editing your location's menu. You have full control over this pricing."
        : "Editing this menu at your branch only. Other branches are not affected.",
      canEditBaseFields: false,
      priceLabel: isMenuLocationOwned ? "Your Menu Price" : "Branch Menu Price",
      resetToLevel: 4,   // RPC target: 4 = clears location_menu (old L5), keeps location_category (old L4 = new L3)
      resetLabel: "Reset to Branch Category",
    };
  }

  // Items Library + specific location + no category = no cascade level (treat as L1 display)
  if (!menuId && !categoryId && !isAllLocations) {
    return {
      level: 1,
      table: "menu_items",
      description:
        "Editing item. Switch to 'All Locations' to edit the global base price.",
      canEditBaseFields: false,
      priceLabel: "Base Price",
      resetToLevel: null,
      resetLabel: null,
    };
  }

  // Fallback
  return {
    level: 1,
    table: "menu_items",
    description: "Editing item.",
    canEditBaseFields: true,
    priceLabel: "Price",
    resetToLevel: null,
    resetLabel: null,
  };
}

// ============================================================================
// EDITING CONTEXT INDICATOR
// ============================================================================

// Level metadata is now sourced from the shared cascade-labels helper so
// there is a single source of truth for merchant-facing scope copy.
import {
  scopeLabel as getScopeLabel,
  scopeDescription as getScopeDescription,
  affectsLabel as getAffectsLabel,
  scopeIcon as getScopeIcon,
  scopeColor as getScopeColor,
  type CascadeLevel,
  type ScopeContext,
} from "@/lib/menu/cascade-labels";

type LevelInfo = {
  name: string;
  icon: ReturnType<typeof getScopeIcon>;
  color: string;
  bgColor: string;
  borderColor: string;
  description: string;
  affects: string;
};

function buildLevelInfo(ctx: ScopeContext): LevelInfo {
  const colors = getScopeColor(ctx.level);
  return {
    name: getScopeLabel(ctx),
    icon: getScopeIcon(ctx.level),
    color: colors.text,
    bgColor: colors.bg,
    borderColor: colors.border,
    description: getScopeDescription(ctx),
    affects: getAffectsLabel(ctx),
  };
}

// Back-compat shim: static level-keyed lookup with generic (no name) context.
// Used only for the hierarchy chip grid where we intentionally don't have
// per-row context strings.
const LEVEL_INFO: Record<CascadeLevel, LevelInfo> = {
  1: buildLevelInfo({ level: 1 }),
  2: buildLevelInfo({ level: 2 }),
  3: buildLevelInfo({ level: 3 }),
  4: buildLevelInfo({ level: 4 }),
  5: buildLevelInfo({ level: 5 }),
} as const;

function EditingContextIndicator({ context }: { context: EditingContext }) {
  const [isOpen, setIsOpen] = React.useState(false);
  const levelInfo = LEVEL_INFO[context.level];
  const Icon = levelInfo.icon;

  return (
    <div className="relative">
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg border transition-all cursor-help hover:shadow-sm",
          levelInfo.bgColor,
          levelInfo.borderColor,
          levelInfo.color,
        )}
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
      >
        <Icon className="h-4 w-4" />
        <span className="text-sm font-medium">{levelInfo.name}</span>
        <Info className="h-3.5 w-3.5 opacity-60" />
      </div>

      {/* Hover Card */}
      {isOpen && (
        <div
          className="absolute bottom-full left-0 mb-2 w-80 p-4 bg-background border rounded-lg shadow-xl z-50 animate-in fade-in-0 zoom-in-95 duration-150"
          onMouseEnter={() => setIsOpen(true)}
          onMouseLeave={() => setIsOpen(false)}
        >
          <div className="space-y-3">
            {/* Header */}
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "h-9 w-9 rounded-lg flex items-center justify-center shrink-0",
                  levelInfo.bgColor,
                )}
              >
                <Icon className={cn("h-4 w-4", levelInfo.color)} />
              </div>
              <div>
                <h4 className="font-semibold text-sm">{levelInfo.name}</h4>
                <p className="text-xs text-muted-foreground">
                  Level {context.level} Pricing
                </p>
              </div>
            </div>

            {/* Description */}
            <p className="text-sm text-muted-foreground">
              {levelInfo.description}
            </p>

            {/* Affects */}
            <div className="rounded-lg bg-muted/50 p-2.5">
              <p className="text-[11px] font-medium text-muted-foreground mb-0.5">
                Changes will affect:
              </p>
              <p className="text-xs font-medium">{levelInfo.affects}</p>
            </div>

            {/* Price Hierarchy - Compact */}
            <div className="space-y-1.5">
              <p className="text-[11px] font-medium text-muted-foreground">
                Price Hierarchy:
              </p>
              <div className="flex flex-wrap gap-1">
                {[1, 2, 3, 4, 5].map((level) => {
                  const info = LEVEL_INFO[level as keyof typeof LEVEL_INFO];
                  const LevelIcon = info.icon;
                  const isCurrentLevel = level === context.level;

                  return (
                    <div
                      key={level}
                      className={cn(
                        "flex items-center gap-1 px-2 py-1 rounded text-[10px]",
                        isCurrentLevel
                          ? cn(
                              info.bgColor,
                              info.borderColor,
                              "border",
                              info.color,
                              "font-medium",
                            )
                          : "bg-muted/30 text-muted-foreground",
                      )}
                    >
                      <LevelIcon className="h-3 w-3" />
                      <span>{level}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Reset info */}
            {context.resetLabel && (
              <div className="pt-2 border-t flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <RotateCcw className="h-3 w-3" />
                <span>"{context.resetLabel}" removes this override</span>
              </div>
            )}
          </div>

          {/* Arrow */}
          <div className="absolute -bottom-1.5 left-6 w-3 h-3 bg-background border-b border-r rotate-45" />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MODIFIER GROUP SEARCH LIST
// ============================================================================

interface ModifierGroupSearchListProps {
  availableGroups: (ModifierGroupsModel & {
    modifier_group_items: ModifierGroupItemsModel[];
  })[];
  onSelect: (groupId: string) => void;
}

function ModifierGroupSearchList({
  availableGroups,
  onSelect,
}: ModifierGroupSearchListProps) {
  const [searchQuery, setSearchQuery] = React.useState("");

  const filteredGroups = React.useMemo(() => {
    if (!searchQuery.trim()) return availableGroups;
    const query = searchQuery.toLowerCase();
    return availableGroups.filter(
      (group) =>
        group.name.toLowerCase().includes(query) ||
        group.description?.toLowerCase().includes(query),
    );
  }, [availableGroups, searchQuery]);

  return (
    <div className="rounded-lg border bg-muted/30 overflow-hidden">
      {/* Search Input */}
      <div className="p-2 border-b bg-background/50">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search modifier groups..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-9 pl-9 pr-3 rounded-md border bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Results */}
      <div className="p-2 space-y-1 max-h-[200px] overflow-y-auto">
        {filteredGroups.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            {searchQuery ? (
              <>
                <Search className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p>No modifier groups match "{searchQuery}"</p>
              </>
            ) : (
              <p>No available modifier groups</p>
            )}
          </div>
        ) : (
          <>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-2">
              {searchQuery
                ? `${filteredGroups.length} result${
                    filteredGroups.length !== 1 ? "s" : ""
                  }`
                : "Available Modifier Groups"}
            </div>
            {filteredGroups.map((group) => (
              <button
                key={group.id}
                type="button"
                onClick={() => onSelect(group.id)}
                className="w-full p-2.5 rounded-md bg-background hover:bg-accent transition-colors text-left flex items-center gap-3 group"
              >
                <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center shrink-0 group-hover:bg-purple-100 transition-colors">
                  <Layers className="h-4 w-4 text-muted-foreground group-hover:text-purple-600 transition-colors" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm flex items-center gap-2">
                    {group.name}
                    {group.is_required && (
                      <Badge
                        variant="secondary"
                        className="text-[10px] h-4 px-1.5"
                      >
                        Required
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {group.modifier_group_items?.length || 0} options
                  </div>
                </div>
                <Plus className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// COMPONENT
// ============================================================================

export function NewEditItemFormSheet({
  open,
  onOpenChange,
  clerkOrgId,
  categories = [],
  modifierGroups = [],
  onSuccess,
  editItem,
  menuId,
  categoryId,
  categoryName,
  menuName,
  isMenuLocationOwned = false,
  mode = "full",
  onOpenGlobalEdit,
}: NewEditItemFormSheetProps) {
  const queryClient = useQueryClient();

  // Dev warning: if the new edit page is enabled, callers should route to it.
  React.useEffect(() => {
    if (
      mode === "full" &&
      open &&
      process.env.NEXT_PUBLIC_NEW_ITEM_EDIT === "true" &&
      process.env.NODE_ENV !== "production"
    ) {
      // eslint-disable-next-line no-console
      console.warn(
        "[NewEditItemFormSheet] Full-mode sheet opened while NEXT_PUBLIC_NEW_ITEM_EDIT=true. Prefer routing to /dashboard/menu/items/[itemId]/edit.",
      );
    }
  }, [mode, open]);
  const { data: userInfo } = useUserInfo();
  const merchantId =
    userInfo?.members?.[0]?.organizations?.merchants?.id || "";
  const { selectedLocationId, locations } = useLocationStore();
  const isAllLocations = useIsAllLocations();
  const { pricingStrategy: effectivePricingStrategy, dualPricingPercentage: effectiveDualPercentage } = useEffectivePricing();

  // Tax rates for current location
  const { data: taxRatesData } = useLocationTaxRates();
  const taxRates = taxRatesData?.data || [];

  // Prep stations for current location (KDS routing)
  const { data: prepStations = [] } = usePrepStations(
    isAllLocations ? null : selectedLocationId,
  );
  const { data: categoryPrepDefaults = [] } = useCategoryPrepDefaults(
    isAllLocations ? null : selectedLocationId,
  );

  // Popular / New badge toggles (location-scoped, edit-only)
  const { data: isPopular = false } = useQuery({
    queryKey: ["item-popular", editItem?.id, selectedLocationId],
    queryFn: () => GetItemIsPopular(editItem!.id, selectedLocationId!),
    enabled: !!editItem?.id && !isAllLocations && !!selectedLocationId,
  });
  const popularMutation = useMutation({
    mutationFn: (value: boolean) => SetItemPopular(editItem!.id, selectedLocationId!, value),
    onSuccess: (_, value) => {
      queryClient.setQueryData(["item-popular", editItem?.id, selectedLocationId], value);
      toast.success(value ? "Marked as Popular" : "Removed Popular badge");
    },
    onError: () => toast.error("Failed to update popular flag"),
  });
  const { data: isNew = false } = useQuery({
    queryKey: ["item-new", editItem?.id, selectedLocationId],
    queryFn: () => GetItemIsNew(editItem!.id, selectedLocationId!),
    enabled: !!editItem?.id && !isAllLocations && !!selectedLocationId,
  });
  const newMutation = useMutation({
    mutationFn: (value: boolean) => SetItemNew(editItem!.id, selectedLocationId!, value),
    onSuccess: (_, value) => {
      queryClient.setQueryData(["item-new", editItem?.id, selectedLocationId], value);
      toast.success(value ? "Marked as New" : "Removed New badge");
    },
    onError: () => toast.error("Failed to update new flag"),
  });

  const [selectedCategories, setSelectedCategories] = React.useState<string[]>(
    [],
  );
  const [originalCategoryIds, setOriginalCategoryIds] = React.useState<string[]>(
    [],
  );
  const [selectedModifiers, setSelectedModifiers] = React.useState<string[]>(
    [],
  );
  const [expandedSections, setExpandedSections] = React.useState({
    general: true,
    pricing: true,
    modifiers: false,
    categories: false,
    tax: false,
    availability: false,
    locationBadges: false,
    recipe: false,
  });
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isResetting, setIsResetting] = React.useState(false);
  const [showAddModifier, setShowAddModifier] = React.useState(false);
  const [categorySearch, setCategorySearch] = React.useState("");
  const [categorySortDesc, setCategorySortDesc] = React.useState(false);

  // Alphabetically sorted + search-filtered categories. Selected ones always
  // appear at the top so the user never loses sight of what's assigned.
  const displayedCategories = React.useMemo(() => {
    const q = categorySearch.trim().toLowerCase();
    const filtered = q
      ? categories.filter((c) => c.name.toLowerCase().includes(q))
      : [...categories];
    filtered.sort((a, b) =>
      categorySortDesc
        ? b.name.localeCompare(a.name)
        : a.name.localeCompare(b.name),
    );
    // Pin selected to the top
    return [
      ...filtered.filter((c) => selectedCategories.includes(c.id)),
      ...filtered.filter((c) => !selectedCategories.includes(c.id)),
    ];
  }, [categories, categorySearch, categorySortDesc, selectedCategories]);
  const imageUpload = useMerchantCdnImageUpload({
    merchantId,
    category: "menu-items",
    fileNamePrefix: "item",
  });
  const draftHydratedRef = React.useRef(false);
  const draftKey = React.useMemo(() => {
    const scopeKey = isAllLocations ? "global" : selectedLocationId ?? "location-none";
    const menuScope = menuId ?? "library";
    const categoryScope = categoryId ?? "uncategorized";

    return merchantId
      ? `menu-item-draft:new-edit-sheet:${merchantId}:${menuScope}:${categoryScope}:${scopeKey}`
      : null;
  }, [categoryId, isAllLocations, menuId, merchantId, selectedLocationId]);
  const locationIdForEdits = isAllLocations ? null : selectedLocationId;

  const isItemLocationOwned =
    !!editItem?.location_id &&
    !isAllLocations &&
    editItem.location_id === selectedLocationId;
  const canManageModifierLinks =
    isAllLocations || isItemLocationOwned || !editItem;

  // Get editing context based on current state (includes category for 5-level cascade)
  const editingContext = React.useMemo(
    () =>
      getEditingContext(
        isAllLocations,
        menuId,
        categoryId,
        isMenuLocationOwned,
      ),
    [isAllLocations, menuId, categoryId, isMenuLocationOwned],
  );

  // Get current location name
  const currentLocationName = React.useMemo(() => {
    if (isAllLocations) return "All Locations";
    const location = locations.find((l) => l.id === selectedLocationId);
    return location?.name || "Unknown Location";
  }, [isAllLocations, selectedLocationId, locations]);

  // Merchant-facing scope for AffectsTag / headers / banners.
  // Kept separate from editingContext (which still carries table routing info).
  const scopeCtx = React.useMemo<ScopeContext>(
    () => ({
      level: editingContext.level as CascadeLevel,
      locationName: isAllLocations ? null : currentLocationName,
      categoryName: categoryName ?? null,
      menuName: menuName ?? null,
    }),
    [
      editingContext.level,
      isAllLocations,
      currentLocationName,
      categoryName,
      menuName,
    ],
  );

  // Determine which price to show in the form based on context
  const getPriceForContext = React.useCallback(() => {
    if (!editItem) return { price: 0, cashPrice: null, deliveryPrice: null as number | null };

    const levels = editItem.price_levels;
    const l1Delivery = levels?.level_1_delivery ?? editItem.delivery_price ?? null;

    // 5-level price cascade resolution
    switch (editingContext.level) {
      case 1: // Global Base
        return {
          price: levels?.level_1_base ?? editItem.price,
          cashPrice: levels?.level_1_cash ?? editItem.cash_price,
          deliveryPrice: l1Delivery,
        };
      case 2: // Global Category Base → reads from category_items (level_3_category in DB)
        return {
          price:
            levels?.level_3_category ?? levels?.level_1_base ?? editItem.price,
          cashPrice:
            levels?.level_3_category_cash ??
            levels?.level_1_cash ??
            editItem.cash_price,
          deliveryPrice: levels?.level_3_category_delivery ?? l1Delivery,
        };
      case 3: // Branch Category Base → reads from location_category_item_overrides (level_4 in DB)
        return {
          price:
            levels?.level_4_location_category ??
            levels?.level_3_category ??
            levels?.level_1_base ??
            editItem.price,
          cashPrice:
            levels?.level_4_location_category_cash ??
            levels?.level_3_category_cash ??
            levels?.level_1_cash ??
            editItem.cash_price,
          deliveryPrice:
            levels?.level_4_location_category_delivery ??
            levels?.level_3_category_delivery ??
            l1Delivery,
        };
      case 4: // Global Menu Category Base → category_items WHERE menu_id IS NOT NULL
        // If an L4 override exists, show it; otherwise inherit from L2 → L1
        return {
          price:
            levels?.level_3_menu_category ??
            levels?.level_3_category ??
            levels?.level_1_base ??
            editItem.effective_price ??
            editItem.price,
          cashPrice:
            levels?.level_3_menu_category_cash ??
            levels?.level_3_category_cash ??
            levels?.level_1_cash ??
            editItem.effective_cash_price ??
            editItem.cash_price,
          deliveryPrice:
            levels?.level_3_menu_category_delivery ??
            levels?.level_3_category_delivery ??
            l1Delivery,
        };
      case 5: // Branch Menu Category Base → location_menu_item_overrides
        // Cascade: L5 → L4(menu) → L3(branch cat) → L2(category) → L1
        return {
          price:
            levels?.level_5_location_menu ??
            levels?.level_3_menu_category ??
            levels?.level_4_location_category ??
            levels?.level_3_category ??
            levels?.level_1_base ??
            editItem.price,
          cashPrice:
            levels?.level_5_location_menu_cash ??
            levels?.level_3_menu_category_cash ??
            levels?.level_4_location_category_cash ??
            levels?.level_3_category_cash ??
            levels?.level_1_cash ??
            editItem.cash_price,
          deliveryPrice:
            levels?.level_5_location_menu_delivery ??
            levels?.level_3_menu_category_delivery ??
            levels?.level_4_location_category_delivery ??
            levels?.level_3_category_delivery ??
            l1Delivery,
        };
      default:
        return { price: editItem.price, cashPrice: editItem.cash_price, deliveryPrice: editItem.delivery_price ?? null };
    }
  }, [editItem, editingContext.level]);

  const form = useForm<ItemFormValues>({
    resolver: zodResolver(itemSchema),
    defaultValues: {
      name: "",
      description: "",
      price: 0,
      cash_price: undefined,
      delivery_price: null,
      image_url: "",
      availability: true,
      allergens: [],
      card_bg_color: "",
      stock_tracking_mode: "in_stock",
      // Tax & Inventory Control (migration 014)
      tax_category: "standard",
      is_tax_exempt: false,
      available_channels: ["pos", "online"],
      // Prep Station (migration 022)
      prep_station_id: null,
    },
  });

  React.useEffect(() => {
    if (!open) {
      draftHydratedRef.current = false;
    }
  }, [open]);

  // Reset form when editItem or context changes
  React.useEffect(() => {
    let cancelled = false;
    if (editItem) {
      const { price, cashPrice, deliveryPrice } = getPriceForContext();

      form.reset({
        name: editItem.name || "",
        description: editItem.description || "",
        price: price,
        cash_price: cashPrice ?? undefined,
        delivery_price: deliveryPrice,
        image_url: editItem.image || editItem.image_url || "",
        availability: editItem.availability ?? true,
        allergens: editItem.allergens || [],
        card_bg_color: editItem.card_bg_color || "",
        stock_tracking_mode:
          (editItem.stock_tracking_mode as
            | "in_stock"
            | "out_of_stock"
            | "quantity") || "in_stock",
        // Tax & Inventory Control fields (with fallbacks for backward compatibility)
        tax_category: ((editItem as any).tax_category || "standard") as any,
        is_tax_exempt: (editItem as any).is_tax_exempt || false,
        available_channels: ((editItem as any).available_channels || [
          "pos",
          "online",
        ]) as any,
        // Prep Station (migration 022)
        prep_station_id: editItem.prep_station_id ?? null,
      });
      imageUpload.reset(editItem.image || editItem.image_url || "");

      // Support both old menu_item_categories and new category_items.
      // category_items can arrive in two shapes:
      //   1) { category_id, category?: { id, name } }   — full join row
      //   2) { id, name }                               — simple RPC shape
      const categoryData =
        editItem.category_items || editItem.menu_item_categories;
      if (categoryData) {
        const ids = categoryData
          .map((c: any) => c.category_id || c.category?.id || c.id)
          .filter(Boolean);
        setSelectedCategories(ids);
        setOriginalCategoryIds(ids);
      } else {
        setSelectedCategories([]);
        setOriginalCategoryIds([]);
      }
      // Fetch modifier assignments directly from DB — bypasses any RPC/cache issues
      // Pass locationId to include location-scoped modifier assignments
      getItemModifierGroups(editItem.id, isAllLocations ? null : selectedLocationId).then((groups) => {
        if (cancelled) return;
        const ids = groups.map((g: any) => g.id);
        setSelectedModifiers(ids);
        if (ids.length > 0) {
          setExpandedSections((prev) => ({ ...prev, modifiers: true }));
        }
      });
    } else {
      form.reset({
        name: "",
        description: "",
        price: 0,
        cash_price: undefined,
        delivery_price: null,
        image_url: "",
        availability: true,
        allergens: [],
        card_bg_color: "",
        stock_tracking_mode: "in_stock",
        prep_station_id: null,
      });
      imageUpload.reset(null);
      setSelectedCategories([]);
      setOriginalCategoryIds([]);
      setSelectedModifiers([]);
    }
    return () => { cancelled = true; };
  }, [editItem, form, getPriceForContext, imageUpload.reset]);

  const watchedValues = form.watch();

  React.useEffect(() => {
    if (!open || !!editItem || !draftKey || draftHydratedRef.current) return;

    const draft = readLocalStorageDraft<NewEditItemDraft>(draftKey);
    if (draft) {
      form.reset({
        name: "",
        description: "",
        price: 0,
        cash_price: undefined,
        delivery_price: null,
        image_url: "",
        availability: true,
        allergens: [],
        card_bg_color: "",
        stock_tracking_mode: "in_stock",
        tax_category: "standard",
        is_tax_exempt: false,
        available_channels: ["pos", "online"],
        prep_station_id: null,
        ...draft.values,
      });
      setSelectedCategories(draft.selectedCategories ?? []);
      setSelectedModifiers(draft.selectedModifiers ?? []);
    }

    draftHydratedRef.current = true;
  }, [draftKey, editItem, form, open]);

  React.useEffect(() => {
    if (!open || !!editItem || !draftKey || !draftHydratedRef.current) return;

    writeLocalStorageDraft(draftKey, {
      values: watchedValues,
      selectedCategories,
      selectedModifiers,
    } satisfies NewEditItemDraft);
  }, [draftKey, editItem, open, selectedCategories, selectedModifiers, watchedValues]);

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const toggleCategory = (categoryId: string) => {
    setSelectedCategories((prev) =>
      prev.includes(categoryId)
        ? prev.filter((id) => id !== categoryId)
        : [...prev, categoryId],
    );
  };

  const toggleModifier = (modifierId: string) => {
    if (!canManageModifierLinks) return;
    setSelectedModifiers((prev) =>
      prev.includes(modifierId)
        ? prev.filter((id) => id !== modifierId)
        : [...prev, modifierId],
    );
  };

  const toggleAllergen = (allergen: string) => {
    const current = form.getValues("allergens");
    if (current.includes(allergen)) {
      form.setValue(
        "allergens",
        current.filter((a) => a !== allergen),
      );
    } else {
      form.setValue("allergens", [...current, allergen]);
    }
  };

  // ========================================================================
  // RESET HANDLER
  // ========================================================================

  const handleReset = async () => {
    if (!editItem?.id || !editingContext.resetToLevel) return;

    setIsResetting(true);
    try {
      const result = await resetItemToLevel(
        editItem.id,
        editingContext.resetToLevel,
        {
          categoryId: categoryId || null,
          menuId: menuId || null,
          locationId: isAllLocations ? null : selectedLocationId,
        },
      );

      if (!result.success) {
        toast.error("Reset Failed", { description: result.error });
        return;
      }

      // Labels keyed by OLD RPC target level (what resetToLevel maps to internally)
      const levelLabels: Record<number, string> = {
        1: "global base",
        3: "global category",   // old L3 = new L2
        4: "branch category",   // old L4 = new L3
        5: "branch menu",
      };
      toast.success("Reset Successful", {
        description: `Item now uses ${
          levelLabels[editingContext.resetToLevel]
        } pricing`,
      });

      queryClient.invalidateQueries({ queryKey: ["menu-items"] });
      queryClient.invalidateQueries({ queryKey: ["menu-item", editItem.id] });
      queryClient.invalidateQueries({ queryKey: ["menus"] });
      queryClient.invalidateQueries({ queryKey: ["categories-with-items"] });
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      toast.error("Reset Failed", {
        description: "Unable to reset item pricing.",
      });
    } finally {
      setIsResetting(false);
    }
  };

  // ========================================================================
  // SUBMIT HANDLER
  // ========================================================================

  const onSubmit = async (values: ItemFormValues) => {
    let uploadedAsset: { cdnUrl: string; storagePath: string } | undefined;

    if (!clerkOrgId) {
      toast.error("Organization Not Found", {
        description: "Please ensure you are logged into an organization.",
      });
      return;
    }

    const canEditBaseImage = !editItem || editingContext.canEditBaseFields;

    if (canEditBaseImage && imageUpload.hasPendingChange && !merchantId) {
      toast.error("Merchant Not Found", {
        description: "Please reload and try the upload again.",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const resolvedImage = canEditBaseImage
        ? await imageUpload.resolveImageValue()
        : { value: editItem?.image || editItem?.image_url || null };
      uploadedAsset = resolvedImage.uploadedAsset;
      let result;

      if (editItem) {
        // Build update params based on context (includes category for 5-level cascade)
        const updateParams: UpdateItemParams = {
          menuItemId: editItem.id,
          categoryId: categoryId || null, // NEW: Category context for L3/L4/L5
          menuId: menuId || null,
          locationId: isAllLocations ? null : selectedLocationId,
          isMenuLocationOwned,
          price: values.price,
          cashPrice: values.cash_price ?? null,
          deliveryPrice: values.delivery_price ?? null,
          availability: values.availability,
        };

        // Only include base fields if we can edit them (Level 1)
        if (editingContext.canEditBaseFields) {
          updateParams.name = values.name;
          // Convert empty strings → undefined so the DB column stays null rather than ""
          updateParams.description = values.description?.trim() || undefined;
          updateParams.image = resolvedImage.value ?? undefined;
          updateParams.allergens = values.allergens;
          updateParams.cardBgColor = values.card_bg_color ?? undefined;
          updateParams.stockTrackingMode = values.stock_tracking_mode;
          // Tax & Inventory Control fields (migration 014)
          updateParams.taxCategory = values.tax_category;
          updateParams.isTaxExempt = values.is_tax_exempt;
          updateParams.availableChannels = values.available_channels;
        }

        // Prep Station — only include when a location is selected (location-only field)
        if (!isAllLocations && values.prep_station_id !== undefined) {
          updateParams.prepStationId = values.prep_station_id;
        }

        // Modifier groups are structure updates; only include when allowed
        if (canManageModifierLinks) {
          updateParams.modifier_group_ids = selectedModifiers;
        }
        result = await updateItemOverride(updateParams);
      } else {
        // Create new item (always Level 1 - global)
        result = await CreateMenuItem(
          clerkOrgId,
          {
            name: values.name,
            description: values.description?.trim() || undefined,
            price: values.price,
            cash_price: values.cash_price ?? undefined,
            delivery_price: values.delivery_price ?? null,
            image: resolvedImage.value ?? undefined,
            availability: values.availability,
            allergens: values.allergens,
            card_bg_color: values.card_bg_color ?? undefined,
            modifier_group_ids: selectedModifiers,
            stock_tracking_mode: values.stock_tracking_mode,
            // Tax & Inventory Control fields (migration 014)
            tax_category: values.tax_category,
            is_tax_exempt: values.is_tax_exempt,
            available_channels: values.available_channels,
          },
          selectedLocationId,
        );
      }

      if (result.error) {
        if (uploadedAsset) {
          await imageUpload.cleanupUploadedAsset(uploadedAsset.storagePath).catch(console.error);
        }
        toast.error("Operation Failed", { description: result.error });
        return;
      }

      // For edits, sync category assignment changes (additions + removals)
      if (editItem && merchantId) {
        const toAdd = selectedCategories.filter(
          (id) => !originalCategoryIds.includes(id),
        );
        const toRemove = originalCategoryIds.filter(
          (id) => !selectedCategories.includes(id),
        );
        const locScope = isAllLocations ? null : selectedLocationId;
        const assignmentResults = await Promise.all([
          ...toAdd.map((catId) =>
            AddItemToCategory(
              catId,
              editItem.id,
              merchantId,
              0,
              undefined,
              undefined,
              locScope,
            ),
          ),
          ...toRemove.map((catId) =>
            RemoveItemFromCategory(catId, editItem.id, locScope),
          ),
        ]);
        const failed = assignmentResults.find((r: any) => r?.error);
        if (failed) {
          toast.warning("Some category changes failed", {
            description: (failed as any).error,
          });
        }
        if (toAdd.length || toRemove.length) {
          setOriginalCategoryIds(selectedCategories);
        }
      }

      // If created from a category context, assign the new item to that category
      if (!editItem && categoryId && result.data?.id && merchantId) {
        const assignResult = await AddItemToCategory(
          categoryId,
          result.data.id,
          merchantId,
          0,
          undefined,
          undefined,
          isAllLocations ? null : selectedLocationId,
        );
        if (assignResult.error) {
          toast.warning("Item created but not assigned to category", {
            description: assignResult.error,
          });
        }
      }

      // Success message based on context
      const itemName = values.name;
      const contextName = menuName || categoryName || "menu";
      const levelMessages: Record<number, string> = {
        1: `"${itemName}" updated globally`,
        2: `"${itemName}" category pricing updated for "${contextName}"`,
        3: `"${itemName}" branch category pricing updated at ${currentLocationName}`,
        4: `"${itemName}" menu category pricing updated for "${menuName || contextName}"`,
        5: `"${itemName}" branch menu pricing updated at ${currentLocationName}`,
      };

      toast.success(editItem ? "Item Updated" : "Item Created", {
        description: editItem
          ? levelMessages[editingContext.level] || "Item saved"
          : `"${values.name}" has been added to your menu.`,
      });
      if (!editItem && draftKey) {
        clearLocalStorageDraft(draftKey);
      }

      queryClient.invalidateQueries({ queryKey: ["menu-items"] });
      queryClient.invalidateQueries({ queryKey: ["menu-item", editItem?.id] });
      queryClient.invalidateQueries({ queryKey: ["menus"] });
      queryClient.invalidateQueries({ queryKey: ["categories-with-items"] });

      form.reset();
      setSelectedCategories([]);
      setSelectedModifiers([]);
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      if (uploadedAsset) {
        await imageUpload.cleanupUploadedAsset(uploadedAsset.storagePath).catch(console.error);
      }
      toast.error(editItem ? "Update Failed" : "Creation Failed", {
        description: "Unable to save the menu item. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    form.reset();
    setSelectedCategories([]);
    setSelectedModifiers([]);
    onOpenChange(false);
  };

  // ========================================================================
  // PRICE BREAKDOWN COMPONENT
  // ========================================================================

  const PriceBreakdown = () => {
    if (!editItem?.price_levels) return null;

    const levels = editItem.price_levels;
    const currentLevel = editingContext.level;

    return (
      <div className="space-y-2 p-3 rounded-lg bg-muted/30 border border-dashed">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
          Price Hierarchy
        </div>

        {/* Level 1 - Global Base */}
        <PriceLevelRow
          level={1}
          label="Global Base"
          icon={<Globe className="h-3 w-3" />}
          price={levels.level_1_base}
          cashPrice={levels.level_1_cash}
          deliveryPrice={levels.level_1_delivery}
          isCurrentLevel={currentLevel === 1}
          isActive={levels.level_1_base !== null}
        />

        {/* Level 2 - Global Category Base (shown whenever there's a category context) */}
        {categoryId && (
          <PriceLevelRow
            level={2}
            label={`Category: ${categoryName || "Current"}`}
            icon={<Tag className="h-3 w-3" />}
            price={levels.level_3_category}
            cashPrice={levels.level_3_category_cash}
            deliveryPrice={levels.level_3_category_delivery}
            isCurrentLevel={currentLevel === 2}
            isActive={
              levels.level_3_category !== null ||
              levels.level_3_category_cash !== null ||
              levels.level_3_category_delivery !== null
            }
            isOverride
          />
        )}

        {/* Level 3 - Branch Category Base (shown when specific location selected, OR in menu context as prior level) */}
        {categoryId && (!isAllLocations || menuId) && (
          <PriceLevelRow
            level={3}
            label={`Branch Category: ${categoryName || "Current"}`}
            icon={<Building2 className="h-3 w-3" />}
            price={levels.level_4_location_category}
            cashPrice={levels.level_4_location_category_cash}
            deliveryPrice={levels.level_4_location_category_delivery}
            isCurrentLevel={currentLevel === 3}
            isActive={levels.level_4_location_category !== null}
            isOverride
          />
        )}

        {/* Level 4 - Global Menu Category Base (menu + category, shown in both L4 and L5 contexts) */}
        {menuId && categoryId && (
          <PriceLevelRow
            level={4}
            label={`Menu: ${menuName || "Current"}`}
            icon={<MenuIcon className="h-3 w-3" />}
            price={levels.level_3_menu_category}
            cashPrice={levels.level_3_menu_category_cash}
            deliveryPrice={levels.level_3_menu_category_delivery}
            isCurrentLevel={currentLevel === 4}
            isActive={
              levels.level_3_menu_category !== null ||
              levels.level_3_menu_category_cash !== null ||
              levels.level_3_menu_category_delivery !== null
            }
            isOverride
          />
        )}

        {/* Level 5 - Branch Menu Category Base (menu + category + specific location) */}
        {menuId && categoryId && !isAllLocations && (
          <PriceLevelRow
            level={5}
            label={`Menu: ${menuName || "Current"}`}
            icon={<MenuIcon className="h-3 w-3" />}
            price={levels.level_5_location_menu}
            cashPrice={levels.level_5_location_menu_cash}
            deliveryPrice={levels.level_5_location_menu_delivery}
            isCurrentLevel={currentLevel === 5}
            isActive={levels.level_5_location_menu !== null}
            isOverride
          />
        )}

        {/* Effective Price */}
        <div className="pt-2 mt-2 border-t">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Effective Price:</span>
            <span className="text-lg font-bold text-green-600">
              ${editItem.effective_price?.toFixed(2)}
            </span>
          </div>
          {/* Effective Delivery Price */}
          {editItem.effective_delivery_price != null && (
            <div className="flex items-center justify-between mt-1">
              <span className="text-sm font-medium text-amber-700">Delivery Price:</span>
              <span className="text-lg font-bold text-amber-600">
                ${editItem.effective_delivery_price.toFixed(2)}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ========================================================================
  // RENDER
  // ========================================================================

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent
        overlayClassName="bg-slate-950/40 backdrop-blur-md"
        className="w-full max-w-[calc(100vw-1rem)] gap-0 overflow-hidden rounded-[28px] border border-slate-200/80 bg-background/95 p-0 shadow-[0_30px_100px_rgba(15,23,42,0.26)] sm:max-w-5xl xl:max-w-6xl"
      >
        <Form {...form}>
          <form
            id="item-form"
            onSubmit={form.handleSubmit(onSubmit, (errors) => {
              const FIELD_LABELS: Record<string, string> = {
                name: "Item Name",
                description: "Description",
                price: "Price",
                cash_price: "Cash Price",
                delivery_price: "Delivery Price",
                image_url: "Image",
                availability: "Availability",
                allergens: "Allergens",
                card_bg_color: "Card Background Color",
                stock_tracking_mode: "Stock Tracking",
                tax_category: "Tax Category",
                is_tax_exempt: "Tax Exempt",
                available_channels: "Available Channels",
                prep_station_id: "Prep Station",
              };
              const messages = Object.entries(errors)
                .map(([field, err]) => {
                  const msg = (err as any)?.message;
                  if (!msg) return null;
                  return `${FIELD_LABELS[field] ?? field}: ${msg}`;
                })
                .filter(Boolean) as string[];
              toast.error(editItem ? "Cannot update item" : "Cannot create item", {
                description:
                  messages.length > 0
                    ? messages.join("\n")
                    : "Please review the highlighted fields and try again.",
              });
            })}
            className="flex max-h-[min(92vh,960px)] flex-col"
          >
        <DialogHeader className="border-b border-border/70 bg-background/95 px-6 py-5 pr-14 text-left sm:text-left">
          <DialogTitle className="flex items-center gap-2 text-[1.625rem] font-semibold tracking-tight">
            <Sparkles className="h-5 w-5 text-primary animate-pulse" />
            {editItem ? "Edit Menu Item" : "Create New Menu Item"}
          </DialogTitle>
          <DialogDescription asChild><div className="space-y-2 max-w-[80ch] text-sm leading-6 text-muted-foreground">
            <span>{editingContext.description}</span>

            {/* Context Badges */}
            {editItem && (
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {/* Level Badge */}
                <Badge
                  variant="outline"
                  className={cn(
                    "gap-1",
                    editingContext.level === 1 &&
                      "bg-gray-100 text-gray-700 border-gray-300",
                    editingContext.level === 2 &&
                      "bg-blue-100 text-blue-700 border-blue-300",
                    editingContext.level === 3 &&
                      "bg-purple-100 text-purple-700 border-purple-300",
                    editingContext.level === 4 &&
                      "bg-amber-100 text-amber-700 border-amber-300",
                    editingContext.level === 5 &&
                      "bg-green-100 text-green-700 border-green-300",
                  )}
                >
                  {editingContext.level === 1 && <Globe className="h-3 w-3" />}
                  {editingContext.level === 2 && <Tag className="h-3 w-3" />}
                  {editingContext.level === 3 && <Building2 className="h-3 w-3" />}
                  {editingContext.level === 4 && <MenuIcon className="h-3 w-3" />}
                  {editingContext.level === 5 && <MapPin className="h-3 w-3" />}
                  Level {editingContext.level}
                </Badge>

                {/* Location Badge */}
                {!isAllLocations && (
                  <Badge variant="secondary" className="gap-1">
                    <MapPin className="h-3 w-3" />
                    {currentLocationName}
                  </Badge>
                )}

                {/* Menu Badge */}
                {menuId && menuName && (
                  <Badge variant="secondary" className="gap-1">
                    <MenuIcon className="h-3 w-3" />
                    {menuName}
                    {isMenuLocationOwned && (
                      <span className="text-xs">(Your Menu)</span>
                    )}
                  </Badge>
                )}

                {/* Override indicator */}
                {editItem &&
                  (editItem.has_location_item_override ||
                    editItem.has_category_override ||
                    editItem.has_location_category_override ||
                    editItem.has_location_menu_override) && (
                    <Badge
                      variant="outline"
                      className="gap-1 bg-amber-50 text-amber-600 border-amber-200"
                    >
                      <Info className="h-3 w-3" />
                      Has overrides
                    </Badge>
                  )}
              </div>
            )}
          </div></DialogDescription>
        </DialogHeader>

          <div className="min-h-0 flex flex-1 flex-col overflow-hidden lg:flex-row">
            {/* Form Section */}
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 space-y-4">
              {/* Editing Context Banner - Shows which level user is editing */}
              {editItem && editingContext.level > 1 && (
                <EditingContextBanner
                  level={editingContext.level as PricingLevel}
                  locationName={
                    !isAllLocations ? "Current Location" : undefined
                  }
                  categoryName={
                    categoryId
                      ? categories.find((c) => c.id === categoryId)?.name
                      : undefined
                  }
                  menuName={menuId ? "Current Menu" : undefined}
                  className="mb-4"
                />
              )}

              {/* Disabled-field explainer - routes user to Global edit */}
              {editItem && !editingContext.canEditBaseFields && (
                <DisabledFieldBanner
                  locationName={currentLocationName}
                  className="mb-4"
                  onOpenGlobal={onOpenGlobalEdit}
                />
              )}

              <div className="space-y-4">
                  <div className="space-y-0">

                    {/* SECTION 1: GENERAL (collapsible) */}
                    <Collapsible
                      open={expandedSections.general}
                      onOpenChange={() => toggleSection("general")}
                    >
                      <CollapsibleTrigger asChild>
                        <button type="button" className="flex items-center justify-between w-full group">
                          <div className="flex items-center gap-2">
                            <Settings2 className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Basic Information</span>
                            {!editingContext.canEditBaseFields && editItem && (
                              <Badge variant="outline" className="text-xs">
                                View Only
                              </Badge>
                            )}
                          </div>
                          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", expandedSections.general && "rotate-180")} />
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="space-y-4 pt-4">

                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }: { field: any }) => (
                          <FormItem>
                            <FormLabel>Item Name *</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="e.g., Crispy Chicken Wings"
                                className="h-12 text-lg"
                                disabled={
                                  !editingContext.canEditBaseFields &&
                                  !!editItem
                                }
                                {...field}
                              />
                            </FormControl>
                            {!editingContext.canEditBaseFields && editItem && (
                              <FormDescription className="text-amber-600">
                                Switch to "All Locations" to edit item details
                              </FormDescription>
                            )}
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="description"
                        render={({ field }: { field: any }) => (
                          <FormItem>
                            <FormLabel>Description</FormLabel>
                            <FormControl>
                              <textarea
                                className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                                placeholder="Describe your dish..."
                                disabled={
                                  !editingContext.canEditBaseFields &&
                                  !!editItem
                                }
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="image_url"
                        render={() => (
                          <FormItem>
                            <FormLabel>Item Image</FormLabel>
                            <FormControl>
                              <CdnImageUploadField
                                disabled={
                                  isSubmitting ||
                                  (!editingContext.canEditBaseFields &&
                                    !!editItem)
                                }
                                helperText="Uploads to Bunny CDN when you save the item."
                                onClear={imageUpload.clear}
                                onFileSelect={imageUpload.selectFile}
                                previewUrl={imageUpload.previewUrl}
                                selectedFileName={imageUpload.selectedFileName}
                                uploadLabel="Upload item image"
                                uploading={imageUpload.isUploading}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Allergens */}
                      <FormField
                        control={form.control}
                        name="allergens"
                        render={() => (
                          <FormItem>
                            <FormLabel>Allergens</FormLabel>
                            <FormDescription>
                              Select all that apply
                            </FormDescription>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {COMMON_ALLERGENS.map((allergen) => (
                                <button
                                  key={allergen}
                                  type="button"
                                  onClick={() => toggleAllergen(allergen)}
                                  disabled={
                                    !editingContext.canEditBaseFields &&
                                    !!editItem
                                  }
                                  className={cn(
                                    "px-3 py-1.5 rounded-full text-sm font-medium transition-all",
                                    "border hover:scale-105 active:scale-95",
                                    "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100",
                                    watchedValues.allergens?.includes(allergen)
                                      ? "bg-orange-500 text-white border-orange-500 shadow-md"
                                      : "bg-background border-border hover:border-orange-500/50",
                                  )}
                                >
                                  {allergen}
                                </button>
                              ))}
                            </div>
                          </FormItem>
                        )}
                      />
                      </CollapsibleContent>
                    </Collapsible>

                    {/* SECTION 2: PRICING & INVENTORY (collapsible) */}
                    <Collapsible
                      open={expandedSections.pricing}
                      onOpenChange={() => toggleSection("pricing")}
                      className="border-t pt-4 mt-6"
                    >
                      <CollapsibleTrigger asChild>
                        <button type="button" className="flex items-center justify-between w-full group">
                          <div className="flex items-center gap-2">
                            <DollarSign className="h-4 w-4 text-green-500" />
                            <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Pricing & Inventory</span>
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-xs",
                                editingContext.level === 1 && "bg-gray-100",
                                editingContext.level === 2 && "bg-blue-100 text-blue-700",
                                editingContext.level === 3 && "bg-purple-100 text-purple-700",
                                editingContext.level === 4 && "bg-amber-100 text-amber-700",
                                editingContext.level === 5 && "bg-green-100 text-green-700",
                              )}
                            >
                              {editingContext.priceLabel}
                            </Badge>
                          </div>
                          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", expandedSections.pricing && "rotate-180")} />
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="space-y-4 pt-4">

                      {/* Price Breakdown - Detailed vertical breakdown */}
                      {editItem && <PriceBreakdown />}

                      {/* Price Inputs */}
                      <div className="space-y-2">
                          <PriceInputGroup
                              key={editItem?.id ?? "new"}
                              price={form.watch("price") || 0}
                              cashPrice={form.watch("cash_price") ?? null}
                              onPriceChange={(val) => form.setValue("price", val, { shouldValidate: true })}
                              onCashPriceChange={(val) => form.setValue("cash_price", val, { shouldValidate: true })}
                              label={editingContext.priceLabel}
                              pricingStrategy={effectivePricingStrategy}
                              dualPricingPercentage={effectiveDualPercentage}
                          />
                          <div className="flex gap-4 px-4">
                              <div className="flex-1">
                                  {form.formState.errors.price && (
                                      <p className="text-[0.8rem] font-medium text-destructive">
                                          {form.formState.errors.price.message}
                                      </p>
                                  )}
                              </div>
                              <div className="flex-1">
                                  {form.formState.errors.cash_price && (
                                      <p className="text-[0.8rem] font-medium text-destructive">
                                          {form.formState.errors.cash_price.message}
                                      </p>
                                  )}
                              </div>
                          </div>
                      </div>

                      {/* Delivery Pricing */}
                        <div className="space-y-3">
                          {/* Delivery price input — always shown */}
                          <div className="p-3 rounded-lg border border-amber-200 bg-amber-50/30 space-y-2">
                            <label className="text-sm font-medium text-amber-800">
                              {editingContext.priceLabel} (Delivery)
                            </label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-600 font-medium">$</span>
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder="0.00"
                                className="pl-7 border-amber-300 focus:ring-amber-500"
                                value={form.watch("delivery_price") ?? ""}
                                onChange={(e) => {
                                  const val = e.target.value === "" ? null : parseFloat(e.target.value);
                                  form.setValue("delivery_price", val, { shouldValidate: true });
                                }}
                              />
                            </div>
                            {/* Fallback display */}
                            {(form.watch("delivery_price") === null || form.watch("delivery_price") === undefined) && (
                              <p className="text-xs text-muted-foreground">
                                No delivery price set — card price will be used as fallback
                              </p>
                            )}
                          </div>
                        </div>

                      {/* Reset Button */}
                      {editItem && editingContext.resetLabel && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleReset}
                          disabled={isResetting}
                          className="w-full gap-2"
                        >
                          <RotateCcw
                            className={cn(
                              "h-4 w-4",
                              isResetting && "animate-spin",
                            )}
                          />
                          {editingContext.resetLabel}
                        </Button>
                      )}

                      {/* Stock Tracking Mode */}
                      <FormField
                        control={form.control}
                        name="stock_tracking_mode"
                        render={({ field }: { field: any }) => (
                          <FormItem>
                            <FormLabel>Stock Tracking</FormLabel>
                            <Select
                              value={field.value}
                              onValueChange={field.onChange}
                              disabled={
                                !editingContext.canEditBaseFields && !!editItem
                              }
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select tracking mode" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="in_stock">
                                  In Stock
                                </SelectItem>
                                <SelectItem value="out_of_stock">
                                  Out of Stock
                                </SelectItem>
                                <SelectItem value="quantity">
                                  Track Quantity
                                </SelectItem>
                              </SelectContent>
                            </Select>
                            <FormDescription>
                              How to track inventory for this item
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      </CollapsibleContent>
                    </Collapsible>

                    {/* SECTION 3: MODIFIERS (collapsible) */}
                    <Collapsible
                      open={expandedSections.modifiers}
                      onOpenChange={() => toggleSection("modifiers")}
                      className="border-t pt-4 mt-6"
                    >
                      <CollapsibleTrigger asChild>
                        <button type="button" className="flex items-center justify-between w-full group">
                          <div className="flex items-center gap-2">
                            <Layers className="h-4 w-4 text-purple-500" />
                            <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Modifier Groups</span>
                          </div>
                          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", expandedSections.modifiers && "rotate-180")} />
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="space-y-4 pt-4">

                      {/* Modifier Info */}
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5 px-1">
                        <Info className="h-3 w-3 shrink-0" />
                        Add or remove groups here. Edit individual options in the{" "}
                        <Link
                          href="/dashboard/menu/modifiers"
                          className="font-medium underline underline-offset-2 hover:text-primary"
                        >
                          Modifiers page
                        </Link>.
                      </p>
                      {(() => {
                        // Build selected groups with enriched data from editItem (has location-specific overrides)
                        const isItemLocationOwned =
                          !!editItem?.location_id &&
                          !isAllLocations &&
                          editItem.location_id === selectedLocationId;
                        const canManageModifierLinks =
                          isAllLocations || isItemLocationOwned || !editItem;

                        const selectedGroups = selectedModifiers
                          .map((id) => {
                            // 1. Try to find existing assignment in editItem (to keep overrides)
                            const existingAssignment =
                              editItem?.menu_item_modifier_groups?.find(
                                (g: any) =>
                                  g.modifier_group_id === id || g.id === id,
                              );

                            // 2. Find base group data from global list
                            const baseGroup = modifierGroups.find(
                              (g) => g.id === id,
                            );

                            if (!baseGroup && !existingAssignment) return null;

                            // 3. Merge data
                            const groupData = (existingAssignment ||
                              baseGroup) as any;

                            return {
                              id: id,
                              name:
                                groupData.name ||
                                baseGroup?.name ||
                                "Unknown Group",
                              description:
                                groupData.description || baseGroup?.description,
                              is_required:
                                groupData.is_required ??
                                baseGroup?.is_required ??
                                false,
                              min_selections:
                                groupData.min_selections ??
                                baseGroup?.min_selections ??
                                0,
                              max_selections:
                                groupData.max_selections ??
                                baseGroup?.max_selections,
                              is_active: groupData.is_active ?? true,
                              // Use modifier_group_items from editItem - this has location-specific data
                              // If it's a new assignment, use items from baseGroup
                              modifier_group_items:
                                (existingAssignment as any)?.items ||
                                (existingAssignment as any)
                                  ?.modifier_group_items ||
                                baseGroup?.modifier_group_items ||
                                [],
                            };
                          })
                          .filter(Boolean);

                        // Get IDs of selected groups
                        const selectedGroupIds = selectedGroups.map(
                          (g: any) => g.id,
                        );

                        // Available groups are ones not in selectedGroupIds
                        const availableGroups = modifierGroups.filter(
                          (g) => !selectedGroupIds.includes(g.id),
                        );

                        return (
                          <>
                            {/* Selected Modifier Groups */}
                            {selectedGroups.length === 0 ? (
                              <div className="text-center py-6 text-muted-foreground">
                                <Layers className="h-8 w-8 mx-auto mb-2 opacity-40" />
                                <p className="text-sm">
                                  No modifier groups assigned
                                </p>
                                <p className="text-xs mt-1">
                                  Add modifier groups to let customers customize
                                  this item
                                </p>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {selectedGroups.map(
                                  (group: any, index: number) => {
                                    const showItems = true;
                                    const isGlobalGroup = !group.location_id;
                                    const isLocationOwnedGroup =
                                      !!group.location_id &&
                                      group.location_id === selectedLocationId;
                                    const isOverrideScope =
                                      !isAllLocations &&
                                      isGlobalGroup &&
                                      !isLocationOwnedGroup;

                                    return (
                                      <div
                                        key={group.id}
                                        className="rounded-lg border border-primary/30 bg-primary/5 overflow-hidden animate-in fade-in slide-in-from-top-2"
                                        style={{
                                          animationDelay: `${index * 50}ms`,
                                        }}
                                      >
                                        <div className="p-3 flex items-center gap-3">
                                          {/* Drag Handle (visual only for now) */}
                                          <div className="text-muted-foreground/50">
                                            <Grip className="h-4 w-4" />
                                          </div>

                                          {/* Icon */}
                                          <div className="h-8 w-8 rounded-md bg-purple-100 flex items-center justify-center shrink-0">
                                            <Layers className="h-4 w-4 text-purple-600" />
                                          </div>

                                          {/* Info */}
                                          <div className="flex-1 min-w-0">
                                            <div className="font-medium text-sm flex items-center gap-2 flex-wrap">
                                              {group.name}
                                              {group.is_required && (
                                                <Badge
                                                  variant="destructive"
                                                  className="text-[10px] h-4 px-1.5"
                                                >
                                                  Required
                                                </Badge>
                                              )}
                                              {group.source === "location" ? (
                                                <Badge
                                                  variant="outline"
                                                  className="text-[10px] h-4 px-1.5 gap-0.5 bg-blue-50 text-blue-700 border-blue-200"
                                                >
                                                  This Location
                                                </Badge>
                                              ) : !isAllLocations ? (
                                                <Badge
                                                  variant="outline"
                                                  className="text-[10px] h-4 px-1.5 gap-0.5 bg-emerald-50 text-emerald-700 border-emerald-200"
                                                >
                                                  Global
                                                </Badge>
                                              ) : null}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                              {group.modifier_group_items
                                                ?.length || 0}{" "}
                                              options • Min:{" "}
                                              {group.min_selections || 0} • Max:{" "}
                                              {group.max_selections || "∞"}
                                            </div>
                                          </div>

                                          {/* Remove Button (respect permissions) */}
                                          {canManageModifierLinks && (
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="icon"
                                              className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                              onClick={() =>
                                                toggleModifier(group.id)
                                              }
                                            >
                                              <X className="h-4 w-4" />
                                            </Button>
                                          )}
                                        </div>

                                        {/* Items List (Read-only View) */}
                                        {showItems &&
                                          group.modifier_group_items &&
                                          group.modifier_group_items.length >
                                            0 && (
                                            <div className="border-t bg-background/50 px-3 py-2 space-y-1">
                                              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1 flex items-center gap-1.5">
                                                <span>Options Preview</span>
                                                <Badge
                                                  variant="outline"
                                                  className="text-[9px] h-3.5 px-1"
                                                >
                                                  Read-only
                                                </Badge>
                                              </div>
                                              {group.modifier_group_items.map(
                                                (
                                                  item: FlatItem["modifier_groups"][number]["items"][number],
                                                ) => {
                                                  const itemOverride =
                                                    item.location_override;
                                                  const price =
                                                    itemOverride?.price_modifier ??
                                                    (item as any).price_modifier ??
                                                    item.effective_price ??
                                                    0;
                                                  const isActive =
                                                    item.effective_is_active ??
                                                    item.base_is_active ??
                                                    true;
                                                  const canOverrideOnly =
                                                    isOverrideScope;
                                                  return (
                                                    <div
                                                      key={item.id}
                                                      className="flex flex-col gap-2 rounded-lg border bg-white px-3 py-2"
                                                    >
                                                      <div className="flex items-center justify-between gap-2">
                                                        <div>
                                                          <div className="font-medium text-sm">
                                                            {item.name}
                                                          </div>
                                                          {item.description && (
                                                            <div className="text-xs text-muted-foreground">
                                                              {item.description}
                                                            </div>
                                                          )}
                                                        </div>
                                                        <Badge
                                                          variant="outline"
                                                          className="text-[10px]"
                                                        >
                                                          {canOverrideOnly
                                                            ? "Location Override"
                                                            : "Global"}
                                                        </Badge>
                                                      </div>

                                                      {/* Read-only display of modifier items */}
                                                      <div className="grid grid-cols-2 gap-3 items-center opacity-75">
                                                        <div>
                                                          <label className="text-xs text-muted-foreground">
                                                            Price
                                                          </label>
                                                          <div className="text-sm font-medium">
                                                            $
                                                            {(
                                                              price ?? 0
                                                            ).toFixed(2)}
                                                          </div>
                                                        </div>

                                                        <div>
                                                          <label className="text-xs text-muted-foreground">
                                                            Status
                                                          </label>
                                                          <div className="flex items-center gap-1.5">
                                                            <div
                                                              className={cn(
                                                                "h-2 w-2 rounded-full",
                                                                isActive
                                                                  ? "bg-green-500"
                                                                  : "bg-gray-300",
                                                              )}
                                                            />
                                                            <span className="text-sm">
                                                              {isActive
                                                                ? "Active"
                                                                : "Inactive"}
                                                            </span>
                                                          </div>
                                                        </div>
                                                      </div>
                                                    </div>
                                                  );
                                                },
                                              )}
                                            </div>
                                          )}
                                      </div>
                                    );
                                  },
                                )}
                              </div>
                            )}

                            {/* Add Modifier Section (All Levels) */}
                            {canManageModifierLinks &&
                              availableGroups.length > 0 && (
                                <div className="pt-2">
                                  {/* Add Button / Collapsible Trigger */}
                                  <div className="pt-4 border-t">
                                    <Collapsible
                                      open={showAddModifier}
                                      onOpenChange={setShowAddModifier}
                                    >
                                      <CollapsibleTrigger asChild>
                                        <button
                                          type="button"
                                          className={cn(
                                            "w-full p-3 rounded-lg border-2 border-dashed transition-all flex items-center justify-center gap-2",
                                            showAddModifier
                                              ? "border-primary bg-primary/5 text-primary"
                                              : "border-muted-foreground/30 text-muted-foreground hover:border-primary/50 hover:text-primary hover:bg-primary/5",
                                          )}
                                        >
                                          <Plus
                                            className={cn(
                                              "h-4 w-4 transition-transform",
                                              showAddModifier && "rotate-45",
                                            )}
                                          />
                                          <span className="text-sm font-medium">
                                            {showAddModifier
                                              ? "Cancel"
                                              : `Add Modifier Group (${availableGroups.length} available)`}
                                          </span>
                                        </button>
                                      </CollapsibleTrigger>
                                      <CollapsibleContent className="pt-3">
                                        <ModifierGroupSearchList
                                          availableGroups={availableGroups}
                                          onSelect={(groupId) => {
                                            toggleModifier(groupId);
                                            if (availableGroups.length === 1) {
                                              setShowAddModifier(false);
                                            }
                                          }}
                                        />
                                      </CollapsibleContent>
                                    </Collapsible>
                                  </div>
                                </div>
                              )}

                            {/* No Available Modifiers Message */}
                            {canManageModifierLinks &&
                              availableGroups.length === 0 &&
                              modifierGroups.length > 0 && (
                                <div className="text-center py-2 text-xs text-muted-foreground">
                                  All modifier groups have been added
                                </div>
                              )}

                            {/* No Modifiers at All */}
                            {modifierGroups.length === 0 && (
                              <div className="text-center py-4 text-muted-foreground text-sm">
                                No modifier groups available in your
                                organization.
                              </div>
                            )}

                            {!canManageModifierLinks && (
                              <div className="text-xs text-muted-foreground bg-muted/40 border rounded-md p-2">
                                Modifier links are managed from the Modifiers page.
                                Use &quot;Add to Item&quot; or &quot;Add to Category&quot; buttons there
                                to assign modifiers globally or at this location.
                              </div>
                            )}
                          </>
                        );
                      })()}
                      </CollapsibleContent>
                    </Collapsible>

                    {/* SECTION 4: CATEGORIES (collapsible) */}
                    <Collapsible
                      open={expandedSections.categories}
                      onOpenChange={() => toggleSection("categories")}
                      className="border-t pt-4 mt-6"
                    >
                      <CollapsibleTrigger asChild>
                        <button type="button" className="flex items-center justify-between w-full group">
                          <div className="flex items-center gap-2">
                            <Tag className="h-4 w-4 text-blue-500" />
                            <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Categories</span>
                            {selectedCategories.length > 0 && (
                              <Badge variant="secondary" className="text-xs">
                                {selectedCategories.length}
                              </Badge>
                            )}
                            {!editingContext.canEditBaseFields && editItem && (
                              <Badge variant="outline" className="text-xs ml-auto">
                                View Only
                              </Badge>
                            )}
                          </div>
                          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", expandedSections.categories && "rotate-180")} />
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="space-y-3 pt-4">
                      {/* Suggestion for new items */}
                      {!editItem &&
                        selectedCategories.length === 0 &&
                        categories.length > 0 && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                            <Info className="h-3 w-3 shrink-0" />
                            Select a category to organize your menu. Without one, the item goes to "Uncategorized".
                          </p>
                        )}

                      {categories.length === 0 ? (
                        <div className="text-center py-6 text-muted-foreground text-sm border border-dashed rounded-lg">
                          <Tag className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p>No categories available</p>
                          <p className="text-xs mt-1">
                            Create categories first to organize your menu
                            items.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {/* Search + sort toolbar */}
                          <div className="flex items-center gap-2">
                            <div className="relative flex-1">
                              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                              <input
                                type="text"
                                placeholder="Search categories..."
                                value={categorySearch}
                                onChange={(e) => setCategorySearch(e.target.value)}
                                className="w-full h-9 pl-9 pr-8 rounded-md border bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                              />
                              {categorySearch && (
                                <button
                                  type="button"
                                  onClick={() => setCategorySearch("")}
                                  className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground hover:text-foreground"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => setCategorySortDesc((v) => !v)}
                              className="inline-flex items-center gap-1 h-9 px-3 rounded-md border bg-background text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                              title={`Sort ${categorySortDesc ? "Z → A" : "A → Z"}`}
                            >
                              {categorySortDesc ? "Z – A" : "A – Z"}
                            </button>
                          </div>

                          {displayedCategories.length === 0 ? (
                            <div className="text-center py-4 text-xs text-muted-foreground">
                              No categories match &ldquo;{categorySearch}&rdquo;
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {displayedCategories.map((category) => (
                                <button
                                  key={category.id}
                                  type="button"
                                  onClick={() => toggleCategory(category.id)}
                                  disabled={
                                    !editingContext.canEditBaseFields &&
                                    !!editItem
                                  }
                                  className={cn(
                                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all",
                                    "border hover:scale-105 active:scale-95",
                                    "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100",
                                    selectedCategories.includes(category.id)
                                      ? "bg-primary text-primary-foreground border-primary shadow-md"
                                      : "bg-background border-border hover:border-primary/50",
                                  )}
                                >
                                  {category.name}
                                  {category.is_global !== undefined && (
                                    <span className="inline-flex items-center gap-0.5 text-[10px] opacity-70">
                                      {category.is_global ? (
                                        <Globe className="h-3 w-3" />
                                      ) : (
                                        <><MapPin className="h-3 w-3" />{category.location_name && <span>{category.location_name}</span>}</>
                                      )}
                                    </span>
                                  )}
                                </button>
                              ))}
                            </div>
                          )}

                          {/* Skip option for new items */}
                          {!editItem && (
                            <div className="pt-2 border-t">
                              <button
                                type="button"
                                className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                                onClick={() => {
                                  setSelectedCategories([]);
                                }}
                              >
                                <X className="h-3 w-3" />
                                Skip - Add to "Uncategorized"
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                      </CollapsibleContent>
                    </Collapsible>

                    {/* SECTION 5: TAX & FEES (collapsible) */}
                    <Collapsible
                      open={expandedSections.tax}
                      onOpenChange={() => toggleSection("tax")}
                      className="border-t pt-4 mt-6"
                    >
                      <CollapsibleTrigger asChild>
                        <button type="button" className="flex items-center justify-between w-full group">
                          <div className="flex items-center gap-2">
                            <DollarSign className="h-4 w-4 text-emerald-500" />
                            <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Tax &amp; Fees</span>
                          </div>
                          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", expandedSections.tax && "rotate-180")} />
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="space-y-4 pt-4">
                      {/* Tax Exempt Switch */}
                      <FormField
                        control={form.control}
                        name="is_tax_exempt"
                        render={({ field }: { field: any }) => (
                          <FormItem className="flex items-center justify-between rounded-lg border p-4">
                            <div className="space-y-0.5">
                              <FormLabel className="text-base">
                                Tax Exempt
                              </FormLabel>
                              <FormDescription>
                                Mark this item as tax-exempt (no tax will be
                                applied)
                              </FormDescription>
                            </div>
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                disabled={
                                  !editingContext.canEditBaseFields &&
                                  !!editItem
                                }
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />

                      {/* Tax Category Select */}
                      <FormField
                        control={form.control}
                        name="tax_category"
                        render={({ field }: { field: any }) => (
                          <FormItem>
                            <FormLabel>Tax Category</FormLabel>
                            <Select
                              value={field.value}
                              onValueChange={field.onChange}
                              disabled={
                                watchedValues.is_tax_exempt ||
                                (!editingContext.canEditBaseFields &&
                                  !!editItem)
                              }
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select tax category" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {TAX_CATEGORIES.map((category) => (
                                  <SelectItem key={category} value={category}>
                                    {TAX_CATEGORY_LABELS[category]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormDescription>
                              {
                                TAX_CATEGORY_DESCRIPTIONS[
                                  field.value as TaxCategory
                                ]
                              }
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Tax Rate Preview */}
                      {!isAllLocations && !watchedValues.is_tax_exempt && (
                        <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                          <div className="flex items-center gap-2">
                            <Info className="h-4 w-4 text-muted-foreground" />
                            <h4 className="text-sm font-medium">
                              Tax Preview for {currentLocationName}
                            </h4>
                          </div>
                          {(() => {
                            const taxRate = taxRates.find(
                              (r) =>
                                r.tax_category === watchedValues.tax_category,
                            );
                            const itemPrice = watchedValues.price || 0;
                            const taxAmount = taxRate
                              ? (itemPrice * taxRate.percentage) / 100
                              : 0;
                            const totalWithTax = itemPrice + taxAmount;

                            return taxRate ? (
                              <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                  <span className="text-muted-foreground">
                                    Tax Rate:
                                  </span>
                                  <span className="font-medium">
                                    {taxRate.name} ({taxRate.percentage}%)
                                  </span>
                                </div>
                                <div className="flex justify-between text-sm">
                                  <span className="text-muted-foreground">
                                    Item Price:
                                  </span>
                                  <span className="font-medium">
                                    ${itemPrice.toFixed(2)}
                                  </span>
                                </div>
                                <div className="flex justify-between text-sm">
                                  <span className="text-muted-foreground">
                                    Tax Amount:
                                  </span>
                                  <span className="font-medium text-emerald-600">
                                    ${taxAmount.toFixed(2)}
                                  </span>
                                </div>
                                <div className="pt-2 border-t flex justify-between">
                                  <span className="font-semibold">
                                    Total with Tax:
                                  </span>
                                  <span className="font-bold text-lg">
                                    ${totalWithTax.toFixed(2)}
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <Alert>
                                <AlertCircle className="h-4 w-4" />
                                <AlertTitle>No Tax Rate Set</AlertTitle>
                                <AlertDescription className="space-y-2">
                                  <p>
                                    No tax rate is configured for "
                                    {
                                      TAX_CATEGORY_LABELS[
                                        watchedValues.tax_category as TaxCategory
                                      ]
                                    }
                                    " at this location.
                                  </p>
                                  <Link
                                    href="/dashboard/settings/taxes"
                                    className="text-primary hover:underline text-sm font-medium"
                                  >
                                    Configure tax rates →
                                  </Link>
                                </AlertDescription>
                              </Alert>
                            );
                          })()}
                        </div>
                      )}

                      {isAllLocations && (
                        <Alert>
                          <Info className="h-4 w-4" />
                          <AlertTitle>Tax Preview Not Available</AlertTitle>
                          <AlertDescription>
                            Select a specific location to see tax rate preview
                            and calculations.
                          </AlertDescription>
                        </Alert>
                      )}
                      </CollapsibleContent>
                    </Collapsible>

                    {/* SECTION 6: AVAILABILITY (collapsible) */}
                    <Collapsible
                      open={expandedSections.availability}
                      onOpenChange={() => toggleSection("availability")}
                      className="border-t pt-4 mt-2"
                    >
                      <CollapsibleTrigger asChild>
                        <button type="button" className="flex items-center justify-between w-full group">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-blue-500" />
                            <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Availability &amp; Channels</span>
                          </div>
                          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", expandedSections.availability && "rotate-180")} />
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="space-y-4 pt-4">
                      {/* General Availability Toggle */}
                      <FormField
                        control={form.control}
                        name="availability"
                        render={({ field }: { field: any }) => (
                          <FormItem className="flex items-center justify-between rounded-lg border p-4">
                            <div className="space-y-0.5">
                              <FormLabel className="text-base">
                                {editingContext.level === 1
                                  ? "Available for Sale"
                                  : editingContext.level === 2
                                    ? "Available at This Location"
                                    : "Available on This Menu"}
                              </FormLabel>
                              <FormDescription>
                                {editingContext.level === 1 &&
                                  "Master switch - affects all locations and menus"}
                                {editingContext.level === 2 &&
                                  "Toggle availability at this location"}
                                {editingContext.level >= 3 &&
                                  "Toggle availability on this category"}
                              </FormDescription>
                            </div>
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />

                      {/* Available Channels */}
                      <FormField
                        control={form.control}
                        name="available_channels"
                        render={() => (
                          <FormItem>
                            <FormLabel>Sales Channels</FormLabel>
                            <FormDescription>
                              Select where this item can be sold
                            </FormDescription>
                            <div className="space-y-2 mt-2">
                              {AVAILABLE_CHANNELS.map((channel) => (
                                <FormField
                                  key={channel}
                                  control={form.control}
                                  name="available_channels"
                                  render={({ field }: { field: any }) => (
                                    <FormItem className="flex items-start space-x-3 space-y-0 rounded-lg border p-3">
                                      <FormControl>
                                        <Checkbox
                                          checked={field.value?.includes(
                                            channel,
                                          )}
                                          onCheckedChange={(checked) => {
                                            const current = field.value || [];
                                            if (checked) {
                                              field.onChange([
                                                ...current,
                                                channel,
                                              ]);
                                            } else {
                                              field.onChange(
                                                current.filter(
                                                  (c: string) => c !== channel,
                                                ),
                                              );
                                            }
                                          }}
                                          disabled={
                                            !editingContext.canEditBaseFields &&
                                            !!editItem
                                          }
                                        />
                                      </FormControl>
                                      <div className="flex-1">
                                        <FormLabel className="text-sm font-medium cursor-pointer">
                                          {CHANNEL_LABELS[channel]}
                                        </FormLabel>
                                        <FormDescription className="text-xs">
                                          {CHANNEL_DESCRIPTIONS[channel]}
                                        </FormDescription>
                                      </div>
                                    </FormItem>
                                  )}
                                />
                              ))}
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Kitchen Routing (Prep Station) Section - Location only */}
                      {!isAllLocations ? (
                        <FormField
                          control={form.control}
                          name="prep_station_id"
                          render={({ field }) => {
                            // Find the category default for this item's first category
                            const itemCategoryId =
                              selectedCategories.length > 0
                                ? selectedCategories[0]
                                : null;
                            const categoryDefault = itemCategoryId
                              ? categoryPrepDefaults.find(
                                  (d) => d.category_id === itemCategoryId,
                                )
                              : null;
                            const inheritLabel = categoryDefault?.prep_station_name
                              ? `Inherit from Category (${categoryDefault.prep_station_name})`
                              : "None (routes to Expo)";

                            return (
                              <FormItem>
                                <div className="flex items-center gap-2">
                                  <Flame className="h-4 w-4 text-orange-500" />
                                  <FormLabel>Kitchen Routing</FormLabel>
                                </div>
                                <Select
                                  value={field.value || "__inherit__"}
                                  onValueChange={(val) =>
                                    field.onChange(
                                      val === "__inherit__" ? null : val,
                                    )
                                  }
                                >
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select prep station" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="__inherit__">
                                      {inheritLabel}
                                    </SelectItem>
                                    {prepStations
                                      .filter((ps) => ps.is_active)
                                      .map((ps) => (
                                        <SelectItem key={ps.id} value={ps.id}>
                                          <div className="flex items-center gap-2">
                                            <div
                                              className="h-3 w-3 rounded-full flex-shrink-0"
                                              style={{
                                                backgroundColor: ps.color,
                                              }}
                                            />
                                            {ps.name}
                                          </div>
                                        </SelectItem>
                                      ))}
                                  </SelectContent>
                                </Select>
                                <FormDescription>
                                  Items without a prep station route to Expo
                                  (catch-all) by default.
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            );
                          }}
                        />
                      ) : (
                        editItem && (
                          <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm dark:bg-blue-950/30 dark:border-blue-900">
                            <Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0 dark:text-blue-400" />
                            <p className="text-blue-800 dark:text-blue-300">
                              Prep stations are location-specific. Select a
                              location to assign a prep station to this item.
                            </p>
                          </div>
                        )
                      )}

                      </CollapsibleContent>
                    </Collapsible>

                    {/* SECTION 7: LOCATION BADGES (collapsible, edit-only, location-scoped) */}
                    {editItem && !isAllLocations && (
                    <Collapsible
                      open={expandedSections.locationBadges}
                      onOpenChange={() => toggleSection("locationBadges")}
                      className="border-t pt-4 mt-2"
                    >
                      <CollapsibleTrigger asChild>
                        <button type="button" className="flex items-center justify-between w-full group">
                          <div className="flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-amber-500" />
                            <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Location Badges</span>
                          </div>
                          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", expandedSections.locationBadges && "rotate-180")} />
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="space-y-3 pt-4">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between rounded-lg border p-3">
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2 text-sm font-medium">🔥 Popular</div>
                              <p className="text-xs text-muted-foreground">Highlighted on the storefront</p>
                            </div>
                            <Switch
                              checked={isPopular}
                              onCheckedChange={(v) => popularMutation.mutate(v)}
                              disabled={popularMutation.isPending}
                            />
                          </div>
                          <div className="flex items-center justify-between rounded-lg border p-3">
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2 text-sm font-medium">✨ New</div>
                              <p className="text-xs text-muted-foreground">Shown as new at this branch</p>
                            </div>
                            <Switch
                              checked={isNew}
                              onCheckedChange={(v) => newMutation.mutate(v)}
                              disabled={newMutation.isPending}
                            />
                          </div>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                    )}

                    {/* SECTION 8: RECIPE (collapsible, edit-only) */}
                    {editItem && (
                    <Collapsible
                      open={expandedSections.recipe}
                      onOpenChange={() => toggleSection("recipe")}
                      className="border-t pt-4 mt-2"
                    >
                      <CollapsibleTrigger asChild>
                        <button type="button" className="flex items-center justify-between w-full group">
                          <div className="flex items-center gap-2">
                            <Tag className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Recipe</span>
                          </div>
                          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", expandedSections.recipe && "rotate-180")} />
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="space-y-4 pt-4">
                      {editItem ? (
                        <RecipeManager
                          menuItemId={editItem.id}
                          menuItemName={editItem.name}
                          clerkOrgId={clerkOrgId || ""}
                          locationId={
                            isAllLocations ? null : selectedLocationId
                          }
                          isEditable={
                            // Can edit recipe if:
                            // 1. At Level 1 (Global) - can always edit
                            // 2. Or, item is a local item AND we're at the location that owns it
                            editingContext.canEditBaseFields ||
                            (!!editItem.location_id &&
                              editItem.location_id === selectedLocationId)
                          }
                        />
                      ) : (
                        <div className="text-center py-8">
                          <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                            <Tag className="h-6 w-6 text-muted-foreground" />
                          </div>
                          <p className="text-sm font-medium mb-1">
                            Create the item first
                          </p>
                          <p className="text-xs text-muted-foreground">
                            You can add recipe ingredients after creating the
                            item
                          </p>
                        </div>
                      )}
                      </CollapsibleContent>
                    </Collapsible>
                    )}
                  </div>
              </div>
            </div>

            {/* Preview Section */}
            <div className="hidden min-h-0 w-[360px] shrink-0 overflow-y-auto border-l border-border/70 bg-muted/10 px-6 py-5 lg:block">
              {/* <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
                                <Sparkles className="h-4 w-4" />
                                Live Preview
                            </h3> */}
              <div className="space-y-6 pb-4">
                <ItemPreviewCard
                  name={watchedValues.name}
                  description={watchedValues.description}
                  price={watchedValues.price || 0}
                  cashPrice={watchedValues.cash_price ?? undefined}
                            image={imageUpload.previewUrl ?? undefined}
                  categories={selectedCategories
                    .map(
                      (id) => categories.find((c) => c.id === id)?.name || "",
                    )
                    .filter(Boolean)}
                  allergens={watchedValues.allergens ?? []}
                  availability={watchedValues.availability}
                  className="shadow-xl"
                />

                {/* Summary info */}
                <div className="mt-6 space-y-2 text-sm">
                  {editItem && (
                    <EditingContextIndicator context={editingContext} />
                  )}
                  {selectedModifiers.length > 0 && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Layers className="h-4 w-4" />
                      {selectedModifiers.length} modifier group
                      {selectedModifiers.length !== 1 ? "s" : ""}
                    </div>
                  )}
                  {watchedValues.allergens &&
                    watchedValues.allergens.length > 0 && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <AlertCircle className="h-4 w-4 text-orange-500" />
                        Contains: {watchedValues.allergens.join(", ")}
                      </div>
                    )}
                </div>
              </div>
            </div>
          </div>
        <DialogFooter className="shrink-0 border-t border-border/70 bg-background/95 px-6 py-4 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="item-form"
            disabled={isSubmitting}
            className="min-w-[150px]"
          >
            {isSubmitting ? (
              <>
                <svg
                  className="animate-spin -ml-1 mr-2 h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Saving...
              </>
            ) : (
              <>
                {editItem ? "Save" : "Create Item"}
                <AffectsTag ctx={scopeCtx} variant="save-button" />
              </>
            )}
          </Button>
        </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// PRICE LEVEL ROW COMPONENT
// ============================================================================

interface PriceLevelRowProps {
  level: number;
  label: string;
  icon: React.ReactNode;
  price: number | null;
  cashPrice?: number | null;
  deliveryPrice?: number | null;
  modifier?: number | null;
  modifierType?: "add" | "percent" | null;
  isCurrentLevel: boolean;
  isActive: boolean;
  isOverride?: boolean;
}

function PriceLevelRow({
  level,
  label,
  icon,
  price,
  cashPrice,
  deliveryPrice,
  modifier,
  modifierType,
  isCurrentLevel,
  isActive,
  isOverride,
}: PriceLevelRowProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between py-1.5 px-2 rounded text-sm",
        isCurrentLevel && "bg-blue-50 border border-blue-200",
        !isActive && "opacity-50",
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "w-5 h-5 rounded-full flex items-center justify-center text-xs",
            isCurrentLevel ? "bg-blue-500 text-white" : "bg-muted",
          )}
        >
          {level}
        </span>
        <span className="flex items-center gap-1">
          {icon}
          {label}
        </span>
        {isOverride && isActive && (
          <Badge variant="outline" className="text-xs h-4 px-1">
            Override
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-3 text-right">
        {price !== null ? (
          <span
            className={cn("font-medium", isCurrentLevel && "text-blue-600")}
          >
            ${price.toFixed(2)}
          </span>
        ) : modifier !== null ? (
          <span className="text-amber-600">
            {modifierType === "add" ? "+" : ""}
            {modifier}
            {modifierType === "percent" ? "%" : ""}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
        {deliveryPrice !== null && deliveryPrice !== undefined && (
          <div className="text-amber-600 text-xs">
            <span className="text-muted-foreground">Del:</span> ${deliveryPrice.toFixed(2)}
          </div>
        )}
      </div>
    </div>
  );
}
