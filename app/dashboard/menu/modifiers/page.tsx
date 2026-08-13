"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty } from "@/components/ui/empty";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  Search,
  Layers,
  ChevronDown,
  Loader2,
  Trash2,
  Edit3,
  Globe,
  MapPin,
  Filter,
  ListPlus,
  FolderPlus,
  GripVertical,
  MoreHorizontal,
  RotateCcw,
  Utensils,
  SlidersHorizontal,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  PageShell,
  PageHeader,
  Panel,
  StatRow,
  StatTile,
  LocationIndicator,
} from "@/components/dashboard/shell";
import {
  modifierScopeStyle,
  COUNT_BADGE_STYLE,
  LINKED_ITEM_BADGE_STYLE,
  OVERRIDE_BADGE_STYLE,
} from "@/lib/constants/menu-item-badges";
import { useModifierGroups } from "@/app/dashboard/hooks/useModifierGroups";
import { invalidateOrderOutSync } from "@/app/dashboard/hooks/useOrderOutMenuSync";
import { useUserInfo } from "@/app/manage/hooks/useUserInfo.";
import { useSelectedLocation, useLocationStore } from "@/stores/location-store";
import { ModifierGroupFormSheet } from "@/components/dashboard/menu/ModifierGroupFormSheet";
import { AssignModifierToItemsDialog } from "@/components/dashboard/menu/modifiers/AssignModifierToItemsDialog";
import { AssignModifierToCategoryDialog } from "@/components/dashboard/menu/modifiers/AssignModifierToCategoryDialog";
import { SortableModifierItemList } from "@/components/dashboard/menu/modifiers/SortableModifierItemList";
import {
  DeleteModifierGroup,
  CreateModifierGroupItem,
  UpdateModifierGroupItem,
  DeleteModifierGroupItem,
  ReorderModifierGroups,
  ReorderModifierGroupItems,
} from "@/app/dashboard/actions/modifier-groups";
import {
  updateModifierGroup,
  updateModifierItem,
} from "@/app/dashboard/actions/menu-items-rpc";
import {
  UpsertLocationModifierGroupOverride,
  DeleteLocationModifierGroupOverride,
  DeleteLocationModifierItemOverride,
} from "@/app/dashboard/actions/location-modifier-overrides";
import {
  ModifierGroupItemsModel,
  ModifierGroupsModel,
} from "@/types/db-modles";

interface ModifierGroupWithItems extends ModifierGroupsModel {
  is_active?: boolean;
  modifier_group_items?: (ModifierGroupItemsModel & {
    location_override?: Array<{
      id: string;
      price_modifier: number | null;
      is_active: boolean | null;
      location_id: string;
      stock_tracking_mode?: string | null;
      current_stock?: number | null;
    }> | null;
  })[];
  menu_item_modifier_groups?: Array<{
    id: string;
    menu_item?: { id: string; name: string };
  }>;
  location_item_modifier_groups?: Array<{
    id: string;
    location_id: string;
    location?: { id: string; name: string };
    menu_item?: { id: string; name: string };
  }>;
  category_modifier_groups?: Array<{
    id: string;
    location_id?: string | null;
    category?: { id: string; name: string };
  }>;
  location_override?: Array<{
    id: string;
    is_active: boolean;
    location_id: string;
    display_order?: number | null;
  }>;
}

type ItemDraft = {
  price?: number | null;
  isActive?: boolean;
  isDefault?: boolean;
  name?: string;
  description?: string;
  isSaving?: boolean;
};

/**
 * The badge shell shared by every tag on this page — the same soft-tint,
 * borderless pill the Item Library uses (DS-CTL-09). Written literally rather
 * than imported from a `.ts` constant because Tailwind only scans `.tsx` (C7).
 *
 * This replaces the `<Badge variant="outline" className="bg-emerald-50 …">`
 * triples that used to be written inline at nine call sites here: those had no
 * `dark:` variant, so every badge on this page rendered as a near-white block
 * on the dark dashboard.
 */
const BADGE_SHELL =
  "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium";

/**
 * A neutral count/scope pill.
 *
 * The `dot` prop is accepted and ignored: these badges carry no colour coding
 * any more, so a coloured dot would be the only hue left on the pill — exactly
 * the decoration the neutral pass removed. Kept in the signature so the call
 * sites that still pass it stay valid.
 */
function Tag({
  style,
  className,
  children,
}: {
  style: { bg: string; text: string; dot: string };
  dot?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span className={cn(BADGE_SHELL, style.bg, style.text, className)}>
      {children}
    </span>
  );
}

/**
 * Human wording for a group's selection rules.
 *
 * These columns (`is_required`, `min_selections`, `max_selections`) were always
 * fetched but never shown, which made the option list unreadable: three options
 * all flagged "Default" is correct for a multi-select group and a data error for
 * a single-select one, and nothing on screen said which this was.
 */
function selectionRuleLabel(group: {
  is_required?: boolean | null;
  min_selections?: number | null;
  max_selections?: number | null;
}): string {
  const min = group.min_selections ?? 0;
  const max = group.max_selections ?? null;
  const required = !!group.is_required || min > 0;

  if (max === 1 && required) return "Required · choose 1";
  if (max === 1) return "Choose 1";
  if (max === null) return required ? `Required · choose ${min}+` : "Choose any";
  if (min > 0 && min === max) return `Choose exactly ${min}`;
  if (min > 0) return `Choose ${min}–${max}`;
  return `Choose up to ${max}`;
}

/** A group that allows exactly one selection can only have one default. */
function isSingleSelect(group: { max_selections?: number | null }) {
  return group.max_selections === 1;
}

function SortableGroupWrapper({
  id,
  canReorder,
  isOrdering,
  children,
}: {
  id: string;
  canReorder: boolean;
  /** Mobile reorder mode. Desktop always shows the grip; phones opt in. */
  isOrdering: boolean;
  children: (dragHandle: React.ReactNode, isDragging: boolean) => React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: !canReorder });
  const style = { transform: CSS.Transform.toString(transform), transition };
  // The grip costs 28px of a 320px row. On phones it only appears once the
  // merchant chooses "Reorder"; desktop keeps it always available. Mirrors
  // the category page's item rows.
  const handle = canReorder ? (
    <button
      {...attributes}
      {...listeners}
      className={cn(
        "h-7 w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded hover:bg-muted active:cursor-grabbing",
        isOrdering ? "flex" : "hidden sm:flex",
      )}
      aria-label="Drag to reorder"
    >
      <GripVertical className="h-4 w-4 text-muted-foreground" />
    </button>
  ) : null;
  return (
    <div ref={setNodeRef} style={style} className={cn("min-w-0", isDragging && "opacity-50 z-50")}>
      {children(handle, isDragging)}
    </div>
  );
}

export default function ModifiersPage() {
  const { data: userInfo } = useUserInfo();
  const clerkOrgId = userInfo?.members?.[0]?.organizations?.id;
  const merchantId =
    userInfo?.members?.[0]?.organizations?.merchants?.id || "";
  const queryClient = useQueryClient();

  const selectedLocation = useSelectedLocation();
  // Use raw store ID (UUID or 'all') so it's available even before locations array hydrates
  const rawLocationId = useLocationStore((s) => s.selectedLocationId);
  const selectedLocationId = rawLocationId === "all" ? null : (rawLocationId || null);
  const isAllLocations = !selectedLocationId;

  const { data: modifierGroups, isLoading } = useModifierGroups(
    clerkOrgId,
    selectedLocationId,
  );

  /**
   * Search is debounced: `searchInput` echoes the keystroke instantly, while
   * `searchTerm` (what actually filters) trails by 200ms.
   *
   * Every group card is built inline in the list `.map()`, so each keystroke
   * re-rendered all 21 of them — measured at ~1.2s of blocked input on the
   * first character. Debouncing collapses a typed word into one re-render.
   */
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setSearchTerm(searchInput), 200);
    return () => clearTimeout(timer);
  }, [searchInput]);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<
    ModifierGroupWithItems | undefined
  >(undefined);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(
    {},
  );
  const [itemDrafts, setItemDrafts] = useState<Record<string, ItemDraft>>({});
  const [newItemDrafts, setNewItemDrafts] = useState<
    Record<
      string,
      {
        name: string;
        description?: string;
        price: number;
        isDefault: boolean;
        isSaving?: boolean;
      }
    >
  >({});
  const [groupSaving, setGroupSaving] = useState<Record<string, boolean>>({});
  /** Optimistic Active state, keyed by group id. Cleared once the refetch lands. */
  const [optimisticActive, setOptimisticActive] = useState<
    Record<string, boolean>
  >({});
  /**
   * Pending destructive action, shown in a themed Dialog. Replaces the native
   * `confirm()` this page used for both deletes — it can't be styled, ignores
   * dark mode, and looks nothing like the Item Library's delete flow.
   */
  const [pendingDelete, setPendingDelete] = useState<
    | { kind: "group"; group: ModifierGroupWithItems }
    | { kind: "option"; group: ModifierGroupWithItems; itemId: string; name: string }
    | null
  >(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  /** In-flight state for the group-level "Save changes" button. */
  const [groupOptionsSaving, setGroupOptionsSaving] = useState<
    Record<string, boolean>
  >({});
  const [deletingGroup, setDeletingGroup] = useState<string | null>(null);
  const [assignItemsGroup, setAssignItemsGroup] = useState<ModifierGroupWithItems | null>(null);
  const [assignCategoryGroup, setAssignCategoryGroup] = useState<ModifierGroupWithItems | null>(null);
  const [scopeFilter, setScopeFilter] = useState<"all" | "global" | "location">(
    "all",
  );
  const [isDraggingGroupId, setIsDraggingGroupId] = useState<string | null>(null);
  const [groupOrderSaving, setGroupOrderSaving] = useState(false);
  /** Phone-only reorder mode — reveals the drag grips. Desktop ignores it. */
  const [isOrderingGroups, setIsOrderingGroups] = useState(false);
  // Optimistic local order — set on drag, cleared after save/error
  const [localGroupOrder, setLocalGroupOrder] = useState<ModifierGroupWithItems[] | null>(null);
  const isSavingGroupRef = React.useRef(false);
  // Per-group option (item) ordering state
  const [optionOrders, setOptionOrders] = useState<Record<string, any[]>>({});
  const [optionOrderChanged, setOptionOrderChanged] = useState<Record<string, boolean>>({});
  const [optionOrderSaving, setOptionOrderSaving] = useState<Record<string, boolean>>({});

  const filteredGroups = useMemo(() => {
    const source = localGroupOrder ?? (modifierGroups || []);
    return source.filter((group: any) => {
      const term = searchTerm.toLowerCase();
      const matchesSearch =
        group.name.toLowerCase().includes(term) ||
        group.description?.toLowerCase().includes(term);

      const matchesScope =
        scopeFilter === "all" ||
        (scopeFilter === "global" && !group.location_id) ||
        (scopeFilter === "location" && !!group.location_id);

      return matchesSearch && matchesScope;
    }) as ModifierGroupWithItems[];
  }, [localGroupOrder, modifierGroups, searchTerm, scopeFilter]);

  // Counts for filters
  const counts = useMemo(() => {
    const all = modifierGroups?.length || 0;
    const global =
      modifierGroups?.filter((g: any) => !g.location_id).length || 0;
    const location =
      modifierGroups?.filter((g: any) => !!g.location_id).length || 0;
    return { all, global, location };
  }, [modifierGroups]);

  // Headline figures for the stats panel. Derived entirely from the groups
  // already loaded — no extra query.
  const stats = useMemo(() => {
    const groups = (modifierGroups || []) as ModifierGroupWithItems[];
    const options = groups.reduce(
      (sum, g) => sum + (g.modifier_group_items?.length || 0),
      0,
    );
    const linkedItems = groups.reduce(
      (sum, g) =>
        sum +
        (g.menu_item_modifier_groups?.length || 0) +
        (g.location_item_modifier_groups?.length || 0),
      0,
    );
    const linkedCategories = groups.reduce(
      (sum, g) => sum + (g.category_modifier_groups?.length || 0),
      0,
    );
    return {
      total: groups.length,
      options,
      linkedItems,
      linkedCategories,
      avgOptions: groups.length ? options / groups.length : 0,
    };
  }, [modifierGroups]);

  const toggleExpand = (groupId: string) => {
    setExpandedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const canEditStructure = (group: ModifierGroupWithItems) =>
    isAllLocations || group.location_id === selectedLocationId;

  // Can assign a modifier group to items/categories — more permissive than canEditStructure.
  // Allows assigning global groups from a location view (creates location-scoped assignment).
  const canAssignGroup = (group: ModifierGroupWithItems) =>
    isAllLocations ||
    !group.location_id ||
    group.location_id === selectedLocationId;

  const canOverrideOnly = (group: ModifierGroupWithItems) =>
    !isAllLocations && !group.location_id;

  const canReorderLibraryGroups =
    !searchTerm.trim() && (!isAllLocations || scopeFilter === "global");

  const reorderHelpText = isAllLocations
    ? "Switch to the Global filter to reorder library groups."
    : "Clear the current search before reordering groups.";

const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleCreateGroup = () => {
    setEditingGroup(undefined);
    setIsSheetOpen(true);
  };

  const handleEditGroup = (group: ModifierGroupWithItems) => {
    if (!canEditStructure(group)) return;
    setEditingGroup(group);
    setIsSheetOpen(true);
  };

  const handleDeleteGroup = async (group: ModifierGroupWithItems) => {
    if (!canEditStructure(group)) {
      if (!isAllLocations && !group.location_id) {
        toast.error("Cannot delete a global modifier group from a location view", {
        description: "Switch to All Locations to delete this group.",
        });
      } else if (!isAllLocations && group.location_id && group.location_id !== selectedLocationId) {
        toast.error("Cannot delete this modifier group from the current location", {
          description: `Switch to the location that owns this group to delete it.`,
        });
      }
      return;
    }
    setPendingDelete({ kind: "group", group });
  };

  const performDeleteGroup = async (group: ModifierGroupWithItems) => {
    setDeletingGroup(group.id);
    try {
      const res = await DeleteModifierGroup(
        group.id,
        selectedLocationId || undefined,
      );
      if (res.error) {
        toast.error("Failed to delete", { description: res.error });
      } else {
        toast.success("Modifier group deleted");
        queryClient.invalidateQueries({ queryKey: ["modifier-groups"] });
      queryClient.invalidateQueries({ queryKey: ["menu-items"] });
      queryClient.invalidateQueries({ queryKey: ["categories-with-items"] });
      invalidateOrderOutSync(queryClient);
      }
    } finally {
      setDeletingGroup(null);
    }
  };

  const handleSaveGroupActive = async (
    group: ModifierGroupWithItems,
    isActive: boolean,
  ) => {
    setGroupSaving((prev) => ({ ...prev, [group.id]: true }));
    // Paint the new state immediately — every other control on this page now
    // responds instantly, so a switch that waits for a round-trip reads as
    // broken on a slow connection. Rolled back in `catch`.
    setOptimisticActive((prev) => ({ ...prev, [group.id]: isActive }));
    try {
      if (canOverrideOnly(group)) {
        const res = await updateModifierGroup({
          modifierGroupId: group.id,
          isActive,
          locationId: selectedLocationId || undefined,
        });
        if (!res.success) throw new Error(res.error || "Failed to update");
      } else {
        const res = await updateModifierGroup({
          modifierGroupId: group.id,
          isActive,
        });
        if (!res.success) throw new Error(res.error || "Failed to update");
      }
      toast.success(isActive ? "Group activated" : "Group deactivated");
      queryClient.invalidateQueries({ queryKey: ["modifier-groups"] });
      queryClient.invalidateQueries({ queryKey: ["menu-items"] });
      queryClient.invalidateQueries({ queryKey: ["categories-with-items"] });
      invalidateOrderOutSync(queryClient);
      // Drop the optimistic entry once the refetch carries the real value,
      // otherwise it would shadow any later change made elsewhere.
      setOptimisticActive((prev) => {
        const next = { ...prev };
        delete next[group.id];
        return next;
      });
    } catch (e: any) {
      setOptimisticActive((prev) => {
        const next = { ...prev };
        delete next[group.id];
        return next;
      });
      toast.error("Update failed", { description: e?.message || "Try again" });
    } finally {
      setGroupSaving((prev) => ({ ...prev, [group.id]: false }));
    }
  };

  const handleResetGroupOverride = async (group: ModifierGroupWithItems) => {
    if (!selectedLocationId) return;
    try {
      const res = await DeleteLocationModifierGroupOverride(
        selectedLocationId,
        group.id,
      );
      if (res?.error) throw new Error(res.error);
      toast.success("Reset to global");
      queryClient.invalidateQueries({ queryKey: ["modifier-groups"] });
      queryClient.invalidateQueries({ queryKey: ["menu-items"] });
      queryClient.invalidateQueries({ queryKey: ["categories-with-items"] });
      invalidateOrderOutSync(queryClient);
    } catch (e: any) {
      toast.error("Reset failed", { description: e?.message || "Try again" });
    }
  };

  const setItemDraft = (id: string, patch: ItemDraft) => {
    setItemDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  /**
   * An option is dirty when its draft holds at least one edited field.
   * `isSaving` is bookkeeping, not an edit, so it never counts.
   */
  const isItemDirty = (itemId: string) => {
    const draft = itemDrafts[itemId];
    if (!draft) return false;
    return (
      draft.price !== undefined ||
      draft.isActive !== undefined ||
      draft.isDefault !== undefined ||
      draft.name !== undefined ||
      draft.description !== undefined
    );
  };

  /**
   * Persists one option. Throws on failure so the group-level save can count
   * failures; callers own the toast and the `isSaving` flag.
   */
  const persistItem = async (
    group: ModifierGroupWithItems,
    item: ModifierGroupItemsModel & {
      location_override?: Array<{
        id: string;
        price_modifier: number | null;
        is_active: boolean | null;
        location_id: string;
      }> | null;
    },
  ) => {
    const draft = itemDrafts[item.id] || {};
    const price =
      draft.price !== undefined
        ? draft.price
        : (item.location_override?.[0]?.price_modifier ?? item.price_modifier);
    const isActive =
      draft.isActive !== undefined
        ? draft.isActive
        : (item.location_override?.[0]?.is_active ?? item.is_active ?? true);
    const isDefault = draft.isDefault ?? item.is_default;

    if (canOverrideOnly(group)) {
      const res = await updateModifierItem({
        modifierItemId: item.id,
        priceModifier: price,
        isActive,
        locationId: selectedLocationId || undefined,
      });
      if (!res.success) throw new Error(res.error || "Failed to save");
    } else {
      const res = await UpdateModifierGroupItem(
        item.id,
        {
          price_modifier: price ?? 0,
          is_active: isActive,
          is_default: isDefault,
          name: draft.name ?? undefined,
          description: draft.description ?? undefined,
        },
        selectedLocationId || undefined,
      );
      if ((res as any)?.error) throw new Error((res as any).error);
    }
  };

  const refreshAfterOptionSave = () => {
    queryClient.invalidateQueries({ queryKey: ["modifier-groups"] });
    queryClient.invalidateQueries({ queryKey: ["menu-items"] });
    queryClient.invalidateQueries({ queryKey: ["categories-with-items"] });
    invalidateOrderOutSync(queryClient);
  };

  /**
   * Saves every option in the group that the merchant actually touched.
   *
   * Replaces the per-row Save button: editing five options used to mean five
   * separate clicks, five round-trips and five toasts. Untouched options are
   * skipped, so this never writes rows the merchant didn't edit.
   */
  const handleSaveGroupOptions = async (group: ModifierGroupWithItems) => {
    const items = getGroupItems(group);
    const dirty = items.filter((item: any) => isItemDirty(item.id));
    if (dirty.length === 0) return;

    setGroupOptionsSaving((prev) => ({ ...prev, [group.id]: true }));
    const failures: string[] = [];
    try {
      for (const item of dirty) {
        try {
          await persistItem(group, item as any);
        } catch (e: any) {
          failures.push(`${item.name}: ${e?.message || "failed"}`);
        }
      }

      const savedCount = dirty.length - failures.length;
      if (failures.length === 0) {
        toast.success(
          savedCount === 1 ? "Option saved" : `${savedCount} options saved`,
        );
        // Only clear drafts that actually persisted, so a failed edit stays on
        // screen for the merchant to retry rather than silently reverting.
        setItemDrafts((prev) => {
          const next = { ...prev };
          dirty.forEach((item: any) => delete next[item.id]);
          return next;
        });
      } else if (savedCount > 0) {
        toast.warning(`Saved ${savedCount}, ${failures.length} failed`, {
          description: failures[0],
        });
      } else {
        toast.error("Failed to save options", { description: failures[0] });
      }
      refreshAfterOptionSave();
    } finally {
      setGroupOptionsSaving((prev) => ({ ...prev, [group.id]: false }));
    }
  };

  const handleResetItemOverride = async (itemId: string) => {
    if (!selectedLocationId) return;
    try {
      const res = await DeleteLocationModifierItemOverride(
        selectedLocationId,
        itemId,
      );
      if (res?.error) throw new Error(res.error);
      toast.success("Reset to global");
      queryClient.invalidateQueries({ queryKey: ["modifier-groups"] });
      queryClient.invalidateQueries({ queryKey: ["menu-items"] });
      queryClient.invalidateQueries({ queryKey: ["categories-with-items"] });
      invalidateOrderOutSync(queryClient);
    } catch (e: any) {
      toast.error("Reset failed", { description: e?.message || "Try again" });
    }
  };

  const handleDeleteItem = (
    group: ModifierGroupWithItems,
    itemId: string,
    name: string,
  ) => {
    if (!canEditStructure(group)) return;
    setPendingDelete({ kind: "option", group, itemId, name });
  };

  const performDeleteItem = async (
    group: ModifierGroupWithItems,
    itemId: string,
  ) => {
    try {
      const res = await DeleteModifierGroupItem(
        itemId,
        selectedLocationId || undefined,
      );
      if (res?.error) throw new Error(res.error);
      toast.success("Option deleted");
      queryClient.invalidateQueries({ queryKey: ["modifier-groups"] });
      queryClient.invalidateQueries({ queryKey: ["menu-items"] });
      queryClient.invalidateQueries({ queryKey: ["categories-with-items"] });
      invalidateOrderOutSync(queryClient);
    } catch (e: any) {
      toast.error("Delete failed", { description: e?.message || "Try again" });
    }
  };

  const handleCreateItem = async (group: ModifierGroupWithItems) => {
    if (!canEditStructure(group)) return;
    const draft = newItemDrafts[group.id] || {
      name: "",
      price: 0,
      isDefault: false,
    };
    if (!draft.name) {
      toast.error("Name is required");
      return;
    }
    setNewItemDrafts((prev) => ({
      ...prev,
      [group.id]: { ...draft, isSaving: true },
    }));
    try {
      const res = await CreateModifierGroupItem(
        group.id,
        {
          name: draft.name,
          description: draft.description,
          price_modifier: draft.price ?? 0,
          is_default: draft.isDefault,
          merchant_id: group.merchant_id,
        },
        selectedLocationId || undefined,
      );
      if (res?.error) throw new Error(res.error);
      toast.success("Option created");
      queryClient.invalidateQueries({ queryKey: ["modifier-groups"] });
      queryClient.invalidateQueries({ queryKey: ["menu-items"] });
      queryClient.invalidateQueries({ queryKey: ["categories-with-items"] });
      invalidateOrderOutSync(queryClient);
      setNewItemDrafts((prev) => ({
        ...prev,
        [group.id]: { name: "", price: 0, isDefault: false, description: "" },
      }));
    } catch (e: any) {
      toast.error("Create failed", { description: e?.message || "Try again" });
    } finally {
      setNewItemDrafts((prev) => ({
        ...prev,
        [group.id]: { ...(prev[group.id] || {}), isSaving: false },
      }));
    }
  };

  const handleSheetSuccess = () => {
    setIsSheetOpen(false);
    setEditingGroup(undefined);
    queryClient.invalidateQueries({ queryKey: ["modifier-groups"] });
    invalidateOrderOutSync(queryClient);
  };

  const handleGroupDragStart = (event: DragStartEvent) => {
    setIsDraggingGroupId(event.active.id as string);
  };

  const handleGroupDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setIsDraggingGroupId(null);
    if (!over || active.id === over.id) return;
    if (!canReorderLibraryGroups) return;
    if (isSavingGroupRef.current) return;

    const currentList = localGroupOrder ?? (filteredGroups as ModifierGroupWithItems[]);
    const oldIndex = currentList.findIndex((g) => g.id === active.id);
    const newIndex = currentList.findIndex((g) => g.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove([...currentList], oldIndex, newIndex);

    // Optimistic update immediately so UI doesn't snap back during save
    setLocalGroupOrder(reordered);
    isSavingGroupRef.current = true;
    setGroupOrderSaving(true);

    try {
      if (isAllLocations) {
        const result = await ReorderModifierGroups(
          clerkOrgId || "",
          reordered.map((group, index) => ({
            modifierGroupId: group.id,
            displayOrder: index,
          })),
        );
        if (result.error) throw new Error(result.error);
      } else {
        if (!selectedLocationId || !merchantId) {
          throw new Error("Location or merchant context is missing.");
        }
        const results = await Promise.all(
          reordered.map((group, index) => {
            if (group.location_id) {
              return updateModifierGroup({ modifierGroupId: group.id, displayOrder: index });
            } else {
              return UpsertLocationModifierGroupOverride(
                selectedLocationId,
                group.id,
                merchantId,
                {
                  is_active: group.location_override?.[0]?.is_active ?? group.is_active ?? true,
                  display_order: index,
                },
              );
            }
          }),
        );
        const failed = results.find((r) => ("error" in r && r.error) || ("success" in r && !r.success));
        if (failed) throw new Error(("error" in failed ? failed.error : (failed as any).error) || "Failed to update group order.");
      }
      toast.success("Modifier group order updated");
      queryClient.invalidateQueries({ queryKey: ["modifier-groups"] });
      invalidateOrderOutSync(queryClient);
    } catch (e: any) {
      setLocalGroupOrder(null);
      toast.error("Failed to reorder modifier groups", { description: e?.message || "Try again" });
    } finally {
      isSavingGroupRef.current = false;
      setGroupOrderSaving(false);
    }
  };

  const getGroupItems = (group: ModifierGroupWithItems) =>
    optionOrders[group.id] ?? (group.modifier_group_items as any[] ?? []);

  const handleOptionOrderChange = (groupId: string, items: any[]) => {
    setOptionOrders((prev) => ({ ...prev, [groupId]: items }));
    setOptionOrderChanged((prev) => ({ ...prev, [groupId]: true }));
  };

  const handleSaveOptionOrder = async (group: ModifierGroupWithItems) => {
    const items = getGroupItems(group);
    setOptionOrderSaving((prev) => ({ ...prev, [group.id]: true }));
    try {
      const result = await ReorderModifierGroupItems(
        group.id,
        items.map((item: any, idx: number) => ({
          modifierGroupItemId: item.id,
          displayOrder: idx + 1,
        })),
        selectedLocationId,
      );
      if (result.error) throw new Error(result.error);
      toast.success("Option order saved");
      setOptionOrderChanged((prev) => ({ ...prev, [group.id]: false }));
      queryClient.invalidateQueries({ queryKey: ["modifier-groups"] });
      queryClient.invalidateQueries({ queryKey: ["menu-items"] });
      queryClient.invalidateQueries({ queryKey: ["categories-with-items"] });
      invalidateOrderOutSync(queryClient);
    } catch (e: any) {
      toast.error("Failed to save option order", { description: e?.message });
    } finally {
      setOptionOrderSaving((prev) => ({ ...prev, [group.id]: false }));
    }
  };

  const handleResetOptionOrder = (group: ModifierGroupWithItems) => {
    setOptionOrders((prev) => {
      const next = { ...prev };
      delete next[group.id];
      return next;
    });
    setOptionOrderChanged((prev) => ({ ...prev, [group.id]: false }));
  };

  const renderItemRow = (
    group: ModifierGroupWithItems,
    item: ModifierGroupItemsModel & {
      location_override?: Array<{
        id: string;
        price_modifier: number | null;
        is_active: boolean | null;
        location_id: string;
      }> | null;
    },
    dragHandle?: React.ReactNode,
  ) => {
    const override = item.location_override?.[0];
    const draft = itemDrafts[item.id] || {};
    const isOverrideScope = canOverrideOnly(group);
    const effectivePrice =
      draft.price ??
      (isOverrideScope ? override?.price_modifier : item.price_modifier);
    const effectiveActive =
      draft.isActive ??
      (isOverrideScope
        ? (override?.is_active ?? true)
        : (item.is_active ?? true));
    // Rows no longer save individually — the whole group commits at once, so
    // the in-flight state belongs to the group.
    const isSaving = !!groupOptionsSaving[group.id];
    const isDirty = isItemDirty(item.id);

    return (
      <div
        key={item.id}
        // `p-2` below `sm`: this card sits four levels of padding deep (panel →
        // group card → option indent → here), which left only 196px of a 320px
        // viewport for the controls inside.
        className={cn(
          // Two cards share a row from `sm` up, so the padding stays at `p-2`
          // rather than growing to `p-3` — at half width the inner controls
          // have roughly the space a full-width card had on a phone.
          "flex h-full min-w-0 flex-col gap-1.5 overflow-hidden rounded-2xl border-0 bg-muted/60 p-2 shadow-none animate-in fade-in",
          // Unsaved rows are ringed so a merchant scrolling a long group can
          // see what the group-level Save is about to commit.
          isDirty && "ring-1 ring-primary/40",
        )}
      >
        <div className="flex min-w-0 items-start justify-between gap-2">
          {/* Grip sits inside the card, aligned to the name row. Outside it
              indented every card by ~24px and left a ragged left edge. */}
          {dragHandle && <div className="mt-0.5 shrink-0">{dragHandle}</div>}
          <div className="min-w-0 flex-1">
            {/* The "Default" tag is gone: the Default toggle sits right below
                and already states it, so the badge was the same fact twice.
                The description takes the freed space on the name row. */}
            <div className="flex min-w-0 flex-nowrap items-center gap-x-2 gap-y-0.5 sm:flex-wrap sm:items-baseline">
              <span className="min-w-0 truncate text-sm font-medium sm:break-words">
                {item.name}
              </span>
              {item.description && (
                <span className="hidden min-w-0 truncate text-[11px] text-muted-foreground sm:inline">
                  {item.description}
                </span>
              )}
              {override && isOverrideScope && (
                <Tag style={OVERRIDE_BADGE_STYLE} dot>
                  Overridden
                </Tag>
              )}
              {isDirty && (
                <span className="text-[11px] font-medium text-primary">
                  Edited
                </span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {override && isOverrideScope && (
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Reset ${item.name} to global`}
                className="h-7 w-7 gap-1 rounded-full px-0 text-xs sm:w-auto sm:px-2.5"
                onClick={() => handleResetItemOverride(item.id)}
              >
                <RotateCcw className="size-3 shrink-0" />
                <span className="hidden sm:inline">Reset</span>
              </Button>
            )}
            {canEditStructure(group) && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Delete ${item.name}`}
                className="rounded-full text-muted-foreground hover:text-destructive"
                onClick={() => handleDeleteItem(group, item.id, item.name)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Two columns at 320px, then `auto-fit` takes over from `sm` up. The
            previous single `auto-fit,minmax(7rem,1fr)` grid put every control
            on its own row at this width, making one option ~440px tall — a
            10-option group became a 4,400px scroll. */}
        {/* Mobile uses two columns so the labels and switches never collide:
            Price and Default share the first row, with Active right-aligned
            below. From `sm` up, all three controls share one row. */}
        <div className="mt-auto grid min-w-0 grid-cols-2 items-center gap-x-2 gap-y-2 sm:grid-cols-3">
          {/* Label sits beside the field, not stacked above it — the stacked
              caption cost a full row per option and read as "Price Modifier",
              which is the column name, not what a merchant calls it. */}
          <div className="flex min-w-0 items-center gap-2">
            <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
              Price
            </span>
            <div className="relative w-20 shrink-0">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                $
              </span>
              <Input
                // `bg-background` is correct HERE and wrong in the Add Option
                // form: this field sits on the `bg-muted/60` option card, so it
                // must lift off that fill rather than match it.
                className="h-8 w-full bg-background px-2 pl-6 text-center text-sm tabular-nums"
                type="number"
                step="0.01"
                disabled={isSaving || (isOverrideScope && !selectedLocationId)}
                value={effectivePrice ?? ""}
                onChange={(e) => {
                  const val = e.target.value;
                  setItemDraft(item.id, {
                    price: val === "" ? null : parseFloat(val),
                  });
                }}
              />
            </div>
          </div>

          {!isOverrideScope && (
            <div className="flex min-w-0 items-center justify-self-end gap-2 sm:justify-self-center">
              <div className="text-xs text-muted-foreground">Default</div>
              <Switch
                checked={draft.isDefault ?? item.is_default ?? false}
                onCheckedChange={(checked) =>
                  setItemDraft(item.id, { isDefault: checked })
                }
                disabled={isSaving}
                className="shrink-0"
              />
            </div>
          )}

          <div
            className={cn(
              "flex min-w-0 items-center justify-self-end gap-2 sm:col-span-1 sm:col-start-3",
              isOverrideScope ? "col-start-2" : "col-span-2",
            )}
          >
            <div className="text-xs text-muted-foreground">Active</div>
            <Switch
              checked={!!effectiveActive}
              onCheckedChange={(checked) =>
                setItemDraft(item.id, { isActive: checked })
              }
              disabled={isSaving}
              className="shrink-0"
            />
          </div>
        </div>
      </div>
    );
  };

  const renderNewItemForm = (group: ModifierGroupWithItems) => {
    if (!canEditStructure(group)) return null;
    const draft = newItemDrafts[group.id] || {
      name: "",
      price: 0,
      isDefault: false,
      description: "",
    };
    // Card surface, not `bg-muted/30`: `Input` is a filled pill whose fill IS
    // its affordance (`border-0 bg-muted/60`). On a muted panel the two greys
    // collapse and the fields read as plain text — which is exactly what the
    // earlier `bg-background` override caused.
    return (
      <div className="min-w-0 space-y-3 rounded-2xl border border-dashed border-border/70 bg-card p-3">
        <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          <Plus className="h-3.5 w-3.5 shrink-0" />
          Add Option
        </div>
        {/* On mobile, Name and Description are matching full-width fields.
            Price and Default share the next row and Add is centered below. */}
        <div className="grid min-w-0 grid-cols-2 gap-3 md:grid-cols-4">
          <Input
            className="col-span-2 h-9 min-w-0 text-[0.8125rem] md:col-span-1"
            placeholder="Name"
            value={draft.name}
            onChange={(e) =>
              setNewItemDrafts((prev) => ({
                ...prev,
                [group.id]: { ...draft, name: e.target.value },
              }))
            }
          />
          <Input
            className="col-span-2 h-9 min-w-0 text-[0.8125rem] md:col-span-1"
            placeholder="Description"
            value={draft.description || ""}
            onChange={(e) =>
              setNewItemDrafts((prev) => ({
                ...prev,
                [group.id]: { ...draft, description: e.target.value },
              }))
            }
          />
          <Input
            className="h-9 min-w-0 text-[0.8125rem] tabular-nums"
            type="number"
            step="0.01"
            placeholder="Price"
            value={draft.price ?? ""}
            onChange={(e) =>
              setNewItemDrafts((prev) => ({
                ...prev,
                [group.id]: {
                  ...draft,
                  price: parseFloat(e.target.value) || 0,
                },
              }))
            }
          />
          <div className="contents md:col-span-1 md:flex md:min-w-0 md:items-center md:gap-2">
            <div className="flex min-w-0 items-center justify-self-end gap-2 md:justify-self-auto">
              <span className="shrink-0 text-xs text-muted-foreground">
                Default
              </span>
              <Switch
                checked={draft.isDefault}
                onCheckedChange={(checked) =>
                  setNewItemDrafts((prev) => ({
                    ...prev,
                    [group.id]: { ...draft, isDefault: checked },
                  }))
                }
              />
            </div>
            <Button
              size="sm"
              className="col-span-2 h-8 justify-self-center gap-1.5 rounded-full px-4 text-xs md:ml-auto"
              disabled={draft.isSaving}
              onClick={() => handleCreateItem(group)}
            >
              {draft.isSaving ? (
                <>
                  <Loader2 className="size-3.5 shrink-0 animate-spin" />
                  Adding...
                </>
              ) : (
                "Add"
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <PageShell>
      {/* No `stackActionsBelowIndicatorOnMobile`: that flag exists for the Item
          Library's two long buttons. With a single action here it only pushed
          "Create Group" onto its own full-width row, costing ~60px of a 740px
          phone viewport before any content. */}
      <PageHeader
        title="Modifiers"
        subtitle={
          isAllLocations
            ? "Option groups shared across your organization. Manage structure, options and pricing here."
            : selectedLocation?.name
              ? // The location store rehydrates from localStorage after the
                // first paint, so `selectedLocation` is briefly undefined even
                // though a location id is already selected. Interpolating it
                // unguarded renders the literal text "Viewing undefined.".
                `Viewing ${selectedLocation.name}. Global groups are structural read-only — you can override price and availability.`
              : "Global groups are structural read-only in a location view — you can override price and availability."
        }
        indicator={
          <LocationIndicator
            isAllLocations={isAllLocations}
            locationName={selectedLocation?.name}
          />
        }
        actions={
          <Button
            onClick={handleCreateGroup}
            className="h-9 gap-1.5 rounded-full px-4 text-[0.8125rem] font-medium"
          >
            <Plus className="h-4 w-4" />
            Create Group
          </Button>
        }
      />

      {/* Stats */}
      <Panel>
        {/* `px-4` below `sm`: 48px of padding is most of a 320px viewport. */}
        <div className="px-4 py-6 sm:px-6">
          <StatRow columns={4}>
            <StatTile
              label="Modifier Groups"
              icon={<Layers />}
              value={stats.total}
              meta={`${counts.global} global · ${counts.location} location`}
              isLoading={isLoading}
            />
            <StatTile
              label="Options"
              icon={<SlidersHorizontal />}
              value={stats.options}
              meta={
                stats.total
                  ? `Avg ${stats.avgOptions.toFixed(1)} per group`
                  : "No options yet"
              }
              isLoading={isLoading}
            />
            <StatTile
              label="Linked Items"
              icon={<Utensils />}
              value={stats.linkedItems}
              meta={
                stats.linkedItems > 0
                  ? "Items offering these options"
                  : "Not linked to any item"
              }
              isLoading={isLoading}
            />
            <StatTile
              label="Linked Categories"
              icon={<FolderPlus />}
              value={stats.linkedCategories}
              meta={
                stats.linkedCategories > 0
                  ? "Inherited by every item inside"
                  : "No category-wide groups"
              }
              isLoading={isLoading}
            />
          </StatRow>
        </div>
      </Panel>

      <Panel>
        <div className="min-w-0 space-y-4 px-4 pt-6 sm:px-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div className="min-w-0">
              <h2 className="text-[1.0625rem] font-semibold text-[#0C4FD1] dark:text-[#6CA0FF]">
                Modifier Groups
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                <span className="tabular-nums">{filteredGroups.length}</span>
                {filteredGroups.length === 1 ? " group" : " groups"} found
              </p>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
              <Input
                placeholder="Search modifier groups..."
                className="h-9 pl-9 text-[0.8125rem]"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
          </div>

          {/* Filter Buttons */}
          <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Filter className="h-4 w-4" />
              <span>Filter by:</span>
            </div>
            {(
              [
                { key: "all" as const, label: "All", count: counts.all, Icon: null },
                {
                  key: "global" as const,
                  label: "Global",
                  count: counts.global,
                  Icon: Globe,
                },
                {
                  key: "location" as const,
                  label: "Location",
                  count: counts.location,
                  Icon: MapPin,
                },
              ]
            ).map(({ key, label, count, Icon }) => {
              const isActive = scopeFilter === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setScopeFilter(key)}
                  aria-pressed={isActive}
                  className={cn(
                    "inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {Icon && <Icon className="h-3 w-3 shrink-0" />}
                  {label}
                  <span className="tabular-nums opacity-70">{count}</span>
                </button>
              );
            })}
          </div>

          {/* Reorder affordance — sits directly above the list it describes.
              On phones the compact button is enough without helper text. */}
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-2 text-xs text-muted-foreground">
            {canReorderLibraryGroups ? (
              <>
                <GripVertical className="hidden h-3.5 w-3.5 shrink-0 sm:block" />
                <span className="hidden sm:inline">Drag groups to reorder.</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsOrderingGroups((prev) => !prev)}
                  className={cn(
                    "h-7 shrink-0 gap-1 rounded-full px-3 text-xs sm:hidden",
                    isOrderingGroups
                      ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
                      : "bg-muted/60 hover:bg-muted hover:text-foreground",
                  )}
                >
                  <GripVertical className="h-3 w-3 shrink-0" />
                  {isOrderingGroups ? "Done" : "Reorder"}
                </Button>
                {groupOrderSaving && (
                  <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
                )}
              </>
            ) : (
              <span className="min-w-0">{reorderHelpText}</span>
            )}
          </div>
        </div>
        <div className="min-w-0 space-y-3 px-4 pb-6 pt-6 sm:px-6">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-24 rounded-2xl" />
              ))}
            </div>
          ) : filteredGroups.length === 0 ? (
            <Empty
              icon={Layers}
              title={
                counts.all === 0
                  ? "No modifier groups yet"
                  : "No matching groups"
              }
              description={
                counts.all === 0
                  ? "Modifier groups let customers customize an item — sauces, sizes, add-ons. Create one to get started."
                  : "Try a different search term or clear the scope filter."
              }
              action={
                counts.all === 0 ? (
                  <Button
                    onClick={handleCreateGroup}
                    className="h-9 gap-1.5 rounded-full px-4 text-[0.8125rem] font-medium"
                  >
                    <Plus className="h-4 w-4" />
                    Create Group
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => {
                      // Both, or the debounced value would repopulate the box.
                      setSearchInput("");
                      setSearchTerm("");
                      setScopeFilter("all");
                    }}
                    className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
                  >
                    Clear filters
                  </Button>
                )
              }
            />
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleGroupDragStart}
              onDragEnd={handleGroupDragEnd}
            >
              <SortableContext
                items={filteredGroups.map((g) => g.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-3">
            {filteredGroups.map((group) => {
              const locationOverride = group.location_override?.[0];
              const effectiveIsActive =
                optimisticActive[group.id] ??
                locationOverride?.is_active ??
                group.is_active ??
                true;
              const itemCount = group.modifier_group_items?.length || 0;
              const globalLinkedCount = group.menu_item_modifier_groups?.length || 0;
              const locationLinkedCount = group.location_item_modifier_groups?.length || 0;
              const categoryCount = group.category_modifier_groups?.length || 0;
              const ruleLabel = selectionRuleLabel(group as any);
              // Multiple defaults are correct for a multi-select group and a
              // real conflict for a single-select one — the POS can only
              // pre-select one, so which wins is arbitrary.
              const defaultCount = (group.modifier_group_items || []).filter(
                (opt: any) => opt.is_default,
              ).length;
              const hasDefaultConflict =
                isSingleSelect(group as any) && defaultCount > 1;
              const scopeBadge = group.location_id ? "Location" : "Global";

              // Build location breakdown for "All Locations" view
              const locationBreakdown = isAllLocations && locationLinkedCount > 0
                ? group.location_item_modifier_groups!.reduce<Record<string, { name: string; count: number }>>((acc, entry) => {
                    const locName = entry.location?.name || "Unknown";
                    if (!acc[entry.location_id]) acc[entry.location_id] = { name: locName, count: 0 };
                    acc[entry.location_id].count++;
                    return acc;
                  }, {})
                : null;
              return (
                <SortableGroupWrapper
                  key={group.id}
                  id={group.id}
                  canReorder={canReorderLibraryGroups}
                  isOrdering={isOrderingGroups}
                >
                  {(dragHandle) => (
                  <div
                    className={cn(
                      "min-w-0 overflow-hidden rounded-2xl border bg-card transition-colors",
                      !effectiveIsActive && "opacity-70",
                    )}
                  >
                  <div className="flex min-w-0 flex-col gap-3 p-3 sm:p-4">
                    {/* `items-center`: the grip reads as belonging to the whole
                        card, so it sits on the card's vertical centre rather
                        than pinned to the first text line. */}
                    <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                      {dragHandle}

                      {/* The whole title block toggles the panel, matching the
                          category groups on the Item Library. The chevron is
                          the affordance; the hit target is the row. */}
                      <button
                        type="button"
                        onClick={() => toggleExpand(group.id)}
                        aria-expanded={!!expandedGroups[group.id]}
                        aria-label={`${expandedGroups[group.id] ? "Collapse" : "Expand"} ${group.name}`}
                        className="flex min-w-0 flex-1 items-center gap-2 rounded-xl text-left focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:gap-3"
                      >
                        {/* The icon tile is decoration, not information — at 320px
                            it and the drag handle together cost 68px, which is
                            what squeezed the group name down to ~56px and
                            truncated every title to "Crepe…". Hidden on phones. */}
                        <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-muted/60 sm:flex">
                          <Layers className="h-5 w-5 text-muted-foreground" />
                        </span>
                        <span className="min-w-0 flex-1">
                          {/* Wraps to a second line on a phone rather than
                              truncating: two groups whose names share a prefix
                              are indistinguishable once cut to one word. */}
                          <span className="block text-sm font-semibold leading-snug break-words sm:truncate sm:text-base">
                            {group.name}
                          </span>
                          {group.description && (
                            <span className="mt-0.5 hidden truncate text-[11px] leading-4 text-muted-foreground sm:block">
                              {group.description}
                            </span>
                          )}

                        </span>
                      </button>

                      {/* Active is the one high-frequency control, so it stays
                          on the row. Everything else lives in the kebab —
                          six naked icon buttons were the noisiest thing on
                          this page and wrapped badly under ~900px. */}
                      <div className="flex shrink-0 items-center gap-1">
                        <div className="hidden items-center gap-2 sm:flex">
                          <span className="text-xs text-muted-foreground">
                            Active
                          </span>
                          <Switch
                            checked={effectiveIsActive}
                            disabled={groupSaving[group.id]}
                            onCheckedChange={(checked) =>
                              handleSaveGroupActive(group, checked)
                            }
                            aria-label={`${effectiveIsActive ? "Deactivate" : "Activate"} ${group.name}`}
                          />
                        </div>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="rounded-full"
                              aria-label={`Actions for ${group.name}`}
                            >
                              {deletingGroup === group.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <MoreHorizontal className="h-4 w-4" />
                              )}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            className="w-48 rounded-2xl"
                          >
                            <DropdownMenuLabel>Group actions</DropdownMenuLabel>
                            <DropdownMenuSeparator />

                            {/* Mobile only — the inline switch is hidden below sm. */}
                            <DropdownMenuItem
                              className="sm:hidden"
                              disabled={groupSaving[group.id]}
                              onSelect={() =>
                                handleSaveGroupActive(group, !effectiveIsActive)
                              }
                            >
                              <Layers className="h-4 w-4" />
                              {effectiveIsActive ? "Deactivate" : "Activate"}
                            </DropdownMenuItem>

                            <DropdownMenuItem
                              disabled={!canEditStructure(group)}
                              onSelect={() => handleEditGroup(group)}
                            >
                              <Edit3 className="h-4 w-4" />
                              Edit group
                            </DropdownMenuItem>

                            {canAssignGroup(group) && (
                              <>
                                <DropdownMenuItem
                                  onSelect={() => setAssignItemsGroup(group)}
                                >
                                  <ListPlus className="h-4 w-4" />
                                  Add to items
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onSelect={() => setAssignCategoryGroup(group)}
                                >
                                  <FolderPlus className="h-4 w-4" />
                                  Add to category
                                </DropdownMenuItem>
                              </>
                            )}

                            {locationOverride && canOverrideOnly(group) && (
                              <DropdownMenuItem
                                onSelect={() => handleResetGroupOverride(group)}
                              >
                                <RotateCcw className="h-4 w-4" />
                                Reset to global
                              </DropdownMenuItem>
                            )}

                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              disabled={deletingGroup === group.id}
                              onSelect={() => handleDeleteGroup(group)}
                            >
                              <Trash2 className="h-4 w-4" />
                              Delete group
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>

                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="rounded-full"
                          aria-label={`${expandedGroups[group.id] ? "Collapse" : "Expand"} ${group.name}`}
                          onClick={() => toggleExpand(group.id)}
                        >
                          <ChevronDown
                            className={cn(
                              "h-4 w-4 transition-transform",
                              expandedGroups[group.id] && "rotate-180",
                            )}
                          />
                        </Button>
                      </div>
                    </div>

                    {expandedGroups[group.id] && (
                      <div className="min-w-0 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                        {/* Keep linked-item context beside the group heading,
                            before the divider and the option editor. */}
                        {(globalLinkedCount > 0 || locationLinkedCount > 0) && (
                          <div className="min-w-0 space-y-3">
                            <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                              <Utensils className="hidden h-3.5 w-3.5 shrink-0 sm:block" />
                              Linked Items
                              <span className="tabular-nums">
                                ({globalLinkedCount + locationLinkedCount})
                              </span>
                            </div>

                            {globalLinkedCount > 0 && (
                              <div className="hidden min-w-0 flex-col gap-1.5 sm:flex sm:flex-row sm:items-baseline sm:gap-2">
                                <div className="flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground">
                                  Global (
                                  <span className="tabular-nums">
                                    {globalLinkedCount}
                                  </span>
                                  )
                                </div>
                                <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                                  {group.menu_item_modifier_groups?.map((link) => (
                                    <Tag key={link.id} style={COUNT_BADGE_STYLE}>
                                      {link.menu_item?.name || "Unknown"}
                                    </Tag>
                                  ))}
                                </div>
                              </div>
                            )}

                            {locationLinkedCount > 0 && !isAllLocations && (
                              <div className="hidden min-w-0 flex-col gap-1.5 sm:flex sm:flex-row sm:items-baseline sm:gap-2">
                                <div className="flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground">
                                  This Location (
                                  <span className="tabular-nums">
                                    {locationLinkedCount}
                                  </span>
                                  )
                                </div>
                                <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                                  {group.location_item_modifier_groups?.map((link) => (
                                    <Tag
                                      key={link.id}
                                      style={LINKED_ITEM_BADGE_STYLE}
                                    >
                                      {link.menu_item?.name || "Unknown"}
                                    </Tag>
                                  ))}
                                </div>
                              </div>
                            )}

                            {locationLinkedCount > 0 && isAllLocations && locationBreakdown && (
                              <div className="hidden min-w-0 space-y-2 sm:block">
                                {Object.entries(locationBreakdown).map(([locId, info]) => (
                                  <div
                                    key={locId}
                                    className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-baseline sm:gap-2"
                                  >
                                    <div className="flex min-w-0 shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground sm:max-w-40">
                                      <span className="truncate">{info.name}</span>
                                      <span className="shrink-0 tabular-nums">
                                        ({info.count})
                                      </span>
                                    </div>
                                    <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                                      {group.location_item_modifier_groups
                                        ?.filter((link) => link.location_id === locId)
                                        .map((link) => (
                                          <Tag
                                            key={link.id}
                                            style={LINKED_ITEM_BADGE_STYLE}
                                          >
                                            {link.menu_item?.name || "Unknown"}
                                          </Tag>
                                        ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 border-t border-border/60 pt-4">
                          <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                            <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" />
                            Options
                            <span className="tabular-nums">({itemCount})</span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            · {ruleLabel}
                            {!isSingleSelect(group as any) &&
                              defaultCount > 1 &&
                              ` · ${defaultCount} pre-selected`}
                          </span>
                        </div>

                        {hasDefaultConflict && (
                          <div className="flex min-w-0 items-start gap-2 rounded-2xl bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span className="min-w-0">
                              This group allows only one selection, but{" "}
                              <span className="tabular-nums font-medium">
                                {defaultCount}
                              </span>{" "}
                              options are marked Default. The POS can pre-select
                              only one — turn off Default on the others.
                            </span>
                          </div>
                        )}
                        <SortableModifierItemList
                          items={getGroupItems(group)}
                          locationId={selectedLocationId}
                          hasChanges={!!optionOrderChanged[group.id]}
                          isSaving={!!optionOrderSaving[group.id]}
                          onOrderChange={(items) => handleOptionOrderChange(group.id, items)}
                          onSave={() => handleSaveOptionOrder(group)}
                          onReset={() => handleResetOptionOrder(group)}
                          renderItem={(item, dragHandle) =>
                            renderItemRow(group, item as any, dragHandle)
                          }
                        />

                        {/* One commit for the whole group. Appears only once
                            something is actually edited, so it never sits there
                            as dead chrome. */}
                        {(() => {
                          const dirtyCount = getGroupItems(group).filter(
                            (item: any) => isItemDirty(item.id),
                          ).length;
                          if (dirtyCount === 0) return null;
                          const saving = !!groupOptionsSaving[group.id];
                          return (
                            <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-2xl bg-primary/5 px-3 py-2.5 ring-1 ring-primary/20 animate-in fade-in slide-in-from-bottom-1">
                              <span className="min-w-0 flex-1 basis-40 text-xs text-muted-foreground">
                                <span className="tabular-nums font-medium text-foreground">
                                  {dirtyCount}
                                </span>{" "}
                                option{dirtyCount !== 1 ? "s" : ""} edited
                              </span>
                              <div className="flex shrink-0 items-center gap-1.5">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={saving}
                                  className="h-7 shrink-0 rounded-full px-3 text-xs"
                                  onClick={() =>
                                    setItemDrafts((prev) => {
                                      const next = { ...prev };
                                      getGroupItems(group).forEach((item: any) => {
                                        delete next[item.id];
                                      });
                                      return next;
                                    })
                                  }
                                >
                                  Discard
                                </Button>
                                <Button
                                  size="sm"
                                  disabled={saving}
                                  className="h-7 shrink-0 gap-1.5 rounded-full px-4 text-xs"
                                  onClick={() => handleSaveGroupOptions(group)}
                                >
                                  {saving ? (
                                    <>
                                      <Loader2 className="size-3 shrink-0 animate-spin" />
                                      Saving...
                                    </>
                                  ) : (
                                    "Save changes"
                                  )}
                                </Button>
                              </div>
                            </div>
                          );
                        })()}

                        {renderNewItemForm(group)}
                      </div>
                    )}
                  </div>
                </div>
                  )}
                </SortableGroupWrapper>
              );
            })}
                </div>
              </SortableContext>
              <DragOverlay>
                {isDraggingGroupId && (() => {
                  const g = filteredGroups.find((x) => x.id === isDraggingGroupId);
                  return g ? (
                    <div className="flex items-center gap-3 rounded-2xl border bg-card px-4 py-3 opacity-90 shadow-xl ring-2 ring-primary/40">
                      <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-muted/60">
                        <Layers className="h-4 w-4 text-muted-foreground" />
                      </span>
                      <span className="font-semibold">{g.name}</span>
                    </div>
                  ) : null;
                })()}
              </DragOverlay>
            </DndContext>
          )}
        </div>
      </Panel>

      {/* Themed replacement for the two native `confirm()` calls. */}
      <Dialog
        open={!!pendingDelete}
        onOpenChange={(open) => {
          if (!open && !isConfirmingDelete) setPendingDelete(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5 shrink-0" />
              {pendingDelete?.kind === "group"
                ? "Delete modifier group"
                : "Delete option"}
            </DialogTitle>
            <DialogDescription>
              {pendingDelete?.kind === "group" ? (
                <>
                  Delete &quot;{pendingDelete.group.name}&quot;? This removes the
                  group and all{" "}
                  <span className="tabular-nums">
                    {pendingDelete.group.modifier_group_items?.length || 0}
                  </span>{" "}
                  of its options, and unlinks it from every item and category
                  that uses it.
                  <span className="mt-2 block font-medium text-foreground">
                    This action cannot be undone.
                  </span>
                </>
              ) : pendingDelete?.kind === "option" ? (
                <>
                  Delete &quot;{pendingDelete.name}&quot; from{" "}
                  {pendingDelete.group.name}?
                  <span className="mt-2 block font-medium text-foreground">
                    This action cannot be undone.
                  </span>
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={isConfirmingDelete}
              onClick={() => setPendingDelete(null)}
              className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={isConfirmingDelete}
              className="h-9 gap-1.5 rounded-full px-4 text-[0.8125rem] font-medium"
              onClick={async () => {
                if (!pendingDelete) return;
                setIsConfirmingDelete(true);
                try {
                  if (pendingDelete.kind === "group") {
                    await performDeleteGroup(pendingDelete.group);
                  } else {
                    await performDeleteItem(
                      pendingDelete.group,
                      pendingDelete.itemId,
                    );
                  }
                  setPendingDelete(null);
                } finally {
                  setIsConfirmingDelete(false);
                }
              }}
            >
              {isConfirmingDelete ? (
                <>
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 shrink-0" />
                  {pendingDelete?.kind === "group"
                    ? "Delete group"
                    : "Delete option"}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ModifierGroupFormSheet
        open={isSheetOpen}
        onOpenChange={(open) => {
          setIsSheetOpen(open);
          if (!open) setEditingGroup(undefined);
        }}
        clerkOrgId={clerkOrgId}
        editGroup={editingGroup as any}
        onSuccess={handleSheetSuccess}
      />

      {assignItemsGroup && (
        <AssignModifierToItemsDialog
          open={!!assignItemsGroup}
          onOpenChange={(open) => {
            if (!open) setAssignItemsGroup(null);
          }}
          modifierGroup={assignItemsGroup}
          clerkOrgId={clerkOrgId}
          locationId={selectedLocationId}
          isAllLocations={isAllLocations}
          onSuccess={() => {
            setAssignItemsGroup(null);
            queryClient.invalidateQueries({ queryKey: ["modifier-groups"] });
      queryClient.invalidateQueries({ queryKey: ["menu-items"] });
      queryClient.invalidateQueries({ queryKey: ["categories-with-items"] });
      invalidateOrderOutSync(queryClient);
          }}
        />
      )}

      {assignCategoryGroup && (
        <AssignModifierToCategoryDialog
          open={!!assignCategoryGroup}
          onOpenChange={(open) => {
            if (!open) setAssignCategoryGroup(null);
          }}
          modifierGroup={assignCategoryGroup}
          clerkOrgId={clerkOrgId}
          locationId={selectedLocationId}
          isAllLocations={isAllLocations}
          onSuccess={() => {
            setAssignCategoryGroup(null);
            queryClient.invalidateQueries({ queryKey: ["modifier-groups"] });
      queryClient.invalidateQueries({ queryKey: ["menu-items"] });
      queryClient.invalidateQueries({ queryKey: ["categories-with-items"] });
            queryClient.invalidateQueries({
              queryKey: ["categories-with-items"],
            });
            invalidateOrderOutSync(queryClient);
          }}
        />
      )}
    </PageShell>
  );
}
