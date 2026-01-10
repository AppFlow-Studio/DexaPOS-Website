"use client";

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
  ChevronUp,
  ExternalLink,
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
} from "lucide-react";
import { useState, useMemo } from "react";
import {
  useCategories,
  useCategoriesWithItems,
} from "../../hooks/useCategories";
import { useMenus } from "../../hooks/useMenus";
import { useSchedules } from "../../hooks/useSchedules";
import { useLocations } from "../../hooks/useLocations";
import { useUserInfo } from "../../../manage/hooks/useUserInfo.";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/ui/empty";
import { CategoryFormSheet } from "@/components/dashboard/menu/CategoryFormSheet";
import {
  DeleteCategory,
  RemoveItemFromCategory,
  UpdateLocationCategoryOverride,
  RemoveLocationCategoryOverride,
} from "../../actions/categories";
import { GetMenuItemsByCategory } from "../../actions/menu-items";
import { useLocationStore } from "@/stores/location-store";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { CategoriesModel, MenuItemsModel } from "@/types/db-modles";
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
import { ScrollArea } from "@/components/ui/scroll-area";
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

  // Primary data source: RPC with full category + items data
  const {
    data: categoriesWithItems,
    isLoading: loadingCategoriesWithItems,
    refetch,
  } = useCategoriesWithItems(clerkOrgId || "", selectedLocationId);
  const { data: menus } = useMenus(clerkOrgId || "");
  const { data: locations } = useLocations(
    clerkOrgId || "",
    userInfo?.id || ""
  );

  const currentLocation = locations?.find((l) => l.id === selectedLocationId);

  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false);
  const [editingCategory, setEditingCategory] =
    useState<CategoryWithItems | null>(null);
  const [deletingCategory, setDeletingCategory] =
    useState<CategoryWithItems | null>(null);
  const [expandedCategoryId, setExpandedCategoryId] = useState<string | null>(
    null
  );
  const [togglingCategories, setTogglingCategories] = useState<Set<string>>(
    new Set()
  );

  // Item editing state
  const [editingItem, setEditingItem] = useState<EditItemWithOverrides | null>(
    null
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
    new Set()
  );
  const [savingItemOrderFor, setSavingItemOrderFor] = useState<string | null>(
    null
  );
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Use RPC data as primary source
  const categoriesList: CategoryWithItems[] = categoriesWithItems?.data || [];
  const menusList = Array.isArray(menus) ? menus : [];
  const isLoading = loadingCategoriesWithItems;

  const filteredCategories = categoriesList.filter(
    (category) =>
      category.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      category.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Stats from RPC data
  const totalItems = categoriesList.reduce(
    (acc, c) => acc + (c.item_count || 0),
    0
  );
  const activeCategories = categoriesList.filter((c) =>
    isAllLocations ? c.is_active : c.effective_is_active
  ).length;
  const categoriesWithOverrides = categoriesList.filter(
    (c) => c.location_override !== null
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
    categoryName: string
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
    },
    effective_price: item.menu_item.effective_price,
    effective_cash_price: item.menu_item.effective_cash_price,
    has_location_item_override: !!item.menu_item.location_item_override,
    has_category_override: item.category_price !== null,
    has_location_category_override: !!item.menu_item.location_category_override,
  });

  // Handle toggling category visibility at location level
  const handleToggleCategoryAtLocation = async (
    categoryId: string,
    isActive: boolean
  ) => {
    if (isAllLocations || !selectedLocationId) return;

    setTogglingCategories((prev) => new Set(prev).add(categoryId));

    try {
      const result = await UpdateLocationCategoryOverride(
        selectedLocationId,
        categoryId,
        { isActive }
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
        categoryId
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
      const result = await DeleteCategory(deletingCategory.id);
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
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    setEditingCategory(category);
  };

  const handleNavigateToItem = (itemId: string) => {
    router.push(`/dashboard/menu/items/${itemId}`);
  };

  const handleRemoveItemFromCategory = async (
    categoryId: string,
    menuItemId: string,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    try {
      const result = await RemoveItemFromCategory(categoryId, menuItemId);
      if (result.error) {
        toast.error("Remove Failed", { description: result.error });
        return;
      }
      toast.success("Item Removed", {
        description: "Item has been removed from the category.",
      });
      queryClient.invalidateQueries({ queryKey: ["categories-with-items"] });
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
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    setEditingCategoryContext({ id: category.id, name: category.name });
    setEditingItem(mapCategoryItemToEditItem(item, category.id, category.name));
    setIsItemSheetOpen(true);
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleOrderChange = (
    categoryId: string,
    updatedItems: CategoryMenuItem[]
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
        (item) => item.menu_item_id === active.id
      );
      const newIndex = currentItems.findIndex(
        (item) => item.menu_item_id === over.id
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
        itemOrders
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
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight">Categories</h2>
            {/* Location scope indicator */}
            <Badge
              variant={isAllLocations ? "secondary" : "default"}
              className={cn(
                "gap-1.5 animate-in fade-in slide-in-from-left-2 duration-300",
                !isAllLocations &&
                  "bg-blue-500/10 text-blue-600 border-blue-200"
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
          </div>
          <p className="text-muted-foreground">
            {isAllLocations
              ? "Manage global categories for your menus"
              : `Customize categories for ${
                  currentLocation?.name || "this location"
                }`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isAllLocations && (
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
            {isAllLocations ? (
              <Globe className="h-4 w-4" />
            ) : (
              <MapPin className="h-4 w-4" />
            )}
            Create {isAllLocations ? "Global" : "Location"} Category
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
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="transition-all hover:shadow-md">
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
        <Card className="transition-all hover:shadow-md">
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
        <Card className="transition-all hover:shadow-md">
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
        <Card className="transition-all hover:shadow-md">
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
                isAllLocations ? "text-purple-600" : "text-amber-600"
              )}
            >
              {isAllLocations
                ? categoriesList.reduce(
                    (acc, c) => acc + (c.menu_count || 0),
                    0
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
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>All Categories</CardTitle>
              <CardDescription>
                Click a category to see its items
              </CardDescription>
            </div>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search categories..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 w-64"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
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

                return (
                  <Card
                    key={category.id}
                    className={cn(
                      "transition-all animate-in fade-in slide-in-from-bottom-4 overflow-hidden",
                      isExpanded
                        ? "ring-2 ring-primary shadow-lg"
                        : "hover:shadow-md hover:border-primary/30 cursor-pointer"
                    )}
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    {/* Category Header */}
                    <div
                      className={cn(
                        "p-4 cursor-pointer transition-colors",
                        isExpanded && "bg-muted/30"
                      )}
                      onClick={() => handleCategoryClick(category)}
                    >
                      <div className="flex items-start gap-4">
                        {/* Icon/Image */}
                        {category.image ? (
                          <div className="h-16 w-16 rounded-lg overflow-hidden bg-muted shrink-0">
                            <img
                              src={category.image}
                              alt={category.name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ) : (
                          <div
                            className={cn(
                              "h-16 w-16 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                              isExpanded
                                ? "bg-primary/20"
                                : "bg-primary/10 group-hover:bg-primary/20"
                            )}
                          >
                            <Tag className="h-8 w-8 text-primary" />
                          </div>
                        )}

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h3
                                className={cn(
                                  "font-semibold transition-colors truncate",
                                  isExpanded && "text-primary"
                                )}
                              >
                                {category.name}
                              </h3>
                              {category.description && (
                                <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                                  {category.description}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {/* Location visibility toggle */}
                              {!isAllLocations && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div
                                        className="flex items-center gap-2"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <Switch
                                          checked={category.effective_is_active}
                                          onCheckedChange={(checked) =>
                                            handleToggleCategoryAtLocation(
                                              category.id,
                                              checked
                                            )
                                          }
                                          disabled={togglingCategories.has(
                                            category.id
                                          )}
                                        />
                                        {category.effective_is_active ? (
                                          <Eye className="h-4 w-4 text-green-500" />
                                        ) : (
                                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                                        )}
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>
                                        {category.effective_is_active
                                          ? "Hide"
                                          : "Show"}{" "}
                                        at this location
                                      </p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}

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
                                              category.id
                                            );
                                          }}
                                          disabled={togglingCategories.has(
                                            category.id
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

                              <div
                                className={cn(
                                  "p-1 rounded-full transition-colors",
                                  isExpanded
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-muted"
                                )}
                              >
                                {isExpanded ? (
                                  <ChevronUp className="h-4 w-4" />
                                ) : (
                                  <ChevronDown className="h-4 w-4" />
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 mt-3 flex-wrap">
                            {/* Active status - use effective value when viewing location */}
                            <Badge
                              variant={
                                (
                                  isAllLocations
                                    ? category.is_active
                                    : category.effective_is_active
                                )
                                  ? "default"
                                  : "secondary"
                              }
                              className="text-xs"
                            >
                              {(
                                isAllLocations
                                  ? category.is_active
                                  : category.effective_is_active
                              )
                                ? "Active"
                                : "Inactive"}
                            </Badge>

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

                            {/* Location override indicator */}
                            {!isAllLocations && category.location_override && (
                              <Badge
                                variant="outline"
                                className="text-xs bg-amber-50 text-amber-600 border-amber-200"
                              >
                                <Settings2 className="h-3 w-3 mr-1" />
                                Customized
                              </Badge>
                            )}
                            {category.location_id === null && (
                              <Badge
                                variant="outline"
                                className="text-xs bg-green-50 text-green-600 border-green-200"
                              >
                                <Globe className="h-3 w-3 mr-1" />
                                Global
                              </Badge>
                            )}
                            {category.location_id !== null && (
                              <Badge
                                variant="outline"
                                className="text-xs bg-purple-50 text-purple-600 border-purple-200"
                              >
                                <MapPin className="h-3 w-3 mr-1" />
                                {category.location_name}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Expanded Items Section */}
                    {isExpanded && (
                      <div className="border-t bg-muted/10 animate-in slide-in-from-top-2">
                        <div className="p-4">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="text-sm font-medium flex items-center gap-2">
                              <Utensils className="h-4 w-4" />
                              Items in this category
                              {!isAllLocations && (
                                <Badge variant="outline" className="text-xs">
                                  Location Pricing
                                </Badge>
                              )}
                            </h4>
                            <div className="flex items-center gap-2">
                              {/* Add Item Button - Only when scoping allows */}
                              {(() => {
                                // Global categories: can only add when viewing all locations
                                // Location categories: can only add when viewing that location
                                const canAddItems = isAllLocations
                                  ? category.is_global
                                  : category.location_id === selectedLocationId;

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
                                      className="gap-1"
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
                                          className="gap-1 opacity-50"
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
                                    <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/20 border-dashed animate-in fade-in slide-in-from-top-2">
                                      <div className="flex items-center gap-2">
                                        <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                                        <p className="text-sm font-medium text-primary">
                                          Item order changed
                                          {!isAllLocations && (
                                            <span className="ml-1 text-xs font-normal opacity-70">
                                              (Specific to this location)
                                            </span>
                                          )}
                                        </p>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() =>
                                            handleResetItemOrder(category.id)
                                          }
                                          disabled={
                                            savingItemOrderFor === category.id
                                          }
                                          className="h-8 text-xs"
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
                                          className="h-8 text-xs gap-1.5"
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
                                      <ScrollArea className="space-y-2 flex flex-col max-h-[500px]">
                                        {(
                                          reorderedItemsMap.get(category.id) ||
                                          categoryItems
                                        ).map(
                                          (
                                            item: CategoryMenuItem,
                                            itemIndex: number
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
                                            />
                                          )
                                        )}
                                      </ScrollArea>
                                    </SortableContext>
                                    <DragOverlay>
                                      {activeId && (
                                        <DragOverlayCategoryItemContent
                                          item={
                                            (
                                              reorderedItemsMap.get(
                                                category.id
                                              ) || categoryItems
                                            ).find(
                                              (i) => i.menu_item_id === activeId
                                            )!
                                          }
                                          index={(
                                            reorderedItemsMap.get(
                                              category.id
                                            ) || categoryItems
                                          ).findIndex(
                                            (i) => i.menu_item_id === activeId
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
        }))}
        modifierGroups={[]}
        onSuccess={() => {
          setIsItemSheetOpen(false);
          setEditingItem(null);
          setEditingCategoryContext(null);
          queryClient.invalidateQueries({
            queryKey: ["categories-with-items"],
          });
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
    e: React.MouseEvent
  ) => void;
  handleRemoveItemFromCategory: (
    categoryId: string,
    menuItemId: string,
    e: React.MouseEvent
  ) => void;
}

function SortableCategoryItemRow({
  item,
  index,
  category,
  isAllLocations,
  selectedLocationId,
  handleEditItem,
  handleRemoveItemFromCategory,
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
        "flex items-center gap-3 p-3 my-1 rounded-lg bg-background border transition-all",
        isDragging
          ? "opacity-30 shadow-lg z-50 ring-2 ring-primary"
          : "hover:shadow-sm hover:border-primary/30",
        !item.menu_item.effective_availability && "opacity-60"
      )}
      onClick={(e) => handleEditItem(item, category, e)}
    >
      {/* Drag Handle */}
      <button
        {...attributes}
        {...listeners}
        className="flex items-center justify-center w-7 h-7 rounded hover:bg-muted cursor-grab active:cursor-grabbing touch-none shrink-0"
        onClick={(e) => e.stopPropagation()}
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </button>

      {/* Order Number */}
      <span className="flex items-center justify-center w-5 h-5 rounded-full bg-muted text-muted-foreground text-[10px] font-medium shrink-0">
        {index + 1}
      </span>

      {/* Item Image */}
      <div className="w-12 h-12 rounded-lg overflow-hidden bg-muted/30 shrink-0">
        {item.menu_item.image && item.menu_item.image.includes("http") ? (
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

      {/* Item Details */}
      <div className="flex-1 min-w-0">
        <h5 className="font-medium text-sm truncate flex items-center gap-1">
          {item.menu_item.name}
          {item.is_featured && <Sparkles className="h-3 w-3 text-yellow-500" />}
        </h5>
        {item.menu_item.description && (
          <p className="text-xs text-muted-foreground truncate">
            {item.menu_item.description}
          </p>
        )}
      </div>

      {/* Price with source indicator */}
      <div className="text-right shrink-0 flex items-center gap-2">
        <div className="flex flex-col items-end">
          <span className="font-semibold text-sm text-primary">
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
                  "text-purple-600 border-purple-200"
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

      {/* Edit button */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-primary"
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

      {/* Remove button */}
      {(() => {
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
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={(e) =>
                    handleRemoveItemFromCategory(
                      category.id,
                      item.menu_item_id,
                      e
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
      <ExternalLink className="h-4 w-4 text-muted-foreground" />
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
      <div className="w-12 h-12 rounded-lg overflow-hidden bg-muted/30 shrink-0">
        {item.menu_item.image && item.menu_item.image.includes("http") ? (
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
        <span className="font-semibold text-sm text-primary">
          ${item.menu_item.effective_price.toFixed(2)}
        </span>
      </div>
    </div>
  );
}
