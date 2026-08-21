"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, MapPin, Percent, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

import {
  LocationIndicator,
  PageHeader,
  PageShell,
  Panel,
  PanelSection,
  StatRow,
  StatTile,
} from "@/components/dashboard/shell";

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
});

type FormValues = z.infer<typeof formSchema>;

const DEFAULTS: FormValues = {
  name: "Service Charge",
  rate_percent: 18,
  min_party_size: 6,
  applies_on: "pre_discount",
  auto_apply: true,
};

/**
 * The form fields take the same borderless tinted material as the search field
 * (§4.2) rather than a bordered `<Input>`, so a stack of them reads as one
 * surface instead of a ladder of boxes. Taller and less round than the h-9 pill
 * because these are typed into, not tapped.
 */
const FIELD_INPUT =
  "h-10 rounded-xl border-transparent bg-muted/50 shadow-none focus-visible:bg-background";

/** The quiet field label above an input. */
const FIELD_LABEL = "text-[0.9375rem] font-normal text-foreground";

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
      className={cn(FIELD_INPUT, "tabular-nums", className)}
    />
  );
}

/**
 * The on/off state of the rule (D-11): soft tint plus a dot, never a solid
 * saturated fill. Only two states, so the pair is inline rather than pulled
 * from a `lib/constants` module.
 */
function ActiveBadge({ isActive }: { isActive: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        isActive
          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          : "bg-muted text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 shrink-0 rounded-full",
          isActive ? "bg-emerald-500" : "bg-muted-foreground/50",
        )}
      />
      {isActive ? "Active" : "Off"}
    </span>
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
  };
}

export default function ServiceChargePage() {
  const clerkOrgId = useClerkOrgId();
  const isAllLocations = useIsAllLocations();
  const selectedLocation = useSelectedLocation();
  const scopeLocationId = isAllLocations ? null : selectedLocation?.id ?? null;

  const { data: rules = [], isLoading } = useServiceChargeRules(clerkOrgId);
  const upsert = useUpsertServiceChargeRule();

  // One row per scope (enforced by uq_service_charge_scope). `is_active` is a
  // flag on that row — don't filter by it here or toggling off would orphan
  // the row and the next save would insert a duplicate.
  const globalRule = useMemo(
    () => rules.find((r) => r.location_id === null) ?? null,
    [rules],
  );
  const locationRule = useMemo(
    () =>
      scopeLocationId
        ? rules.find((r) => r.location_id === scopeLocationId) ?? null
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
        // Preserve current activation state — the header pill+button owns this toggle.
        is_active: targetRule?.is_active ?? true,
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
    <PageShell width="narrow">
      <PageHeader
        title="Service Charge"
        subtitle="Automatic gratuity for dine-in parties. Configure the label, rate, and minimum party size that triggers it on the POS."
        backHref="/dashboard/tables"
        backLabel="Back to Tables"
        indicator={
          <LocationIndicator
            isAllLocations={isAllLocations}
            locationName={selectedLocation?.name}
          />
        }
        actions={
          canQuickToggle ? (
            <label className="flex select-none items-center gap-2">
              <ActiveBadge isActive={!!toggleableRule?.is_active} />
              <Switch
                checked={!!toggleableRule?.is_active}
                onCheckedChange={handleQuickToggle}
                disabled={upsert.isPending}
              />
            </label>
          ) : undefined
        }
      />

      {isAllLocations && (
        <div className="flex items-start gap-2 rounded-2xl border-0 bg-muted/60 px-4 py-3 text-sm text-muted-foreground shadow-none">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Editing the <strong className="font-medium text-foreground">global rule</strong>. Switch to a
            specific location in the header to add a location-specific override.
          </span>
        </div>
      )}

      {isLoading ? (
        <Panel>
          <div className="flex items-center justify-center px-6 py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        </Panel>
      ) : (
        <>
          {isInheriting && !overrideMode && (
            <Panel>
              <PanelSection
                icon={MapPin}
                label={`${selectedLocation?.name ?? "This location"} — inheriting from Global`}
                caption={
                  globalRule
                    ? "This location has no rule of its own, so the global rule applies."
                    : "No global rule is set yet. Switch to All locations to create one, or add a location override below."
                }
              >
                {globalRule && (
                  <StatRow columns={3} className="mb-6">
                    <StatTile label="Label" value={globalRule.name} />
                    <StatTile
                      label="Rate"
                      value={`${Number(globalRule.rate_percent).toFixed(2)}%`}
                      meta={
                        globalRule.applies_on === "post_discount"
                          ? "Post-discount"
                          : "Pre-discount"
                      }
                    />
                    <StatTile
                      label="Minimum party"
                      value={globalRule.min_party_size}
                      meta="Guests or more"
                    />
                  </StatRow>
                )}

                <Button
                  type="button"
                  variant="outline"
                  className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
                  onClick={() => setOverrideMode(true)}
                >
                  Add location override
                </Button>
              </PanelSection>
            </Panel>
          )}

          {showForm && (
            <Form {...form}>
              <form onSubmit={onSubmit} className="space-y-6">
                <Panel>
                  <PanelSection
                    icon={Percent}
                    label={`Service Charge Rule — ${scopeLabel}`}
                    caption="Applied automatically on dine-in checks when the party meets the minimum size."
                  >
                    <div className="space-y-6">
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem className="space-y-2">
                            <FormLabel className={FIELD_LABEL}>
                              Label <span className="text-destructive">*</span>
                            </FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                placeholder="Service Charge"
                                maxLength={60}
                                className={FIELD_INPUT}
                              />
                            </FormControl>
                            <FormDescription className="text-sm">
                              Shown on the POS check, customer-facing display,
                              and receipt.
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                        <FormField
                          control={form.control}
                          name="rate_percent"
                          render={({ field }) => (
                            <FormItem className="space-y-2">
                              <FormLabel className={FIELD_LABEL}>
                                Rate <span className="text-destructive">*</span>
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
                                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
                                    %
                                  </span>
                                </div>
                              </FormControl>
                              <FormDescription className="text-sm">
                                Percentage of the check subtotal.
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="min_party_size"
                          render={({ field }) => (
                            <FormItem className="space-y-2">
                              <FormLabel className={FIELD_LABEL}>
                                Minimum party size{" "}
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
                                    integer
                                    placeholder="6"
                                    className="pr-10"
                                  />
                                  <Users className="pointer-events-none absolute inset-y-0 right-3 my-auto h-4 w-4 text-muted-foreground/50" />
                                </div>
                              </FormControl>
                              <FormDescription className="text-sm">
                                Applies when seated party is this size or larger.
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={form.control}
                        name="applies_on"
                        render={({ field }) => (
                          <FormItem className="space-y-2">
                            <FormLabel className={FIELD_LABEL}>
                              Calculation base
                            </FormLabel>
                            <Select
                              value={field.value}
                              onValueChange={field.onChange}
                            >
                              <FormControl>
                                <SelectTrigger className={cn(FIELD_INPUT, "w-full")}>
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent className="rounded-2xl">
                                <SelectItem value="pre_discount">
                                  Pre-discount (default)
                                </SelectItem>
                                <SelectItem value="post_discount">
                                  Post-discount
                                </SelectItem>
                              </SelectContent>
                            </Select>
                            <FormDescription className="text-sm">
                              Toast and Square default to pre-discount.
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="border-t border-border/60 pt-6">
                        <FormField
                          control={form.control}
                          name="auto_apply"
                          render={({ field }) => (
                            <FormItem className="flex items-center justify-between gap-4 space-y-0">
                              <div className="min-w-0 space-y-0.5">
                                <FormLabel className={FIELD_LABEL}>
                                  Auto-apply on POS
                                </FormLabel>
                                <FormDescription className="text-sm">
                                  Adds the charge automatically when the party
                                  hits the threshold. Staff can still remove it.
                                </FormDescription>
                              </div>
                              <FormControl>
                                <Switch
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                  className="shrink-0"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>

                      <p className="text-[0.8125rem] text-muted-foreground">
                        Dine-in only · non-taxable · computed on subtotal.
                      </p>
                    </div>
                  </PanelSection>
                </Panel>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  {isInheriting && overrideMode && (
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-9 rounded-full px-4 text-[0.8125rem] font-medium text-muted-foreground"
                      onClick={() => setOverrideMode(false)}
                      disabled={upsert.isPending}
                    >
                      Cancel
                    </Button>
                  )}
                  <Button
                    type="submit"
                    className="h-9 gap-2 rounded-full px-4 text-[0.8125rem] font-medium"
                    disabled={upsert.isPending}
                  >
                    {upsert.isPending && (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    )}
                    Save changes
                  </Button>
                </div>
              </form>
            </Form>
          )}
        </>
      )}
    </PageShell>
  );
}
