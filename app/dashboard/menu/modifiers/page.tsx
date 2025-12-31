"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Layers, Info } from "lucide-react";
import { useModifierGroups } from "@/app/dashboard/hooks/useModifierGroups";
import { useUserInfo } from "@/app/manage/hooks/useUserInfo.";
import { useSelectedLocation } from "@/stores/location-store";
import { ModifierGroupListView } from "@/components/dashboard/menu/ModifierGroupListView";
import { ModifierGroupFormSheet } from "@/components/dashboard/menu/ModifierGroupFormSheet";
import { DeleteModifierGroup } from "@/app/dashboard/actions/modifier-groups";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  ModifierGroupsModel,
  ModifierGroupItemsModel,
} from "@/types/db-modles";

// Combined type for the list view
interface ModifierGroupWithItems extends ModifierGroupsModel {
  modifier_group_items?: ModifierGroupItemsModel[];
}

export default function ModifiersPage() {
  const { data: userInfo } = useUserInfo();
  const clerkOrgId = userInfo?.members?.[0]?.organizations?.id;
  const queryClient = useQueryClient();

  // Location Context
  const selectedLocation = useSelectedLocation();
  const selectedLocationId = selectedLocation?.id || null;
  const isAllLocations = !selectedLocationId || selectedLocationId === "all";

  // Data Fetching
  const { data: modifierGroups, isLoading } = useModifierGroups(
    clerkOrgId,
    selectedLocationId
  );

  // Local State
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<
    ModifierGroupWithItems | undefined
  >(undefined);

  // Filter Logic
  const filteredGroups = (modifierGroups || []).filter(
    (group: ModifierGroupWithItems) =>
      group.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      group.description?.toLowerCase().includes(searchTerm.toLowerCase())
  ) as ModifierGroupWithItems[];

  // Handlers
  const handleCreate = () => {
    setEditingGroup(undefined);
    setIsCreateOpen(true);
  };

  const handleEdit = (group: ModifierGroupWithItems) => {
    setEditingGroup(group);
    setIsCreateOpen(true);
  };

  const handleDelete = async (group: ModifierGroupWithItems) => {
    if (
      !confirm(
        `Are you sure you want to delete "${group.name}"? This cannot be undone.`
      )
    ) {
      return;
    }

    try {
      const result = await DeleteModifierGroup(group.id);
      if (result.error) {
        toast.error("Deletion Failed", {
          description: result.error,
        });
      } else {
        toast.success("Modifier Group Deleted");
        queryClient.invalidateQueries({ queryKey: ["modifier-groups"] });
      }
    } catch (error) {
      toast.error("Deletion Failed", {
        description: "An unexpected error occurred",
      });
    }
  };

  const handleFormSuccess = () => {
    setIsCreateOpen(false);
    setEditingGroup(undefined);
    queryClient.invalidateQueries({ queryKey: ["modifier-groups"] });
  };

  return (
    <div className="flex flex-col gap-6 p-6 max-w-[1600px] mx-auto w-full animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Modifiers</h1>
          <p className="text-muted-foreground mt-1">
            Manage modifier groups and options for your menu items.
          </p>
        </div>
        {!isAllLocations && (
          <div className="flex items-center gap-2 p-2 bg-blue-50 text-blue-800 rounded-lg text-sm border border-blue-100">
            <Info className="h-4 w-4" />
            Viewing <strong>{selectedLocation?.name}</strong>. Global structures
            are read-only.
          </div>
        )}
        {isAllLocations && (
          <Button
            onClick={handleCreate}
            className="shadow-lg hover:shadow-xl transition-all"
          >
            <Plus className="mr-2 h-4 w-4" />
            Create Group
          </Button>
        )}
      </div>

      {/* Content */}
      <Card className="border-none shadow-md bg-card/50 backdrop-blur-sm">
        <CardHeader className="p-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search modifier groups..."
                className="pl-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ModifierGroupListView
            groups={filteredGroups}
            isLoading={isLoading}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onCreateNew={handleCreate}
            emptyStateTitle={
              searchTerm ? "No results found" : "No modifier groups"
            }
            emptyStateDescription={
              searchTerm
                ? "Try adjusting your search terms"
                : "Get started by creating your first modifier group"
            }
          />
        </CardContent>
      </Card>

      {/* Create/Edit Sheet */}
      <ModifierGroupFormSheet
        open={isCreateOpen}
        onOpenChange={(open) => {
          setIsCreateOpen(open);
          if (!open) setEditingGroup(undefined);
        }}
        clerkOrgId={clerkOrgId}
        editGroup={editingGroup}
        onSuccess={handleFormSuccess}
      />
    </div>
  );
}
