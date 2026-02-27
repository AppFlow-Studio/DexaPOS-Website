"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, MapPin, Globe, Tag, DollarSign, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  BottomSheet,
  BottomSheetContent,
  BottomSheetHeader,
  BottomSheetBody,
  BottomSheetFooter,
  BottomSheetTitle,
  BottomSheetDescription,
} from "@/components/ui/bottom-sheet";
import { CategoryWithItems } from "@/types/menu";
import { useUserInfo } from "@/app/manage/hooks/useUserInfo.";
import { useLocationStore } from "@/stores/location-store";
import {
  CreateItemInCategory,
  AddItemToCategory,
} from "@/app/dashboard/actions/item-assignments";
import { PriceInputGroup } from "@/components/dashboard/locations/PriceInputGroup";

interface CreateItemWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clerkOrgId: string;
  categoriesList: CategoryWithItems[];
  isAllLocations: boolean;
  selectedLocationId: string | null;
  onSuccess?: () => void;
}

export function CreateItemWizard({
  open,
  onOpenChange,
  clerkOrgId,
  categoriesList,
  isAllLocations,
  selectedLocationId,
  onSuccess,
}: CreateItemWizardProps) {
  const queryClient = useQueryClient();
  const { data: userInfo } = useUserInfo();
  const merchantId = userInfo?.members?.[0]?.organizations?.merchants?.id || "";
  const { locations } = useLocationStore();
  
  // Get location details for dual pricing context
  const targetLocation = React.useMemo(() => {
    if (isAllLocations || !selectedLocationId) return null;
    return locations.find(l => l.id === selectedLocationId);
  }, [locations, selectedLocationId, isAllLocations]);

  // Check if current location uses dual pricing
  const pricingStrategy = (targetLocation as any)?.pricing_strategy || "manual";
  const dualPricingPercentage = (targetLocation as any)?.dual_pricing_percentage || 4.0;
  const isDualPricing = pricingStrategy === "dual";


  // Form state
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [price, setPrice] = React.useState<number>(0);
  const [cashPrice, setCashPrice] = React.useState<number | null>(null);
  const [image, setImage] = React.useState("");
  const [selectedCategories, setSelectedCategories] = React.useState<
    Set<string>
  >(new Set());
  const [isSaving, setIsSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  // Filter categories based on location context
  const accessibleCategories = React.useMemo(() => {
    return categoriesList.filter((c) =>
      isAllLocations ? c.is_global : c.location_id === selectedLocationId,
    );
  }, [categoriesList, isAllLocations, selectedLocationId]);

  // Reset on close
  React.useEffect(() => {
    if (!open) {
      setName("");
      setDescription("");
      setPrice(0);
      setCashPrice(null);
      setImage("");
      setSelectedCategories(new Set());
      setErrors({});
    }
  }, [open]);

  // Validation
  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!name || name.trim().length < 2) {
      newErrors.name = "Name must be at least 2 characters";
    }
    if (name.length > 100) {
      newErrors.name = "Name must be less than 100 characters";
    }
    if (description && description.length > 500) {
      newErrors.description = "Description must be less than 500 characters";
    }
    if (price < 0) {
      newErrors.price = "Price must be positive";
    }
    if (cashPrice !== null && cashPrice < 0) {
      newErrors.cashPrice = "Cash price must be positive";
    }
    if (selectedCategories.size === 0) {
      newErrors.categories = "Please select at least one category";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleToggleCategory = React.useCallback((categoryId: string) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  }, []);

  const handleCreateItem = async () => {
    if (!validate()) {
      toast.error("Please fix the errors in the form");
      return;
    }

    if (!clerkOrgId) {
      toast.error("Organization not found");
      return;
    }

    setIsSaving(true);

    try {
      const categoryIds = Array.from(selectedCategories);
      let successCount = 0;
      let errorCount = 0;
      let createdItemId: string | null = null;

      // Create item in first category, then add to others
      for (let i = 0; i < categoryIds.length; i++) {
        const categoryId = categoryIds[i];
        const result = await CreateItemInCategory(
          clerkOrgId,
          categoryId,
          {
            name: name.trim(),
            description: description.trim() || undefined,
            price,
            cashPrice: cashPrice ?? undefined,
            image: image.trim() || undefined,
          },
          {
            locationId: isAllLocations ? null : selectedLocationId,
          },
        );

        if (result.error) {
          errorCount++;
          console.error(
            `Failed to create item in category ${categoryId}:`,
            result.error,
          );
        } else {
          successCount++;
          if (i === 0 && result.data) {
            createdItemId = result.data.id;
          }
        }

        // For subsequent categories, add the item to them
        if (i > 0 && createdItemId && merchantId) {
          const addResult = await AddItemToCategory(
            categoryId,
            createdItemId,
            merchantId,
            undefined,
            undefined,
            undefined,
            isAllLocations ? null : selectedLocationId,
          );
          if (addResult.error) {
            errorCount++;
          } else {
            successCount++;
          }
        }
      }

      if (successCount > 0) {
        toast.success(
          `Item created and added to ${successCount} categor${
            successCount !== 1 ? "ies" : "y"
          }`,
          {
            description:
              errorCount > 0
                ? `${errorCount} category assignment${
                    errorCount !== 1 ? "s" : ""
                  } failed`
                : undefined,
          },
        );
      } else {
        toast.error("Failed to create item", {
          description: "Please try again",
        });
        return;
      }

      queryClient.invalidateQueries({ queryKey: ["categories-with-items"] });
      queryClient.invalidateQueries({ queryKey: ["menu-items"] });
      queryClient.invalidateQueries({ queryKey: ["menu-items-flat"] });

      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Error creating item:", error);
      toast.error("Failed to create item");
    } finally {
      setIsSaving(false);
    }
  };

  const isFormValid = name.trim().length >= 2 && selectedCategories.size > 0;

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent className="h-[85vh]">
        <BottomSheetHeader>
          <BottomSheetTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" />
            Create New Item
          </BottomSheetTitle>
          <BottomSheetDescription>
            Create a new menu item and assign it to categories
          </BottomSheetDescription>
        </BottomSheetHeader>

        <BottomSheetBody className="flex-1 overflow-y-auto">
          {/* Context Banner */}
          <div className="mb-4 p-3 rounded-lg bg-primary/5 border border-primary/20">
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="h-4 w-4 text-primary" />
              <span className="font-medium">Creating for:</span>
              <Badge variant="outline" className="bg-background">
                {isAllLocations ? "All Locations (Global)" : "This Location"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {isAllLocations
                ? "This item will be available at all locations."
                : "This item will be specific to this location only."}
            </p>
            {isDualPricing && !isAllLocations && (
                 <div className="mt-2 text-xs flex items-center gap-1.5 text-blue-700 font-medium">
                    <div className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                    Dual Pricing Enabled at {dualPricingPercentage}%
                 </div>
            )}
          </div>

          <div className="space-y-4">
            {/* Name */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Item Name *</label>
              <Input
                placeholder="e.g., Margherita Pizza"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              {errors.name && (
                <p className="text-sm text-red-500">{errors.name}</p>
              )}
            </div>

            {/* Description */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Textarea
                placeholder="Describe your item..."
                className="resize-none"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              {errors.description && (
                <p className="text-sm text-red-500">{errors.description}</p>
              )}
            </div>

            {/* Prices */}
            <div className="space-y-2">
              <PriceInputGroup
                price={price}
                cashPrice={cashPrice}
                onPriceChange={setPrice}
                onCashPriceChange={setCashPrice}
                label="Price"
                pricingStrategy={isAllLocations ? 'manual' : pricingStrategy}
                dualPricingPercentage={dualPricingPercentage}
              />
              <div className="flex gap-4 px-4">
                <div className="flex-1">
                  {errors.price && (
                    <p className="text-sm text-red-500">{errors.price}</p>
                  )}
                </div>
                <div className="flex-1">
                  {errors.cashPrice && (
                    <p className="text-sm text-red-500">{errors.cashPrice}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Image URL */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Image URL</label>
              <Input
                placeholder="https://..."
                value={image}
                onChange={(e) => setImage(e.target.value)}
              />
            </div>

            {/* Category Selection */}
            <div className="space-y-3">
              <label className="text-base font-semibold">
                Assign to Categories *{" "}
                <span className="text-muted-foreground text-sm font-normal">
                  (Select at least one)
                </span>
              </label>
              {errors.categories && (
                <p className="text-sm text-red-500">{errors.categories}</p>
              )}
              {accessibleCategories.length === 0 ? (
                <div className="p-4 rounded-lg border bg-muted/30 text-center">
                  <Tag className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">
                    {isAllLocations
                      ? "No global categories available. Create a global category first."
                      : "No location-specific categories available. Create a category for this location first."}
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto border rounded-lg p-3">
                  {accessibleCategories.map((category) => {
                    const isSelected = selectedCategories.has(category.id);
                    return (
                      <label
                        key={category.id}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                          isSelected
                            ? "border-primary bg-primary/5 ring-1 ring-primary"
                            : "border-border hover:border-primary/30 hover:bg-muted/30",
                        )}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() =>
                            handleToggleCategory(category.id)
                          }
                          className="shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium text-sm">
                              {category.name}
                            </h4>
                            {category.is_global ? (
                              <Badge
                                variant="outline"
                                className="text-xs bg-emerald-50 text-emerald-600 border-emerald-200"
                              >
                                <Globe className="h-3 w-3 mr-1" />
                                Global
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-xs bg-purple-50 text-purple-600 border-purple-200"
                              >
                                <MapPin className="h-3 w-3 mr-1" />
                                Location
                              </Badge>
                            )}
                          </div>
                          {category.description && (
                            <p className="text-xs text-muted-foreground truncate mt-1">
                              {category.description}
                            </p>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </BottomSheetBody>

        <BottomSheetFooter className="border-t pt-4">
          <div className="flex items-center justify-between w-full">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>

            <Button
              onClick={handleCreateItem}
              disabled={isSaving || !isFormValid}
              className="gap-2"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Create Item
                </>
              )}
            </Button>
          </div>
        </BottomSheetFooter>
      </BottomSheetContent>
    </BottomSheet>
  );
}
