"use client";

import { useState } from "react";
import { Plus, MapPin, FlaskConical, ChevronDown, ChevronUp, Percent, Split } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useClerkOrgId } from "@/app/dashboard/hooks/useLocationScoped";
import { useGatedLocation, useGatedLocationId } from "@/stores/location-store";
import {
  useTipPoolConfigs,
  useCreateTipPool,
  useUpdateTipPool,
  useDeleteTipPool,
  useToggleTipPool,
  useTipOutRules,
  useCreateTipOutRule,
  useUpdateTipOutRule,
  useDeleteTipOutRule,
  useToggleTipOutRule,
  useRoles,
  useValidateTipPoolConfig,
} from "./hooks/useTipSettings";
import { toast } from "sonner";
import { TipPoolDialog, type TipPoolFormData } from "./components/TipPoolDialog";
import { TipOutRuleDialog, type TipOutRuleFormData } from "./components/TipOutRuleDialog";
import { PoolCard } from "./components/PoolCard";
import { RuleCard } from "./components/RuleCard";
import type { TipPoolConfigWithShares, TipOutRule, Role } from "@/app/dashboard/actions/tips";
import {
  LocationIndicator,
  PageHeader,
  PageShell,
  Panel,
  PanelSection,
} from "@/components/dashboard/shell";
import { Skeleton } from "@/components/ui/skeleton";
import { getLocalDateKey } from "@/lib/dates/local-date-key";

// ─── Preview Calculator (pure client-side) ─────────────────────────────────

function PreviewPanel({
  pools,
  rules,
  roles,
  timeZone,
}: {
  pools: TipPoolConfigWithShares[];
  rules: TipOutRule[];
  roles: Role[];
  timeZone?: string | null;
}) {
  const [open, setOpen] = useState(false);
  // Per-role: {roleCode -> {chargedTips, cashTips, hours, sales}}
  const [inputs, setInputs] = useState<
    Record<string, { chargedTips: number; cashTips: number; hours: number; sales: number }>
  >({});

  const setInput = (code: string, field: "chargedTips" | "cashTips" | "hours" | "sales", value: number) => {
    setInputs((prev) => {
      const current = prev[code] ?? {
        chargedTips: 0,
        cashTips: 0,
        hours: 0,
        sales: 0,
      };

      return {
        ...prev,
        [code]: { ...current, [field]: value },
      };
    });
  };

  const today = getLocalDateKey(new Date(), timeZone);

  // Filter to active pools — already sorted by priority ASC, created_at ASC from server query
  const activePools = pools.filter(
    (p) =>
      p.is_active &&
      p.effective_date <= today &&
      (!(p as any).end_date || (p as any).end_date >= today)
  );

  const activeRules = rules.filter(
    (r) => r.is_active && r.effective_date <= today && (!r.end_date || r.end_date >= today)
  );

  // Simulate calculation
  const simulation: Record<
    string,
    {
      own: number;
      poolContrib: number;
      poolRecv: number;
      tipOutGiven: number;
      tipOutRecv: number;
      tipOutClipped: number;
      net: number;
    }
  > = {};

  for (const code of Object.keys(inputs)) {
    const emp = inputs[code];
    const totalTips = emp.chargedTips + emp.cashTips;
    simulation[code] = {
      own: totalTips,
      poolContrib: 0,
      poolRecv: 0,
      tipOutGiven: 0,
      tipOutRecv: 0,
      tipOutClipped: 0,
      net: 0,
    };
  }

  // Pool contributions & distribution (priority-ordered)
  for (const pool of activePools) {
    let poolAmount = 0;
    for (const code of pool.contributing_role_codes) {
      const emp = inputs[code];
      if (!emp) continue;

      // Differentiate tip source
      let tipBase: number;
      if (pool.tip_source === "charged_tips") {
        tipBase = emp.chargedTips;
      } else if (pool.tip_source === "cash_only") {
        tipBase = emp.cashTips;
      } else {
        // all_tips
        tipBase = emp.chargedTips + emp.cashTips;
      }

      const contrib = tipBase * (pool.source_percentage / 100);
      if (simulation[code]) simulation[code].poolContrib += contrib;
      poolAmount += contrib;
    }

    for (const share of pool.tip_pool_role_shares) {
      const code = share.role_code;
      if (!simulation[code] || !share.is_eligible) continue;

      if (pool.distribution_method === "percentage" && share.share_percentage != null) {
        simulation[code].poolRecv += poolAmount * (share.share_percentage / 100);
      } else if (pool.distribution_method === "equal_split") {
        const eligibleCount = pool.tip_pool_role_shares.filter(
          (s) => s.is_eligible && simulation[s.role_code]
        ).length;
        if (eligibleCount > 0) simulation[code].poolRecv += poolAmount / eligibleCount;
      } else if (pool.distribution_method === "hours_weighted" && inputs[code]) {
        const totalHours = pool.tip_pool_role_shares
          .filter((s) => s.is_eligible && inputs[s.role_code])
          .reduce((sum, s) => sum + (inputs[s.role_code]?.hours || 0), 0);
        if (totalHours > 0)
          simulation[code].poolRecv += poolAmount * ((inputs[code].hours || 0) / totalHours);
      } else if (
        pool.distribution_method === "points" &&
        share.points_per_hour != null &&
        inputs[code]
      ) {
        const totalPoints = pool.tip_pool_role_shares
          .filter((s) => s.is_eligible && inputs[s.role_code])
          .reduce((sum, s) => sum + (inputs[s.role_code]?.hours || 0) * (s.points_per_hour || 0), 0);
        if (totalPoints > 0) {
          const myPoints = (inputs[code].hours || 0) * share.points_per_hour;
          simulation[code].poolRecv += poolAmount * (myPoints / totalPoints);
        }
      }
    }
  }

  // Tip-out rules with clipping
  for (const rule of activeRules) {
    const giverInput = inputs[rule.from_role_code];
    if (!giverInput || !simulation[rule.from_role_code]) continue;

    let given = 0;
    if (rule.tip_out_type === "percentage_of_tips") {
      given = (giverInput.chargedTips + giverInput.cashTips) * (rule.tip_out_value / 100);
    } else if (rule.tip_out_type === "percentage_of_sales") {
      given = giverInput.sales * (rule.tip_out_value / 100);
    } else {
      given = rule.tip_out_value;
    }

    // Non-negative floor: can't give more than what you have remaining
    const giver = simulation[rule.from_role_code];
    const remaining = giver.own - giver.poolContrib + giver.poolRecv - giver.tipOutGiven;
    const capped = Math.max(0, Math.min(given, remaining));
    const clipped = given - capped;

    giver.tipOutGiven += capped;
    giver.tipOutClipped += clipped;

    if (simulation[rule.to_role_code]) {
      simulation[rule.to_role_code].tipOutRecv += capped;
    }
  }

  // Net calculation
  for (const code of Object.keys(simulation)) {
    const s = simulation[code];
    s.net = s.own - s.poolContrib + s.poolRecv - s.tipOutGiven + s.tipOutRecv;
  }

  const hasClipping = Object.values(simulation).some((s) => s.tipOutClipped > 0);
  const fmt = (n: number) => `$${n.toFixed(2)}`;

  const totalNet = Object.values(simulation).reduce((sum, s) => sum + s.net, 0);

  return (
    <Panel>
      <PanelSection
        icon={FlaskConical}
        label="Preview Calculator"
        caption="Enter hypothetical amounts per role to see how tips would be distributed with your current configuration."
        action={
          <Button
            variant="outline"
            size="sm"
            className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <ChevronUp className="w-4 h-4 mr-1.5" /> : <ChevronDown className="w-4 h-4 mr-1.5" />}
            {open ? "Hide" : "Show"}
          </Button>
        }
      >
        {open &&
          (roles.length === 0 ? (
            <p className="text-sm text-muted-foreground">No roles available.</p>
          ) : (
            <div className="space-y-6">
              {/* Inputs — one inset card per role. A 5-column grid of number
                  fields cannot survive 375px; stacking into labelled cards
                  keeps every field tappable without a horizontal scroller. */}
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {roles.map((role) => (
                  <div
                    key={role.code}
                    className="min-w-0 rounded-2xl border-0 bg-muted/60 p-4 shadow-none"
                  >
                    <p className="mb-3 truncate text-sm font-medium">{role.code}</p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="min-w-0">
                        <Label className="text-[0.8125rem] text-muted-foreground">Charged tips ($)</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          value={inputs[role.code]?.chargedTips || ""}
                          onChange={(e) =>
                            setInput(role.code, "chargedTips", parseFloat(e.target.value) || 0)
                          }
                          className="mt-1.5 h-9 bg-background text-[0.8125rem] tabular-nums"
                        />
                      </div>
                      <div className="min-w-0">
                        <Label className="text-[0.8125rem] text-muted-foreground">Cash tips ($)</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          value={inputs[role.code]?.cashTips || ""}
                          onChange={(e) =>
                            setInput(role.code, "cashTips", parseFloat(e.target.value) || 0)
                          }
                          className="mt-1.5 h-9 bg-background text-[0.8125rem] tabular-nums"
                        />
                      </div>
                      <div className="min-w-0">
                        <Label className="text-[0.8125rem] text-muted-foreground">Hours worked</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.5"
                          placeholder="0"
                          value={inputs[role.code]?.hours || ""}
                          onChange={(e) =>
                            setInput(role.code, "hours", parseFloat(e.target.value) || 0)
                          }
                          className="mt-1.5 h-9 bg-background text-[0.8125rem] tabular-nums"
                        />
                      </div>
                      <div className="min-w-0">
                        <Label className="text-[0.8125rem] text-muted-foreground">Gross sales ($)</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          value={inputs[role.code]?.sales || ""}
                          onChange={(e) =>
                            setInput(role.code, "sales", parseFloat(e.target.value) || 0)
                          }
                          className="mt-1.5 h-9 bg-background text-[0.8125rem] tabular-nums"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {Object.keys(simulation).length > 0 && (
                <div className="min-w-0 border-t border-border/60 pt-6">
                  <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <p className="text-sm text-muted-foreground">Simulated result</p>
                    <p className="text-[1.75rem] font-medium leading-tight tracking-[-0.02em] tabular-nums">
                      {fmt(totalNet)}
                    </p>
                  </div>

                  {/* Wide screens get the table; phones and tablets get cards
                      below. Matches StaffDataTable. */}
                  <Table
                    variant="data"
                    containerClassName="hidden xl:block"
                    className="min-w-[820px]"
                  >
                    <TableHeader className="[&_tr]:border-0">
                      <TableRow>
                        <TableHead className="text-[0.8125rem] font-normal text-muted-foreground">Role</TableHead>
                        <TableHead className="text-right text-[0.8125rem] font-normal text-muted-foreground">Own</TableHead>
                        <TableHead className="text-right text-[0.8125rem] font-normal text-muted-foreground">Pool Out</TableHead>
                        <TableHead className="text-right text-[0.8125rem] font-normal text-muted-foreground">Pool In</TableHead>
                        <TableHead className="text-right text-[0.8125rem] font-normal text-muted-foreground">T-Out Given</TableHead>
                        <TableHead className="text-right text-[0.8125rem] font-normal text-muted-foreground">T-Out Recv</TableHead>
                        {hasClipping && (
                          <TableHead className="text-right text-[0.8125rem] font-normal text-muted-foreground">Clipped</TableHead>
                        )}
                        <TableHead className="text-right text-[0.8125rem] font-normal text-foreground">Net</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.entries(simulation).map(([code, s]) => (
                        <TableRow key={code}>
                          <TableCell className="text-sm font-medium">{code}</TableCell>
                          <TableCell className="text-right text-sm tabular-nums">{fmt(s.own)}</TableCell>
                          <TableCell className="text-right text-sm tabular-nums text-rose-700 dark:text-rose-400">
                            {s.poolContrib > 0 ? `−${fmt(s.poolContrib)}` : "—"}
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums text-emerald-700 dark:text-emerald-400">
                            {s.poolRecv > 0 ? `+${fmt(s.poolRecv)}` : "—"}
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums text-rose-700 dark:text-rose-400">
                            {s.tipOutGiven > 0 ? `−${fmt(s.tipOutGiven)}` : "—"}
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums text-emerald-700 dark:text-emerald-400">
                            {s.tipOutRecv > 0 ? `+${fmt(s.tipOutRecv)}` : "—"}
                          </TableCell>
                          {hasClipping && (
                            <TableCell className="text-right text-sm tabular-nums text-amber-700 dark:text-amber-400">
                              {s.tipOutClipped > 0 ? fmt(s.tipOutClipped) : "—"}
                            </TableCell>
                          )}
                          <TableCell className="text-right text-sm font-semibold tabular-nums">
                            {fmt(s.net)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:hidden">
                    {Object.entries(simulation).map(([code, s]) => (
                      <article key={code} className="min-w-0 rounded-2xl border-0 bg-muted/45 p-4">
                        <div className="flex min-w-0 items-start justify-between gap-3">
                          <p className="min-w-0 truncate text-sm font-semibold">{code}</p>
                          <p className="shrink-0 text-[1.375rem] font-medium leading-tight tracking-[-0.02em] tabular-nums">
                            {fmt(s.net)}
                          </p>
                        </div>

                        <div className="mt-5 grid min-w-0 grid-cols-2 gap-x-4 gap-y-5">
                          <div className="min-w-0">
                            <p className="text-[0.8125rem] text-muted-foreground">Own</p>
                            <p className="mt-0.5 text-sm font-medium tabular-nums">{fmt(s.own)}</p>
                          </div>
                          <div className="min-w-0">
                            <p className="text-[0.8125rem] text-muted-foreground">Pool in / out</p>
                            <p className="mt-0.5 text-sm font-medium tabular-nums">
                              <span className="text-emerald-700 dark:text-emerald-400">
                                {s.poolRecv > 0 ? `+${fmt(s.poolRecv)}` : "—"}
                              </span>
                              <span className="mx-1 text-muted-foreground">/</span>
                              <span className="text-rose-700 dark:text-rose-400">
                                {s.poolContrib > 0 ? `−${fmt(s.poolContrib)}` : "—"}
                              </span>
                            </p>
                          </div>
                          <div className="min-w-0">
                            <p className="text-[0.8125rem] text-muted-foreground">Tip-out in / out</p>
                            <p className="mt-0.5 text-sm font-medium tabular-nums">
                              <span className="text-emerald-700 dark:text-emerald-400">
                                {s.tipOutRecv > 0 ? `+${fmt(s.tipOutRecv)}` : "—"}
                              </span>
                              <span className="mx-1 text-muted-foreground">/</span>
                              <span className="text-rose-700 dark:text-rose-400">
                                {s.tipOutGiven > 0 ? `−${fmt(s.tipOutGiven)}` : "—"}
                              </span>
                            </p>
                          </div>
                          {s.tipOutClipped > 0 && (
                            <div className="min-w-0">
                              <p className="text-[0.8125rem] text-muted-foreground">Clipped</p>
                              <p className="mt-0.5 text-sm font-medium tabular-nums text-amber-700 dark:text-amber-400">
                                {fmt(s.tipOutClipped)}
                              </p>
                            </div>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>

                  {hasClipping && (
                    <p className="mt-3 text-[0.8125rem] text-amber-700 dark:text-amber-400">
                      Clipped: tip-out amounts were reduced to prevent net tips going below zero.
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
      </PanelSection>
    </Panel>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function TipsSettingsPage() {
  const clerkOrgId = useClerkOrgId();
  const selectedLocation = useGatedLocation();
  // Resolve to the gated location so single-location accounts (locked to 'all')
  // skip the "Select a Location" prompt. The shadowed `selectedLocationId` keeps
  // every `=== "all"` guard below correct.
  const selectedLocationId = useGatedLocationId() ?? "all";

  const [isPoolDialogOpen, setIsPoolDialogOpen] = useState(false);
  const [editingPool, setEditingPool] = useState<TipPoolConfigWithShares | null>(null);
  const [poolToDelete, setPoolToDelete] = useState<TipPoolConfigWithShares | null>(null);

  const [isRuleDialogOpen, setIsRuleDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<TipOutRule | null>(null);
  const [ruleToDelete, setRuleToDelete] = useState<TipOutRule | null>(null);

  const closePoolDialog = () => { setIsPoolDialogOpen(false); setEditingPool(null); };
  const closeRuleDialog = () => { setIsRuleDialogOpen(false); setEditingRule(null); };

  // Pools
  const createPoolMutation = useCreateTipPool(closePoolDialog);
  const updatePoolMutation = useUpdateTipPool(closePoolDialog);
  const deletePoolMutation = useDeleteTipPool();
  const togglePoolMutation = useToggleTipPool();
  const { data: pools = [], isLoading: poolsLoading } = useTipPoolConfigs(
    clerkOrgId,
    selectedLocationId !== "all" ? selectedLocationId : undefined
  );

  // Rules
  const createRuleMutation = useCreateTipOutRule(closeRuleDialog);
  const updateRuleMutation = useUpdateTipOutRule(closeRuleDialog);
  const deleteRuleMutation = useDeleteTipOutRule();
  const toggleRuleMutation = useToggleTipOutRule();
  const { data: rules = [], isLoading: rulesLoading } = useTipOutRules(
    clerkOrgId,
    selectedLocationId !== "all" ? selectedLocationId : undefined
  );

  // Roles (merchant-only, HQ roles filtered server-side)
  const { data: roles = [] } = useRoles(clerkOrgId);

  // Post-save validation
  const validateMutation = useValidateTipPoolConfig();

  const runPostSaveValidation = (poolId: string) => {
    if (!clerkOrgId) return;
    validateMutation.mutate(
      { clerkOrgId, configId: poolId },
      {
        onSuccess: (data) => {
          if (!data) return;
          const warnings = data.issues?.filter((i: any) => i.severity === "warning") || [];
          if (warnings.length > 0) {
            toast.warning(
              `Pool saved with warnings: ${warnings.map((w: any) => w.message).join("; ")}`,
              { duration: 8000 }
            );
          }
          const errors = data.issues?.filter((i: any) => i.severity === "error") || [];
          if (errors.length > 0) {
            toast.error(
              `Pool config issues detected: ${errors.map((e: any) => e.message).join("; ")}`,
              { duration: 8000 }
            );
          }
        },
      }
    );
  };

  // Pool handlers
  const handleCreatePool = (data: TipPoolFormData) =>
    createPoolMutation.mutate(
      { clerkOrgId: clerkOrgId!, locationId: selectedLocationId!, input: data },
      {
        onSuccess: (result) => {
          if (result?.id) runPostSaveValidation(result.id);
        },
      }
    );

  const handleUpdatePool = (data: TipPoolFormData) => {
    if (editingPool)
      updatePoolMutation.mutate(
        { clerkOrgId: clerkOrgId!, configId: editingPool.id, input: data },
        {
          onSuccess: () => {
            runPostSaveValidation(editingPool.id);
          },
        }
      );
  };

  // Rule handlers
  const handleCreateRule = (data: TipOutRuleFormData) =>
    createRuleMutation.mutate({ clerkOrgId: clerkOrgId!, locationId: selectedLocationId!, input: data });

  const handleUpdateRule = (data: TipOutRuleFormData) => {
    if (editingRule)
      updateRuleMutation.mutate({ clerkOrgId: clerkOrgId!, ruleId: editingRule.id, input: data });
  };

  const handleToggleRule = (ruleId: string, isActive: boolean) =>
    toggleRuleMutation.mutate({ clerkOrgId: clerkOrgId!, ruleId, isActive });

  if (selectedLocationId === "all") {
    return (
      <PageShell>
        <PageHeader
          title="Tips"
          subtitle="Configure tip pools and tip-out rules."
          indicator={<LocationIndicator isAllLocations locationName={null} />}
        />
        <div className="flex items-start gap-3 rounded-2xl border-0 bg-amber-500/10 p-6 dark:bg-amber-400/10">
          <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="min-w-0">
            <h2 className="font-semibold text-amber-800 dark:text-amber-300">Select a location</h2>
            <p className="mt-1 text-sm text-amber-800/90 dark:text-amber-300/90">
              Tip configuration is location-specific. Choose a specific location from the
              top navigation to view and manage tip settings.
            </p>
          </div>
        </div>
      </PageShell>
    );
  }

  const addPoolButton = (
    <Button
      className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
      onClick={() => { setEditingPool(null); setIsPoolDialogOpen(true); }}
    >
      <Plus className="mr-1.5 h-4 w-4" />
      Add Tip Pool
    </Button>
  );

  const addRuleButton = (
    <Button
      className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
      onClick={() => { setEditingRule(null); setIsRuleDialogOpen(true); }}
    >
      <Plus className="mr-1.5 h-4 w-4" />
      Add Tip-Out Rule
    </Button>
  );

  return (
    <PageShell>
      <PageHeader
        title="Tips"
        subtitle="Configure tip pools, role distribution, and tip-out rules."
        indicator={
          <LocationIndicator
            isAllLocations={false}
            locationName={selectedLocation?.name}
          />
        }
      />

      {/* TIP POOLS */}
      <Panel>
        <PanelSection
          icon={Percent}
          label="Tip Pools"
          caption="How collected tips are gathered and shared across roles."
          action={addPoolButton}
        >
          {poolsLoading ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {[...Array(2)].map((_, i) => (
                <Skeleton key={i} className="h-56 w-full rounded-2xl" />
              ))}
            </div>
          ) : pools.length === 0 ? (
            <div className="rounded-2xl border-0 bg-muted/60 p-10 text-center shadow-none">
              <Percent className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
              <p className="font-medium text-foreground">No tip pools yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Create a pool to define how tips are shared across roles.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {pools.map((pool) => (
                <PoolCard
                  key={pool.id}
                  pool={pool}
                  roles={roles}
                  poolCount={pools.length}
                  onEdit={(p) => { setEditingPool(p); setIsPoolDialogOpen(true); }}
                  onDelete={setPoolToDelete}
                  onToggle={(id, active) => togglePoolMutation.mutate({ clerkOrgId: clerkOrgId!, configId: id, isActive: active })}
                  isToggling={togglePoolMutation.isPending}
                />
              ))}
            </div>
          )}
        </PanelSection>
      </Panel>

      {/* TIP-OUT RULES */}
      <Panel>
        <PanelSection
          icon={Split}
          label="Tip-Out Rules"
          caption="Fixed transfers routing a portion of tips from one role to another."
          action={addRuleButton}
        >
          {rulesLoading ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {[...Array(2)].map((_, i) => (
                <Skeleton key={i} className="h-40 w-full rounded-2xl" />
              ))}
            </div>
          ) : rules.length === 0 ? (
            <div className="rounded-2xl border-0 bg-muted/60 p-10 text-center shadow-none">
              <Split className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
              <p className="font-medium text-foreground">No tip-out rules yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Create rules to route a portion of tips from one role to another.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {rules.map((rule) => (
                <RuleCard
                  key={rule.id}
                  rule={rule}
                  roles={roles}
                  onEdit={(r) => { setEditingRule(r); setIsRuleDialogOpen(true); }}
                  onDelete={setRuleToDelete}
                  onToggle={handleToggleRule}
                  isToggling={toggleRuleMutation.isPending}
                />
              ))}
            </div>
          )}
        </PanelSection>
      </Panel>

      {/* PREVIEW CALCULATOR */}
      <PreviewPanel
        pools={pools}
        rules={rules}
        roles={roles}
        timeZone={selectedLocation?.timezone}
      />

      {/* DIALOGS */}
      <TipPoolDialog
        open={isPoolDialogOpen}
        onOpenChange={(open) => { if (!open) closePoolDialog(); else setIsPoolDialogOpen(true); }}
        pool={editingPool}
        roles={roles}
        poolCount={pools.length}
        timeZone={selectedLocation?.timezone}
        isLoading={createPoolMutation.isPending || updatePoolMutation.isPending}
        onSubmit={editingPool ? handleUpdatePool : handleCreatePool}
      />

      <TipOutRuleDialog
        open={isRuleDialogOpen}
        onOpenChange={(open) => { if (!open) closeRuleDialog(); else setIsRuleDialogOpen(true); }}
        rule={editingRule}
        roles={roles}
        existingRules={rules}
        clerkOrgId={clerkOrgId}
        timeZone={selectedLocation?.timezone}
        isLoading={createRuleMutation.isPending || updateRuleMutation.isPending}
        onSubmit={editingRule ? handleUpdateRule : handleCreateRule}
        onDeactivateRule={(ruleId) => toggleRuleMutation.mutate({ clerkOrgId: clerkOrgId!, ruleId, isActive: false })}
      />

      {/* DELETE POOL */}
      <AlertDialog open={!!poolToDelete} onOpenChange={() => setPoolToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Tip Pool</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{poolToDelete?.name}&quot;? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (poolToDelete) { deletePoolMutation.mutate({ clerkOrgId: clerkOrgId!, configId: poolToDelete.id }); setPoolToDelete(null); } }}
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* DELETE RULE */}
      <AlertDialog open={!!ruleToDelete} onOpenChange={() => setRuleToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Tip-Out Rule</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this tip-out rule? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (ruleToDelete) { deleteRuleMutation.mutate({ clerkOrgId: clerkOrgId!, ruleId: ruleToDelete.id }); setRuleToDelete(null); } }}
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
