"use client";

import { useParams, useRouter } from "next/navigation";
import * as React from "react";
import { useMenuItem } from "../../../hooks/useMenuItem";
import { useCategories } from "../../../hooks/useCategories";
import { useModifierGroups } from "../../../hooks/useModifierGroups";
import { useUserInfo } from "../../../../manage/hooks/useUserInfo.";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { scopeColor, type CascadeLevel } from "@/lib/menu/cascade-labels";
import {
  PageShell,
  PageHeader,
  Panel,
} from "@/components/dashboard/shell";
import {
  ArrowLeft,
  Utensils,
  ChefHat,
  Layers,
  Edit3,
  ChevronDown,
  AlertTriangle,
  Image as ImageIcon,
  Tag,
  Clock,
  Sparkles,
  Globe,
  Building2,
  Menu as MenuIcon,
  MapPin,
  Info,
  DollarSign,
  CreditCard,
  Monitor,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/ui/empty";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn, isValidImageUrl } from "@/lib/utils";
import {
  NewEditItemFormSheet,
  EditItemWithOverrides,
} from "@/components/dashboard/menu/NewEditItemFormSheet";
import { ItemPreviewCard } from "@/components/dashboard/menu/ItemPreviewCard";
import { DeleteMenuItem } from "../../../actions/menu-items";
import { toast } from "sonner";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"; // Keep for delete confirmation
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  useLocationStore,
  useIsAllLocations,
  useIsSingleLocation,
  useGatedLocationId,
  useGatedLocation,
  useSingleLocationName,
} from "@/stores/location-store";
import { LocationLibraryItem } from "@/types/menu";
import { Switch } from "@/components/ui/switch";
import { GetItemIsPopular, SetItemPopular, GetItemIsNew, SetItemNew } from "../../../actions/location-menu-overrides";
import { GetItemStock } from "../../../actions/stock";
import { Flame, Package } from "lucide-react";
import { CHANNEL_LABELS } from "@/types/inventory";
import { TAX_CATEGORY_LABELS } from "@/types/tax";
import { getTaxRateForCategory } from "../../../actions/tax-rates";


// ============================================================================
// TYPES & HELPERS
// ============================================================================

/**
 * Render a row timestamp in the location's timezone, falling back to "—".
 * `new Date(undefined)` yields "Invalid Date", which is what this page showed
 * before; an absent or unparseable timestamp is not an error worth surfacing.
 */
function formatDate(
  value: string | null | undefined,
  timeZone?: string | null,
): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    timeZone: timeZone ?? undefined,
  });
}

type EditingContext = {
  level: 1 | 2 | 3 | 4 | 5;
  table: string;
  description: string;
  canEditBaseFields: boolean;
  priceLabel: string;
  resetToLevel: 1 | 2 | 3 | null;
  resetLabel: string | null;
};

/**
 * Adapts `scopeColor()`'s `{text,bg,border}` to the `{color,bgColor,borderColor}`
 * names this page's call sites already use, so the shared palette can be dropped
 * in without touching every `levelInfo.*` reference.
 */
function levelPalette(level: CascadeLevel) {
  const c = scopeColor(level);
  return { color: c.text, bgColor: c.bg, borderColor: c.border };
}

/**
 * Cascade-level presentation for this page.
 *
 * Colours come from `scopeColor()` rather than being written out again: this file
 * used to carry its own light-only `bg-*-50` / `border-*-200` triples — a third
 * copy of the same five colours, which rendered as near-white blocks on the dark
 * dashboard (C4). Names, icons and copy stay local because they are worded for
 * this page.
 */
const LEVEL_INFO = {
  1: {
    name: "Global Base",
    icon: Globe,
    ...levelPalette(1),
    description: "Base item price that applies everywhere by default.",
    affects: "All locations and all menus",
  },
  2: {
    name: "Location Override",
    icon: Building2,
    ...levelPalette(2),
    description:
      "Location-specific base price that overrides the global price.",
    affects: "All menus at this location",
  },
  3: {
    name: "Menu Override",
    icon: MenuIcon,
    ...levelPalette(3),
    description: "Menu-specific price that applies when this menu is used.",
    affects: "This menu at all locations",
  },
  4: {
    name: "Location + Menu",
    icon: MapPin,
    ...levelPalette(4),
    description: "Price specific to this menu at this location only.",
    affects: "This menu at this location only",
  },
  5: {
    name: "Location Menu Owner",
    icon: Sparkles,
    ...levelPalette(5),
    description: "This is your location's own menu - you have full control.",
    affects: "Your menu at your location",
  },
} as const;

function getEditingContext(isAllLocations: boolean): EditingContext {
  // Items Library + All Locations = Level 1 (Global Base)
  if (isAllLocations) {
    return {
      level: 1,
      table: "menu_items",
      description:
        "Viewing global item. Changes affect all locations and menus.",
      canEditBaseFields: true,
      priceLabel: "Base Price",
      resetToLevel: null,
      resetLabel: null,
    };
  }

  // Items Library + Location Selected = Level 2 (Location Item Override)
  return {
    level: 2,
    table: "location_item_overrides",
    description:
      "Viewing location pricing. This price applies to ALL menus at this location.",
    canEditBaseFields: false,
    priceLabel: "Location Base Price",
    resetToLevel: 1,
    resetLabel: "Reset to Global",
  };
}

// ============================================================================
// CONTEXT INDICATOR COMPONENT
// ============================================================================

function EditingContextIndicator({
  context,
  locationName,
}: {
  context: EditingContext;
  locationName: string;
}) {
  const levelInfo = LEVEL_INFO[context.level];
  const Icon = levelInfo.icon;

  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          {/* Neutral pill: the cascade level is stated in words, and the
              tooltip below carries the full explanation. The level's colour
              stays in the tooltip, where it labels a specific row. */}
          <div className="flex min-w-0 max-w-full cursor-help items-center gap-2 rounded-full border-0 bg-muted/60 px-3 py-2 text-muted-foreground shadow-none transition-colors">
            <span className="min-w-0 text-sm font-medium">
              {levelInfo.name}
            </span>
            <Info className="h-3.5 w-3.5 opacity-60 shrink-0" />
          </div>
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          align="start"
          className="w-80 rounded-2xl border bg-card p-4 shadow-lg"
          sideOffset={8}
        >
          <div className="space-y-3">
            {/* Header */}
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                  levelInfo.bgColor
                )}
              >
                <Icon className={cn("h-4 w-4", levelInfo.color)} />
              </div>
              <div>
                <h4 className="font-semibold text-sm text-foreground">
                  {levelInfo.name}
                </h4>
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
            <div className="rounded-2xl border-0 bg-muted/60 p-2.5 shadow-none">
              <p className="mb-0.5 text-[11px] font-medium text-muted-foreground">
                Currently viewing:
              </p>
              <p className="text-xs font-medium text-foreground">
                {locationName}
              </p>
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
                        "flex items-center gap-1 rounded-full px-2 py-1 text-[10px]",
                        isCurrentLevel
                          ? cn(info.bgColor, info.color, "font-medium")
                          : "bg-muted/60 text-muted-foreground"
                      )}
                    >
                      <LevelIcon className="h-3 w-3" />
                      <span>{level}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ============================================================================
// PRICE BREAKDOWN COMPONENT
// ============================================================================

interface PriceBreakdownProps {
  item: LocationLibraryItem;
  isAllLocations: boolean;
  isSingleLocation: boolean;
  currentLocationName: string;
}

function PriceBreakdown({
  item,
  isAllLocations,
  isSingleLocation,
  currentLocationName,
}: PriceBreakdownProps) {
  const basePrice = item.base_price;
  const baseCashPrice = item.base_cash_price;

  // Check for location overrides from menu_item data
  const hasLocationOverride = item.location_override ? true : false;
  const locationOverride = hasLocationOverride ? item.location_override : null;

  // Effective price calculation
  const effectivePrice = locationOverride?.custom_price ?? basePrice;
  const effectiveCashPrice =
    locationOverride?.custom_cash_price ?? baseCashPrice;

  // Single location: the cascade has nothing to explain, so show the two
  // effective prices plainly instead of the level-by-level breakdown below.
  if (isSingleLocation) {
    return (
      <Panel padded>
        <h2 className="flex items-center gap-2 text-[1.0625rem] font-semibold">
          <DollarSign className="h-[1.125rem] w-[1.125rem] shrink-0" />
          Pricing
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border-0 bg-muted/60 p-3 shadow-none">
            <div className="text-xs text-muted-foreground">Card price</div>
            <div className="font-semibold tabular-nums">
              ${effectivePrice?.toFixed(2)}
            </div>
          </div>
          <div className="rounded-2xl border-0 bg-muted/60 p-3 shadow-none">
            <div className="text-xs text-muted-foreground">Cash price</div>
            <div className="font-semibold tabular-nums">
              {effectiveCashPrice == null
                ? "Not set"
                : `$${effectiveCashPrice.toFixed(2)}`}
            </div>
          </div>
        </div>
      </Panel>
    );
  }

  return (
    <Panel padded>
      <h2 className="flex items-center gap-2 text-[1.0625rem] font-semibold text-[#0C4FD1] dark:text-[#6CA0FF]">
        <DollarSign className="h-4 w-4 shrink-0" />
        Price Hierarchy
      </h2>
      <div className="mt-4 space-y-3">
        {/* Level 1 - Global Base */}
        <div
          className={cn(
            "flex flex-wrap items-center justify-between gap-x-2 gap-y-1 rounded-2xl border-0 bg-muted/60 p-3 shadow-none"
          )}
        >
          <div className="flex min-w-0 flex-1 basis-40 flex-wrap items-center gap-x-2 gap-y-1">
            <div
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium tabular-nums",
                isAllLocations
                  ? "bg-foreground/80 text-background"
                  : "bg-background text-muted-foreground"
              )}
            >
              1
            </div>
            <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="text-sm font-medium">Global Base</span>
            {isAllLocations && (
              <span className="inline-flex shrink-0 items-center rounded-full bg-background/70 px-2 py-0.5 text-xs font-medium text-muted-foreground">
                Active
              </span>
            )}
          </div>
          <div className="ml-auto shrink-0 text-right">
            <div className="font-medium tabular-nums">
              ${basePrice?.toFixed(2)}
            </div>
            {baseCashPrice && (
              <div className="text-xs text-muted-foreground tabular-nums">
                Cash: ${baseCashPrice.toFixed(2)}
              </div>
            )}
          </div>
        </div>

        {/* Level 2 - Location Override */}
        {!isAllLocations && (
          <div
            className={cn(
              "flex flex-wrap items-center justify-between gap-x-2 gap-y-1 rounded-2xl border-0 p-3 shadow-none",
              hasLocationOverride
                ? "bg-blue-50 dark:bg-blue-900/20"
                : "bg-muted/60"
            )}
          >
            <div className="flex min-w-0 flex-1 basis-40 items-center gap-2">
              <div
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium tabular-nums",
                  hasLocationOverride
                    ? "bg-blue-500 text-white"
                    : "bg-background text-muted-foreground"
                )}
              >
                2
              </div>
              <Building2 className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-medium">Location Override</span>
                  {hasLocationOverride && (
                    <span className="inline-flex shrink-0 items-center rounded-full bg-background/70 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-400">
                      Override Active
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {currentLocationName}
                </p>
              </div>
            </div>
            <div className="ml-auto shrink-0 text-right">
              {hasLocationOverride ? (
                <>
                  <div className="font-medium tabular-nums text-blue-700 dark:text-blue-400">
                    ${locationOverride?.custom_price?.toFixed(2)}
                  </div>
                  {locationOverride?.custom_cash_price && (
                    <div className="text-xs text-muted-foreground tabular-nums">
                      Cash: ${locationOverride?.custom_cash_price.toFixed(2)}
                    </div>
                  )}
                </>
              ) : (
                <span className="text-sm text-muted-foreground">
                  No override
                </span>
              )}
            </div>
          </div>
        )}

        {/* Effective Price — green marks what customers actually pay, so the
            emphasis belongs here rather than on the Global Base rung above. */}
        <div className="rounded-2xl border-0 bg-emerald-50 p-3 shadow-none dark:bg-emerald-900/20">
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <span className="text-sm font-medium">Effective Price</span>
            <div className="ml-auto text-right">
              <span className="text-xl font-semibold tracking-[-0.02em] tabular-nums text-emerald-700 dark:text-emerald-400">
                ${effectivePrice?.toFixed(2)}
              </span>
              {effectiveCashPrice && (
                <div className="text-xs text-muted-foreground tabular-nums">
                  Cash: ${effectiveCashPrice.toFixed(2)}
                </div>
              )}
            </div>
          </div>
          {!isAllLocations &&
            hasLocationOverride &&
            basePrice !== effectivePrice && (
              <div className="mt-2 flex items-center gap-1 text-xs text-blue-700 dark:text-blue-400">
                <Info className="h-3 w-3 shrink-0" />
                <span className="tabular-nums">
                  {effectivePrice < basePrice ? "Discounted" : "Increased"} by $
                  {Math.abs(effectivePrice - basePrice).toFixed(2)} at this
                  location
                </span>
              </div>
            )}
        </div>
      </div>
    </Panel>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function MenuItemDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const itemId = params.itemId as string;
  const { data: item, isLoading, refetch } = useMenuItem(itemId);

  const { data: userInfo } = useUserInfo();
  const clerkOrgId = userInfo?.members?.[0]?.organizations?.id;

  const { data: allCategories } = useCategories(clerkOrgId || "");
  const { data: allModifierGroups } = useModifierGroups(clerkOrgId);

  // Location context. Location Badges are inherently per-location, so they use
  // the gated resolver: a single-location account stays locked to the 'all'
  // core scope (correct for pricing) but still has exactly one place the badge
  // can live. Without this, single-location merchants could never set a badge.
  const { locations } = useLocationStore();
  const isAllLocations = useIsAllLocations();
  const isSingleLocation = useIsSingleLocation();
  const gatedLocationId = useGatedLocationId();
  const gatedLocation = useGatedLocation();
  const singleLocationName = useSingleLocationName();
  const selectedLocationId = gatedLocationId;
  const badgesDisabled = !gatedLocationId;

  const currentLocation = React.useMemo(
    () => locations.find((l) => l.id === selectedLocationId) ?? null,
    [locations, selectedLocationId]
  );

  const currentLocationName = React.useMemo(() => {
    if (isSingleLocation) return singleLocationName || "Your location";
    if (isAllLocations) return "All Locations";
    return currentLocation?.name || "Unknown Location";
  }, [isAllLocations, isSingleLocation, singleLocationName, currentLocation]);

  // Effective tax rate for this item's category at the active location.
  // The item stores only a *category*; the percentage lives in `tax_rates`
  // keyed by (location, category), so it needs its own lookup.
  const itemTaxCategory = (item as LocationLibraryItem | undefined)
    ?.effective_tax_category;
  const { data: taxRate } = useQuery({
    queryKey: ["tax-rate", gatedLocationId, itemTaxCategory],
    queryFn: () => getTaxRateForCategory(gatedLocationId!, itemTaxCategory!),
    enabled: !!gatedLocationId && !!itemTaxCategory,
  });

  const editingContext = React.useMemo(
    () => getEditingContext(isAllLocations),
    [isAllLocations]
  );

  // Stock quantity — only meaningful when mode is 'quantity' and a location is selected
  const { data: stockRecords } = useQuery({
    queryKey: ["item-stock", itemId, selectedLocationId],
    queryFn: () => GetItemStock(selectedLocationId!, itemId),
    enabled: !!itemId && !!selectedLocationId,
  });
  const stockRecord = stockRecords?.[0] ?? null;

  const [expandedModifiers, setExpandedModifiers] = React.useState<
    Record<string, boolean>
  >({});
  const [isEditSheetOpen, setIsEditSheetOpen] = React.useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);

  // Popular flag — per-location, only fetched when a specific location is selected
  const { data: isPopular = false } = useQuery({
    queryKey: ["item-popular", itemId, selectedLocationId],
    queryFn: () => GetItemIsPopular(itemId, selectedLocationId!),
    enabled: !!itemId && !!selectedLocationId,
  });

  const popularMutation = useMutation({
    mutationFn: (value: boolean) =>
      SetItemPopular(itemId, gatedLocationId!, value),
    onSuccess: (_, value) => {
      queryClient.setQueryData(
        ["item-popular", itemId, gatedLocationId],
        value
      );
      toast.success(value ? "Marked as Popular" : "Removed Popular badge");
    },
    onError: () => toast.error("Failed to update popular flag"),
  });

  // New flag — per-location, only fetched when a specific location is selected
  const { data: isNew = false } = useQuery({
    queryKey: ["item-new", itemId, selectedLocationId],
    queryFn: () => GetItemIsNew(itemId, selectedLocationId!),
    enabled: !!itemId && !!selectedLocationId,
  });

  const newMutation = useMutation({
    mutationFn: (value: boolean) =>
      SetItemNew(itemId, gatedLocationId!, value),
    onSuccess: (_, value) => {
      queryClient.setQueryData(
        ["item-new", itemId, gatedLocationId],
        value
      );
      toast.success(value ? "Marked as New" : "Removed New badge");
    },
    onError: () => toast.error("Failed to update new flag"),
  });

  const toggleModifierExpand = (modifierId: string) => {
    setExpandedModifiers((prev) => ({
      ...prev,
      [modifierId]: !prev[modifierId],
    }));
  };

  if (isLoading) {
    return (
      <PageShell>
        <Skeleton className="h-10 w-64 rounded-2xl" />
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Skeleton className="h-96 w-full rounded-2xl" />
            <Skeleton className="h-48 w-full rounded-2xl" />
          </div>
          <Skeleton className="h-[500px] rounded-2xl" />
        </div>
      </PageShell>
    );
  }

  if (!item) {
    return (
      <PageShell>
        <Panel padded>
          <Empty
            icon={Utensils}
            title="Item not found"
            description="The item you're looking for doesn't exist or has been deleted."
            action={
              <Button
                onClick={() => router.push("/dashboard/menu/items")}
                className="h-9 rounded-full px-4 text-[0.8125rem] font-medium"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Items
              </Button>
            }
          />
        </Panel>
      </PageShell>
    );
  }

  const menuItem = item as LocationLibraryItem;
  const categories = menuItem.categories || [];
  const modifierGroups = menuItem.modifier_groups || [];
  const recipes: Array<{
    id: string;
    recipe?: { name?: string; description?: string };
    quantity_multiplier?: number;
  }> =
    (
      menuItem as unknown as {
        recipes?: Array<{
          id: string;
          recipe?: { name?: string; description?: string };
          quantity_multiplier?: number;
        }>;
      }
    )?.recipes || [];
  const menus = menuItem?.menus || [];

  const allCategoriesList = Array.isArray(allCategories) ? allCategories : [];
  const allModifierGroupsList = Array.isArray(allModifierGroups)
    ? allModifierGroups
    : [];

  const handleDeleteItem = async () => {
    setIsDeleting(true);
    try {
      const result = await DeleteMenuItem(itemId);
      if (result.error) {
        toast.error("Delete Failed", { description: result.error });
        return;
      }
      toast.success("Item Deleted", {
        description: `"${menuItem.name}" has been permanently deleted.`,
      });
      queryClient.invalidateQueries({ queryKey: ["menu-items"] });
      router.push("/dashboard/menu/items");
    } catch {
      toast.error("Delete Failed", {
        description: "Unable to delete the item. Please try again.",
      });
    } finally {
      setIsDeleting(false);
      setIsDeleteDialogOpen(false);
    }
  };

  return (
    <PageShell>
      {/* Header */}
      <div className="w-full min-w-0 space-y-2">
        {/* Breadcrumb + actions row */}
        <div className="flex min-w-0 items-center justify-between gap-2">
          <button
            type="button"
            className="flex shrink-0 items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => router.push("/dashboard/menu/items")}
          >
            <ArrowLeft className="h-4 w-4" />
            Items
          </button>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              size="sm"
              onClick={() => setIsEditSheetOpen(true)}
              className="h-9 gap-1.5 rounded-full px-4 text-[0.8125rem] font-medium"
            >
              <Edit3 className="h-4 w-4" />
              Edit Item
            </Button>
            {isAllLocations && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Delete item"
                className="size-9 shrink-0 rounded-full text-destructive transition-colors hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setIsDeleteDialogOpen(true)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        {/* Title + badges */}
        <div className="min-w-0">
          <h1 className="truncate text-[1.75rem] font-semibold tracking-[-0.02em]">
            {menuItem.name}
          </h1>
          <div className="mt-2 flex w-full min-w-0 flex-col items-start gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted/60 px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {menuItem.effective_availability ? "Available" : "Unavailable"}
            </span>
            {/* Cascade level is meaningless with only one location. */}
            {!isSingleLocation && <EditingContextIndicator
              context={editingContext}
              locationName={currentLocationName}
            />}
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3 min-w-0">
        {/* Left Column - Details */}
        <div className="lg:col-span-2 space-y-6 min-w-0">
          {/* Basic Info Card */}
          <Panel padded>
            <h2 className="text-[1.0625rem] font-semibold">Item Details</h2>
            <div className="mt-4 space-y-6">
              <div className="flex gap-4 sm:grid sm:grid-cols-2 sm:gap-6">
                {/* Image */}
                <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl border-0 bg-muted/60 shadow-none sm:aspect-square sm:max-h-none sm:w-auto">
                  {isValidImageUrl(menuItem.image) ? (
                    <img
                      src={menuItem.image}
                      alt={menuItem.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <div className="text-center text-muted-foreground">
                        <ImageIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No image</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Details */}
                <div className="space-y-4">
                  <div>
                    <div className="text-sm font-medium text-muted-foreground mb-1">
                      Name
                    </div>
                    <div className="text-xl font-semibold">{menuItem.name}</div>
                  </div>

                  {menuItem.description && (
                    <div>
                      <div className="text-sm font-medium text-muted-foreground mb-1">
                        Description
                      </div>
                      <div className="text-sm">{menuItem.description}</div>
                    </div>
                  )}

                </div>
              </div>

              {/* Meal Types — full width below the image/details row rather than
                  inside the narrow details column, so the pills wrap across the
                  card instead of stacking. One clock on the label, not one per
                  pill: repeating the icon widened every pill enough to force a
                  single-column stack on narrow screens. */}
              {menuItem.meal_types && menuItem.meal_types.length > 0 && (
                <div>
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Clock className="h-4 w-4 shrink-0" />
                    Meal Types
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {menuItem.meal_types.map((type: string) => (
                      <span
                        key={type}
                        className="inline-flex shrink-0 items-center rounded-full bg-muted/60 px-2.5 py-1 text-xs font-medium capitalize text-muted-foreground"
                      >
                        {type}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Allergens */}
              {menuItem.allergens && menuItem.allergens.length > 0 && (
                <div>
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-orange-500" />
                    Allergens
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {menuItem.allergens.map((allergen: string) => (
                      <span
                        key={allergen}
                        className="inline-flex shrink-0 items-center rounded-full bg-orange-50 px-2.5 py-1 text-xs font-medium text-orange-700 dark:bg-orange-900/20 dark:text-orange-400"
                      >
                        {allergen}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Sales Channels */}
              <div>
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Globe className="h-4 w-4 shrink-0" />
                  Sales Channels
                </div>
                {menuItem.effective_available_channels?.length ? (
                  <div className="flex flex-wrap gap-2">
                    {menuItem.effective_available_channels.map((channel) => {
                      const ChannelIcon =
                        channel === "pos"
                          ? CreditCard
                          : channel === "online"
                            ? Globe
                            : Monitor;

                      return (
                        <span
                          key={channel}
                          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted/60 px-3 py-1 text-xs font-medium text-muted-foreground"
                        >
                          <ChannelIcon className="h-3 w-3 shrink-0" />
                          {CHANNEL_LABELS[channel] || channel.toUpperCase()}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No sales channels enabled
                  </p>
                )}
              </div>

              {/* Categories */}
              <div>
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Tag className="h-4 w-4 shrink-0" />
                  Categories
                </div>
                {categories.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No categories assigned
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {categories.map((cat) => (
                      <span
                        key={cat.id}
                        className="inline-flex shrink-0 items-center rounded-full bg-muted/60 px-3 py-1 text-xs font-medium text-muted-foreground"
                      >
                        {cat?.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Menus this item is in */}
              {menus.length > 0 && (
                <div>
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Utensils className="h-4 w-4 shrink-0" />
                    Appears in <span className="tabular-nums">{menus.length}</span> Menu(s)
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {menus.map((m) => (
                      <span
                        key={m.id}
                        className="inline-flex shrink-0 items-center rounded-full bg-muted/60 px-3 py-1 text-xs font-medium text-muted-foreground"
                      >
                        {m?.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Panel>

          {/* Modifier Groups Section - Read Only */}
          <Panel padded>
            <div>
              <h2 className="flex items-center gap-2 text-[1.0625rem] font-semibold text-[#0C4FD1] dark:text-[#6CA0FF]">
                <Layers className="h-4 w-4 shrink-0" />
                Modifier Groups
                <span className="ml-auto inline-flex shrink-0 items-center rounded-full bg-muted/60 px-2.5 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
                  {modifierGroups.length}
                </span>
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Customization options available for this item.
                {!isSingleLocation && !isAllLocations &&
                  " Showing both global and location-specific modifiers."}
              </p>
            </div>
            <div className="mt-4">
              {modifierGroups.length === 0 ? (
                <Empty
                  icon={Layers}
                  title="No modifier groups"
                  description="Use the Edit Item button to link modifier groups"
                />
              ) : (
                <div className="space-y-3">
                  {modifierGroups.map((mg, index: number) => {
                    const group = mg;
                    if (!group) return null;

                    return (
                      <Collapsible
                        key={mg.id}
                        open={expandedModifiers[mg.id]}
                        onOpenChange={() => toggleModifierExpand(mg.id)}
                      >
                        <div
                          className={cn(
                            "overflow-hidden rounded-2xl border-0 bg-muted/60 shadow-none transition-colors animate-in fade-in slide-in-from-left-4",
                            expandedModifiers[mg.id] && "ring-2 ring-border"
                          )}
                          style={{ animationDelay: `${index * 50}ms` }}
                        >
                          <CollapsibleTrigger asChild>
                            <div className="cursor-pointer p-4">
                              <div className="flex min-w-0 items-center justify-between gap-3">
                                <div className="flex min-w-0 flex-1 items-center gap-4">
                                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted/60">
                                    <Layers className="h-5 w-5 text-muted-foreground" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="font-semibold break-words">
                                      {group.name}
                                    </div>
                                    {/* Scope badge and description moved into the
                                        expanded body — both are reference detail,
                                        and in the collapsed header they competed
                                        with the group name on narrow screens. */}
                                    {group.is_required && (
                                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                        <span className="inline-flex max-w-full shrink-0 items-center rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-900/20 dark:text-red-400">
                                          Required
                                        </span>
                                      </div>
                                    )}
                                    {/* No option preview pills at any width — the
                                        full option list with prices lives in the
                                        expanded body below. */}
                                  </div>
                                </div>
                                {/* No option count here — the expanded body
                                    already leads with "Options (N)". */}
                                <div className="flex items-center gap-2 shrink-0">
                                  <ChevronDown
                                    className={cn(
                                      "h-5 w-5 text-muted-foreground transition-transform duration-200 shrink-0",
                                      expandedModifiers[mg.id] && "rotate-180"
                                    )}
                                  />
                                </div>
                              </div>
                            </div>
                          </CollapsibleTrigger>

                          <CollapsibleContent>
                            <div className="px-4 pb-4 pt-0">
                              {/* Full description — not clamped here, unlike the
                                  single-line preview it replaced in the header. */}
                              {group.description && (
                                <p className="mt-4 text-sm text-muted-foreground">
                                  {group.description}
                                </p>
                              )}

                              {/* Scope: which locations this group applies to. */}
                              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                                {(group as any).source === "location" ? (
                                  <span className="inline-flex max-w-full shrink-0 items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/20 dark:text-blue-400">
                                    <MapPin className="h-2.5 w-2.5 shrink-0" />
                                    This Location
                                  </span>
                                ) : (
                                  <span className="inline-flex max-w-full shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400">
                                    <Globe className="h-2.5 w-2.5 shrink-0" />
                                    All Locations
                                  </span>
                                )}
                              </div>
                              <div className="mt-4 space-y-2">
                                <h4 className="text-sm font-medium text-muted-foreground">
                                  Options (
                                  <span className="tabular-nums">
                                    {group.items?.length || 0}
                                  </span>
                                  )
                                </h4>
                                {group.items && group.items.length > 0 ? (
                                  <div className="grid gap-2 md:grid-cols-2">
                                    {group.items.map((opt) => (
                                      <div
                                        key={opt.id}
                                        className={cn(
                                          "flex items-center justify-between gap-3 rounded-2xl border-0 bg-background p-3 shadow-none transition-colors",
                                          !opt.is_active && "opacity-50"
                                        )}
                                      >
                                        <div className="min-w-0">
                                          <div className="flex flex-wrap items-center gap-2 font-medium">
                                            {opt.name}
                                            {!opt.is_active && (
                                              <span className="inline-flex shrink-0 items-center rounded-full bg-muted/60 px-2 py-0.5 text-xs font-medium text-muted-foreground">
                                                Inactive
                                              </span>
                                            )}
                                          </div>
                                          {opt.description && (
                                            <div className="text-sm text-muted-foreground">
                                              {opt.description}
                                            </div>
                                          )}
                                        </div>
                                        <div
                                          className={cn(
                                            "shrink-0 font-medium tabular-nums",
                                            opt.price_modifier > 0
                                              ? "text-emerald-700 dark:text-emerald-400"
                                              : opt.price_modifier < 0
                                              ? "text-destructive"
                                              : "text-muted-foreground"
                                          )}
                                        >
                                          {opt.price_modifier !== 0 ? (
                                            <>
                                              {opt.price_modifier > 0
                                                ? "+"
                                                : ""}
                                              ${opt.price_modifier.toFixed(2)}
                                            </>
                                          ) : (
                                            "Free"
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-sm text-muted-foreground">
                                    No options in this group
                                  </p>
                                )}
                              </div>

                              <div className="mt-4 rounded-2xl border-0 bg-background p-3 shadow-none">
                                <h4 className="mb-2 text-sm font-medium">
                                  Selection Rules
                                </h4>
                                {/* One column until `sm`: at mobile width a rigid
                                    2-col grid gave "Maximum: Unlimited" half a
                                    narrow row and clipped the word. */}
                                <div className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
                                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                                    <span className="text-muted-foreground">
                                      Minimum:
                                    </span>
                                    <span className="font-medium tabular-nums">
                                      {group.min_selections || 0}
                                    </span>
                                  </div>
                                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                                    <span className="text-muted-foreground">
                                      Maximum:
                                    </span>
                                    <span className="font-medium tabular-nums">
                                      {group.max_selections || "Unlimited"}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </CollapsibleContent>
                        </div>
                      </Collapsible>
                    );
                  })}
                </div>
              )}
            </div>
          </Panel>

          {/* Recipes Section */}
          <Panel padded>
            <div>
              <h2 className="flex items-center gap-2 text-[1.0625rem] font-semibold text-[#0C4FD1] dark:text-[#6CA0FF]">
                <ChefHat className="h-4 w-4 shrink-0" />
                Recipes
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Recipes and ingredients for this item
              </p>
            </div>
            <div className="mt-4">
              {recipes.length === 0 ? (
                <Empty
                  icon={ChefHat}
                  title="No recipes"
                  description="Use the Edit Item button to add recipes and track ingredients"
                />
              ) : (
                <div className="space-y-2">
                  {recipes?.map(
                    (recipe: {
                      id: string;
                      recipe?: { name?: string; description?: string };
                      quantity_multiplier?: number;
                    }) => (
                      <div
                        key={recipe.id}
                        className="rounded-2xl border-0 bg-muted/60 p-3 shadow-none"
                      >
                        <div className="font-medium">
                          {recipe.recipe?.name}
                        </div>
                        {recipe.recipe?.description && (
                          <div className="text-sm text-muted-foreground">
                            {recipe.recipe.description}
                          </div>
                        )}
                        {recipe.quantity_multiplier !== 1 && (
                          <span className="mt-2 inline-flex shrink-0 items-center rounded-full bg-background px-2.5 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
                            ×{recipe.quantity_multiplier}
                          </span>
                        )}
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          </Panel>


        </div>

        {/* Right Column - Preview & Quick Info */}
        <div className="space-y-6 min-w-0">
          {/* Price Breakdown */}
          <PriceBreakdown
            item={menuItem}
            isAllLocations={isAllLocations}
            isSingleLocation={isSingleLocation}
            currentLocationName={currentLocationName}
          />

          {/* Location Badges */}
          <Panel padded>
            <div>
              <h2 className="flex items-center gap-2 text-[1.0625rem] font-semibold text-[#0C4FD1] dark:text-[#6CA0FF]">
                <Flame className="h-4 w-4 shrink-0" />
                Location Badges
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Badges shown on the storefront for{" "}
                {gatedLocation?.name ?? currentLocationName}
              </p>
            </div>
            <div className="mt-4 space-y-4">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          🔥 Popular
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {badgesDisabled
                            ? "Select a location to manage"
                            : "Auto-detected or manually set"}
                        </p>
                      </div>
                      <Switch
                        checked={isPopular}
                        onCheckedChange={(v) => popularMutation.mutate(v)}
                        disabled={badgesDisabled || popularMutation.isPending}
                      />
                    </div>
                  </TooltipTrigger>
                  {badgesDisabled && (
                    <TooltipContent>
                      Select a specific location to manage this badge
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          ✨ New
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {badgesDisabled
                            ? "Select a location to manage"
                            : "Mark as new at this branch"}
                        </p>
                      </div>
                      <Switch
                        checked={isNew}
                        onCheckedChange={(v) => newMutation.mutate(v)}
                        disabled={badgesDisabled || newMutation.isPending}
                      />
                    </div>
                  </TooltipTrigger>
                  {badgesDisabled && (
                    <TooltipContent>
                      Select a specific location to manage this badge
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            </div>
          </Panel>

          {/* POS Preview, then Quick Stats and Metadata below it. */}
          <Panel padded>
            <h2 className="text-sm font-medium text-muted-foreground">
              POS Preview
            </h2>
            <div className="mt-4 flex justify-center">
              <ItemPreviewCard
                name={menuItem.name}
                description={menuItem.description || undefined}
                price={menuItem.effective_price || 0}
                cashPrice={menuItem.effective_cash_price || undefined}
                image={menuItem.image || undefined}
                categories={categories.map((c) => c.name).filter(Boolean)}
                allergens={menuItem.allergens ?? []}
                availability={
                  menuItem.effective_availability ??
                  menuItem.base_availability ??
                  true
                }
              />
            </div>
          </Panel>

          {/* Quick Stats */}
          <Panel padded>
            <h2 className="text-sm font-medium text-muted-foreground">
              Quick Stats
            </h2>
            <div className="mt-4 space-y-1">
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-muted-foreground">
                  Categories
                </span>
                <span className="inline-flex shrink-0 items-center rounded-full bg-muted/60 px-2.5 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
                  {categories.length}
                </span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-muted-foreground">
                  Modifier Groups
                </span>
                <span className="inline-flex shrink-0 items-center rounded-full bg-muted/60 px-2.5 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
                  {modifierGroups.length}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 py-2">
                <span className="text-sm text-muted-foreground">Tax</span>
                {/* Show the actual rate the item is taxed at. The item stores
                    only a category; the percentage comes from `tax_rates` for
                    (location, category). Falls back to the category name when
                    no rate is configured, or at All Locations where no single
                    rate applies. */}
                <span className="inline-flex shrink-0 items-center rounded-full bg-muted/60 px-2.5 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
                  {menuItem.effective_is_tax_exempt
                    ? "Tax Exempt"
                    : taxRate?.data
                      ? `${taxRate.data.percentage}%`
                      : TAX_CATEGORY_LABELS[menuItem.effective_tax_category] ||
                        menuItem.effective_tax_category ||
                        "—"}
                </span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-muted-foreground">Menus</span>
                <span className="inline-flex shrink-0 items-center rounded-full bg-muted/60 px-2.5 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
                  {menus.length}
                </span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-muted-foreground">Recipes</span>
                <span className="inline-flex shrink-0 items-center rounded-full bg-muted/60 px-2.5 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
                  {recipes.length}
                </span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-muted-foreground">
                  Stock Mode
                </span>
                <span className="inline-flex shrink-0 items-center rounded-full bg-muted/60 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                  {menuItem.stock_tracking_mode || "in_stock"}
                </span>
              </div>
              {menuItem.stock_tracking_mode === "quantity" && !isAllLocations && (
                <div className="flex items-center justify-between py-2">
                  <span className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Package className="h-3.5 w-3.5 shrink-0" />
                    Stock Count
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium tabular-nums">
                      {stockRecord != null ? stockRecord.quantity : "—"}
                    </span>
                    {stockRecord != null &&
                      stockRecord.quantity <= (stockRecord.reorder_threshold ?? 5) && (
                        <span className="inline-flex shrink-0 items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/20 dark:text-red-400">
                          Stock low
                        </span>
                      )}
                  </div>
                </div>
              )}
            </div>
          </Panel>

          {/* Metadata */}
          <Panel padded>
            <h2 className="text-sm font-medium text-muted-foreground">
              Metadata
            </h2>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span>
                  {formatDate(menuItem.created_at, currentLocation?.timezone)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Updated</span>
                <span>
                  {formatDate(menuItem.updated_at, currentLocation?.timezone)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">ID</span>
                <span className="max-w-32 truncate font-mono text-xs">
                  {menuItem.id}
                </span>
              </div>
            </div>
          </Panel>

        </div>
      </div>

      {/* Edit Item Sheet */}
      <NewEditItemFormSheet
        open={isEditSheetOpen}
        onOpenChange={setIsEditSheetOpen}
        clerkOrgId={clerkOrgId}
        categories={allCategoriesList}
        modifierGroups={allModifierGroupsList}
        editItem={{
          id: menuItem.id,
          name: menuItem.name,
          description: menuItem.description ?? undefined,
          price: menuItem.effective_price,
          cash_price: menuItem.effective_cash_price,
          image: menuItem.image ?? undefined,
          availability: menuItem.base_availability,
          allergens: menuItem.allergens ?? [],
          card_bg_color: menuItem.card_bg_color ?? undefined,
          stock_tracking_mode: menuItem.stock_tracking_mode,
          category_items: menuItem.categories,
          menu_item_modifier_groups:
            menuItem.modifier_groups as unknown as EditItemWithOverrides["menu_item_modifier_groups"],
          location_id: menuItem.location_id,
          delivery_price: menuItem.base_delivery_price,
          effective_price: menuItem.effective_price,
          effective_cash_price: menuItem.effective_cash_price,
          effective_delivery_price: menuItem.effective_delivery_price,
          has_location_item_override: menuItem.has_location_override,
        }}
        onSuccess={() => {
          setIsEditSheetOpen(false);
          refetch();
        }}
      />

      {/* Delete Item Confirmation */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Delete Item
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{menuItem.name}"? This action
              cannot be undone. The item will be removed from all menus and
              categories.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
              disabled={isDeleting}
              className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteItem}
              disabled={isDeleting}
              className="h-9 rounded-full px-4 text-[0.8125rem] font-medium"
            >
              {isDeleting ? (
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
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Item
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
