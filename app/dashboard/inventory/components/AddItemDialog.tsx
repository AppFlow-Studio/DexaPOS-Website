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
import { useLocationStore, useSelectedLocation, useIsSingleLocation } from "@/stores/location-store";
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
  const isSingleLocation = useIsSingleLocation();

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
        className="flex max-h-dvh w-full max-w-none flex-col gap-0 overflow-hidden rounded-none bg-card p-0 max-sm:h-auto max-sm:top-auto max-sm:translate-y-0 sm:h-[min(760px,calc(100dvh-1rem))] sm:w-[calc(100%-1rem)] sm:max-h-[90vh] sm:max-w-lg sm:rounded-3xl"
        overlayClassName="bg-black/35 backdrop-blur-md"
      >
        <DialogHeader className="shrink-0 px-5 pb-4 pt-5 pr-14 sm:px-6 sm:pt-6 sm:pr-16">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted/60">
              <Package className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle>Add Inventory Item</DialogTitle>
              <DialogDescription>
                Add a new ingredient or supply to your inventory catalog
              </DialogDescription>
            </div>
            {/* Scope badge - show where this item will be created.
                Hidden for single-location accounts (always global). */}
            {isSingleLocation ? null : isGlobalView ? (
              <Badge
                variant="outline"
                className="hidden shrink-0 gap-1 bg-muted/60 text-muted-foreground sm:inline-flex"
              >
                <Globe className="h-3 w-3" />
                Global
              </Badge>
            ) : (
              <Badge variant="outline" className="hidden shrink-0 gap-1 sm:inline-flex">
                <MapPin className="h-3 w-3" />
                {selectedLocation?.name || "Location"}
              </Badge>
            )}
          </div>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
          <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto bg-card px-5 py-4 sm:px-6">
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
                        "rounded-2xl border-0 p-3 text-left transition-colors",
                        stockMode === mode.value
                          ? "bg-background shadow-sm ring-1 ring-border"
                          : "bg-muted/60 hover:bg-muted"
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
                <div className="grid grid-cols-1 gap-4 rounded-2xl border-0 bg-muted/60 p-4 sm:grid-cols-2">
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

          <DialogFooter className="shrink-0 bg-card px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 sm:px-6">
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
