"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChefHat,
  Plus,
  Trash2,
  Edit2,
  DollarSign,
  Package,
  Loader2,
  AlertCircle,
  Globe,
  MapPin,
  Check,
  ChevronsUpDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  GetRecipesForModifierItem,
  AddModifierRecipeIngredient,
  UpdateModifierRecipeIngredient,
  RemoveModifierRecipeIngredient,
  ModifierRecipeIngredient,
  UpdateModifierItemRecipe,
} from "@/app/dashboard/actions/modifier-recipes";
import { GetInventoryItemsForRecipe } from "@/app/dashboard/actions/recipes";

interface ModifierRecipeManagerProps {
  modifierItemId: string;
  modifierItemName: string;
  clerkOrgId?: string;
  merchantId?: string;
  locationId?: string | null;
  isEditable?: boolean;
}

export function ModifierRecipeManager({
  modifierItemId,
  modifierItemName,
  clerkOrgId = "",
  merchantId,
  locationId,
  isEditable = true,
}: ModifierRecipeManagerProps) {
  const queryClient = useQueryClient();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [openCombobox, setOpenCombobox] = useState(false);
  const [editingIngredient, setEditingIngredient] =
    useState<ModifierRecipeIngredient | null>(null);
  const [selectedInventoryId, setSelectedInventoryId] = useState<string>("");
  const [quantity, setQuantity] = useState<string>("");

  // Fetch recipe
  const { data: recipeData, isLoading } = useQuery({
    queryKey: ["modifier-item-recipe", modifierItemId],
    queryFn: () => GetRecipesForModifierItem(modifierItemId),
    enabled: !!modifierItemId,
  });

  // Fetch available inventory items
  const { data: inventoryData } = useQuery({
    queryKey: ["inventory-items-for-recipe", merchantId || clerkOrgId, locationId],
    queryFn: () => GetInventoryItemsForRecipe(clerkOrgId, locationId, merchantId),
    enabled: (!!clerkOrgId || !!merchantId) && isAddDialogOpen,
  });

  const ingredients = recipeData?.data?.ingredients || [];
  const totalCost = recipeData?.data?.total_cost || 0;
  const availableItems = inventoryData?.data || [];

  // Filter out already added items
  const unaddedItems = availableItems.filter(
    (item) => !ingredients.some((ing) => ing.inventory_item_id === item.id)
  );

  // Mutations - All use the atomic RPC for consistency
  const addMutation = useMutation({
    mutationFn: async ({
      inventoryItemId,
      qty,
    }: {
      inventoryItemId: string;
      qty: number;
    }) => {
      // Build new recipe array with added item
      const newRecipeItems = [
        ...ingredients.map((ing) => ({
          inventoryItemId: ing.inventory_item_id,
          quantity: ing.quantity_used,
        })),
        { inventoryItemId, quantity: qty },
      ];
      console.log(
        "[ModifierRecipeManager] Adding ingredient, new list:",
        newRecipeItems
      );
      return UpdateModifierItemRecipe(modifierItemId, newRecipeItems);
    },
    onSuccess: (result) => {
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Ingredient added to recipe");
        queryClient.invalidateQueries({
          queryKey: ["modifier-item-recipe", modifierItemId],
        });
        setIsAddDialogOpen(false);
        setSelectedInventoryId("");
        setQuantity("");
      }
    },
    onError: (err) => {
      console.error("[ModifierRecipeManager] Add mutation error:", err);
      toast.error("Failed to add ingredient");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      recipeId,
      qty,
    }: {
      recipeId: string;
      qty: number;
    }) => {
      // Build recipe array with updated quantity
      const newRecipeItems = ingredients.map((ing) => ({
        inventoryItemId: ing.inventory_item_id,
        quantity: ing.id === recipeId ? qty : ing.quantity_used,
      }));
      console.log(
        "[ModifierRecipeManager] Updating ingredient, new list:",
        newRecipeItems
      );
      return UpdateModifierItemRecipe(modifierItemId, newRecipeItems);
    },
    onSuccess: (result) => {
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Quantity updated");
        queryClient.invalidateQueries({
          queryKey: ["modifier-item-recipe", modifierItemId],
        });
        setEditingIngredient(null);
        setQuantity("");
      }
    },
    onError: (err) => {
      console.error("[ModifierRecipeManager] Update mutation error:", err);
      toast.error("Failed to update ingredient");
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (recipeId: string) => {
      // Build recipe array without the removed item
      const newRecipeItems = ingredients
        .filter((ing) => ing.id !== recipeId)
        .map((ing) => ({
          inventoryItemId: ing.inventory_item_id,
          quantity: ing.quantity_used,
        }));
      console.log(
        "[ModifierRecipeManager] Removing ingredient, new list:",
        newRecipeItems
      );
      return UpdateModifierItemRecipe(modifierItemId, newRecipeItems);
    },
    onSuccess: (result) => {
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Ingredient removed");
        queryClient.invalidateQueries({
          queryKey: ["modifier-item-recipe", modifierItemId],
        });
      }
    },
    onError: (err) => {
      console.error("[ModifierRecipeManager] Remove mutation error:", err);
      toast.error("Failed to remove ingredient");
    },
  });

  // Reset form when dialog opens
  useEffect(() => {
    if (!isAddDialogOpen) {
      setSelectedInventoryId("");
      setQuantity("");
    }
  }, [isAddDialogOpen]);

  useEffect(() => {
    if (editingIngredient) {
      setQuantity(editingIngredient.quantity_used.toString());
    }
  }, [editingIngredient]);

  const handleAdd = () => {
    const qty = parseFloat(quantity);
    if (!selectedInventoryId || isNaN(qty) || qty <= 0) {
      toast.error("Please select an ingredient and enter a valid quantity");
      return;
    }
    addMutation.mutate({ inventoryItemId: selectedInventoryId, qty });
  };

  const handleUpdate = () => {
    if (!editingIngredient) return;
    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty <= 0) {
      toast.error("Please enter a valid quantity");
      return;
    }
    updateMutation.mutate({ recipeId: editingIngredient.id, qty });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <ChefHat className="h-4 w-4 text-orange-500" />
                Recipe / Ingredients
              </CardTitle>
              <CardDescription className="text-xs">
                Link inventory items to this option
              </CardDescription>
            </div>
            {isEditable && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => setIsAddDialogOpen(true)}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {ingredients.length === 0 ? (
            <div className="text-center py-6 bg-muted/20 rounded-lg border border-dashed">
              <Package className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-50" />
              <p className="text-sm font-medium mb-1">No ingredients</p>
              <p className="text-xs text-muted-foreground">
                Track inventory usage for this option
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Ingredients List */}
              {ingredients.map((ing) => {
                const item = ing.inventory_item;
                const lineCost = (item?.cost_per_unit || 0) * ing.quantity_used;

                return (
                  <div
                    key={ing.id}
                    className="flex items-center justify-between p-2.5 rounded-lg border bg-card text-card-foreground shadow-sm group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0">
                        <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center">
                          <Package className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">
                            {item?.name || "Unknown Item"}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {ing.quantity_used} {item?.unit_type}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="font-semibold text-xs text-green-600">
                          ${lineCost.toFixed(2)}
                        </div>
                      </div>

                      {isEditable && (
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => setEditingIngredient(ing)}
                          >
                            <Edit2 className="h-3 w-3" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive hover:bg-destructive/10"
                            onClick={() => removeMutation.mutate(ing.id)}
                            disabled={removeMutation.isPending}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Total Cost */}
              <div className="flex items-center justify-between pt-2 border-t mt-2">
                <span className="text-xs font-medium text-muted-foreground">
                  Added Cost
                </span>
                <span className="text-sm font-bold text-green-600">
                  ${totalCost.toFixed(2)}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Ingredient Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" />
              Add Ingredient
            </DialogTitle>
            <DialogDescription>
              Add an inventory item to "{modifierItemName}"
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {unaddedItems.length === 0 ? (
              <div className="text-center py-4">
                <AlertCircle className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  No more inventory items available to add at this location.
                </p>
                {/* Debug info if locationId is present */}
                {locationId && locationId !== "all" && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Viewing items for location: {locationId}
                  </p>
                )}
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Inventory Item</label>
                  <Popover
                    open={openCombobox}
                    onOpenChange={setOpenCombobox}
                    modal={true}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={openCombobox}
                        className="w-full justify-between"
                      >
                        {selectedInventoryId
                          ? unaddedItems.find(
                              (item) => item.id === selectedInventoryId
                            )?.name
                          : "Select an ingredient..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[400px] p-0 z-[100]">
                      <Command>
                        <CommandInput placeholder="Search ingredient..." />
                        <CommandList>
                          <CommandEmpty>No ingredient found.</CommandEmpty>
                          <CommandGroup>
                            {unaddedItems.map((item) => (
                              <CommandItem
                                key={item.id}
                                value={`${item.name}-${item.id}`}
                                className="data-[disabled]:opacity-100 data-[disabled]:pointer-events-auto cursor-pointer"
                                onSelect={() => {
                                  setSelectedInventoryId(item.id);
                                  setOpenCombobox(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    selectedInventoryId === item.id
                                      ? "opacity-100"
                                      : "opacity-0"
                                  )}
                                />
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-gray-700 text-base">
                                    {item.name}
                                  </span>
                                  <span className="text-gray-500 text-xs">
                                    (${item.cost_per_unit?.toFixed(2)}/
                                    {item.unit_type})
                                  </span>
                                  {item.location_id && (
                                    <Badge
                                      variant="outline"
                                      className="text-xs ml-1"
                                    >
                                      Local
                                    </Badge>
                                  )}
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Quantity</label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="e.g., 1"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                    />
                    {selectedInventoryId && (
                      <Badge
                        variant="outline"
                        className="shrink-0 h-10 px-3 flex items-center"
                      >
                        {unaddedItems.find((i) => i.id === selectedInventoryId)
                          ?.unit_type || "units"}
                      </Badge>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsAddDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleAdd}
              disabled={
                addMutation.isPending || !selectedInventoryId || !quantity
              }
            >
              {addMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Add Ingredient
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Quantity Dialog */}
      <Dialog
        open={!!editingIngredient}
        onOpenChange={(open) => !open && setEditingIngredient(null)}
      >
        <DialogContent className="sm:max-w-[350px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit2 className="h-5 w-5 text-primary" />
              Edit Quantity
            </DialogTitle>
            <DialogDescription>
              Update quantity for {editingIngredient?.inventory_item?.name}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Quantity</label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  autoFocus
                />
                <Badge
                  variant="outline"
                  className="shrink-0 h-10 px-3 flex items-center"
                >
                  {editingIngredient?.inventory_item?.unit_type || "units"}
                </Badge>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditingIngredient(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleUpdate}
              disabled={updateMutation.isPending || !quantity}
            >
              {updateMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
