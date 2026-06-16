"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import {
  Plus,
  CalendarIcon,
  FileText,
  UserPlus,
  ShoppingCart,
  Package,
  Send,
  X,
} from "lucide-react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CustomerSearch } from "./CustomerSearch";
import { ItemSearch } from "./ItemSearch";
import { LineItemRow, type LineItem } from "./LineItemRow";
import { AddCustomItemDialog } from "./AddCustomItemDialog";
import { QuickAddCustomerDialog } from "./QuickAddCustomerDialog";
import { useCreateInvoice, useUpdateInvoice } from "../hooks/useInvoices";
import { useLocationStore } from "@/stores/location-store";
import type {
  Invoice,
  PaymentDueType,
  CreateInvoiceInput,
} from "@/app/dashboard/actions/invoices";
import type { CustomerListItem } from "@/types/customer";

interface InvoiceFormProps {
  existing?: Invoice;
}

type InvoiceMode = "itemized" | "quick";

export function InvoiceForm({ existing }: InvoiceFormProps) {
  const router = useRouter();
  const { selectedLocationId } = useLocationStore();

  // ── Customer ──────────────────────────────────────────────────────────────
  const [selectedCustomer, setSelectedCustomer] =
    useState<CustomerListItem | null>(
      existing?.customer
        ? ({
            id: existing.customer.id,
            name: existing.customer.name,
            email: existing.customer.email,
            phone: existing.customer.phone,
          } as CustomerListItem)
        : null
    );
  const [showAddCustomer, setShowAddCustomer] = useState(false);

  // ── Payment due ───────────────────────────────────────────────────────────
  const [paymentDueType, setPaymentDueType] = useState<PaymentDueType>(
    existing?.payment_due_type ?? "upon_receipt"
  );
  const [dueDate, setDueDate] = useState<Date | undefined>(
    existing?.due_date ? new Date(existing.due_date) : undefined
  );

  // ── Mode ──────────────────────────────────────────────────────────────────
  const [mode, setMode] = useState<InvoiceMode>("itemized");

  // ── Line items ────────────────────────────────────────────────────────────
  const [lineItems, setLineItems] = useState<LineItem[]>(
    existing?.items?.map((i) => ({
      id: uuidv4(),
      menu_item_id: i.menu_item_id,
      name: i.name,
      description: i.description,
      quantity: i.quantity,
      unit_price: i.unit_price,
      is_to_go: i.is_to_go ?? false,
    })) ?? []
  );
  const [showAddCustomItem, setShowAddCustomItem] = useState(false);

  // ── Quick charge ──────────────────────────────────────────────────────────
  const [quickAmount, setQuickAmount] = useState(
    existing?.items?.[0]?.unit_price?.toString() ?? ""
  );
  const [quickDescription, setQuickDescription] = useState(
    existing?.items?.[0]?.description ?? ""
  );

  // ── Discount & tax ────────────────────────────────────────────────────────
  const [showDiscount, setShowDiscount] = useState(
    !!existing && existing.discount_amount > 0
  );
  const [discountAmount, setDiscountAmount] = useState(
    existing?.discount_amount?.toString() ?? "0"
  );
  const [taxRate, setTaxRate] = useState(
    existing?.tax_rate?.toString() ?? "0"
  );

  // ── Note ──────────────────────────────────────────────────────────────────
  const [note, setNote] = useState(existing?.note ?? "");

  // ── Pending state ─────────────────────────────────────────────────────────
  const [savingAs, setSavingAs] = useState<"draft" | "sent" | null>(null);

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createInvoice = useCreateInvoice();
  const updateInvoice = useUpdateInvoice();

  // ── Calculations ──────────────────────────────────────────────────────────
  const subtotal =
    mode === "itemized"
      ? lineItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0)
      : parseFloat(quickAmount) || 0;

  const discountVal = Math.min(parseFloat(discountAmount) || 0, subtotal);
  const taxRateVal = parseFloat(taxRate) || 0;
  const taxAmount =
    Math.round(((subtotal - discountVal) * taxRateVal) / 100 * 100) / 100;
  const total = Math.max(0, subtotal - discountVal + taxAmount);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleLineItemChange = useCallback(
    (id: string, field: keyof LineItem, value: string | number) => {
      setLineItems((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, [field]: value } : item
        )
      );
    },
    []
  );

  const handleLineItemRemove = useCallback((id: string) => {
    setLineItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const handleMenuItemSelect = (item: {
    id: string;
    name: string;
    price: number;
  }) => {
    setLineItems((prev) => [
      ...prev,
      {
        id: uuidv4(),
        menu_item_id: item.id,
        name: item.name,
        quantity: 1,
        unit_price: item.price,
      },
    ]);
  };

  const handleCustomItemAdd = (item: {
    name: string;
    description?: string;
    quantity: number;
    unit_price: number;
    is_to_go: boolean;
  }) => {
    setLineItems((prev) => [
      ...prev,
      {
        id: uuidv4(),
        menu_item_id: null,
        name: item.name,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        is_to_go: item.is_to_go,
      },
    ]);
  };

  const buildItems = (): CreateInvoiceInput["items"] => {
    if (mode === "quick") {
      return [
        {
          name: "Quick Charge",
          description: quickDescription || null,
          quantity: 1,
          unit_price: parseFloat(quickAmount) || 0,
        },
      ];
    }
    return lineItems.map((item, idx) => ({
      menu_item_id: item.menu_item_id,
      name: item.name,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      is_to_go: item.is_to_go ?? false,
      sort_order: idx,
    }));
  };

  const handleSave = async (status: "draft" | "sent") => {
    setSavingAs(status);
    const locationId =
      selectedLocationId === "all" ? null : selectedLocationId;

    const input: CreateInvoiceInput = {
      location_id: locationId,
      customer_id: selectedCustomer?.id ?? null,
      status,
      payment_due_type: paymentDueType,
      due_date:
        paymentDueType === "custom" && dueDate
          ? format(dueDate, "yyyy-MM-dd")
          : null,
      subtotal,
      discount_amount: discountVal,
      tax_rate: taxRateVal,
      tax_amount: taxAmount,
      total_amount: total,
      note: note.trim() || null,
      items: buildItems(),
    };

    try {
      if (existing) {
        const result = await updateInvoice.mutateAsync({
          invoiceId: existing.id,
          input: { ...input, items: input.items },
        });
        if (result.data || !result.error) {
          router.push(`/dashboard/invoices/${existing.id}`);
        }
      } else {
        const result = await createInvoice.mutateAsync(input);
        if (result.data) {
          router.push(`/dashboard/invoices/${result.data.id}`);
        }
      }
    } finally {
      setSavingAs(null);
    }
  };

  // ── Customer avatar initial ───────────────────────────────────────────────
  const customerInitial = selectedCustomer
    ? (
        selectedCustomer.name ||
        selectedCustomer.email ||
        selectedCustomer.phone ||
        "?"
      )[0].toUpperCase()
    : null;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-5xl">
      <div className="grid lg:grid-cols-[1fr_308px] gap-6 items-start">

        {/* ════════════════════════════════════════════════════════
            LEFT — main form
            ════════════════════════════════════════════════════════ */}
        <div className="space-y-5">

          {/* ── Invoice Details ──────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <FileText className="h-4 w-4 text-primary" />
                </div>
                <CardTitle className="text-base font-semibold">
                  Invoice Details
                </CardTitle>
              </div>
            </CardHeader>

            <CardContent className="space-y-5">
              {/* Customer */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">
                    Send to
                    <span className="text-muted-foreground font-normal ml-1">
                      (optional)
                    </span>
                  </Label>
                  <button
                    type="button"
                    onClick={() => setShowAddCustomer(true)}
                    className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    New customer
                  </button>
                </div>

                <CustomerSearch
                  value={selectedCustomer}
                  onSelect={setSelectedCustomer}
                  onAddNew={() => setShowAddCustomer(true)}
                />

                {/* Selected customer card */}
                {selectedCustomer && (
                  <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-muted/40 border">
                    <div className="h-8 w-8 rounded-full bg-primary/15 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                      {customerInitial}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate leading-tight">
                        {selectedCustomer.name ||
                          selectedCustomer.email ||
                          selectedCustomer.phone}
                      </p>
                      {(selectedCustomer.email || selectedCustomer.phone) && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {[selectedCustomer.email, selectedCustomer.phone]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedCustomer(null)}
                      className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                      aria-label="Remove customer"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>

              <Separator />

              {/* Payment due */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Payment due</Label>
                <Select
                  value={paymentDueType}
                  onValueChange={(v) => setPaymentDueType(v as PaymentDueType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="upon_receipt">Upon Receipt</SelectItem>
                    <SelectItem value="net_15">Net 15</SelectItem>
                    <SelectItem value="net_30">Net 30</SelectItem>
                    <SelectItem value="net_60">Net 60</SelectItem>
                    <SelectItem value="custom">Custom Date…</SelectItem>
                  </SelectContent>
                </Select>

                {paymentDueType === "custom" && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !dueDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dueDate ? format(dueDate, "PPP") : "Pick a due date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto min-w-[280px] p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={dueDate}
                        onSelect={setDueDate}
                        initialFocus
                        disabled={(date) => date < new Date()}
                      />
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            </CardContent>
          </Card>

          {/* ── Sale Details ─────────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <ShoppingCart className="h-4 w-4 text-primary" />
                  </div>
                  <CardTitle className="text-base font-semibold">
                    Sale Details
                  </CardTitle>
                </div>

                {/* Mode toggle */}
                <div className="inline-flex rounded-lg border bg-muted p-0.5 text-sm shrink-0">
                  <button
                    type="button"
                    onClick={() => setMode("itemized")}
                    className={cn(
                      "px-3 py-1.5 rounded-md font-medium transition-all",
                      mode === "itemized"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Itemized
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("quick")}
                    className={cn(
                      "px-3 py-1.5 rounded-md font-medium transition-all",
                      mode === "quick"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Quick charge
                  </button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {mode === "itemized" ? (
                <>
                  {/* Item search + Add custom */}
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <ItemSearch onSelect={handleMenuItemSelect} />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowAddCustomItem(true)}
                      className="shrink-0"
                    >
                      <Plus className="h-4 w-4 mr-1.5" />
                      Custom item
                    </Button>
                  </div>

                  {/* Line items list or empty state */}
                  {lineItems.length === 0 ? (
                    <div className="rounded-xl border-2 border-dashed border-muted-foreground/20 py-12 text-center">
                      <Package className="h-9 w-9 text-muted-foreground/30 mx-auto mb-3" />
                      <p className="text-sm font-medium text-muted-foreground">
                        No items added yet
                      </p>
                      <p className="text-xs text-muted-foreground/60 mt-1">
                        Search above or add a custom item
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-lg border overflow-hidden">
                      {/* Table header */}
                      <div className="grid grid-cols-[1fr_80px_100px_90px_36px] gap-2 bg-muted/50 px-3 py-2.5 text-xs font-semibold text-muted-foreground border-b uppercase tracking-wide">
                        <span>Item</span>
                        <span className="text-center">Qty</span>
                        <span className="text-right">Price</span>
                        <span className="text-right">Total</span>
                        <span />
                      </div>
                      {/* Rows */}
                      <div className="px-3">
                        {lineItems.map((item) => (
                          <LineItemRow
                            key={item.id}
                            item={item}
                            onChange={handleLineItemChange}
                            onRemove={handleLineItemRemove}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Item count badge */}
                  {lineItems.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {lineItems.length}{" "}
                      {lineItems.length === 1 ? "item" : "items"}
                    </p>
                  )}
                </>
              ) : (
                /* ── Quick charge ───────────────────────────────── */
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="quick-amount" className="text-sm font-medium">
                      Amount <span className="text-destructive">*</span>
                    </Label>
                    <div className="flex rounded-md border overflow-hidden focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
                      <div className="flex items-center px-3 bg-muted border-r shrink-0">
                        <span className="text-sm font-medium text-muted-foreground select-none">
                          USD
                        </span>
                      </div>
                      <input
                        id="quick-amount"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={quickAmount}
                        onChange={(e) => setQuickAmount(e.target.value)}
                        className="flex-1 h-10 px-3 text-right font-semibold tabular-nums bg-background outline-none text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="quick-desc" className="text-sm font-medium">
                      Description{" "}
                      <span className="font-normal text-muted-foreground">
                        (optional)
                      </span>
                    </Label>
                    <Input
                      id="quick-desc"
                      placeholder="What is this charge for?"
                      value={quickDescription}
                      onChange={(e) => setQuickDescription(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ════════════════════════════════════════════════════════
            RIGHT — summary sidebar
            ════════════════════════════════════════════════════════ */}
        <div className="space-y-4 lg:sticky lg:top-6">

          {/* ── Order Summary ────────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Order Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">

              {/* Subtotal */}
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium tabular-nums">
                  ${subtotal.toFixed(2)}
                </span>
              </div>

              {/* Discount */}
              {!showDiscount ? (
                <button
                  type="button"
                  onClick={() => setShowDiscount(true)}
                  className="text-sm text-primary hover:text-primary/80 transition-colors w-full text-left"
                >
                  + Add discount
                </button>
              ) : (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium text-muted-foreground">
                      Discount ($)
                    </Label>
                    <button
                      type="button"
                      onClick={() => {
                        setShowDiscount(false);
                        setDiscountAmount("0");
                      }}
                      className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={discountAmount}
                      onChange={(e) => setDiscountAmount(e.target.value)}
                      className="h-8 text-sm text-right"
                    />
                    <span className="text-sm text-green-600 dark:text-green-400 font-medium tabular-nums shrink-0 w-16 text-right">
                      −${discountVal.toFixed(2)}
                    </span>
                  </div>
                </div>
              )}

              {/* Tax */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium text-muted-foreground">
                    Tax rate (%)
                  </Label>
                  {taxRateVal > 0 && (
                    <span className="text-xs text-muted-foreground tabular-nums">
                      ${taxAmount.toFixed(2)}
                    </span>
                  )}
                </div>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={taxRate}
                  onChange={(e) => setTaxRate(e.target.value)}
                  className="h-8 text-sm text-right"
                />
              </div>

              <Separator />

              {/* Total */}
              <div className="flex justify-between items-center pt-1">
                <span className="text-sm font-semibold">Total</span>
                <span className="text-2xl font-bold tabular-nums">
                  ${total.toFixed(2)}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* ── Note ────────────────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">
                Note{" "}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder="Add a note for the customer…"
                value={note}
                onChange={(e) => {
                  if (e.target.value.length <= 200) setNote(e.target.value);
                }}
                rows={3}
                className="resize-none text-sm"
              />
              <p
                className={cn(
                  "text-xs mt-1.5 text-right tabular-nums",
                  note.length >= 180
                    ? "text-destructive"
                    : "text-muted-foreground"
                )}
              >
                {note.length}/200
              </p>
            </CardContent>
          </Card>

          {/* ── Actions ─────────────────────────────────────────── */}
          <div className="space-y-2">
            <Button
              className="w-full"
              size="lg"
              onClick={() => handleSave("sent")}
              disabled={savingAs !== null}
            >
              {savingAs === "sent" ? (
                "Sending…"
              ) : (
                <>
                  Send Invoice
                  <Send className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>
            <Button
              className="w-full"
              variant="outline"
              onClick={() => handleSave("draft")}
              disabled={savingAs !== null}
            >
              {savingAs === "draft" ? "Saving…" : "Save as Draft"}
            </Button>
          </div>
        </div>
      </div>

      {/* ── Dialogs ───────────────────────────────────────────────── */}
      <AddCustomItemDialog
        open={showAddCustomItem}
        onOpenChange={setShowAddCustomItem}
        onAdd={handleCustomItemAdd}
      />
      <QuickAddCustomerDialog
        open={showAddCustomer}
        onOpenChange={setShowAddCustomer}
        onCreated={(customer) => setSelectedCustomer(customer)}
      />
    </div>
  );
}
