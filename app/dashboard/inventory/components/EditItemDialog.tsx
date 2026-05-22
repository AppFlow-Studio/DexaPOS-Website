"use client";

import { useEffect, useState } from "react";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Package, Loader2, Globe, MapPin, Trash2, Info } from "lucide-react";
import {
  useUpdateInventoryItem,
  useVendors,
} from "../hooks/useInventoryManagement";
import { useLocationStore } from "@/stores/location-store";
import {
  SetLocationStockWithThreshold,
  UpsertLocationInventoryOverride,
  RemoveLocationInventoryOverride,
  GetLocationInventoryOverride,
} from "../../actions/location-stock";
import { cn } from "@/lib/utils";
import { InventoryItemWithVendor, StockMode } from "@/types/inventory";
import { toast } from "sonner";
import { UpdateStockWithReason } from "../../actions/audit-logs";

const UNIT_TYPES = [
  { value: "pcs", label: "Pieces" },
  { value: "lbs", label: "Pounds" },
  { value: "kg", label: "Kilograms" },
  { value: "oz", label: "Ounces" },
  { value: "gal", label: "Gallons" },
  { value: "lt", label: "Liters" },
  { value: "box", label: "Boxes" },
  { value: "bag", label: "Bags" },
  { value: "case", label: "Cases" },
  { value: "each", label: "Each" },
];

const CATEGORIES = [
  "Proteins",
  "Produce",
  "Dairy",
  "Bakery",
  "Frozen",
  "Beverages",
  "Dry Goods",
  "Condiments",
  "Packaging",
  "Cleaning",
  "Other",
];

const STOCK_MODES: { value: StockMode; label: string; description: string }[] =
  [
    {
      value: "in_stock",
      label: "Always In Stock",
      description: "No tracking, always available",
    },
    {
      value: "stock_tracking",
      label: "Track Quantity",
      description: "Track exact stock levels",
    },
    {
      value: "out_of_stock",
      label: "Out of Stock",
      description: "Mark as unavailable",
    },
  ];

// Schema for global item edit (full edit)
const globalFormSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  sku: z.string().optional(),
  category: z.string().optional(),
  unit_type: z.string().min(1, "Unit type is required"),
  stock_mode: z.enum(["in_stock", "stock_tracking", "out_of_stock"]),
  current_stock: z.coerce.number().min(0, "Stock must be 0 or greater"),
  reorder_point: z.coerce.number().min(0, "Reorder point must be 0 or greater"),
  par_level: z.coerce.number().min(0, "Par level must be 0 or greater"),
  cost_per_unit: z.coerce.number().min(0, "Cost must be 0 or greater"),
  vendor_id: z.string().optional(),
});

// Schema for location-specific edit (limited fields)
const locationFormSchema = z.object({
  current_stock: z.coerce.number().min(0, "Stock must be 0 or greater"),
  stock_update_reason: z.string().optional(),
  reorder_threshold_override: z.coerce.number().min(0).optional().nullable(),
  cost_override: z.coerce.number().min(0).optional().nullable(),
});

type GlobalFormValues = z.infer<typeof globalFormSchema>;
type LocationFormValues = z.infer<typeof locationFormSchema>;

interface EditItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: InventoryItemWithVendor | null;
}

export function EditItemDialog({
  open,
  onOpenChange,
  item,
}: EditItemDialogProps) {
  const queryClient = useQueryClient();
  const updateItem = useUpdateInventoryItem();
  const { data: vendors = [] } = useVendors();
  const { selectedLocationId } = useLocationStore();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [initialStock, setInitialStock] = useState<number>(0);
  const [existingOverride, setExistingOverride] = useState<{
    custom_cost: number | null;
    custom_reorder_threshold: number | null;
  } | null>(null);

  const isGlobalItem = !item?.location_id;
  const isLocationView = selectedLocationId && selectedLocationId !== "all";
  const isEditingGlobalInLocation = isGlobalItem && isLocationView;

  // Form for global editing (all fields)
  const globalForm = useForm<GlobalFormValues>({
    resolver: zodResolver(globalFormSchema),
    defaultValues: {
      name: "",
      sku: "",
      category: "",
      unit_type: "pcs",
      stock_mode: "in_stock",
      current_stock: 0,
      reorder_point: 0,
      par_level: 0,
      cost_per_unit: 0,
      vendor_id: "",
    },
  });

  // Form for location-specific editing
  const locationForm = useForm<LocationFormValues>({
    resolver: zodResolver(locationFormSchema),
    defaultValues: {
      current_stock: 0,
      stock_update_reason: "",
      reorder_threshold_override: null,
      cost_override: null,
    },
  });

  // Load existing data when dialog opens
  useEffect(() => {
    if (item && open) {
      // Reset global form
      globalForm.reset({
        name: item.name,
        sku: item.sku || "",
        category: item.category || "",
        unit_type: item.unit_type,
        stock_mode: item.stock_mode,
        current_stock: item.current_stock,
        reorder_point: item.reorder_point,
        par_level: item.par_level ?? 0,
        cost_per_unit: item.cost_per_unit,
        vendor_id: item.vendor_id || "",
      });

      // If editing global item in location view, load location-specific data
      if (isEditingGlobalInLocation && selectedLocationId) {
        const stockValue = item.current_stock || 0;
        setInitialStock(stockValue);
        locationForm.reset({
          current_stock: stockValue, // This comes from GetInventoryItems with location stock
          stock_update_reason: "",
          reorder_threshold_override: null,
          cost_override: null,
        });

        // Fetch existing override
        GetLocationInventoryOverride(selectedLocationId, item.id).then(
          (result) => {
            if (result.data) {
              setExistingOverride({
                custom_cost: result.data.custom_cost,
                custom_reorder_threshold: result.data.custom_reorder_threshold,
              });
              locationForm.setValue(
                "cost_override",
                result.data.custom_cost || null
              );
              locationForm.setValue(
                "reorder_threshold_override",
                result.data.custom_reorder_threshold || null
              );
            } else {
              setExistingOverride(null);
            }
          }
        );
      }
    }
  }, [item, open, isEditingGlobalInLocation, selectedLocationId]);

  const stockMode = globalForm.watch("stock_mode");

  // Handle global item update (all fields)
  const onGlobalSubmit = async (values: GlobalFormValues) => {
    if (!item) return;
    setIsSubmitting(true);

    try {
      await updateItem.mutateAsync({
        itemId: item.id,
        data: {
          name: values.name,
          sku: values.sku || undefined,
          category: values.category || undefined,
          unit_type: values.unit_type,
          stock_mode: values.stock_mode,
          current_stock: values.current_stock,
          reorder_point: values.reorder_point,
          par_level: values.par_level,
          cost_per_unit: values.cost_per_unit,
          vendor_id:
            values.vendor_id === "none" ? null : values.vendor_id || null,
        },
      });
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle location-specific update
  const onLocationSubmit = async (values: LocationFormValues) => {
    if (!item || !selectedLocationId) return;
    setIsSubmitting(true);

    try {
      const stockChanged = values.current_stock !== initialStock;

      // If stock changed, require a reason and use audited update
      if (stockChanged) {
        if (!values.stock_update_reason?.trim()) {
          toast.error("Please provide a reason for the stock change");
          setIsSubmitting(false);
          return;
        }

        const stockResult = await UpdateStockWithReason({
          locationId: selectedLocationId,
          inventoryItemId: item.id,
          newStock: values.current_stock,
          reason: values.stock_update_reason,
          source: "adjustment",
        });

        if (!stockResult.success) {
          toast.error(stockResult.error || "Failed to update stock");
          return;
        }
      }

      // Update reorder threshold if changed
      if (values.reorder_threshold_override !== null) {
        const thresholdResult = await SetLocationStockWithThreshold(
          selectedLocationId,
          item.id,
          values.current_stock,
          values.reorder_threshold_override
        );
        if (thresholdResult.error) {
          toast.error(thresholdResult.error);
          return;
        }
      }

      // Update cost override separately in location_inventory_overrides
      if (values.cost_override) {
        const overrideResult = await UpsertLocationInventoryOverride({
          locationId: selectedLocationId,
          inventoryItemId: item.id,
          customCost: values.cost_override,
        });
        if (overrideResult.error) {
          toast.error(overrideResult.error);
          return;
        }
      }

      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["inventory-items"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-stats"] });

      toast.success("Location settings updated");
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle removing cost override
  const handleRemoveCostOverride = async () => {
    if (!item || !selectedLocationId) return;
    setIsSubmitting(true);

    try {
      const result = await RemoveLocationInventoryOverride(
        selectedLocationId,
        item.id
      );
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Cost override removed - using base cost");
        locationForm.setValue("cost_override", null);
        setExistingOverride(null);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!item) return null;

  // ============================================================================
  // RENDER: Location-specific edit for Global item
  // ============================================================================
  if (isEditingGlobalInLocation) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="w-[calc(100%-1rem)] sm:max-w-[450px] max-h-[90vh] overflow-hidden p-0 gap-0"
          overlayClassName="bg-black/35 backdrop-blur-md"
        >
          <DialogHeader className="px-6 pt-6 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/10">
                <Package className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <DialogTitle>Edit Location Settings</DialogTitle>
                <DialogDescription>
                  Adjust stock and cost for this location
                </DialogDescription>
              </div>
              <Badge
                variant="outline"
                className="gap-1 text-emerald-600 border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30"
              >
                <Globe className="h-3 w-3" />
                Global
              </Badge>
            </div>
          </DialogHeader>

          <form
            onSubmit={locationForm.handleSubmit(onLocationSubmit)}
            className="contents"
          >
            <div className="overflow-y-auto px-6 py-4 max-h-[calc(90vh-150px)]">
              <div className="space-y-4">
                {/* Item Name (read-only) */}
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Item Name</Label>
                  <div className="px-3 py-2 border rounded-md bg-muted/50 text-sm">
                    {item.name}
                  </div>
                </div>

                {/* Info box */}
                <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                  <Info className="h-4 w-4 text-blue-600 mt-0.5" />
                  <p className="text-xs text-blue-600">
                    This is a global item. You can only adjust stock and pricing for
                    this location. To edit item details, switch to "All Locations"
                    view.
                  </p>
                </div>

                <Separator />

                {/* Location Stock Settings */}
                <div className="space-y-4">
                  <h4 className="font-medium text-sm">Location Stock</h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="loc_current_stock">
                        Stock Quantity ({item.unit_type})
                      </Label>
                      <Input
                        id="loc_current_stock"
                        type="number"
                        step="0.01"
                        min="0"
                        {...locationForm.register("current_stock")}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="loc_reorder_override">
                        Reorder Threshold
                      </Label>
                      <Input
                        id="loc_reorder_override"
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder={`${item.reorder_point} (default)`}
                        {...locationForm.register("reorder_threshold_override")}
                      />
                      <p className="text-xs text-muted-foreground">
                        Leave empty to use global default
                      </p>
                    </div>
                  </div>

                  {/* Reason for stock change */}
                  {locationForm.watch("current_stock") !== initialStock && (
                    <div className="space-y-2">
                      <Label htmlFor="stock_update_reason">
                        Reason for Change{" "}
                        <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="stock_update_reason"
                        placeholder="e.g., Inventory count adjustment, received delivery..."
                        {...locationForm.register("stock_update_reason")}
                      />
                      <p className="text-xs text-muted-foreground">
                        This will be recorded in the activity log
                      </p>
                    </div>
                  )}
                </div>

                <Separator />

                {/* Cost Override */}
                <div className="space-y-4">
                  <h4 className="font-medium text-sm">Pricing</h4>

                  <div className="p-3 rounded-lg bg-muted/50 border">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted-foreground">
                        Base Cost (from global)
                      </span>
                      <span className="font-medium">
                        ${item.cost_per_unit?.toFixed(2)}/{item.unit_type}
                      </span>
                    </div>

                    <div className="flex items-end gap-2">
                      <div className="flex-1 space-y-2">
                        <Label htmlFor="cost_override">Cost Override ($)</Label>
                        <Input
                          id="cost_override"
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="Set custom cost for this location"
                          {...locationForm.register("cost_override")}
                        />
                      </div>
                      {(existingOverride?.custom_cost ||
                        locationForm.watch("cost_override")) && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-10 w-10 text-destructive hover:bg-destructive/10"
                          onClick={handleRemoveCostOverride}
                          disabled={isSubmitting}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Leave empty to use the base cost
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter className="px-6 py-4 border-t flex-col-reverse sm:flex-row">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting} className="gap-2">
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    );
  }

  // ============================================================================
  // RENDER: Full edit for Global or Local item
  // ============================================================================
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[calc(100%-1rem)] sm:max-w-[550px] max-h-[90vh] overflow-hidden p-0 gap-0"
        overlayClassName="bg-black/35 backdrop-blur-md"
      >
        <DialogHeader className="px-6 pt-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/10">
              <Package className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <DialogTitle>Edit Inventory Item</DialogTitle>
              <DialogDescription>
                Update the details for this inventory item
              </DialogDescription>
            </div>
            {isGlobalItem ? (
              <Badge
                variant="outline"
                className="gap-1 text-emerald-600 border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30"
              >
                <Globe className="h-3 w-3" />
                Global
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1">
                <MapPin className="h-3 w-3" />
                Local
              </Badge>
            )}
          </div>
        </DialogHeader>

        <form
          onSubmit={globalForm.handleSubmit(onGlobalSubmit)}
          className="contents"
        >
          <div className="overflow-y-auto px-6 py-4 max-h-[calc(90vh-150px)]">
            <div className="space-y-4">
              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="name">Item Name *</Label>
                <Input
                  id="name"
                  placeholder="e.g., Burger Patty (4oz)"
                  {...globalForm.register("name")}
                />
                {globalForm.formState.errors.name && (
                  <p className="text-sm text-destructive">
                    {globalForm.formState.errors.name.message}
                  </p>
                )}
              </div>

              {/* SKU & Category Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="sku">SKU</Label>
                  <Input
                    id="sku"
                    placeholder="e.g., BP-004"
                    {...globalForm.register("sku")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="category">Category</Label>
                  <Select
                    value={globalForm.watch("category")}
                    onValueChange={(value) =>
                      globalForm.setValue("category", value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Unit & Cost Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="unit_type">Unit Type *</Label>
                  <Select
                    value={globalForm.watch("unit_type")}
                    onValueChange={(value) =>
                      globalForm.setValue("unit_type", value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UNIT_TYPES.map((unit) => (
                        <SelectItem key={unit.value} value={unit.value}>
                          {unit.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cost_per_unit">Base Cost per Unit ($)</Label>
                  <Input
                    id="cost_per_unit"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    {...globalForm.register("cost_per_unit")}
                  />
                </div>
              </div>

              {/* Stock Mode */}
              <div className="space-y-2">
                <Label>Stock Mode</Label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {STOCK_MODES.map((mode) => (
                    <button
                      key={mode.value}
                      type="button"
                      onClick={() => globalForm.setValue("stock_mode", mode.value)}
                      className={cn(
                        "p-3 rounded-lg border text-left transition-all",
                        stockMode === mode.value
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "border-muted hover:border-primary/50"
                      )}
                    >
                      <p className="font-medium text-sm">{mode.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {mode.description}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Stock & Reorder Row - Only show when tracking AND in All Locations view */}
              {stockMode === "stock_tracking" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-lg bg-muted/50 border">
                  {isLocationView ? (
                    // In location view, stock is managed separately
                    <div className="text-center text-sm text-muted-foreground py-2 sm:col-span-2">
                      <Info className="h-4 w-4 inline-block mr-2" />
                      Stock is managed per location via the table
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="current_stock">Default Stock</Label>
                        <Input
                          id="current_stock"
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0"
                          {...globalForm.register("current_stock")}
                        />
                        <p className="text-xs text-muted-foreground">
                          Initial stock for new locations
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="reorder_point">Default Reorder Point</Label>
                        <Input
                          id="reorder_point"
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0"
                          {...globalForm.register("reorder_point")}
                        />
                        <p className="text-xs text-muted-foreground">
                          Alert when stock falls below
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="par_level">Par Level</Label>
                        <Input
                          id="par_level"
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0"
                          {...globalForm.register("par_level")}
                        />
                        <p className="text-xs text-muted-foreground">
                          Target stock level for auto-reorder
                        </p>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Vendor */}
              <div className="space-y-2">
                <Label htmlFor="vendor_id">Default Vendor</Label>
                <Select
                  value={globalForm.watch("vendor_id")}
                  onValueChange={(value) => globalForm.setValue("vendor_id", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a vendor (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No vendor</SelectItem>
                    {vendors.map((vendor) => (
                      <SelectItem key={vendor.id} value={vendor.id}>
                        {vendor.name}
                        {vendor.location_id && (
                          <span className="text-muted-foreground ml-2">
                            (Local)
                          </span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter className="px-6 py-4 border-t flex-col-reverse sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || updateItem.isPending}
              className="gap-2"
            >
              {(isSubmitting || updateItem.isPending) && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
