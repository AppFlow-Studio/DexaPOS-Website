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
import { CreateMenuItem } from "@/app/dashboard/actions/menu-items";
import { useModifierGroups } from "@/app/dashboard/hooks/useModifierGroups";
import { PriceInputGroup } from "@/components/dashboard/locations/PriceInputGroup";
import { useEffectivePricing } from "@/app/dashboard/hooks/useEffectivePricing";
import { useIsSingleLocation } from "@/stores/location-store";
import { ItemPreviewCard } from "@/components/dashboard/menu/ItemPreviewCard";
import {
  clearLocalStorageDraft,
  readLocalStorageDraft,
  writeLocalStorageDraft,
} from "@/lib/browser/local-storage-draft";
import { invalidateOrderOutSync } from "@/app/dashboard/hooks/useOrderOutMenuSync";

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

interface CreateItemWizardDraft {
  name: string;
  description: string;
  price: number;
  cashPrice: number | null;
  deliveryPrice: number | null;
  useDeliveryPrice: boolean;
  allergens: string[];
  mealTypes: string[];
  cardBgColor: string;
  availability: boolean;
  taxCategory: string;
  isTaxExempt: boolean;
  stockTrackingMode: string;
  availableChannels: string[];
  selectedCategories: string[];
  selectedModifiers: string[];
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
  const isSingleLocation = useIsSingleLocation();
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
  const draftHydratedRef = React.useRef(false);
  const draftKey = React.useMemo(() => {
    const scopeKey = isAllLocations ? "global" : selectedLocationId ?? "location-none";
    return merchantId
      ? `menu-item-draft:create-wizard:${merchantId}:${scopeKey}`
      : null;
  }, [isAllLocations, merchantId, selectedLocationId]);

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
      draftHydratedRef.current = false;
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

  React.useEffect(() => {
    if (!open || !draftKey || draftHydratedRef.current) return;

    const draft = readLocalStorageDraft<CreateItemWizardDraft>(draftKey);
    if (draft) {
      setName(draft.name ?? "");
      setDescription(draft.description ?? "");
      setPrice(draft.price ?? 0);
      setCashPrice(draft.cashPrice ?? null);
      setDeliveryPrice(draft.deliveryPrice ?? null);
      setUseDeliveryPrice(Boolean(draft.useDeliveryPrice));
      setAllergens(draft.allergens ?? []);
      setMealTypes(draft.mealTypes ?? []);
      setCardBgColor(draft.cardBgColor ?? "");
      setAvailability(draft.availability ?? true);
      setTaxCategory(draft.taxCategory ?? "standard");
      setIsTaxExempt(Boolean(draft.isTaxExempt));
      setStockTrackingMode(draft.stockTrackingMode ?? "in_stock");
      setAvailableChannels(draft.availableChannels ?? ["pos", "online", "kiosk"]);
      setSelectedCategories(new Set(draft.selectedCategories ?? []));
      setSelectedModifiers(new Set(draft.selectedModifiers ?? []));
    }

    draftHydratedRef.current = true;
  }, [draftKey, open]);

  React.useEffect(() => {
    if (!open || !draftKey || !draftHydratedRef.current) return;

    writeLocalStorageDraft(draftKey, {
      name,
      description,
      price,
      cashPrice,
      deliveryPrice,
      useDeliveryPrice,
      allergens,
      mealTypes,
      cardBgColor,
      availability,
      taxCategory,
      isTaxExempt,
      stockTrackingMode,
      availableChannels,
      selectedCategories: Array.from(selectedCategories),
      selectedModifiers: Array.from(selectedModifiers),
    } satisfies CreateItemWizardDraft);
  }, [
    allergens,
    availability,
    availableChannels,
    cardBgColor,
    cashPrice,
    deliveryPrice,
    draftKey,
    description,
    isTaxExempt,
    mealTypes,
    name,
    open,
    price,
    selectedCategories,
    selectedModifiers,
    stockTrackingMode,
    taxCategory,
    useDeliveryPrice,
  ]);

  // Field-label map for user-friendly toast messages
  const FIELD_LABELS: Record<string, string> = {
    name: "Name",
    description: "Description",
    price: "Price",
    cashPrice: "Cash Price",
  };

  // Validation — returns the errors map so callers can surface details immediately
  const validate = (): Record<string, string> => {
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

    setErrors(newErrors);
    return newErrors;
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

    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      const details = Object.entries(validationErrors)
        .map(([field, msg]) => `${FIELD_LABELS[field] ?? field}: ${msg}`)
        .join("\n");
      toast.error("Cannot create item", { description: details });
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

      // No category selected — create the item in the library without a category assignment
      if (categoryIds.length === 0) {
        const result = await CreateMenuItem(
          clerkOrgId,
          {
            name: name.trim(),
            description: description.trim() || undefined,
            price,
            cash_price: cashPrice ?? undefined,
            image: resolvedImage.value || undefined,
            availability,
            allergens: allergens.length > 0 ? allergens : undefined,
            card_bg_color: cardBgColor || undefined,
            stock_tracking_mode: stockTrackingMode as
              | "in_stock"
              | "out_of_stock"
              | "quantity",
          },
          isAllLocations ? null : selectedLocationId,
        );
        if (result.error) {
          errorCount++;
        } else {
          successCount++;
          createdItemId = (result as any).data?.id ?? null;
        }
      }

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
        if (draftKey) {
          clearLocalStorageDraft(draftKey);
        }
        const successMessage =
          categoryIds.length === 0
            ? "Item created"
            : `Item created and added to ${successCount} categor${
                successCount !== 1 ? "ies" : "y"
              }`;
        toast.success(successMessage, {
          description:
            errorCount > 0
              ? `${errorCount} category assignment${
                  errorCount !== 1 ? "s" : ""
                } failed`
              : undefined,
        });
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
      invalidateOrderOutSync(queryClient);

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
      {/* The dialog itself must NOT scroll: it owns `rounded-3xl`, and a scrollbar on
          the rounded element renders in its padding box — i.e. visually outside the
          corner. Instead this is a fixed-height flex column (header / scrolling body /
          footer) with `overflow-hidden`, so the rounded frame clips the body's
          scrollbar and header+footer stay put without needing `sticky`. */}
      <DialogContent
        overlayClassName="bg-background/60 backdrop-blur-md"
        // `max-sm:overflow-hidden` overrides the base `max-sm:overflow-y-auto` —
        // see the note in NewEditItemFormSheet: on mobile the base scrolls the
        // dialog itself and sets `h-dvh`, which with the inner scroll body gave
        // two scrollbars and dead space below the footer.
        className="flex max-h-[92vh] w-full max-w-[calc(100vw-1rem)] flex-col gap-0 overflow-hidden rounded-3xl border bg-card p-0 max-sm:h-dvh max-sm:max-h-none max-sm:overflow-hidden sm:max-w-5xl xl:max-w-6xl"
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <DialogHeader className="shrink-0 px-4 py-5 pr-14 text-left sm:px-6 sm:text-left">
            <div className="space-y-2">
              <DialogTitle className="flex items-center gap-2 text-[1.75rem] font-semibold tracking-[-0.02em]">
                New Menu Item
              </DialogTitle>
              <DialogDescription className="max-w-[60ch] text-sm leading-6">
                Configure item details, pricing, and availability.
              </DialogDescription>
            </div>
          </DialogHeader>

          {/* Body. On desktop each column scrolls independently so the preview
              does not ride along with the form; below `lg` the columns stack and
              the single left pane carries the scroll. */}
          <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden lg:flex-row">
            {/* LEFT COLUMN - FORM */}
            <div className="thin-scrollbar min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-5 sm:px-6">
              {/* Context Banner */}
              <div className="mb-6 rounded-2xl border-0 bg-muted/60 p-3 shadow-none">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <MapPin className="h-4 w-4 shrink-0 text-primary" />
                  <span className="font-medium">Creating for:</span>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-background px-2.5 py-0.5 text-xs font-medium">
                    {isSingleLocation
                      ? "Your menu"
                      : isAllLocations
                        ? "All Locations (Global)"
                        : "This Location"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {isSingleLocation
                    ? "This item will be added to your menu."
                    : isAllLocations
                      ? "This item will be available at all locations."
                      : "This item will be specific to this location only."}
                </p>
                {isDualPricing && !isAllLocations && (
                  <div className="mt-2 flex items-center gap-1.5 text-xs font-medium text-blue-700 dark:text-blue-400">
                    <div className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-blue-500" />
                    Dual Pricing Enabled at{" "}
                    <span className="tabular-nums">{dualPricingPercentage}%</span>
                  </div>
                )}
              </div>

              <Tabs defaultValue="general" className="w-full">
                {/* Classes are literal, not {TOKEN} — see C7. */}
                <div className="mb-6 w-full min-w-0 overflow-x-auto pb-1">
                  <TabsList className="inline-flex h-auto w-max flex-nowrap gap-0.5 rounded-full bg-muted/70 p-1">
                    {[
                      { value: "general", label: "General" },
                      { value: "pricing", label: "Pricing" },
                      { value: "modifiers", label: "Modifiers" },
                      { value: "categories", label: "Categories" },
                      { value: "recipe", label: "Recipe" },
                      { value: "tax", label: "Tax & Fees" },
                      { value: "availability", label: "Availability" },
                    ].map((t) => (
                      <TabsTrigger
                        key={t.value}
                        value={t.value}
                        className="shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border"
                      >
                        {t.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </div>

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
                        className="h-9 text-[0.8125rem]"
                      />
                      {errors.name && (
                        <p className="text-sm text-destructive">{errors.name}</p>
                      )}
                    </div>

                    {/* Description */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Description</label>
                      <Textarea
                        placeholder="Espresso shots with hot water..."
                        className="resize-none rounded-2xl border-0 bg-muted/60 text-[0.8125rem] shadow-none focus-visible:bg-background"
                        rows={3}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                      />
                      {errors.description && (
                        <p className="text-sm text-destructive">{errors.description}</p>
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
                          className="h-9 w-12 cursor-pointer rounded-full border-0 bg-transparent"
                        />
                        <Input
                          placeholder="#ffffff"
                          className="h-9 flex-1 text-[0.8125rem]"
                          value={cardBgColor}
                          onChange={(e) => setCardBgColor(e.target.value)}
                        />
                        {cardBgColor && (
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="size-8 shrink-0 rounded-full border-0 bg-muted/60 text-muted-foreground shadow-none transition-colors hover:bg-muted hover:text-foreground"
                            onClick={() => setCardBgColor("")}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">Custom background color for the POS menu card</p>
                    </div>

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
                      <p className="text-sm text-destructive">{errors.price}</p>
                    )}
                    {errors.cashPrice && (
                      <p className="text-sm text-destructive">{errors.cashPrice}</p>
                    )}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between rounded-2xl border-0 bg-muted/60 p-4 shadow-none">
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
                            <Truck className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              className="h-9 pl-9 text-[0.8125rem] tabular-nums"
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
                                className="group flex items-center justify-between rounded-2xl border-0 bg-muted/60 p-3 shadow-none transition-colors hover:bg-muted"
                              >
                                <div className="flex items-center gap-3">
                                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background">
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

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-medium text-muted-foreground">Available Groups</h4>
                        {modifierGroups.length > 3 && (
                          <div className="relative w-50">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground/50" />
                            <Input
                              placeholder="Search..."
                              className="h-8 pl-8 text-xs"
                              value={modifierSearch}
                              onChange={(e) => setModifierSearch(e.target.value)}
                            />
                          </div>
                        )}
                      </div>

                      {modifierGroups.length === 0 ? (
                        <div className="rounded-2xl border-0 bg-muted/60 p-4 text-center shadow-none">
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
                                className="flex items-center justify-between rounded-2xl border-0 bg-muted/60 p-2 shadow-none transition-colors hover:bg-muted"
                              >
                                <div className="flex items-center gap-3">
                                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background">
                                    <Sliders className="h-4 w-4 text-muted-foreground opacity-50" />
                                  </div>
                                  <div>
                                    <p className="font-medium text-sm">{group.name}</p>
                                    <div className="flex items-center gap-2">
                                      <span
                                        className={cn(
                                          "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium",
                                          group.is_required
                                            ? "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"
                                            : "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400",
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
                  <div className="flex flex-col items-center justify-center rounded-2xl border-0 bg-muted/60 p-12 text-center shadow-none">
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
                  <div className="flex items-center justify-between rounded-2xl border-0 bg-muted/60 p-4 shadow-none">
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
                        {/* Opens upward: this is the last field in the Tax & Fees
                            tab, so a downward menu is clipped by the dialog's
                            `overflow-hidden` scroll container. */}
                        <SelectContent side="top" align="start">
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
                  <div className="flex items-center justify-between rounded-2xl border-0 bg-muted/60 p-4 shadow-none">
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
                              "flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-0 bg-muted/60 p-3 shadow-none transition-colors hover:bg-muted",
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
                      {/* Opens upward: last field in the Availability tab, so a
                          downward menu is clipped by the scroll container. */}
                      <SelectContent side="top" align="start">
                        {STOCK_MODES.map((mode) => (
                          <SelectItem key={mode.value} value={mode.value}>
                            {mode.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">How should inventory be tracked for this item?</p>
                  </div>
                </TabsContent>

                {/* CATEGORIES TAB */}
                <TabsContent value="categories" className="space-y-6 mt-0">
                  <div className="space-y-4 rounded-2xl border-0 bg-muted/60 p-4 shadow-none">
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
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <AlertCircle className="h-3 w-3 shrink-0" />
                        Optional — without one, the item goes to &ldquo;Uncategorized&rdquo;.
                      </p>
                    )}

                    {accessibleCategories.length === 0 ? (
                      <div className="rounded-2xl border-0 bg-muted/60 px-4 py-6 text-center text-sm text-muted-foreground shadow-none">
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
                                  "rounded-full border-0 px-3 py-1.5 text-sm font-medium shadow-none transition-colors",
                                  isSelected
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
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
            <div className="thin-scrollbar hidden min-h-0 w-90 shrink-0 overflow-y-auto bg-muted/30 px-6 py-5 lg:block">
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

          <DialogFooter className="shrink-0 gap-2 bg-card px-4 py-4 sm:justify-end sm:px-6">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
              className="h-9 w-full rounded-full px-4 text-[0.8125rem] font-medium shadow-sm sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateItem}
              disabled={isSaving}
              className="h-9 w-full rounded-full px-4 text-[0.8125rem] font-medium sm:w-auto"
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
