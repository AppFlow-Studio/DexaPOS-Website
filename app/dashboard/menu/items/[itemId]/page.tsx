"use client";

import { useParams, useRouter } from "next/navigation";
import * as React from "react";
import { useMenuItem } from "../../../hooks/useMenuItem";
import { useCategories } from "../../../hooks/useCategories";
import { useModifierGroups } from "../../../hooks/useModifierGroups";
import { useUserInfo } from "../../../../manage/hooks/useUserInfo.";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Utensils,
  ChefHat,
  Layers,
  Edit3,
  Plus,
  ChevronDown,
  AlertTriangle,
  Image as ImageIcon,
  Tag,
  Clock,
  CheckCircle2,
  XCircle,
  Sparkles,
  Link as LinkIcon,
  Unlink,
  Globe,
  Building2,
  Menu as MenuIcon,
  MapPin,
  Info,
  RotateCcw,
  DollarSign,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/ui/empty";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
  NewEditItemFormSheet,
  EditItemWithOverrides,
} from "@/components/dashboard/menu/NewEditItemFormSheet";
import { ItemPreviewCard } from "@/components/dashboard/menu/ItemPreviewCard";
import {
  AssignModifierToItem,
  RemoveModifierFromItem,
} from "../../../actions/item-assignments";
import { DeleteMenuItem } from "../../../actions/menu-items";
import { toast } from "sonner";
import { RecipeManager } from "../../components/RecipeManager";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useLocationStore, useIsAllLocations } from "@/stores/location-store";
import { LocationLibraryItem } from "@/types/menu";
import { Switch } from "@/components/ui/switch";
import { GetItemIsPopular, SetItemPopular, GetItemIsNew, SetItemNew } from "../../../actions/location-menu-overrides";
import { Flame } from "lucide-react";

// ============================================================================
// TYPES & HELPERS
// ============================================================================

type EditingContext = {
  level: 1 | 2 | 3 | 4 | 5;
  table: string;
  description: string;
  canEditBaseFields: boolean;
  priceLabel: string;
  resetToLevel: 1 | 2 | 3 | null;
  resetLabel: string | null;
};

const LEVEL_INFO = {
  1: {
    name: "Global Base",
    icon: Globe,
    color: "text-emerald-600",
    bgColor: "bg-emerald-50",
    borderColor: "border-emerald-200",
    description: "Base item price that applies everywhere by default.",
    affects: "All locations and all menus",
  },
  2: {
    name: "Location Override",
    icon: Building2,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
    description:
      "Location-specific base price that overrides the global price.",
    affects: "All menus at this location",
  },
  3: {
    name: "Menu Override",
    icon: MenuIcon,
    color: "text-purple-600",
    bgColor: "bg-purple-50",
    borderColor: "border-purple-200",
    description: "Menu-specific price that applies when this menu is used.",
    affects: "This menu at all locations",
  },
  4: {
    name: "Location + Menu",
    icon: MapPin,
    color: "text-orange-600",
    bgColor: "bg-orange-50",
    borderColor: "border-orange-200",
    description: "Price specific to this menu at this location only.",
    affects: "This menu at this location only",
  },
  5: {
    name: "Location Menu Owner",
    icon: Sparkles,
    color: "text-pink-600",
    bgColor: "bg-pink-50",
    borderColor: "border-pink-200",
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
          <div
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-lg border transition-all cursor-help hover:shadow-sm",
              levelInfo.bgColor,
              levelInfo.borderColor,
              levelInfo.color
            )}
          >
            <Icon className="h-4 w-4" />
            <span className="text-sm font-medium">{levelInfo.name}</span>
            <Info className="h-3.5 w-3.5 opacity-60" />
          </div>
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          align="start"
          className="w-80 p-4 bg-background border rounded-lg shadow-xl"
          sideOffset={8}
        >
          <div className="space-y-3">
            {/* Header */}
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "h-9 w-9 rounded-lg flex items-center justify-center shrink-0",
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
            <div className="rounded-lg bg-muted/50 p-2.5">
              <p className="text-[11px] font-medium text-muted-foreground mb-0.5">
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
                        "flex items-center gap-1 px-2 py-1 rounded text-[10px]",
                        isCurrentLevel
                          ? cn(
                              info.bgColor,
                              info.borderColor,
                              "border",
                              info.color,
                              "font-medium"
                            )
                          : "bg-muted/30 text-muted-foreground"
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
  currentLocationName: string;
}

function PriceBreakdown({
  item,
  isAllLocations,
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

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-green-500" />
          Price Hierarchy
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Level 1 - Global Base */}
        <div
          className={cn(
            "flex items-center justify-between p-3 rounded-lg border",
            isAllLocations ? "bg-emerald-50 border-emerald-200" : "bg-muted/30"
          )}
        >
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium",
                isAllLocations ? "bg-emerald-500 text-white" : "bg-muted"
              )}
            >
              1
            </div>
            <Globe className="h-4 w-4 text-emerald-600" />
            <span className="text-sm font-medium">Global Base</span>
            {isAllLocations && (
              <Badge variant="secondary" className="text-xs">
                Active
              </Badge>
            )}
          </div>
          <div className="text-right">
            <div
              className={cn(
                "font-semibold",
                isAllLocations && "text-emerald-600"
              )}
            >
              ${basePrice?.toFixed(2)}
            </div>
            {baseCashPrice && (
              <div className="text-xs text-muted-foreground">
                Cash: ${baseCashPrice.toFixed(2)}
              </div>
            )}
          </div>
        </div>

        {/* Level 2 - Location Override */}
        {!isAllLocations && (
          <div
            className={cn(
              "flex items-center justify-between p-3 rounded-lg border",
              hasLocationOverride
                ? "bg-blue-50 border-blue-200"
                : "bg-muted/30 border-dashed"
            )}
          >
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium",
                  hasLocationOverride ? "bg-blue-500 text-white" : "bg-muted"
                )}
              >
                2
              </div>
              <Building2 className="h-4 w-4 text-blue-600" />
              <div>
                <span className="text-sm font-medium">Location Override</span>
                <p className="text-xs text-muted-foreground">
                  {currentLocationName}
                </p>
              </div>
              {hasLocationOverride && (
                <Badge
                  variant="outline"
                  className="text-xs bg-blue-50 text-blue-600 border-blue-200"
                >
                  Override Active
                </Badge>
              )}
            </div>
            <div className="text-right">
              {hasLocationOverride ? (
                <>
                  <div className="font-semibold text-blue-600">
                    ${locationOverride?.custom_price?.toFixed(2)}
                  </div>
                  {locationOverride?.custom_cash_price && (
                    <div className="text-xs text-muted-foreground">
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

        {/* Effective Price */}
        <div className="pt-3 border-t">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Effective Price</span>
            <div className="text-right">
              <span className="text-xl font-bold text-green-600">
                ${effectivePrice?.toFixed(2)}
              </span>
              {effectiveCashPrice && (
                <div className="text-xs text-muted-foreground">
                  Cash: ${effectiveCashPrice.toFixed(2)}
                </div>
              )}
            </div>
          </div>
          {!isAllLocations &&
            hasLocationOverride &&
            basePrice !== effectivePrice && (
              <div className="mt-2 flex items-center gap-1 text-xs text-blue-600">
                <Info className="h-3 w-3" />
                <span>
                  {effectivePrice < basePrice ? "Discounted" : "Increased"} by $
                  {Math.abs(effectivePrice - basePrice).toFixed(2)} at this
                  location
                </span>
              </div>
            )}
        </div>
      </CardContent>
    </Card>
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

  // Location context
  const { selectedLocationId, locations } = useLocationStore();
  const isAllLocations = useIsAllLocations();

  const currentLocationName = React.useMemo(() => {
    if (isAllLocations) return "All Locations";
    const location = locations.find((l) => l.id === selectedLocationId);
    return location?.name || "Unknown Location";
  }, [isAllLocations, selectedLocationId, locations]);

  const editingContext = React.useMemo(
    () => getEditingContext(isAllLocations),
    [isAllLocations]
  );

  const [expandedModifiers, setExpandedModifiers] = React.useState<
    Record<string, boolean>
  >({});
  const [isEditSheetOpen, setIsEditSheetOpen] = React.useState(false);
  const [linkingModifier, setLinkingModifier] = React.useState(false);
  const [unlinkingModifier, setUnlinkingModifier] = React.useState<any>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);

  // Popular flag — per-location, only fetched when a specific location is selected
  const { data: isPopular = false } = useQuery({
    queryKey: ["item-popular", itemId, selectedLocationId],
    queryFn: () => GetItemIsPopular(itemId, selectedLocationId!),
    enabled: !!itemId && !isAllLocations && !!selectedLocationId,
  });

  const popularMutation = useMutation({
    mutationFn: (value: boolean) =>
      SetItemPopular(itemId, selectedLocationId!, value),
    onSuccess: (_, value) => {
      queryClient.setQueryData(
        ["item-popular", itemId, selectedLocationId],
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
    enabled: !!itemId && !isAllLocations && !!selectedLocationId,
  });

  const newMutation = useMutation({
    mutationFn: (value: boolean) =>
      SetItemNew(itemId, selectedLocationId!, value),
    onSuccess: (_, value) => {
      queryClient.setQueryData(
        ["item-new", itemId, selectedLocationId],
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
      <div className="space-y-6 animate-in fade-in duration-500">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <Skeleton className="h-96 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
          <Skeleton className="h-[500px]" />
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="space-y-6">
        <Empty
          icon={Utensils}
          title="Item not found"
          description="The item you're looking for doesn't exist or has been deleted."
          action={
            <Button onClick={() => router.push("/dashboard/menu/items")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Items
            </Button>
          }
        />
      </div>
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

  // Find unlinked modifier groups (ones not already assigned to this item)
  const linkedModifierIds = modifierGroups.map((mg) => mg?.id);
  const unlinkedModifierGroups = allModifierGroupsList.filter(
    (mg) => !linkedModifierIds.includes(mg.id)
  );

  const handleLinkModifier = async (modifierGroupId: string) => {
    try {
      const result = await AssignModifierToItem(itemId, modifierGroupId);
      if (result.error) {
        toast.error("Link Failed", { description: result.error });
        return;
      }
      toast.success("Modifier Linked", {
        description: "The modifier group has been linked to this item.",
      });
      queryClient.invalidateQueries({ queryKey: ["menu-item", itemId] });
      refetch();
    } catch {
      toast.error("Link Failed", {
        description: "Unable to link the modifier group. Please try again.",
      });
    }
    setLinkingModifier(false);
  };

  const handleUnlinkModifier = async () => {
    if (!unlinkingModifier) return;
    try {
      const result = await RemoveModifierFromItem(
        itemId,
        unlinkingModifier.modifier_group?.id
      );
      if (result.error) {
        toast.error("Unlink Failed", { description: result.error });
        return;
      }
      toast.success("Modifier Unlinked", {
        description: "The modifier group has been removed from this item.",
      });
      queryClient.invalidateQueries({ queryKey: ["menu-item", itemId] });
      refetch();
    } catch {
      toast.error("Unlink Failed", {
        description: "Unable to unlink the modifier group. Please try again.",
      });
    }
    setUnlinkingModifier(null);
  };

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

  const levelInfo = LEVEL_INFO[editingContext.level];
  const LevelIcon = levelInfo.icon;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Context Banner */}
      <div
        className={cn(
          "rounded-lg border p-4 flex items-center justify-between gap-4",
          levelInfo.bgColor,
          levelInfo.borderColor
        )}
      >
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "h-10 w-10 rounded-lg flex items-center justify-center",
              "bg-white/80 backdrop-blur"
            )}
          >
            <LevelIcon className={cn("h-5 w-5", levelInfo.color)} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className={cn("font-semibold", levelInfo.color)}>
                {isAllLocations
                  ? "Global View"
                  : `Location: ${currentLocationName}`}
              </h3>
              <Badge
                variant="outline"
                className={cn(
                  "text-xs",
                  levelInfo.borderColor,
                  levelInfo.color
                )}
              >
                Level {editingContext.level}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {editingContext.description}
            </p>
          </div>
        </div>
        <EditingContextIndicator
          context={editingContext}
          locationName={currentLocationName}
        />
      </div>

      {/* Breadcrumb & Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/dashboard/menu/items")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              <button
                type="button"
                className="hover:underline"
                onClick={() => router.push("/dashboard/menu/items")}
              >
                Items
              </button>
              <span>/</span>
              <span className="text-foreground font-medium">
                {menuItem.name}
              </span>
            </div>
            <h1 className="text-2xl font-bold">{menuItem.name}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant={menuItem.effective_availability ? "default" : "secondary"}
            className="h-7"
          >
            {menuItem.effective_availability ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Available
              </>
            ) : (
              <>
                <XCircle className="h-3.5 w-3.5 mr-1" /> Unavailable
              </>
            )}
          </Badge>
          <Button onClick={() => setIsEditSheetOpen(true)}>
            <Edit3 className="h-4 w-4 mr-2" />
            {isAllLocations ? "Edit Item" : "Edit Item"}
          </Button>
          {isAllLocations && (
            <Button
              variant="destructive"
              onClick={() => setIsDeleteDialogOpen(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
          )}
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column - Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Basic Info Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Item Details
                {!editingContext.canEditBaseFields && (
                  <Badge variant="outline" className="ml-2 text-xs">
                    <Globe className="h-3 w-3 mr-1" />
                    View Only
                  </Badge>
                )}
              </CardTitle>
              {!editingContext.canEditBaseFields && (
                <CardDescription className="text-amber-600 flex items-center gap-1">
                  <Info className="h-3 w-3" />
                  Switch to "All Locations" to edit item details
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                {/* Image */}
                <div className="aspect-square rounded-lg bg-muted/30 overflow-hidden border">
                  {menuItem.image ? (
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

                  {menuItem.meal_types && menuItem.meal_types.length > 0 && (
                    <div>
                      <div className="text-sm font-medium text-muted-foreground mb-2">
                        Meal Types
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {menuItem.meal_types.map((type: string) => (
                          <Badge key={type} variant="outline">
                            <Clock className="h-3 w-3 mr-1" />
                            {type}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Allergens */}
              {menuItem.allergens && menuItem.allergens.length > 0 && (
                <div className="pt-4 border-t">
                  <div className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-orange-500" />
                    Allergens
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {menuItem.allergens.map((allergen: string) => (
                      <Badge
                        key={allergen}
                        variant="secondary"
                        className="bg-orange-500/10 text-orange-600 border-orange-200"
                      >
                        {allergen}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Categories */}
              <div className="pt-4 border-t">
                <div className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                  <Tag className="h-4 w-4" />
                  Categories
                </div>
                {categories.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No categories assigned
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {categories.map((cat) => (
                      <Badge
                        key={cat.id}
                        variant="outline"
                        className="px-3 py-1"
                      >
                        {cat?.name}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* Menus this item is in */}
              {menus.length > 0 && (
                <div className="pt-4 border-t">
                  <div className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                    <Utensils className="h-4 w-4" />
                    Appears in {menus.length} Menu(s)
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {menus.map((m) => (
                      <Badge key={m.id} variant="secondary">
                        {m?.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recipe / Ingredients Section */}
          <RecipeManager
            menuItemId={menuItem.id}
            menuItemName={menuItem.name}
            clerkOrgId={clerkOrgId || ""}
            locationId={isAllLocations ? null : selectedLocationId}
            isEditable={
              // Can edit recipe if:
              // 1. In All Locations view (can edit global items)
              // 2. Or, item is a local item AND we're at the location that owns it
              isAllLocations ||
              (!!menuItem.location_id &&
                menuItem.location_id === selectedLocationId)
            }
          />

          {/* Modifier Groups Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Layers className="h-5 w-5 text-purple-500" />
                    Modifier Groups
                  </CardTitle>
                  <CardDescription>
                    Customization options available for this item
                  </CardDescription>
                </div>
                {isAllLocations && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setLinkingModifier(true)}
                    disabled={unlinkedModifierGroups.length === 0}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Link Modifier
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {modifierGroups.length === 0 ? (
                <Empty
                  icon={Layers}
                  title="No modifier groups"
                  description="Link modifier groups to let customers customize this item"
                  action={
                    isAllLocations && unlinkedModifierGroups.length > 0 ? (
                      <Button
                        variant="outline"
                        onClick={() => setLinkingModifier(true)}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Link Modifier Group
                      </Button>
                    ) : isAllLocations ? (
                      <Button
                        variant="outline"
                        onClick={() => router.push("/dashboard/menu/modifiers")}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Create Modifier Group
                      </Button>
                    ) : null
                  }
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
                        <Card
                          className={cn(
                            "transition-all hover:shadow-md animate-in fade-in slide-in-from-left-4",
                            expandedModifiers[mg.id] &&
                              "ring-2 ring-purple-500/20"
                          )}
                          style={{ animationDelay: `${index * 50}ms` }}
                        >
                          <CollapsibleTrigger asChild>
                            <CardContent className="p-4 cursor-pointer">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4 flex-1">
                                  <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0">
                                    <Layers className="h-5 w-5 text-purple-500" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="font-semibold flex items-center gap-2">
                                      {group.name}
                                      {group.is_required && (
                                        <Badge
                                          variant="destructive"
                                          className="text-xs"
                                        >
                                          Required
                                        </Badge>
                                      )}
                                    </div>
                                    {group.description && (
                                      <div className="text-sm text-muted-foreground line-clamp-1">
                                        {group.description}
                                      </div>
                                    )}
                                    <div className="flex flex-wrap gap-1 mt-2">
                                      {group.items?.slice(0, 4).map((opt) => (
                                        <Badge
                                          key={opt.id}
                                          variant="outline"
                                          className="text-xs"
                                        >
                                          {opt.name}
                                          {opt.price_modifier > 0 && (
                                            <span className="text-green-600 ml-1">
                                              +${opt.price_modifier}
                                            </span>
                                          )}
                                        </Badge>
                                      ))}
                                      {(group.items?.length || 0) > 4 && (
                                        <Badge
                                          variant="outline"
                                          className="text-xs"
                                        >
                                          +{group.items.length - 4} more
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                  <div className="text-right text-sm text-muted-foreground">
                                    {group.items?.length || 0} options
                                  </div>
                                  <ChevronDown
                                    className={cn(
                                      "h-5 w-5 text-muted-foreground transition-transform duration-200",
                                      expandedModifiers[mg.id] && "rotate-180"
                                    )}
                                  />
                                </div>
                              </div>
                            </CardContent>
                          </CollapsibleTrigger>

                          <CollapsibleContent>
                            <div className="px-4 pb-4 pt-0 border-t">
                              <div className="mt-4 space-y-2">
                                <h4 className="text-sm font-medium text-muted-foreground">
                                  Options ({group.items?.length || 0})
                                </h4>
                                {group.items && group.items.length > 0 ? (
                                  <div className="grid gap-2 md:grid-cols-2">
                                    {group.items.map((opt) => (
                                      <div
                                        key={opt.id}
                                        className={cn(
                                          "flex items-center justify-between p-3 rounded-lg bg-muted/50 transition-colors",
                                          !opt.is_active && "opacity-50"
                                        )}
                                      >
                                        <div>
                                          <div className="font-medium flex items-center gap-2">
                                            {opt.name}
                                            {!opt.is_active && (
                                              <Badge
                                                variant="secondary"
                                                className="text-xs"
                                              >
                                                Inactive
                                              </Badge>
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
                                            "font-semibold shrink-0",
                                            opt.price_modifier > 0
                                              ? "text-green-600"
                                              : opt.price_modifier < 0
                                              ? "text-red-500"
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

                              <div className="mt-4 p-3 rounded-lg bg-muted/30">
                                <h4 className="text-sm font-medium mb-2">
                                  Selection Rules
                                </h4>
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                  <div>
                                    <span className="text-muted-foreground">
                                      Minimum:
                                    </span>
                                    <span className="ml-2 font-medium">
                                      {group.min_selections || 0}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">
                                      Maximum:
                                    </span>
                                    <span className="ml-2 font-medium">
                                      {group.max_selections || "Unlimited"}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {isAllLocations && (
                                <div className="mt-4 flex items-center gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      router.push("/dashboard/menu/modifiers")
                                    }
                                  >
                                    <Edit3 className="h-4 w-4 mr-1" />
                                    Edit Group
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setUnlinkingModifier(mg);
                                    }}
                                    className="text-destructive hover:text-destructive"
                                  >
                                    <Unlink className="h-4 w-4 mr-1" />
                                    Unlink
                                  </Button>
                                </div>
                              )}
                            </div>
                          </CollapsibleContent>
                        </Card>
                      </Collapsible>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recipes Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ChefHat className="h-5 w-5 text-orange-500" />
                Recipes
              </CardTitle>
              <CardDescription>
                Recipes and ingredients for this item
              </CardDescription>
            </CardHeader>
            <CardContent>
              {recipes.length === 0 ? (
                <Empty
                  icon={ChefHat}
                  title="No recipes"
                  description="Add recipes to track ingredients and costs"
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
                        className="p-3 rounded-lg border bg-card"
                      >
                        <div className="font-semibold">
                          {recipe.recipe?.name}
                        </div>
                        {recipe.recipe?.description && (
                          <div className="text-sm text-muted-foreground">
                            {recipe.recipe.description}
                          </div>
                        )}
                        {recipe.quantity_multiplier !== 1 && (
                          <Badge variant="outline" className="mt-2">
                            ×{recipe.quantity_multiplier}
                          </Badge>
                        )}
                      </div>
                    )
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Preview & Quick Info */}
        <div className="space-y-6">
          {/* Price Breakdown */}
          <PriceBreakdown
            item={menuItem}
            isAllLocations={isAllLocations}
            currentLocationName={currentLocationName}
          />

          {/* Location Badges */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Flame className="h-4 w-4 text-orange-500" />
                Location Badges
              </CardTitle>
              <CardDescription className="text-xs">
                Badges shown on the storefront for {currentLocationName}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          🔥 Popular
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {isAllLocations
                            ? "Select a location to manage"
                            : "Auto-detected or manually set"}
                        </p>
                      </div>
                      <Switch
                        checked={isPopular}
                        onCheckedChange={(v) => popularMutation.mutate(v)}
                        disabled={isAllLocations || popularMutation.isPending}
                      />
                    </div>
                  </TooltipTrigger>
                  {isAllLocations && (
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
                          {isAllLocations
                            ? "Select a location to manage"
                            : "Mark as new at this branch"}
                        </p>
                      </div>
                      <Switch
                        checked={isNew}
                        onCheckedChange={(v) => newMutation.mutate(v)}
                        disabled={isAllLocations || newMutation.isPending}
                      />
                    </div>
                  </TooltipTrigger>
                  {isAllLocations && (
                    <TooltipContent>
                      Select a specific location to manage this badge
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            </CardContent>
          </Card>

          {/* POS Preview */}
          <Card className="sticky top-6">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                POS Preview
              </CardTitle>
            </CardHeader>
            <CardContent className="flex justify-center">
              <ItemPreviewCard
                name={menuItem.name}
                description={menuItem.description || undefined}
                price={menuItem.effective_price || 0}
                cashPrice={menuItem.effective_cash_price || undefined}
                image={menuItem.image || undefined}
                categories={categories.map((c) => c.name).filter(Boolean)}
                availability={
                  menuItem.effective_availability ??
                  menuItem.base_availability ??
                  true
                }
              />
            </CardContent>
          </Card>

          {/* Quick Stats */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Quick Stats
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between py-2 border-b">
                <span className="text-sm text-muted-foreground">
                  Categories
                </span>
                <Badge variant="secondary">{categories.length}</Badge>
              </div>
              <div className="flex items-center justify-between py-2 border-b">
                <span className="text-sm text-muted-foreground">
                  Modifier Groups
                </span>
                <Badge variant="secondary">{modifierGroups.length}</Badge>
              </div>
              <div className="flex items-center justify-between py-2 border-b">
                <span className="text-sm text-muted-foreground">Menus</span>
                <Badge variant="secondary">{menus.length}</Badge>
              </div>
              <div className="flex items-center justify-between py-2 border-b">
                <span className="text-sm text-muted-foreground">Recipes</span>
                <Badge variant="secondary">{recipes.length}</Badge>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-muted-foreground">
                  Stock Mode
                </span>
                <Badge variant="outline">
                  {menuItem.stock_tracking_mode || "in_stock"}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Metadata */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Metadata
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span>
                  {new Date(menuItem.created_at).toLocaleDateString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Updated</span>
                <span>
                  {new Date(menuItem.updated_at).toLocaleDateString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">ID</span>
                <span className="font-mono text-xs truncate max-w-32">
                  {menuItem.id}
                </span>
              </div>
            </CardContent>
          </Card>
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
        }}
        onSuccess={() => {
          setIsEditSheetOpen(false);
          refetch();
        }}
      />

      {/* Link Modifier Dialog */}
      <Dialog open={linkingModifier} onOpenChange={setLinkingModifier}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Link Modifier Group</DialogTitle>
            <DialogDescription>
              Select a modifier group to add to this item
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {unlinkedModifierGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                All modifier groups are already linked to this item.
              </p>
            ) : (
              unlinkedModifierGroups.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  className="w-full p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors text-left"
                  onClick={() => handleLinkModifier(group.id)}
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0">
                      <Layers className="h-5 w-5 text-purple-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold flex items-center gap-2">
                        {group.name}
                        {group.is_required && (
                          <Badge variant="destructive" className="text-xs">
                            Required
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {group?.modifier_group_items?.length || 0} options
                      </div>
                    </div>
                    <LinkIcon className="h-4 w-4 text-muted-foreground" />
                  </div>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Unlink Modifier Confirmation */}
      <Dialog
        open={!!unlinkingModifier}
        onOpenChange={(open) => !open && setUnlinkingModifier(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unlink Modifier Group</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove "
              {unlinkingModifier?.modifier_group?.name}" from this item? The
              modifier group itself won't be deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setUnlinkingModifier(null)}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleUnlinkModifier}>
              Unlink
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteItem}
              disabled={isDeleting}
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
    </div>
  );
}
