"use client";

import { useMemo, useState } from "react";
import { ScopeContextStrip } from "@/components/dashboard/menu/ScopeContextStrip";
import { useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Plus,
  Search,
  Layers,
  Info,
  ChevronDown,
  Sparkles,
  Loader2,
  Trash2,
  Edit3,
  Globe,
  MapPin,
  Filter,
  ListPlus,
  FolderPlus,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useModifierGroups } from "@/app/dashboard/hooks/useModifierGroups";
import { useUserInfo } from "@/app/manage/hooks/useUserInfo.";
import { useSelectedLocation } from "@/stores/location-store";
import { ModifierGroupFormSheet } from "@/components/dashboard/menu/ModifierGroupFormSheet";
import { AssignModifierToItemsDialog } from "@/components/dashboard/menu/modifiers/AssignModifierToItemsDialog";
import { AssignModifierToCategoryDialog } from "@/components/dashboard/menu/modifiers/AssignModifierToCategoryDialog";
import {
  DeleteModifierGroup,
  CreateModifierGroupItem,
  UpdateModifierGroupItem,
  DeleteModifierGroupItem,
} from "@/app/dashboard/actions/modifier-groups";
import {
  updateModifierGroup,
  updateModifierItem,
} from "@/app/dashboard/actions/menu-items-rpc";
import {
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

export default function ModifiersPage() {
  const { data: userInfo } = useUserInfo();
  const clerkOrgId = userInfo?.members?.[0]?.organizations?.id;
  const queryClient = useQueryClient();

  const selectedLocation = useSelectedLocation();
  const selectedLocationId = selectedLocation?.id || null;
  const isAllLocations = !selectedLocationId || selectedLocationId === "all";

  const { data: modifierGroups, isLoading } = useModifierGroups(
    clerkOrgId,
    selectedLocationId,
  );

  const [searchTerm, setSearchTerm] = useState("");
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
  const [deletingGroup, setDeletingGroup] = useState<string | null>(null);
  const [assignItemsGroup, setAssignItemsGroup] = useState<ModifierGroupWithItems | null>(null);
  const [assignCategoryGroup, setAssignCategoryGroup] = useState<ModifierGroupWithItems | null>(null);
  const [scopeFilter, setScopeFilter] = useState<"all" | "global" | "location">(
    "all",
  );

  const filteredGroups = useMemo(() => {
    return (modifierGroups || []).filter((group: any) => {
      const term = searchTerm.toLowerCase();
      const matchesSearch =
        group.name.toLowerCase().includes(term) ||
        group.description?.toLowerCase().includes(term);

      // Scope filter
      const matchesScope =
        scopeFilter === "all" ||
        (scopeFilter === "global" && !group.location_id) ||
        (scopeFilter === "location" && !!group.location_id);

      return matchesSearch && matchesScope;
    }) as ModifierGroupWithItems[];
  }, [modifierGroups, searchTerm, scopeFilter]);

  // Counts for filters
  const counts = useMemo(() => {
    const all = modifierGroups?.length || 0;
    const global =
      modifierGroups?.filter((g: any) => !g.location_id).length || 0;
    const location =
      modifierGroups?.filter((g: any) => !!g.location_id).length || 0;
    return { all, global, location };
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
    if (
      !confirm(
        `Delete "${group.name}"? This removes the group and its items. This cannot be undone.`,
      )
    )
      return;
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
      toast.success("Group updated");
      queryClient.invalidateQueries({ queryKey: ["modifier-groups"] });
      queryClient.invalidateQueries({ queryKey: ["menu-items"] });
      queryClient.invalidateQueries({ queryKey: ["categories-with-items"] });
    } catch (e: any) {
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
    } catch (e: any) {
      toast.error("Reset failed", { description: e?.message || "Try again" });
    }
  };

  const setItemDraft = (id: string, patch: ItemDraft) => {
    setItemDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const handleSaveItem = async (
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

    setItemDraft(item.id, { isSaving: true });
    try {
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
      toast.success("Option saved");
      queryClient.invalidateQueries({ queryKey: ["modifier-groups"] });
      queryClient.invalidateQueries({ queryKey: ["menu-items"] });
      queryClient.invalidateQueries({ queryKey: ["categories-with-items"] });
    } catch (e: any) {
      toast.error("Save failed", { description: e?.message || "Try again" });
    } finally {
      setItemDraft(item.id, { isSaving: false });
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
    } catch (e: any) {
      toast.error("Reset failed", { description: e?.message || "Try again" });
    }
  };

  const handleDeleteItem = async (
    group: ModifierGroupWithItems,
    itemId: string,
  ) => {
    if (!canEditStructure(group)) return;
    if (!confirm("Delete this option? This cannot be undone.")) return;
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
    const isSaving = draft.isSaving;

    return (
      <div
        key={item.id}
        className="p-3 rounded-lg border bg-muted/40 space-y-2 animate-in fade-in"
      >
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 font-medium">
              {item.name}
              {item.is_default && (
                <Badge variant="outline" className="text-[10px]">
                  Default
                </Badge>
              )}
              {override && isOverrideScope && (
                <Badge variant="outline" className="text-[10px]">
                  Overridden
                </Badge>
              )}
            </div>
            {item.description && (
              <div className="text-xs text-muted-foreground">
                {item.description}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {override && isOverrideScope && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleResetItemOverride(item.id)}
              >
                Reset
              </Button>
            )}
            {canEditStructure(group) && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => handleDeleteItem(group, item.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 items-center">
          <div>
            <div className="text-xs text-muted-foreground mb-1">
              Price Modifier
            </div>
            <div className="relative">
              <span className="absolute left-2 top-2 text-muted-foreground text-sm">
                $
              </span>
              <Input
                className="pl-6 h-9"
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

          <div className="flex items-center gap-2">
            <div className="text-xs text-muted-foreground">Active</div>
            <Switch
              checked={!!effectiveActive}
              onCheckedChange={(checked) =>
                setItemDraft(item.id, { isActive: checked })
              }
              disabled={isSaving}
            />
          </div>

          {!isOverrideScope && (
            <div className="flex items-center gap-2">
              <div className="text-xs text-muted-foreground">Default</div>
              <Switch
                checked={draft.isDefault ?? item.is_default ?? false}
                onCheckedChange={(checked) =>
                  setItemDraft(item.id, { isDefault: checked })
                }
                disabled={isSaving}
              />
            </div>
          )}

          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() => handleSaveItem(group, item)}
              disabled={isSaving}
              className="gap-2"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Save
                </>
              )}
            </Button>
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
    return (
      <div className="rounded-lg border bg-white p-3 space-y-2">
        <div className="font-semibold text-sm">Add Option</div>
        <div className="grid md:grid-cols-4 gap-3">
          <Input
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
            type="number"
            step="0.01"
            placeholder="Price modifier"
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
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Default</span>
            <Switch
              checked={draft.isDefault}
              onCheckedChange={(checked) =>
                setNewItemDrafts((prev) => ({
                  ...prev,
                  [group.id]: { ...draft, isDefault: checked },
                }))
              }
            />
            <Button
              size="sm"
              className="ml-auto"
              disabled={draft.isSaving}
              onClick={() => handleCreateItem(group)}
            >
              {draft.isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
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
    <div className="flex flex-col gap-6 p-6 max-w-[1600px] mx-auto w-full">
      <ScopeContextStrip />
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Modifiers</h1>
            <p className="text-muted-foreground mt-1">
              Global management in All Locations. In a location view, override
              visibility and prices, or fully manage location-owned groups.
            </p>
          </div>
          <Button onClick={handleCreateGroup} className="gap-2 self-start flex-shrink-0">
            <Plus className="h-4 w-4" />
            Create Group
          </Button>
        </div>
        {!isAllLocations && (
          <div className="flex items-start gap-2 p-2 bg-blue-50 text-blue-800 rounded-lg text-sm border border-blue-100">
            <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>Viewing <strong>{selectedLocation?.name}</strong>. Global groups are
            structural read-only; you can override price/availability.</span>
          </div>
        )}
      </div>

      <Card className="border shadow-sm">
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="relative w-full md:max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search modifier groups..."
                className="pl-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="text-sm text-muted-foreground">
              {filteredGroups.length} group(s)
            </div>
          </div>

          {/* Filter Buttons */}
          <div className="flex flex-wrap gap-2 border-t pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Filter className="h-4 w-4" />
              <span>Filter by:</span>
            </div>
            <Button
              variant={scopeFilter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setScopeFilter("all")}
              className="h-7 text-xs"
            >
              All
              <Badge
                variant="secondary"
                className="ml-1.5 h-4 px-1 text-[10px]"
              >
                {counts.all}
              </Badge>
            </Button>
            <Button
              variant={scopeFilter === "global" ? "default" : "outline"}
              size="sm"
              onClick={() => setScopeFilter("global")}
              className={cn(
                "h-7 text-xs gap-1",
                scopeFilter === "global" &&
                  "bg-emerald-500 hover:bg-emerald-600",
              )}
            >
              <Globe className="h-3 w-3" />
              Global
              <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
                {counts.global}
              </Badge>
            </Button>
            <Button
              variant={scopeFilter === "location" ? "default" : "outline"}
              size="sm"
              onClick={() => setScopeFilter("location")}
              className={cn(
                "h-7 text-xs gap-1",
                scopeFilter === "location" &&
                  "bg-purple-500 hover:bg-purple-600",
              )}
            >
              <MapPin className="h-3 w-3" />
              Location
              <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
                {counts.location}
              </Badge>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading...</div>
          ) : filteredGroups.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No modifier groups found.
            </div>
          ) : (
            filteredGroups.map((group) => {
              const locationOverride = group.location_override?.[0];
              const effectiveIsActive =
                locationOverride?.is_active ?? group.is_active ?? true;
              const itemCount = group.modifier_group_items?.length || 0;
              const globalLinkedCount = group.menu_item_modifier_groups?.length || 0;
              const locationLinkedCount = group.location_item_modifier_groups?.length || 0;
              const categoryCount = group.category_modifier_groups?.length || 0;
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
                <div
                  key={group.id}
                  className="border rounded-lg bg-white shadow-sm"
                >
                  <div className="flex flex-col gap-3 p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-10 w-10 rounded-lg bg-purple-50 flex items-center justify-center">
                          <Layers className="h-5 w-5 text-purple-600" />
                        </div>
                        <div className="min-w-0">
                          <CardTitle className="text-lg leading-tight">
                            {group.name}
                          </CardTitle>
                          <CardDescription className="text-sm">
                            {group.description || "No description"}
                          </CardDescription>
                          <div className="flex flex-wrap gap-2 mt-2">
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[10px] gap-1",
                                group.location_id
                                  ? "bg-purple-50 text-purple-700 border-purple-200"
                                  : "bg-emerald-50 text-emerald-700 border-emerald-200",
                              )}
                            >
                              {group.location_id ? (
                                <MapPin className="h-2.5 w-2.5" />
                              ) : (
                                <Globe className="h-2.5 w-2.5" />
                              )}
                              {scopeBadge}
                            </Badge>
                            {locationOverride && canOverrideOnly(group) && (
                              <Badge
                                variant="outline"
                                className="text-[10px] bg-amber-50 text-amber-700 border-amber-200"
                              >
                                Overridden
                              </Badge>
                            )}
                            <Badge variant="outline" className="text-[10px]">
                              {itemCount} option{itemCount !== 1 ? "s" : ""}
                            </Badge>
                            {globalLinkedCount > 0 && (
                              <Badge variant="outline" className="text-[10px] gap-1 bg-emerald-50 text-emerald-700 border-emerald-200">
                                <Globe className="h-2.5 w-2.5" />
                                {globalLinkedCount} item{globalLinkedCount !== 1 ? "s" : ""}
                              </Badge>
                            )}
                            {locationLinkedCount > 0 && (
                              <Badge variant="outline" className="text-[10px] gap-1 bg-blue-50 text-blue-700 border-blue-200">
                                <MapPin className="h-2.5 w-2.5" />
                                {locationLinkedCount} item{locationLinkedCount !== 1 ? "s" : ""} (location)
                              </Badge>
                            )}
                            {globalLinkedCount === 0 && locationLinkedCount === 0 && (
                              <Badge variant="outline" className="text-[10px]">
                                0 items linked
                              </Badge>
                            )}
                            {categoryCount > 0 && (
                              <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
                                {categoryCount} categor{categoryCount !== 1 ? "ies" : "y"}{" "}
                                linked
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-wrap flex-shrink-0">
                        {locationOverride && canOverrideOnly(group) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleResetGroupOverride(group)}
                          >
                            Reset
                          </Button>
                        )}
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            Active
                          </span>
                          <Switch
                            checked={effectiveIsActive}
                            disabled={groupSaving[group.id]}
                            onCheckedChange={(checked) =>
                              handleSaveGroupActive(group, checked)
                            }
                          />
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={!canEditStructure(group)}
                          onClick={() => handleEditGroup(group)}
                          title="Edit"
                        >
                          <Edit3 className="h-4 w-4" />
                        </Button>
                        {canAssignGroup(group) && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setAssignItemsGroup(group)}
                              title="Add to Items"
                            >
                              <ListPlus className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setAssignCategoryGroup(group)}
                              title="Add to Category"
                            >
                              <FolderPlus className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className={cn(
                            "text-destructive",
                            !canEditStructure(group) && "opacity-50",
                          )}
                          disabled={deletingGroup === group.id}
                          onClick={() => handleDeleteGroup(group)}
                        >
                          {deletingGroup === group.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleExpand(group.id)}
                          className="ml-2"
                        >
                          <ChevronDown
                            className={`h-4 w-4 transition-transform ${
                              expandedGroups[group.id] ? "rotate-180" : ""
                            }`}
                          />
                        </Button>
                      </div>
                    </div>

                    {expandedGroups[group.id] && (
                      <div className="space-y-3 border-t pt-3">
                        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                          Options ({itemCount})
                        </div>
                        <div className="space-y-2">
                          {group.modifier_group_items?.map((item) =>
                            renderItemRow(group, item as any),
                          )}
                        </div>
                        {renderNewItemForm(group)}

                        {/* Linked Items Breakdown */}
                        {(globalLinkedCount > 0 || locationLinkedCount > 0) && (
                          <div className="space-y-2 border-t pt-3">
                            <div className="text-sm font-semibold text-muted-foreground">
                              Linked Items ({globalLinkedCount + locationLinkedCount})
                            </div>

                            {/* Global assignments */}
                            {globalLinkedCount > 0 && (
                              <div className="space-y-1">
                                <div className="text-xs font-medium text-emerald-700 flex items-center gap-1">
                                  <Globe className="h-3 w-3" /> Global ({globalLinkedCount})
                                </div>
                                <div className="flex flex-wrap gap-1 pl-4">
                                  {group.menu_item_modifier_groups?.map((link) => (
                                    <Badge key={link.id} variant="outline" className="text-[10px]">
                                      {link.menu_item?.name || "Unknown"}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Location-scoped assignments */}
                            {locationLinkedCount > 0 && !isAllLocations && (
                              <div className="space-y-1">
                                <div className="text-xs font-medium text-blue-700 flex items-center gap-1">
                                  <MapPin className="h-3 w-3" /> This Location ({locationLinkedCount})
                                </div>
                                <div className="flex flex-wrap gap-1 pl-4">
                                  {group.location_item_modifier_groups?.map((link) => (
                                    <Badge key={link.id} variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
                                      {link.menu_item?.name || "Unknown"}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* All Locations view — show per-location breakdown */}
                            {locationLinkedCount > 0 && isAllLocations && locationBreakdown && (
                              <div className="space-y-2">
                                {Object.entries(locationBreakdown).map(([locId, info]) => (
                                  <div key={locId} className="space-y-1">
                                    <div className="text-xs font-medium text-blue-700 flex items-center gap-1">
                                      <MapPin className="h-3 w-3" /> {info.name} ({info.count})
                                    </div>
                                    <div className="flex flex-wrap gap-1 pl-4">
                                      {group.location_item_modifier_groups
                                        ?.filter((link) => link.location_id === locId)
                                        .map((link) => (
                                          <Badge key={link.id} variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
                                            {link.menu_item?.name || "Unknown"}
                                          </Badge>
                                        ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

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
          }}
        />
      )}
    </div>
  );
}
