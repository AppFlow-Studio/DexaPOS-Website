"use client";

import * as React from "react";
import { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { CdnImageUploadField } from "@/components/ui/cdn-image-upload-field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PriceInputGroup } from "@/components/dashboard/locations/PriceInputGroup";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Utensils,
  Search,
  CheckCircle2,
  X,
  Loader2,
  Plus,
  Tag,
  Monitor,
  Globe,
  Smartphone,
  AlertCircle,
  Palette,
  Layers,
  Sliders,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useMerchantCdnImageUpload } from "@/lib/cdn/use-merchant-cdn-image-upload";
import {
  clearLocalStorageDraft,
  readLocalStorageDraft,
  writeLocalStorageDraft,
} from "@/lib/browser/local-storage-draft";
import { MenuItemsModel } from "@/types/db-modles";
import { AddItemToCategory } from "@/app/dashboard/actions/item-assignments";
import { CreateItemInCategory } from "@/app/dashboard/actions/item-assignments";
import { AssignModifierToItem } from "@/app/dashboard/actions/item-assignments";
import { GetMenuItems } from "@/app/dashboard/actions/menu-items";
import { useLocationStore, useIsAllLocations } from "@/stores/location-store";
import { useUserInfo } from "@/app/manage/hooks/useUserInfo.";
import { useEffectivePricing } from "@/app/dashboard/hooks/useEffectivePricing";
import { useModifierGroups } from "@/app/dashboard/hooks/useModifierGroups";
import { ItemPreviewCard } from "@/components/dashboard/menu/ItemPreviewCard";
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
// TYPES
// ============================================================================

interface AddItemToCategoryWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryId: string;
  categoryName: string;
  clerkOrgId?: string;
  existingItemIds: string[];
  onSuccess?: () => void;
  merchantId?: string;
  locationId?: string | null;
  isAllLocations?: boolean;
}

interface AddItemToCategoryDraft {
  activeTab: "existing" | "create";
  values: ItemFormValues;
  modifierIds: string[];
}

// ============================================================================
// SCHEMA
// ============================================================================

const itemFormSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100, "Name too long"),
  description: z.string().max(1000, "Description too long").optional().nullable(),
  image: z.string().url("Must be a valid URL").optional().nullable().or(z.literal("")),
  price: z.coerce.number().min(0, "Price must be positive"),
  cash_price: z.coerce.number().min(0, "Cash price must be positive").optional().nullable(),
  allergens: z.array(z.string()).default([]),
  meal_types: z.array(z.string()).default([]),
  card_bg_color: z.string().optional().nullable().or(z.literal("")),
  availability: z.boolean().default(true),
  tax_category: z.string().default("standard"),
  is_tax_exempt: z.boolean().default(false),
  stock_tracking_mode: z.enum(["in_stock", "out_of_stock", "quantity"]).nullable().optional(),
  available_channels: z.array(z.string()).default(["pos", "online", "kiosk"]),
});

type ItemFormValues = z.infer<typeof itemFormSchema>;

export function AddItemToCategoryWizard({
  open,
  onOpenChange,
  categoryId,
  categoryName,
  clerkOrgId = "",
  existingItemIds,
  onSuccess,
  merchantId: propMerchantId,
  locationId: propLocationId,
  isAllLocations: propIsAllLocations,
}: AddItemToCategoryWizardProps) {
  const queryClient = useQueryClient();

  // Dashboard hooks
  const locationStore = useLocationStore();
  const dashboardIsAllLocations = useIsAllLocations();
  const { data: userInfo } = useUserInfo();

  // Effective values
  const merchantId = propMerchantId || userInfo?.members?.[0]?.organizations?.merchants?.id || "";
  const selectedLocationId = propLocationId !== undefined ? propLocationId : locationStore.selectedLocationId;
  const isAllLocations = propIsAllLocations !== undefined ? propIsAllLocations : dashboardIsAllLocations;
  const { pricingStrategy, dualPricingPercentage } = useEffectivePricing();
  const imageUpload = useMerchantCdnImageUpload({
    merchantId,
    category: "menu-items",
    fileNamePrefix: "item",
  });
  const draftHydratedRef = React.useRef(false);
  const draftKey = React.useMemo(() => {
    const scopeKey = isAllLocations ? "global" : selectedLocationId ?? "location-none";
    return merchantId
      ? `menu-item-draft:add-to-category:${merchantId}:${categoryId}:${scopeKey}`
      : null;
  }, [categoryId, isAllLocations, merchantId, selectedLocationId]);

  // Modifier groups
  const { data: allModifierGroups = [] } = useModifierGroups(
    clerkOrgId || undefined,
    isAllLocations ? null : (selectedLocationId as string) || null,
  );

  // State
  const [activeTab, setActiveTab] = useState<"existing" | "create">("existing");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [allItems, setAllItems] = useState<MenuItemsModel[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [newModifierIds, setNewModifierIds] = useState<string[]>([]);
  const [modifierSearchQuery, setModifierSearchQuery] = useState("");

  // Form for creating new items
  const form = useForm<ItemFormValues>({
    resolver: zodResolver(itemFormSchema),
    defaultValues: {
      name: "",
      description: "",
      image: "",
      price: 0,
      cash_price: null,
      allergens: [],
      meal_types: [],
      card_bg_color: "",
      availability: true,
      tax_category: "standard",
      is_tax_exempt: false,
      stock_tracking_mode: "in_stock",
      available_channels: ["pos", "online", "kiosk"],
    },
  });

  const watchedValues = form.watch();
  const isTaxExempt = form.watch("is_tax_exempt");

  // Modifier group computed lists
  const assignedGroups = useMemo(
    () => allModifierGroups.filter((g: any) => newModifierIds.includes(g.id)),
    [allModifierGroups, newModifierIds],
  );
  const availableGroups = useMemo(
    () => allModifierGroups.filter((g: any) => !newModifierIds.includes(g.id)),
    [allModifierGroups, newModifierIds],
  );

  // Fetch all items when wizard opens
  useEffect(() => {
    if (open) {
      setIsLoadingItems(true);
      const locId = (!isAllLocations && selectedLocationId) ? selectedLocationId : null;
      GetMenuItems(clerkOrgId, locId, merchantId || undefined)
        .then((items) => {
          setAllItems(items as MenuItemsModel[]);
        })
        .catch((err) => {
          console.error("Failed to fetch items:", err);
          toast.error("Failed to load items");
        })
        .finally(() => {
          setIsLoadingItems(false);
        });
    }
  }, [open, clerkOrgId, merchantId, isAllLocations, selectedLocationId]);

  // Filter items - exclude those already in category
  const availableItems = useMemo(() => {
    const existingSet = new Set(existingItemIds);
    return allItems.filter((item) => !existingSet.has(item.id));
  }, [allItems, existingItemIds]);

  // Search filter
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return availableItems;
    const query = searchQuery.toLowerCase();
    return availableItems.filter(
      (item) =>
        item.name.toLowerCase().includes(query) ||
        item.description?.toLowerCase().includes(query),
    );
  }, [availableItems, searchQuery]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      draftHydratedRef.current = false;
      setSelectedItems(new Set());
      setSearchQuery("");
      setActiveTab("existing");
      form.reset();
      imageUpload.reset(null);
      setNewModifierIds([]);
      setModifierSearchQuery("");
    }
  }, [form, imageUpload.reset, open]);

  useEffect(() => {
    if (!open || !draftKey || draftHydratedRef.current) return;

    const draft = readLocalStorageDraft<AddItemToCategoryDraft>(draftKey);
    if (draft) {
      setActiveTab(draft.activeTab ?? "existing");
      form.reset({
        name: "",
        description: "",
        image: "",
        price: 0,
        cash_price: null,
        allergens: [],
        meal_types: [],
        card_bg_color: "",
        availability: true,
        tax_category: "standard",
        is_tax_exempt: false,
        stock_tracking_mode: "in_stock",
        available_channels: ["pos", "online", "kiosk"],
        ...draft.values,
      });
      setNewModifierIds(draft.modifierIds ?? []);
    }

    draftHydratedRef.current = true;
  }, [draftKey, form, open]);

  useEffect(() => {
    if (!open || !draftKey || !draftHydratedRef.current) return;

    writeLocalStorageDraft(draftKey, {
      activeTab,
      values: watchedValues,
      modifierIds: newModifierIds,
    } satisfies AddItemToCategoryDraft);
  }, [activeTab, draftKey, newModifierIds, open, watchedValues]);

  // Toggle item selection
  const handleToggleItem = (itemId: string) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedItems(new Set(filteredItems.map((item) => item.id)));
  };

  const handleDeselectAll = () => {
    setSelectedItems(new Set());
  };

  // Add selected existing items to category
  const handleAddExistingItems = async () => {
    if (selectedItems.size === 0) {
      toast.error("No items selected");
      return;
    }

    setIsSaving(true);
    try {
      const itemIds = Array.from(selectedItems);
      let successCount = 0;
      let errorCount = 0;

      for (const itemId of itemIds) {
        const result = await AddItemToCategory(
          categoryId,
          itemId,
          merchantId,
          undefined,
          undefined,
          undefined,
          selectedLocationId,
        );
        if (result.error) {
          errorCount++;
          console.error(`Failed to add item ${itemId}:`, result.error);
        } else {
          successCount++;
        }
      }

      if (successCount > 0) {
        toast.success(
          `Added ${successCount} item${successCount !== 1 ? "s" : ""} to ${categoryName}`,
          { description: errorCount > 0 ? `${errorCount} failed to add` : undefined },
        );
      }

      if (errorCount > 0 && successCount === 0) {
        toast.error("Failed to add items", { description: "Please try again" });
      }

      queryClient.invalidateQueries({ queryKey: ["categories-with-items"] });
      queryClient.invalidateQueries({ queryKey: ["menu-items"] });
      invalidateOrderOutSync(queryClient);
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Error adding items:", error);
      toast.error("Failed to add items");
    } finally {
      setIsSaving(false);
    }
  };

  // Create new item and add to category
  const handleCreateItem = async (values: ItemFormValues) => {
    let uploadedAsset: { cdnUrl: string; storagePath: string } | undefined;

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
      const result = await CreateItemInCategory(
        clerkOrgId || "",
        categoryId,
        {
          name: values.name,
          description: values.description ?? undefined,
          price: values.price,
          cashPrice: values.cash_price ?? undefined,
          image: resolvedImage.value ?? undefined,
          availability: values.availability,
          allergens: values.allergens,
          cardBgColor: values.card_bg_color ?? undefined,
          stockTrackingMode: values.stock_tracking_mode ?? undefined,
          mealTypes: values.meal_types,
        },
        {
          locationId: isAllLocations ? null : selectedLocationId,
          merchantId: merchantId,
        },
      );

      if (result.error) {
        if (uploadedAsset) {
          await imageUpload.cleanupUploadedAsset(uploadedAsset.storagePath).catch(console.error);
        }
        toast.error("Failed to create item", { description: result.error });
        return;
      }

      // Assign modifier groups if any selected
      if (newModifierIds.length > 0 && result.data?.id) {
        for (let i = 0; i < newModifierIds.length; i++) {
          await AssignModifierToItem(result.data.id, newModifierIds[i], i);
        }
      }

      toast.success("Item created", {
        description: `"${values.name}" has been added to ${categoryName}`,
      });
      if (draftKey) {
        clearLocalStorageDraft(draftKey);
      }

      queryClient.invalidateQueries({ queryKey: ["categories-with-items"] });
      queryClient.invalidateQueries({ queryKey: ["menu-items"] });
      queryClient.invalidateQueries({ queryKey: ["modifier-groups"] });
      invalidateOrderOutSync(queryClient);
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
                <Utensils className="h-5 w-5 text-primary" />
                Add Items to {categoryName}
              </DialogTitle>
              <DialogDescription className="max-w-[60ch] text-sm leading-6">
                Add existing items from your library or create new ones
              </DialogDescription>
            </div>
          </DialogHeader>

          {/* Top Level Tabs */}
          <div className="border-b border-border/70 px-6 pt-4">
            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as "existing" | "create")}
            >
              <TabsList className="grid w-full max-w-sm grid-cols-2">
                <TabsTrigger value="existing" className="gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Add Existing
                  {selectedItems.size > 0 && (
                    <Badge variant="secondary" className="ml-1">
                      {selectedItems.size}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="create" className="gap-2">
                  <Plus className="h-4 w-4" />
                  Create New
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* ============================================================ */}
          {/* EXISTING ITEMS TAB                                           */}
          {/* ============================================================ */}
          {activeTab === "existing" && (
            <>
              <div className="min-h-0 flex flex-1 flex-col overflow-hidden px-6 py-5">
                {/* Context Banner */}
                <div className="mb-4 rounded-lg border border-primary/20 bg-primary/5 p-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Tag className="h-4 w-4 text-primary" />
                    <span className="font-medium">Adding to:</span>
                    <Badge variant="outline" className="bg-background">{categoryName}</Badge>
                  </div>
                </div>

                {/* Search */}
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search items..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>

                {/* Selection Actions */}
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {filteredItems.length} item{filteredItems.length !== 1 ? "s" : ""} available
                  </span>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={handleSelectAll} disabled={filteredItems.length === 0}>
                      Select All
                    </Button>
                    <Button variant="ghost" size="sm" onClick={handleDeselectAll} disabled={selectedItems.size === 0}>
                      Clear
                    </Button>
                  </div>
                </div>

                {/* Items List */}
                <div className="flex-1 space-y-2 overflow-y-auto pr-2">
                  {isLoadingItems ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : filteredItems.length === 0 ? (
                    <div className="py-12 text-center">
                      <Utensils className="mx-auto mb-3 h-12 w-12 text-muted-foreground/30" />
                      <p className="text-muted-foreground">
                        {availableItems.length === 0
                          ? "All items are already in this category"
                          : "No items match your search"}
                      </p>
                      {availableItems.length === 0 && (
                        <Button variant="outline" className="mt-4" onClick={() => setActiveTab("create")}>
                          <Plus className="mr-2 h-4 w-4" />
                          Create New Item
                        </Button>
                      )}
                    </div>
                  ) : (
                    filteredItems.map((item) => {
                      const isSelected = selectedItems.has(item.id);
                      return (
                        <div
                          key={item.id}
                          className={cn(
                            "flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-all",
                            isSelected
                              ? "border-primary bg-primary/5 ring-1 ring-primary"
                              : "border-border hover:border-primary/30 hover:bg-muted/30",
                          )}
                          onClick={() => handleToggleItem(item.id)}
                        >
                          <Checkbox checked={isSelected} onCheckedChange={() => handleToggleItem(item.id)} className="shrink-0" />
                          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-muted/30">
                            {item.image ? (
                              <img src={item.image} alt={item.name} className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center">
                                <Utensils className="h-5 w-5 text-muted-foreground/50" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h4 className="truncate text-sm font-medium">{item.name}</h4>
                            {item.description && (
                              <p className="truncate text-xs text-muted-foreground">{item.description}</p>
                            )}
                          </div>
                          <div className="shrink-0 text-right">
                            <span className="text-sm font-semibold text-primary">${item.price.toFixed(2)}</span>
                            {item.cash_price && item.cash_price !== item.price && (
                              <p className="text-xs text-muted-foreground">Cash: ${item.cash_price.toFixed(2)}</p>
                            )}
                          </div>
                          {isSelected && <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <DialogFooter className="shrink-0 border-t border-border/70 bg-background/95 px-6 py-4">
                <div className="flex w-full flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving} className="sm:min-w-[140px]">
                    Cancel
                  </Button>
                  <Button onClick={handleAddExistingItems} disabled={selectedItems.size === 0 || isSaving} className="gap-2 sm:min-w-[180px]">
                    {isSaving ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Adding...</>
                    ) : (
                      <><Plus className="h-4 w-4" /> Add {selectedItems.size} Item{selectedItems.size !== 1 ? "s" : ""}</>
                    )}
                  </Button>
                </div>
              </DialogFooter>
            </>
          )}

          {/* ============================================================ */}
          {/* CREATE NEW ITEM TAB — ItemFormSheet-style UI                  */}
          {/* ============================================================ */}
          {activeTab === "create" && (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleCreateItem)} className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
                  {/* LEFT COLUMN — FORM */}
                  <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                    {/* Context Banner */}
                    <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/50">
                      <div className="flex items-start gap-3">
                        <Plus className="mt-0.5 h-5 w-5 text-emerald-600" />
                        <div>
                          <h4 className="font-semibold text-emerald-900 dark:text-emerald-100">Creating New Item</h4>
                          <p className="mt-1 max-w-md text-sm text-emerald-700 dark:text-emerald-300">
                            This item will be added to your library and automatically assigned to &ldquo;{categoryName}&rdquo;.
                          </p>
                        </div>
                      </div>
                    </div>

                    <Tabs defaultValue="general" className="w-full">
                      <TabsList className="mb-6 h-auto w-full justify-start gap-6 overflow-x-auto rounded-none border-b bg-transparent p-0">
                        <TabsTrigger value="general" className="flex-shrink-0 rounded-none px-0 py-2 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none">
                          General
                        </TabsTrigger>
                        <TabsTrigger value="pricing" className="flex-shrink-0 rounded-none px-0 py-2 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none">
                          Pricing
                        </TabsTrigger>
                        <TabsTrigger value="modifiers" className="flex-shrink-0 rounded-none px-0 py-2 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none">
                          Modifiers
                        </TabsTrigger>
                        <TabsTrigger value="tax" className="flex-shrink-0 rounded-none px-0 py-2 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none">
                          Tax &amp; Fees
                        </TabsTrigger>
                        <TabsTrigger value="availability" className="flex-shrink-0 rounded-none px-0 py-2 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none">
                          Availability
                        </TabsTrigger>
                      </TabsList>

                      {/* GENERAL TAB */}
                      <TabsContent value="general" className="mt-0 space-y-6">
                        <div className="space-y-4">
                          <div className="mb-2 flex items-center justify-between">
                            <Badge variant="outline" className="text-xs font-normal">BASIC INFORMATION</Badge>
                          </div>

                          <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Item Name *</FormLabel>
                                <FormControl><Input placeholder="e.g. Americano" {...field} /></FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="description"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Description</FormLabel>
                                <FormControl><Textarea placeholder="Espresso shots with hot water..." rows={3} {...field} value={field.value || ""} /></FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          {/* Image Upload */}
                          <FormField
                            control={form.control}
                            name="image"
                            render={() => (
                              <FormItem>
                                <FormLabel>Image</FormLabel>
                                <FormControl>
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
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          {/* Card Background Color */}
                          <FormField
                            control={form.control}
                            name="card_bg_color"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="flex items-center gap-2">
                                  <Palette className="h-4 w-4" /> Card Background Color
                                </FormLabel>
                                <FormControl>
                                  <div className="flex items-center gap-3">
                                    <input type="color" value={field.value || "#ffffff"} onChange={e => field.onChange(e.target.value)} className="h-9 w-12 cursor-pointer rounded border" />
                                    <Input placeholder="#ffffff" className="flex-1" {...field} value={field.value || ""} />
                                    {field.value && (
                                      <Button type="button" size="sm" variant="ghost" onClick={() => field.onChange("")}>
                                        <X className="h-3 w-3" />
                                      </Button>
                                    )}
                                  </div>
                                </FormControl>
                                <FormDescription>Custom background color for the POS menu card</FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <Separator className="my-4" />

                          {/* Allergens */}
                          <FormField
                            control={form.control}
                            name="allergens"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="flex items-center gap-2">
                                  <AlertCircle className="h-4 w-4" /> Allergens
                                </FormLabel>
                                <FormControl>
                                  <div className="flex flex-wrap gap-2">
                                    {ALLERGENS.map(allergen => {
                                      const isSelected = field.value?.includes(allergen);
                                      return (
                                        <Badge
                                          key={allergen}
                                          variant={isSelected ? "default" : "outline"}
                                          className={cn("cursor-pointer transition-colors", isSelected ? "bg-red-600 hover:bg-red-700" : "hover:bg-muted")}
                                          onClick={() => {
                                            const current = field.value || [];
                                            field.onChange(isSelected ? current.filter(a => a !== allergen) : [...current, allergen]);
                                          }}
                                        >
                                          {allergen}
                                        </Badge>
                                      );
                                    })}
                                  </div>
                                </FormControl>
                                <FormDescription>Select all allergens present in this item</FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          {/* Meal Types */}
                          <FormField
                            control={form.control}
                            name="meal_types"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="flex items-center gap-2">
                                  <Utensils className="h-4 w-4" /> Meal Types
                                </FormLabel>
                                <FormControl>
                                  <div className="flex flex-wrap gap-2">
                                    {MEAL_TYPES.map(mealType => {
                                      const isSelected = field.value?.includes(mealType);
                                      return (
                                        <Badge
                                          key={mealType}
                                          variant={isSelected ? "default" : "outline"}
                                          className={cn("cursor-pointer transition-colors", isSelected ? "" : "hover:bg-muted")}
                                          onClick={() => {
                                            const current = field.value || [];
                                            field.onChange(isSelected ? current.filter(m => m !== mealType) : [...current, mealType]);
                                          }}
                                        >
                                          {mealType}
                                        </Badge>
                                      );
                                    })}
                                  </div>
                                </FormControl>
                                <FormDescription>Categorize when this item is typically served</FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </TabsContent>

                      {/* PRICING TAB */}
                      <TabsContent value="pricing" className="mt-0 space-y-6">
                        <div className="space-y-4">
                          <PriceInputGroup
                            price={form.watch("price") || 0}
                            cashPrice={form.watch("cash_price") ?? null}
                            onPriceChange={(val) => form.setValue("price", val, { shouldValidate: true })}
                            onCashPriceChange={(val) => form.setValue("cash_price", val, { shouldValidate: true })}
                            label="Base Price"
                            pricingStrategy={pricingStrategy}
                            dualPricingPercentage={dualPricingPercentage}
                          />
                          <div className="flex gap-4 px-4">
                            <div className="flex-1">
                              {form.formState.errors.price && (
                                <p className="text-sm text-red-500">{form.formState.errors.price.message}</p>
                              )}
                            </div>
                            <div className="flex-1">
                              {form.formState.errors.cash_price && (
                                <p className="text-sm text-red-500">{form.formState.errors.cash_price.message}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      </TabsContent>

                      {/* MODIFIERS TAB */}
                      <TabsContent value="modifiers" className="mt-0 space-y-6">
                        <div className="space-y-6">
                          {/* Assigned Groups */}
                          <div className="space-y-3">
                            <h4 className="text-sm font-medium text-muted-foreground">Assigned Groups</h4>
                            {assignedGroups.length === 0 ? (
                              <p className="text-sm italic text-muted-foreground">No modifier groups assigned.</p>
                            ) : (
                              <div className="space-y-2">
                                {assignedGroups.map((group: any) => (
                                  <div key={group.id} className="group flex items-center justify-between rounded-lg border bg-background p-3 transition-colors hover:border-primary/50">
                                    <div className="flex items-center gap-3">
                                      <div className="flex h-8 w-8 items-center justify-center rounded bg-muted">
                                        <Layers className="h-4 w-4 text-muted-foreground" />
                                      </div>
                                      <div>
                                        <p className="text-sm font-medium">{group.name}</p>
                                        <p className="text-xs text-muted-foreground">{group.modifier_group_items?.length ?? 0} options</p>
                                      </div>
                                    </div>
                                    <Button
                                      type="button"
                                      size="icon"
                                      variant="ghost"
                                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                      onClick={() => setNewModifierIds(prev => prev.filter(id => id !== group.id))}
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          <Separator />

                          {/* Available Groups */}
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <h4 className="text-sm font-medium text-muted-foreground">Available Groups</h4>
                              <div className="relative w-[200px]">
                                <Search className="absolute left-2 top-2 h-3 w-3 text-muted-foreground" />
                                <Input placeholder="Search..." className="h-8 pl-7 text-xs" value={modifierSearchQuery} onChange={e => setModifierSearchQuery(e.target.value)} />
                              </div>
                            </div>
                            <div className="grid max-h-[300px] gap-2 overflow-y-auto">
                              {availableGroups.filter((g: any) => g.name.toLowerCase().includes(modifierSearchQuery.toLowerCase())).map((group: any) => (
                                <div key={group.id} className="flex items-center justify-between rounded-lg border border-dashed p-2 transition-colors hover:bg-muted/50">
                                  <div className="flex items-center gap-3">
                                    <div className="flex h-8 w-8 items-center justify-center rounded bg-muted/50">
                                      <Sliders className="h-4 w-4 text-muted-foreground opacity-50" />
                                    </div>
                                    <div>
                                      <p className="text-sm font-medium">{group.name}</p>
                                      <p className="text-xs text-muted-foreground">{group.modifier_group_items?.length ?? 0} options</p>
                                    </div>
                                  </div>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 px-2 text-primary"
                                    onClick={() => setNewModifierIds(prev => [...prev, group.id])}
                                  >
                                    <Plus className="mr-1 h-3 w-3" /> Add
                                  </Button>
                                </div>
                              ))}
                              {availableGroups.length === 0 && (
                                <p className="py-4 text-center text-xs text-muted-foreground">No other modifier groups available.</p>
                              )}
                            </div>
                          </div>
                        </div>
                      </TabsContent>

                      {/* TAX TAB */}
                      <TabsContent value="tax" className="mt-0 space-y-6">
                        <FormField
                          control={form.control}
                          name="is_tax_exempt"
                          render={({ field }) => (
                            <FormItem className="flex items-center justify-between rounded-lg border p-4">
                              <div className="space-y-0.5">
                                <FormLabel className="text-base">Tax Exempt</FormLabel>
                                <FormDescription>No tax will be applied to this item</FormDescription>
                              </div>
                              <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                            </FormItem>
                          )}
                        />
                        {!isTaxExempt && (
                          <FormField
                            control={form.control}
                            name="tax_category"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Tax Category</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                  <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                  <SelectContent>
                                    {TAX_CATEGORIES.map(cat => <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        )}
                      </TabsContent>

                      {/* AVAILABILITY TAB */}
                      <TabsContent value="availability" className="mt-0 space-y-6">
                        <FormField
                          control={form.control}
                          name="availability"
                          render={({ field }) => (
                            <FormItem className="flex items-center justify-between rounded-lg border p-4">
                              <div className="space-y-0.5">
                                <FormLabel className="text-base">Available</FormLabel>
                                <FormDescription>Item is available for purchase</FormDescription>
                              </div>
                              <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="available_channels"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="mb-3 block">Sales Channels</FormLabel>
                              <div className="grid grid-cols-3 gap-3">
                                {CHANNELS.map(channel => {
                                  const Icon = channel.icon;
                                  const isChecked = field.value?.includes(channel.id);
                                  return (
                                    <label key={channel.id} className={cn("flex cursor-pointer flex-col items-center gap-2 rounded-lg border p-3 transition-all hover:bg-muted/50", isChecked ? "border-primary bg-primary/5 ring-1 ring-primary" : "text-muted-foreground")}>
                                      <Checkbox
                                        checked={isChecked}
                                        onCheckedChange={checked => {
                                          const current = field.value || [];
                                          field.onChange(checked ? [...current, channel.id] : current.filter(id => id !== channel.id));
                                        }}
                                        className="sr-only"
                                      />
                                      <Icon className={cn("h-6 w-6", isChecked ? "text-primary" : "opacity-50")} />
                                      <span className="text-xs font-medium">{channel.label}</span>
                                    </label>
                                  );
                                })}
                              </div>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="stock_tracking_mode"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Stock Tracking</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value || "in_stock"}>
                                <FormControl><SelectTrigger><SelectValue placeholder="Select tracking mode" /></SelectTrigger></FormControl>
                                <SelectContent>
                                  {STOCK_MODES.map(mode => <SelectItem key={mode.value} value={mode.value}>{mode.label}</SelectItem>)}
                                </SelectContent>
                              </Select>
                              <FormDescription>How should inventory be tracked for this item?</FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </TabsContent>
                    </Tabs>
                  </div>

                  {/* RIGHT COLUMN — PREVIEW */}
                  <div className="hidden min-h-0 w-[360px] shrink-0 overflow-y-auto border-l border-border/70 bg-muted/10 px-6 py-5 lg:block">
                    <div className="space-y-8 pb-4">
                      <div className="mb-4 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <Monitor className="h-4 w-4" /> POS Preview
                      </div>
                      <ItemPreviewCard
                        name={watchedValues.name || "New Item"}
                        description={watchedValues.description || ""}
                        price={watchedValues.price}
                        cashPrice={watchedValues.cash_price ?? undefined}
                        image={imageUpload.previewUrl || watchedValues.image || undefined}
                        availability={watchedValues.availability}
                        categories={[categoryName]}
                        allergens={watchedValues.allergens ?? []}
                        expandDescription
                      />
                      <div>
                        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                          <Tag className="h-4 w-4" /> Allergens
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {watchedValues.allergens?.length ? (
                            watchedValues.allergens.map(a => (
                              <Badge key={a} variant="outline" className="border-red-200 bg-red-50 text-xs text-red-700">{a}</Badge>
                            ))
                          ) : (
                            <p className="text-xs italic text-muted-foreground">No allergens selected</p>
                          )}
                        </div>
                      </div>
                      {watchedValues.meal_types?.length > 0 && (
                        <div className="mt-4">
                          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                            <Utensils className="h-4 w-4" /> Meal Types
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {watchedValues.meal_types.map(m => (
                              <Badge key={m} variant="outline" className="text-xs">{m}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <DialogFooter className="shrink-0 border-t border-border/70 bg-background/95 px-6 py-4 sm:justify-end">
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSaving}>
                    {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create Item
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
