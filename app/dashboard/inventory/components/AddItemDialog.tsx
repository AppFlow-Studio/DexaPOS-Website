"use client";

import { useState } from "react";
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
import { Package, Loader2, Globe, MapPin } from "lucide-react";
import {
  useCreateInventoryItem,
  useVendors,
} from "../hooks/useInventoryManagement";
import { useLocationStore, useSelectedLocation } from "@/stores/location-store";
import { cn } from "@/lib/utils";
import { StockMode } from "@/types/inventory";

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

const formSchema = z.object({
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

type FormValues = z.infer<typeof formSchema>;

interface AddItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddItemDialog({ open, onOpenChange }: AddItemDialogProps) {
  const createItem = useCreateInventoryItem();
  const { data: vendors = [] } = useVendors();
  const { selectedLocationId } = useLocationStore();
  const selectedLocation = useSelectedLocation();

  // Determine if we're in global or location view
  const isGlobalView = selectedLocationId === "all" || !selectedLocationId;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
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

  const stockMode = form.watch("stock_mode");

  const onSubmit = async (values: FormValues) => {
    try {
      const result = await createItem.mutateAsync({
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
          values.vendor_id === "none" ? undefined : values.vendor_id || undefined,
        // Set location_id based on view:
        // - Global view (All Locations) → null (global item)
        // - Location view → selectedLocationId (location-specific item)
        location_id: isGlobalView ? null : selectedLocationId,
      });

      if (!result?.error) {
        form.reset();
        onOpenChange(false);
      }
    } catch {
      // Error toast is already shown by the mutation's onError handler
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[calc(100%-1rem)] max-h-[90vh] overflow-hidden p-0 gap-0"
        overlayClassName="bg-black/35 backdrop-blur-md"
      >
        <DialogHeader className="px-6 pt-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-linear-to-br from-primary/20 to-primary/5 border border-primary/10">
              <Package className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <DialogTitle>Add Inventory Item</DialogTitle>
              <DialogDescription>
                Add a new ingredient or supply to your inventory catalog
              </DialogDescription>
            </div>
            {/* Scope badge - show where this item will be created */}
            {isGlobalView ? (
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
                {selectedLocation?.name || "Location"}
              </Badge>
            )}
          </div>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="contents">
          <div className="overflow-y-auto px-6 py-4 max-h-[calc(90vh-150px)]">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Item Name *</Label>
                <Input
                  id="name"
                  placeholder="e.g., Burger Patty (4oz)"
                  {...form.register("name")}
                />
                {form.formState.errors.name && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.name.message}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="sku">SKU</Label>
                  <Input
                    id="sku"
                    placeholder="e.g., BP-004"
                    {...form.register("sku")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="category">Category</Label>
                  <Select
                    value={form.watch("category")}
                    onValueChange={(value) => form.setValue("category", value)}
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="unit_type">Unit Type *</Label>
                  <Select
                    value={form.watch("unit_type")}
                    onValueChange={(value) => form.setValue("unit_type", value)}
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
                  {form.formState.errors.unit_type && (
                    <p className="text-sm text-destructive">
                      {form.formState.errors.unit_type.message}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cost_per_unit">Cost per Unit ($)</Label>
                  <Input
                    id="cost_per_unit"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    {...form.register("cost_per_unit")}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Stock Mode</Label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {STOCK_MODES.map((mode) => (
                    <button
                      key={mode.value}
                      type="button"
                      onClick={() => form.setValue("stock_mode", mode.value)}
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

              {stockMode === "stock_tracking" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-lg bg-muted/50 border">
                  <div className="space-y-2">
                    <Label htmlFor="current_stock">Current Stock</Label>
                    <Input
                      id="current_stock"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0"
                      {...form.register("current_stock")}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reorder_point">Reorder Point</Label>
                    <Input
                      id="reorder_point"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0"
                      {...form.register("reorder_point")}
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
                      {...form.register("par_level")}
                    />
                    <p className="text-xs text-muted-foreground">
                      Target stock level for auto-reorder
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="vendor_id">Default Vendor</Label>
                <Select
                  value={form.watch("vendor_id")}
                  onValueChange={(value) => form.setValue("vendor_id", value)}
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

          <DialogFooter className="px-6 py-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createItem.isPending}
              className="gap-2"
            >
              {createItem.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              Add Item
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
