"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus,
  MapPin,
  Globe,
  Tag,
  Loader2,
  Sliders,
  Search,
  Monitor,
  Smartphone,
  AlertCircle,
  Palette,
  X,
  Truck,
  Utensils,
  Receipt,
  Lock,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { CdnImageUploadField } from "@/components/ui/cdn-image-upload-field";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

// ============================================================================
// CONSTANTS
// ============================================================================

const CHANNELS = [
  { id: "pos", label: "POS", icon: Monitor },
  { id: "online", label: "Online", icon: Globe },
  { id: "kiosk", label: "Kiosk", icon: Smartphone },
] as const;

const TAX_CATEGORIES = [
  { value: "standard", label: "Standard Rate" },
  { value: "food", label: "Food & Beverage" },
  { value: "alcohol", label: "Alcohol" },
  { value: "exempt", label: "Tax Exempt" },
] as const;

const STOCK_MODES = [
  { value: "in_stock", label: "In Stock" },
  { value: "out_of_stock", label: "Out of Stock" },
  { value: "quantity", label: "Track Quantity" },
] as const;

const ALLERGENS = [
  "Dairy", "Eggs", "Fish", "Shellfish", "Tree Nuts",
  "Peanuts", "Wheat", "Soy", "Sesame",
] as const;

const MEAL_TYPES = [
  "Breakfast", "Lunch", "Dinner", "Snack", "Dessert", "Beverage",
] as const;

// ============================================================================
// COMPONENT
// ============================================================================

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
  const { pricingStrategy, dualPricingPercentage } = useEffectivePricing();
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
  const [deliveryPrice, setDeliveryPrice] = React.useState<number | null>(null);
  const [useDeliveryPrice, setUseDeliveryPrice] = React.useState(false);
  const [allergens, setAllergens] = React.useState<string[]>([]);
  const [mealTypes, setMealTypes] = React.useState<string[]>([]);
  const [cardBgColor, setCardBgColor] = React.useState("");
  const [availability, setAvailability] = React.useState(true);
  const [taxCategory, setTaxCategory] = React.useState("standard");
  const [isTaxExempt, setIsTaxExempt] = React.useState(false);
  const [stockTrackingMode, setStockTrackingMode] = React.useState("in_stock");
  const [availableChannels, setAvailableChannels] = React.useState<string[]>(["pos", "online", "kiosk"]);
  const [selectedCategories, setSelectedCategories] = React.useState<Set<string>>(new Set());
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
      setDeliveryPrice(null);
      setUseDeliveryPrice(false);
      setAllergens([]);
      setMealTypes([]);
      setCardBgColor("");
      setAvailability(true);
      setTaxCategory("standard");
      setIsTaxExempt(false);
      setStockTrackingMode("in_stock");
      setAvailableChannels(["pos", "online", "kiosk"]);
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
    if (description && description.length > 1000) {
      newErrors.description = "Description must be less than 1000 characters";
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
            availability,
            allergens: allergens.length > 0 ? allergens : undefined,
            cardBgColor: cardBgColor || undefined,
            stockTrackingMode: stockTrackingMode,
            mealTypes: mealTypes.length > 0 ? mealTypes : undefined,
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
          await imageUpload
            .cleanupUploadedAsset(uploadedAsset.storagePath)
            .catch(console.error);
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
        await imageUpload
          .cleanupUploadedAsset(uploadedAsset.storagePath)
          .catch(console.error);
      }
      console.error("Error creating item:", error);
      toast.error("Failed to create item");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="bg-slate-950/40 backdrop-blur-md"
        className="w-full max-w-[calc(100vw-1rem)] gap-0 overflow-hidden rounded-[28px] border border-slate-200/80 bg-background/95 p-0 shadow-[0_30px_100px_rgba(15,23,42,0.26)] sm:max-w-5xl xl:max-w-6xl"
      >
        <div className="flex max-h-[min(92vh,960px)] flex-col">
          <DialogHeader className="border-b border-border/70 bg-background/95 px-6 py-5 pr-14 text-left sm:text-left">
            <div className="space-y-2">
              <DialogTitle className="flex items-center gap-2 text-[1.625rem] font-semibold tracking-tight">
                New Menu Item
              </DialogTitle>
              <DialogDescription className="max-w-[60ch] text-sm leading-6">
                Configure item details, pricing, and availability.
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className="min-h-0 flex flex-1 flex-col overflow-hidden lg:flex-row">
            {/* LEFT COLUMN - FORM */}
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              {/* Context Banner */}
              <div className="mb-6 p-3 rounded-lg bg-primary/5 border border-primary/20">
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

              <Tabs defaultValue="general" className="w-full">
                <TabsList className="w-full justify-start mb-6 bg-transparent border-b rounded-none h-auto p-0 gap-6 overflow-x-auto">
                  <TabsTrigger
                    value="general"
                    className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 py-2 shrink-0"
                  >General</TabsTrigger>
                  <TabsTrigger
                    value="pricing"
                    className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 py-2 shrink-0"
                  >Pricing</TabsTrigger>
                  <TabsTrigger
                    value="modifiers"
                    className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 py-2 shrink-0"
                  >Modifiers</TabsTrigger>
                  <TabsTrigger
                    value="recipe"
                    className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 py-2 shrink-0"
                  >Recipe</TabsTrigger>
                  <TabsTrigger
                    value="tax"
                    className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 py-2 shrink-0"
                  >Tax &amp; Fees</TabsTrigger>
                  <TabsTrigger
                    value="availability"
                    className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 py-2 shrink-0"
                  >Availability</TabsTrigger>
                </TabsList>

                {/* GENERAL TAB */}
                <TabsContent value="general" className="space-y-6 mt-0">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between mb-2">
                      <Badge variant="outline" className="text-xs font-normal">BASIC INFORMATION</Badge>
                    </div>

                    {/* Name */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Item Name *</label>
                      <Input
                        autoFocus
                        type="text"
                        placeholder="e.g. Americano"
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
                        placeholder="Espresso shots with hot water..."
                        className="resize-none"
                        rows={3}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                      />
                      {errors.description && (
                        <p className="text-sm text-red-500">{errors.description}</p>
                      )}
                    </div>

                    {/* Image Upload */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Image</label>
                      <CdnImageUploadField
                        disabled={isSaving}
                        helperText="Uploads to Bunny CDN when you save the item."
                        onClear={imageUpload.clear}
                        onFileSelect={imageUpload.selectFile}
                        previewUrl={imageUpload.previewUrl}
                        selectedFileName={imageUpload.selectedFileName}
                        uploadLabel="Upload item image"
                        uploading={imageUpload.isUploading}
                      />
                    </div>

                    {/* Card Background Color */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium flex items-center gap-2">
                        <Palette className="h-4 w-4" /> Card Background Color
                      </label>
                      <div className="flex items-center gap-3">
                        <input
                          type="color"
                          value={cardBgColor || "#ffffff"}
                          onChange={(e) => setCardBgColor(e.target.value)}
                          className="h-9 w-12 rounded border cursor-pointer"
                        />
                        <Input
                          placeholder="#ffffff"
                          className="flex-1"
                          value={cardBgColor}
                          onChange={(e) => setCardBgColor(e.target.value)}
                        />
                        {cardBgColor && (
                          <Button type="button" size="sm" variant="ghost" onClick={() => setCardBgColor("")}>
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">Custom background color for the POS menu card</p>
                    </div>

                    <Separator className="my-4" />

                    {/* Allergens */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium flex items-center gap-2">
                        <AlertCircle className="h-4 w-4" /> Allergens
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {ALLERGENS.map((allergen) => {
                          const isSelected = allergens.includes(allergen);
                          return (
                            <Badge
                              key={allergen}
                              variant={isSelected ? "default" : "outline"}
                              className={cn(
                                "cursor-pointer transition-colors",
                                isSelected ? "bg-red-600 hover:bg-red-700" : "hover:bg-muted",
                              )}
                              onClick={() => {
                                setAllergens((prev) =>
                                  isSelected
                                    ? prev.filter((a) => a !== allergen)
                                    : [...prev, allergen],
                                );
                              }}
                            >
                              {allergen}
                            </Badge>
                          );
                        })}
                      </div>
                      <p className="text-xs text-muted-foreground">Select all allergens present in this item</p>
                    </div>

                    {/* Meal Types */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium flex items-center gap-2">
                        <Utensils className="h-4 w-4" /> Meal Types
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {MEAL_TYPES.map((mealType) => {
                          const isSelected = mealTypes.includes(mealType);
                          return (
                            <Badge
                              key={mealType}
                              variant={isSelected ? "default" : "outline"}
                              className={cn(
                                "cursor-pointer transition-colors",
                                isSelected ? "" : "hover:bg-muted",
                              )}
                              onClick={() => {
                                setMealTypes((prev) =>
                                  isSelected
                                    ? prev.filter((m) => m !== mealType)
                                    : [...prev, mealType],
                                );
                              }}
                            >
                              {mealType}
                            </Badge>
                          );
                        })}
                      </div>
                      <p className="text-xs text-muted-foreground">Categorize when this item is typically served</p>
                    </div>
                  </div>
                </TabsContent>

                {/* PRICING TAB */}
                <TabsContent value="pricing" className="space-y-6 mt-0">
                  <div className="space-y-4">
                    <PriceInputGroup
                      price={price}
                      cashPrice={cashPrice}
                      onPriceChange={setPrice}
                      onCashPriceChange={setCashPrice}
                      label="Base Price"
                      pricingStrategy={pricingStrategy}
                      dualPricingPercentage={dualPricingPercentage}
                    />
                    {errors.price && (
                      <p className="text-sm text-red-500">{errors.price}</p>
                    )}
                    {errors.cashPrice && (
                      <p className="text-sm text-red-500">{errors.cashPrice}</p>
                    )}
                    <Separator />
                    <div className="space-y-4">
                      <div className="flex items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <label className="text-base font-medium flex items-center gap-2">
                            <Truck className="h-4 w-4" /> Use Delivery Price
                          </label>
                          <p className="text-sm text-muted-foreground">Enable a separate price for delivery orders</p>
                        </div>
                        <Switch checked={useDeliveryPrice} onCheckedChange={setUseDeliveryPrice} />
                      </div>
                      {useDeliveryPrice && (
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Delivery Price</label>
                          <div className="relative">
                            <Truck className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              className="pl-9"
                              placeholder="e.g. 12.99"
                              value={deliveryPrice ?? ""}
                              onChange={(e) =>
                                setDeliveryPrice(e.target.value ? parseFloat(e.target.value) : null)
                              }
                            />
                          </div>
                          <p className="text-xs text-muted-foreground">Price charged when item is ordered for delivery</p>
                        </div>
                      )}
                    </div>
                  </div>
                </TabsContent>

                {/* MODIFIERS TAB */}
                <TabsContent value="modifiers" className="space-y-6 mt-0">
                  <div className="space-y-6">
                    <div className="space-y-3">
                      <h4 className="text-sm font-medium text-muted-foreground">Assigned Groups</h4>
                      {selectedModifiers.size === 0 ? (
                        <p className="text-sm text-muted-foreground italic">No modifier groups assigned.</p>
                      ) : (
                        <div className="space-y-2">
                          {modifierGroups
                            .filter((g) => selectedModifiers.has(g.id))
                            .map((group) => (
                              <div
                                key={group.id}
                                className="flex items-center justify-between p-3 rounded-lg border bg-background group hover:border-primary/50 transition-colors"
                              >
                                <div className="flex items-center gap-3">
                                  <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                                    <Layers className="h-4 w-4 text-muted-foreground" />
                                  </div>
                                  <div>
                                    <p className="font-medium text-sm">{group.name}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {group.modifier_group_items?.length ?? 0} options
                                    </p>
                                  </div>
                                </div>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                  onClick={() => handleToggleModifier(group.id)}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>

                    <Separator />

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-medium text-muted-foreground">Available Groups</h4>
                        {modifierGroups.length > 3 && (
                          <div className="relative w-50">
                            <Search className="absolute left-2 top-2 h-3 w-3 text-muted-foreground" />
                            <Input
                              placeholder="Search..."
                              className="h-8 pl-7 text-xs"
                              value={modifierSearch}
                              onChange={(e) => setModifierSearch(e.target.value)}
                            />
                          </div>
                        )}
                      </div>

                      {modifierGroups.length === 0 ? (
                        <div className="p-4 rounded-lg border bg-muted/30 text-center">
                          <Sliders className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                          <p className="text-sm text-muted-foreground">
                            No modifier groups available. Create modifier groups first.
                          </p>
                        </div>
                      ) : (
                        <div className="grid gap-2 max-h-75 overflow-y-auto">
                          {filteredModifierGroups
                            .filter((g) => !selectedModifiers.has(g.id))
                            .map((group) => (
                              <div
                                key={group.id}
                                className="flex items-center justify-between p-2 rounded-lg border border-dashed hover:bg-muted/50 transition-colors"
                              >
                                <div className="flex items-center gap-3">
                                  <div className="h-8 w-8 rounded bg-muted/50 flex items-center justify-center">
                                    <Sliders className="h-4 w-4 text-muted-foreground opacity-50" />
                                  </div>
                                  <div>
                                    <p className="font-medium text-sm">{group.name}</p>
                                    <div className="flex items-center gap-2">
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
                                      <span className="text-xs text-muted-foreground">
                                        {group.modifier_group_items?.length ?? 0} options
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2 text-primary"
                                  onClick={() => handleToggleModifier(group.id)}
                                >
                                  <Plus className="h-3 w-3 mr-1" /> Add
                                </Button>
                              </div>
                            ))}
                          {filteredModifierGroups.filter((g) => !selectedModifiers.has(g.id)).length === 0 && (
                            <p className="text-xs text-muted-foreground text-center py-4">
                              {modifierSearch ? "No modifier groups match your search" : "No other modifier groups available."}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </TabsContent>

                {/* RECIPE TAB */}
                <TabsContent value="recipe" className="space-y-6 mt-0">
                  <div className="flex flex-col items-center justify-center p-12 text-center bg-muted/20 border border-dashed rounded-lg">
                    <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
                      <Lock className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-medium">Recipe Management Locked</h3>
                    <p className="text-sm text-muted-foreground max-w-sm mt-2">
                      Please create and save the item first. Once created, you can add ingredients and manage recipe costs.
                    </p>
                  </div>
                </TabsContent>

                {/* TAX TAB */}
                <TabsContent value="tax" className="space-y-6 mt-0">
                  <div className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <label className="text-base font-medium">Tax Exempt</label>
                      <p className="text-sm text-muted-foreground">No tax will be applied to this item</p>
                    </div>
                    <Switch checked={isTaxExempt} onCheckedChange={setIsTaxExempt} />
                  </div>
                  {!isTaxExempt && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Tax Category</label>
                      <Select value={taxCategory} onValueChange={setTaxCategory}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TAX_CATEGORIES.map((cat) => (
                            <SelectItem key={cat.value} value={cat.value}>
                              {cat.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </TabsContent>

                {/* AVAILABILITY TAB */}
                <TabsContent value="availability" className="space-y-6 mt-0">
                  <div className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <label className="text-base font-medium">Available</label>
                      <p className="text-sm text-muted-foreground">Item is available for purchase</p>
                    </div>
                    <Switch checked={availability} onCheckedChange={setAvailability} />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium mb-3 block">Sales Channels</label>
                    <div className="grid grid-cols-3 gap-3">
                      {CHANNELS.map((channel) => {
                        const Icon = channel.icon;
                        const isChecked = availableChannels.includes(channel.id);
                        return (
                          <label
                            key={channel.id}
                            className={cn(
                              "flex flex-col items-center gap-2 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-all",
                              isChecked
                                ? "border-primary bg-primary/5 ring-1 ring-primary"
                                : "text-muted-foreground",
                            )}
                          >
                            <Checkbox
                              checked={isChecked}
                              onCheckedChange={(checked) => {
                                setAvailableChannels((prev) =>
                                  checked
                                    ? [...prev, channel.id]
                                    : prev.filter((id) => id !== channel.id),
                                );
                              }}
                              className="sr-only"
                            />
                            <Icon className={cn("h-6 w-6", isChecked ? "text-primary" : "opacity-50")} />
                            <span className="text-xs font-medium">{channel.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Stock Tracking</label>
                    <Select value={stockTrackingMode} onValueChange={setStockTrackingMode}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select tracking mode" />
                      </SelectTrigger>
                      <SelectContent>
                        {STOCK_MODES.map((mode) => (
                          <SelectItem key={mode.value} value={mode.value}>
                            {mode.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">How should inventory be tracked for this item?</p>
                  </div>

                  {/* Category Selection */}
                  <div className="space-y-4 rounded-xl border border-border/70 bg-background p-4">
                    <div className="flex items-center gap-2">
                      <Tag className="h-4 w-4 text-blue-500" />
                      <label className="text-sm font-medium">Categories</label>
                      {selectedCategories.size > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          {selectedCategories.size}
                        </Badge>
                      )}
                    </div>

                    {selectedCategories.size === 0 && accessibleCategories.length > 0 && (
                      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                        <div className="space-y-1">
                          <p className="font-medium text-amber-800">Select at least one category</p>
                          <p className="text-xs text-amber-700">
                            New items need a category before save.
                          </p>
                        </div>
                      </div>
                    )}

                    {errors.categories && (
                      <p className="text-sm text-red-500">{errors.categories}</p>
                    )}

                    {accessibleCategories.length === 0 ? (
                      <div className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                        <Tag className="mx-auto mb-2 h-8 w-8 opacity-50" />
                        <p>No categories available in this scope.</p>
                        <p className="mt-1 text-xs">
                          {isAllLocations
                            ? "Create a global category first."
                            : "Create a category for this location first."}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex flex-wrap gap-2">
                          {accessibleCategories.map((category) => {
                            const isSelected = selectedCategories.has(category.id);
                            return (
                              <button
                                key={category.id}
                                type="button"
                                onClick={() => handleToggleCategory(category.id)}
                                className={cn(
                                  "rounded-full border px-3 py-1.5 text-sm font-medium transition-all hover:scale-[1.02] active:scale-[0.99]",
                                  isSelected
                                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                                    : "border-border bg-background hover:border-primary/40 hover:bg-muted/40",
                                )}
                              >
                                {category.name}
                              </button>
                            );
                          })}
                        </div>
                        {selectedCategories.size > 0 && (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                            onClick={() => setSelectedCategories(new Set())}
                          >
                            <X className="h-3 w-3" />
                            Clear category selections
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </div>

            {/* RIGHT COLUMN - PREVIEW */}
            <div className="hidden min-h-0 w-90 shrink-0 overflow-y-auto border-l border-border/70 bg-muted/10 px-6 py-5 lg:block">
              <div className="space-y-8 pb-4">
                <div className="flex items-center gap-2 mb-4 text-sm font-medium text-muted-foreground">
                  <Monitor className="h-4 w-4" /> POS Preview
                </div>

                <ItemPreviewCard
                  name={name || "New Item"}
                  description={description || ""}
                  price={price || 0}
                  cashPrice={cashPrice ?? undefined}
                  image={imageUpload.previewUrl ?? undefined}
                  categories={selectedCategoryNames}
                  availability={availability}
                  expandDescription
                />

                <div>
                  <div className="flex items-center gap-2 mb-2 text-sm font-medium text-muted-foreground">
                    <Tag className="h-4 w-4" /> Allergens
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {allergens.length > 0
                      ? allergens.map((a) => (
                          <Badge key={a} variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200">
                            {a}
                          </Badge>
                        ))
                      : <p className="text-xs text-muted-foreground italic">No allergens selected</p>}
                  </div>
                </div>

                {mealTypes.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2 text-sm font-medium text-muted-foreground">
                      <Utensils className="h-4 w-4" /> Meal Types
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {mealTypes.map((m) => (
                        <Badge key={m} variant="outline" className="text-xs">
                          {m}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {useDeliveryPrice && deliveryPrice != null && (
                  <div>
                    <div className="flex items-center gap-2 mb-2 text-sm font-medium text-muted-foreground">
                      <Truck className="h-4 w-4" /> Delivery Price
                    </div>
                    <p className="text-lg font-semibold">${deliveryPrice.toFixed(2)}</p>
                  </div>
                )}

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
              disabled={isSaving}
            >
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Item
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
