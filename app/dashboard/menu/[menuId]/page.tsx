"use client";

import { useParams, useRouter } from "next/navigation";
import React, { useState, useMemo, useEffect } from "react";
import { useMenuWithCategories } from "../../hooks/useMenu";
import { useUserInfo } from "../../../manage/hooks/useUserInfo.";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Utensils,
  Tag,
  Calendar,
  Clock,
  Wand2,
  ArrowLeft,
  Trash2,
  Save,
  Info,
  Tablet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DeleteMenu, UpdateMenu, ToggleMenuActive } from "../../actions/menus";
import {
  ToggleCategoryInMenu,
  RemoveLocationMenuCategoryOverride,
  UpdateLocationMenuCategoryOverride,
} from "../../actions/categories";
import { UpdateLocationMenuCategoriesOrder } from "../../actions/item-assignments";
import {
  CreateSchedule,
  AssignScheduleToMenu,
  RemoveScheduleFromMenu,
} from "../../actions/schedules";
import { useQueryClient } from "@tanstack/react-query";
import { Empty } from "@/components/ui/empty";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScheduleFormSheet } from "@/components/dashboard/menu/ScheduleFormSheet";
import { SchedulesModel, ScheduleTimeSlotsModel } from "@/types/db-modles";
import { useLocationStore } from "@/stores/location-store";
import { MenuCategory, MenuCategoryItem } from "@/types/menu";
import { useCategoriesWithItems } from "../../hooks/useCategories";
import { useLocations } from "../../hooks/useLocations";
import {
  NewEditItemFormSheet,
  EditItemWithOverrides,
} from "@/components/dashboard/menu/NewEditItemFormSheet";
import { AddCategoryToMenuWizard } from "@/components/dashboard/menu/AddCategoryToMenuWizard";
import {
  Dialog as SheetDialog,
  DialogContent as SheetContent,
  DialogHeader as SheetHeader,
  DialogTitle as SheetTitle,
  DialogDescription as SheetDescription,
  DialogFooter as SheetFooter,
} from "@/components/ui/dialog";
import { CategorySection } from "@/components/dashboard/menu/menuId/CategorySection";
import { MenuHeader } from "@/components/dashboard/menu/menuId/MenuHeader";
import { MenuOverviewTab } from "@/components/dashboard/menu/menuId/MenuOverviewTab";
import { MenuCategoriesTab } from "@/components/dashboard/menu/menuId/MenuCategoriesTab";
import { MenuSchedulesTab } from "@/components/dashboard/menu/menuId/MenuSchedulesTab";
import { MenuSettingsTab } from "@/components/dashboard/menu/menuId/MenuSettingsTab";
import { MenuPreviewModal } from "@/components/dashboard/menu/menuId/MenuPreviewModal";
import { useClerkOrgId } from "../../hooks/useLocationScoped";

export default function MenuDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const clerkOrgId = useClerkOrgId() || "";
  const menuId = params.menuId as string;
  const {
    data: menu,
    isLoading,
    refetch: refetchMenu,
  } = useMenuWithCategories(menuId);
  console.log("menu", menu);
  const { selectedLocationId } = useLocationStore();
  const { data: userInfo } = useUserInfo();
  const isAllLocations = !selectedLocationId || selectedLocationId === "all";
  // Categories for wizard selections
  const { data: categoriesWithItems } = useCategoriesWithItems(
    clerkOrgId || "",
    selectedLocationId,
  );

  // Locations for mapping location_id to location name
  const { data: locations } = useLocations(
    clerkOrgId || "",
    userInfo?.id || "",
  );

  // Track expanded categories
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(),
  );

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isScheduleSheetOpen, setIsScheduleSheetOpen] = useState(false);
  const [isCategoryWizardOpen, setIsCategoryWizardOpen] = useState(false);
  const [isScheduleWizardOpen, setIsScheduleWizardOpen] = useState(false);

  // Schedule wizard
  const [scheduleWizardId, setScheduleWizardId] = useState<string | null>(null);
  const [isSavingScheduleWizard, setIsSavingScheduleWizard] = useState(false);

  // Item editing within menu-category context
  const [editingItem, setEditingItem] = useState<EditItemWithOverrides | null>(
    null,
  );
  const [isItemSheetOpen, setIsItemSheetOpen] = useState(false);
  const [editingCategoryContext, setEditingCategoryContext] = useState<{
    id: string;
    name: string;
  } | null>(null);

  // Settings state
  const [isTogglingActive, setIsTogglingActive] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [editedDescription, setEditedDescription] = useState("");
  const [hasSettingsChanges, setHasSettingsChanges] = useState(false);
  const [categoryViewMode, setCategoryViewMode] = useState<"list" | "table">(
    "list",
  );

  const [reorderedCategories, setReorderedCategories] = useState<
    MenuCategory[]
  >([]);
  const [hasCategoryOrderChanges, setHasCategoryOrderChanges] = useState(false);
  const [isSavingCategoryOrder, setIsSavingCategoryOrder] = useState(false);

  // Item ordering state - track reordered items per category
  const [reorderedItemsMap, setReorderedItemsMap] = useState<
    Map<string, MenuCategoryItem[]>
  >(new Map());
  const [itemOrderChanges, setItemOrderChanges] = useState<
    Map<string, boolean>
  >(new Map());
  const [savingItemOrderFor, setSavingItemOrderFor] = useState<string | null>(
    null,
  );

  // Preview modal state
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  // Initialize settings when menu loads (categories collapsed by default)
  useEffect(() => {
    if (menu) {
      setEditedName(menu.name);
      setEditedDescription(menu.description || "");
      setHasSettingsChanges(false);
      // Categories start collapsed for easier drag-and-drop reordering
    }
  }, [menu]);

  // Check for settings changes
  useEffect(() => {
    if (menu) {
      const hasChanges =
        editedName !== menu.name ||
        editedDescription !== (menu.description || "");
      setHasSettingsChanges(hasChanges);
    }
  }, [editedName, editedDescription, menu]);

  const allCategories = menu?.categories || [];

  // Filter categories based on location scoping:
  // - When viewing all locations: show all categories (global + location-specific)
  // - When viewing a specific location: show only global categories (location_id = null) + that location's categories
  const filteredCategories = useMemo(() => {
    if (isAllLocations) {
      // Show all categories when viewing all locations
      return allCategories;
    }

    // When viewing a specific location, only show:
    // 1. Global categories (location_id is null or undefined)
    // 2. Categories specific to this location (location_id === selectedLocationId)
    return allCategories.filter((cat) => {
      const categoryLocationId = cat.category?.location_id;
      return !categoryLocationId || categoryLocationId === selectedLocationId;
    });
  }, [allCategories, isAllLocations, selectedLocationId]);

  // Enrich categories with location names
  const enrichedCategories = useMemo(() => {
    return filteredCategories.map((cat) => {
      const categoryLocationId = cat.category?.location_id;
      const location = categoryLocationId
        ? locations?.find((l) => l.id === categoryLocationId)
        : null;

      return {
        ...cat,
        category: {
          ...cat.category,
          location_id: categoryLocationId,
          location_name: location?.name || null,
        },
      };
    });
  }, [filteredCategories, locations]);

  // Sort categories by display_order
  const sortedCategories = useMemo(() => {
    return [...enrichedCategories].sort((a, b) => {
      const aOrder = a.display_order ?? 999999;
      const bOrder = b.display_order ?? 999999;
      return aOrder - bOrder;
    });
  }, [enrichedCategories]);

  // Use reordered categories if there are unsaved changes, otherwise use sorted categories
  const displayCategories = hasCategoryOrderChanges
    ? reorderedCategories
    : sortedCategories;

  const hiddenCategories = displayCategories.filter((c) => !c.is_active);
  const visibleCategories = displayCategories.filter((c) => c.is_active);

  // Initialize reordered categories when categories load
  useEffect(() => {
    if (
      sortedCategories.length > 0 &&
      reorderedCategories.length === 0 &&
      !hasCategoryOrderChanges
    ) {
      setReorderedCategories(sortedCategories);
    }
  }, [sortedCategories, reorderedCategories.length, hasCategoryOrderChanges]);

  const mapMenuCategoryItemToEdit = (
    category: MenuCategory,
    item: MenuCategoryItem,
    menuId: string,
  ): EditItemWithOverrides => {
    const mi = item.menu_item;
    const priceLevels = (mi as any).price_levels || {};
    return {
      id: mi.id,
      name: mi.name,
      description: mi.description || undefined,
      price:
        (mi as any).price ??
        priceLevels.level_1_base ??
        mi.effective_price ??
        0,
      cash_price:
        (mi as any).cash_price ??
        priceLevels.level_1_cash ??
        mi.effective_cash_price ??
        null,
      image: mi.image || undefined,
      availability: mi.effective_availability ?? true,
      allergens: mi.allergens ?? [],
      card_bg_color: mi.card_bg_color ?? undefined,
      category_items: [
        { id: category.category_id, name: category.category?.name || "" },
      ],
      price_levels: {
        level_1_base: (mi as any).price ?? priceLevels.level_1_base ?? 0,
        level_1_cash:
          (mi as any).cash_price ?? priceLevels.level_1_cash ?? null,
        level_2_location_item:
          (mi as any).location_item_override?.custom_price ??
          priceLevels.level_2_location_item ??
          null,
        level_2_location_item_cash:
          (mi as any).location_item_override?.custom_cash_price ??
          priceLevels.level_2_location_item_cash ??
          null,
        level_2_modifier: priceLevels.level_2_modifier ?? null,
        level_2_modifier_type: null,
        level_3_category: (item as any).custom_price ?? null,
        level_3_category_cash: (item as any).custom_cash_price ?? null,
        level_4_location_category:
          (mi as any).location_category_override?.custom_price ??
          priceLevels.level_4_location_category ??
          null,
        level_4_location_category_cash:
          (mi as any).location_category_override?.custom_cash_price ??
          priceLevels.level_4_location_category_cash ??
          null,
        level_5_location_menu:
          (mi as any).location_menu_override?.custom_price ??
          priceLevels.level_5_location_menu ??
          null,
        level_5_location_menu_cash:
          (mi as any).location_menu_override?.custom_cash_price ??
          priceLevels.level_5_location_menu_cash ??
          null,
      },
      effective_price: mi.effective_price,
      effective_cash_price: mi.effective_cash_price,
      has_location_item_override: !!(mi as any).location_item_override,
      has_category_override: !!(item as any).custom_price,
      has_location_category_override: !!(mi as any).location_category_override,
    };
  };

  const toggleCategory = (categoryId: string) => {
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
    const allIds = new Set(menu?.categories?.map((c) => c.id) || []);
    setExpandedCategories(allIds);
  };

  const collapseAllCategories = () => {
    setExpandedCategories(new Set());
  };

  const handleEditMenuItem = (
    item: MenuCategoryItem,
    category: MenuCategory,
  ) => {
    const mapped = mapMenuCategoryItemToEdit(category, item, menuId);
    setEditingCategoryContext({
      id: category.category_id,
      name: category.category?.name || "",
    });
    setEditingItem(mapped);
    setIsItemSheetOpen(true);
  };

  const handleToggleMenuActive = async () => {
    setIsTogglingActive(true);
    try {
      const result = await ToggleMenuActive(
        menuId,
        selectedLocationId || undefined,
      );
      if (result.error) {
        toast.error("Update Failed", { description: result.error });
        return;
      }
      toast.success(menu?.is_active ? "Menu Deactivated" : "Menu Activated", {
        description: menu?.is_active
          ? "This menu is now hidden from customers."
          : "This menu is now visible to customers.",
      });
      queryClient.invalidateQueries({
        queryKey: ["menu-with-categories", menuId],
      });
      refetchMenu();
    } catch {
      toast.error("Update Failed", {
        description: "Unable to update menu status. Please try again.",
      });
    } finally {
      setIsTogglingActive(false);
    }
  };

  const handleAddScheduleToMenu = async () => {
    if (!scheduleWizardId) {
      toast.error("Select a schedule");
      return;
    }
    setIsSavingScheduleWizard(true);
    try {
      console.log("clerkOrgId", clerkOrgId);
      const result = await AssignScheduleToMenu(
        menuId,
        scheduleWizardId,
        clerkOrgId,
        selectedLocationId || undefined,
      );
      if ((result as any)?.error) {
        toast.error("Add Failed", { description: (result as any).error });
        return;
      }
      toast.success("Schedule Added", {
        description: "Schedule attached to this menu.",
      });
      queryClient.invalidateQueries({
        queryKey: ["menu-with-categories", menuId],
      });
      refetchMenu();
      setIsScheduleWizardOpen(false);
      setScheduleWizardId(null);
    } catch {
      toast.error("Add Failed", { description: "Unable to add schedule" });
    } finally {
      setIsSavingScheduleWizard(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!hasSettingsChanges) return;

    setIsSavingSettings(true);
    try {
      const result = await UpdateMenu(
        menuId,
        {
          name: editedName.trim(),
          description: editedDescription.trim() || undefined,
        },
        selectedLocationId || undefined,
      );

      if (result.error) {
        toast.error("Save Failed", { description: result.error });
        return;
      }

      toast.success("Settings Saved", {
        description: "Menu settings have been updated.",
      });
      queryClient.invalidateQueries({
        queryKey: ["menu-with-categories", menuId],
      });
      refetchMenu();
      setHasSettingsChanges(false);
    } catch {
      toast.error("Save Failed", {
        description: "Unable to save settings. Please try again.",
      });
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Extract menu schedules from the menu data and transform to expected format
  type TransformedSchedule = SchedulesModel & {
    schedule_time_slots: ScheduleTimeSlotsModel[];
    time_slots: Array<{
      id: string;
      day_of_week: number;
      start_time: string;
      end_time: string;
    }>;
  };

  const menuSchedules = useMemo(() => {
    if (!menu) return [];
    const scheduleData = menu.schedules || [];
    return scheduleData
      .map((ms) => {
        const schedule = ms.schedule;
        if (!schedule) return null;
        const timeSlots = schedule.time_slots || [];
        return {
          ...schedule,
          merchant_id: menu.merchant_id,
          created_at: schedule.id,
          updated_at: schedule.id,
          time_slots: timeSlots,
          schedule_time_slots: timeSlots.map((ts) => ({
            ...ts,
            schedule_id: schedule.id,
            is_active: true,
            created_at: ts.id,
            updated_at: ts.id,
          })),
        } as TransformedSchedule;
      })
      .filter(Boolean) as TransformedSchedule[];
  }, [menu]);

  // Calculate total items across all categories
  const totalItems = useMemo(() => {
    if (!menu?.categories) return 0;
    return menu.categories.reduce(
      (sum, cat) => sum + (cat.items?.length || 0),
      0,
    );
  }, [menu?.categories]);

  const handleDeleteMenu = async () => {
    setIsDeleting(true);
    try {
      const result = await DeleteMenu(menuId, selectedLocationId || undefined);
      if (result.error) {
        toast.error("Delete Failed", {
          description: result.error,
        });
        return;
      }
      toast.success("Menu Deleted", {
        description: `"${menu?.name}" has been permanently deleted.`,
      });
      queryClient.invalidateQueries({ queryKey: ["menus"] });
      router.push("/dashboard/menu");
    } catch {
      toast.error("Delete Failed", {
        description: "Unable to delete the menu. Please try again.",
      });
    } finally {
      setIsDeleting(false);
      setIsDeleteDialogOpen(false);
    }
  };

  const handleCreateSchedule = async (data: {
    name: string;
    description?: string;
    time_slots: Array<{
      day_of_week: number;
      start_time: string;
      end_time: string;
    }>;
  }) => {
    if (!clerkOrgId) {
      return { error: "Organization not found" };
    }

    const createResult = await CreateSchedule(clerkOrgId, {
      name: data.name,
      description: data.description,
      time_slots: data.time_slots,
    });

    if (createResult.error || !createResult.data) {
      return { error: createResult.error || "Failed to create schedule" };
    }

    const assignResult = await AssignScheduleToMenu(
      menuId,
      createResult.data.id,
      clerkOrgId,
    );

    if (assignResult.error) {
      return { error: assignResult.error };
    }

    queryClient.invalidateQueries({
      queryKey: ["menu-with-categories", menuId],
    });
    refetchMenu();

    return { data: createResult.data };
  };

  const handleAssignSchedule = async (scheduleId: string) => {
    const result = await AssignScheduleToMenu(menuId, scheduleId, clerkOrgId);

    if (result.error) {
      return { error: result.error };
    }

    queryClient.invalidateQueries({
      queryKey: ["menu-with-categories", menuId],
    });
    refetchMenu();

    return {};
  };

  const handleRemoveSchedule = async (scheduleId: string) => {
    try {
      const result = await RemoveScheduleFromMenu(
        menuId,
        scheduleId,
        selectedLocationId || undefined,
      );

      if (result.error) {
        toast.error("Remove Failed", { description: result.error });
        return;
      }

      toast.success("Schedule Removed", {
        description: "The schedule has been removed from this menu.",
      });

      queryClient.invalidateQueries({
        queryKey: ["menu-with-categories", menuId],
      });
      refetchMenu();
    } catch {
      toast.error("Remove Failed", {
        description: "Unable to remove the schedule. Please try again.",
      });
    }
  };

  // Handle toggling category visibility
  const handleToggleCategoryVisibility = async (
    categoryId: string,
    isActive: boolean,
  ) => {
    try {
      const result = await ToggleCategoryInMenu(
        menuId,
        categoryId,
        isActive,
        selectedLocationId === "all" ? null : selectedLocationId,
      );

      if (result.error) {
        toast.error("Update Failed", { description: result.error });
        return;
      }

      toast.success(isActive ? "Category Shown" : "Category Hidden", {
        description: isActive
          ? "This category is now visible in the menu."
          : "This category is now hidden from the menu.",
      });

      queryClient.invalidateQueries({
        queryKey: ["menu-with-categories", menuId],
      });
      refetchMenu();
    } catch {
      toast.error("Update Failed", {
        description: "Unable to update category visibility. Please try again.",
      });
    }
  };

  // Handle resetting category override to global
  const handleResetCategoryOverride = async (categoryId: string) => {
    if (!selectedLocationId || selectedLocationId === "all") return;

    try {
      const result = await RemoveLocationMenuCategoryOverride(
        selectedLocationId,
        menuId,
        categoryId,
      );

      if (result.error) {
        toast.error("Reset Failed", { description: result.error });
        return;
      }

      toast.success("Reset Complete", {
        description: "Category settings have been reset to global defaults.",
      });

      queryClient.invalidateQueries({
        queryKey: ["menu-with-categories", menuId],
      });
      refetchMenu();
    } catch {
      toast.error("Reset Failed", {
        description: "Unable to reset category settings. Please try again.",
      });
    }
  };

  // Category reorder handlers
  const handleMoveCategoryUp = (index: number) => {
    if (index === 0) return;

    const newOrder = [...reorderedCategories];
    const temp = newOrder[index];
    newOrder[index] = newOrder[index - 1];
    newOrder[index - 1] = temp;

    // Update display_order values
    newOrder.forEach((category, idx) => {
      category.display_order = idx + 1;
    });

    setReorderedCategories(newOrder);
    setHasCategoryOrderChanges(true);
  };

  const handleMoveCategoryDown = (index: number) => {
    if (index === reorderedCategories.length - 1) return;

    const newOrder = [...reorderedCategories];
    const temp = newOrder[index];
    newOrder[index] = newOrder[index + 1];
    newOrder[index + 1] = temp;

    // Update display_order values
    newOrder.forEach((category, idx) => {
      category.display_order = idx + 1;
    });

    setReorderedCategories(newOrder);
    setHasCategoryOrderChanges(true);
  };

  const handleSaveCategoryOrder = async () => {
    setIsSavingCategoryOrder(true);
    try {
      const categoryOrders = reorderedCategories.map((category, index) => ({
        categoryId: category.category_id,
        displayOrder: index + 1,
      }));

      // Use location-based ordering - it falls back to global if no location selected
      const result = await UpdateLocationMenuCategoriesOrder(
        selectedLocationId === "all" ? null : selectedLocationId,
        menuId,
        categoryOrders,
      );

      if (result.error) {
        toast.error("Save Failed", {
          description: result.error,
        });
        return;
      }

      toast.success("Order Saved", {
        description:
          selectedLocationId && selectedLocationId !== "all"
            ? "Category display order has been updated for this location."
            : "Category display order has been updated globally.",
      });

      await queryClient.invalidateQueries({
        queryKey: ["menu-with-categories", menuId],
      });
      await refetchMenu();

      // Update the reordered state to reflect the saved order as the "new baseline"
      const updatedCategories = reorderedCategories.map((cat, index) => ({
        ...cat,
        display_order: index + 1,
      }));
      setReorderedCategories(updatedCategories);

      setHasCategoryOrderChanges(false);
    } catch (error) {
      toast.error("Save Failed", {
        description: "Unable to save category order. Please try again.",
      });
    } finally {
      setIsSavingCategoryOrder(false);
    }
  };

  // Handle resetting category order to global defaults
  const handleResetCategoryOrder = () => {
    if (menu?.categories) {
      const sorted = [...menu.categories].sort(
        (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0),
      );
      setReorderedCategories(sorted);
      setHasCategoryOrderChanges(false);
    }
  };

  // Handle category order change from drag-and-drop
  const handleCategoryOrderChange = (newCategories: MenuCategory[]) => {
    setReorderedCategories(newCategories);
    setHasCategoryOrderChanges(true);
  };

  // Handle item order change within a category
  const handleItemOrderChange = (
    categoryId: string,
    items: MenuCategoryItem[],
  ) => {
    setReorderedItemsMap((prev) => {
      const newMap = new Map(prev);
      newMap.set(categoryId, items);
      return newMap;
    });
    setItemOrderChanges((prev) => {
      const newMap = new Map(prev);
      newMap.set(categoryId, true);
      return newMap;
    });
  };

  // Handle saving item order for a category
  const handleSaveItemOrder = async (categoryId: string) => {
    setSavingItemOrderFor(categoryId);
    try {
      const { UpdateLocationCategoryItemsOrder } =
        await import("../../actions/item-assignments");

      const items = reorderedItemsMap.get(categoryId);
      if (!items) return;

      const itemOrders = items.map((item, index) => ({
        menuItemId: item.menu_item_id,
        displayOrder: index + 1,
      }));

      const result = await UpdateLocationCategoryItemsOrder(
        selectedLocationId === "all" ? null : selectedLocationId,
        menuId,
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

      await queryClient.invalidateQueries({
        queryKey: ["menu-with-categories", menuId],
      });
      await refetchMenu();

      // Update local state to reflect saved changes
      setReorderedItemsMap((prev) => {
        const newMap = new Map(prev);
        const savedItems = newMap.get(categoryId);
        if (savedItems) {
          const updatedItems = savedItems.map((item, idx) => ({
            ...item,
            display_order: idx + 1,
          }));
          newMap.set(categoryId, updatedItems);
        }
        return newMap;
      });

      // Clear changes for this category
      setItemOrderChanges((prev) => {
        const newMap = new Map(prev);
        newMap.delete(categoryId);
        return newMap;
      });
      // We do NOT delete from reorderedItemsMap because we want to keep showing the new order
    } catch (error) {
      toast.error("Save Failed", {
        description: "Unable to save item order. Please try again.",
      });
    } finally {
      setSavingItemOrderFor(null);
    }
  };

  // Handle resetting item order for a category
  const handleResetItemOrder = (categoryId: string) => {
    setItemOrderChanges((prev) => {
      const newMap = new Map(prev);
      newMap.delete(categoryId);
      return newMap;
    });
    setReorderedItemsMap((prev) => {
      const newMap = new Map(prev);
      newMap.delete(categoryId);
      return newMap;
    });
  };

  const handleRemoveCategory = async (categoryId: string) => {
    try {
      const { RemoveCategoryFromMenu } =
        await import("../../actions/categories");
      const result = await RemoveCategoryFromMenu(menuId, categoryId);

      if (result.error) {
        toast.error("Remove Failed", { description: result.error });
        return;
      }

      toast.success("Category Removed", {
        description: "The category has been removed from this menu.",
      });

      queryClient.invalidateQueries({
        queryKey: ["menu-with-categories", menuId],
      });
      refetchMenu();
    } catch {
      toast.error("Remove Failed", {
        description: "Unable to remove category. Please try again.",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!menu) {
    return (
      <div className="space-y-6">
        <Empty
          icon={Utensils}
          title="Menu not found"
          description="The menu you're looking for doesn't exist or has been deleted."
          action={
            <Button onClick={() => router.push("/dashboard/menu")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Menus
            </Button>
          }
        />
      </div>
    );
  }

  //TODO: Handle editing location specific menu settings should follow location scope rulings
  //TODO: Handle editing location specific menu categories should follow location scope rulings
  //TODO: Handle switching between location to location should send you back to menu

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <MenuHeader
        menu={menu}
        onBack={() => router.back()}
        onNavigateToMenus={() => router.push("/dashboard/menu")}
        onPreview={() => setIsPreviewOpen(true)}
      />

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="categories" className="flex items-center gap-1.5">
            Categories & Items
            {enrichedCategories.length > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                {enrichedCategories.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="schedules" className="flex items-center gap-1.5">
            Schedules
            {menuSchedules.length > 0 && (
              <Badge
                variant="secondary"
                className="h-5 w-5 p-0 text-xs flex items-center justify-center"
              >
                {menuSchedules.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <MenuOverviewTab
            categoriesCount={enrichedCategories.length}
            totalItems={totalItems}
            menuSchedules={menuSchedules}
          />
        </TabsContent>

        <TabsContent value="categories" className="space-y-4">
          <MenuCategoriesTab
            visibleCategories={
              hasCategoryOrderChanges
                ? reorderedCategories.filter((c) => c.is_active)
                : visibleCategories
            }
            hiddenCategories={hiddenCategories}
            expandedCategories={expandedCategories}
            selectedLocationId={selectedLocationId}
            menuId={menuId}
            isMenuLocationOwned={menu?.is_location_owned}
            onToggleCategory={toggleCategory}
            onExpandAll={expandAllCategories}
            onCollapseAll={collapseAllCategories}
            onItemClick={(itemId) =>
              router.push(`/dashboard/menu/items/${itemId}`)
            }
            onToggleVisibility={handleToggleCategoryVisibility}
            onResetOverride={handleResetCategoryOverride}
            onEditItem={handleEditMenuItem}
            onAddCategory={() => setIsCategoryWizardOpen(true)}
            onNavigateToCategories={() =>
              router.push("/dashboard/menu/categories")
            }
            refetchMenu={refetchMenu}
            categoryViewMode={categoryViewMode}
            onViewModeChange={setCategoryViewMode}
            onMoveCategoryUp={handleMoveCategoryUp}
            onMoveCategoryDown={handleMoveCategoryDown}
            onSaveCategoryOrder={handleSaveCategoryOrder}
            onCategoryOrderChange={handleCategoryOrderChange}
            onResetCategoryOrder={handleResetCategoryOrder}
            hasCategoryOrderChanges={hasCategoryOrderChanges}
            isSavingCategoryOrder={isSavingCategoryOrder}
            onRemoveCategory={handleRemoveCategory}
            // Item ordering
            onItemOrderChange={handleItemOrderChange}
            onSaveItemOrder={handleSaveItemOrder}
            onResetItemOrder={handleResetItemOrder}
            itemOrderChanges={itemOrderChanges}
            savingItemOrderFor={savingItemOrderFor}
            reorderedItemsMap={reorderedItemsMap}
          />
        </TabsContent>

        <TabsContent value="schedules" className="space-y-4">
          <MenuSchedulesTab
            menuSchedules={menuSchedules}
            isLoading={isLoading}
            onAddSchedule={() => setIsScheduleWizardOpen(true)}
            onOpenScheduleSheet={() => setIsScheduleSheetOpen(true)}
            onRemoveSchedule={handleRemoveSchedule}
          />
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <MenuSettingsTab
            menu={menu}
            categoriesCount={enrichedCategories.length}
            totalItems={totalItems}
            editedName={editedName}
            editedDescription={editedDescription}
            hasSettingsChanges={hasSettingsChanges}
            isTogglingActive={isTogglingActive}
            isSavingSettings={isSavingSettings}
            selectedLocationId={selectedLocationId}
            onNameChange={setEditedName}
            onDescriptionChange={setEditedDescription}
            onToggleActive={handleToggleMenuActive}
            onSaveSettings={handleSaveSettings}
            onCancelSettings={() => {
              setEditedName(menu.name);
              setEditedDescription(menu.description || "");
            }}
            onDeleteMenu={() => setIsDeleteDialogOpen(true)}
          />
        </TabsContent>
      </Tabs>

      {/* Delete Menu Confirmation */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Delete Menu
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{menu.name}&quot;? This
              action cannot be undone. All category associations will be removed
              from this menu.
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
              onClick={handleDeleteMenu}
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
                  Delete Menu
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Category Wizard */}
      <AddCategoryToMenuWizard
        open={isCategoryWizardOpen}
        onOpenChange={setIsCategoryWizardOpen}
        menuId={menuId}
        menuName={menu?.name}
        menu={menu}
        userRole={userInfo?.members?.[0]?.role}
        categoriesWithItems={categoriesWithItems?.data || []}
        onSuccess={() => {
          refetchMenu();
        }}
      />

      {/* Schedule Wizard */}
      <SheetDialog
        open={isScheduleWizardOpen}
        onOpenChange={setIsScheduleWizardOpen}
      >
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Add Schedule to Menu</SheetTitle>
            <SheetDescription>
              Attach an existing schedule to control availability.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Schedule ID</Label>
              <Input
                value={scheduleWizardId ?? ""}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setScheduleWizardId(e.target.value)
                }
                placeholder="Schedule UUID"
              />
            </div>
          </div>
          <SheetFooter className="mt-4">
            <Button
              variant="outline"
              onClick={() => setIsScheduleWizardOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddScheduleToMenu}
              disabled={isSavingScheduleWizard}
              className="gap-2"
            >
              {isSavingScheduleWizard && (
                <Clock className="h-4 w-4 animate-spin" />
              )}
              Add Schedule
            </Button>
          </SheetFooter>
        </SheetContent>
      </SheetDialog>

      {/* Item edit in menu-category context */}
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
        menuId={menuId}
        categories={(menu?.categories || []).map((c) => ({
          id: c.category_id,
          name: c.category?.name || "",
          description: c.category?.description || null,
          is_active: c.is_active,
          display_order: c.display_order,
          merchant_id: menu?.merchant_id || "",
          menu_id: menu?.id,
          image: (c.category as any)?.image || null,
          created_at: menu?.created_at || "",
          updated_at: menu?.updated_at || "",
        }))}
        modifierGroups={[]}
        onSuccess={() => {
          setIsItemSheetOpen(false);
          setEditingItem(null);
          setEditingCategoryContext(null);
          queryClient.invalidateQueries({
            queryKey: ["menu-with-categories", menuId],
          });
          refetchMenu();
        }}
      />

      {/* Schedule Form Sheet */}
      <ScheduleFormSheet
        open={isScheduleSheetOpen}
        onOpenChange={setIsScheduleSheetOpen}
        onAssignSchedule={handleAssignSchedule}
      />

      {/* Menu Preview Modal */}
      <MenuPreviewModal
        open={isPreviewOpen}
        onOpenChange={setIsPreviewOpen}
        menu={menu}
        locationName={
          selectedLocationId && selectedLocationId !== "all"
            ? locations?.find((l) => l.id === selectedLocationId)?.name
            : undefined
        }
      />
    </div>
  );
}
