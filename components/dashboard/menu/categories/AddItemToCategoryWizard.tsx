"use client";

import * as React from "react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CdnImageUploadField } from "@/components/ui/cdn-image-upload-field";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Utensils,
  Search,
  CheckCircle2,
  X,
  Loader2,
  Plus,
  DollarSign,
  Tag,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useMerchantCdnImageUpload } from "@/lib/cdn/use-merchant-cdn-image-upload";
import { MenuItemsModel } from "@/types/db-modles";
import { AddItemToCategory } from "@/app/dashboard/actions/item-assignments";
import { CreateItemInCategory } from "@/app/dashboard/actions/item-assignments";
import { GetMenuItems } from "@/app/dashboard/actions/menu-items";
import { useLocationStore, useIsAllLocations } from "@/stores/location-store";
import { useUserInfo } from "@/app/manage/hooks/useUserInfo.";

// ============================================================================
// TYPES
// ============================================================================

interface AddItemToCategoryWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryId: string;
  categoryName: string;
  clerkOrgId?: string; // Made optional
  existingItemIds: string[]; // Items already in this category
  onSuccess?: () => void;
  // Admin Props
  merchantId?: string;
  locationId?: string | null;
  isAllLocations?: boolean;
}

// Form schema for creating new items
const itemSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  description: z.string().max(500).optional(),
  price: z.number().min(0, "Price must be positive"),
  cash_price: z.number().min(0).optional().nullable(),
  image: z.string().optional(),
});

type ItemFormValues = z.infer<typeof itemSchema>;

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
  
  // Dashboard hooks - safely access values or fallback
  const locationStore = useLocationStore();
  const dashboardIsAllLocations = useIsAllLocations();
  const { data: userInfo } = useUserInfo();

  // effective values
  const merchantId = propMerchantId || userInfo?.members?.[0]?.organizations?.merchants?.id || "";
  const selectedLocationId = propLocationId !== undefined ? propLocationId : locationStore.selectedLocationId;
  const isAllLocations = propIsAllLocations !== undefined ? propIsAllLocations : dashboardIsAllLocations;
  const imageUpload = useMerchantCdnImageUpload({
    merchantId,
    category: "menu-items",
    fileNamePrefix: "item",
  });

  // State
  const [activeTab, setActiveTab] = React.useState<"existing" | "create">(
    "existing",
  );
  const [searchQuery, setSearchQuery] = React.useState("");
  const [selectedItems, setSelectedItems] = React.useState<Set<string>>(
    new Set(),
  );
  const [isSaving, setIsSaving] = React.useState(false);
  const [allItems, setAllItems] = React.useState<MenuItemsModel[]>([]);
  const [isLoadingItems, setIsLoadingItems] = React.useState(false);

  // Form for creating new items
  const form = useForm<ItemFormValues>({
    resolver: zodResolver(itemSchema),
    defaultValues: {
      name: "",
      description: "",
      price: 0,
      cash_price: null,
      image: "",
    },
  });

  // Fetch all items when wizard opens
  React.useEffect(() => {
    if (open) {
       setIsLoadingItems(true);
       
       // Use selectedLocationId if we are in a specific location view, otherwise null (global items)
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
  const availableItems = React.useMemo(() => {
    const existingSet = new Set(existingItemIds);
    return allItems.filter((item) => !existingSet.has(item.id));
  }, [allItems, existingItemIds]);

  // Search filter
  const filteredItems = React.useMemo(() => {
    if (!searchQuery.trim()) return availableItems;
    const query = searchQuery.toLowerCase();
    return availableItems.filter(
      (item) =>
        item.name.toLowerCase().includes(query) ||
        item.description?.toLowerCase().includes(query),
    );
  }, [availableItems, searchQuery]);

  // Reset on close
  React.useEffect(() => {
    if (!open) {
      setSelectedItems(new Set());
      setSearchQuery("");
      setActiveTab("existing");
      form.reset();
      imageUpload.reset(null);
    }
  }, [form, imageUpload.reset, open]);

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

  // Select all visible items
  const handleSelectAll = () => {
    setSelectedItems(new Set(filteredItems.map((item) => item.id)));
  };

  // Deselect all
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
          `Added ${successCount} item${
            successCount !== 1 ? "s" : ""
          } to ${categoryName}`,
          {
            description:
              errorCount > 0 ? `${errorCount} failed to add` : undefined,
          },
        );
      }

      if (errorCount > 0 && successCount === 0) {
        toast.error("Failed to add items", {
          description: "Please try again",
        });
      }

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ["categories-with-items"] });
      queryClient.invalidateQueries({ queryKey: ["menu-items"] });

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
        clerkOrgId || "", // Pass empty string if undefined
        categoryId,
        {
          name: values.name,
          description: values.description,
          price: values.price,
          cashPrice: values.cash_price ?? undefined,
          image: resolvedImage.value ?? undefined,
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

      toast.success("Item created", {
        description: `"${values.name}" has been added to ${categoryName}`,
      });

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ["categories-with-items"] });
      queryClient.invalidateQueries({ queryKey: ["menu-items"] });

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
        className="w-full max-w-[calc(100vw-1rem)] gap-0 overflow-hidden rounded-[28px] border border-slate-200/80 bg-background/95 p-0 shadow-[0_30px_100px_rgba(15,23,42,0.26)] sm:max-w-4xl"
      >
        <div className="flex max-h-[min(92vh,920px)] flex-col">
        <DialogHeader className="border-b border-border/70 bg-background/95 px-6 py-5 pr-14 text-left sm:text-left">
          <DialogTitle className="flex items-center gap-2 text-[1.625rem] font-semibold tracking-tight">
            <Utensils className="h-5 w-5 text-primary" />
            Add Items to {categoryName}
          </DialogTitle>
          <DialogDescription className="max-w-[60ch] text-sm leading-6">
            Add existing items from your library or create new ones
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex flex-1 flex-col overflow-hidden px-6 py-5">
          {/* Context Banner */}
          <div className="mb-4 p-3 rounded-lg bg-primary/5 border border-primary/20">
            <div className="flex items-center gap-2 text-sm">
              <Tag className="h-4 w-4 text-primary" />
              <span className="font-medium">Creating in:</span>
              <Badge variant="outline" className="bg-background">
                {categoryName}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Items will be added to this category and become part of your menu
              structure.
            </p>
          </div>

          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as "existing" | "create")}
            className="min-h-0 flex flex-1 flex-col"
          >
            <TabsList className="grid w-full grid-cols-2 mb-4">
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

            {/* Existing Items Tab */}
            <TabsContent value="existing" className="mt-0 min-h-0 flex-1 flex flex-col">
              {/* Search */}
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search items..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              {/* Selection Actions */}
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-muted-foreground">
                  {filteredItems.length} item
                  {filteredItems.length !== 1 ? "s" : ""} available
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleSelectAll}
                    disabled={filteredItems.length === 0}
                  >
                    Select All
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDeselectAll}
                    disabled={selectedItems.size === 0}
                  >
                    Clear
                  </Button>
                </div>
              </div>

              {/* Items List */}
              <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                {isLoadingItems ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredItems.length === 0 ? (
                  <div className="text-center py-12">
                    <Utensils className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
                    <p className="text-muted-foreground">
                      {availableItems.length === 0
                        ? "All items are already in this category"
                        : "No items match your search"}
                    </p>
                    {availableItems.length === 0 && (
                      <Button
                        variant="outline"
                        className="mt-4"
                        onClick={() => setActiveTab("create")}
                      >
                        <Plus className="h-4 w-4 mr-2" />
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
                          "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                          isSelected
                            ? "border-primary bg-primary/5 ring-1 ring-primary"
                            : "border-border hover:border-primary/30 hover:bg-muted/30",
                        )}
                        onClick={() => handleToggleItem(item.id)}
                      >
                        {/* Checkbox */}
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => handleToggleItem(item.id)}
                          className="shrink-0"
                        />

                        {/* Item Image */}
                        <div className="w-12 h-12 rounded-lg overflow-hidden bg-muted/30 shrink-0">
                          {item.image ? (
                            <img
                              src={item.image}
                              alt={item.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Utensils className="h-5 w-5 text-muted-foreground/50" />
                            </div>
                          )}
                        </div>

                        {/* Item Details */}
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-sm truncate">
                            {item.name}
                          </h4>
                          {item.description && (
                            <p className="text-xs text-muted-foreground truncate">
                              {item.description}
                            </p>
                          )}
                        </div>

                        {/* Price */}
                        <div className="text-right shrink-0">
                          <span className="font-semibold text-sm text-primary">
                            ${item.price.toFixed(2)}
                          </span>
                          {item.cash_price &&
                            item.cash_price !== item.price && (
                              <p className="text-xs text-muted-foreground">
                                Cash: ${item.cash_price.toFixed(2)}
                              </p>
                            )}
                        </div>

                        {/* Selected indicator */}
                        {isSelected && (
                          <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </TabsContent>

            {/* Create New Item Tab */}
            <TabsContent value="create" className="mt-0 min-h-0 flex-1 overflow-y-auto pr-1">
              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit(handleCreateItem)}
                  className="space-y-4"
                >
                  {/* Create Mode Banner */}
                  <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Plus className="h-4 w-4" />
                      Creating New Item
                    </div>
                    <p className="text-xs mt-1 text-emerald-700">
                      This item will be added to your item library and
                      automatically assigned to "{categoryName}".
                    </p>
                  </div>

                  {/* Name */}
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Item Name *</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., Margherita Pizza"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Description */}
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Describe your item..."
                            className="resize-none"
                            rows={3}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Prices */}
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="price"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-1">
                            <DollarSign className="h-3 w-3" />
                            Price *
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="0.00"
                              {...field}
                              onChange={(e) =>
                                field.onChange(parseFloat(e.target.value) || 0)
                              }
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="cash_price"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-1">
                            <DollarSign className="h-3 w-3" />
                            Cash Price
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="Optional"
                              value={field.value ?? ""}
                              onChange={(e) => {
                                const val = e.target.value;
                                field.onChange(val ? parseFloat(val) : null);
                              }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Item Image */}
                  <FormField
                    control={form.control}
                    name="image"
                    render={() => (
                      <FormItem>
                        <FormLabel>Item Image</FormLabel>
                        <FormControl>
                          <CdnImageUploadField
                            disabled={isSaving}
                            helperText=""
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

                  {/* Preview */}
                  {form.watch("name") && (
                    <div className="p-4 rounded-lg border bg-muted/30">
                      <Label className="text-xs text-muted-foreground mb-2 block">
                        Preview
                      </Label>
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-lg overflow-hidden bg-muted shrink-0">
                          {imageUpload.previewUrl ? (
                            <img
                              src={imageUpload.previewUrl}
                              alt="Preview"
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display =
                                  "none";
                              }}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Utensils className="h-5 w-5 text-muted-foreground/50" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-sm">
                            {form.watch("name")}
                          </h4>
                          {form.watch("description") && (
                            <p className="text-xs text-muted-foreground truncate">
                              {form.watch("description")}
                            </p>
                          )}
                        </div>
                        <span className="font-semibold text-primary">
                          ${(form.watch("price") || 0).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  )}
                </form>
              </Form>
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter className="border-t border-border/70 bg-background/95 px-6 py-4">
          <div className="flex w-full flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
              className="sm:min-w-[140px]"
            >
              Cancel
            </Button>

            {activeTab === "existing" ? (
              <Button
                onClick={handleAddExistingItems}
                disabled={selectedItems.size === 0 || isSaving}
                className="gap-2 sm:min-w-[180px]"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    Add {selectedItems.size} Item
                    {selectedItems.size !== 1 ? "s" : ""}
                  </>
                )}
              </Button>
            ) : (
              <Button
                onClick={form.handleSubmit(handleCreateItem)}
                disabled={isSaving || !form.formState.isValid}
                className="gap-2 sm:min-w-[180px]"
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
            )}
          </div>
        </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
