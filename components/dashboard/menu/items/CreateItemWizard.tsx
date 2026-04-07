"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, MapPin, Globe, Tag, DollarSign, Loader2, Sliders, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { CdnImageUploadField } from "@/components/ui/cdn-image-upload-field";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useMerchantCdnImageUpload } from "@/lib/cdn/use-merchant-cdn-image-upload";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CategoryWithItems } from "@/types/menu";
import { useUserInfo } from "@/app/manage/hooks/useUserInfo.";
import {
  CreateItemInCategory,
  AddItemToCategory,
  AssignModifierToItem,
} from "@/app/dashboard/actions/item-assignments";
import { useModifierGroups } from "@/app/dashboard/hooks/useModifierGroups";
import { PriceInputGroup } from "@/components/dashboard/locations/PriceInputGroup";
import { useEffectivePricing } from "@/app/dashboard/hooks/useEffectivePricing";
import { ItemPreviewCard } from "@/components/dashboard/menu/ItemPreviewCard";

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
  // Use effective pricing (resolves merchant vs location)
  const {
    pricingStrategy,
    dualPricingPercentage,
  } = useEffectivePricing();
  const { data: rawModifierGroups = [] } = useModifierGroups(
    clerkOrgId,
    isAllLocations ? null : selectedLocationId,
  );
  const isDualPricing = pricingStrategy === "dual";
  const imageUpload = useMerchantCdnImageUpload({
    merchantId,
    category: "menu-items",
    fileNamePrefix: "item",
  });


  // Form state
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [price, setPrice] = React.useState<number>(0);
  const [cashPrice, setCashPrice] = React.useState<number | null>(null);
  const [selectedCategories, setSelectedCategories] = React.useState<
    Set<string>
  >(new Set());
  const [selectedModifiers, setSelectedModifiers] = React.useState<Set<string>>(new Set());
  const [modifierSearch, setModifierSearch] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  // Filter categories based on location context
  const accessibleCategories = React.useMemo(() => {
    return categoriesList.filter((c) =>
      isAllLocations ? c.is_global : c.location_id === selectedLocationId,
    );
  }, [categoriesList, isAllLocations, selectedLocationId]);
  const selectedCategoryNames = React.useMemo(
    () =>
      accessibleCategories
        .filter((category) => selectedCategories.has(category.id))
        .map((category) => category.name),
    [accessibleCategories, selectedCategories],
  );

  const modifierGroups = rawModifierGroups as Array<{
    id: string;
    name: string;
    description: string | null;
    is_required: boolean;
    location_id: string | null;
    modifier_group_items?: { id: string }[];
  }>;

  const filteredModifierGroups = React.useMemo(() => {
    if (!modifierSearch.trim()) return modifierGroups;
    const lower = modifierSearch.toLowerCase();
    return modifierGroups.filter((g) => g.name.toLowerCase().includes(lower));
  }, [modifierGroups, modifierSearch]);

  // Reset on close
  React.useEffect(() => {
    if (!open) {
      setName("");
      setDescription("");
      setPrice(0);
      setCashPrice(null);
      imageUpload.reset(null);
      setSelectedCategories(new Set());
      setSelectedModifiers(new Set());
      setModifierSearch("");
      setErrors({});
    }
  }, [imageUpload.reset, open]);

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

  const handleToggleModifier = React.useCallback((groupId: string) => {
    setSelectedModifiers((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

  const handleCreateItem = async () => {
    let uploadedAsset: { cdnUrl: string; storagePath: string } | undefined;

    if (!validate()) {
      toast.error("Please fix the errors in the form");
      return;
    }

    if (!clerkOrgId) {
      toast.error("Organization not found");
      return;
    }

    if (imageUpload.hasPendingChange && !merchantId) {
      toast.error("Merchant not found");
      return;
    }

    setIsSaving(true);

    try {
      const resolvedImage = await imageUpload.resolveImageValue();
      uploadedAsset = resolvedImage.uploadedAsset;
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
            image: resolvedImage.value || undefined,
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

      // Assign modifier groups after item creation
      if (createdItemId && selectedModifiers.size > 0) {
        await Promise.allSettled(
          Array.from(selectedModifiers).map((groupId) =>
            AssignModifierToItem(createdItemId!, groupId),
          ),
        );
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
        if (uploadedAsset) {
          await imageUpload.cleanupUploadedAsset(uploadedAsset.storagePath).catch(console.error);
        }
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
      if (uploadedAsset) {
        await imageUpload.cleanupUploadedAsset(uploadedAsset.storagePath).catch(console.error);
      }
      console.error("Error creating item:", error);
      toast.error("Failed to create item");
    } finally {
      setIsSaving(false);
    }
  };

  const isFormValid = name.trim().length >= 2 && selectedCategories.size > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="bg-slate-950/40 backdrop-blur-md"
        className="w-full max-w-[calc(100vw-1rem)] gap-0 overflow-hidden rounded-[28px] border border-slate-200/80 bg-background/95 p-0 shadow-[0_30px_100px_rgba(15,23,42,0.26)] sm:max-w-5xl"
      >
        <div className="flex max-h-[min(92vh,920px)] flex-col">
        <DialogHeader className="border-b border-border/70 bg-background/95 px-6 py-5 pr-14 text-left sm:text-left">
          <DialogTitle className="flex items-center gap-2 text-[1.625rem] font-semibold tracking-tight">
            <Plus className="h-5 w-5 text-primary" />
            Create New Item
          </DialogTitle>
          <DialogDescription className="max-w-[60ch] text-sm leading-6">
            Create a new menu item and assign it to categories
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex flex-1 flex-col overflow-hidden lg:flex-row">
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
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
                autoFocus
                type="text"
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
                pricingStrategy={pricingStrategy}
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

            {/* Item Image */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Item Image</label>
              <CdnImageUploadField
                disabled={isSaving}
                helperText="Uploads to Bunny CDN when you create the item."
                onClear={imageUpload.clear}
                onFileSelect={imageUpload.selectFile}
                previewUrl={imageUpload.previewUrl}
                selectedFileName={imageUpload.selectedFileName}
                uploadLabel="Upload item image"
                uploading={imageUpload.isUploading}
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
            {/* Modifier Groups */}
            <div className="space-y-3">
              <label className="text-base font-semibold">
                Modifier Groups{" "}
                <span className="text-muted-foreground text-sm font-normal">
                  (Optional)
                </span>
              </label>
              {modifierGroups.length === 0 ? (
                <div className="p-4 rounded-lg border bg-muted/30 text-center">
                  <Sliders className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">
                    No modifier groups available. Create modifier groups first.
                  </p>
                </div>
              ) : (
                <>
                  {modifierGroups.length > 3 && (
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                      <Input
                        type="text"
                        placeholder="Search modifier groups..."
                        value={modifierSearch}
                        onChange={(e) => setModifierSearch(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                  )}
                  <div className="space-y-2 max-h-48 overflow-y-auto border rounded-lg p-3">
                    {filteredModifierGroups.map((group) => {
                      const isSelected = selectedModifiers.has(group.id);
                      return (
                        <label
                          key={group.id}
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
                              handleToggleModifier(group.id)
                            }
                            className="shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-medium text-sm">
                                {group.name}
                              </h4>
                              <span
                                className={cn(
                                  "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                                  group.is_required
                                    ? "bg-red-50 text-red-600 border-red-200"
                                    : "bg-blue-50 text-blue-600 border-blue-200",
                                )}
                              >
                                {group.is_required ? "Required" : "Optional"}
                              </span>
                              {group.modifier_group_items &&
                                group.modifier_group_items.length > 0 && (
                                  <span className="text-xs text-muted-foreground">
                                    {group.modifier_group_items.length} option
                                    {group.modifier_group_items.length !== 1
                                      ? "s"
                                      : ""}
                                  </span>
                                )}
                            </div>
                            {group.description && (
                              <p className="text-xs text-muted-foreground truncate mt-1">
                                {group.description}
                              </p>
                            )}
                          </div>
                        </label>
                      );
                    })}
                    {filteredModifierGroups.length === 0 && modifierSearch && (
                      <p className="text-sm text-muted-foreground text-center py-2">
                        No modifier groups match your search
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="hidden min-h-0 w-[360px] shrink-0 overflow-y-auto border-l border-border/70 bg-muted/10 px-6 py-5 lg:block">
          <div className="space-y-6 pb-4">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Plus className="h-4 w-4" />
              Item Preview
            </div>

            <ItemPreviewCard
              name={name || "New Item"}
              description={description || ""}
              price={price || 0}
              cashPrice={cashPrice ?? undefined}
              image={imageUpload.previewUrl ?? undefined}
              categories={selectedCategoryNames}
              availability
              expandDescription
            />

            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Tag className="h-4 w-4" />
                {selectedCategoryNames.length > 0
                  ? `${selectedCategoryNames.length} categor${selectedCategoryNames.length === 1 ? "y" : "ies"} selected`
                  : "No categories selected yet"}
              </div>
              {selectedModifiers.size > 0 && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Sliders className="h-4 w-4" />
                  {selectedModifiers.size} modifier group{selectedModifiers.size !== 1 ? "s" : ""} selected
                </div>
              )}
              {!isAllLocations && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                  Location-scoped item
                </div>
              )}
            </div>
          </div>
        </div>
        </div>

        <DialogFooter className="shrink-0 border-t border-border/70 bg-background/95 px-6 py-4 sm:justify-end">
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
              className="gap-2 min-w-[150px]"
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
        </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
