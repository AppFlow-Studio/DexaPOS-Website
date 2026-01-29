"use client";

import { useEffect } from "react";
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
import { Package, Loader2, Trash2 } from "lucide-react";
import { useAdminUpdateInventoryItem, useAdminDeleteInventoryItem } from "../../hooks/use-admin-inventory-management";
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
  cost_per_unit: z.coerce.number().min(0, "Cost must be 0 or greater"),
  vendor_id: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface AdminEditItemDialogProps {
  item: any | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clerkOrgId: string;
  vendors: any[];
}

export function AdminEditItemDialog({
  item,
  open,
  onOpenChange,
  clerkOrgId,
  vendors,
}: AdminEditItemDialogProps) {
  const updateItem = useAdminUpdateInventoryItem(clerkOrgId);
  const deleteItem = useAdminDeleteInventoryItem(clerkOrgId);

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
      cost_per_unit: 0,
      vendor_id: "",
    },
  });

  useEffect(() => {
    if (item && open) {
      form.reset({
        name: item.name || "",
        sku: item.sku || "",
        category: item.category || "",
        unit_type: item.unit_type || "pcs",
        stock_mode: item.stock_mode || "in_stock",
        current_stock: item.current_stock || 0,
        reorder_point: item.reorder_point || 0,
        cost_per_unit: item.cost_per_unit || 0,
        vendor_id: item.vendor_id || "none",
      });
    }
  }, [item, open, form]);

  const stockMode = form.watch("stock_mode");

  const onSubmit = async (values: FormValues) => {
    if (!item) return;
    await updateItem.mutateAsync({
      itemId: item.id,
      data: {
        ...values,
        vendor_id: values.vendor_id === "none" ? null : values.vendor_id || null,
      },
    });

    if (!updateItem.isError) {
      onOpenChange(false);
    }
  };

  const handleDelete = async () => {
    if (!item) return;
    if (confirm("Are you sure you want to delete this item? This will also remove it from any recipes.")) {
      await deleteItem.mutateAsync(item.id);
      if (!deleteItem.isError) {
        onOpenChange(false);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/10">
              <Package className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <DialogTitle>Edit Inventory Item</DialogTitle>
              <DialogDescription>
                Update item details and stock settings
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="edit-name">Item Name *</Label>
            <Input
              id="edit-name"
              {...form.register("name")}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-sku">SKU</Label>
              <Input
                id="edit-sku"
                {...form.register("sku")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-category">Category</Label>
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

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-unit_type">Unit Type *</Label>
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
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-cost_per_unit">Cost per Unit ($)</Label>
              <Input
                id="edit-cost_per_unit"
                type="number"
                step="0.01"
                {...form.register("cost_per_unit")}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Stock Mode</Label>
            <div className="grid grid-cols-3 gap-2">
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
            <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-muted/50 border">
              <div className="space-y-2">
                <Label htmlFor="edit-current_stock">Current Stock</Label>
                <Input
                  id="edit-current_stock"
                  type="number"
                  step="0.01"
                  {...form.register("current_stock")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-reorder_point">Reorder Point</Label>
                <Input
                  id="edit-reorder_point"
                  type="number"
                  step="0.01"
                  {...form.register("reorder_point")}
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="edit-vendor_id">Default Vendor</Label>
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
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter className="pt-4 flex justify-between gap-2">
            <Button
              type="button"
              variant="destructive"
              className="gap-2"
              onClick={handleDelete}
              disabled={deleteItem.isPending}
            >
              <Trash2 className="h-4 w-4" />
              {deleteItem.isPending ? "Deleting..." : "Delete"}
            </Button>
            <div className="flex gap-2">
                <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                >
                Cancel
                </Button>
                <Button
                type="submit"
                disabled={updateItem.isPending}
                className="gap-2"
                >
                {updateItem.isPending && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                )}
                Save Changes
                </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
