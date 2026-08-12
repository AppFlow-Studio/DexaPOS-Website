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
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  GetRecipesForMenuItem,
  AddRecipeIngredient,
  UpdateRecipeIngredient,
  RemoveRecipeIngredient,
  GetInventoryItemsForRecipe,
  RecipeIngredient,
  UpdateMenuItemRecipe,
} from "@/app/dashboard/actions/recipes";

interface RecipeManagerProps {
  menuItemId: string;
  menuItemName: string;
  clerkOrgId?: string; // Optional for Admin portal
  merchantId?: string; // Preferred for Admin portal
  locationId?: string | null;
  isEditable?: boolean; // Only allow editing when in global view for global items
}

export function RecipeManager({
  menuItemId,
  menuItemName,
  clerkOrgId = "",
  merchantId,
  locationId,
  isEditable = true,
}: RecipeManagerProps) {
  const queryClient = useQueryClient();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [openCombobox, setOpenCombobox] = useState(false);
  const [editingIngredient, setEditingIngredient] =
    useState<RecipeIngredient | null>(null);
  const [selectedInventoryId, setSelectedInventoryId] = useState<string>("");
  const [quantity, setQuantity] = useState<string>("");

  // Fetch recipe
  const { data: recipeData, isLoading } = useQuery({
    queryKey: ["menu-item-recipe", menuItemId],
    queryFn: () => GetRecipesForMenuItem(menuItemId),
    enabled: !!menuItemId,
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
        "[RecipeManager] Adding ingredient, new list:",
        newRecipeItems
      );
      return UpdateMenuItemRecipe(menuItemId, newRecipeItems, locationId);
    },
    onSuccess: (result) => {
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Ingredient added to recipe");
        queryClient.invalidateQueries({
          queryKey: ["menu-item-recipe", menuItemId],
        });
        setIsAddDialogOpen(false);
        setSelectedInventoryId("");
        setQuantity("");
      }
    },
    onError: (err) => {
      console.error("[RecipeManager] Add mutation error:", err);
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
        "[RecipeManager] Updating ingredient, new list:",
        newRecipeItems
      );
      return UpdateMenuItemRecipe(menuItemId, newRecipeItems, locationId);
    },
    onSuccess: (result) => {
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Quantity updated");
        queryClient.invalidateQueries({
          queryKey: ["menu-item-recipe", menuItemId],
        });
        setEditingIngredient(null);
        setQuantity("");
      }
    },
    onError: (err) => {
      console.error("[RecipeManager] Update mutation error:", err);
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
        "[RecipeManager] Removing ingredient, new list:",
        newRecipeItems
      );
      return UpdateMenuItemRecipe(menuItemId, newRecipeItems, locationId);
    },
    onSuccess: (result) => {
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Ingredient removed");
        queryClient.invalidateQueries({
          queryKey: ["menu-item-recipe", menuItemId],
        });
      }
    },
    onError: (err) => {
      console.error("[RecipeManager] Remove mutation error:", err);
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
      <Card className="rounded-3xl">
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
      <Card className="rounded-3xl">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ChefHat className="h-5 w-5 text-orange-500" />
                Recipe / Ingredients
              </CardTitle>
              <CardDescription>
                Inventory items used to make this menu item
              </CardDescription>
            </div>
            {isEditable && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsAddDialogOpen(true)}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Ingredient
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {ingredients.length === 0 ? (
            <div className="text-center py-8">
              <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                <Package className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium mb-1">No ingredients added</p>
              <p className="text-xs text-muted-foreground">
                Link inventory items to track ingredient costs
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Ingredients List */}
              {ingredients.map((ing) => {
                const item = ing.inventory_item;
                const lineCost = (item?.cost_per_unit || 0) * ing.quantity_used;

                return (
                  <div
                    key={ing.id}
                    className="group flex items-center justify-between rounded-2xl border-0 bg-muted/40 p-3"
                  >
                    <div className="flex min-w-0 items-center">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">
                            {item?.name || "Unknown Item"}
                          </span>
                          {item?.location_id ? (
                            <Badge variant="outline" className="text-xs gap-1">
                              <MapPin className="h-2.5 w-2.5" />
                              Local
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-xs gap-1 text-emerald-600 border-emerald-200 bg-emerald-50"
                            >
                              <Globe className="h-2.5 w-2.5" />
                              Global
                            </Badge>
                          )}
                        </div>
                        <div className="hidden text-xs text-muted-foreground sm:block">
                          {ing.quantity_used} {item?.unit_type} × $
                          {item?.cost_per_unit?.toFixed(2) || "0.00"}/
                          {item?.unit_type}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="font-semibold text-sm text-green-600">
                          ${lineCost.toFixed(2)}
                        </div>
                      </div>

                      {isEditable && (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setEditingIngredient(ing)}
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => removeMutation.mutate(ing.id)}
                            disabled={removeMutation.isPending}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Total Cost */}
              <div className="flex items-center justify-between pt-3 border-t">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-green-500" />
                  <span className="font-medium text-sm">Estimated Cost</span>
                </div>
                <div className="text-xl font-bold text-green-600">
                  ${totalCost.toFixed(2)}
                </div>
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
              Add an inventory item to the recipe for "{menuItemName}"
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {unaddedItems.length === 0 ? (
              <div className="text-center py-4">
                <AlertCircle className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  No more inventory items available to add.
                </p>
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
                                  {item.location_id ? (
                                    <Badge
                                      variant="outline"
                                      className="text-xs gap-1"
                                    >
                                      <MapPin className="h-2.5 w-2.5" />
                                      Local
                                    </Badge>
                                  ) : (
                                    <Badge
                                      variant="outline"
                                      className="text-xs gap-1 text-emerald-600 border-emerald-200 bg-emerald-50"
                                    >
                                      <Globe className="h-2.5 w-2.5" />
                                      Global
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
                      placeholder="e.g., 2.5"
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
              Update the quantity for {editingIngredient?.inventory_item?.name}
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
