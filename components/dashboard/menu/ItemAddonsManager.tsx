"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Plus,
  X,
  Grip,
  Pencil,
  Check,
  Package,
  Loader2,
  Trash2,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import {
  GetItemAddons,
  CreateItemAddon,
  UpdateItemAddon,
  DeleteItemAddon,
  ReorderItemAddons,
} from "@/app/dashboard/actions/item-sizes-addons";

interface ItemAddonsManagerProps {
  menuItemId: string;
  clerkOrgId: string;
  isEditable?: boolean;
}

interface AddonRow {
  id: string;
  name: string;
  description: string | null;
  price: number;
  display_order: number | null;
}

export function ItemAddonsManager({
  menuItemId,
  clerkOrgId,
  isEditable = true,
}: ItemAddonsManagerProps) {
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);

  // Form state for new addon
  const [newName, setNewName] = React.useState("");
  const [newDescription, setNewDescription] = React.useState("");
  const [newPrice, setNewPrice] = React.useState("");

  // Form state for editing
  const [editName, setEditName] = React.useState("");
  const [editDescription, setEditDescription] = React.useState("");
  const [editPrice, setEditPrice] = React.useState("");

  const queryKey = ["item-addons", menuItemId];

  const { data: addonsResult, isLoading } = useQuery({
    queryKey,
    queryFn: () => GetItemAddons(menuItemId),
    enabled: !!menuItemId,
  });

  const addons: AddonRow[] = (addonsResult as any)?.data || [];

  const createMutation = useMutation({
    mutationFn: (input: {
      name: string;
      description?: string;
      price: number;
    }) => CreateItemAddon(clerkOrgId, menuItemId, input),
    onSuccess: (result) => {
      if (result.error) {
        toast.error("Failed to add addon", { description: result.error });
        return;
      }
      toast.success(`Addon "${result.data?.name}" added`);
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["menu-items"] });
      setIsAdding(false);
      setNewName("");
      setNewDescription("");
      setNewPrice("");
    },
    onError: () => toast.error("Failed to add addon"),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: { name?: string; description?: string; price?: number };
    }) => UpdateItemAddon(id, input),
    onSuccess: (result) => {
      if (result.error) {
        toast.error("Failed to update addon", { description: result.error });
        return;
      }
      toast.success(`Addon updated`);
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["menu-items"] });
      setEditingId(null);
    },
    onError: () => toast.error("Failed to update addon"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => DeleteItemAddon(id),
    onSuccess: (result) => {
      if ((result as any).error) {
        toast.error("Failed to delete addon", {
          description: (result as any).error,
        });
        return;
      }
      toast.success("Addon removed");
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["menu-items"] });
    },
    onError: () => toast.error("Failed to delete addon"),
  });

  const reorderMutation = useMutation({
    mutationFn: (addonIds: string[]) =>
      ReorderItemAddons(menuItemId, addonIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) {
      toast.error("Addon name is required");
      return;
    }
    const price = parseFloat(newPrice) || 0;
    if (price < 0) {
      toast.error("Addon price cannot be negative");
      return;
    }
    createMutation.mutate({
      name,
      description: newDescription.trim() || undefined,
      price,
    });
  };

  const handleUpdate = () => {
    if (!editingId) return;
    const name = editName.trim();
    if (!name) {
      toast.error("Addon name is required");
      return;
    }
    const price = parseFloat(editPrice) || 0;
    if (price < 0) {
      toast.error("Addon price cannot be negative");
      return;
    }
    updateMutation.mutate({
      id: editingId,
      input: {
        name,
        description: editDescription.trim() || undefined,
        price,
      },
    });
  };

  const startEditing = (addon: AddonRow) => {
    setEditingId(addon.id);
    setEditName(addon.name);
    setEditDescription(addon.description || "");
    setEditPrice(String(addon.price));
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditName("");
    setEditDescription("");
    setEditPrice("");
  };

  const moveAddon = (index: number, direction: "up" | "down") => {
    const newAddons = [...addons];
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= newAddons.length) return;
    [newAddons[index], newAddons[swapIndex]] = [
      newAddons[swapIndex],
      newAddons[index],
    ];
    reorderMutation.mutate(newAddons.map((a) => a.id));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Existing Addons */}
      {addons.length === 0 && !isAdding ? (
        <div className="text-center py-6 text-muted-foreground">
          <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No addons configured</p>
          <p className="text-xs mt-1">
            Add extras like Extra Cheese, Bacon, etc. with fixed prices
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {addons.map((addon, index) => (
            <div
              key={addon.id}
              className={cn(
                "rounded-lg border bg-background overflow-hidden transition-all",
                editingId === addon.id && "ring-2 ring-primary/20",
              )}
            >
              {editingId === addon.id ? (
                /* Edit mode */
                <div className="p-3 space-y-2">
                  <div className="flex gap-2">
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Addon name"
                      className="flex-1 h-8 text-sm"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleUpdate();
                        if (e.key === "Escape") cancelEditing();
                      }}
                    />
                    <div className="relative w-24">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                        $
                      </span>
                      <Input
                        value={editPrice}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === "" || /^\d*\.?\d*$/.test(val)) {
                            setEditPrice(val);
                          }
                        }}
                        placeholder="0.00"
                        className="h-8 text-sm pl-5"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleUpdate();
                          if (e.key === "Escape") cancelEditing();
                        }}
                      />
                    </div>
                  </div>
                  <Input
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder="Description (optional)"
                    className="h-8 text-sm"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleUpdate();
                      if (e.key === "Escape") cancelEditing();
                    }}
                  />
                  <div className="flex justify-end gap-1.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={cancelEditing}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={handleUpdate}
                      disabled={updateMutation.isPending}
                    >
                      {updateMutation.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      ) : (
                        <Check className="h-3 w-3 mr-1" />
                      )}
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                /* Display mode */
                <div className="p-3 flex items-center gap-2">
                  <div className="text-muted-foreground/50">
                    <Grip className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium">{addon.name}</span>
                    {addon.description && (
                      <p className="text-xs text-muted-foreground truncate">
                        {addon.description}
                      </p>
                    )}
                  </div>
                  <Badge variant="default" className="text-xs tabular-nums">
                    +${addon.price.toFixed(2)}
                  </Badge>
                  {isEditable && (
                    <div className="flex items-center gap-0.5">
                      {index > 0 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => moveAddon(index, "up")}
                        >
                          <ArrowUp className="h-3 w-3" />
                        </Button>
                      )}
                      {index < addons.length - 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => moveAddon(index, "down")}
                        >
                          <ArrowDown className="h-3 w-3" />
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-foreground"
                        onClick={() => startEditing(addon)}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteMutation.mutate(addon.id)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Read-only hint */}
      {!isEditable && addons.length === 0 && (
        <p className="text-xs text-center text-muted-foreground bg-muted/50 rounded-md p-2">
          Switch to <span className="font-medium">All Locations</span> view to add and manage addons.
        </p>
      )}

      {/* Add New Addon */}
      {isEditable && (
        <>
          {isAdding ? (
            <div className="rounded-lg border-2 border-dashed border-primary/30 bg-primary/5 p-3 space-y-2">
              <div className="flex gap-2">
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Addon name (e.g. Extra Cheese)"
                  className="flex-1 h-8 text-sm"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                    if (e.key === "Escape") {
                      setIsAdding(false);
                      setNewName("");
                      setNewDescription("");
                      setNewPrice("");
                    }
                  }}
                />
                <div className="relative w-24">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    $
                  </span>
                  <Input
                    value={newPrice}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "" || /^\d*\.?\d*$/.test(val)) {
                        setNewPrice(val);
                      }
                    }}
                    placeholder="0.00"
                    className="h-8 text-sm pl-5"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreate();
                      if (e.key === "Escape") {
                        setIsAdding(false);
                        setNewName("");
                        setNewDescription("");
                        setNewPrice("");
                      }
                    }}
                  />
                </div>
              </div>
              <Input
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Description (optional)"
                className="h-8 text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                  if (e.key === "Escape") {
                    setIsAdding(false);
                    setNewName("");
                    setNewDescription("");
                    setNewPrice("");
                  }
                }}
              />
              <p className="text-[11px] text-muted-foreground px-0.5">
                Addon price is added on top of the item price when selected by
                the customer.
              </p>
              <div className="flex justify-end gap-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    setIsAdding(false);
                    setNewName("");
                    setNewDescription("");
                    setNewPrice("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={handleCreate}
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  ) : (
                    <Plus className="h-3 w-3 mr-1" />
                  )}
                  Add Addon
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsAdding(true)}
              className="w-full p-2.5 rounded-lg border-2 border-dashed border-muted-foreground/30 text-muted-foreground hover:border-primary/50 hover:text-primary hover:bg-primary/5 transition-all flex items-center justify-center gap-2"
            >
              <Plus className="h-4 w-4" />
              <span className="text-sm font-medium">Add Addon</span>
            </button>
          )}
        </>
      )}
    </div>
  );
}
