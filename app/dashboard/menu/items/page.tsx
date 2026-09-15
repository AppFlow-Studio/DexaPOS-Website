"use client";
//TODO: Setup or remove the items detailed page
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Utensils,
  Plus,
  Search,
  Grid3x3,
  List,
  Table2,
  Package,
  DollarSign,
  Edit3,
  Eye,
  EyeOff,
  MoreVertical,
  MoreHorizontal,
  GripVertical,
  Tag,
  X,
  Filter,
  Info,
  ChevronDown,
  ChevronRight,
  Globe,
  Layers,
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
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useCategoriesWithItems } from "../../hooks/useCategories";
import { useModifierGroups } from "../../hooks/useModifierGroups";
import { useUserInfo } from "../../../manage/hooks/useUserInfo.";
import { Skeleton } from "@/components/ui/skeleton";
import { DataPageSkeleton } from "@/components/dashboard/loading/DataPageSkeleton";
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { UpdateLocationCategoryItemsOrder } from "../../actions/item-assignments";
import {
  UpdateCategory,
  UpdateLocationCategoryOverride,
} from "../../actions/categories";
import { CreateItemWizard } from "@/components/dashboard/menu/items/CreateItemWizard";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
type ItemCategorySummary = FlatItem["categories"][number] &
  Partial<Pick<CategoryWithItems, "is_active" | "effective_is_active">>;

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
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);

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
  const availabilityStyle = item.effective_availability
    ? ITEM_AVAILABILITY_STYLES.available
    : ITEM_AVAILABILITY_STYLES.unavailable;
  const availableChannels = item.effective_available_channels ?? [];
  const taxLabel = item.effective_is_tax_exempt
    ? "Tax exempt"
    : TAX_CATEGORY_LABELS[
        item.effective_tax_category as keyof typeof TAX_CATEGORY_LABELS
      ] || item.effective_tax_category;

  return (
    <div
      className="group min-w-0 max-w-full animate-in fade-in slide-in-from-bottom-4"
      style={{ animationDelay: `${Math.min(index * 30, 300)}ms` }}
    >
      <div
        className={cn(
          "relative flex h-full w-full min-w-0 max-w-full cursor-pointer flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm transition-[transform,box-shadow,border-color]",
          "hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md",
          hasOverride && "border-amber-500/30",
          isSelectionMode && isSelected && "border-primary/60 ring-2 ring-primary",
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
        <div className="relative aspect-[3/2] overflow-hidden bg-muted/40">
          {isValidImageUrl(item.image) && failedImageUrl !== item.image ? (
            <Image
              src={item.image}
              alt={item.name}
              fill
              sizes="(max-width: 767px) 100vw, (max-width: 1279px) 50vw, (max-width: 1535px) 33vw, 25vw"
              unoptimized
              className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              onError={() => setFailedImageUrl(item.image)}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <Utensils className="h-12 w-12 text-muted-foreground/30" />
            </div>
          )}

          {!isSelectionMode && (
            <div
              className="absolute right-2 top-2 z-20"
              onClick={(event) => event.stopPropagation()}
            >
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="secondary"
                    size="icon-sm"
                    className="rounded-full bg-background/90 shadow-sm backdrop-blur-sm hover:bg-background"
                    aria-label={`Actions for ${item.name}`}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44 rounded-2xl">
                  <DropdownMenuItem onSelect={onView}>
                    <Eye className="h-4 w-4" />
                    View details
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={onEdit}>
                    <Edit3 className="h-4 w-4" />
                    Edit item
                  </DropdownMenuItem>
                  {canDelete && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                        <Trash2 className="h-4 w-4" />
                        Delete item
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>

        {/* Content Section */}
        <div className="flex min-w-0 flex-1 flex-col p-4">
          <div className="flex min-w-0 items-start gap-2">
            <h3 className="min-w-0 flex-1 truncate text-base font-semibold">
              {item.name}
            </h3>
            <span
              className={cn(
                BADGE_SHELL,
                availabilityStyle.bg,
                availabilityStyle.text,
              )}
            >
              {item.effective_availability ? "Available" : "Unavailable"}
            </span>
          </div>

          <div className="mt-1 min-h-8 min-w-0">
            {item.description && (
              <p className="line-clamp-2 break-words text-xs leading-4 text-muted-foreground [overflow-wrap:anywhere]">
                {item.description}
              </p>
            )}
          </div>

          {/* Categories intentionally follow the description. */}
          <div className="mt-3 flex min-h-6 flex-wrap gap-1">
            {item.categories.slice(0, 2).map((cat) => {
              const scope = categoryScopeStyle(cat.is_global);
              return (
                <span
                  key={cat.id}
                  className={cn(
                    BADGE_SHELL,
                    "max-w-full",
                    scope.bg,
                    scope.text,
                  )}
                >
                  <span className="truncate">{cat.name}</span>
                </span>
              );
            })}
            {item.categories.length > 2 && (
              <span
                className={cn(
                  BADGE_SHELL,
                  "bg-muted/60 text-muted-foreground tabular-nums",
                )}
              >
                +{item.categories.length - 2}
              </span>
            )}
          </div>

          <div className="mt-auto pt-4">
            <div
              className="flex items-end justify-between gap-3"
              onClick={(event) => {
                if (isSelectionMode) return;
                event.stopPropagation();
              }}
            >
              {isSelectionMode ? (
                <div className="flex min-w-0 items-baseline gap-2">
                  <span className="text-lg font-medium tracking-[-0.02em] tabular-nums">
                    ${item.effective_price.toFixed(2)}
                  </span>
                  {hasOverride && item.base_price !== item.effective_price && (
                    <span className="truncate text-xs text-muted-foreground line-through tabular-nums">
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
                  locationId={
                    isAllLocations || isSingleLocation
                      ? null
                      : selectedLocationId
                  }
                  canRemoveOverride={
                    item.price_source === "location_item" && !isAllLocations
                  }
                  editScope={deriveScopeFromContext({
                    isAllLocations,
                    locationName: locationName || null,
                  })}
                >
                  <div className="flex min-w-0 items-baseline gap-2">
                    <span className="text-lg font-medium tracking-[-0.02em] tabular-nums">
                      ${item.effective_price.toFixed(2)}
                    </span>
                    {hasOverride && item.base_price !== item.effective_price && (
                      <span className="truncate text-xs text-muted-foreground line-through tabular-nums">
                        ${item.base_price.toFixed(2)}
                      </span>
                    )}
                    <Info className="h-3 w-3 self-center text-muted-foreground/60" />
                  </div>
                </PriceSourcePopover>
              )}

              {item.effective_cash_price != null && (
                <div className="shrink-0 text-right text-muted-foreground">
                  <span className="block text-[10px] font-medium uppercase tracking-wide">
                    Cash
                  </span>
                  <span className="text-xs font-medium tabular-nums">
                    ${item.effective_cash_price.toFixed(2)}
                  </span>
                </div>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
              {modifierGroupCount > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Layers className="h-3 w-3 shrink-0" />
                  <span className="tabular-nums">{modifierGroupCount}</span>
                  {modifierGroupCount === 1 ? "group" : "groups"}
                </span>
              )}

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                        item.effective_is_tax_exempt
                          ? TAX_BADGE_STYLES.exempt.text
                          : TAX_BADGE_STYLES.taxed.text,
                      )}
                      aria-label={`Tax details: ${taxLabel}`}
                      onClick={(event) => event.stopPropagation()}
                    >
                      {item.effective_is_tax_exempt ? (
                        <ShieldX className="h-3 w-3 shrink-0" />
                      ) : (
                        <ShieldCheck className="h-3 w-3 shrink-0" />
                      )}
                      <span>{taxLabel}</span>
                    </button>
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

              {availableChannels.map((channel) => (
                <span key={channel} className="inline-flex items-center gap-1">
                  {channel === "pos" && (
                    <CreditCard className="h-3 w-3 shrink-0" />
                  )}
                  {channel === "online" && (
                    <Globe className="h-3 w-3 shrink-0" />
                  )}
                  {channel === "kiosk" && (
                    <Monitor className="h-3 w-3 shrink-0" />
                  )}
                  {channel === "online" ? "Online" : channel.toUpperCase()}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// ITEM ROW COMPONENT (Horizontal Category View)
// ============================================================================

function ItemRow({
  item,
  onEdit,
  onView,
  onDelete,
  showLocations = false,
  canDelete = false,
  canReorder = false,
  isSelectionMode = false,
  isSelected = false,
  onToggleSelect,
}: {
  item: FlatItem;
  onEdit: () => void;
  onView: () => void;
  onDelete: () => void;
  showLocations?: boolean;
  canDelete?: boolean;
  canReorder?: boolean;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.id,
    disabled: !canReorder || isSelectionMode,
  });

  const activateRow = () => {
    if (isSelectionMode) onToggleSelect?.(item.id);
    else onView();
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn(
        "group flex min-w-0 cursor-pointer items-center gap-2 px-1 py-3 transition-colors hover:bg-muted/40 sm:gap-4 sm:px-2",
        isSelectionMode && isSelected && "bg-primary/5",
        !item.effective_availability && "opacity-65",
        isDragging && "relative z-20 rounded-xl bg-card opacity-70 shadow-lg ring-2 ring-primary/40",
      )}
      onClick={activateRow}
    >
      {isSelectionMode ? (
        <button
          type="button"
          aria-label={`${isSelected ? "Deselect" : "Select"} ${item.name}`}
          aria-pressed={isSelected}
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
            isSelected
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background hover:border-primary/60",
          )}
          onClick={(event) => {
            event.stopPropagation();
            onToggleSelect?.(item.id);
          }}
        >
          {isSelected && <Check className="h-4 w-4" strokeWidth={3} />}
        </button>
      ) : (
        <button
          type="button"
          {...attributes}
          {...listeners}
          disabled={!canReorder}
          aria-label={`Drag ${item.name} to reorder`}
          title={canReorder ? "Drag to reorder" : "Reordering is unavailable here"}
          className="flex h-10 w-10 shrink-0 touch-none cursor-grab items-center justify-center rounded-lg text-muted-foreground/60 hover:bg-muted hover:text-foreground active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40 sm:h-8 sm:w-7 sm:rounded-md"
          onClick={(event) => event.stopPropagation()}
        >
          <GripVertical className="h-5 w-5 sm:h-4 sm:w-4" />
        </button>
      )}

      <span className="relative hidden h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted sm:block">
        {isValidImageUrl(item.image) ? (
          <Image
            src={item.image}
            alt={item.name}
            fill
            sizes="(max-width: 639px) 48px, 64px"
            unoptimized
            className="object-cover"
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center">
            <Utensils className="h-6 w-6 text-muted-foreground/60" />
          </span>
        )}
      </span>

      <button
        type="button"
        className="min-w-0 flex-1 rounded-md text-left focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        aria-label={
          isSelectionMode
            ? `${isSelected ? "Deselect" : "Select"} ${item.name}`
            : `View details for ${item.name}`
        }
        onClick={(event) => {
          event.stopPropagation();
          activateRow();
        }}
      >
        <span className="block truncate text-sm font-medium sm:text-base">
          {item.name}
        </span>
        {showLocations && item.available_locations !== null && (
          <span className="mt-1 hidden min-w-0 flex-wrap gap-1 sm:flex">
            {item.available_locations.length === 0 ? (
              <span className="text-[11px] text-muted-foreground">
                Not available
              </span>
            ) : (
              <>
                {item.available_locations
                  .slice(0, item.available_locations.length > 3 ? 2 : 3)
                  .map((location) => (
                    <span
                      key={location.id}
                      title={location.name}
                      className={cn(
                        BADGE_SHELL,
                        "max-w-28 min-w-0 bg-muted/60 text-muted-foreground",
                      )}
                    >
                      <span className="truncate">{location.name}</span>
                    </span>
                  ))}
                {item.available_locations.length > 3 && (
                  <span
                    title={item.available_locations
                      .slice(2)
                      .map((location) => location.name)
                      .join(", ")}
                    className={cn(
                      BADGE_SHELL,
                      "bg-muted/60 text-muted-foreground tabular-nums",
                    )}
                  >
                    +{item.available_locations.length - 2} more
                  </span>
                )}
              </>
            )}
          </span>
        )}
        {!item.effective_availability && (
          <span className="mt-0.5 block text-[11px] text-destructive">
            Unavailable
          </span>
        )}
      </button>

      <div className="hidden w-28 shrink-0 flex-col items-end sm:flex">
        <div className="flex items-center gap-1 whitespace-nowrap">
          <DollarSign className="hidden h-4 w-4 text-muted-foreground sm:block" />
          <span className="font-semibold tabular-nums">
            {item.effective_price.toFixed(2)}
          </span>
        </div>
        {item.effective_cash_price != null && (
          <span className="whitespace-nowrap text-[11px] text-muted-foreground sm:text-xs">
            <span className="hidden sm:inline">Cash: </span>$
            {item.effective_cash_price.toFixed(2)}
          </span>
        )}
      </div>

      {!isSelectionMode && (
        <div className="shrink-0" onClick={(event) => event.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full"
                aria-label={`Actions for ${item.name}`}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuLabel>Item actions</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onView}>
                <Eye className="mr-2 h-4 w-4" />
                View details
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onEdit}>
                <Edit3 className="mr-2 h-4 w-4" />
                Edit item
              </DropdownMenuItem>
              {canDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={onDelete}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete item
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// ITEM TABLE COMPONENT (Table View)
// ============================================================================

function ItemTable({
  items,
  onEditItem,
  onViewItem,
  onDeleteItem,
  isAllLocations = false,
  showLocations = false,
  selectedLocationId = null,
  isSelectionMode = false,
  selectedItemIds,
  onToggleSelect,
}: {
  items: FlatItem[];
  onEditItem: (item: FlatItem) => void;
  onViewItem: (item: FlatItem) => void;
  onDeleteItem: (item: FlatItem) => void;
  isAllLocations?: boolean;
  showLocations?: boolean;
  selectedLocationId?: string | null;
  isSelectionMode?: boolean;
  selectedItemIds: Set<string>;
  onToggleSelect: (id: string) => void;
}) {
  return (
    <Table
      variant="data"
      containerClassName="thin-scrollbar min-w-0 animate-in fade-in duration-300"
      className={cn(
        "min-w-[400px] table-auto max-sm:[&_td]:px-1.5 max-sm:[&_th]:px-1.5 sm:min-w-[500px]",
        showLocations ? "md:min-w-[800px]" : "md:min-w-[640px]",
      )}
    >
      <caption className="sr-only">Item library</caption>
      <TableHeader>
        <TableRow>
          {isSelectionMode && (
            <TableHead scope="col" className="w-12">
              <span className="sr-only">Select</span>
            </TableHead>
          )}
          <TableHead scope="col" className="min-w-[170px] sm:w-[240px]">
            Item
          </TableHead>
          <TableHead scope="col" className="hidden min-w-[140px] md:table-cell">
            Categories
          </TableHead>
          {showLocations && (
            <TableHead
              scope="col"
              className="hidden min-w-[160px] md:table-cell"
            >
              Locations
            </TableHead>
          )}
          <TableHead
            scope="col"
            className="hidden w-[110px] text-right sm:table-cell sm:w-[140px]"
          >
            <span className="block pr-2 sm:pr-5 lg:pr-7">Price</span>
          </TableHead>
          <TableHead scope="col" className="w-[110px]">Status</TableHead>
          {!isSelectionMode && (
            <TableHead scope="col" className="w-[56px] text-right">
              Actions
            </TableHead>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item, index) => {
          const hasOverride = item.has_location_override;
          const isSelected = selectedItemIds.has(item.id);
          const itemCanDelete =
            isAllLocations || item.location_id === selectedLocationId;
          const availableLocations = item.available_locations;
          const availabilityStyle = item.effective_availability
            ? ITEM_AVAILABILITY_STYLES.available
            : ITEM_AVAILABILITY_STYLES.unavailable;

          const activateRow = () => {
            if (isSelectionMode) {
              onToggleSelect(item.id);
            } else {
              onViewItem(item);
            }
          };

          return (
            <TableRow
              key={item.id}
              data-state={isSelected ? "selected" : undefined}
              aria-selected={isSelectionMode ? isSelected : undefined}
              className={cn(
                "group cursor-pointer border-0 bg-card/70 transition-colors hover:bg-muted/40 animate-in fade-in slide-in-from-left-2",
              )}
              style={{ animationDelay: `${Math.min(index * 20, 200)}ms` }}
              onClick={activateRow}
            >
              {isSelectionMode && (
                <TableCell onClick={(event) => event.stopPropagation()}>
                  <button
                    type="button"
                    aria-label={`${isSelected ? "Deselect" : "Select"} ${item.name}`}
                    aria-pressed={isSelected}
                    onClick={() => onToggleSelect(item.id)}
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-full border-2 transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                      isSelected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background hover:border-primary/60",
                    )}
                  >
                    {isSelected && (
                      <Check className="h-4 w-4" strokeWidth={3} />
                    )}
                  </button>
                </TableCell>
              )}

              <TableCell className="min-w-0">
                <button
                  type="button"
                  aria-label={
                    isSelectionMode
                      ? `${isSelected ? "Deselect" : "Select"} ${item.name}`
                      : `View details for ${item.name}`
                  }
                  className="flex min-w-0 max-w-full items-center gap-3 rounded-xl text-left focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  onClick={(event) => {
                    event.stopPropagation();
                    activateRow();
                  }}
                >
                  <span className="relative hidden h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-muted/60 sm:block">
                    {isValidImageUrl(item.image) ? (
                      <Image
                        src={item.image}
                        alt=""
                        fill
                        sizes="44px"
                        unoptimized
                        className="object-cover"
                      />
                    ) : (
                      <span className="absolute inset-0 flex items-center justify-center">
                        <Utensils className="h-5 w-5 text-muted-foreground/50" />
                      </span>
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium transition-colors group-hover:text-primary">
                      {item.name}
                    </span>
                    {item.description && (
                      <span
                        className="hidden max-w-[260px] truncate text-xs text-muted-foreground sm:block"
                        title={item.description}
                      >
                        {item.description}
                      </span>
                    )}
                  </span>
                </button>
              </TableCell>

              <TableCell className="hidden md:table-cell">
                {item.categories.length > 0 ? (
                  <div className="flex max-w-[220px] flex-wrap gap-1">
                    {item.categories.slice(0, 2).map((category) => {
                      const scope = categoryScopeStyle(category.is_global);
                      return (
                        <span
                          key={category.id}
                          className={cn(BADGE_SHELL, scope.bg, scope.text)}
                        >
                          <span className="max-w-[120px] truncate">
                            {category.name}
                          </span>
                        </span>
                      );
                    })}
                    {item.categories.length > 2 && (
                      <span
                        className={cn(
                          BADGE_SHELL,
                          "bg-muted/60 text-muted-foreground tabular-nums",
                        )}
                      >
                        +{item.categories.length - 2}
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">Uncategorized</span>
                )}
              </TableCell>

              {showLocations && (
                <TableCell className="hidden md:table-cell">
                  {availableLocations === null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : availableLocations.length === 0 ? (
                    <span className="text-xs text-muted-foreground">
                      Not available
                    </span>
                  ) : (
                    <div className="flex max-w-[210px] items-center gap-1">
                      <span
                        className={cn(
                          BADGE_SHELL,
                          "min-w-0 bg-muted/60 text-muted-foreground",
                        )}
                      >
                        <span className="max-w-[110px] truncate">
                          {availableLocations[0].name}
                        </span>
                      </span>
                      {availableLocations.length > 1 && (
                        <span
                          className={cn(
                            BADGE_SHELL,
                            "bg-muted/60 text-muted-foreground tabular-nums",
                          )}
                          title={availableLocations
                            .slice(1)
                            .map((location) => location.name)
                            .join(", ")}
                        >
                          +{availableLocations.length - 1} more
                        </span>
                      )}
                    </div>
                  )}
                </TableCell>
              )}

              <TableCell className="hidden text-right sm:table-cell">
                <div className="flex flex-col items-end gap-1 pr-2 sm:pr-5 lg:pr-7">
                  <div className="flex items-baseline justify-end gap-1.5">
                    <span className="font-medium tabular-nums">
                      ${item.effective_price.toFixed(2)}
                    </span>
                    {hasOverride && item.base_price !== item.effective_price && (
                      <span className="text-xs text-muted-foreground line-through tabular-nums">
                        ${item.base_price.toFixed(2)}
                      </span>
                    )}
                  </div>
                  {item.effective_cash_price != null && (
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      Cash ${item.effective_cash_price.toFixed(2)}
                    </span>
                  )}
                </div>
              </TableCell>

              <TableCell>
                <div className="flex flex-col items-start gap-1">
                  <span
                    className={cn(
                      BADGE_SHELL,
                      availabilityStyle.bg,
                      availabilityStyle.text,
                    )}
                  >
                    {item.effective_availability ? "Available" : "Unavailable"}
                  </span>
                  {hasOverride && (
                    <span
                      className={cn(
                        BADGE_SHELL,
                        OVERRIDE_BADGE_STYLE.bg,
                        OVERRIDE_BADGE_STYLE.text,
                      )}
                    >
                      Override
                    </span>
                  )}
                </div>
              </TableCell>

              {!isSelectionMode && (
                <TableCell
                  className="text-right"
                  onClick={(event) => event.stopPropagation()}
                >
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label={`Actions for ${item.name}`}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuLabel>Item actions</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => onViewItem(item)}>
                        <Eye className="mr-2 h-4 w-4" />
                        View details
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => onEditItem(item)}>
                        <Edit3 className="mr-2 h-4 w-4" />
                        Edit item
                      </DropdownMenuItem>
                      {itemCanDelete && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onSelect={() => onDeleteItem(item)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete item
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              )}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
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
  showItemLocations = false,
  canDeleteItems = false,
  isAllLocations = false,
  selectedLocationId = null,
  isSelectionMode = false,
  selectedItemIds,
  onToggleSelect,
  canToggleCategory = false,
  isTogglingCategory = false,
  onToggleCategoryActive,
  canReorderItems = false,
  onReorderItems,
}: {
  category: ItemCategorySummary;
  items: FlatItem[];
  isExpanded: boolean;
  onToggle: () => void;
  onEditItem: (item: FlatItem) => void;
  onViewItem: (item: FlatItem) => void;
  onDeleteItem: (item: FlatItem) => void;
  showItemLocations?: boolean;
  canDeleteItems?: boolean;
  isAllLocations?: boolean;
  selectedLocationId?: string | null;
  isSelectionMode?: boolean;
  selectedItemIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  canToggleCategory?: boolean;
  isTogglingCategory?: boolean;
  onToggleCategoryActive?: (isActive: boolean) => void;
  canReorderItems?: boolean;
  onReorderItems?: (
    categoryId: string,
    items: FlatItem[],
  ) => Promise<boolean>;
}) {
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [draftItemOrder, setDraftItemOrder] = useState<string[] | null>(null);
  const reorderSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const orderedItems = useMemo(() => {
    if (!draftItemOrder) return items;

    const itemsById = new Map(items.map((item) => [item.id, item]));
    const draftItems = draftItemOrder
      .map((itemId) => itemsById.get(itemId))
      .filter((item): item is FlatItem => Boolean(item));
    const draftIds = new Set(draftItemOrder);

    return [
      ...draftItems,
      ...items.filter((item) => !draftIds.has(item.id)),
    ];
  }, [draftItemOrder, items]);

  const handleItemDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (
      !canReorderItems ||
      isSavingOrder ||
      !over ||
      active.id === over.id
    ) {
      return;
    }

    const oldIndex = orderedItems.findIndex((item) => item.id === active.id);
    const newIndex = orderedItems.findIndex((item) => item.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const nextItems = arrayMove(orderedItems, oldIndex, newIndex);
    setDraftItemOrder(nextItems.map((item) => item.id));
  };

  const handleSaveItemOrder = async () => {
    if (!onReorderItems) return;
    setIsSavingOrder(true);
    const saved = await onReorderItems(category.id, orderedItems);
    setIsSavingOrder(false);
    if (saved) setDraftItemOrder(null);
  };

  const isSingleLocation = useIsSingleLocation();
  const selectedCount = isSelectionMode && selectedItemIds
    ? items.reduce((acc, it) => acc + (selectedItemIds.has(it.id) ? 1 : 0), 0)
    : 0;
  const allSelected =
    isSelectionMode && items.length > 0 && selectedCount === items.length;
  const someSelected = isSelectionMode && selectedCount > 0 && !allSelected;
  const categoryActive = isAllLocations
    ? category.is_active
    : (category.effective_is_active ?? category.is_active);
  const hasCategoryState =
    category.id !== "uncategorized" && typeof categoryActive === "boolean";

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <div
        className={cn(
          "min-w-0 overflow-hidden rounded-3xl border bg-card transition-colors",
          hasCategoryState && !categoryActive && "opacity-70",
          isSelectionMode && selectedCount > 0 && "ring-1 ring-primary/30",
        )}
      >
        <div
          className={cn(
            "flex min-h-14 min-w-0 items-center justify-between gap-2 px-3 py-3 transition-colors sm:px-6",
            isSelectionMode && selectedCount > 0 && "bg-primary/5",
          )}
        >
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-2 rounded-lg text-left transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:gap-3"
              aria-label={`${isExpanded ? "Collapse" : "Expand"} ${category.name}`}
            >
              {isExpanded ? (
                <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
              )}
              <span className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="truncate text-base font-semibold sm:text-lg">
                  {category.name}
                </span>
                {/* Category scope is meaningless with only one location. */}
                {!isSingleLocation &&
                  (() => {
                    const scope = categoryScopeStyle(category.is_global);
                    return (
                      <span className={cn(BADGE_SHELL, scope.bg, scope.text)}>
                        {category.is_global ? (
                          "Global"
                        ) : (
                          <span className="max-w-28 truncate sm:max-w-44">
                            {category.location_name || "Location"}
                          </span>
                        )}
                      </span>
                    );
                  })()}
              </span>
            </button>
          </CollapsibleTrigger>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            {isSelectionMode && (
              <>
                {selectedCount > 0 && (
                  <span
                    className={cn(
                      BADGE_SHELL,
                      "hidden bg-primary/15 text-primary sm:inline-flex",
                    )}
                  >
                    <CheckCircle2 className="h-3 w-3 shrink-0" />
                    <span className="tabular-nums">{selectedCount}</span>
                    selected
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (!onToggleSelect) return;
                    if (allSelected) {
                      items.forEach((item) => {
                        if (selectedItemIds?.has(item.id))
                          onToggleSelect(item.id);
                      });
                    } else {
                      items.forEach((item) => {
                        if (!selectedItemIds?.has(item.id))
                          onToggleSelect(item.id);
                      });
                    }
                  }}
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full border-2 transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                    allSelected
                      ? "border-primary bg-primary text-primary-foreground"
                      : someSelected
                        ? "border-primary bg-primary/20 text-primary"
                        : "border-border bg-background hover:border-primary/60",
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
                    <span className="block h-0.5 w-2.5 rounded-full bg-primary" />
                  ) : null}
                </button>
              </>
            )}

            {!isSelectionMode && hasCategoryState && (
              <div className="flex items-center gap-2">
                <Switch
                  checked={categoryActive}
                  onCheckedChange={(checked) => onToggleCategoryActive?.(checked)}
                  disabled={!canToggleCategory || isTogglingCategory}
                  aria-label={`${categoryActive ? "Hide" : "Show"} ${category.name}`}
                />
                {categoryActive ? (
                  <Eye className="h-4 w-4 text-green-500" aria-hidden="true" />
                ) : (
                  <EyeOff
                    className="h-4 w-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                )}
              </div>
            )}
          </div>
        </div>

        <CollapsibleContent>
          <div className="px-3 pb-3 pt-0 sm:px-6 sm:pb-4">
            {orderedItems.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                <Utensils className="mx-auto mb-2 h-8 w-8 opacity-50" />
                <p className="text-sm">No items in this category</p>
              </div>
            ) : (
              <DndContext
                sensors={reorderSensors}
                collisionDetection={closestCenter}
                onDragEnd={handleItemDragEnd}
              >
                <SortableContext
                  items={orderedItems.map((item) => item.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="divide-y divide-border/80">
                    {orderedItems.map((item) => {
                      const itemCanDelete = isAllLocations
                        ? true
                        : item.location_id === selectedLocationId;
                      return (
                        <ItemRow
                          key={item.id}
                          item={item}
                          onEdit={() => onEditItem(item)}
                          onView={() => onViewItem(item)}
                          onDelete={() => onDeleteItem(item)}
                          showLocations={showItemLocations}
                          canDelete={itemCanDelete && canDeleteItems}
                          canReorder={canReorderItems && !isSavingOrder}
                          isSelectionMode={isSelectionMode}
                          isSelected={selectedItemIds?.has(item.id) ?? false}
                          onToggleSelect={onToggleSelect}
                        />
                      );
                    })}
                  </div>
                </SortableContext>
                {draftItemOrder && (
                  <div className="mt-3 flex items-center justify-end gap-2 border-t pt-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isSavingOrder}
                      onClick={() => setDraftItemOrder(null)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={isSavingOrder}
                      onClick={handleSaveItemOrder}
                    >
                      {isSavingOrder && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Save order
                    </Button>
                  </div>
                )}
              </DndContext>
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
  const { data: userInfo, isLoading: isUserInfoLoading } = useUserInfo();
  const clerkOrgId = userInfo?.members?.[0]?.organizations?.id;
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const { selectedLocationId } = useLocationStore();
  const {
    canCreate,
    canEditLocationEntity,
    isOwnerOrAdmin,
    isMember,
    isManager,
    assignedLocationIds,
    isLoading: isPermissionsLoading,
  } = useManagerPermissions();

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
  const { data: taxRatesData, isLoading: isTaxRatesLoading } =
    useLocationTaxRates();
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
  const { data: categoriesData, isLoading: isCategoriesLoading } =
    useCategoriesWithItems(clerkOrgId || "", selectedLocationId);
  const { data: modifierGroups, isLoading: isModifierGroupsLoading } =
    useModifierGroups(clerkOrgId);

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
  const [togglingCategoryIds, setTogglingCategoryIds] = useState<Set<string>>(
    new Set(),
  );
  const [categoryItemOrderOverrides, setCategoryItemOrderOverrides] = useState<
    Map<string, string[]>
  >(new Map());

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

  // The flat item response already contains category associations. Keep those
  // categories visible if the separate category metadata query is empty,
  // delayed, or only returns a partial list.
  const categoryOptions = useMemo<ItemCategorySummary[]>(() => {
    const categoriesById = new Map<string, ItemCategorySummary>();

    for (const category of categoriesList) {
      categoriesById.set(category.id, {
        id: category.id,
        name: category.name,
        location_id: category.location_id,
        location_name: category.location_name,
        is_global: category.is_global,
        is_active: category.is_active,
        effective_is_active: category.effective_is_active,
      });
    }

    for (const item of itemsList) {
      for (const category of item.categories) {
        if (!categoriesById.has(category.id)) {
          categoriesById.set(category.id, category);
        }
      }
    }

    return Array.from(categoriesById.values());
  }, [categoriesList, itemsList]);

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
      { category: ItemCategorySummary; items: FlatItem[] }
    >();

    // Create groups for each category
    for (const category of categoryOptions) {
      groups.set(category.id, {
        category: category,
        items: [],
      });
    }

    // Add items to their categories
    for (const item of filteredItems) {
      for (const cat of item.categories) {
        let group = groups.get(cat.id);
        if (!group) {
          group = { category: cat, items: [] };
          groups.set(cat.id, group);
        }
        group.items.push(item);
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
          is_global: true,
          location_id: null,
          location_name: null,
        },
        items: uncategorizedItems,
      });
    }

    // The flat item RPC is alphabetic and does not carry category assignment
    // order. Use the category-centric query as the source of truth so a saved
    // drag order survives a refresh.
    for (const category of categoriesList) {
      const group = groups.get(category.id);
      if (!group) continue;

      const orderByItemId = new Map<string, number>();
      for (const assignment of category.items ?? []) {
        const existingOrder = orderByItemId.get(assignment.menu_item_id);
        if (
          existingOrder === undefined ||
          assignment.display_order < existingOrder
        ) {
          orderByItemId.set(
            assignment.menu_item_id,
            assignment.display_order,
          );
        }
      }

      group.items.sort((a, b) => {
        const aOrder = orderByItemId.get(a.id) ?? Number.MAX_SAFE_INTEGER;
        const bOrder = orderByItemId.get(b.id) ?? Number.MAX_SAFE_INTEGER;
        return aOrder - bOrder || a.name.localeCompare(b.name);
      });

      const optimisticOrder = categoryItemOrderOverrides.get(category.id);
      if (optimisticOrder) {
        const optimisticIndex = new Map(
          optimisticOrder.map((itemId, index) => [itemId, index]),
        );
        group.items.sort(
          (a, b) =>
            (optimisticIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
            (optimisticIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER),
        );
      }
    }

    return Array.from(groups.values()).filter((g) => g.items.length > 0);
  }, [categoriesList, categoryItemOrderOverrides, categoryOptions, filteredItems]);

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

  const canToggleCategoryVisibility = (category: ItemCategorySummary) => {
    if (category.id === "uncategorized" || isMember) return false;
    if (isOwnerOrAdmin) return true;
    if (!isManager) return false;

    if (isAllLocations) {
      return canEditLocationEntity(category.location_id);
    }

    return (
      !!selectedLocationId &&
      selectedLocationId !== "all" &&
      assignedLocationIds.includes(selectedLocationId)
    );
  };

  const handleToggleCategoryVisibility = async (
    category: ItemCategorySummary,
    isActive: boolean,
  ) => {
    if (!canToggleCategoryVisibility(category)) return;

    setTogglingCategoryIds((previous) => {
      const next = new Set(previous);
      next.add(category.id);
      return next;
    });

    try {
      const result =
        !isAllLocations &&
        selectedLocationId &&
        selectedLocationId !== "all"
          ? await UpdateLocationCategoryOverride(
              selectedLocationId,
              category.id,
              { isActive },
            )
          : await UpdateCategory(category.id, { is_active: isActive });

      if (result.error) {
        toast.error("Update failed", { description: result.error });
        return;
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["categories"] }),
        queryClient.invalidateQueries({ queryKey: ["categories-with-items"] }),
        queryClient.invalidateQueries({ queryKey: ["menu-items"] }),
        queryClient.invalidateQueries({ queryKey: ["menu-items-flat"] }),
        refetch(),
      ]);
      invalidateOrderOutSync(queryClient);
      toast.success(isActive ? "Category enabled" : "Category disabled", {
        description: `“${category.name}” is now ${isActive ? "visible" : "hidden"}.`,
      });
    } catch {
      toast.error("Update failed", {
        description: "Unable to update the category. Please try again.",
      });
    } finally {
      setTogglingCategoryIds((previous) => {
        const next = new Set(previous);
        next.delete(category.id);
        return next;
      });
    }
  };

  const canReorderCategoryItems = (category: ItemCategorySummary) => {
    if (category.id === "uncategorized" || isMember) return false;
    if (isOwnerOrAdmin) return true;
    if (!isManager || isAllLocations) return false;

    return (
      !!selectedLocationId &&
      selectedLocationId !== "all" &&
      assignedLocationIds.includes(selectedLocationId)
    );
  };

  const handleReorderCategoryItems = async (
    categoryId: string,
    reorderedItems: FlatItem[],
  ): Promise<boolean> => {
    const previousOrder = categoryItemOrderOverrides.get(categoryId);
    setCategoryItemOrderOverrides((previous) => {
      const next = new Map(previous);
      next.set(
        categoryId,
        reorderedItems.map((item) => item.id),
      );
      return next;
    });

    const restorePreviousOrder = () => {
      setCategoryItemOrderOverrides((previous) => {
        const next = new Map(previous);
        if (previousOrder) next.set(categoryId, previousOrder);
        else next.delete(categoryId);
        return next;
      });
    };

    try {
      const result = await UpdateLocationCategoryItemsOrder(
        isAllLocations ? null : selectedLocationId,
        null,
        categoryId,
        reorderedItems.map((item, index) => ({
          menuItemId: item.id,
          displayOrder: index + 1,
        })),
      );

      if (result.error) {
        restorePreviousOrder();
        toast.error("Order not saved", { description: result.error });
        return false;
      }

      await queryClient.invalidateQueries({
        queryKey: ["categories-with-items", clerkOrgId],
      });
      setCategoryItemOrderOverrides((previous) => {
        const next = new Map(previous);
        next.delete(categoryId);
        return next;
      });
      invalidateOrderOutSync(queryClient);
      toast.success("Item order saved");
      return true;
    } catch {
      restorePreviousOrder();
      toast.error("Order not saved", {
        description: "Unable to save the item order. Please try again.",
      });
      return false;
    }
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
        description: isSingleLocation
          ? `"${deletingItem.name}" has been permanently deleted.`
          : isAllLocations
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

  // The scoped queries below are `enabled: !!clerkOrgId`, and a disabled query
  // reports isLoading: true forever in React Query v5. Once identity has
  // resolved, an absent org id must not keep the page skeletonised — let it
  // fall through to the existing empty/error states instead.
  const isAwaitingIdentity = isUserInfoLoading || isPermissionsLoading;
  const isInitialPageLoading =
    isAwaitingIdentity ||
    (!!clerkOrgId &&
      (isLoading ||
        isCategoriesLoading ||
        isModifierGroupsLoading ||
        isTaxRatesLoading));

  if (isInitialPageLoading) {
    return (
      <DataPageSkeleton variant="catalog" label="Loading the item library" />
    );
  }

  const selectedCategory = categoryOptions.find(
    (c) => c.id === selectedCategoryId,
  );

  return (
    <PageShell>
      <PageHeader
        title="Item Library"
        stackActionsBelowIndicatorOnMobile
        subtitle={
          isSingleLocation
            ? "All items on your menu. Items live within categories."
            : isAllLocations
              ? "All items across your organization. Items live within categories."
              : `Viewing items for ${locationName} with location-specific pricing.`
        }
        indicator={
          !isSingleLocation ? (
            <LocationIndicator
              isAllLocations={isAllLocations}
              locationName={locationName}
            />
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
              meta={`In ${categoryOptions.length} categories`}
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
              {categoryOptions.length > 0 && (
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
                    { mode: "list" as const, Icon: Table2, label: "Table view" },
                    {
                      mode: "categories" as const,
                      Icon: List,
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
          {showCategoryFilter && categoryOptions.length > 0 && (
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
                {categoryOptions.map((category) => {
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
            <div className="mb-4 grid w-full grid-cols-2 gap-2 rounded-2xl border-0 bg-muted/60 px-3 py-3 shadow-none animate-in fade-in slide-in-from-top-2 duration-200 sm:flex sm:flex-wrap sm:items-center sm:px-4 sm:py-2.5">
              <div
                className="col-span-2 flex min-w-0 items-center gap-2 text-sm font-medium sm:col-span-1"
                aria-live="polite"
              >
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <span className="truncate">
                  <span className="tabular-nums">{selectedItemIds.size}</span> of{" "}
                  <span className="tabular-nums">{filteredItems.length}</span>{" "}
                  selected
                </span>
              </div>
              <div className="mx-1 hidden h-5 w-px bg-border/60 sm:block" />
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-full gap-1 rounded-full px-2 text-xs sm:h-7 sm:w-auto sm:px-3"
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
                className="h-8 w-full rounded-full px-2 text-xs sm:h-7 sm:w-auto sm:px-3"
                onClick={clearSelection}
                disabled={selectedItemIds.size === 0}
              >
                Clear
              </Button>
              <div className="col-span-2 grid grid-cols-2 gap-2 sm:ml-auto sm:flex sm:items-center">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm"
                      variant="default"
                      className="h-8 w-full justify-center gap-1 rounded-full px-3 text-[0.8125rem] font-medium sm:w-auto sm:px-4"
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
                  className="h-8 w-full justify-center gap-1 rounded-full px-3 text-[0.8125rem] sm:w-auto"
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
                viewMode === "grid"
                  ? "grid min-w-0 grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
                  : "space-y-2"
              }
            >
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <Skeleton
                  key={i}
                  className={cn(
                    "rounded-2xl",
                    viewMode === "grid" ? "h-[25rem]" : "h-20",
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
                    category={group.category}
                    items={group.items}
                    isExpanded={expandedCategories.has(group.category.id)}
                    onToggle={() => toggleCategoryExpanded(group.category.id)}
                    onEditItem={handleQuickEdit}
                    onViewItem={handleViewDetails}
                    onDeleteItem={(item) => setDeletingItem(item)}
                    showItemLocations={isAllLocations && !isSingleLocation}
                    canDeleteItems={canDelete}
                    isAllLocations={isAllLocations}
                    selectedLocationId={selectedLocationId}
                    isSelectionMode={isSelectionMode}
                    selectedItemIds={selectedItemIds}
                    onToggleSelect={toggleItemSelected}
                    canToggleCategory={canToggleCategoryVisibility(
                      group.category,
                    )}
                    isTogglingCategory={togglingCategoryIds.has(
                      group.category.id,
                    )}
                    onToggleCategoryActive={(isActive) =>
                      handleToggleCategoryVisibility(group.category, isActive)
                    }
                    canReorderItems={canReorderCategoryItems(group.category)}
                    onReorderItems={handleReorderCategoryItems}
                  />
                );
              })}
            </div>
          ) : viewMode === "grid" ? (
            // Grid View
            <div className="grid min-w-0 grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
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
            // Table View
            <ItemTable
              items={filteredItems}
              onEditItem={handleQuickEdit}
              onViewItem={handleViewDetails}
              onDeleteItem={(item) => setDeletingItem(item)}
              isAllLocations={isAllLocations}
              showLocations={isAllLocations && !isSingleLocation}
              selectedLocationId={selectedLocationId}
              isSelectionMode={isSelectionMode}
              selectedItemIds={selectedItemIds}
              onToggleSelect={toggleItemSelected}
            />
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
