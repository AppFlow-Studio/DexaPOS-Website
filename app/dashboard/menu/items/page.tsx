"use client";
//TODO: Setup or remove the items detailed page
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Utensils,
  Plus,
  Search,
  Grid3x3,
  List,
  Package,
  DollarSign,
  Edit3,
  Eye,
  MoreVertical,
  Tag,
  X,
  Filter,
  MapPin,
  Info,
  ChevronDown,
  ChevronRight,
  Globe,
  Layers,
  Sparkles,
  CreditCard,
  Monitor,
  ShieldCheck,
  ShieldX,
  Trash2,
  CheckSquare,
  CheckCheck,
  Check,
  CheckCircle2,
  Truck,
  Loader2,
} from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useCategoriesWithItems } from "../../hooks/useCategories";
import { ScopeContextStrip } from "@/components/dashboard/menu/ScopeContextStrip";
import { useModifierGroups } from "../../hooks/useModifierGroups";
import { useUserInfo } from "../../../manage/hooks/useUserInfo.";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Empty } from "@/components/ui/empty";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateOrderOutSync } from "@/app/dashboard/hooks/useOrderOutMenuSync";
import { cn, isValidImageUrl } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useLocationScopedMenuItemsWithCategories,
  useLocationContext,
} from "../../hooks/useLocationScoped";
import {
  NewEditItemFormSheet,
  EditItemWithOverrides,
} from "@/components/dashboard/menu/NewEditItemFormSheet";
import { FlatItem, resetItemToLevel, getItemModifierGroups } from "../../actions/menu-items-rpc";
import { CategoryWithItems } from "@/types/menu";
import {
  useLocationStore,
  useIsAllLocations,
  useSelectedLocation,
  useIsSingleLocation,
} from "@/stores/location-store";
import { PriceSourcePopover } from "@/components/dashboard/menu/PriceSourcePopover";
import {
  priceSourceToLevel,
  deriveScopeFromContext,
} from "@/lib/menu/cascade-labels";
import { useLocationTaxRates } from "../../hooks/useTaxRates";
import { TAX_CATEGORY_LABELS } from "@/types/tax";
import { AVAILABLE_CHANNELS } from "@/types/inventory";
import { DeleteMenuItem } from "../../actions/menu-items";
import { CreateItemWizard } from "@/components/dashboard/menu/items/CreateItemWizard";
import { useManagerPermissions } from "../../hooks/useManagerPermissions";
import {
  PageShell,
  PageHeader,
  Panel,
  StatRow,
  StatTile,
  LocationIndicator,
} from "@/components/dashboard/shell";
import {
  priceSourceStyle,
  priceSourceLabel,
  categoryScopeStyle,
  ITEM_AVAILABILITY_STYLES,
  TAX_BADGE_STYLES,
  OVERRIDE_BADGE_STYLE,
} from "@/lib/constants/menu-item-badges";
import { BulkPriceAdjustDialog } from "@/components/dashboard/menu/items/BulkPriceAdjustDialog";
import { BulkDeliveryPriceAdjustDialog } from "@/components/dashboard/menu/items/BulkDeliveryPriceAdjustDialog";

// ============================================================================
// TYPES
// ============================================================================

type ViewMode = "grid" | "list" | "categories";

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function mapFlatItemToEditItem(
  item: FlatItem | null,
): EditItemWithOverrides | undefined {
  if (!item) return undefined;
  console.log("[MAP FLAT ITEM TO EDIT ITEM] item", item);
  return {
    id: item.id,
    name: item.name,
    description: item.description ?? undefined,
    price: item.base_price,
    cash_price: item.base_cash_price,
    delivery_price: item.base_delivery_price ?? null,
    image: item.image ?? undefined,
    location_id: item.location_id ?? null,
    availability: item.effective_availability,
    allergens: item.allergens ?? undefined,
    card_bg_color: item.card_bg_color ?? undefined,
    stock_tracking_mode: item.stock_tracking_mode ?? undefined,
    category_items: item.categories.map((c) => ({ id: c.id, name: c.name })),
    effective_price: item.effective_price,
    effective_cash_price: item.effective_cash_price,
    effective_delivery_price: item.effective_delivery_price ?? null,
    price_levels: {
      level_1_base: item.base_price,
      level_1_cash: item.base_cash_price,
      level_2_location_item: item.location_override?.custom_price ?? null,
      level_2_location_item_cash:
        item.location_override?.custom_cash_price ?? null,
      level_2_modifier: item.location_override?.price_modifier ?? null,
      level_2_modifier_type: null,
      level_3_category: null,
      level_3_category_cash: null,
      level_4_location_category: null,
      level_4_location_category_cash: null,
      level_5_location_menu: null,
      level_5_location_menu_cash: null,
      level_1_delivery: item.base_delivery_price ?? null,
      level_2_location_item_delivery: item.location_override?.custom_delivery_price ?? null,
      level_3_category_delivery: null,
      level_4_location_category_delivery: null,
      level_5_location_menu_delivery: null,
    },
    has_location_item_override: item.has_location_override,
    menu_item_modifier_groups: item.modifier_groups,
  };
}

/**
 * The badge shell shared by every tag on this page (DS-CTL-09): soft tint, no
 * border, 6px dot for the colour coding. Written literally here because
 * Tailwind only scans `.tsx` (C7).
 */
const BADGE_SHELL =
  "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium";

// ============================================================================
// ITEM CARD COMPONENT
// ============================================================================

function ItemCard({
  item,
  onEdit,
  onView,
  onDelete,
  index = 0,
  taxRates = [],
  canDelete = false,
  isSelectionMode = false,
  isSelected = false,
  onToggleSelect,
}: {
  item: FlatItem;
  onEdit: () => void;
  onView: () => void;
  onDelete: () => void;
  index?: number;
  taxRates?: any[];
  canDelete?: boolean;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
}) {
  const hasOverride = item.has_location_override;
  const priceStyle = priceSourceStyle(item.price_source);

  const isAllLocations = useIsAllLocations();
  const isSingleLocation = useIsSingleLocation();
  const { selectedLocationId } = useLocationStore();
  const selectedLocation = useSelectedLocation();
  const locationName = selectedLocation?.name ?? null;

  // Tax info
  const taxRate = taxRates.find(
    (r) => r.tax_category === item.effective_tax_category,
  );
  const taxAmount =
    taxRate && !item.effective_is_tax_exempt
      ? ((item.effective_price * taxRate.percentage) / 100).toFixed(2)
      : "0.00";
  const modifierGroupCount = item.modifier_groups?.length ?? 0;

  return (
    <div
      className="group animate-in fade-in slide-in-from-bottom-4"
      style={{ animationDelay: `${Math.min(index * 30, 300)}ms` }}
    >
      <div
        className={cn(
          // Borderless tinted surface: these cards sit inside a Panel (tier-2), so a
          // border here would stack outlines two deep. Tint carries the separation.
          "relative h-full cursor-pointer overflow-hidden rounded-2xl border-0 bg-muted/50 shadow-none transition-colors",
          "hover:bg-muted",
          hasOverride && "ring-1 ring-amber-500/30",
          !item.effective_availability && "opacity-70",
          isSelectionMode && isSelected && "ring-2 ring-primary border-primary/60",
          isSelectionMode && !isSelected && "hover:ring-2 hover:ring-primary/40",
        )}
        onClick={
          isSelectionMode ? () => onToggleSelect?.(item.id) : onView
        }
      >
        {/* Selection indicator overlay */}
        {isSelectionMode && (
          <div className="absolute top-2 right-2 z-20 pointer-events-none">
            <div
              className={cn(
                "flex items-center justify-center w-7 h-7 rounded-full border-2 transition-all duration-200 shadow-sm backdrop-blur-sm",
                isSelected
                  ? "bg-primary border-primary text-primary-foreground"
                  : "bg-background/90 border-border",
              )}
            >
              {isSelected && <Check className="h-4 w-4" strokeWidth={3} />}
            </div>
          </div>
        )}
        {/* Image Section */}
        <div className="relative aspect-[4/3] overflow-hidden bg-background/60">
          {isValidImageUrl(item.image) ? (
            <img
              src={item.image}
              alt={item.name}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <Utensils className="h-12 w-12 text-muted-foreground/30" />
            </div>
          )}

          {/* Top badges */}
          <div className="absolute top-2 left-2 right-2 flex items-start justify-between">
            {/* Price source indicator */}
            {item.price_source !== "base" && (
              <span
                className={cn(
                  BADGE_SHELL,
                  "backdrop-blur-sm",
                  priceStyle.bg,
                  priceStyle.text,
                )}
              >
                <span
                  className={cn("h-1.5 w-1.5 shrink-0 rounded-full", priceStyle.dot)}
                />
                {priceSourceLabel(item.price_source)}
              </span>
            )}

            {/* Availability */}
            {!item.effective_availability && (
              <span
                className={cn(
                  BADGE_SHELL,
                  "ml-auto backdrop-blur-sm",
                  ITEM_AVAILABILITY_STYLES.unavailable.bg,
                  ITEM_AVAILABILITY_STYLES.unavailable.text,
                )}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    ITEM_AVAILABILITY_STYLES.unavailable.dot,
                  )}
                />
                Unavailable
              </span>
            )}
          </div>

          {/* Category badges at bottom */}
          {item.categories.length > 0 && (
            <div className="absolute bottom-2 left-2 right-2 flex flex-wrap gap-1">
              {item.categories.slice(0, 2).map((cat) => {
                const scope = categoryScopeStyle(cat.is_global);
                return (
                  <span
                    key={cat.id}
                    className={cn(
                      BADGE_SHELL,
                      "max-w-full backdrop-blur-sm",
                      scope.bg,
                      scope.text,
                    )}
                  >
                    {cat.is_global ? (
                      <Globe className="h-2.5 w-2.5 shrink-0" />
                    ) : (
                      <MapPin className="h-2.5 w-2.5 shrink-0" />
                    )}
                    <span className="truncate">{cat.name}</span>
                  </span>
                );
              })}
              {item.categories.length > 2 && (
                <span
                  className={cn(
                    BADGE_SHELL,
                    "bg-background/90 text-muted-foreground backdrop-blur-sm tabular-nums",
                  )}
                >
                  +{item.categories.length - 2}
                </span>
              )}
            </div>
          )}

          {/* Hover overlay with actions */}
          {!isSelectionMode && (
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-end justify-center pb-14">
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-8 rounded-full bg-background/95 px-4 text-[0.8125rem] font-medium hover:bg-background"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit();
                  }}
                >
                  <Edit3 className="h-3.5 w-3.5 mr-1.5" />
                  Edit
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Content Section */}
        <div className="p-4">
          <div className="space-y-2">
            <h3 className="line-clamp-1 text-base font-semibold">
              {item.name}
            </h3>
            {item.description && (
              <p className="text-sm text-muted-foreground line-clamp-2">
                {item.description}
              </p>
            )}
            <div
              className="flex items-center justify-between pt-2"
              onClick={(e) => {
                if (isSelectionMode) return;
                e.stopPropagation();
              }}
            >
              {isSelectionMode ? (
                <div className="flex items-baseline gap-2">
                  <span className="text-lg font-medium tracking-[-0.02em] tabular-nums">
                    ${item.effective_price.toFixed(2)}
                  </span>
                  {hasOverride && item.base_price !== item.effective_price && (
                    <span className="text-sm text-muted-foreground line-through tabular-nums">
                      ${item.base_price.toFixed(2)}
                    </span>
                  )}
                </div>
              ) : (
                <PriceSourcePopover
                  itemId={item.id}
                  currentPrice={item.effective_price}
                  currentCashPrice={item.effective_cash_price ?? null}
                  sourceLevel={priceSourceToLevel(item.price_source)}
                  locationId={isAllLocations || isSingleLocation ? null : selectedLocationId}
                  canRemoveOverride={
                    item.price_source === "location_item" && !isAllLocations
                  }
                  editScope={deriveScopeFromContext({
                    isAllLocations,
                    locationName: locationName || null,
                  })}
                >
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-medium tracking-[-0.02em] tabular-nums">
                      ${item.effective_price.toFixed(2)}
                    </span>
                    {hasOverride && item.base_price !== item.effective_price && (
                      <span className="text-sm text-muted-foreground line-through tabular-nums">
                        ${item.base_price.toFixed(2)}
                      </span>
                    )}
                    <Info className="h-3 w-3 self-center text-muted-foreground/60" />
                  </div>
                </PriceSourcePopover>
              )}
              {item.effective_cash_price && (
                <span
                  className={cn(
                    BADGE_SHELL,
                    "bg-muted/60 text-muted-foreground tabular-nums",
                  )}
                >
                  Cash: ${item.effective_cash_price.toFixed(2)}
                </span>
              )}
            </div>

            {/* Tax & Channel Badges */}
            <div className="mt-3 flex flex-wrap gap-1.5 pt-3">
              {modifierGroupCount > 0 && (
                <span
                  className={cn(BADGE_SHELL, "bg-muted/60 text-muted-foreground")}
                >
                  <Layers className="h-2.5 w-2.5 shrink-0" />
                  <span className="tabular-nums">{modifierGroupCount}</span>
                  {modifierGroupCount === 1 ? "modifier group" : "modifier groups"}
                </span>
              )}

              {/* Tax Badge */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className={cn(
                        BADGE_SHELL,
                        "cursor-help",
                        item.effective_is_tax_exempt
                          ? cn(TAX_BADGE_STYLES.exempt.bg, TAX_BADGE_STYLES.exempt.text)
                          : cn(TAX_BADGE_STYLES.taxed.bg, TAX_BADGE_STYLES.taxed.text),
                      )}
                    >
                      {item.effective_is_tax_exempt ? (
                        <>
                          <ShieldX className="h-2.5 w-2.5 shrink-0" />
                          Tax Exempt
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="h-2.5 w-2.5 shrink-0" />
                          {TAX_CATEGORY_LABELS[
                            item.effective_tax_category as keyof typeof TAX_CATEGORY_LABELS
                          ] || item.effective_tax_category}
                          {taxRate && (
                            <span className="tabular-nums">
                              : {taxRate.percentage}%
                            </span>
                          )}
                        </>
                      )}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    {item.effective_is_tax_exempt ? (
                      <p>This item is tax exempt</p>
                    ) : taxRate ? (
                      <div className="space-y-1">
                        <p className="font-medium">{taxRate.name}</p>
                        <p className="text-xs tabular-nums">
                          Rate: {taxRate.percentage}% • Tax: ${taxAmount}
                        </p>
                        <p className="text-xs text-muted-foreground tabular-nums">
                          Total with tax: $
                          {(
                            parseFloat(item.effective_price.toString()) +
                            parseFloat(taxAmount)
                          ).toFixed(2)}
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        No tax rate set for this category
                      </p>
                    )}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {/* Channel Badges */}
              {item.effective_available_channels?.map((channel) => (
                <span
                  key={channel}
                  className={cn(BADGE_SHELL, "bg-muted/60 text-muted-foreground")}
                >
                  {channel === "pos" && (
                    <CreditCard className="h-2.5 w-2.5 shrink-0" />
                  )}
                  {channel === "online" && (
                    <Globe className="h-2.5 w-2.5 shrink-0" />
                  )}
                  {channel === "kiosk" && (
                    <Monitor className="h-2.5 w-2.5 shrink-0" />
                  )}
                  {channel.toUpperCase()}
                </span>
              ))}
            </div>
          </div>
          {canDelete && !isSelectionMode && (
            <Button
              size="sm"
              variant="ghost"
              className="mt-4 h-8 rounded-full px-3 text-[0.8125rem] font-medium text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Delete
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// ITEM ROW COMPONENT (List View)
// ============================================================================

function ItemRow({
  item,
  onEdit,
  onView,
  onDelete,
  index = 0,
  taxRates = [],
  canDelete = false,
  isSelectionMode = false,
  isSelected = false,
  onToggleSelect,
}: {
  item: FlatItem;
  onEdit: () => void;
  onView: () => void;
  onDelete: () => void;
  index?: number;
  taxRates?: any[];
  canDelete?: boolean;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
}) {
  const hasOverride = item.has_location_override;
  const priceStyle = priceSourceStyle(item.price_source);

  // Tax info
  const taxRate = taxRates.find(
    (r) => r.tax_category === item.effective_tax_category,
  );
  const taxAmount =
    taxRate && !item.effective_is_tax_exempt
      ? ((item.effective_price * taxRate.percentage) / 100).toFixed(2)
      : "0.00";
  const modifierGroupCount = item.modifier_groups?.length ?? 0;

  return (
    <div
      className="group animate-in fade-in slide-in-from-left-4"
      style={{ animationDelay: `${Math.min(index * 20, 200)}ms` }}
    >
      <div
        className={cn(
          "flex cursor-pointer items-center gap-4 rounded-2xl border-0 bg-muted/50 p-4 shadow-none transition-colors",
          "hover:bg-muted",
          hasOverride && "ring-1 ring-amber-500/30",
          isSelectionMode && isSelected &&
            "ring-2 ring-primary border-primary/50 bg-primary/5",
          isSelectionMode && !isSelected && "hover:ring-1 hover:ring-primary/30",
          !item.effective_availability && "opacity-70",
        )}
        onClick={
          isSelectionMode ? () => onToggleSelect?.(item.id) : onView
        }
      >
        {isSelectionMode && (
          <div
            className={cn(
              "shrink-0 flex items-center justify-center w-7 h-7 rounded-full border-2 transition-all duration-200",
              isSelected
                ? "bg-primary border-primary text-primary-foreground"
                : "bg-background border-border",
            )}
          >
            {isSelected && <Check className="h-4 w-4" strokeWidth={3} />}
          </div>
        )}
        {/* Image */}
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-muted/60">
          {isValidImageUrl(item.image) ? (
            <img
              src={item.image}
              alt={item.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <Utensils className="h-6 w-6 text-muted-foreground/50" />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h4 className="font-medium truncate">{item.name}</h4>
              {item.description && (
                <p className="text-sm text-muted-foreground truncate">
                  {item.description}
                </p>
              )}
              {/* Category, Tax & Channel tags */}
              <div className="mt-2 flex flex-wrap gap-1">
                {modifierGroupCount > 0 && (
                  <span
                    className={cn(BADGE_SHELL, "bg-muted/60 text-muted-foreground")}
                  >
                    <Layers className="h-2.5 w-2.5 shrink-0" />
                    <span className="tabular-nums">{modifierGroupCount}</span>
                    {modifierGroupCount === 1
                      ? "modifier group"
                      : "modifier groups"}
                  </span>
                )}

                {/* Category tags */}
                {item.categories.slice(0, 3).map((cat) => {
                  const scope = categoryScopeStyle(cat.is_global);
                  return (
                    <span
                      key={cat.id}
                      className={cn(BADGE_SHELL, scope.bg, scope.text)}
                    >
                      {cat.is_global ? (
                        <Globe className="h-2.5 w-2.5 shrink-0" />
                      ) : (
                        <MapPin className="h-2.5 w-2.5 shrink-0" />
                      )}
                      {cat.name}
                    </span>
                  );
                })}
                {item.categories.length > 3 && (
                  <span
                    className={cn(
                      BADGE_SHELL,
                      "bg-muted/60 text-muted-foreground tabular-nums",
                    )}
                  >
                    +{item.categories.length - 3}
                  </span>
                )}

                {/* Tax Badge */}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className={cn(
                          BADGE_SHELL,
                          "cursor-help",
                          item.effective_is_tax_exempt
                            ? cn(
                                TAX_BADGE_STYLES.exempt.bg,
                                TAX_BADGE_STYLES.exempt.text,
                              )
                            : cn(
                                TAX_BADGE_STYLES.taxed.bg,
                                TAX_BADGE_STYLES.taxed.text,
                              ),
                        )}
                      >
                        {item.effective_is_tax_exempt ? (
                          <>
                            <ShieldX className="h-2.5 w-2.5 shrink-0" />
                            Exempt
                          </>
                        ) : (
                          <>
                            <ShieldCheck className="h-2.5 w-2.5 shrink-0" />
                            {TAX_CATEGORY_LABELS[
                              item.effective_tax_category as keyof typeof TAX_CATEGORY_LABELS
                            ] || item.effective_tax_category}
                          </>
                        )}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      {item.effective_is_tax_exempt ? (
                        <p>Tax exempt</p>
                      ) : taxRate ? (
                        <div className="space-y-1">
                          <p className="text-xs font-medium">{taxRate.name}</p>
                          <p className="text-xs tabular-nums">
                            Rate: {taxRate.percentage}% • Tax: ${taxAmount}
                          </p>
                        </div>
                      ) : (
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                          No rate set
                        </p>
                      )}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                {/* Channel Badges */}
                {item.effective_available_channels?.map((channel) => (
                  <span
                    key={channel}
                    className={cn(BADGE_SHELL, "bg-muted/60 text-muted-foreground")}
                  >
                    {channel === "pos" && (
                      <CreditCard className="h-2.5 w-2.5 shrink-0" />
                    )}
                    {channel === "online" && (
                      <Globe className="h-2.5 w-2.5 shrink-0" />
                    )}
                    {channel === "kiosk" && (
                      <Monitor className="h-2.5 w-2.5 shrink-0" />
                    )}
                    {channel.toUpperCase()}
                  </span>
                ))}
              </div>
            </div>

            {/* Price and indicators */}
            <div className="flex w-24 shrink-0 flex-col items-end gap-1">
              <span className="font-medium leading-none tracking-[-0.02em] tabular-nums">
                ${item.effective_price.toFixed(2)}
              </span>
              {hasOverride && item.base_price !== item.effective_price && (
                <span className="text-xs leading-none text-muted-foreground line-through tabular-nums">
                  ${item.base_price.toFixed(2)}
                </span>
              )}
              {(item.price_source !== "base" || !item.effective_availability) && (
                <div className="flex items-center gap-1">
                  {item.price_source !== "base" && (
                    <span
                      className={cn(
                        BADGE_SHELL,
                        "px-1.5",
                        priceStyle.bg,
                        priceStyle.text,
                      )}
                      title={priceSourceLabel(item.price_source)}
                    >
                      {item.price_source === "location_item" ? (
                        <MapPin className="h-2.5 w-2.5" />
                      ) : item.price_source === "category" ? (
                        <Tag className="h-2.5 w-2.5" />
                      ) : (
                        <Layers className="h-2.5 w-2.5" />
                      )}
                    </span>
                  )}
                  {!item.effective_availability && (
                    <span
                      className={cn(
                        BADGE_SHELL,
                        ITEM_AVAILABILITY_STYLES.unavailable.bg,
                        ITEM_AVAILABILITY_STYLES.unavailable.text,
                      )}
                    >
                      Off
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        {!isSelectionMode && (
          <div className="hidden w-20 shrink-0 flex-col gap-1 opacity-0 transition-opacity group-hover:opacity-100 md:flex">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-full justify-start rounded-full px-2 text-[0.8125rem]"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
            >
              <Edit3 className="mr-1.5 h-3.5 w-3.5" />
              Edit
            </Button>
            {canDelete && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-full justify-start rounded-full px-2 text-[0.8125rem] text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Delete
              </Button>
            )}
          </div>
        )}

        {/* Mobile dropdown */}
        {!isSelectionMode && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 md:hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <Edit3 className="h-4 w-4 mr-2" />
                Quick Edit
              </DropdownMenuItem>
              {canDelete && (
                <DropdownMenuItem
                  onClick={onDelete}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// CATEGORY GROUP COMPONENT
// ============================================================================

function CategoryGroup({
  category,
  items,
  isExpanded,
  onToggle,
  onEditItem,
  onViewItem,
  onDeleteItem,
  canDeleteItems = false,
  taxRates = [],
  isAllLocations = false,
  selectedLocationId = null,
  isSelectionMode = false,
  selectedItemIds,
  onToggleSelect,
}: {
  category: {
    id: string;
    name: string;
    is_global: boolean;
    location_name?: string | null;
  };
  items: FlatItem[];
  isExpanded: boolean;
  onToggle: () => void;
  onEditItem: (item: FlatItem) => void;
  onViewItem: (item: FlatItem) => void;
  onDeleteItem: (item: FlatItem) => void;
  canDeleteItems?: boolean;
  taxRates?: any[];
  isAllLocations?: boolean;
  selectedLocationId?: string | null;
  isSelectionMode?: boolean;
  selectedItemIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}) {
  const selectedCount = isSelectionMode && selectedItemIds
    ? items.reduce((acc, it) => acc + (selectedItemIds.has(it.id) ? 1 : 0), 0)
    : 0;
  const allSelected =
    isSelectionMode && items.length > 0 && selectedCount === items.length;
  const someSelected = isSelectionMode && selectedCount > 0 && !allSelected;

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <div
        className={cn(
          "min-w-0 overflow-hidden rounded-2xl border bg-card transition-colors",
          isSelectionMode && selectedCount > 0 && "ring-1 ring-primary/30",
        )}
      >
        <CollapsibleTrigger asChild>
          <div
            className={cn(
              "cursor-pointer px-6 py-4 transition-colors hover:bg-muted/50",
              isSelectionMode && selectedCount > 0 && "bg-primary/5",
            )}
          >
            <div className="flex min-w-0 items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-3 overflow-hidden">
                {isExpanded ? (
                  <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                )}
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <h3 className="truncate text-[1.0625rem] font-semibold text-[#0C4FD1] dark:text-[#6CA0FF]">
                    {category.name}
                  </h3>
                  {(() => {
                    const scope = categoryScopeStyle(category.is_global);
                    return (
                      <span className={cn(BADGE_SHELL, scope.bg, scope.text)}>
                        {category.is_global ? (
                          <>
                            <Globe className="h-3 w-3 shrink-0" />
                            Global
                          </>
                        ) : (
                          <>
                            <MapPin className="h-3 w-3 shrink-0" />
                            {category.location_name || "Location"}
                          </>
                        )}
                      </span>
                    );
                  })()}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {isSelectionMode && (
                  <>
                    {selectedCount > 0 && (
                      <span
                        className={cn(BADGE_SHELL, "bg-primary/15 text-primary")}
                      >
                        <CheckCircle2 className="h-3 w-3 shrink-0" />
                        <span className="tabular-nums">{selectedCount}</span>
                        selected
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!onToggleSelect) return;
                        if (allSelected) {
                          items.forEach((it) => {
                            if (selectedItemIds?.has(it.id))
                              onToggleSelect(it.id);
                          });
                        } else {
                          items.forEach((it) => {
                            if (!selectedItemIds?.has(it.id))
                              onToggleSelect(it.id);
                          });
                        }
                      }}
                      className={cn(
                        "flex items-center justify-center w-7 h-7 rounded-full border-2 transition-all duration-200",
                        allSelected
                          ? "bg-primary border-primary text-primary-foreground"
                          : someSelected
                            ? "bg-primary/20 border-primary text-primary"
                            : "bg-background border-border hover:border-primary/60",
                      )}
                      aria-label={
                        allSelected
                          ? `Deselect all in ${category.name}`
                          : `Select all in ${category.name}`
                      }
                    >
                      {allSelected ? (
                        <Check className="h-4 w-4" strokeWidth={3} />
                      ) : someSelected ? (
                        <span className="block w-2.5 h-0.5 bg-primary rounded-full" />
                      ) : null}
                    </button>
                  </>
                )}
                <span
                  className={cn(BADGE_SHELL, "bg-muted/60 text-muted-foreground")}
                >
                  <span className="tabular-nums">{items.length}</span>
                  item{items.length !== 1 ? "s" : ""}
                </span>
              </div>
            </div>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-6 pb-6 pt-0">
            {items.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                <Utensils className="mx-auto mb-2 h-8 w-8 opacity-50" />
                <p className="text-sm">No items in this category</p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {items.map((item, idx) => {
                  // Can delete if: viewing all locations OR item belongs to current location
                  const itemCanDelete = isAllLocations
                    ? true
                    : !isAllLocations &&
                      item.location_id === selectedLocationId;
                  return (
                    <ItemCard
                      key={item.id}
                      item={item}
                      index={idx}
                      taxRates={taxRates}
                      onEdit={() => onEditItem(item)}
                      onView={() => onViewItem(item)}
                      onDelete={() => onDeleteItem(item)}
                      canDelete={itemCanDelete && canDeleteItems}
                      isSelectionMode={isSelectionMode}
                      isSelected={selectedItemIds?.has(item.id) ?? false}
                      onToggleSelect={onToggleSelect}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

// ============================================================================
// MAIN PAGE COMPONENT
// ============================================================================

export default function MenuItemsPage() {
  const { data: userInfo } = useUserInfo();
  const clerkOrgId = userInfo?.members?.[0]?.organizations?.id;
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const { selectedLocationId } = useLocationStore();
  const { canCreate, isMember, isManager, assignedLocationIds } =
    useManagerPermissions();

  // Location context
  const { isAllLocations, locationName } = useLocationContext();
  const isSingleLocation = useIsSingleLocation();

  // Gate the "Create Item" trigger on role + current location context.
  // Owners can always create. Managers at "all" need exactly 1 assigned
  // location (auto-routed); at a specific location they must be assigned
  // to it. Members can never create.
  const createTargetLocId =
    isManager && isAllLocations && assignedLocationIds.length === 1
      ? assignedLocationIds[0]
      : isAllLocations
        ? null
        : selectedLocationId;
  const canCreateItem = !isMember && canCreate(createTargetLocId);
  const createDisabledReason = isMember
    ? "View-only access"
    : isManager && isAllLocations && assignedLocationIds.length > 1
      ? "Switch to a specific location to create"
      : !canCreateItem
        ? "You don't have permission to create items here"
        : "";

  // Tax rates for current location
  const { data: taxRatesData } = useLocationTaxRates();
  const taxRates = taxRatesData?.data || [];

  // Get flat items with categories
  const {
    data: itemsData,
    isLoading,
    isError,
    refetch,
  } = useLocationScopedMenuItemsWithCategories();

  console.log("itemsData", itemsData?.data?.[0]);
  // Get categories for filtering
  const { data: categoriesData } = useCategoriesWithItems(
    clerkOrgId || "",
    selectedLocationId,
  );
  const { data: modifierGroups } = useModifierGroups(clerkOrgId);

  // State
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<FlatItem | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null,
  );
  const [showCategoryFilter, setShowCategoryFilter] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(),
  );
  const [deletingItem, setDeletingItem] = useState<FlatItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCreateWizardOpen, setIsCreateWizardOpen] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [bulkPriceDialogOpen, setBulkPriceDialogOpen] = useState(false);
  const [bulkDeliveryDialogOpen, setBulkDeliveryDialogOpen] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  const toggleItemSelected = (id: string) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedItemIds(new Set());

  // Read category filter from URL
  useEffect(() => {
    const categoryParam = searchParams.get("category");
    if (categoryParam) {
      setSelectedCategoryId(categoryParam);
      setShowCategoryFilter(true);
    }
  }, [searchParams]);

  // Extract data
  const itemsList = useMemo(() => {
    return Array.isArray(itemsData?.data) ? (itemsData.data as FlatItem[]) : [];
  }, [itemsData?.data]);

  const categoriesList = useMemo(() => {
    return Array.isArray(categoriesData?.data)
      ? (categoriesData.data as CategoryWithItems[])
      : [];
  }, [categoriesData?.data]);

  // Filter items
  const filteredItems = useMemo(() => {
    let filtered = itemsList;

    // Search filter
    if (searchTerm) {
      const query = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (item) =>
          item.name.toLowerCase().includes(query) ||
          item.description?.toLowerCase().includes(query) ||
          item.categories.some((c) => c.name.toLowerCase().includes(query)),
      );
    }

    // Category filter
    if (selectedCategoryId) {
      if (selectedCategoryId === "uncategorized") {
        filtered = filtered.filter((item) => item.categories.length === 0);
      } else {
        filtered = filtered.filter((item) =>
          item.categories.some((c) => c.id === selectedCategoryId),
        );
      }
    }

    return filtered;
  }, [itemsList, searchTerm, selectedCategoryId]);

  // Group items by category for category view
  const itemsByCategory = useMemo(() => {
    const groups = new Map<
      string,
      { category: (typeof categoriesList)[0]; items: FlatItem[] }
    >();

    // Create groups for each category
    for (const category of categoriesList) {
      groups.set(category.id, {
        category: category,
        items: [],
      });
    }

    // Add items to their categories
    for (const item of filteredItems) {
      for (const cat of item.categories) {
        const group = groups.get(cat.id);
        if (group) {
          group.items.push(item);
        }
      }
    }

    // Add uncategorized items
    const uncategorizedItems = filteredItems.filter(
      (item) => item.categories.length === 0,
    );
    if (uncategorizedItems.length > 0) {
      groups.set("uncategorized", {
        category: {
          id: "uncategorized",
          name: "Uncategorized",
          description: null,
          image: null,
          display_order: 999,
          is_global: true,
          location_id: null,
          location_name: null,
          is_active: true,
          effective_is_active: true,
          effective_display_order: 999,
          effective_name: "Uncategorized",
          items: [],
          item_count: 0,
          menu_count: 0,
          has_location_override: false,
          location_override: null,
          created_at: "",
          created_by: "",
          updated_at: "",
        } as CategoryWithItems,
        items: uncategorizedItems,
      });
    }

    return Array.from(groups.values()).filter((g) => g.items.length > 0);
  }, [categoriesList, filteredItems]);

  // Stats
  const stats = useMemo(
    () => ({
      total: itemsList.length,
      available: itemsList.filter((i) => i.effective_availability).length,
      unavailable: itemsList.filter((i) => !i.effective_availability).length,
      withOverrides: itemsList.filter((i) => i.has_location_override).length,
      avgPrice:
        itemsList.length > 0
          ? itemsList.reduce((acc, i) => acc + i.effective_price, 0) /
            itemsList.length
          : 0,
      uncategorized: itemsList.filter((i) => i.categories.length === 0).length,
    }),
    [itemsList],
  );

  // Category counts for filter
  const categoryItemCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    itemsList.forEach((item) => {
      item.categories.forEach((cat) => {
        counts[cat.id] = (counts[cat.id] || 0) + 1;
      });
    });
    return counts;
  }, [itemsList]);

  // Handlers
  // The popup item editor is canonical for both single- and multi-location
  // accounts. It respects the single-vs-multi flow via location scope: a
  // single-location account is locked to the 'all'/core scope, so edits write
  // the global core (no per-location overlay rows); a multi-location account can
  // target a specific location for cascade overrides. The dedicated /edit page
  // stays reachable by direct URL.
  const handleQuickEdit = async (item: FlatItem) => {
    // If the RPC didn't return modifier_groups, fetch them directly
    let itemWithModifiers = item;
    if (!item.modifier_groups || item.modifier_groups.length === 0) {
      const groups = await getItemModifierGroups(item.id, isAllLocations ? null : selectedLocationId);
      if (groups.length > 0) {
        itemWithModifiers = {
          ...item,
          modifier_groups: groups.map((g: any) => ({
            id: g.id,
            name: g.name,
            description: g.description ?? null,
            base_min_selections: 0,
            base_max_selections: null,
            base_is_required: false,
            base_is_active: true,
            location_override: null,
            effective_availability: true,
            has_location_override: false,
            items: [],
          })),
        };
      }
    }
    setEditingItem(itemWithModifiers);
    setIsCreateSheetOpen(true);
  };

  const handleViewDetails = (item: FlatItem) => {
    router.push(`/dashboard/menu/items/${item.id}`);
  };

  const toggleCategoryExpanded = (categoryId: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };

  const expandAllCategories = () => {
    setExpandedCategories(new Set(itemsByCategory.map((g) => g.category.id)));
  };

  const collapseAllCategories = () => {
    setExpandedCategories(new Set());
  };

  // Handle deleting location override (reset to global)
  const handleDeleteLocationOverride = async () => {
    if (!deletingItem || !selectedLocationId || isAllLocations) return;

    setIsDeleting(true);
    try {
      const result = await resetItemToLevel(deletingItem.id, 1, {
        locationId: selectedLocationId,
      });

      if (result.error || !result.success) {
        toast.error("Delete Failed", {
          description:
            result.error ||
            "Unable to remove location override. Please try again.",
        });
        return;
      }

      toast.success("Location Override Removed", {
        description: `"${deletingItem.name}" will now use global pricing at this location.`,
      });

      queryClient.invalidateQueries({ queryKey: ["menu-items"] });
      queryClient.invalidateQueries({ queryKey: ["menu-items-flat"] });
      queryClient.invalidateQueries({ queryKey: ["categories-with-items"] });
      invalidateOrderOutSync(queryClient);
      refetch();
    } catch (error) {
      toast.error("Delete Failed", {
        description: "Unable to remove location override. Please try again.",
      });
    } finally {
      setIsDeleting(false);
      setDeletingItem(null);
    }
  };

  // Handle deleting item entirely
  const handleDeleteItem = async () => {
    if (!deletingItem) return;

    // When viewing a specific location, only allow deleting location-specific items
    if (!isAllLocations) {
      if (deletingItem.location_id !== selectedLocationId) {
        toast.error("Delete Failed", {
          description:
            "You can only delete items that belong to this location.",
        });
        setDeletingItem(null);
        return;
      }
    }

    setIsDeleting(true);
    try {
      const result = await DeleteMenuItem(
        deletingItem.id,
        selectedLocationId === "all" ? null : selectedLocationId,
      );

      if (result.error) {
        toast.error("Delete Failed", {
          description: result.error,
        });
        return;
      }

      toast.success("Item Deleted", {
        description: isAllLocations
          ? `"${deletingItem.name}" has been permanently deleted from all locations.`
          : `"${deletingItem.name}" has been permanently deleted.`,
      });

      queryClient.invalidateQueries({ queryKey: ["menu-items"] });
      queryClient.invalidateQueries({ queryKey: ["menu-items-flat"] });
      queryClient.invalidateQueries({ queryKey: ["categories-with-items"] });
      invalidateOrderOutSync(queryClient);
      refetch();
    } catch (error) {
      toast.error("Delete Failed", {
        description: "Unable to delete item. Please try again.",
      });
    } finally {
      setIsDeleting(false);
      setDeletingItem(null);
    }
  };

  // Error state
  const hasError =
    (itemsData && "error" in itemsData && itemsData.error) ||
    itemsData?.success === false;
  const errorMessage =
    itemsData && "error" in itemsData && typeof itemsData.error === "string"
      ? itemsData.error
      : "Error fetching menu items";

  if (hasError && !isLoading) {
    return (
      <PageShell>
        <PageHeader
          title="Item Library"
          subtitle="Manage your menu items"
        />
        <Panel padded>
          <Empty
            icon={Utensils}
            title="Error loading items"
            description={errorMessage}
            action={
              <Button
                onClick={() => refetch()}
                variant="outline"
                className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
              >
                Try Again
              </Button>
            }
          />
        </Panel>
      </PageShell>
    );
  }

  const selectedCategory = categoriesList.find(
    (c) => c.id === selectedCategoryId,
  );

  return (
    <PageShell>
      <ScopeContextStrip />

      <PageHeader
        title="Item Library"
        subtitle={
          isSingleLocation
            ? "All items on your menu. Items live within categories."
            : isAllLocations
              ? "All items across your organization. Items live within categories."
              : `Viewing items for ${locationName} with location-specific pricing.`
        }
        indicator={
          !isSingleLocation ? (
            <div className="flex flex-wrap items-center gap-2">
              <LocationIndicator
                isAllLocations={isAllLocations}
                locationName={locationName}
              />
              {!isAllLocations && stats.withOverrides > 0 && (
                <span
                  className={cn(
                    BADGE_SHELL,
                    OVERRIDE_BADGE_STYLE.bg,
                    OVERRIDE_BADGE_STYLE.text,
                  )}
                >
                  <Sparkles className="h-3 w-3 shrink-0" />
                  <span className="tabular-nums">{stats.withOverrides}</span>
                  with local pricing
                </span>
              )}
            </div>
          ) : undefined
        }
        actions={
          <>
            {canCreateItem ? (
              <Button
                onClick={() => setIsCreateWizardOpen(true)}
                className="h-9 gap-1.5 rounded-full px-4 text-[0.8125rem] font-medium"
              >
                <Plus className="h-4 w-4" />
                Create Item
              </Button>
            ) : !isMember ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button
                        disabled
                        className="h-9 gap-1.5 rounded-full px-4 text-[0.8125rem] font-medium"
                        aria-label={createDisabledReason}
                      >
                        <Plus className="h-4 w-4" />
                        Create Item
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{createDisabledReason}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : null}
            {/* `min-w-0` + a truncating label: Button sets `whitespace-nowrap`, so
                this long label would otherwise push past the viewport edge on a
                narrow screen even once the action row wraps. */}
            <Button
              onClick={() => router.push("/dashboard/menu/categories")}
              variant="outline"
              className="h-9 min-w-0 gap-1.5 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
            >
              <Plus className="h-4 w-4 shrink-0" />
              <span className="truncate">Add Items to Categories</span>
            </Button>
          </>
        }
      />

      {/* Stats */}
      <Panel>
        <div className="px-6 py-6">
          <StatRow columns={4}>
            <StatTile
              label="Total Items"
              icon={<Utensils />}
              value={stats.total}
              meta={`In ${categoriesList.length} categories`}
              isLoading={isLoading}
            />
            <StatTile
              label="Available"
              icon={<Package />}
              value={stats.available}
              meta={
                stats.unavailable > 0
                  ? `${stats.unavailable} unavailable`
                  : "All items available"
              }
              isLoading={isLoading}
            />
            <StatTile
              label="Avg Price"
              icon={<DollarSign />}
              value={`$${stats.avgPrice.toFixed(2)}`}
              meta="Across all items"
              isLoading={isLoading}
            />
            <StatTile
              label="Uncategorized"
              icon={<Tag />}
              value={stats.uncategorized}
              meta={
                stats.uncategorized > 0
                  ? "Need categorization"
                  : "All items categorized"
              }
              isLoading={isLoading}
            />
          </StatRow>
        </div>
      </Panel>

      {/* Items List */}
      <Panel padded>
        <div className="space-y-4">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 text-[1.0625rem] font-semibold text-[#0C4FD1] dark:text-[#6CA0FF]">
                All Items
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {selectedCategoryId ? (
                  <>
                    <span className="tabular-nums">{filteredItems.length}</span>
                    {" items in "}
                    {selectedCategoryId === "uncategorized"
                      ? "uncategorized"
                      : selectedCategory?.name || "selected category"}
                  </>
                ) : (
                  <>
                    <span className="tabular-nums">{filteredItems.length}</span>
                    {" items found"}
                  </>
                )}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Search */}
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
                <Input
                  placeholder="Search items..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-9 w-48 pl-9 text-[0.8125rem] sm:w-64"
                />
              </div>

              {/* Category Filter Toggle */}
              {categoriesList.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowCategoryFilter(!showCategoryFilter)}
                  className={cn(
                    "h-9 gap-1.5 rounded-full border-0 px-4 text-[0.8125rem] font-medium shadow-none",
                    showCategoryFilter || selectedCategoryId
                      ? "bg-muted text-foreground"
                      : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Filter className="h-4 w-4" />
                  Filter
                  {selectedCategoryId && (
                    <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground tabular-nums">
                      1
                    </span>
                  )}
                </Button>
              )}

              {/* Selection Mode Toggle — works across all views */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIsSelectionMode((prev) => {
                    if (prev) clearSelection();
                    return !prev;
                  });
                }}
                className={cn(
                  "h-9 gap-1.5 rounded-full border-0 px-4 text-[0.8125rem] font-medium shadow-none",
                  isSelectionMode
                    ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
                    : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <CheckSquare className="h-4 w-4" />
                {isSelectionMode ? "Selecting" : "Select"}
                {isSelectionMode && selectedItemIds.size > 0 && (
                  <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary-foreground/20 px-1 text-[10px] font-medium tabular-nums">
                    {selectedItemIds.size}
                  </span>
                )}
              </Button>

              {/* View Mode Toggle */}
              <div className="inline-flex items-center gap-0.5 rounded-full bg-muted/70 p-1">
                {(
                  [
                    { mode: "grid" as const, Icon: Grid3x3, label: "Grid view" },
                    { mode: "list" as const, Icon: List, label: "List view" },
                    {
                      mode: "categories" as const,
                      Icon: Layers,
                      label: "Category view",
                    },
                  ]
                ).map(({ mode, Icon, label }) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setViewMode(mode)}
                    aria-label={label}
                    aria-pressed={viewMode === mode}
                    className={cn(
                      "inline-flex size-7 shrink-0 items-center justify-center rounded-full transition-colors",
                      viewMode === mode
                        ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Category Filter Pills */}
          {showCategoryFilter && categoriesList.length > 0 && (
            <div className="space-y-3 pt-4 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedCategoryId(null)}
                  className={cn(
                    "inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-medium transition-colors",
                    selectedCategoryId === null
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  All
                  <span className="tabular-nums opacity-70">
                    {itemsList.length}
                  </span>
                </button>
                {categoriesList.map((category) => {
                  const count = categoryItemCounts[category.id] || 0;
                  const isActive = selectedCategoryId === category.id;
                  return (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => setSelectedCategoryId(category.id)}
                      className={cn(
                        "inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-medium transition-colors",
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
                        count === 0 && !isActive && "opacity-50",
                      )}
                    >
                      {category.is_global ? (
                        <Globe className="h-3 w-3 shrink-0" />
                      ) : (
                        <MapPin className="h-3 w-3 shrink-0" />
                      )}
                      {category.name}
                      <span className="tabular-nums opacity-70">{count}</span>
                    </button>
                  );
                })}
                {stats.uncategorized > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedCategoryId("uncategorized")}
                    className={cn(
                      "inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-medium transition-colors",
                      selectedCategoryId === "uncategorized"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    Uncategorized
                    <span className="tabular-nums opacity-70">
                      {stats.uncategorized}
                    </span>
                  </button>
                )}
              </div>

              {selectedCategoryId && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    Filtered by:
                  </span>
                  <span
                    className={cn(
                      BADGE_SHELL,
                      "gap-1 bg-muted/60 py-1 pr-1 text-muted-foreground",
                    )}
                  >
                    {selectedCategoryId === "uncategorized"
                      ? "Uncategorized"
                      : selectedCategory?.name || "Unknown"}
                    <button
                      type="button"
                      onClick={() => setSelectedCategoryId(null)}
                      aria-label="Clear category filter"
                      className="inline-flex size-4 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Category view controls */}
          {viewMode === "categories" && (
            <div className="flex items-center gap-2 pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={expandAllCategories}
                className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
              >
                Expand All
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={collapseAllCategories}
                className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
              >
                Collapse All
              </Button>
            </div>
          )}
        </div>

        <div className="mt-6">
          {isSelectionMode && (
            <div className="sticky top-0 z-20 mb-4 flex flex-wrap items-center gap-2 rounded-2xl border-0 bg-muted/60 px-4 py-2.5 shadow-none backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex items-center gap-2 text-sm font-medium">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <span>
                  <span className="tabular-nums">{selectedItemIds.size}</span> of{" "}
                  <span className="tabular-nums">{filteredItems.length}</span>{" "}
                  selected
                </span>
              </div>
              <div className="mx-1 h-5 w-px bg-border/60" />
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1 rounded-full px-3 text-xs"
                onClick={() => {
                  const allSelected =
                    filteredItems.length > 0 &&
                    filteredItems.every((it) => selectedItemIds.has(it.id));
                  if (allSelected) {
                    clearSelection();
                  } else {
                    setSelectedItemIds(
                      new Set(filteredItems.map((it) => it.id)),
                    );
                  }
                }}
                disabled={filteredItems.length === 0}
              >
                <CheckCheck className="h-3.5 w-3.5" />
                {filteredItems.length > 0 &&
                filteredItems.every((it) => selectedItemIds.has(it.id))
                  ? "Deselect all"
                  : "Select all"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 rounded-full px-3 text-xs"
                onClick={clearSelection}
                disabled={selectedItemIds.size === 0}
              >
                Clear
              </Button>
              <div className="ml-auto flex items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm"
                      variant="default"
                      className="h-8 gap-1 rounded-full px-4 text-[0.8125rem] font-medium"
                      disabled={selectedItemIds.size === 0}
                    >
                      Bulk edit
                      <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => setBulkPriceDialogOpen(true)}
                      disabled={selectedItemIds.size === 0}
                    >
                      <DollarSign className="h-4 w-4 mr-2" />
                      Adjust card price…
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setBulkDeliveryDialogOpen(true)}
                      disabled={selectedItemIds.size === 0}
                    >
                      <Truck className="h-4 w-4 mr-2" />
                      Adjust online (delivery) price…
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 gap-1 rounded-full px-3 text-[0.8125rem]"
                  onClick={() => {
                    setIsSelectionMode(false);
                    clearSelection();
                  }}
                >
                  <X className="h-4 w-4" />
                  Done
                </Button>
              </div>
            </div>
          )}
          {isLoading ? (
            <div
              className={
                viewMode === "grid" || viewMode === "categories"
                  ? "grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                  : "space-y-3"
              }
            >
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <Skeleton
                  key={i}
                  className={cn(
                    "rounded-2xl",
                    viewMode === "list" ? "h-20" : "h-64",
                  )}
                />
              ))}
            </div>
          ) : filteredItems.length === 0 ? (
            <Empty
              icon={Utensils}
              title={
                itemsList.length === 0
                  ? "No items yet"
                  : selectedCategoryId
                    ? "No items in this category"
                    : "No items found"
              }
              description={
                itemsList.length === 0
                  ? "Items live within categories. Create categories first, then add items."
                  : selectedCategoryId
                    ? "Try selecting a different category or clear the filter"
                    : "Try adjusting your search terms"
              }
              action={
                itemsList.length === 0 ? (
                  <Button
                    onClick={() => router.push("/dashboard/menu/categories")}
                    className="h-9 rounded-full px-4 text-[0.8125rem] font-medium"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Go to Categories
                  </Button>
                ) : selectedCategoryId ? (
                  <Button
                    variant="outline"
                    onClick={() => setSelectedCategoryId(null)}
                    className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
                  >
                    <X className="mr-2 h-4 w-4" />
                    Clear Filter
                  </Button>
                ) : null
              }
            />
          ) : viewMode === "categories" ? (
            // Category Groups View
            <div className="space-y-4">
              {itemsByCategory.map((group) => {
                // Can delete if: viewing all locations OR any item in group belongs to current location
                const canDelete =
                  isAllLocations ||
                  group.items.some(
                    (item) => item.location_id === selectedLocationId,
                  );
                return (
                  <CategoryGroup
                    key={group.category.id}
                    category={{
                      id: group.category.id,
                      name: group.category.name,
                      is_global: group.category.is_global,
                      location_name: group.category.location_name,
                    }}
                    items={group.items}
                    isExpanded={expandedCategories.has(group.category.id)}
                    onToggle={() => toggleCategoryExpanded(group.category.id)}
                    onEditItem={handleQuickEdit}
                    onViewItem={handleViewDetails}
                    onDeleteItem={(item) => setDeletingItem(item)}
                    canDeleteItems={canDelete}
                    taxRates={taxRates}
                    isAllLocations={isAllLocations}
                    selectedLocationId={selectedLocationId}
                    isSelectionMode={isSelectionMode}
                    selectedItemIds={selectedItemIds}
                    onToggleSelect={toggleItemSelected}
                  />
                );
              })}
            </div>
          ) : viewMode === "grid" ? (
            // Grid View
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredItems.map((item, index) => {
                // Can delete if: viewing all locations OR item belongs to current location
                const canDelete = isAllLocations
                  ? true
                  : !isAllLocations && item.location_id === selectedLocationId;

                return (
                  <ItemCard
                    key={item.id}
                    item={item}
                    index={index}
                    taxRates={taxRates}
                    onEdit={() => handleQuickEdit(item)}
                    onView={() => handleViewDetails(item)}
                    onDelete={() => setDeletingItem(item)}
                    canDelete={canDelete}
                    isSelectionMode={isSelectionMode}
                    isSelected={selectedItemIds.has(item.id)}
                    onToggleSelect={toggleItemSelected}
                  />
                );
              })}
            </div>
          ) : (
            // List View
            <div className="space-y-2">
              {filteredItems.map((item, index) => {
                // Can delete if: viewing all locations OR item belongs to current location
                const canDelete = isAllLocations
                  ? true
                  : !isAllLocations && item.location_id === selectedLocationId;
                return (
                  <ItemRow
                    key={item.id}
                    item={item}
                    index={index}
                    taxRates={taxRates}
                    onEdit={() => handleQuickEdit(item)}
                    onView={() => handleViewDetails(item)}
                    onDelete={() => setDeletingItem(item)}
                    canDelete={canDelete}
                    isSelectionMode={isSelectionMode}
                    isSelected={selectedItemIds.has(item.id)}
                    onToggleSelect={toggleItemSelected}
                  />
                );
              })}
            </div>
          )}
        </div>
      </Panel>

      {/* Edit Item Sheet */}
      <NewEditItemFormSheet
        open={isCreateSheetOpen}
        onOpenChange={(open) => {
          setIsCreateSheetOpen(open);
          if (!open) setEditingItem(null);
        }}
        clerkOrgId={clerkOrgId}
        editItem={mapFlatItemToEditItem(editingItem)}
        categories={categoriesList.map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description,
          is_active: c.is_active,
          display_order: c.display_order,
          merchant_id: "",
          menu_id: null,
          image: c.image,
          created_at: c.created_at,
          updated_at: c.updated_at,
          is_global: c.is_global,
          location_name: c.location_name,
        }))}
        modifierGroups={modifierGroups}
        onSuccess={() => {
          setIsCreateSheetOpen(false);
          setEditingItem(null);
          queryClient.invalidateQueries({ queryKey: ["menu-items"] });
          queryClient.invalidateQueries({ queryKey: ["menu-items-flat"] });
          queryClient.invalidateQueries({ queryKey: ["categories-with-items"] });
          invalidateOrderOutSync(queryClient);
          refetch();
        }}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deletingItem}
        onOpenChange={(open) => !open && setDeletingItem(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              {isAllLocations ? "Delete Item" : "Remove Location Override"}
            </DialogTitle>
            <DialogDescription>
              {isAllLocations ? (
                <>
                  Are you sure you want to delete &quot;{deletingItem?.name}
                  &quot;? This will permanently remove the item from all
                  locations, menus, and categories.
                  <span className="block mt-2 font-medium text-foreground">
                    This action cannot be undone.
                  </span>
                </>
              ) : (
                <>
                  Are you sure you want to delete &quot;{deletingItem?.name}
                  &quot;? This will permanently remove this location-specific
                  item from {locationName}.
                  <span className="block mt-2 font-medium text-foreground">
                    This action cannot be undone.
                  </span>
                  <span className="block mt-2 text-sm text-muted-foreground">
                    Only items that belong to this location can be deleted.
                  </span>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeletingItem(null)}
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
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Item
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Item Wizard */}
      {isCreateWizardOpen && (
        <CreateItemWizard
          open={isCreateWizardOpen}
          onOpenChange={setIsCreateWizardOpen}
          clerkOrgId={clerkOrgId || ""}
          categoriesList={categoriesList}
          isAllLocations={isAllLocations}
          selectedLocationId={selectedLocationId}
          onSuccess={() => {
            setIsCreateWizardOpen(false);
            queryClient.invalidateQueries({ queryKey: ["menu-items"] });
            queryClient.invalidateQueries({ queryKey: ["menu-items-flat"] });
            queryClient.invalidateQueries({ queryKey: ["categories-with-items"] });
            invalidateOrderOutSync(queryClient);
            refetch();
          }}
        />
      )}

      {/* Bulk Price Adjustment */}
      <BulkPriceAdjustDialog
        open={bulkPriceDialogOpen}
        onOpenChange={setBulkPriceDialogOpen}
        clerkOrgId={clerkOrgId}
        currentLocationId={isAllLocations || isSingleLocation ? null : selectedLocationId}
        isAllLocations={isAllLocations}
        selectedItems={filteredItems
          .filter((it) => selectedItemIds.has(it.id))
          .map((it) => ({
            id: it.id,
            name: it.name,
            effectivePrice: it.effective_price,
          }))}
        onSuccess={() => {
          clearSelection();
          setIsSelectionMode(false);
          queryClient.invalidateQueries({ queryKey: ["menu-items"] });
          queryClient.invalidateQueries({ queryKey: ["menu-items-flat"] });
          queryClient.invalidateQueries({
            queryKey: ["categories-with-items"],
          });
          invalidateOrderOutSync(queryClient);
          refetch();
        }}
      />

      {/* Bulk Delivery (Online) Price Adjustment */}
      <BulkDeliveryPriceAdjustDialog
        open={bulkDeliveryDialogOpen}
        onOpenChange={setBulkDeliveryDialogOpen}
        clerkOrgId={clerkOrgId}
        currentLocationId={isAllLocations || isSingleLocation ? null : selectedLocationId}
        isAllLocations={isAllLocations}
        selectedItems={filteredItems
          .filter((it) => selectedItemIds.has(it.id))
          .map((it) => ({
            id: it.id,
            name: it.name,
            cardPrice: it.effective_price,
            currentDeliveryPrice: it.effective_delivery_price ?? null,
          }))}
        onSuccess={() => {
          clearSelection();
          setIsSelectionMode(false);
          queryClient.invalidateQueries({ queryKey: ["menu-items"] });
          queryClient.invalidateQueries({ queryKey: ["menu-items-flat"] });
          queryClient.invalidateQueries({
            queryKey: ["categories-with-items"],
          });
          invalidateOrderOutSync(queryClient);
          refetch();
        }}
      />
    </PageShell>
  );
}
