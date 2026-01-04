"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Loader2, AlertCircle, Package, Star } from "lucide-react";
import { toast } from "sonner";
import {
  GetAvailableItemsForVendor,
  AddVendorItem,
} from "@/app/dashboard/actions/vendor-items";

interface AddVendorItemDialogProps {
  vendorId: string;
  vendorName: string;
  clerkOrgId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function AddVendorItemDialog({
  vendorId,
  vendorName,
  clerkOrgId,
  open,
  onOpenChange,
  onSuccess,
}: AddVendorItemDialogProps) {
  const [selectedItemId, setSelectedItemId] = useState<string>("");
  const [vendorSku, setVendorSku] = useState("");
  const [defaultCost, setDefaultCost] = useState("");
  const [packSize, setPackSize] = useState("");
  const [isPreferred, setIsPreferred] = useState(false);

  // Fetch available items
  const { data: availableData, isLoading: isLoadingItems } = useQuery({
    queryKey: ["available-items-for-vendor", vendorId, clerkOrgId],
    queryFn: () => GetAvailableItemsForVendor(clerkOrgId, vendorId),
    enabled: !!vendorId && !!clerkOrgId && open,
  });

  const availableItems = availableData?.data || [];

  // Add mutation
  const addMutation = useMutation({
    mutationFn: () =>
      AddVendorItem({
        vendorId,
        inventoryItemId: selectedItemId,
        vendorSku: vendorSku || undefined,
        defaultCost: parseFloat(defaultCost) || 0,
        packSize: packSize || undefined,
        isPreferred,
      }),
    onSuccess: (result) => {
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Item added to vendor catalog");
        onSuccess();
        onOpenChange(false);
        resetForm();
      }
    },
    onError: () => toast.error("Failed to add item"),
  });

  const resetForm = () => {
    setSelectedItemId("");
    setVendorSku("");
    setDefaultCost("");
    setPackSize("");
    setIsPreferred(false);
  };

  // Reset when dialog opens
  useEffect(() => {
    if (!open) {
      resetForm();
    }
  }, [open]);

  // Pre-fill cost when item is selected
  useEffect(() => {
    if (selectedItemId) {
      const item = availableItems.find((i) => i.id === selectedItemId);
      if (item && !defaultCost) {
        setDefaultCost(item.cost_per_unit?.toString() || "0");
      }
    }
  }, [selectedItemId, availableItems]);

  const selectedItem = availableItems.find((i) => i.id === selectedItemId);

  const handleSubmit = () => {
    if (!selectedItemId) {
      toast.error("Please select an inventory item");
      return;
    }
    if (!defaultCost || parseFloat(defaultCost) < 0) {
      toast.error("Please enter a valid cost");
      return;
    }
    addMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" />
            Add Item to Catalog
          </DialogTitle>
          <DialogDescription>
            Add an inventory item to {vendorName}&apos;s catalog
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {isLoadingItems ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : availableItems.length === 0 ? (
            <div className="text-center py-8">
              <AlertCircle className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                All inventory items are already in this vendor&apos;s catalog.
              </p>
            </div>
          ) : (
            <>
              {/* Select Item */}
              <div className="space-y-2">
                <Label>Inventory Item *</Label>
                <Select
                  value={selectedItemId}
                  onValueChange={setSelectedItemId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select an item..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableItems.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        <div className="flex items-center gap-2">
                          <Package className="h-4 w-4 text-muted-foreground" />
                          <span>{item.name}</span>
                          {item.sku && (
                            <Badge variant="outline" className="text-xs ml-1">
                              {item.sku}
                            </Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedItem && (
                <div className="p-3 rounded-lg bg-muted/50 border text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Category:</span>
                    <span>{selectedItem.category || "Uncategorized"}</span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-muted-foreground">Unit:</span>
                    <span>{selectedItem.unit_type}</span>
                  </div>
                </div>
              )}

              {/* Vendor SKU */}
              <div className="space-y-2">
                <Label>Vendor SKU (Optional)</Label>
                <Input
                  placeholder="Vendor's product code..."
                  value={vendorSku}
                  onChange={(e) => setVendorSku(e.target.value)}
                />
              </div>

              {/* Cost */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Cost per Unit *</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      $
                    </span>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      className="pl-7"
                      value={defaultCost}
                      onChange={(e) => setDefaultCost(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Pack Size (Optional)</Label>
                  <Input
                    placeholder="e.g., Case of 12"
                    value={packSize}
                    onChange={(e) => setPackSize(e.target.value)}
                  />
                </div>
              </div>

              {/* Preferred */}
              <div className="flex items-center space-x-2 pt-2">
                <Checkbox
                  id="isPreferred"
                  checked={isPreferred}
                  onCheckedChange={(checked) => setIsPreferred(!!checked)}
                />
                <div className="grid gap-1.5 leading-none">
                  <label
                    htmlFor="isPreferred"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex items-center gap-1"
                  >
                    <Star className="h-3.5 w-3.5 text-amber-500" />
                    Mark as Preferred Vendor
                  </label>
                  <p className="text-xs text-muted-foreground">
                    This vendor will be the default for ordering this item
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={
              addMutation.isPending ||
              !selectedItemId ||
              !defaultCost ||
              availableItems.length === 0
            }
          >
            {addMutation.isPending && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            )}
            Add Item
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
