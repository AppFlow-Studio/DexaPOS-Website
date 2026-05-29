"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Info, Loader2, MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { useClerkOrgId } from "@/app/dashboard/hooks/useLocationScoped";
import {
  useIsAllLocations,
  useSelectedLocation,
} from "@/stores/location-store";
import {
  useServiceChargeRules,
  useUpsertServiceChargeRule,
} from "@/app/dashboard/hooks/useServiceCharge";
import type { ServiceChargeRule } from "@/app/dashboard/actions/service-charge";

const formSchema = z.object({
  name: z.string().min(1, "Name is required").max(60),
  rate_percent: z
    .number({ invalid_type_error: "Rate is required" })
    .min(0, "Must be 0 or greater")
    .max(100, "Must be 100 or less"),
  min_party_size: z
    .number({ invalid_type_error: "Party size is required" })
    .int("Whole numbers only")
    .min(1, "Must be at least 1"),
  applies_on: z.enum(["pre_discount", "post_discount"]),
  auto_apply: z.boolean(),
  is_active: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

const DEFAULTS: FormValues = {
  name: "Service Charge",
  rate_percent: 18,
  min_party_size: 6,
  applies_on: "pre_discount",
  auto_apply: true,
  is_active: true,
};

// Wraps Input with a string-backed display state so the user can backspace
// the last digit cleanly. `type="number"` with a controlled numeric value
// makes the empty state oscillate and traps the final character; we drive
// the input as text and only sync the parsed number back to the form.
type NumberFieldProps = {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  onBlur?: () => void;
  name?: string;
  inputRef?: React.Ref<HTMLInputElement>;
  integer?: boolean;
  min?: number;
  max?: number;
  placeholder?: string;
  className?: string;
  inputMode?: "decimal" | "numeric";
};

function NumberField({
  value,
  onChange,
  onBlur,
  name,
  inputRef,
  integer = false,
  placeholder,
  className,
  inputMode,
}: NumberFieldProps) {
  const [text, setText] = useState(value === undefined ? "" : String(value));
  const lastEmitted = useRef<number | undefined>(value);

  useEffect(() => {
    if (value === lastEmitted.current) return;
    setText(value === undefined ? "" : String(value));
    lastEmitted.current = value;
  }, [value]);

  const allowed = integer ? /^\d*$/ : /^\d*\.?\d*$/;

  return (
    <Input
      type="text"
      inputMode={inputMode ?? (integer ? "numeric" : "decimal")}
      value={text}
      onChange={(e) => {
        const raw = e.target.value;
        if (!allowed.test(raw)) return;
        setText(raw);
        if (raw === "" || raw === ".") {
          lastEmitted.current = undefined;
          onChange(undefined);
          return;
        }
        const parsed = integer ? parseInt(raw, 10) : parseFloat(raw);
        const next = Number.isNaN(parsed) ? undefined : parsed;
        lastEmitted.current = next;
        onChange(next);
      }}
      onBlur={onBlur}
      name={name}
      ref={inputRef}
      placeholder={placeholder}
      className={className}
    />
  );
}

function ruleToFormValues(rule: ServiceChargeRule | null): FormValues {
  if (!rule) return DEFAULTS;
  return {
    name: rule.name,
    rate_percent: Number(rule.rate_percent),
    min_party_size: rule.min_party_size,
    applies_on: rule.applies_on ?? "pre_discount",
    auto_apply: rule.auto_apply,
    is_active: rule.is_active,
  };
}

export default function ServiceChargePage() {
  const clerkOrgId = useClerkOrgId();
  const isAllLocations = useIsAllLocations();
  const selectedLocation = useSelectedLocation();
  const scopeLocationId = isAllLocations ? null : selectedLocation?.id ?? null;

  const { data: rules = [], isLoading } = useServiceChargeRules(clerkOrgId);
  const upsert = useUpsertServiceChargeRule();

  const globalRule = useMemo(
    () => rules.find((r) => r.location_id === null && r.is_active) ?? null,
    [rules],
  );
  const locationRule = useMemo(
    () =>
      scopeLocationId
        ? rules.find(
            (r) => r.location_id === scopeLocationId && r.is_active,
          ) ?? null
        : null,
    [rules, scopeLocationId],
  );

  const targetRule = scopeLocationId
    ? locationRule ?? globalRule
    : globalRule;
  const isInheriting = !!scopeLocationId && !locationRule;
  const [overrideMode, setOverrideMode] = useState(false);

  useEffect(() => {
    setOverrideMode(false);
  }, [scopeLocationId]);

  const showForm = !isInheriting || overrideMode;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: DEFAULTS,
    mode: "onBlur",
  });

  useEffect(() => {
    if (!showForm) return;
    const seed = isInheriting && overrideMode
      ? ruleToFormValues(globalRule)
      : ruleToFormValues(targetRule);
    form.reset(seed);
  }, [showForm, isInheriting, overrideMode, globalRule, targetRule, form]);

  const editingRuleId = scopeLocationId
    ? locationRule?.id
    : globalRule?.id;

  const onSubmit = form.handleSubmit(async (values) => {
    if (!clerkOrgId) return;
    await upsert.mutateAsync({
      clerkOrgId,
      input: {
        id: editingRuleId,
        location_id: scopeLocationId,
        name: values.name,
        rate_percent: values.rate_percent,
        min_party_size: values.min_party_size,
        applies_to_order_types: ["dine_in"],
        applies_on: values.applies_on,
        auto_apply: values.auto_apply,
        is_active: values.is_active,
      },
    });
    setOverrideMode(false);
  });

  const scopeLabel = scopeLocationId
    ? selectedLocation?.name ?? "Location"
    : "Global — all locations";

  const toggleableRule = scopeLocationId ? locationRule : globalRule;
  const canQuickToggle = !!toggleableRule && !!clerkOrgId;

  const handleQuickToggle = async () => {
    if (!clerkOrgId || !toggleableRule) return;
    await upsert.mutateAsync({
      clerkOrgId,
      input: {
        id: toggleableRule.id,
        location_id: toggleableRule.location_id,
        name: toggleableRule.name,
        rate_percent: Number(toggleableRule.rate_percent),
        min_party_size: toggleableRule.min_party_size,
        applies_to_order_types: toggleableRule.applies_to_order_types,
        applies_on: toggleableRule.applies_on ?? "pre_discount",
        auto_apply: toggleableRule.auto_apply,
        is_active: !toggleableRule.is_active,
      },
    });
  };

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-3xl">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Service Charge
          </h1>
          <p className="text-sm text-muted-foreground">
            Automatic gratuity for dine-in parties. Configure the label, rate,
            and minimum party size that triggers it on the POS.
          </p>
        </div>
        {canQuickToggle && (
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                toggleableRule?.is_active
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {toggleableRule?.is_active ? "Active" : "Inactive"}
            </span>
            <Button
              type="button"
              variant={toggleableRule?.is_active ? "outline" : "default"}
              onClick={handleQuickToggle}
              disabled={upsert.isPending}
            >
              {upsert.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {toggleableRule?.is_active
                ? "Disable rule"
                : "Enable rule"}
            </Button>
          </div>
        )}
      </header>

      {isAllLocations && (
        <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground flex items-start gap-2">
          <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            Editing the <strong>global rule</strong>. Switch to a specific
            location in the header to add a location-specific override.
          </span>
        </div>
      )}

      {isLoading ? (
        <Card>
          <CardContent className="py-10 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ) : (
        <>
          {isInheriting && !overrideMode && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {selectedLocation?.name ?? "This location"} — inheriting
                  from Global
                </CardTitle>
                <CardDescription>
                  {globalRule
                    ? `Currently using "${globalRule.name}" at ${Number(
                        globalRule.rate_percent,
                      ).toFixed(2)}% for parties of ${
                        globalRule.min_party_size
                      } or more.`
                    : "No global rule is set yet. Switch to All locations to create one, or add a location override below."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOverrideMode(true)}
                >
                  Add location override
                </Button>
              </CardContent>
            </Card>
          )}

          {showForm && (
            <Form {...form}>
              <form onSubmit={onSubmit} className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      Service Charge Rule — {scopeLabel}
                    </CardTitle>
                    <CardDescription>
                      Applied automatically on dine-in checks when the party
                      meets the minimum size.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Label{" "}
                            <span className="text-destructive">*</span>
                          </FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="Service Charge"
                              maxLength={60}
                            />
                          </FormControl>
                          <FormDescription>
                            Shown on the POS check, customer-facing display,
                            and receipt.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <FormField
                        control={form.control}
                        name="rate_percent"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              Rate{" "}
                              <span className="text-destructive">*</span>
                            </FormLabel>
                            <FormControl>
                              <div className="relative">
                                <NumberField
                                  value={field.value}
                                  onChange={field.onChange}
                                  onBlur={field.onBlur}
                                  name={field.name}
                                  inputRef={field.ref}
                                  className="pr-8"
                                  placeholder="18.00"
                                />
                                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground text-sm">
                                  %
                                </span>
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="min_party_size"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              Minimum party size{" "}
                              <span className="text-destructive">*</span>
                            </FormLabel>
                            <FormControl>
                              <NumberField
                                value={field.value}
                                onChange={field.onChange}
                                onBlur={field.onBlur}
                                name={field.name}
                                inputRef={field.ref}
                                integer
                                placeholder="6"
                              />
                            </FormControl>
                            <FormDescription>
                              Applies when seated party is this size or larger.
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                      Applies to: <strong>Dine-in</strong> only in v1.
                    </div>

                    <FormField
                      control={form.control}
                      name="applies_on"
                      render={({ field }) => (
                        <FormItem className="space-y-2">
                          <FormLabel>Calculation base</FormLabel>
                          <FormDescription>
                            Which subtotal the charge is computed on. Toast
                            and Square default to pre-discount.
                          </FormDescription>
                          <FormControl>
                            <RadioGroup
                              value={field.value}
                              onValueChange={field.onChange}
                              className="grid gap-2 sm:grid-cols-2"
                            >
                              <Label
                                htmlFor="applies_on_pre"
                                className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/40 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
                              >
                                <RadioGroupItem
                                  id="applies_on_pre"
                                  value="pre_discount"
                                  className="mt-0.5"
                                />
                                <span className="space-y-1">
                                  <span className="block font-medium">
                                    Pre-discount{" "}
                                    <span className="text-muted-foreground font-normal">
                                      (default)
                                    </span>
                                  </span>
                                  <span className="block text-xs text-muted-foreground">
                                    Compute on subtotal before item-level
                                    discounts. Matches Toast / Square.
                                  </span>
                                </span>
                              </Label>
                              <Label
                                htmlFor="applies_on_post"
                                className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/40 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
                              >
                                <RadioGroupItem
                                  id="applies_on_post"
                                  value="post_discount"
                                  className="mt-0.5"
                                />
                                <span className="space-y-1">
                                  <span className="block font-medium">
                                    Post-discount
                                  </span>
                                  <span className="block text-xs text-muted-foreground">
                                    Compute after discounts are applied —
                                    smaller charge when discounts are in play.
                                  </span>
                                </span>
                              </Label>
                            </RadioGroup>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Behavior</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <FormField
                      control={form.control}
                      name="auto_apply"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between gap-4">
                          <div className="space-y-0.5">
                            <FormLabel>Auto-apply on POS</FormLabel>
                            <FormDescription>
                              Adds the charge automatically when the party
                              hits the threshold. Staff can still remove it.
                            </FormDescription>
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
                      name="is_active"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between gap-4">
                          <div className="space-y-0.5">
                            <FormLabel>Active</FormLabel>
                            <FormDescription>
                              Turn off to stop applying this rule without
                              deleting it.
                            </FormDescription>
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

                    <FormItem className="flex items-center justify-between gap-4 opacity-70">
                      <div className="space-y-0.5">
                        <FormLabel className="flex items-center gap-1.5">
                          Taxable
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent>
                              Service charges are non-taxable in v1. Tax
                              treatment will be configurable in a later
                              release.
                            </TooltipContent>
                          </Tooltip>
                        </FormLabel>
                        <FormDescription>
                          Locked off — computed on subtotal, after tax.
                        </FormDescription>
                      </div>
                      <Switch checked={false} disabled />
                    </FormItem>
                  </CardContent>
                </Card>

                <div className="flex items-center justify-end gap-2">
                  {isInheriting && overrideMode && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setOverrideMode(false)}
                      disabled={upsert.isPending}
                    >
                      Cancel
                    </Button>
                  )}
                  <Button type="submit" disabled={upsert.isPending}>
                    {upsert.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Save changes
                  </Button>
                </div>
              </form>
            </Form>
          )}
        </>
      )}
    </div>
  );
}
