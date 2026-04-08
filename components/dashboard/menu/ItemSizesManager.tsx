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
  Ruler,
  Loader2,
  Trash2,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import {
  GetItemSizes,
  CreateItemSize,
  UpdateItemSize,
  DeleteItemSize,
  ReorderItemSizes,
} from "@/app/dashboard/actions/item-sizes-addons";

interface ItemSizesManagerProps {
  menuItemId: string;
  clerkOrgId: string;
  isEditable?: boolean;
}

interface SizeRow {
  id: string;
  name: string;
  price_modifier: number;
  display_order: number | null;
}

export function ItemSizesManager({
  menuItemId,
  clerkOrgId,
  isEditable = true,
}: ItemSizesManagerProps) {
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);

  // Form state for new size
  const [newName, setNewName] = React.useState("");
  const [newModifier, setNewModifier] = React.useState("");

  // Form state for editing
  const [editName, setEditName] = React.useState("");
  const [editModifier, setEditModifier] = React.useState("");

  const queryKey = ["item-sizes", menuItemId];

  const { data: sizesResult, isLoading } = useQuery({
    queryKey,
    queryFn: () => GetItemSizes(menuItemId),
    enabled: !!menuItemId,
  });

  const sizes: SizeRow[] = (sizesResult as any)?.data || [];

  const createMutation = useMutation({
    mutationFn: (input: { name: string; price_modifier: number }) =>
      CreateItemSize(clerkOrgId, menuItemId, input),
    onSuccess: (result) => {
      if (result.error) {
        toast.error("Failed to add size", { description: result.error });
        return;
      }
      toast.success(`Size "${result.data?.name}" added`);
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["menu-items"] });
      setIsAdding(false);
      setNewName("");
      setNewModifier("");
    },
    onError: () => toast.error("Failed to add size"),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: { name?: string; price_modifier?: number };
    }) => UpdateItemSize(id, input),
    onSuccess: (result) => {
      if (result.error) {
        toast.error("Failed to update size", { description: result.error });
        return;
      }
      toast.success(`Size updated`);
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["menu-items"] });
      setEditingId(null);
    },
    onError: () => toast.error("Failed to update size"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => DeleteItemSize(id),
    onSuccess: (result) => {
      if ((result as any).error) {
        toast.error("Failed to delete size", {
          description: (result as any).error,
        });
        return;
      }
      toast.success("Size removed");
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["menu-items"] });
    },
    onError: () => toast.error("Failed to delete size"),
  });

  const reorderMutation = useMutation({
    mutationFn: (sizeIds: string[]) => ReorderItemSizes(menuItemId, sizeIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) {
      toast.error("Size name is required");
      return;
    }
    const modifier = parseFloat(newModifier) || 0;
    createMutation.mutate({ name, price_modifier: modifier });
  };

  const handleUpdate = () => {
    if (!editingId) return;
    const name = editName.trim();
    if (!name) {
      toast.error("Size name is required");
      return;
    }
    const modifier = parseFloat(editModifier) || 0;
    updateMutation.mutate({
      id: editingId,
      input: { name, price_modifier: modifier },
    });
  };

  const startEditing = (size: SizeRow) => {
    setEditingId(size.id);
    setEditName(size.name);
    setEditModifier(String(size.price_modifier));
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditName("");
    setEditModifier("");
  };

  const moveSize = (index: number, direction: "up" | "down") => {
    const newSizes = [...sizes];
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= newSizes.length) return;
    [newSizes[index], newSizes[swapIndex]] = [
      newSizes[swapIndex],
      newSizes[index],
    ];
    reorderMutation.mutate(newSizes.map((s) => s.id));
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
      {/* Existing Sizes */}
      {sizes.length === 0 && !isAdding ? (
        <div className="text-center py-6 text-muted-foreground">
          <Ruler className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No sizes configured</p>
          <p className="text-xs mt-1">
            Add sizes like Small, Medium, Large with price adjustments
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {sizes.map((size, index) => (
            <div
              key={size.id}
              className={cn(
                "rounded-lg border bg-background overflow-hidden transition-all",
                editingId === size.id && "ring-2 ring-primary/20",
              )}
            >
              {editingId === size.id ? (
                /* Edit mode */
                <div className="p-3 space-y-2">
                  <div className="flex gap-2">
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Size name"
                      className="flex-1 h-8 text-sm"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleUpdate();
                        if (e.key === "Escape") cancelEditing();
                      }}
                    />
                    <div className="relative w-28">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                        $
                      </span>
                      <Input
                        value={editModifier}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === "" || val === "-" || /^-?\d*\.?\d*$/.test(val)) {
                            setEditModifier(val);
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
                    <span className="text-sm font-medium">{size.name}</span>
                  </div>
                  <Badge
                    variant={
                      size.price_modifier > 0
                        ? "default"
                        : size.price_modifier < 0
                          ? "secondary"
                          : "outline"
                    }
                    className="text-xs tabular-nums"
                  >
                    {size.price_modifier > 0 ? "+" : ""}
                    ${size.price_modifier.toFixed(2)}
                  </Badge>
                  {isEditable && (
                    <div className="flex items-center gap-0.5">
                      {index > 0 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => moveSize(index, "up")}
                        >
                          <ArrowUp className="h-3 w-3" />
                        </Button>
                      )}
                      {index < sizes.length - 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => moveSize(index, "down")}
                        >
                          <ArrowDown className="h-3 w-3" />
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-foreground"
                        onClick={() => startEditing(size)}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteMutation.mutate(size.id)}
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
      {!isEditable && sizes.length === 0 && (
        <p className="text-xs text-center text-muted-foreground bg-muted/50 rounded-md p-2">
          Switch to <span className="font-medium">All Locations</span> view to add and manage sizes.
        </p>
      )}

      {/* Add New Size */}
      {isEditable && (
        <>
          {isAdding ? (
            <div className="rounded-lg border-2 border-dashed border-primary/30 bg-primary/5 p-3 space-y-2">
              <div className="flex gap-2">
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Size name (e.g. Large)"
                  className="flex-1 h-8 text-sm"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                    if (e.key === "Escape") {
                      setIsAdding(false);
                      setNewName("");
                      setNewModifier("");
                    }
                  }}
                />
                <div className="relative w-28">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    $
                  </span>
                  <Input
                    value={newModifier}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "" || val === "-" || /^-?\d*\.?\d*$/.test(val)) {
                        setNewModifier(val);
                      }
                    }}
                    placeholder="±0.00"
                    className="h-8 text-sm pl-5"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreate();
                      if (e.key === "Escape") {
                        setIsAdding(false);
                        setNewName("");
                        setNewModifier("");
                      }
                    }}
                  />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground px-0.5">
                Price modifier adjusts the base item price. Use negative for
                cheaper, positive for more expensive.
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
                    setNewModifier("");
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
                  Add Size
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
              <span className="text-sm font-medium">Add Size</span>
            </button>
          )}
        </>
      )}
    </div>
  );
}
