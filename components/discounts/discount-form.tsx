"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import {
  discountFormSchema,
  DiscountFormValues,
} from "@/lib/validations/discount";
import { defaultApplicableDays } from "@/types/discount";
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
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Panel, PanelSection } from "@/components/dashboard/shell";
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
  X,
  MapPin,
  ShieldCheck,
  Tag,
  SlidersHorizontal,
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

/** DS-CTL-01 — the canonical pill control. */
const PILL_CONTROL = "h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm";

/** A quiet caption above a group inside a section. */
const GROUP_LABEL = "text-sm text-muted-foreground";

/** Hint text under a field. */
const FIELD_HINT = "text-[0.8125rem] text-muted-foreground";

function toDate(value?: Date | string | null) {
  if (!value) return undefined;
  return value instanceof Date ? value : new Date(value);
}

/**
 * A pill-shaped date field.
 *
 * `<input type="date">` renders the browser's own calendar, which is a square
 * OS panel we cannot style — so the popup ignored the design system entirely.
 * This mirrors the hardened `DatePopover` from the tips page: `w-auto` beats
 * the primitive's fixed `w-72` (which clipped the trailing columns) and
 * `collisionPadding` keeps the panel off the viewport edge.
 */
function DateField({
  value,
  onChange,
  placeholder = "Pick a date",
}: {
  /** The schema allows `null` for a cleared date, so accept it alongside `undefined`. */
  value?: Date | null;
  onChange: (date: Date | undefined) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ?? undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "h-9 w-full min-w-0 justify-start rounded-full border-0 bg-muted/60 px-4 text-[0.8125rem] font-normal shadow-none hover:bg-muted",
            !selected && "text-muted-foreground"
          )}
        >
          <CalendarDays className="mr-2 h-4 w-4 shrink-0 text-muted-foreground/70" />
          <span className="truncate tabular-nums">
            {selected ? format(selected, "MMM d, yyyy") : placeholder}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl p-0"
        align="start"
        collisionPadding={16}
        avoidCollisions
      >
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(date) => {
            onChange(date);
            setOpen(false);
          }}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
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
  const watchStartDate = form.watch("start_date");
  const watchEndDate = form.watch("end_date");

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

  const scheduleSummary = (() => {
    if (watchStartDate && watchEndDate)
      return `${format(watchStartDate, "MMM d")} – ${format(watchEndDate, "MMM d, yyyy")}`;
    if (watchStartDate) return `From ${format(watchStartDate, "MMM d, yyyy")}`;
    if (watchEndDate) return `Until ${format(watchEndDate, "MMM d, yyyy")}`;
    return "Always running — date range, days, and hours are optional";
  })();

  return (
    <Form {...form}>
      <form onSubmit={handleSubmit} className="w-full min-w-0 space-y-6">
        <div className="grid min-w-0 gap-6 lg:grid-cols-3">
          {/* ── Main column ── */}
          <div className="min-w-0 space-y-6 lg:col-span-2">

            {/* ── Section 1: Discount details ── */}
            <Panel>
              <PanelSection
                icon={Tag}
                label="Discount details"
                caption="Name, type, and value."
              >
                <div className="space-y-5">
                  {/* Name */}
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Name <span className="text-destructive">*</span>
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g. Happy Hour 10%"
                            className="h-9 rounded-full border-0 bg-muted/60 px-4 text-[0.8125rem] shadow-none focus-visible:bg-background"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Discount type — a segmented pill rail (DS-CTL-05). */}
                  <FormField
                    control={form.control}
                    name="discount_type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Discount type <span className="text-destructive">*</span>
                        </FormLabel>
                        <FormControl>
                          <div className="inline-flex h-auto w-full max-w-sm flex-nowrap gap-0.5 rounded-full bg-muted/70 p-1">
                            {[
                              { value: "percentage", label: "Percentage", Icon: Percent },
                              { value: "fixed_amount", label: "Fixed amount", Icon: DollarSign },
                            ].map(({ value, label, Icon }) => (
                              <button
                                key={value}
                                type="button"
                                onClick={() => field.onChange(value)}
                                className={cn(
                                  "flex flex-1 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-medium transition-colors",
                                  field.value === value
                                    ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                                    : "text-muted-foreground hover:text-foreground"
                                )}
                              >
                                <Icon className="h-4 w-4" />
                                {label}
                              </button>
                            ))}
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
                        <FormLabel>
                          Value <span className="text-destructive">*</span>
                        </FormLabel>
                        <FormControl>
                          <div className="relative max-w-[220px]">
                            <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-[0.8125rem] text-muted-foreground/70">
                              {watchType === "percentage" ? "%" : "$"}
                            </span>
                            <Input
                              type="number"
                              step="0.01"
                              min={0}
                              className="h-9 rounded-full border-0 bg-muted/60 pl-9 pr-4 text-[0.8125rem] tabular-nums shadow-none focus-visible:bg-background"
                              {...field}
                              value={field.value}
                              onChange={(e) => field.onChange(Number(e.target.value))}
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
                        <FormLabel>
                          Description{" "}
                          <span className="text-xs font-normal text-muted-foreground">
                            (optional)
                          </span>
                        </FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Staff-facing notes about this discount…"
                            rows={2}
                            className="rounded-2xl border-0 bg-muted/60 px-4 py-3 text-[0.8125rem] shadow-none focus-visible:bg-background"
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
                              <SelectTrigger className="h-9 w-full max-w-sm rounded-full border-0 bg-muted/60 px-4 text-[0.8125rem] shadow-none">
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
                          <p className={FIELD_HINT}>
                            Global discounts apply to every location.
                            Location-scoped discounts are only available at the
                            selected location.
                          </p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>
              </PanelSection>
            </Panel>

            {/* ── Section 2: Usage limits ── */}
            <Panel>
              <PanelSection
                icon={SlidersHorizontal}
                label="Usage limits"
                caption="Control when and how often this discount can be applied."
              >
                <div className="space-y-6">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="min_purchase_amount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Min. purchase amount</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-[0.8125rem] text-muted-foreground/70">
                                $
                              </span>
                              <Input
                                type="number"
                                step="0.01"
                                min={0}
                                className="h-9 rounded-full border-0 bg-muted/60 pl-9 pr-4 text-[0.8125rem] tabular-nums shadow-none focus-visible:bg-background"
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
                          <p className={FIELD_HINT}>Leave blank for no minimum.</p>
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
                                <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-[0.8125rem] text-muted-foreground/70">
                                  $
                                </span>
                                <Input
                                  type="number"
                                  step="0.01"
                                  min={0}
                                  className="h-9 rounded-full border-0 bg-muted/60 pl-9 pr-4 text-[0.8125rem] tabular-nums shadow-none focus-visible:bg-background"
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
                            <p className={FIELD_HINT}>
                              Maximum $ off regardless of percentage.
                            </p>
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
                              className="h-9 rounded-full border-0 bg-muted/60 px-4 text-[0.8125rem] tabular-nums shadow-none focus-visible:bg-background"
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
                              className="h-9 rounded-full border-0 bg-muted/60 px-4 text-[0.8125rem] tabular-nums shadow-none focus-visible:bg-background"
                              value={field.value}
                              onChange={(e) => field.onChange(Number(e.target.value))}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="stackable"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <FormLabel className="flex items-center gap-1.5">
                            Stackable
                          </FormLabel>
                          <p className={cn(FIELD_HINT, "mt-0.5")}>
                            Allow this discount to be combined with others on the
                            same order.
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
                </div>
              </PanelSection>
            </Panel>

            {/* ── Section 3: Schedule (collapsible) ── */}
            <Panel>
              <button
                type="button"
                onClick={() => setScheduleOpen((v) => !v)}
                aria-expanded={scheduleOpen}
                className="flex w-full items-center justify-between gap-4 px-6 py-6 text-left"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[1.0625rem] font-semibold text-[#0C4FD1] dark:text-[#6CA0FF]">
                    <CalendarDays className="h-[1.125rem] w-[1.125rem] shrink-0" />
                    <span className="min-w-0">Schedule</span>
                  </div>
                  <p className="mt-1 truncate text-sm text-muted-foreground">
                    {scheduleSummary}
                  </p>
                </div>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                    scheduleOpen && "rotate-180"
                  )}
                />
              </button>

              {scheduleOpen && (
                <div className="px-6 pb-6">
                  {/* ── Date range ── */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className={GROUP_LABEL}>Date range</p>
                      {(watchStartDate || watchEndDate) && (
                        <button
                          type="button"
                          onClick={() => {
                            form.setValue("start_date", undefined, { shouldDirty: true });
                            form.setValue("end_date", undefined, { shouldDirty: true });
                          }}
                          className="flex items-center gap-1 text-[0.8125rem] text-muted-foreground transition-colors hover:text-foreground"
                        >
                          <X className="h-3 w-3" />
                          Clear
                        </button>
                      )}
                    </div>
                    <div className="flex items-end gap-2">
                      <FormField
                        control={form.control}
                        name="start_date"
                        render={({ field }) => (
                          <FormItem className="min-w-0 flex-1 space-y-1">
                            <FormLabel className="text-[0.8125rem] font-normal text-muted-foreground">
                              From
                            </FormLabel>
                            <FormControl>
                              <DateField
                                value={field.value}
                                onChange={field.onChange}
                                placeholder="Start date"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <ArrowRight className="mb-2.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <FormField
                        control={form.control}
                        name="end_date"
                        render={({ field }) => (
                          <FormItem className="min-w-0 flex-1 space-y-1">
                            <FormLabel className="text-[0.8125rem] font-normal text-muted-foreground">
                              To
                            </FormLabel>
                            <FormControl>
                              <DateField
                                value={field.value}
                                onChange={field.onChange}
                                placeholder="End date"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    {watchStartDate && watchEndDate && (
                      <p className={FIELD_HINT}>
                        Active from{" "}
                        <span className="font-medium text-foreground tabular-nums">
                          {format(watchStartDate, "MMM d, yyyy")}
                        </span>{" "}
                        to{" "}
                        <span className="font-medium text-foreground tabular-nums">
                          {format(watchEndDate, "MMM d, yyyy")}
                        </span>
                        .
                      </p>
                    )}
                  </div>

                  {/* ── Active days ── */}
                  <div className="mt-8 space-y-3">
                    <p className={GROUP_LABEL}>Active days</p>
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

                  {/* ── Time window ── */}
                  <div className="mt-8 space-y-3">
                    <p className={GROUP_LABEL}>Time window</p>
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
                                form.setValue("applicable_hours_start", start, {
                                  shouldDirty: true,
                                });
                                form.setValue("applicable_hours_end", end, {
                                  shouldDirty: true,
                                });
                              }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              )}
            </Panel>
          </div>

          {/* ── Sidebar column ── */}
          <div className="min-w-0 space-y-6">

            {/* Status */}
            <Panel nested>
              <PanelSection icon={ShieldCheck} label="Status">
                <div className="space-y-5">
                  <FormField
                    control={form.control}
                    name="is_active"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <FormLabel>Active on POS</FormLabel>
                          <p className={cn(FIELD_HINT, "mt-0.5")}>
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

                  <FormField
                    control={form.control}
                    name="requires_manager_approval"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <FormLabel>Manager approval</FormLabel>
                          <p className={cn(FIELD_HINT, "mt-0.5")}>
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
                            className="h-9 max-w-[120px] rounded-full border-0 bg-muted/60 px-4 text-[0.8125rem] tabular-nums shadow-none focus-visible:bg-background"
                            value={field.value}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                          />
                        </FormControl>
                        <p className={FIELD_HINT}>
                          Lower numbers appear first on POS.
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </PanelSection>
            </Panel>

            {/* Targeting */}
            <Panel nested>
              <PanelSection
                icon={Settings2}
                label="Targeting"
                caption="Items, categories & order type"
                action={
                  targetingCount > 0 ? (
                    <span className="inline-flex shrink-0 items-center rounded-full bg-muted/60 px-2.5 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
                      {targetingCount} rule{targetingCount !== 1 ? "s" : ""}
                    </span>
                  ) : undefined
                }
              >
                <div className="space-y-4">
                  <div className="min-w-0">
                    {[
                      { label: "Order type", value: scopeLabel },
                      {
                        label: "Include categories",
                        value: watchAppliesTo?.length
                          ? `${watchAppliesTo.length} selected`
                          : "All",
                      },
                      {
                        label: "Exclude categories",
                        value: watchExcludeCategories?.length
                          ? `${watchExcludeCategories.length} selected`
                          : "None",
                      },
                      {
                        label: "Menu items",
                        value: watchMenuItems?.length
                          ? `${watchMenuItems.length} selected`
                          : "All",
                      },
                      { label: "Exclude alcohol", value: watchExcludeAlcohol ? "Yes" : "No" },
                    ].map(({ label, value }) => (
                      <div
                        key={label}
                        className="flex items-center justify-between gap-3 py-2"
                      >
                        <span className="shrink-0 text-sm text-muted-foreground">
                          {label}
                        </span>
                        <span className="min-w-0 truncate text-right text-sm font-medium tabular-nums">
                          {value}
                        </span>
                      </div>
                    ))}
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    className={cn(PILL_CONTROL, "w-full gap-2")}
                    onClick={() => setTargetingSheetOpen(true)}
                  >
                    <Settings2 className="h-4 w-4" />
                    Configure targeting
                  </Button>
                </div>
              </PanelSection>
            </Panel>

            {/* Actions — sticky on desktop */}
            <div className="space-y-2 lg:sticky lg:top-4">
              <Button
                type="submit"
                className="h-9 w-full rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
                disabled={submitting}
              >
                {submitting ? "Saving…" : submitLabel}
              </Button>
              {onCancel && (
                <Button
                  variant="ghost"
                  type="button"
                  className="h-9 w-full rounded-full px-4 text-[0.8125rem] font-medium text-muted-foreground hover:text-foreground"
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
            form.setValue(key as any, value as any, { shouldDirty: true });
          });
        }}
      />
    </Form>
  );
}
