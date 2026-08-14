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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
  Receipt,
  Loader2,
  Plus,
  Trash2,
  CreditCard,
  Banknote,
  AlertCircle,
  Check,
  ChevronsUpDown,
  Package,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useLocationStore, useSelectedLocation } from "@/stores/location-store";
import { useInventoryItems } from "../hooks/useInventoryManagement";
import { cn } from "@/lib/utils";

interface ExpenseLineItem {
  id: string;
  inventory_item_id?: string;
  name: string;
  quantity: number;
  unit_cost: number;
}

const EXPENSE_CATEGORIES = [
  "Groceries",
  "Supplies",
  "Equipment",
  "Maintenance",
  "Other",
];

const formSchema = z.object({
  expense_vendor_name: z.string().min(1, "Store/vendor name is required"),
  expense_category: z.string().optional(),
  expense_notes: z.string().optional(),
  payment_method: z.enum(["card", "cash"]),
  card_last_four: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface CreateExpenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    expense_vendor_name: string;
    expense_category?: string;
    expense_notes?: string;
    payment_method: "card" | "cash";
    card_last_four?: string;
    total_amount: number;
    items: Array<{
      inventory_item_id?: string;
      name: string;
      quantity: number;
      unit_cost: number;
    }>;
  }) => Promise<void>;
  isPending?: boolean;
}

export function CreateExpenseDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending,
}: CreateExpenseDialogProps) {
  const { data: inventoryItems = [] } = useInventoryItems();
  const selectedLocation = useSelectedLocation();
  const { selectedLocationId } = useLocationStore();
  const isAllLocations = selectedLocationId === "all" || !selectedLocationId;

  const [lineItems, setLineItems] = useState<ExpenseLineItem[]>([]);
  const [newItemQty, setNewItemQty] = useState("1");
  const [newItemCost, setNewItemCost] = useState("");
  const [selectedInventoryItem, setSelectedInventoryItem] = useState("");
  const [openItemCombobox, setOpenItemCombobox] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      expense_vendor_name: "",
      expense_category: "",
      expense_notes: "",
      payment_method: "card",
      card_last_four: "",
    },
  });

  const paymentMethod = form.watch("payment_method");

  const totalAmount = lineItems.reduce(
    (sum, item) => sum + item.quantity * item.unit_cost,
    0
  );

  // Filter out already added items
  const unaddedItems = inventoryItems.filter(
    (item) => !lineItems.some((li) => li.inventory_item_id === item.id)
  );

  const addLineItem = () => {
    if (!selectedInventoryItem) return;

    const item = inventoryItems.find((i) => i.id === selectedInventoryItem);
    if (!item || !newItemCost) return;

    const newItem: ExpenseLineItem = {
      id: crypto.randomUUID(),
      inventory_item_id: item.id,
      name: item.name,
      quantity: parseFloat(newItemQty) || 1,
      unit_cost: parseFloat(newItemCost) || 0,
    };

    setLineItems([...lineItems, newItem]);
    setNewItemQty("1");
    setNewItemCost("");
    setSelectedInventoryItem("");
  };

  const removeLineItem = (id: string) => {
    setLineItems(lineItems.filter((item) => item.id !== id));
  };

  const handleSubmit = async (values: FormValues) => {
    if (lineItems.length === 0) return;

    await onSubmit({
      expense_vendor_name: values.expense_vendor_name,
      expense_category: values.expense_category,
      expense_notes: values.expense_notes,
      payment_method: values.payment_method,
      card_last_four:
        values.payment_method === "card" ? values.card_last_four : undefined,
      total_amount: totalAmount,
      items: lineItems.map((item) => ({
        inventory_item_id: item.inventory_item_id,
        name: item.name,
        quantity: item.quantity,
        unit_cost: item.unit_cost,
      })),
    });

    // Reset form
    form.reset();
    setLineItems([]);
    onOpenChange(false);
  };

  const handleClose = () => {
    form.reset();
    setLineItems([]);
    setNewItemQty("1");
    setNewItemCost("");
    setSelectedInventoryItem("");
    onOpenChange(false);
  };

  if (isAllLocations) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="bg-card sm:max-w-[450px]">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/60">
                <AlertCircle className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <DialogTitle>Select a Location</DialogTitle>
                <DialogDescription>
                  You must select a specific location to log an expense
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <Alert variant="default" className="mt-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Expenses are logged for a specific store location. Please select a
              location from the header dropdown before logging an expense.
            </AlertDescription>
          </Alert>
          <DialogFooter className="pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4">
            <Button onClick={() => onOpenChange(false)}>Got it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="flex max-h-dvh w-full max-w-none flex-col gap-0 overflow-hidden rounded-none bg-card p-0 max-sm:h-auto max-sm:top-auto max-sm:translate-y-0 sm:h-[min(760px,calc(100dvh-1rem))] sm:max-h-[90vh] sm:w-[calc(100%-1rem)] sm:max-w-[600px] sm:rounded-3xl">
        <DialogHeader className="shrink-0 bg-card px-5 pb-4 pt-5 pr-14 sm:px-6 sm:pt-6 sm:pr-16">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted/60">
              <Receipt className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <DialogTitle>Log Expense</DialogTitle>
              <DialogDescription>
                Record a purchase made outside of vendors (e.g., grocery store
                run) for {selectedLocation?.name || "this location"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit(handleSubmit)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="thin-scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto bg-card px-5 py-4 sm:px-6">
          {/* Store/Vendor Name */}
          <div className="space-y-2">
            <Label htmlFor="expense_vendor_name">
              Store / Vendor Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="expense_vendor_name"
              placeholder="e.g., Costco, Walmart, Local Grocery..."
              {...form.register("expense_vendor_name")}
            />
            {form.formState.errors.expense_vendor_name && (
              <p className="text-sm text-destructive">
                {form.formState.errors.expense_vendor_name.message}
              </p>
            )}
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label htmlFor="expense_category">Category</Label>
            <Select
              value={form.watch("expense_category")}
              onValueChange={(value) =>
                form.setValue("expense_category", value)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select category (optional)" />
              </SelectTrigger>
              <SelectContent>
                {EXPENSE_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Payment Method */}
          <div className="space-y-3">
            <Label>Payment Method</Label>
            <RadioGroup
              value={paymentMethod}
              onValueChange={(value) =>
                form.setValue("payment_method", value as "card" | "cash")
              }
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="card" id="card" />
                <Label
                  htmlFor="card"
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <CreditCard className="h-4 w-4" />
                  Card
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="cash" id="cash" />
                <Label
                  htmlFor="cash"
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Banknote className="h-4 w-4" />
                  Cash
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Card Last Four */}
          {paymentMethod === "card" && (
            <div className="space-y-2">
              <Label htmlFor="card_last_four">Last 4 Digits of Card</Label>
              <Input
                id="card_last_four"
                placeholder="1234"
                maxLength={4}
                {...form.register("card_last_four")}
                className="w-24"
              />
            </div>
          )}

          {/* Add Item Section */}
          <div className="space-y-3 pt-2">
            <Label>Add Items</Label>
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
              <div className="sm:col-span-6 min-w-0">
                <Popover
                  open={openItemCombobox}
                  onOpenChange={setOpenItemCombobox}
                  modal={true}
                >
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={openItemCombobox}
                      className="w-full justify-between"
                    >
                      <span className="truncate">
                        {selectedInventoryItem
                          ? inventoryItems.find(
                              (item) => item.id === selectedInventoryItem
                            )?.name
                          : "Select inventory item..."}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="z-[100] w-[min(400px,calc(100vw-2rem))] overflow-hidden rounded-2xl p-0">
                    <Command className="rounded-2xl">
                      <CommandInput placeholder="Search items..." />
                      <CommandList>
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
                          {unaddedItems.map((item) => (
                            <CommandItem
                              key={item.id}
                              value={`${item.name}-${item.id}`}
                              className="data-[disabled]:opacity-100 data-[disabled]:pointer-events-auto cursor-pointer"
                              onSelect={() => {
                                setSelectedInventoryItem(item.id);
                                setNewItemCost(
                                  item.cost_per_unit?.toString() || ""
                                );
                                setOpenItemCombobox(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  selectedInventoryItem === item.id
                                    ? "opacity-100"
                                    : "opacity-0"
                                )}
                              />
                              <div className="flex items-center gap-2 flex-1">
                                <span className="font-medium text-foreground">
                                  {item.name}
                                </span>
                                <span className="text-xs text-muted-foreground">
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
              </div>
              <div className="sm:col-span-6 flex items-center gap-2">
                <Input
                  type="number"
                  placeholder="Qty"
                  min="0.01"
                  step="0.01"
                  value={newItemQty}
                  onChange={(e) => setNewItemQty(e.target.value)}
                  className="w-0 flex-1 min-w-0"
                />
                <div className="flex items-center flex-[1.5] min-w-0">
                  <span className="text-muted-foreground mr-1">$</span>
                  <Input
                    type="number"
                    placeholder="Cost"
                    min="0"
                    step="0.01"
                    value={newItemCost}
                    onChange={(e) => setNewItemCost(e.target.value)}
                    className="w-0 flex-1 min-w-0"
                  />
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  onClick={addLineItem}
                  disabled={!selectedInventoryItem || !newItemCost}
                  className="shrink-0"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Line Items List */}
          <div className="space-y-2">
            {lineItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border-0 bg-muted/40 py-6 text-center">
                <Receipt className="h-6 w-6 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  No items added yet. Add items purchased above.
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border-0 bg-muted/35 p-2">
                {/* Header */}
                <div className="grid grid-cols-12 gap-2 rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground">
                  <div className="col-span-5">Item</div>
                  <div className="col-span-2 text-right">Qty</div>
                  <div className="col-span-2 text-right">Cost</div>
                  <div className="col-span-3 text-right">Total</div>
                </div>

                {/* Items */}
                {lineItems.map((item) => (
                  <div
                    key={item.id}
                    className="grid grid-cols-12 items-center gap-2 rounded-xl bg-background px-3 py-2"
                  >
                    <div className="col-span-5 flex items-center gap-2 min-w-0">
                      <span className="text-sm font-medium truncate">
                        {item.name}
                      </span>
                      {item.inventory_item_id && (
                        <Badge variant="outline" className="text-xs shrink-0">
                          Inventory
                        </Badge>
                      )}
                    </div>
                    <div className="col-span-2 text-sm text-right tabular-nums">
                      {item.quantity}
                    </div>
                    <div className="col-span-2 text-sm text-right tabular-nums break-all">
                      ${item.unit_cost.toFixed(2)}
                    </div>
                    <div className="col-span-3 flex items-center justify-end gap-1 min-w-0">
                      <span className="font-medium text-sm tabular-nums break-all text-right">
                        ${(item.quantity * item.unit_cost).toFixed(2)}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => removeLineItem(item.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}

                {/* Total */}
                <div className="grid grid-cols-12 gap-2 px-3 py-3 bg-muted/30 items-center">
                  <div className="col-span-8 text-right font-medium">
                    Total:
                  </div>
                  <div className="col-span-4 text-right min-w-0">
                    <span className="text-lg font-bold text-primary tabular-nums break-all">
                      ${totalAmount.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="expense_notes">Notes (optional)</Label>
            <Textarea
              id="expense_notes"
              placeholder="Any additional notes about this expense..."
              {...form.register("expense_notes")}
              rows={2}
            />
          </div>

          </div>

          <DialogFooter className="shrink-0 bg-card px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 sm:px-6">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending || lineItems.length === 0}
              className="gap-2"
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Log Expense
              {lineItems.length > 0 && (
                <Badge variant="secondary" className="ml-1">
                  ${totalAmount.toFixed(2)}
                </Badge>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
