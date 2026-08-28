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
import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  ShoppingCart,
  Loader2,
  Plus,
  Trash2,
  Package,
  AlertCircle,
  Check,
  ChevronsUpDown,
  Truck,
} from "lucide-react";
import {
  useCreatePurchaseOrder,
  useVendors,
  useInventoryItems,
} from "../hooks/useInventoryManagement";
import { useLocationStore, useSelectedLocation } from "@/stores/location-store";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface POLineItem {
  inventory_item_id: string;
  name: string;
  unit_type: string;
  quantity_ordered: number;
  unit_cost: number;
}

const formSchema = z.object({
  vendor_id: z.string().min(1, "Please select a vendor"),
});

type FormValues = z.infer<typeof formSchema>;

interface CreatePurchaseOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreatePurchaseOrderDialog({
  open,
  onOpenChange,
}: CreatePurchaseOrderDialogProps) {
  const createPO = useCreatePurchaseOrder();
  const { data: vendors = [] } = useVendors();
  const { data: items = [] } = useInventoryItems();
  const selectedLocation = useSelectedLocation();
  const { selectedLocationId } = useLocationStore();
  const isAllLocations = selectedLocationId === "all" || !selectedLocationId;

  const [lineItems, setLineItems] = useState<POLineItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string>("");
  const [openVendorCombobox, setOpenVendorCombobox] = useState(false);
  const [openItemCombobox, setOpenItemCombobox] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      vendor_id: "",
    },
  });

  const addLineItem = () => {
    if (!selectedItemId) return;

    const item = items.find((i) => i.id === selectedItemId);
    if (!item) return;

    // Check if already added
    if (lineItems.some((li) => li.inventory_item_id === selectedItemId)) {
      return;
    }

    setLineItems([
      ...lineItems,
      {
        inventory_item_id: item.id,
        name: item.name,
        unit_type: item.unit_type,
        quantity_ordered: 1,
        unit_cost: item.cost_per_unit,
      },
    ]);
    setSelectedItemId("");
  };

  const updateLineItem = (
    index: number,
    field: "quantity_ordered" | "unit_cost",
    value: number
  ) => {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };
    setLineItems(updated);
  };

  const removeLineItem = (index: number) => {
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  const totalAmount = lineItems.reduce(
    (sum, item) => sum + item.quantity_ordered * item.unit_cost,
    0
  );

  const onSubmit = async (values: FormValues) => {
    if (lineItems.length === 0) {
      return;
    }

    await createPO.mutateAsync({
      location_id: selectedLocationId as string,
      vendor_id: values.vendor_id,
      items: lineItems.map((item) => ({
        inventory_item_id: item.inventory_item_id,
        quantity_ordered: item.quantity_ordered,
        unit_cost: item.unit_cost,
      })),
    });

    if (!createPO.isError) {
      form.reset();
      setLineItems([]);
      onOpenChange(false);
    }
  };

  const handleClose = () => {
    form.reset();
    setLineItems([]);
    setSelectedItemId("");
    onOpenChange(false);
  };

  // Cannot create PO without selecting a specific location
  if (isAllLocations) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[450px] sm:rounded-3xl">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/20 border border-amber-500/10">
                <AlertCircle className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <DialogTitle>Select a Location</DialogTitle>
                <DialogDescription>
                  You must select a specific location to create a purchase order
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <Alert variant="default" className="mt-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Purchase orders are created for a specific store location. Please
              select a location from the header dropdown before creating an
              order.
            </AlertDescription>
          </Alert>
          <DialogFooter className="pt-4">
            <Button onClick={() => onOpenChange(false)}>Got it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="flex max-h-dvh w-full max-w-none flex-col gap-0 overflow-hidden max-sm:overflow-hidden rounded-none bg-card p-0 max-sm:h-auto max-sm:top-auto max-sm:translate-y-0 sm:max-h-[90vh] sm:w-[calc(100%-1rem)] sm:max-w-[700px] sm:rounded-3xl">
        <DialogHeader className="shrink-0 bg-card px-5 pb-4 pt-5 pr-14 text-left sm:px-6 sm:pt-6 sm:pr-16">
          <div className="flex min-w-0 items-center gap-3">
            <div className="shrink-0 p-2.5 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 border border-emerald-500/10">
              <ShoppingCart className="h-5 w-5 text-emerald-500" />
            </div>
            <div className="min-w-0">
              <DialogTitle>Create Purchase Order</DialogTitle>
              <DialogDescription>
                Order inventory for {selectedLocation?.name || "this location"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
          <div className="thin-scrollbar min-h-0 flex-1 space-y-6 overflow-y-auto bg-card px-5 py-4 sm:px-6">
          {/* Vendor Selection */}
          <div className="space-y-2">
            <Label htmlFor="vendor_id">Vendor *</Label>
            <Popover
              open={openVendorCombobox}
              onOpenChange={setOpenVendorCombobox}
              modal={true}
            >
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  role="combobox"
                  aria-expanded={openVendorCombobox}
                  className="w-full justify-between border-0 bg-muted/60 shadow-none hover:bg-muted"
                >
                  {form.watch("vendor_id")
                    ? vendors.find((v) => v.id === form.watch("vendor_id"))
                        ?.name
                    : "Select a vendor..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="z-[100] w-[min(400px,calc(100vw-2rem))] overflow-hidden rounded-2xl p-0">
                <Command>
                  <CommandInput placeholder="Search vendors..." />
                  <CommandList className="max-h-[240px]">
                    <CommandEmpty>
                      <div className="py-6 text-center">
                        <Truck className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">
                          No vendors found.
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Add vendors first.
                        </p>
                      </div>
                    </CommandEmpty>
                    <CommandGroup>
                      {vendors.map((vendor) => (
                        <CommandItem
                          key={vendor.id}
                          value={`${vendor.name}-${vendor.id}`}
                          className="data-[disabled]:opacity-100 data-[disabled]:pointer-events-auto cursor-pointer"
                          onSelect={() => {
                            form.setValue("vendor_id", vendor.id);
                            setOpenVendorCombobox(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              form.watch("vendor_id") === vendor.id
                                ? "opacity-100"
                                : "opacity-0"
                            )}
                          />
                          <span className="font-medium text-gray-700 dark:text-gray-200">
                            {vendor.name}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {form.formState.errors.vendor_id && (
              <p className="text-sm text-destructive">
                {form.formState.errors.vendor_id.message}
              </p>
            )}
          </div>

          {/* Add Item Row */}
          <div className="space-y-2">
            <Label>Add Items</Label>
            <div className="flex gap-2">
              <Popover
                open={openItemCombobox}
                onOpenChange={setOpenItemCombobox}
                modal={true}
              >
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    role="combobox"
                    aria-expanded={openItemCombobox}
                    className="flex-1 min-w-0 justify-between border-0 bg-muted/60 shadow-none hover:bg-muted"
                  >
                    <span className="truncate">
                      {selectedItemId
                        ? items.find((item) => item.id === selectedItemId)?.name
                        : "Select an item to add..."}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="z-[100] w-[min(320px,calc(100vw-2rem))] overflow-hidden rounded-2xl p-0">
                  <Command>
                    <CommandInput placeholder="Search items..." />
                    <CommandList className="max-h-[240px]">
                      <CommandEmpty>
                        <div className="py-6 text-center">
                          <Package className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                          <p className="text-sm text-muted-foreground">
                            No items found.
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Add items in the Inventory catalog first.
                          </p>
                        </div>
                      </CommandEmpty>
                      <CommandGroup>
                        {items
                          .filter(
                            (item) =>
                              !lineItems.some(
                                (li) => li.inventory_item_id === item.id
                              )
                          )
                          .map((item) => (
                            <CommandItem
                              key={item.id}
                              value={`${item.name}-${item.id}`}
                              className="data-[disabled]:opacity-100 data-[disabled]:pointer-events-auto cursor-pointer"
                              onSelect={() => {
                                setSelectedItemId(item.id);
                                setOpenItemCombobox(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  selectedItemId === item.id
                                    ? "opacity-100"
                                    : "opacity-0"
                                )}
                              />
                              <div className="flex items-center gap-2 flex-1">
                                <span className="font-medium text-gray-700 dark:text-gray-200">
                                  {item.name}
                                </span>
                                <span className="text-xs text-gray-500">
                                  (${item.cost_per_unit?.toFixed(2)}/
                                  {item.unit_type})
                                </span>
                              </div>
                            </CommandItem>
                          ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <Button
                type="button"
                variant="secondary"
                onClick={addLineItem}
                disabled={!selectedItemId}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Line Items */}
          <div className="space-y-3">
            <Label>Order Items</Label>

            {lineItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border-0 bg-muted/20 py-8 text-center">
                <Package className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  No items added yet. Select items from the dropdown above.
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border-0 bg-muted/20">
                {/* Header (desktop only — mobile rows use inline labels) */}
                <div className="hidden sm:grid grid-cols-12 gap-2 bg-muted/50 px-3 py-3 text-sm font-medium text-muted-foreground">
                  <div className="col-span-4">Item</div>
                  <div className="col-span-2">Qty</div>
                  <div className="col-span-2">Cost</div>
                  <div className="col-span-3 text-right">Total</div>
                  <div className="col-span-1"></div>
                </div>

                {/* Items */}
                {lineItems.map((item, index) => (
                  <div
                    key={item.inventory_item_id}
                    className="flex flex-col gap-2 border-0 bg-card/70 px-3 py-3 transition-colors hover:bg-muted/40 sm:grid sm:grid-cols-12 sm:gap-2 sm:items-center"
                  >
                    <div className="sm:col-span-4 min-w-0">
                      <p className="font-medium text-sm break-words">
                        {item.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.unit_type}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 sm:contents">
                      <div className="flex-1 min-w-0 sm:col-span-2">
                        <Label className="text-[10px] uppercase text-muted-foreground sm:hidden">
                          Qty
                        </Label>
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity_ordered}
                          onChange={(e) =>
                            updateLineItem(
                              index,
                              "quantity_ordered",
                              parseFloat(e.target.value) || 0
                            )
                          }
                          className="h-8 w-full min-w-0"
                        />
                      </div>
                      <div className="flex-1 min-w-0 sm:col-span-2">
                        <Label className="text-[10px] uppercase text-muted-foreground sm:hidden">
                          Cost
                        </Label>
                        <div className="flex items-center">
                          <span className="text-muted-foreground mr-1 shrink-0">
                            $
                          </span>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={item.unit_cost}
                            onChange={(e) =>
                              updateLineItem(
                                index,
                                "unit_cost",
                                parseFloat(e.target.value) || 0
                              )
                            }
                            className="h-8 w-full min-w-0"
                          />
                        </div>
                      </div>
                      <div className="text-right min-w-0 sm:col-span-3">
                        <Label className="block text-[10px] uppercase text-muted-foreground sm:hidden">
                          Total
                        </Label>
                        <span className="font-medium text-sm tabular-nums break-all">
                          ${(item.quantity_ordered * item.unit_cost).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-end sm:col-span-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => removeLineItem(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Total */}
                <div className="grid grid-cols-12 items-center gap-2 bg-muted/50 px-3 py-3">
                  <div className="col-span-8 text-right font-medium">
                    Order Total:
                  </div>
                  <div className="col-span-3 text-right min-w-0">
                    <span className="text-lg font-bold text-primary tabular-nums break-all">
                      ${totalAmount.toFixed(2)}
                    </span>
                  </div>
                  <div className="col-span-1"></div>
                </div>
              </div>
            )}
          </div>

          </div>

          <DialogFooter className="shrink-0 bg-card px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 sm:px-6">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createPO.isPending || lineItems.length === 0}
              className="gap-2"
            >
              {createPO.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              Create Order
              {lineItems.length > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {lineItems.length} item{lineItems.length !== 1 ? "s" : ""}
                </Badge>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
