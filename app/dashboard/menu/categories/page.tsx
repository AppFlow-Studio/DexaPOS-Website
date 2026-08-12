"use client";

import { ScopeContextStrip } from "@/components/dashboard/menu/ScopeContextStrip";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tag,
  Plus,
  Search,
  Edit3,
  Trash2,
  Sparkles,
  Utensils,
  ChevronDown,
  ChevronRight,
  X,
  Globe,
  MapPin,
  Settings2,
  Eye,
  EyeOff,
  RotateCcw,
  Info,
  DollarSign,
  Edit2,
  Save,
  Flame,
  Check,
  CheckSquare,
  Truck,
  MoreHorizontal,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BulkPriceAdjustDialog } from "@/components/dashboard/menu/items/BulkPriceAdjustDialog";
import { BulkDeliveryPriceAdjustDialog } from "@/components/dashboard/menu/items/BulkDeliveryPriceAdjustDialog";
import { useState, useMemo } from "react";
import { useCategoriesWithItems } from "../../hooks/useCategories";
import { useModifierGroups } from "../../hooks/useModifierGroups";
import { useMenus } from "../../hooks/useMenus";
import { useLocations } from "../../hooks/useLocations";
import { useUserInfo } from "../../../manage/hooks/useUserInfo.";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/ui/empty";
import { CategoryFormSheet } from "@/components/dashboard/menu/CategoryFormSheet";
import {
  DeleteCategory,
  RemoveItemFromCategory,
  UpdateCategory,
  UpdateLocationCategoryOverride,
  RemoveLocationCategoryOverride,
} from "../../actions/categories";
import {
  useLocationStore,
  useIsSingleLocation,
  useGatedLocationId,
} from "@/stores/location-store";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateOrderOutSync } from "@/app/dashboard/hooks/useOrderOutMenuSync";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn, isValidImageUrl } from "@/lib/utils";
import { CategoryWithItems, CategoryMenuItem } from "@/types/menu";
import { useRouter } from "next/navigation";
import {
  LevelIndicator,
  getEditingLevel,
  EditingContextBanner,
} from "@/components/dashboard/menu/LevelIndicator";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  NewEditItemFormSheet,
  EditItemWithOverrides,
} from "@/components/dashboard/menu/NewEditItemFormSheet";
import { AddItemToCategoryWizard } from "@/components/dashboard/menu/categories/AddItemToCategoryWizard";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  usePrepStations,
  useCategoryPrepDefaults,
  useSetCategoryPrepDefault,
  useRemoveCategoryPrepDefault,
} from "@/app/dashboard/hooks/usePrepStations";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { UpdateLocationCategoryItemsOrder } from "../../actions/item-assignments";

export default function CategoriesPage() {
  const router = useRouter();
  const { data: userInfo } = useUserInfo();
  const clerkOrgId = userInfo?.members?.[0]?.organizations?.id;
  const queryClient = useQueryClient();
  const { selectedLocationId } = useLocationStore();
  const isAllLocations = selectedLocationId === "all" || !selectedLocationId;
  const isSingleLocation = useIsSingleLocation();

  // Prep stations are location-scoped. Single-location accounts are locked to
  // the 'all' core scope for category/menu editing, so resolve a CONCRETE
  // location via the gated resolver for the prep-station pieces only (otherwise
  // "all" disables the queries and prep stations like "Bakery" never show).
  const prepLocationId = useGatedLocationId();

  // Prep station hooks (location-scoped)
  const { data: prepStations = [] } = usePrepStations(prepLocationId);
  const { data: categoryPrepDefaults = [] } =
    useCategoryPrepDefaults(prepLocationId);
  const setCategoryPrepDefaultMutation = useSetCategoryPrepDefault();
  const removeCategoryPrepDefaultMutation = useRemoveCategoryPrepDefault();

  // Primary data source: RPC with full category + items data
  const {
    data: categoriesWithItems,
    isLoading: loadingCategoriesWithItems,
    refetch,
  } = useCategoriesWithItems(clerkOrgId || "", selectedLocationId);
  const { data: menus } = useMenus(clerkOrgId || "");
  const { data: modifierGroups } = useModifierGroups(clerkOrgId || "");
  const { data: locations } = useLocations(
    clerkOrgId || "",
    userInfo?.id || "",
  );

  const currentLocation = locations?.find((l) => l.id === selectedLocationId);

  const [searchTerm, setSearchTerm] = useState("");
  const [categorySortDesc, setCategorySortDesc] = useState(false);
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false);
  const [editingCategory, setEditingCategory] =
    useState<CategoryWithItems | null>(null);
  const [deletingCategory, setDeletingCategory] =
    useState<CategoryWithItems | null>(null);
  const [expandedCategoryId, setExpandedCategoryId] = useState<string | null>(
    null,
  );
  const [togglingCategories, setTogglingCategories] = useState<Set<string>>(
    new Set(),
  );

  // Item editing state
  const [editingItem, setEditingItem] = useState<EditItemWithOverrides | null>(
    null,
  );
  const [isItemSheetOpen, setIsItemSheetOpen] = useState(false);
  const [editingCategoryContext, setEditingCategoryContext] = useState<{
    id: string;
    name: string;
  } | null>(null);

  // Add item wizard state
  const [isAddItemWizardOpen, setIsAddItemWizardOpen] = useState(false);
  const [addItemCategoryContext, setAddItemCategoryContext] = useState<{
    id: string;
    name: string;
    existingItemIds: string[];
  } | null>(null);

  // Reordering state
  const [reorderedItemsMap, setReorderedItemsMap] = useState<
    Map<string, CategoryMenuItem[]>
  >(new Map());
  const [itemOrderChanges, setItemOrderChanges] = useState<Set<string>>(
    new Set(),
  );
  const [savingItemOrderFor, setSavingItemOrderFor] = useState<string | null>(
    null,
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  // Which category is in item-ordering mode. Drag handles only appear for that
  // category, and its "Add Item" button becomes "Done".
  const [orderingCategoryId, setOrderingCategoryId] = useState<string | null>(
    null,
  );

  // Bulk selection state
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [bulkPriceOpen, setBulkPriceOpen] = useState(false);
  const [bulkDeliveryOpen, setBulkDeliveryOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Use RPC data as primary source
  const categoriesList: CategoryWithItems[] = categoriesWithItems?.data || [];
  const menusList = Array.isArray(menus) ? menus : [];
  const isLoading = loadingCategoriesWithItems;

  const filteredCategories = categoriesList
    .filter(
      (category) =>
        category.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        category.description?.toLowerCase().includes(searchTerm.toLowerCase()),
    )
    .slice()
    .sort((a, b) =>
      categorySortDesc
        ? b.name.localeCompare(a.name)
        : a.name.localeCompare(b.name),
    );

  const totalSelectableItems = useMemo(
    () => filteredCategories.reduce((sum, c) => sum + (c.items?.length ?? 0), 0),
    [filteredCategories],
  );

  function handleToggleItem(menuItemId: string) {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(menuItemId)) next.delete(menuItemId);
      else next.add(menuItemId);
      return next;
    });
  }

  function handleSelectAll() {
    const allIds = filteredCategories
      .flatMap((c) => c.items ?? [])
      .map((i) => i.menu_item_id);
    setSelectedItemIds(new Set(allIds));
  }

  function exitSelectionMode() {
    setIsSelectionMode(false);
    setSelectedItemIds(new Set());
  }

  // Stats from RPC data
  const totalItems = categoriesList.reduce(
    (acc, c) => acc + (c.item_count || 0),
    0,
  );
  const activeCategories = categoriesList.filter((c) =>
    isAllLocations ? c.is_active : c.effective_is_active,
  ).length;
  const categoriesWithOverrides = categoriesList.filter(
    (c) => c.location_override !== null,
  ).length;

  // Get current editing level
  const editingLevel = getEditingLevel({
    isAllLocations,
    menuId: null,
    categoryId: null,
    isMenuLocationOwned: false,
  });

  // Helper to get items for a category from RPC data
  const getItemsForCategory = (categoryId: string): CategoryMenuItem[] => {
    const category = categoriesList.find((c) => c.id === categoryId);
    return category?.items || [];
  };

  // Map CategoryMenuItem to EditItemWithOverrides for the edit sheet
  const mapCategoryItemToEditItem = (
    item: CategoryMenuItem,
    categoryId: string,
    categoryName: string,
  ): EditItemWithOverrides => ({
    id: item.menu_item_id,
    name: item.menu_item.name,
    description: item.menu_item.description ?? undefined,
    price: item.menu_item.base_price,
    cash_price: item.menu_item.base_cash_price,
    image: item.menu_item.image ?? undefined,
    availability: item.menu_item.effective_availability,
    allergens: item.menu_item.allergens ?? undefined,
    card_bg_color: item.menu_item.card_bg_color ?? undefined,
    category_items: [{ id: categoryId, name: categoryName }],
    delivery_price: item.menu_item.base_delivery_price ?? null,
    effective_delivery_price: item.menu_item.effective_delivery_price ?? null,
    price_levels: {
      level_1_base: item.menu_item.base_price,
      level_1_cash: item.menu_item.base_cash_price,
      level_2_location_item:
        item.menu_item.location_item_override?.custom_price ?? null,
      level_2_location_item_cash:
        item.menu_item.location_item_override?.custom_cash_price ?? null,
      level_2_modifier:
        item.menu_item.location_item_override?.price_modifier ?? null,
      level_2_modifier_type: null,
      level_3_category: item.category_price,
      level_3_category_cash: item.category_cash_price,
      level_4_location_category:
        item.menu_item.location_category_override?.custom_price ?? null,
      level_4_location_category_cash:
        item.menu_item.location_category_override?.custom_cash_price ?? null,
      level_5_location_menu: null,
      level_5_location_menu_cash: null,
      level_1_delivery: item.menu_item.base_delivery_price ?? null,
      level_2_location_item_delivery: item.menu_item.location_item_override?.custom_delivery_price ?? null,
      level_3_category_delivery: item.category_delivery_price ?? null,
      level_4_location_category_delivery: item.menu_item.location_category_override?.custom_delivery_price ?? null,
      level_5_location_menu_delivery: null,
    },
    effective_price: item.menu_item.effective_price,
    effective_cash_price: item.menu_item.effective_cash_price,
    has_location_item_override: !!item.menu_item.location_item_override,
    has_category_override: item.category_price !== null,
    has_location_category_override: !!item.menu_item.location_category_override,
    menu_item_modifier_groups: item.menu_item.modifier_groups || [],
  });

  // Handle toggling category visibility at location level
  const handleToggleCategoryAtLocation = async (
    categoryId: string,
    isActive: boolean,
  ) => {
    if (isAllLocations || !selectedLocationId) return;

    setTogglingCategories((prev) => new Set(prev).add(categoryId));

    try {
      const result = await UpdateLocationCategoryOverride(
        selectedLocationId,
        categoryId,
        { isActive },
      );

      if (result.error) {
        toast.error("Update Failed", { description: result.error });
        return;
      }

      toast.success(isActive ? "Category Enabled" : "Category Disabled", {
        description: isActive
          ? "This category is now visible at this location."
          : "This category is now hidden at this location.",
      });

      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["categories-with-items"] });
      invalidateOrderOutSync(queryClient);
      refetch();
    } catch {
      toast.error("Update Failed", {
        description: "Unable to update category. Please try again.",
      });
    } finally {
      setTogglingCategories((prev) => {
        const next = new Set(prev);
        next.delete(categoryId);
        return next;
      });
    }
  };

  // Toggle the category's global (merchant-wide) active flag. Used when viewing
  // "All Locations", where there is no per-location override to write.
  const handleToggleCategoryGlobally = async (
    categoryId: string,
    isActive: boolean,
  ) => {
    setTogglingCategories((prev) => new Set(prev).add(categoryId));

    try {
      const result = await UpdateCategory(categoryId, { is_active: isActive });

      if (result.error) {
        toast.error("Update Failed", { description: result.error });
        return;
      }

      toast.success(isActive ? "Category Enabled" : "Category Disabled", {
        description: isActive
          ? "This category is now visible across all locations."
          : "This category is now hidden across all locations.",
      });

      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["categories-with-items"] });
      invalidateOrderOutSync(queryClient);
      refetch();
    } catch {
      toast.error("Update Failed", {
        description: "Unable to update category. Please try again.",
      });
    } finally {
      setTogglingCategories((prev) => {
        const next = new Set(prev);
        next.delete(categoryId);
        return next;
      });
    }
  };

  // Handle resetting category to global settings
  const handleResetCategoryToGlobal = async (categoryId: string) => {
    if (isAllLocations || !selectedLocationId) return;

    setTogglingCategories((prev) => new Set(prev).add(categoryId));

    try {
      const result = await RemoveLocationCategoryOverride(
        selectedLocationId,
        categoryId,
      );

      if (result.error) {
        toast.error("Reset Failed", { description: result.error });
        return;
      }

      toast.success("Reset Complete", {
        description: "Category settings have been reset to global defaults.",
      });

      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["categories-with-items"] });
      invalidateOrderOutSync(queryClient);
      refetch();
    } catch {
      toast.error("Reset Failed", {
        description: "Unable to reset category. Please try again.",
      });
    } finally {
      setTogglingCategories((prev) => {
        const next = new Set(prev);
        next.delete(categoryId);
        return next;
      });
    }
  };

  const handleDelete = async () => {
    if (!deletingCategory) return;

    // Prevent deletion of global categories when viewing a location
    if (!isAllLocations && deletingCategory.is_global) {
      toast.error("Cannot Delete Global Category", {
        description:
          'Global categories cannot be deleted when viewing a specific location. Switch to "All Locations" view to delete global categories.',
      });
      setDeletingCategory(null);
      return;
    }

    // Ensure location-specific categories can only be deleted when viewing that location
    if (
      !isAllLocations &&
      deletingCategory.location_id !== selectedLocationId
    ) {
      toast.error("Cannot Delete Category", {
        description:
          "You can only delete categories that belong to the currently selected location.",
      });
      setDeletingCategory(null);
      return;
    }

    try {
      const result = await DeleteCategory(
        deletingCategory.id,
        selectedLocationId,
      );
      if (result.error) {
        toast.error("Delete Failed", {
          description: result.error,
        });
        return;
      }
      toast.success("Category Deleted", {
        description: `"${deletingCategory.name}" has been permanently deleted.`,
      });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["categories-with-items"] });
      invalidateOrderOutSync(queryClient);
      refetch();
    } catch (error) {
      toast.error("Delete Failed", {
        description: "Unable to delete the category. Please try again.",
      });
    } finally {
      setDeletingCategory(null);
    }
  };

  const handleCategoryClick = (category: CategoryWithItems) => {
    // Toggle expansion
    if (expandedCategoryId === category.id) {
      setExpandedCategoryId(null);
    } else {
      setExpandedCategoryId(category.id);
    }
  };

  const handleEditCategory = (
    category: CategoryWithItems,
    e?: React.MouseEvent,
  ) => {
    e?.stopPropagation();
    setEditingCategory(category);
  };

  const handleNavigateToItem = (itemId: string) => {
    router.push(`/dashboard/menu/items/${itemId}`);
  };

  const handleRemoveItemFromCategory = async (
    categoryId: string,
    menuItemId: string,
    e?: React.MouseEvent,
  ) => {
    e?.stopPropagation();
    try {
      const result = await RemoveItemFromCategory(
        categoryId,
        menuItemId,
        selectedLocationId,
      );
      if (result.error) {
        toast.error("Remove Failed", { description: result.error });
        return;
      }
      toast.success("Item Removed", {
        description: "Item has been removed from the category.",
      });
      queryClient.invalidateQueries({ queryKey: ["categories-with-items"] });
      queryClient.invalidateQueries({ queryKey: ["menu-items"] });
      invalidateOrderOutSync(queryClient);
      refetch();
    } catch {
      toast.error("Remove Failed", {
        description: "Unable to remove item. Please try again.",
      });
    }
  };

  // Handle editing an item within a category context
  const handleEditItem = (
    item: CategoryMenuItem,
    category: CategoryWithItems,
    e?: React.MouseEvent,
  ) => {
    e?.stopPropagation();
    setEditingCategoryContext({ id: category.id, name: category.name });
    setEditingItem(mapCategoryItemToEditItem(item, category.id, category.name));
    setIsItemSheetOpen(true);
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleOrderChange = (
    categoryId: string,
    updatedItems: CategoryMenuItem[],
  ) => {
    setReorderedItemsMap((prev) => {
      const newMap = new Map(prev);
      newMap.set(categoryId, updatedItems);
      return newMap;
    });
    setItemOrderChanges((prev) => new Set(prev).add(categoryId));
  };

  const handleDragEnd = (event: DragEndEvent, categoryId: string) => {
    const { active, over } = event;
    setActiveId(null);

    if (over && active.id !== over.id) {
      const currentItems =
        reorderedItemsMap.get(categoryId) || getItemsForCategory(categoryId);
      const oldIndex = currentItems.findIndex(
        (item) => item.menu_item_id === active.id,
      );
      const newIndex = currentItems.findIndex(
        (item) => item.menu_item_id === over.id,
      );

      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = arrayMove(currentItems, oldIndex, newIndex);
        // Update display_order values
        const updatedItems = newOrder.map((item, idx) => ({
          ...item,
          display_order: idx + 1,
        }));
        handleOrderChange(categoryId, updatedItems);
      }
    }
  };

  const handleSaveItemOrder = async (categoryId: string) => {
    setSavingItemOrderFor(categoryId);
    try {
      const items = reorderedItemsMap.get(categoryId);
      if (!items) return;

      const itemOrders = items.map((item, index) => ({
        menuItemId: item.menu_item_id,
        displayOrder: index + 1,
      }));

      const result = await UpdateLocationCategoryItemsOrder(
        selectedLocationId === "all" ? null : selectedLocationId,
        null,
        categoryId,
        itemOrders,
      );

      if (result.error) {
        toast.error("Save Failed", { description: result.error });
        return;
      }

      toast.success("Order Saved", {
        description:
          selectedLocationId && selectedLocationId !== "all"
            ? "Item display order has been updated for this location."
            : "Item display order has been updated globally.",
      });

      // Refetch to get fresh data from server
      await queryClient.invalidateQueries({
        queryKey: ["categories-with-items"],
      });
      invalidateOrderOutSync(queryClient);
      await refetch();

      // Clear changes for this category
      setItemOrderChanges((prev) => {
        const next = new Set(prev);
        next.delete(categoryId);
        return next;
      });
      setReorderedItemsMap((prev) => {
        const next = new Map(prev);
        next.delete(categoryId);
        return next;
      });
    } catch (error) {
      toast.error("Save Failed", { description: "Unable to save item order." });
    } finally {
      setSavingItemOrderFor(null);
    }
  };

  const handleResetItemOrder = (categoryId: string) => {
    setReorderedItemsMap((prev) => {
      const next = new Map(prev);
      next.delete(categoryId);
      return next;
    });
    setItemOrderChanges((prev) => {
      const next = new Set(prev);
      next.delete(categoryId);
      return next;
    });
  };

  // console.log('categoriesList', categoriesList)
  return (
    <div className="space-y-6 animate-in fade-in duration-500 w-full min-w-0">
      <ScopeContextStrip />
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-2xl font-bold tracking-tight">Categories</h2>
            {/* Location scope indicator — hidden for single-location accounts */}
            {!isSingleLocation && (
              <Badge
                variant={isAllLocations ? "secondary" : "default"}
                className={cn(
                  "gap-1.5 animate-in fade-in slide-in-from-left-2 duration-300",
                  !isAllLocations &&
                    "bg-blue-500/10 text-blue-600 border-blue-200",
                )}
              >
                {isAllLocations ? (
                  <Globe className="h-3 w-3" />
                ) : (
                  <MapPin className="h-3 w-3" />
                )}
                {isAllLocations
                  ? "All Locations"
                  : currentLocation?.name || "Location"}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground">
            {isSingleLocation
              ? "Manage your menu categories"
              : isAllLocations
                ? "Manage global categories for your menus"
                : `Customize categories for ${
                    currentLocation?.name || "this location"
                  }`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
          {!isSingleLocation && !isAllLocations && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Info className="h-4 w-4" />
                    <span>Viewing location overrides</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    You can enable/disable global categories for this location.
                  </p>
                  <p>Create new location-specific categories below.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <Button onClick={() => setIsCreateSheetOpen(true)} className="gap-2">
            {isSingleLocation ? (
              <Plus className="h-4 w-4" />
            ) : isAllLocations ? (
              <Globe className="h-4 w-4" />
            ) : (
              <MapPin className="h-4 w-4" />
            )}
            {isSingleLocation
              ? "Create Category"
              : `Create ${isAllLocations ? "Global" : "Location"} Category`}
          </Button>
        </div>
      </div>

      {/* Context Banner - only show when viewing a specific location */}
      {!isAllLocations && (
        <EditingContextBanner
          level={2}
          locationName={currentLocation?.name}
          className="animate-in fade-in slide-in-from-top-2 duration-300"
        />
      )}

      {/* Stats Overview */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="rounded-3xl transition-all hover:shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Categories
            </CardTitle>
            <Tag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{categoriesList.length}</div>
            <p className="text-xs text-muted-foreground">All categories</p>
          </CardContent>
        </Card>
        <Card className="rounded-3xl transition-all hover:shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Items</CardTitle>
            <Utensils className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{totalItems}</div>
            <p className="text-xs text-muted-foreground">
              Items across categories
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-3xl transition-all hover:shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
            <Eye className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {activeCategories}
            </div>
            <p className="text-xs text-muted-foreground">
              {isAllLocations ? "Globally active" : "Active at location"}
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-3xl transition-all hover:shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {isAllLocations ? "In Menus" : "With Overrides"}
            </CardTitle>
            {isAllLocations ? (
              <Sparkles className="h-4 w-4 text-purple-500" />
            ) : (
              <Settings2 className="h-4 w-4 text-amber-500" />
            )}
          </CardHeader>
          <CardContent>
            <div
              className={cn(
                "text-2xl font-bold",
                isAllLocations ? "text-purple-600" : "text-amber-600",
              )}
            >
              {isAllLocations
                ? categoriesList.reduce(
                    (acc, c) => acc + (c.menu_count || 0),
                    0,
                  )
                : categoriesWithOverrides}
            </div>
            <p className="text-xs text-muted-foreground">
              {isAllLocations ? "Used in menus" : "Location-specific settings"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Categories List */}
      <Card className="rounded-3xl">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>All Categories</CardTitle>
              <CardDescription>
                Click a category to see its items
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search categories..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 w-full sm:w-64"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCategorySortDesc((v) => !v)}
                title={`Sort ${categorySortDesc ? "Z → A" : "A → Z"}`}
              >
                {categorySortDesc ? "Z – A" : "A – Z"}
              </Button>
              <Button
                variant={isSelectionMode ? "secondary" : "outline"}
                size="sm"
                className="gap-1"
                onClick={() =>
                  isSelectionMode ? exitSelectionMode() : setIsSelectionMode(true)
                }
              >
                <CheckSquare className="h-4 w-4" />
                {isSelectionMode ? "Selecting" : "Select"}
                {isSelectionMode && selectedItemIds.size > 0 && (
                  <Badge
                    variant="secondary"
                    className="ml-0.5 h-5 px-1.5 text-xs"
                  >
                    {selectedItemIds.size}
                  </Badge>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Sticky selection bar */}
          {isSelectionMode && (
            <div className="sticky top-0 z-20 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border-0 bg-muted/60 px-4 py-2.5 backdrop-blur mb-4">
              <Badge variant="secondary" className="min-w-0 shrink text-xs">
                <span className="truncate tabular-nums">
                  {selectedItemIds.size} of {totalSelectableItems} selected
                </span>
              </Badge>
              <div className="hidden w-px h-4 bg-border sm:block" />
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={
                  selectedItemIds.size === totalSelectableItems
                    ? () => setSelectedItemIds(new Set())
                    : handleSelectAll
                }
              >
                {selectedItemIds.size === totalSelectableItems
                  ? "Deselect all"
                  : "Select all"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => setSelectedItemIds(new Set())}
              >
                Clear
              </Button>
              <div className="ml-auto flex shrink-0 items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm"
                      className="h-8 gap-1"
                      disabled={selectedItemIds.size === 0}
                    >
                      Bulk edit
                      <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setBulkPriceOpen(true)}>
                      <DollarSign className="h-4 w-4 mr-2" />
                      Adjust card price…
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setBulkDeliveryOpen(true)}>
                      <Truck className="h-4 w-4 mr-2" />
                      Adjust online (delivery) price…
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8"
                  onClick={exitSelectionMode}
                >
                  Done
                </Button>
              </div>
            </div>
          )}
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-32 w-full" />
              ))}
            </div>
          ) : filteredCategories.length === 0 ? (
            <Empty
              icon={Tag}
              title={
                categoriesList.length === 0
                  ? "No categories yet"
                  : "No categories found"
              }
              description={
                categoriesList.length === 0
                  ? "Get started by creating your first category"
                  : "Try adjusting your search terms"
              }
              action={
                categoriesList.length === 0 ? (
                  <Button onClick={() => setIsCreateSheetOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Category
                  </Button>
                ) : null
              }
            />
          ) : (
            <div className="space-y-3">
              {filteredCategories.map((category, index) => {
                const isExpanded = expandedCategoryId === category.id;

                // Mobile More-actions menu. Defined here so it can render on
                // the name row rather than in the control cluster below it.
                const canDeleteCategory = isAllLocations
                  ? true
                  : !category.is_global &&
                    category.location_id === selectedLocationId;
                const canAddCategoryItems = isAllLocations
                  ? category.is_global
                  : category.location_id === selectedLocationId;
                const isOrderingThis = orderingCategoryId === category.id;
                const mobileActionsMenu = isSelectionMode ? null : (
                  <div onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-full"
                          aria-label={`Actions for ${category.name}`}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="center"
                        collisionPadding={12}
                        className="w-44 p-0.5"
                      >
                        {isAllLocations && (
                          <DropdownMenuItem
                            className="gap-2 px-2 py-1.5"
                            onSelect={() => handleEditCategory(category)}
                          >
                            <Edit3 className="h-4 w-4" />
                            Edit category
                          </DropdownMenuItem>
                        )}
                        {canAddCategoryItems && (
                          <DropdownMenuItem
                            className="gap-2 px-2 py-1.5"
                            onSelect={() => {
                              setAddItemCategoryContext({
                                id: category.id,
                                name: category.name,
                                existingItemIds: (category.items || []).map(
                                  (i) => i.menu_item_id,
                                ),
                              });
                              setIsAddItemWizardOpen(true);
                            }}
                          >
                            <Plus className="h-4 w-4" />
                            Add item
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          className="gap-2 px-2 py-1.5"
                          onSelect={() => {
                            setExpandedCategoryId(category.id);
                            setOrderingCategoryId(
                              isOrderingThis ? null : category.id,
                            );
                          }}
                        >
                          <GripVertical className="h-4 w-4" />
                          {isOrderingThis ? "Stop ordering" : "Order items"}
                        </DropdownMenuItem>
                        {canDeleteCategory && (
                          <>
                            <DropdownMenuSeparator className="my-0.5" />
                            <DropdownMenuItem
                              className="gap-2 px-2 py-1.5 text-destructive focus:text-destructive"
                              onSelect={() => setDeletingCategory(category)}
                            >
                              <Trash2 className="h-4 w-4" />
                              Delete category
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                );

                return (
                  <Card
                    key={category.id}
                    className={cn(
                      "rounded-3xl transition-all animate-in fade-in slide-in-from-bottom-4 overflow-hidden",
                      !(isAllLocations
                        ? category.is_active
                        : category.effective_is_active) && "opacity-60",
                      isExpanded
                        ? "ring-2 ring-primary shadow-lg"
                        : "hover:shadow-md hover:border-primary/30 cursor-pointer",
                    )}
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    {/* Category Header */}
                    <div
                      className="cursor-pointer px-3 py-3 transition-colors hover:bg-muted/50 sm:px-6"
                      onClick={() => handleCategoryClick(category)}
                    >
                      <div className="flex items-start gap-2 sm:gap-3">
                        {/* Category-level checkbox in selection mode */}
                        {isSelectionMode && (() => {
                          const catItemIds = (category.items ?? []).map((i) => i.menu_item_id);
                          const selCount = catItemIds.filter((id) => selectedItemIds.has(id)).length;
                          const checkState: boolean | "indeterminate" =
                            selCount === 0 ? false :
                            selCount === catItemIds.length ? true :
                            "indeterminate";
                          return (
                            <div
                              className="flex-shrink-0 mt-1"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (checkState === true) {
                                  setSelectedItemIds((prev) => {
                                    const next = new Set(prev);
                                    catItemIds.forEach((id) => next.delete(id));
                                    return next;
                                  });
                                } else {
                                  setSelectedItemIds((prev) => {
                                    const next = new Set(prev);
                                    catItemIds.forEach((id) => next.add(id));
                                    return next;
                                  });
                                }
                              }}
                            >
                              <Checkbox checked={checkState} />
                            </div>
                          );
                        })()}
                        {/* Expand/collapse affordance — leads the row, matching
                            the menu detail page's category sections. */}
                        {isExpanded ? (
                          <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                        )}

                        <div className="flex-1 min-w-0">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div className="flex min-w-0 flex-col justify-center">
                              <div className="flex min-w-0 flex-wrap items-center gap-2">
                                <h3
                                  className={cn(
                                    "min-w-0 flex-1 truncate text-base font-semibold transition-colors sm:flex-none sm:text-lg",
                                    isExpanded && "text-primary",
                                  )}
                                >
                                  {category.name}
                                </h3>
                                {/* Mobile: More-actions sits on the name row. */}
                                <span className="shrink-0 sm:hidden">
                                  {mobileActionsMenu}
                                </span>
                                {/* Scope badges sit next to the name on desktop
                                    only; on phones they move into the expanded
                                    body, where a long location name has room. */}
                                <span className="hidden min-w-0 flex-wrap items-center gap-2 sm:flex">
                                  {category.location_id === null ? (
                                    <Badge
                                      variant="outline"
                                      className="text-xs bg-emerald-50 text-emerald-600 border-emerald-200"
                                    >
                                      <Globe className="h-3 w-3 mr-1" />
                                      Global
                                    </Badge>
                                  ) : (
                                    <Badge
                                      variant="outline"
                                      className="min-w-0 text-xs bg-purple-50 text-purple-600 border-purple-200"
                                    >
                                      <MapPin className="h-3 w-3 mr-1 shrink-0" />
                                      <span className="min-w-0 truncate">
                                        {category.location_name}
                                      </span>
                                    </Badge>
                                  )}
                                  {!isAllLocations && category.location_override && (
                                    <Badge
                                      variant="outline"
                                      className="text-xs bg-blue-50 text-blue-600 border-blue-200"
                                    >
                                      <Settings2 className="h-3 w-3 mr-1" />
                                      Override
                                    </Badge>
                                  )}
                                </span>
                              </div>
                              {category.description && (
                                <p className="mt-1 hidden text-sm text-muted-foreground line-clamp-2 sm:block">
                                  {category.description}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0 flex-wrap">
                              {/* Visibility toggle — writes a location override
                                  when scoped to a location, otherwise flips the
                                  category's global active flag. */}
                              {(() => {
                                const visibilityActive = isAllLocations
                                  ? category.is_active
                                  : category.effective_is_active;
                                return (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <div
                                          className="flex items-center gap-2"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <Switch
                                            checked={visibilityActive}
                                            onCheckedChange={(checked) =>
                                              isAllLocations
                                                ? handleToggleCategoryGlobally(
                                                    category.id,
                                                    checked,
                                                  )
                                                : handleToggleCategoryAtLocation(
                                                    category.id,
                                                    checked,
                                                  )
                                            }
                                            disabled={togglingCategories.has(
                                              category.id,
                                            )}
                                          />
                                          {/* Icon is redundant next to the
                                              switch on phones. */}
                                          {visibilityActive ? (
                                            <Eye className="hidden h-4 w-4 text-green-500 sm:block" />
                                          ) : (
                                            <EyeOff className="hidden h-4 w-4 text-muted-foreground sm:block" />
                                          )}
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>
                                          {visibilityActive ? "Hide" : "Show"}{" "}
                                          this category{" "}
                                          {isAllLocations
                                            ? "globally"
                                            : "at this location"}
                                        </p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                );
                              })()}

                              {/* Icon-button cluster: desktop only. Phones get
                                  the consolidated "More actions" menu below. */}
                              <div className="hidden items-center gap-2 sm:flex">
                              {/* Prep station quick-assign button — shown whenever
                                  a concrete location resolves (specific location
                                  OR single-location account locked to 'all'). */}
                              {!!prepLocationId && (() => {
                                const categoryPrepDefault = categoryPrepDefaults.find(
                                  (d) => d.category_id === category.id,
                                );
                                const assignedStation = categoryPrepDefault
                                  ? prepStations.find(
                                      (ps) => ps.id === categoryPrepDefault.prep_station_id,
                                    )
                                  : null;

                                return (
                                  <Popover>
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <PopoverTrigger asChild>
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="h-8 w-8 relative border border-dashed border-muted-foreground/50 rounded-full"
                                              onClick={(e) => e.stopPropagation()}
                                            >
                                              <Flame
                                                className={cn(
                                                  "h-4 w-4",
                                                  assignedStation
                                                    ? "text-orange-500"
                                                    : "text-muted-foreground",
                                                )}
                                              />
                                              {assignedStation && (
                                                <span
                                                  className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background"
                                                  style={{
                                                    backgroundColor: assignedStation.color,
                                                  }}
                                                />
                                              )}
                                            </Button>
                                          </PopoverTrigger>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p>
                                            {assignedStation
                                              ? `Prep: ${assignedStation.name}`
                                              : "Assign prep station"}
                                          </p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                    <PopoverContent
                                      className="w-56 p-2"
                                      align="end"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <p className="text-xs font-medium text-muted-foreground px-2 pb-2">
                                        Default Prep Station
                                      </p>
                                      {prepStations.filter((ps) => ps.is_active).length === 0 ? (
                                        <div className="px-2 py-3 text-center text-sm text-muted-foreground">
                                          <p>No prep stations configured.</p>
                                          <Button
                                            variant="link"
                                            size="sm"
                                            className="mt-1 h-auto p-0 text-xs"
                                            onClick={() =>
                                              router.push("/dashboard/settings/prep-stations")
                                            }
                                          >
                                            Go to Settings
                                          </Button>
                                        </div>
                                      ) : (
                                        <div className="space-y-0.5">
                                          {/* None option */}
                                          <button
                                            className={cn(
                                              "flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-sm hover:bg-muted transition-colors",
                                              !assignedStation && "bg-muted",
                                            )}
                                            onClick={() => {
                                              if (categoryPrepDefault) {
                                                removeCategoryPrepDefaultMutation.mutate({
                                                  locationId: prepLocationId!,
                                                  categoryId: category.id,
                                                });
                                              }
                                            }}
                                          >
                                            <div className="h-3 w-3 rounded-full border border-dashed border-muted-foreground/50 flex-shrink-0" />
                                            <span className="flex-1 text-left">
                                              None (routes to Expo)
                                            </span>
                                            {!assignedStation && (
                                              <Check className="h-3.5 w-3.5 text-primary" />
                                            )}
                                          </button>
                                          {/* Active prep stations */}
                                          {prepStations
                                            .filter((ps) => ps.is_active)
                                            .map((ps) => (
                                              <button
                                                key={ps.id}
                                                className={cn(
                                                  "flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-sm hover:bg-muted transition-colors",
                                                  assignedStation?.id === ps.id && "bg-muted",
                                                )}
                                                onClick={() => {
                                                  setCategoryPrepDefaultMutation.mutate({
                                                    locationId: prepLocationId!,
                                                    categoryId: category.id,
                                                    prepStationId: ps.id,
                                                    merchantId: ps.merchant_id,
                                                  });
                                                }}
                                              >
                                                <div
                                                  className="h-3 w-3 rounded-full flex-shrink-0"
                                                  style={{ backgroundColor: ps.color }}
                                                />
                                                <span className="flex-1 text-left truncate">
                                                  {ps.name}
                                                </span>
                                                {assignedStation?.id === ps.id && (
                                                  <Check className="h-3.5 w-3.5 text-primary" />
                                                )}
                                              </button>
                                            ))}
                                        </div>
                                      )}
                                    </PopoverContent>
                                  </Popover>
                                );
                              })()}

                              {/* Edit button - only for global view */}
                              {isAllLocations && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={(e) =>
                                    handleEditCategory(category, e)
                                  }
                                >
                                  <Edit3 className="h-4 w-4" />
                                </Button>
                              )}

                              {/* Delete button - show for all categories when viewing all locations, or for location-specific categories when viewing that location */}
                              {(() => {
                                const canDelete = isAllLocations
                                  ? true // Can delete any category when viewing all locations
                                  : !category.is_global &&
                                    category.location_id === selectedLocationId; // Can only delete location-specific categories for the current location

                                if (!canDelete) return null;

                                return (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-8 w-8 text-destructive hover:text-destructive"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setDeletingCategory(category);
                                          }}
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>Delete category</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                );
                              })()}

                              {/* Reset to global button - only for location view when there's an override */}
                              {!isAllLocations &&
                                category.location_override && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-8 w-8"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleResetCategoryToGlobal(
                                              category.id,
                                            );
                                          }}
                                          disabled={togglingCategories.has(
                                            category.id,
                                          )}
                                        >
                                          <RotateCcw className="h-4 w-4" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>Reset to global settings</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                              </div>

                            </div>
                          </div>

                          {/* Count flags are desktop-only — on phones the row
                              keeps just the name and its scope badge. */}
                          <div className="mt-2 hidden flex-wrap items-center gap-2 sm:flex">
                            {/* Item count from RPC */}
                            <Badge variant="outline" className="text-xs">
                              {category.item_count || 0} item
                              {(category.item_count || 0) !== 1 ? "s" : ""}
                            </Badge>

                            {/* Menu count */}
                            {(category.menu_count || 0) > 0 && (
                              <Badge
                                variant="outline"
                                className="text-xs text-purple-600 border-purple-200"
                              >
                                In {category.menu_count} menu
                                {category.menu_count !== 1 ? "s" : ""}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Expanded Items Section */}
                    {isExpanded && (
                      <div className="animate-in slide-in-from-top-2 overflow-hidden">
                        <div className="px-3 pb-4 pt-0 sm:px-6">
                          {/* Scope badges live here on mobile, where a long
                              location name has the full card width to wrap
                              into instead of squeezing the name row. */}
                          <div className="mb-3 flex min-w-0 flex-wrap items-center gap-2 sm:hidden">
                            {category.location_id === null ? (
                              <Badge
                                variant="outline"
                                className="text-xs bg-emerald-50 text-emerald-600 border-emerald-200"
                              >
                                <Globe className="mr-1 h-3 w-3 shrink-0" />
                                Global
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="min-w-0 max-w-full text-xs bg-purple-50 text-purple-600 border-purple-200"
                              >
                                <MapPin className="mr-1 h-3 w-3 shrink-0" />
                                <span className="min-w-0 truncate">
                                  {category.location_name}
                                </span>
                              </Badge>
                            )}
                            {!isAllLocations && category.location_override && (
                              <Badge
                                variant="outline"
                                className="text-xs bg-blue-50 text-blue-600 border-blue-200"
                              >
                                <Settings2 className="mr-1 h-3 w-3 shrink-0" />
                                Override
                              </Badge>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-2 mb-3 min-w-0">
                            {/* Heading is desktop-only — the expanded card is
                                self-evidently the category's item list. */}
                            <h4 className="hidden min-w-0 flex-wrap items-center gap-1.5 text-sm font-medium sm:flex">
                              <Utensils className="h-4 w-4 shrink-0" />
                              <span className="min-w-0 break-words">Items in this category</span>
                              {!isAllLocations && (
                                <Badge variant="outline" className="text-xs shrink-0">
                                  Location Pricing
                                </Badge>
                              )}
                            </h4>
                            <div className="flex items-center gap-2 shrink-0">
                              {/* Add Item Button - Only when scoping allows */}
                              {(() => {
                                // While ordering, this slot becomes the exit
                                // affordance for reorder mode instead.
                                if (orderingCategoryId === category.id) {
                                  return (
                                    <Button
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setOrderingCategoryId(null);
                                      }}
                                      className="gap-1"
                                    >
                                      <Check className="h-3 w-3" />
                                      Done
                                    </Button>
                                  );
                                }

                                // Global categories: can only add when viewing all locations
                                // Location categories: can only add when viewing that location
                                const canAddItems = isAllLocations
                                  ? category.is_global
                                  : category.location_id === selectedLocationId;

                                // "Add Item" is desktop-only — on phones it lives
                                // in the category's More-actions menu.
                                if (canAddItems) {
                                  return (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setAddItemCategoryContext({
                                          id: category.id,
                                          name: category.name,
                                          existingItemIds: (
                                            category.items || []
                                          ).map((item) => item.menu_item_id),
                                        });
                                        setIsAddItemWizardOpen(true);
                                      }}
                                      className="hidden gap-1 sm:inline-flex"
                                    >
                                      <Plus className="h-3 w-3" />
                                      Add Item
                                    </Button>
                                  );
                                }

                                // Show disabled state with explanation
                                return (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          disabled
                                          className="hidden gap-1 opacity-50 sm:inline-flex"
                                        >
                                          <Plus className="h-3 w-3" />
                                          Add Item
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>
                                          {isAllLocations && !category.is_global
                                            ? "This is a location-specific category. Switch to that location to add items."
                                            : 'Switch to "All Locations" to add items to this global category.'}
                                        </p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                );
                              })()}

                              {/* <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={(e) => {
                                                                    e.stopPropagation()
                                                                    router.push(`/dashboard/menu/items?category=${category.id}`)
                                                                }}
                                                            >
                                                                View All
                                                                <ExternalLink className="h-3 w-3 ml-1" />
                                                            </Button> */}
                            </div>
                          </div>

                          {isLoading ? (
                            <div className="space-y-2">
                              {[1, 2, 3].map((i) => (
                                <Skeleton key={i} className="h-16 w-full" />
                              ))}
                            </div>
                          ) : (
                            (() => {
                              // Use items directly from the category (RPC data)
                              const categoryItems = category.items || [];

                              if (categoryItems.length === 0) {
                                // Scoping check for empty state add button
                                const canAddItems = isAllLocations
                                  ? category.is_global
                                  : category.location_id === selectedLocationId;

                                return (
                                  <div className="text-center py-8 text-muted-foreground">
                                    <Utensils className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                    <p className="text-sm">
                                      No items in this category yet
                                    </p>
                                    {canAddItems ? (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="mt-3"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setAddItemCategoryContext({
                                            id: category.id,
                                            name: category.name,
                                            existingItemIds: [],
                                          });
                                          setIsAddItemWizardOpen(true);
                                        }}
                                      >
                                        <Plus className="h-3 w-3 mr-1" />
                                        Add Items
                                      </Button>
                                    ) : (
                                      <p className="text-xs mt-2 text-muted-foreground/70">
                                        {isAllLocations && !category.is_global
                                          ? "Switch to the location to add items"
                                          : 'Switch to "All Locations" to add items'}
                                      </p>
                                    )}
                                  </div>
                                );
                              }

                              return (
                                <div className="space-y-4">
                                  {/* Save/Reset Banner for Items */}
                                  {itemOrderChanges.has(category.id) && (
                                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20 border-dashed animate-in fade-in slide-in-from-top-2">
                                      <div className="flex items-center gap-2 min-w-0">
                                        <div className="h-2 w-2 rounded-full bg-primary animate-pulse shrink-0" />
                                        <p className="text-sm font-medium text-primary truncate">
                                          Item order changed
                                          {!isAllLocations && (
                                            <span className="ml-1 text-xs font-normal opacity-70">
                                              (This location)
                                            </span>
                                          )}
                                        </p>
                                      </div>
                                      <div className="flex items-center gap-2 shrink-0">
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() =>
                                            handleResetItemOrder(category.id)
                                          }
                                          disabled={
                                            savingItemOrderFor === category.id
                                          }
                                          className="h-8 text-xs flex-1 sm:flex-none"
                                        >
                                          <RotateCcw className="h-3 w-3 mr-1" />
                                          Reset
                                        </Button>
                                        <Button
                                          size="sm"
                                          onClick={() =>
                                            handleSaveItemOrder(category.id)
                                          }
                                          disabled={
                                            savingItemOrderFor === category.id
                                          }
                                          className="h-8 text-xs gap-1.5 flex-1 sm:flex-none"
                                        >
                                          {savingItemOrderFor ===
                                          category.id ? (
                                            <>
                                              <div className="h-3 w-3 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                                              Saving...
                                            </>
                                          ) : (
                                            <>
                                              <Save className="h-3 w-3" />
                                              Save Order
                                            </>
                                          )}
                                        </Button>
                                      </div>
                                    </div>
                                  )}

                                  <DndContext
                                    sensors={sensors}
                                    collisionDetection={closestCenter}
                                    onDragStart={handleDragStart}
                                    onDragEnd={(e) =>
                                      handleDragEnd(e, category.id)
                                    }
                                  >
                                    <SortableContext
                                      items={(
                                        reorderedItemsMap.get(category.id) ||
                                        categoryItems
                                      ).map((i) => i.menu_item_id)}
                                      strategy={verticalListSortingStrategy}
                                    >
                                      <div className="max-h-[500px] min-w-0 divide-y overflow-y-auto">
                                        {(
                                          reorderedItemsMap.get(category.id) ||
                                          categoryItems
                                        ).map(
                                          (
                                            item: CategoryMenuItem,
                                            itemIndex: number,
                                          ) => (
                                            <SortableCategoryItemRow
                                              key={item.id}
                                              item={item}
                                              index={itemIndex}
                                              category={category}
                                              isAllLocations={isAllLocations}
                                              selectedLocationId={
                                                selectedLocationId
                                              }
                                              handleEditItem={handleEditItem}
                                              handleRemoveItemFromCategory={
                                                handleRemoveItemFromCategory
                                              }
                                              isSelectionMode={isSelectionMode}
                                              isSelected={selectedItemIds.has(item.menu_item_id)}
                                              onToggleSelect={() => handleToggleItem(item.menu_item_id)}
                                              isOrdering={
                                                orderingCategoryId ===
                                                category.id
                                              }
                                            />
                                          ),
                                        )}
                                      </div>
                                    </SortableContext>
                                    <DragOverlay>
                                      {activeId && (
                                        <DragOverlayCategoryItemContent
                                          item={
                                            (
                                              reorderedItemsMap.get(
                                                category.id,
                                              ) || categoryItems
                                            ).find(
                                              (i) =>
                                                i.menu_item_id === activeId,
                                            )!
                                          }
                                          index={(
                                            reorderedItemsMap.get(
                                              category.id,
                                            ) || categoryItems
                                          ).findIndex(
                                            (i) => i.menu_item_id === activeId,
                                          )}
                                        />
                                      )}
                                    </DragOverlay>
                                  </DndContext>
                                </div>
                              );
                            })()
                          )}
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Category Bottom Sheet */}
      <CategoryFormSheet
        open={isCreateSheetOpen || !!editingCategory}
        onOpenChange={(open) => {
          if (!open) {
            setIsCreateSheetOpen(false);
            setEditingCategory(null);
          }
        }}
        clerkOrgId={clerkOrgId}
        menus={menusList}
        schedules={[]}
        editCategory={
          editingCategory
            ? {
                id: editingCategory.id,
                name: editingCategory.name,
                description: editingCategory.description,
                image_url: editingCategory.image,
                display_order: editingCategory.display_order,
                is_active: editingCategory.is_active,
                merchant_id: "",
                menu_id: null,
                created_at: editingCategory.created_at,
                updated_at: editingCategory.updated_at,
              }
            : null
        }
        onSuccess={() => {
          setIsCreateSheetOpen(false);
          setEditingCategory(null);
          queryClient.invalidateQueries({
            queryKey: ["categories-with-items"],
          });
          invalidateOrderOutSync(queryClient);
          refetch();
        }}
      />

      {/* Edit Item in Category Context */}
      <NewEditItemFormSheet
        open={isItemSheetOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsItemSheetOpen(false);
            setEditingItem(null);
            setEditingCategoryContext(null);
          }
        }}
        clerkOrgId={clerkOrgId || ""}
        editItem={editingItem || undefined}
        categoryId={editingCategoryContext?.id}
        categoryName={editingCategoryContext?.name}
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
        modifierGroups={modifierGroups || []}
        onOpenGlobalEdit={
          editingItem
            ? () => {
                setIsItemSheetOpen(false);
                router.push(`/dashboard/menu/items/${editingItem.id}/edit`);
              }
            : undefined
        }
        onSuccess={() => {
          setIsItemSheetOpen(false);
          setEditingItem(null);
          setEditingCategoryContext(null);
          queryClient.invalidateQueries({
            queryKey: ["categories-with-items"],
          });
          invalidateOrderOutSync(queryClient);
          refetch();
        }}
      />

      {/* Add Item to Category Wizard */}
      <AddItemToCategoryWizard
        open={isAddItemWizardOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsAddItemWizardOpen(false);
            setAddItemCategoryContext(null);
          }
        }}
        categoryId={addItemCategoryContext?.id || ""}
        categoryName={addItemCategoryContext?.name || ""}
        clerkOrgId={clerkOrgId || ""}
        existingItemIds={addItemCategoryContext?.existingItemIds || []}
        onSuccess={() => {
          setIsAddItemWizardOpen(false);
          setAddItemCategoryContext(null);
          queryClient.invalidateQueries({
            queryKey: ["categories-with-items"],
          });
          invalidateOrderOutSync(queryClient);
          refetch();
        }}
      />

      {/* Bulk price adjustment dialogs (L1/L2) */}
      <BulkPriceAdjustDialog
        open={bulkPriceOpen}
        onOpenChange={setBulkPriceOpen}
        clerkOrgId={clerkOrgId}
        selectedItems={Array.from(
          new Map(
            filteredCategories
              .flatMap((c) => c.items ?? [])
              .filter((it) => selectedItemIds.has(it.menu_item_id))
              .map((it) => [
                it.menu_item_id,
                {
                  id: it.menu_item_id,
                  name: it.menu_item.name,
                  effectivePrice: it.menu_item.effective_price,
                },
              ]),
          ).values(),
        )}
        currentLocationId={isAllLocations ? null : selectedLocationId ?? null}
        isAllLocations={isAllLocations}
        onSuccess={() => {
          exitSelectionMode();
          queryClient.invalidateQueries({ queryKey: ["categories-with-items"] });
          invalidateOrderOutSync(queryClient);
          refetch();
        }}
      />
      <BulkDeliveryPriceAdjustDialog
        open={bulkDeliveryOpen}
        onOpenChange={setBulkDeliveryOpen}
        clerkOrgId={clerkOrgId}
        selectedItems={Array.from(
          new Map(
            filteredCategories
              .flatMap((c) => c.items ?? [])
              .filter((it) => selectedItemIds.has(it.menu_item_id))
              .map((it) => [
                it.menu_item_id,
                {
                  id: it.menu_item_id,
                  name: it.menu_item.name,
                  cardPrice: it.menu_item.effective_price,
                  currentDeliveryPrice: it.menu_item.effective_delivery_price ?? null,
                },
              ]),
          ).values(),
        )}
        currentLocationId={isAllLocations ? null : selectedLocationId ?? null}
        isAllLocations={isAllLocations}
        onSuccess={() => {
          exitSelectionMode();
          queryClient.invalidateQueries({ queryKey: ["categories-with-items"] });
          invalidateOrderOutSync(queryClient);
          refetch();
        }}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deletingCategory}
        onOpenChange={(open) => !open && setDeletingCategory(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Delete Category
            </DialogTitle>
            <DialogDescription>
              {deletingCategory?.is_global ? (
                <>
                  Are you sure you want to delete the global category &quot;
                  {deletingCategory?.name}&quot;? This will remove it from all
                  locations and unlink all items from this category.
                  <span className="block mt-2 font-medium text-foreground">
                    This action cannot be undone.
                  </span>
                </>
              ) : (
                <>
                  Are you sure you want to delete the location-specific category
                  &quot;{deletingCategory?.name}&quot;? This will unlink all
                  items from this category at{" "}
                  {currentLocation?.name || "this location"}.
                  <span className="block mt-2 font-medium text-foreground">
                    This action cannot be undone.
                  </span>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingCategory(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Category
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Sub-components for Sortable Items
interface SortableCategoryItemRowProps {
  item: CategoryMenuItem;
  index: number;
  category: CategoryWithItems;
  isAllLocations: boolean;
  selectedLocationId: string | null;
  handleEditItem: (
    item: CategoryMenuItem,
    category: CategoryWithItems,
    e?: React.MouseEvent,
  ) => void;
  handleRemoveItemFromCategory: (
    categoryId: string,
    menuItemId: string,
    e?: React.MouseEvent,
  ) => void;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  isOrdering?: boolean;
}

function SortableCategoryItemRow({
  item,
  index,
  category,
  isAllLocations,
  selectedLocationId,
  handleEditItem,
  handleRemoveItemFromCategory,
  isSelectionMode = false,
  isSelected = false,
  onToggleSelect,
  isOrdering = false,
}: SortableCategoryItemRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.menu_item_id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        // Flat divided rows on the card surface, matching the menu detail
        // page's item list — no per-row fill, border, or rounding.
        "flex min-w-0 items-center gap-1.5 overflow-hidden px-1 py-3 transition-colors sm:gap-3 sm:px-2",
        isDragging
          ? "z-50 rounded-lg opacity-30 shadow-lg ring-2 ring-primary"
          : "hover:bg-muted/50",
        !item.menu_item.effective_availability && "opacity-60",
        isSelectionMode && isSelected && "bg-primary/5",
      )}
      onClick={(e) => {
        if (isSelectionMode) { onToggleSelect?.(); }
        else { handleEditItem(item, category, e); }
      }}
    >
      {/* Checkbox in selection mode */}
      {isSelectionMode && (
        <div
          className="flex-shrink-0"
          onClick={(e) => { e.stopPropagation(); onToggleSelect?.(); }}
        >
          <Checkbox checked={isSelected} />
        </div>
      )}
      {/* Drag handle — hidden in selection mode. On phones it only appears once
          "Order items" is chosen, and disappears again on "Done"; desktop keeps
          it always available. */}
      {!isSelectionMode && (
        <button
          {...attributes}
          {...listeners}
          className={cn(
            "items-center justify-center w-5 h-5 sm:w-7 sm:h-7 rounded hover:bg-muted cursor-grab active:cursor-grabbing touch-none shrink-0",
            isOrdering ? "flex" : "hidden sm:flex",
          )}
          onClick={(e) => e.stopPropagation()}
          aria-label="Drag to reorder"
        >
          <GripVertical className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
        </button>
      )}

      {/* Order Number — hidden on mobile */}
      <span className="hidden sm:flex items-center justify-center w-5 h-5 rounded-full bg-muted text-muted-foreground text-[10px] font-medium shrink-0">
        {index + 1}
      </span>

      {/* Item Image — desktop only */}
      <div className="hidden h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-muted/30 sm:block sm:h-12 sm:w-12">
        {isValidImageUrl(item.menu_item.image) ? (
          <img
            src={item.menu_item.image}
            alt={item.menu_item.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Utensils className="h-5 w-5 text-muted-foreground/50" />
          </div>
        )}
      </div>

      {/* Item Details — description is desktop only */}
      <div className="flex-1 min-w-0">
        <h5 className="font-medium text-sm truncate flex items-center gap-1">
          {item.menu_item.name}
          {item.is_featured && <Sparkles className="h-3 w-3 text-yellow-500" />}
        </h5>
        {item.menu_item.description && (
          <p className="hidden truncate text-xs text-muted-foreground sm:block">
            {item.menu_item.description}
          </p>
        )}
      </div>

      {/* Price with source indicator — desktop only */}
      <div className="hidden shrink-0 items-center gap-2 text-right sm:flex">
        <div className="flex flex-col items-end">
          <span className="font-semibold text-sm tabular-nums">
            ${item.menu_item.effective_price.toFixed(2)}
          </span>
          {item.menu_item.price_source !== "base" && (
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] px-1.5 py-0",
                item.menu_item.price_source === "category" &&
                  "text-green-600 border-green-200",
                item.menu_item.price_source === "location_item" &&
                  "text-blue-600 border-blue-200",
                item.menu_item.price_source === "location_category" &&
                  "text-purple-600 border-purple-200",
              )}
            >
              {item.menu_item.price_source === "category" && "Cat"}
              {item.menu_item.price_source === "location_item" && "Loc"}
              {item.menu_item.price_source === "location_category" && "L+C"}
            </Badge>
          )}
        </div>
        {!item.menu_item.effective_availability && (
          <Badge variant="secondary" className="text-xs">
            Off
          </Badge>
        )}
      </div>

      {/* Edit button — hidden on mobile (row itself is clickable), visible on sm+ */}
      {!isSelectionMode && (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="hidden sm:flex h-8 w-8 text-muted-foreground hover:text-primary"
              onClick={(e) => handleEditItem(item, category, e)}
            >
              <Edit2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Edit {isAllLocations ? "category" : "location"} state</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      )}

      {/* Remove button */}
      {!isSelectionMode && (() => {
        const canAddItems = isAllLocations
          ? category.is_global
          : category.location_id === selectedLocationId;

        if (!canAddItems) return null;

        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="hidden h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive sm:flex"
                  onClick={(e) =>
                    handleRemoveItemFromCategory(
                      category.id,
                      item.menu_item_id,
                      e,
                    )
                  }
                >
                  <X className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Remove from category</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      })()}

      {/* Mobile item actions — replaces the inline edit/remove icons. Hidden
          while ordering so the row stays focused on dragging. */}
      {!isSelectionMode && !isOrdering && (
        <div
          className="shrink-0 sm:hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full"
                aria-label={`Actions for ${item.menu_item.name}`}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="center"
              collisionPadding={12}
              className="w-40 p-0.5"
            >
              <DropdownMenuItem
                className="gap-2 px-2 py-1.5"
                onSelect={() => handleEditItem(item, category)}
              >
                <Edit2 className="h-4 w-4" />
                Edit item
              </DropdownMenuItem>
              {/* Opens the same item sheet as Edit — its Pricing tab is where
                  price lives. The sheet's tabs are uncontrolled, so it cannot
                  yet be deep-linked to that section. */}
              <DropdownMenuItem
                className="gap-2 px-2 py-1.5"
                onSelect={() => handleEditItem(item, category)}
              >
                <DollarSign className="h-4 w-4" />
                <span className="flex-1">Price</span>
                <span className="font-semibold tabular-nums">
                  ${item.menu_item.effective_price.toFixed(2)}
                </span>
              </DropdownMenuItem>
              {(() => {
                const canRemove = isAllLocations
                  ? category.is_global
                  : category.location_id === selectedLocationId;
                if (!canRemove) return null;
                return (
                  <>
                    <DropdownMenuSeparator className="my-0.5" />
                    <DropdownMenuItem
                      className="gap-2 px-2 py-1.5 text-destructive focus:text-destructive"
                      onSelect={() =>
                        handleRemoveItemFromCategory(
                          category.id,
                          item.menu_item_id,
                        )
                      }
                    >
                      <X className="h-4 w-4" />
                      Remove item
                    </DropdownMenuItem>
                  </>
                );
              })()}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}

function DragOverlayCategoryItemContent({
  item,
  index,
}: {
  item: CategoryMenuItem;
  index: number;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-background border shadow-xl ring-2 ring-primary">
      <div className="flex items-center justify-center w-7 h-7 rounded bg-muted shrink-0">
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>
      <span className="flex items-center justify-center w-5 h-5 rounded-full bg-muted text-muted-foreground text-[10px] font-medium shrink-0">
        {index + 1}
      </span>
      {/* Image and price mirror the row's own breakpoints — the overlay is a
          separate component, so it needs the same sm: gating or they reappear
          mid-drag on mobile. */}
      <div className="hidden h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-muted/30 sm:block">
        {isValidImageUrl(item.menu_item.image) ? (
          <img
            src={item.menu_item.image}
            alt={item.menu_item.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Utensils className="h-5 w-5 text-muted-foreground/50" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <h5 className="font-medium text-sm truncate">{item.menu_item.name}</h5>
        <span className="hidden text-sm font-semibold text-primary sm:inline">
          ${item.menu_item.effective_price.toFixed(2)}
        </span>
      </div>
    </div>
  );
}
