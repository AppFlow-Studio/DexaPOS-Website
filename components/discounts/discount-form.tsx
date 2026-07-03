"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import {
  discountFormSchema,
  DiscountFormValues,
} from "@/lib/validations/discount";
import { DiscountFormInput, defaultApplicableDays } from "@/types/discount";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { DaySelector } from "./day-selector";
import { TimeWindowPicker } from "./time-window-picker";
import { CategoryOption } from "./category-picker";
import { MenuItemOption } from "./menu-item-picker";
import { TargetingSheet } from "./targeting-sheet";
import {
  Percent,
  DollarSign,
  Settings2,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  X,
  MapPin,
  ShieldCheck,
  Layers,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface LocationOption {
  id: string;
  name: string;
}

interface DiscountFormProps {
  defaultValues?: Partial<DiscountFormValues>;
  onSubmit: (values: DiscountFormValues) => Promise<void> | void;
  submitting?: boolean;
  submitLabel?: string;
  categories?: CategoryOption[];
  menuItems?: MenuItemOption[];
  locations?: LocationOption[];
  /**
   * When the account has exactly one active location, the global-vs-location
   * scope picker is meaningless — the discount silently defaults to global
   * (location_id = null, unchanged stored data). Hide the field entirely.
   */
  isSingleLocation?: boolean;
  onCancel?: () => void;
}

function toDate(value?: Date | string | null) {
  if (!value) return undefined;
  return value instanceof Date ? value : new Date(value);
}

export function DiscountForm({
  defaultValues,
  onSubmit,
  submitting,
  submitLabel = "Save discount",
  categories = [],
  menuItems = [],
  locations = [],
  isSingleLocation = false,
  onCancel,
}: DiscountFormProps) {
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [targetingSheetOpen, setTargetingSheetOpen] = useState(false);

  const resolvedDefaults: DiscountFormValues = useMemo(
    () => ({
      name: defaultValues?.name ?? "",
      description: defaultValues?.description ?? "",
      discount_type: defaultValues?.discount_type ?? "percentage",
      discount_value: defaultValues?.discount_value ?? 0,
      min_purchase_amount: defaultValues?.min_purchase_amount,
      max_discount_amount: defaultValues?.max_discount_amount,
      start_date: toDate(defaultValues?.start_date ?? null),
      end_date: toDate(defaultValues?.end_date ?? null),
      is_active: defaultValues?.is_active ?? true,
      scope: defaultValues?.scope ?? "both",
      location_id: defaultValues?.location_id ?? null,
      requires_manager_approval:
        defaultValues?.requires_manager_approval ?? false,
      max_uses_per_day: defaultValues?.max_uses_per_day,
      max_uses_per_order: defaultValues?.max_uses_per_order ?? 1,
      applicable_days: defaultValues?.applicable_days ?? defaultApplicableDays,
      applicable_hours_start: defaultValues?.applicable_hours_start,
      applicable_hours_end: defaultValues?.applicable_hours_end,
      exclude_alcohol: defaultValues?.exclude_alcohol ?? false,
      exclude_categories: defaultValues?.exclude_categories ?? [],
      applies_to_categories: defaultValues?.applies_to_categories ?? [],
      stackable: defaultValues?.stackable ?? false,
      display_order: defaultValues?.display_order ?? 0,
      menu_item_ids: defaultValues?.menu_item_ids ?? [],
    }),
    [defaultValues]
  );

  const form = useForm<DiscountFormValues>({
    resolver: zodResolver(discountFormSchema),
    defaultValues: resolvedDefaults,
    mode: "onBlur",
  });

  const watchType = form.watch("discount_type");
  const watchScope = form.watch("scope");
  const watchAppliesTo = form.watch("applies_to_categories");
  const watchExcludeCategories = form.watch("exclude_categories");
  const watchMenuItems = form.watch("menu_item_ids");
  const watchExcludeAlcohol = form.watch("exclude_alcohol");

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (form.formState.isDirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [form.formState.isDirty]);

  const handleSubmit = form.handleSubmit(
    async (values) => {
      await onSubmit(values);
    },
    (errors) => {
      console.error("Form validation errors:", errors);
    }
  );

  const targetingCount =
    (watchAppliesTo?.length || 0) +
    (watchExcludeCategories?.length || 0) +
    (watchMenuItems?.length || 0) +
    (watchExcludeAlcohol ? 1 : 0);

  const scopeLabel =
    watchScope === "dine_in"
      ? "Dine-in only"
      : watchScope === "takeout"
      ? "Takeout only"
      : "Dine-in & Takeout";

  return (
    <Form {...form}>
      <form onSubmit={handleSubmit} className="space-y-6 w-full min-w-0">
        <div className="grid gap-6 lg:grid-cols-3 min-w-0">
          {/* ── Main column ── */}
          <div className="space-y-6 lg:col-span-2">

            {/* ── Section 1: Discount details ── */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-base">Discount details</CardTitle>
                <CardDescription>Name, type, and value.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Name */}
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name <span className="text-destructive">*</span></FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Happy Hour 10%" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Discount type toggle */}
                <FormField
                  control={form.control}
                  name="discount_type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Discount type <span className="text-destructive">*</span></FormLabel>
                      <FormControl>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <button
                            type="button"
                            onClick={() => field.onChange("percentage")}
                            className={cn(
                              "flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-3 text-sm font-medium transition-colors",
                              field.value === "percentage"
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground"
                            )}
                          >
                            <Percent className="h-4 w-4" />
                            Percentage
                          </button>
                          <button
                            type="button"
                            onClick={() => field.onChange("fixed_amount")}
                            className={cn(
                              "flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-3 text-sm font-medium transition-colors",
                              field.value === "fixed_amount"
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground"
                            )}
                          >
                            <DollarSign className="h-4 w-4" />
                            Fixed amount
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Value */}
                <FormField
                  control={form.control}
                  name="discount_value"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Value <span className="text-destructive">*</span></FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground text-sm">
                            {watchType === "percentage" ? "%" : "$"}
                          </span>
                          <Input
                            type="number"
                            step="0.01"
                            min={0}
                            className="pl-8"
                            {...field}
                            value={field.value}
                            onChange={(e) =>
                              field.onChange(Number(e.target.value))
                            }
                            placeholder={watchType === "percentage" ? "10" : "5.00"}
                          />
                        </div>
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
                      <FormLabel>Description <span className="text-muted-foreground font-normal text-xs">(optional)</span></FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Staff-facing notes about this discount…"
                          rows={2}
                          {...field}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Location scope — hidden for single-location accounts
                    (silently defaults to global; location_id stays null). */}
                {!isSingleLocation && (
                <FormField
                  control={form.control}
                  name="location_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                        Location scope
                      </FormLabel>
                      <Select
                        value={field.value ?? "__global__"}
                        onValueChange={(val) =>
                          field.onChange(val === "__global__" ? null : val)
                        }
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select scope" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="__global__">
                            Global — all locations
                          </SelectItem>
                          {locations.map((loc) => (
                            <SelectItem key={loc.id} value={loc.id}>
                              {loc.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Global discounts apply to every location. Location-scoped discounts are only available at the selected location.
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                )}
              </CardContent>
            </Card>

            {/* ── Section 2: Usage limits ── */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-base">Usage limits</CardTitle>
                <CardDescription>Control when and how often this discount can be applied.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="min_purchase_amount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Min. purchase amount</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground text-sm">$</span>
                            <Input
                              type="number"
                              step="0.01"
                              min={0}
                              className="pl-8"
                              placeholder="0.00"
                              value={field.value ?? ""}
                              onChange={(e) =>
                                field.onChange(
                                  e.target.value ? Number(e.target.value) : undefined
                                )
                              }
                            />
                          </div>
                        </FormControl>
                        <p className="text-xs text-muted-foreground">Leave blank for no minimum.</p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {watchType === "percentage" && (
                    <FormField
                      control={form.control}
                      name="max_discount_amount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Max. discount cap</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground text-sm">$</span>
                              <Input
                                type="number"
                                step="0.01"
                                min={0}
                                className="pl-8"
                                placeholder="No cap"
                                value={field.value ?? ""}
                                onChange={(e) =>
                                  field.onChange(
                                    e.target.value ? Number(e.target.value) : undefined
                                  )
                                }
                              />
                            </div>
                          </FormControl>
                          <p className="text-xs text-muted-foreground">Maximum $ off regardless of percentage.</p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  <FormField
                    control={form.control}
                    name="max_uses_per_day"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Max uses per day</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            placeholder="Unlimited"
                            value={field.value ?? ""}
                            onChange={(e) =>
                              field.onChange(
                                e.target.value ? Number(e.target.value) : undefined
                              )
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="max_uses_per_order"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Max uses per order</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            value={field.value}
                            onChange={(e) =>
                              field.onChange(Number(e.target.value))
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <Separator />

                <FormField
                  control={form.control}
                  name="stackable"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between gap-4">
                      <div>
                        <FormLabel className="flex items-center gap-1.5">
                          <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                          Stackable
                        </FormLabel>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Allow this discount to be combined with others on the same order.
                        </p>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* ── Section 3: Schedule (collapsible) ── */}
            <Card>
              <button
                type="button"
                onClick={() => setScheduleOpen((v) => !v)}
                className="flex w-full items-center justify-between px-6 py-4 text-left"
              >
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Schedule</p>
                    <p className="text-xs text-muted-foreground">Date range, days, and hours — optional</p>
                  </div>
                </div>
                {scheduleOpen ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </button>

              {scheduleOpen && (
                <>
                  <Separator />
                  <CardContent className="pt-5 space-y-0">

                    {/* ── Date range ── */}
                    <div className="space-y-3 pb-5">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Date range</p>
                        {(form.watch("start_date") || form.watch("end_date")) && (
                          <button
                            type="button"
                            onClick={() => {
                              form.setValue("start_date", undefined);
                              form.setValue("end_date", undefined);
                            }}
                            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <X className="h-3 w-3" />
                            Clear
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <FormField
                          control={form.control}
                          name="start_date"
                          render={({ field }) => (
                            <FormItem className="flex-1 space-y-1">
                              <FormLabel className="text-xs text-muted-foreground font-normal">From</FormLabel>
                              <FormControl>
                                <Input
                                  type="date"
                                  className="text-sm"
                                  value={field.value ? format(field.value, "yyyy-MM-dd") : ""}
                                  onChange={(e) =>
                                    field.onChange(
                                      e.target.value ? new Date(e.target.value) : undefined
                                    )
                                  }
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <ArrowRight className="mt-5 h-4 w-4 shrink-0 text-muted-foreground" />
                        <FormField
                          control={form.control}
                          name="end_date"
                          render={({ field }) => (
                            <FormItem className="flex-1 space-y-1">
                              <FormLabel className="text-xs text-muted-foreground font-normal">To</FormLabel>
                              <FormControl>
                                <Input
                                  type="date"
                                  className="text-sm"
                                  value={field.value ? format(field.value, "yyyy-MM-dd") : ""}
                                  onChange={(e) =>
                                    field.onChange(
                                      e.target.value ? new Date(e.target.value) : undefined
                                    )
                                  }
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      {form.watch("start_date") && form.watch("end_date") && (
                        <p className="text-xs text-muted-foreground">
                          Active from{" "}
                          <span className="font-medium text-foreground">
                            {format(form.watch("start_date")!, "MMM d, yyyy")}
                          </span>{" "}
                          to{" "}
                          <span className="font-medium text-foreground">
                            {format(form.watch("end_date")!, "MMM d, yyyy")}
                          </span>.
                        </p>
                      )}
                    </div>

                    <Separator />

                    {/* ── Active days ── */}
                    <div className="space-y-3 py-5">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Active days</p>
                      <FormField
                        control={form.control}
                        name="applicable_days"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <DaySelector value={field.value} onChange={field.onChange} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <Separator />

                    {/* ── Time window ── */}
                    <div className="space-y-3 pt-5">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Time window</p>
                      <FormField
                        control={form.control}
                        name="applicable_hours_start"
                        render={() => (
                          <FormItem>
                            <FormControl>
                              <TimeWindowPicker
                                start={form.watch("applicable_hours_start")}
                                end={form.watch("applicable_hours_end")}
                                onChange={(start, end) => {
                                  form.setValue("applicable_hours_start", start);
                                  form.setValue("applicable_hours_end", end);
                                }}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                  </CardContent>
                </>
              )}
            </Card>
          </div>

          {/* ── Sidebar column ── */}
          <div className="space-y-4">

            {/* Status card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="is_active"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between gap-4">
                      <div>
                        <FormLabel>Active on POS</FormLabel>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Staff can apply this discount.
                        </p>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <Separator />

                <FormField
                  control={form.control}
                  name="requires_manager_approval"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between gap-4">
                      <div>
                        <FormLabel className="flex items-center gap-1.5">
                          <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
                          Manager approval
                        </FormLabel>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Requires manager PIN on POS.
                        </p>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <Separator />

                <FormField
                  control={form.control}
                  name="display_order"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Display order</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          value={field.value}
                          onChange={(e) =>
                            field.onChange(Number(e.target.value))
                          }
                        />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">
                        Lower numbers appear first on POS.
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Targeting card */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Targeting</CardTitle>
                    <CardDescription className="mt-0.5 text-xs">
                      Items, categories & order type
                    </CardDescription>
                  </div>
                  {targetingCount > 0 && (
                    <Badge variant="secondary">{targetingCount} rule{targetingCount !== 1 ? "s" : ""}</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-md bg-muted/50 divide-y divide-border text-sm">
                  {[
                    { label: "Order type", value: scopeLabel },
                    { label: "Include cats", value: watchAppliesTo?.length ? `${watchAppliesTo.length} selected` : "All" },
                    { label: "Exclude cats", value: watchExcludeCategories?.length ? `${watchExcludeCategories.length} selected` : "None" },
                    { label: "Menu items", value: watchMenuItems?.length ? `${watchMenuItems.length} selected` : "All" },
                    { label: "Excl. alcohol", value: watchExcludeAlcohol ? "Yes" : "No" },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-center justify-between gap-2 px-3 py-2">
                      <span className="text-muted-foreground shrink-0">{label}</span>
                      <span className="font-medium truncate text-right">{value}</span>
                    </div>
                  ))}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full gap-2"
                  onClick={() => setTargetingSheetOpen(true)}
                >
                  <Settings2 className="h-4 w-4" />
                  Configure targeting
                </Button>
              </CardContent>
            </Card>

            {/* Actions — sticky on desktop */}
            <div className="space-y-2 lg:sticky lg:top-4">
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "Saving…" : submitLabel}
              </Button>
              {onCancel && (
                <Button
                  variant="ghost"
                  type="button"
                  className="w-full"
                  onClick={onCancel}
                >
                  Cancel
                </Button>
              )}
            </div>
          </div>
        </div>
      </form>

      <TargetingSheet
        open={targetingSheetOpen}
        onOpenChange={setTargetingSheetOpen}
        categories={categories}
        menuItems={menuItems}
        values={{
          scope: form.watch("scope"),
          applies_to_categories: form.watch("applies_to_categories"),
          exclude_categories: form.watch("exclude_categories"),
          exclude_alcohol: form.watch("exclude_alcohol"),
          menu_item_ids: form.watch("menu_item_ids"),
        }}
        onChange={(updates) => {
          Object.entries(updates).forEach(([key, value]) => {
            form.setValue(key as any, value as any);
          });
        }}
      />
    </Form>
  );
}
