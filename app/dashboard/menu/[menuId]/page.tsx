"use client";

import { useParams, useRouter } from "next/navigation";
import React, { useState, useMemo, useEffect } from "react";
import { useMenuWithCategories } from "../../hooks/useMenu";
import { ScopeContextStrip } from "@/components/dashboard/menu/ScopeContextStrip";
import { useUserInfo } from "../../../manage/hooks/useUserInfo.";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Utensils,
  Clock,
  ArrowLeft,
  Trash2,
  ChevronDown,
  DollarSign,
  Truck,
  CheckSquare,
  CircleSlash,
  RotateCcw,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
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
import { invalidateOrderOutSync } from "@/app/dashboard/hooks/useOrderOutMenuSync";
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
import { useLocationStore, useGatedLocationId } from "@/stores/location-store";
import { MenuCategory, MenuCategoryItem } from "@/types/menu";
import { useCategoriesWithItems } from "../../hooks/useCategories";
import { useLocations } from "../../hooks/useLocations";
import { useModifierGroups } from "../../hooks/useModifierGroups";
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
import { BulkMenuPriceAdjustDialog } from "@/components/dashboard/menu/menuId/BulkMenuPriceAdjustDialog";
import { BulkMenuDeliveryPriceAdjustDialog } from "@/components/dashboard/menu/menuId/BulkMenuDeliveryPriceAdjustDialog";
import { MenuSchedulesTab } from "@/components/dashboard/menu/menuId/MenuSchedulesTab";
import { MenuSettingsTab } from "@/components/dashboard/menu/menuId/MenuSettingsTab";
import { MenuPreviewModal } from "@/components/dashboard/menu/menuId/MenuPreviewModal";
import { MenuOrderOutTab } from "@/components/dashboard/menu/menuId/MenuOrderOutTab";
import { useClerkOrgId } from "../../hooks/useLocationScoped";
import { useMenuSchedulesScoped } from "../../hooks/useMenuSchedules";
import { useMerchantCdnImageUpload } from "@/lib/cdn/use-merchant-cdn-image-upload";
import { useOrderOutStatus } from "../../online-ordering/hooks/useOrderOutStatus";
import {
  useOrderOutMenuSync,
  useMenuPayloadDiff,
  useOrderOutSyncAlerts,
} from "../../hooks/useOrderOutMenuSync";
import {
  useSnoozeItemsBatch,
  useRestoreItemsBatch,
  type SnoozeDuration,
} from "@/lib/queries/use-snoozes";
import { PageShell } from "@/components/dashboard/shell";
import { cn } from "@/lib/utils";

/**
 * Pill-rail tab trigger. Written out literally here rather than imported from
 * `tokens.ts` — Tailwind does not scan `.ts` files, so a class sourced only
 * from there would reach the DOM with no rule behind it (C7).
 */
const TAB_PILL =
  "shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border";

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
  // OrderOut is genuinely per-location. Resolve a concrete location via the
  // gated resolver so single-active-location accounts (locked to 'all' for
  // menu/item core scope) still get a real location id for OrderOut sync —
  // without changing the 'all'/core scope used by menu/item editing below.
  const orderOutLocationId = useGatedLocationId() ?? "";
  const { data: userInfo } = useUserInfo();
  const merchantId =
    userInfo?.members?.[0]?.organizations?.merchants?.id || "";
  const isAllLocations = !selectedLocationId || selectedLocationId === "all";
  const imageUpload = useMerchantCdnImageUpload({
    merchantId,
    category: "menus",
    fileNamePrefix: "menu",
  });
  // Categories for wizard selections
  const { data: categoriesWithItems } = useCategoriesWithItems(
    clerkOrgId || "",
    selectedLocationId,
  );
  const { data: modifierGroups } = useModifierGroups(clerkOrgId || "");

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
  const [editingSchedule, setEditingSchedule] = useState<
    (SchedulesModel & { schedule_time_slots: ScheduleTimeSlotsModel[] }) | null
  >(null);

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
  const [editedLocationId, setEditedLocationId] = useState<string | null>(null);
  const [hasSettingsChanges, setHasSettingsChanges] = useState(false);
  const [categoryViewMode, setCategoryViewMode] = useState<
    "list" | "grid" | "table"
  >("list");

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

  // Bulk selection state (categories tab only)
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [bulkMenuPriceOpen, setBulkMenuPriceOpen] = useState(false);
  const [bulkMenuDeliveryOpen, setBulkMenuDeliveryOpen] = useState(false);

  function handleToggleItem(itemId: string) {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  function handleToggleCategoryItems(categoryId: string, itemIds: string[]) {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (itemIds.length === 0) {
        // deselect all items from this category
        const cat = visibleCategories.find((c) => c.category_id === categoryId);
        cat?.items?.forEach((i) => next.delete(i.menu_item_id));
      } else {
        itemIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }

  function exitSelectionMode() {
    setIsSelectionMode(false);
    setSelectedItemIds(new Set());
  }

  // OrderOut
  const { data: orderOutStatus } = useOrderOutStatus(
    clerkOrgId,
    orderOutLocationId
  );
  const hasOrderOutRestaurant = !!orderOutStatus?.data?.hasRestaurant;
  // Show the tab whenever a concrete location resolves (gated) so users get
  // guidance even before they've connected OrderOut. Single-location accounts
  // resolve to their one location; multi-location on 'all' stays hidden.
  const showOrderOutTab = !!orderOutLocationId;

  // Surface out-of-band delivery-app sync failures (86 propagates async now).
  useOrderOutSyncAlerts(clerkOrgId, orderOutLocationId);

  // Batch 86 — one round-trip + one OrderOut resync for all selected items.
  const snoozeItemsBatch = useSnoozeItemsBatch();
  const restoreItemsBatch = useRestoreItemsBatch();

  // Sync status for OrderOut tab indicator
  const { data: syncStatusResult } = useOrderOutMenuSync(
    clerkOrgId,
    orderOutLocationId,
    menuId
  );
  const { data: diffResult } = useMenuPayloadDiff(
    clerkOrgId,
    orderOutLocationId,
    menuId
  );
  const syncData = syncStatusResult?.data;
  const diffData = diffResult?.data ?? null;
  const orderOutTabDot = (() => {
    if (!hasOrderOutRestaurant || !syncData?.lastSync) return null;
    if (syncData.lastSync.status === "failed") return "red";
    if (diffData?.hasChanges) return "amber";
    if (syncData.lastSync.status === "success") return "green";
    return null;
  })();

  // Initialize settings when menu loads (categories collapsed by default)
  useEffect(() => {
    if (menu) {
      setEditedName(menu.name);
      setEditedDescription(menu.description || "");
      setEditedLocationId(menu.location_id ?? null);
      imageUpload.reset(menu.image || null);
      setHasSettingsChanges(false);
      // Categories start collapsed for easier drag-and-drop reordering
    }
  }, [imageUpload.reset, menu]);

  // Check for settings changes
  useEffect(() => {
    if (menu) {
      const hasChanges =
        editedName !== menu.name ||
        editedDescription !== (menu.description || "") ||
        editedLocationId !== (menu.location_id ?? null) ||
        imageUpload.hasPendingChange;
      setHasSettingsChanges(hasChanges);
    }
  }, [editedDescription, editedName, editedLocationId, imageUpload.hasPendingChange, menu]);

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

  const collectSelected = () => {
    const selected = visibleCategories
      .flatMap((c) => c.items ?? [])
      .filter((it) => selectedItemIds.has(it.menu_item_id));
    const menuItemIds = Array.from(
      new Set(selected.map((it) => it.menu_item_id)),
    );
    const meta: Record<string, { name?: string; image?: string | null }> = {};
    for (const it of selected) {
      meta[it.menu_item_id] = {
        name: it.menu_item?.name,
        image: it.menu_item?.image,
      };
    }
    return { menuItemIds, meta };
  };

  const handleBulkSnooze = (duration: SnoozeDuration) => {
    if (!orderOutLocationId) {
      toast.error("Select a specific location to mark items out of stock");
      return;
    }
    const { menuItemIds, meta } = collectSelected();
    if (menuItemIds.length === 0) return;
    snoozeItemsBatch.mutate(
      { clerkOrgId, menuItemIds, locationId: orderOutLocationId, duration, meta },
      { onSuccess: (r) => r?.success && exitSelectionMode() },
    );
  };

  const handleBulkRestore = () => {
    if (!orderOutLocationId) {
      toast.error("Select a specific location to restore items");
      return;
    }
    const { menuItemIds } = collectSelected();
    if (menuItemIds.length === 0) return;
    restoreItemsBatch.mutate(
      { clerkOrgId, menuItemIds, locationId: orderOutLocationId },
      { onSuccess: (r) => r?.success && exitSelectionMode() },
    );
  };

  const totalSelectableItems = useMemo(
    () => visibleCategories.flatMap((c) => c.items ?? []).length,
    [visibleCategories],
  );

  function handleSelectAll() {
    const allIds = visibleCategories
      .flatMap((c) => c.items ?? [])
      .map((i) => i.menu_item_id);
    setSelectedItemIds(new Set(allIds));
  }

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
      // Delivery pricing
      delivery_price: priceLevels.level_1_delivery ?? null,
      effective_delivery_price: (mi as any).effective_delivery_price ?? null,
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
        // L2: global category price (category_items WHERE menu_id IS NULL)
        level_3_category: (item as any).custom_price ?? priceLevels.level_3_category ?? null,
        level_3_category_cash: (item as any).custom_cash_price ?? priceLevels.level_3_category_cash ?? null,
        // L4: global menu category price (category_items WHERE menu_id IS NOT NULL)
        level_3_menu_category: priceLevels.level_3_menu_category ?? null,
        level_3_menu_category_cash: priceLevels.level_3_menu_category_cash ?? null,
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
        // Delivery pricing levels
        level_1_delivery: priceLevels.level_1_delivery ?? null,
        level_2_location_item_delivery: priceLevels.level_2_location_item_delivery ?? null,
        level_3_category_delivery: priceLevels.level_3_category_delivery ?? null,
        level_3_menu_category_delivery: priceLevels.level_3_menu_category_delivery ?? null,
        level_4_location_category_delivery: priceLevels.level_4_location_category_delivery ?? null,
        level_5_location_menu_delivery: priceLevels.level_5_location_menu_delivery ?? null,
      },
      effective_price: mi.effective_price,
      effective_cash_price: mi.effective_cash_price,
      has_location_item_override: !!(mi as any).location_item_override,
      has_category_override: !!(item as any).custom_price,
      has_location_category_override: !!(mi as any).location_category_override,
      menu_item_modifier_groups: (mi as any).modifier_groups || [],
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
      invalidateOrderOutSync(queryClient);
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
      queryClient.invalidateQueries({
        queryKey: ["menu-schedules", menuId],
      });
      invalidateOrderOutSync(queryClient);
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
    let uploadedAsset: { cdnUrl: string; storagePath: string } | undefined;

    if (!hasSettingsChanges) return;
    if (imageUpload.hasPendingChange && !merchantId) {
      toast.error("Merchant Not Found", {
        description: "Please reload and try the upload again.",
      });
      return;
    }

    setIsSavingSettings(true);
    try {
      const resolvedImage = await imageUpload.resolveImageValue();
      uploadedAsset = resolvedImage.uploadedAsset;
      const result = await UpdateMenu(
        menuId,
        {
          name: editedName.trim(),
          description: editedDescription.trim() || undefined,
          image: resolvedImage.value ?? undefined,
          location_id: editedLocationId,
        },
        selectedLocationId || undefined,
      );

      if (result.error) {
        if (uploadedAsset) {
          await imageUpload.cleanupUploadedAsset(uploadedAsset.storagePath).catch(console.error);
        }
        toast.error("Save Failed", { description: result.error });
        return;
      }

      toast.success("Settings Saved", {
        description: "Menu settings have been updated.",
      });
      queryClient.invalidateQueries({
        queryKey: ["menu-with-categories", menuId],
      });
      invalidateOrderOutSync(queryClient);
      refetchMenu();
      setHasSettingsChanges(false);
    } catch {
      if (uploadedAsset) {
        await imageUpload.cleanupUploadedAsset(uploadedAsset.storagePath).catch(console.error);
      }
      toast.error("Save Failed", {
        description: "Unable to save settings. Please try again.",
      });
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Location-scoped menu schedule assignments (global + current-location rows).
  // Displayed in the Schedules tab; the full merchant/global schedule data still
  // comes from the menu RPC for other parts of the page.
  const {
    data: scopedMenuSchedules,
    isLoading: isLoadingScopedSchedules,
  } = useMenuSchedulesScoped(menuId);

  type TransformedSchedule = SchedulesModel & {
    schedule_time_slots: ScheduleTimeSlotsModel[];
    time_slots: Array<{
      id: string;
      day_of_week: number;
      start_time: string;
      end_time: string;
    }>;
    assignment_location_id: string | null;
  };

  const menuSchedules = useMemo<TransformedSchedule[]>(() => {
    if (!scopedMenuSchedules) return [];
    return scopedMenuSchedules.map((schedule) => {
      const timeSlots = schedule.schedule_time_slots || [];
      return {
        ...schedule,
        time_slots: timeSlots.map((ts) => ({
          id: ts.id,
          day_of_week: ts.day_of_week,
          start_time: ts.start_time,
          end_time: ts.end_time,
        })),
      } as TransformedSchedule;
    });
  }, [scopedMenuSchedules]);

  const locationNameById = useMemo(() => {
    const map: Record<string, string> = {};
    (locations || []).forEach((loc) => {
      if (loc.id) map[loc.id] = loc.name;
    });
    return map;
  }, [locations]);

  const scheduleScopeLabel = isAllLocations
    ? "Viewing all assignments. Add while a specific location is selected to scope the assignment."
    : "Showing global assignments (inherited) plus assignments for this location.";

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
      invalidateOrderOutSync(queryClient);
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
      selectedLocationId || undefined,
    );

    if (assignResult.error) {
      return { error: assignResult.error };
    }

    queryClient.invalidateQueries({
      queryKey: ["menu-with-categories", menuId],
    });
    queryClient.invalidateQueries({
      queryKey: ["menu-schedules", menuId],
    });
    invalidateOrderOutSync(queryClient);
    refetchMenu();

    return { data: createResult.data };
  };

  const handleAssignSchedule = async (scheduleId: string) => {
    const result = await AssignScheduleToMenu(
      menuId,
      scheduleId,
      clerkOrgId,
      selectedLocationId || undefined,
    );

    if (result.error) {
      return { error: result.error };
    }

    queryClient.invalidateQueries({
      queryKey: ["menu-with-categories", menuId],
    });
    queryClient.invalidateQueries({
      queryKey: ["menu-schedules", menuId],
    });
    invalidateOrderOutSync(queryClient);
    refetchMenu();

    return {};
  };

  const handleRemoveSchedule = async (
    scheduleId: string,
    assignmentLocationId: string | null,
  ) => {
    try {
      const result = await RemoveScheduleFromMenu(
        menuId,
        scheduleId,
        assignmentLocationId || undefined,
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
      queryClient.invalidateQueries({
        queryKey: ["menu-schedules", menuId],
      });
      invalidateOrderOutSync(queryClient);
      refetchMenu();
    } catch {
      toast.error("Remove Failed", {
        description: "Unable to remove the schedule. Please try again.",
      });
    }
  };

  const handleEditSchedule = (
    schedule: SchedulesModel & { schedule_time_slots: ScheduleTimeSlotsModel[] },
  ) => {
    setEditingSchedule(schedule);
    setIsScheduleSheetOpen(true);
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
      invalidateOrderOutSync(queryClient);
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
      invalidateOrderOutSync(queryClient);
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

    // index is relative to visible (active-only) categories — resolve to full list positions
    const currentVisible = hasCategoryOrderChanges
      ? reorderedCategories.filter((c) => c.is_active)
      : sortedCategories.filter((c) => c.is_active);

    if (index >= currentVisible.length) return;

    const categoryToMove = currentVisible[index];
    const categoryAbove = currentVisible[index - 1];

    const idxInFull = reorderedCategories.findIndex((c) => c.category_id === categoryToMove.category_id);
    const idxAboveInFull = reorderedCategories.findIndex((c) => c.category_id === categoryAbove.category_id);

    if (idxInFull === -1 || idxAboveInFull === -1) return;

    const newOrder = reorderedCategories.map((c) => ({ ...c }));
    [newOrder[idxAboveInFull], newOrder[idxInFull]] = [newOrder[idxInFull], newOrder[idxAboveInFull]];
    newOrder.forEach((category, idx) => {
      category.display_order = idx + 1;
    });

    setReorderedCategories(newOrder);
    setHasCategoryOrderChanges(true);
  };

  const handleMoveCategoryDown = (index: number) => {
    // index is relative to visible (active-only) categories — resolve to full list positions
    const currentVisible = hasCategoryOrderChanges
      ? reorderedCategories.filter((c) => c.is_active)
      : sortedCategories.filter((c) => c.is_active);

    if (index >= currentVisible.length - 1) return;

    const categoryToMove = currentVisible[index];
    const categoryBelow = currentVisible[index + 1];

    const idxInFull = reorderedCategories.findIndex((c) => c.category_id === categoryToMove.category_id);
    const idxBelowInFull = reorderedCategories.findIndex((c) => c.category_id === categoryBelow.category_id);

    if (idxInFull === -1 || idxBelowInFull === -1) return;

    const newOrder = reorderedCategories.map((c) => ({ ...c }));
    [newOrder[idxInFull], newOrder[idxBelowInFull]] = [newOrder[idxBelowInFull], newOrder[idxInFull]];
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
      invalidateOrderOutSync(queryClient);
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
      invalidateOrderOutSync(queryClient);
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
      invalidateOrderOutSync(queryClient);
      refetchMenu();
    } catch {
      toast.error("Remove Failed", {
        description: "Unable to remove category. Please try again.",
      });
    }
  };

  if (isLoading) {
    return (
      <PageShell>
        <div className="animate-in fade-in duration-500">
          <Skeleton className="h-10 w-64" />
        </div>
        <Skeleton className="h-96 w-full rounded-3xl" />
      </PageShell>
    );
  }

  if (!menu) {
    return (
      <PageShell>
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
      </PageShell>
    );
  }

  //TODO: Handle editing location specific menu settings should follow location scope rulings
  //TODO: Handle editing location specific menu categories should follow location scope rulings
  //TODO: Handle switching between location to location should send you back to menu

  return (
    <PageShell>
      <ScopeContextStrip menuName={menu?.name ?? null} />
      <MenuHeader
        menu={menu}
        locationName={menu.location_id ? locations?.find(l => l.id === menu.location_id)?.name : null}
        onBack={() => router.back()}
        onNavigateToMenus={() => router.push("/dashboard/menu")}
        onPreview={() => setIsPreviewOpen(true)}
      />

      <Tabs defaultValue="overview" className="space-y-4">
        {/* Pill rail, not underline tabs. Classes are literal, not {TOKEN} — see C7. */}
        <div className="w-full min-w-0 overflow-x-auto pb-1">
        <TabsList className="inline-flex h-auto w-max flex-nowrap gap-0.5 rounded-full bg-muted/70 p-1">
          <TabsTrigger value="overview" className={TAB_PILL}>Overview</TabsTrigger>
          <TabsTrigger value="categories" className={cn(TAB_PILL, "gap-1.5")}>
            Categories &amp; Items
            {enrichedCategories.length > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                {enrichedCategories.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="schedules" className={cn(TAB_PILL, "gap-1.5")}>
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
          <TabsTrigger value="settings" className={TAB_PILL}>Settings</TabsTrigger>
          {showOrderOutTab && (
            <TabsTrigger value="orderout" className={cn(TAB_PILL, "gap-1.5")}>
              OrderOut
              {orderOutTabDot && (
                <span
                  className={`h-2 w-2 rounded-full ${
                    orderOutTabDot === "green"
                      ? "bg-green-500"
                      : orderOutTabDot === "amber"
                        ? "bg-amber-500"
                        : "bg-red-500"
                  }`}
                />
              )}
            </TabsTrigger>
          )}
        </TabsList>
        </div>

        <TabsContent value="overview" className="space-y-4">
          <MenuOverviewTab
            categoriesCount={enrichedCategories.length}
            totalItems={totalItems}
            menuSchedules={menuSchedules}
          />
        </TabsContent>

        <TabsContent value="categories" className="space-y-4">
          {/* Sticky selection bar — matches items-page pattern */}
          {isSelectionMode && (
            <div className="sticky top-0 z-20 mb-4 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border-0 bg-primary/5 px-4 py-2.5 backdrop-blur">
              <Badge variant="secondary" className="shrink-0 text-xs">
                {selectedItemIds.size} of {totalSelectableItems} selected
              </Badge>
              <div className="hidden h-4 w-px bg-border sm:block" />
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
              <div className="flex shrink-0 items-center gap-2 sm:ml-auto">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm"
                      className="h-8 gap-1 rounded-full"
                      disabled={selectedItemIds.size === 0}
                    >
                      Bulk edit
                      <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setBulkMenuPriceOpen(true)}>
                      <DollarSign className="h-4 w-4 mr-2" />
                      Adjust card price…
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setBulkMenuDeliveryOpen(true)}>
                      <Truck className="h-4 w-4 mr-2" />
                      Adjust online (delivery) price…
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <CircleSlash className="h-4 w-4 mr-2" />
                        Mark out of stock (86)
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        <DropdownMenuItem
                          onClick={() => handleBulkSnooze({ kind: "hours", hours: 1 })}
                        >
                          For 1 hour
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleBulkSnooze({ kind: "hours", hours: 4 })}
                        >
                          For 4 hours
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleBulkSnooze({ kind: "end_of_day" })}
                        >
                          Until end of day
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleBulkSnooze({ kind: "until_manual" })}
                        >
                          Until I turn it back on
                        </DropdownMenuItem>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuItem
                      onClick={handleBulkRestore}
                      className="text-green-700"
                    >
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Restore (back in stock)
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
            // Selection
            isSelectionMode={isSelectionMode}
            selectedItemIds={selectedItemIds}
            onToggleItem={handleToggleItem}
            onToggleCategoryItems={handleToggleCategoryItems}
            selectedCount={selectedItemIds.size}
            onToggleSelectionMode={() =>
              isSelectionMode ? exitSelectionMode() : setIsSelectionMode(true)
            }
          />
        </TabsContent>

        <TabsContent value="schedules" className="space-y-4">
          <MenuSchedulesTab
            menuSchedules={menuSchedules}
            isLoading={isLoading || isLoadingScopedSchedules}
            scopeLabel={scheduleScopeLabel}
            locationNameById={locationNameById}
            onAddSchedule={() => setIsScheduleWizardOpen(true)}
            onOpenScheduleSheet={() => setIsScheduleSheetOpen(true)}
            onRemoveSchedule={handleRemoveSchedule}
            onEditSchedule={handleEditSchedule}
          />
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <MenuSettingsTab
            menu={menu}
            categoriesCount={enrichedCategories.length}
            totalItems={totalItems}
            editedName={editedName}
            editedDescription={editedDescription}
            editedLocationId={editedLocationId}
            hasSettingsChanges={hasSettingsChanges}
            imagePreviewUrl={imageUpload.previewUrl}
            isImageUploading={imageUpload.isUploading}
            isTogglingActive={isTogglingActive}
            isSavingSettings={isSavingSettings}
            selectedImageFileName={imageUpload.selectedFileName}
            selectedLocationId={selectedLocationId}
            locations={locations ?? []}
            onClearImage={imageUpload.clear}
            onImageSelect={imageUpload.selectFile}
            onNameChange={setEditedName}
            onDescriptionChange={setEditedDescription}
            onLocationChange={setEditedLocationId}
            onToggleActive={handleToggleMenuActive}
            onSaveSettings={handleSaveSettings}
            onCancelSettings={() => {
              setEditedName(menu.name);
              setEditedDescription(menu.description || "");
              setEditedLocationId(menu.location_id ?? null);
              imageUpload.reset(menu.image || null);
              setHasSettingsChanges(false);
            }}
            onDeleteMenu={() => setIsDeleteDialogOpen(true)}
          />
        </TabsContent>

        {showOrderOutTab && (
          <TabsContent value="orderout" className="space-y-4">
            <MenuOrderOutTab
              menuId={menuId}
              locationId={orderOutLocationId}
              clerkOrgId={clerkOrgId}
              menuName={menu.name}
              isConfigured={hasOrderOutRestaurant}
            />
          </TabsContent>
        )}
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
        menuName={menu?.name}
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
        modifierGroups={modifierGroups || []}
        isMenuLocationOwned={!!menu?.is_location_owned}
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
            queryKey: ["menu-with-categories", menuId],
          });
          invalidateOrderOutSync(queryClient);
          refetchMenu();
        }}
      />

      {/* Schedule Form Sheet */}
      <ScheduleFormSheet
        open={isScheduleSheetOpen || !!editingSchedule}
        onOpenChange={(open) => {
          setIsScheduleSheetOpen(open);
          if (!open) setEditingSchedule(null);
        }}
        mode={editingSchedule ? "edit" : "create"}
        editSchedule={editingSchedule}
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

      {/* Bulk menu card-price adjustment (L5) */}
      <BulkMenuPriceAdjustDialog
        open={bulkMenuPriceOpen}
        onOpenChange={setBulkMenuPriceOpen}
        clerkOrgId={clerkOrgId}
        menuId={menuId}
        currentLocationId={
          isAllLocations ? null : selectedLocationId ?? null
        }
        isAllLocations={isAllLocations}
        selectedItems={visibleCategories
          .flatMap((c) => c.items ?? [])
          .filter((it) => selectedItemIds.has(it.menu_item_id))
          .map((it) => ({
            id: it.menu_item_id,
            name: it.menu_item?.name ?? "",
            effectivePrice: it.menu_item?.effective_price ?? 0,
          }))}
        onSuccess={() => {
          exitSelectionMode();
          queryClient.invalidateQueries({
            queryKey: ["menu-with-categories", menuId],
          });
          invalidateOrderOutSync(queryClient);
          refetchMenu();
        }}
      />

      {/* Bulk menu delivery-price adjustment (L5) */}
      <BulkMenuDeliveryPriceAdjustDialog
        open={bulkMenuDeliveryOpen}
        onOpenChange={setBulkMenuDeliveryOpen}
        clerkOrgId={clerkOrgId}
        menuId={menuId}
        currentLocationId={
          isAllLocations ? null : selectedLocationId ?? null
        }
        isAllLocations={isAllLocations}
        selectedItems={visibleCategories
          .flatMap((c) => c.items ?? [])
          .filter((it) => selectedItemIds.has(it.menu_item_id))
          .map((it) => ({
            id: it.menu_item_id,
            name: it.menu_item?.name ?? "",
            cardPrice: it.menu_item?.effective_price ?? 0,
            currentDeliveryPrice: it.menu_item?.effective_delivery_price ?? null,
          }))}
        onSuccess={() => {
          exitSelectionMode();
          queryClient.invalidateQueries({
            queryKey: ["menu-with-categories", menuId],
          });
          invalidateOrderOutSync(queryClient);
          refetchMenu();
        }}
      />

    </PageShell>
  );
}
