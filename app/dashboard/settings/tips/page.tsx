"use client";

import { useState } from "react";
import { Plus, MapPin, FlaskConical, ChevronDown, ChevronUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { useLocationStore } from "@/stores/location-store";
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
} from "./hooks/useTipSettings";
import { TipPoolDialog, type TipPoolFormData } from "./components/TipPoolDialog";
import { TipOutRuleDialog, type TipOutRuleFormData } from "./components/TipOutRuleDialog";
import { PoolCard } from "./components/PoolCard";
import { RuleCard } from "./components/RuleCard";
import type { TipPoolConfigWithShares, TipOutRule, Role } from "@/app/dashboard/actions/tips";

// ─── Preview Calculator (pure client-side) ─────────────────────────────────

function PreviewPanel({
  pools,
  rules,
  roles,
}: {
  pools: TipPoolConfigWithShares[];
  rules: TipOutRule[];
  roles: Role[];
}) {
  const [open, setOpen] = useState(false);
  // Per-role: {roleCode -> {tips, hours, sales}}
  const [inputs, setInputs] = useState<Record<string, { tips: number; hours: number; sales: number }>>({});

  const setInput = (code: string, field: "tips" | "hours" | "sales", value: number) => {
    setInputs((prev) => ({
      ...prev,
      [code]: { ...{ tips: 0, hours: 0, sales: 0 }, ...(prev[code] || {}), [field]: value },
    }));
  };

  const today = new Date().toISOString().split("T")[0];

  const activePools = pools.filter(
    (p) => p.is_active && p.effective_date <= today && (!( p as any).end_date || (p as any).end_date >= today)
  );
  const activeRules = rules.filter(
    (r) => r.is_active && r.effective_date <= today && (!r.end_date || r.end_date >= today)
  );

  // Simulate calculation
  const simulation: Record<string, {
    own: number; poolContrib: number; poolRecv: number; tipOutGiven: number; tipOutRecv: number; net: number;
  }> = {};

  for (const code of Object.keys(inputs)) {
    simulation[code] = { own: inputs[code].tips, poolContrib: 0, poolRecv: 0, tipOutGiven: 0, tipOutRecv: 0, net: 0 };
  }

  for (const pool of activePools) {
    let poolAmount = 0;
    for (const code of pool.contributing_role_codes) {
      const emp = inputs[code];
      if (!emp) continue;
      const contrib = emp.tips * (pool.source_percentage / 100);
      if (simulation[code]) simulation[code].poolContrib += contrib;
      poolAmount += contrib;
    }

    for (const share of pool.tip_pool_role_shares) {
      const code = share.role_code;
      if (!simulation[code]) continue;

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
        if (totalHours > 0) simulation[code].poolRecv += poolAmount * ((inputs[code].hours || 0) / totalHours);
      } else if (pool.distribution_method === "points" && share.points_per_hour != null && inputs[code]) {
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

  for (const rule of activeRules) {
    const giverInput = inputs[rule.from_role_code];
    if (!giverInput || !simulation[rule.from_role_code]) continue;
    let given = 0;
    if (rule.tip_out_type === "percentage_of_tips") given = giverInput.tips * (rule.tip_out_value / 100);
    else if (rule.tip_out_type === "percentage_of_sales") given = giverInput.sales * (rule.tip_out_value / 100);
    else given = rule.tip_out_value;

    simulation[rule.from_role_code].tipOutGiven += given;

    if (simulation[rule.to_role_code]) {
      simulation[rule.to_role_code].tipOutRecv += given;
    }
  }

  for (const code of Object.keys(simulation)) {
    const s = simulation[code];
    s.net = s.own - s.poolContrib + s.poolRecv - s.tipOutGiven + s.tipOutRecv;
  }

  const fmt = (n: number) => `$${n.toFixed(2)}`;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FlaskConical className="w-5 h-5 text-muted-foreground" />
          <h2 className="text-xl font-semibold">Preview Calculator</h2>
        </div>
        <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
          {open ? <ChevronUp className="w-4 h-4 mr-1" /> : <ChevronDown className="w-4 h-4 mr-1" />}
          {open ? "Hide" : "Show"}
        </Button>
      </div>

      {open && (
        <Card className="p-5 space-y-5">
          <p className="text-sm text-muted-foreground">
            Enter hypothetical amounts per role to see how tips would be distributed
            with your current configuration.
          </p>

          {roles.length === 0 ? (
            <p className="text-sm text-muted-foreground">No roles available.</p>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-4 gap-2 text-xs font-medium text-muted-foreground pb-1 border-b">
                <span>Role</span>
                <span>Tips Earned ($)</span>
                <span>Hours Worked</span>
                <span>Gross Sales ($)</span>
              </div>
              {roles.map((role) => (
                <div key={role.code} className="grid grid-cols-4 gap-2 items-center">
                  <Label className="text-sm font-medium">{role.code}</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={inputs[role.code]?.tips || ""}
                    onChange={(e) => setInput(role.code, "tips", parseFloat(e.target.value) || 0)}
                    className="h-8 text-sm"
                  />
                  <Input
                    type="number"
                    min="0"
                    step="0.5"
                    placeholder="0"
                    value={inputs[role.code]?.hours || ""}
                    onChange={(e) => setInput(role.code, "hours", parseFloat(e.target.value) || 0)}
                    className="h-8 text-sm"
                  />
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={inputs[role.code]?.sales || ""}
                    onChange={(e) => setInput(role.code, "sales", parseFloat(e.target.value) || 0)}
                    className="h-8 text-sm"
                  />
                </div>
              ))}
            </div>
          )}

          {Object.keys(simulation).length > 0 && (
            <div className="space-y-2 border-t pt-4">
              <p className="text-sm font-semibold">Simulated Result</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground border-b">
                      <th className="text-left pb-2">Role</th>
                      <th className="text-right pb-2">Own</th>
                      <th className="text-right pb-2">Pool Out</th>
                      <th className="text-right pb-2">Pool In</th>
                      <th className="text-right pb-2">T-Out Given</th>
                      <th className="text-right pb-2">T-Out Recv</th>
                      <th className="text-right pb-2 font-bold text-foreground">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(simulation).map(([code, s]) => (
                      <tr key={code} className="border-b last:border-0">
                        <td className="py-1.5 font-medium">{code}</td>
                        <td className="text-right py-1.5">{fmt(s.own)}</td>
                        <td className="text-right py-1.5 text-red-600">−{fmt(s.poolContrib)}</td>
                        <td className="text-right py-1.5 text-green-600">+{fmt(s.poolRecv)}</td>
                        <td className="text-right py-1.5 text-red-600">−{fmt(s.tipOutGiven)}</td>
                        <td className="text-right py-1.5 text-green-600">+{fmt(s.tipOutRecv)}</td>
                        <td className="text-right py-1.5 font-bold">{fmt(s.net)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Card>
      )}
    </section>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function TipsSettingsPage() {
  const clerkOrgId = useClerkOrgId();
  const { selectedLocationId } = useLocationStore();

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

  // Pool handlers
  const handleCreatePool = (data: TipPoolFormData) =>
    createPoolMutation.mutate({ clerkOrgId: clerkOrgId!, locationId: selectedLocationId!, input: data });

  const handleUpdatePool = (data: TipPoolFormData) => {
    if (editingPool)
      updatePoolMutation.mutate({ clerkOrgId: clerkOrgId!, configId: editingPool.id, input: data });
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
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Tip Configuration</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Set up tip pools and tip-out rules for your location
          </p>
        </div>
        <Card className="p-6 border-yellow-200 bg-yellow-50">
          <div className="flex items-start gap-3">
            <MapPin className="w-5 h-5 text-yellow-600 mt-0.5" />
            <div>
              <h3 className="font-semibold text-yellow-900">Select a Location</h3>
              <p className="text-sm text-yellow-800 mt-1">
                Tip configuration is location-specific. Please select a specific location from the
                top navigation to view and manage tip settings.
              </p>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Tip Configuration</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Set up tip pools and tip-out rules for your location
        </p>
      </div>

      {/* TIP POOLS */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Tip Pools</h2>
          <Button
            onClick={() => { setEditingPool(null); setIsPoolDialogOpen(true); }}
            className="bg-teal-500 hover:bg-teal-600 text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Tip Pool
          </Button>
        </div>

        {poolsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[...Array(2)].map((_, i) => (
              <Card key={i} className="h-48 animate-pulse bg-muted" />
            ))}
          </div>
        ) : pools.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">No tip pools configured yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Create your first tip pool to get started
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pools.map((pool) => (
              <PoolCard
                key={pool.id}
                pool={pool}
                roles={roles}
                onEdit={(p) => { setEditingPool(p); setIsPoolDialogOpen(true); }}
                onDelete={setPoolToDelete}
                onToggle={(id, active) => togglePoolMutation.mutate({ clerkOrgId: clerkOrgId!, configId: id, isActive: active })}
                isToggling={togglePoolMutation.isPending}
              />
            ))}
          </div>
        )}
      </section>

      {/* TIP-OUT RULES */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Tip-Out Rules</h2>
          <Button
            onClick={() => { setEditingRule(null); setIsRuleDialogOpen(true); }}
            className="bg-teal-500 hover:bg-teal-600 text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Tip-Out Rule
          </Button>
        </div>

        {rulesLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[...Array(2)].map((_, i) => (
              <Card key={i} className="h-32 animate-pulse bg-muted" />
            ))}
          </div>
        ) : rules.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">No tip-out rules configured yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Create tip-out rules to distribute tips between roles
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
      </section>

      {/* PREVIEW CALCULATOR */}
      <PreviewPanel pools={pools} rules={rules} roles={roles} />

      {/* DIALOGS */}
      <TipPoolDialog
        open={isPoolDialogOpen}
        onOpenChange={(open) => { if (!open) closePoolDialog(); else setIsPoolDialogOpen(true); }}
        pool={editingPool}
        roles={roles}
        isLoading={createPoolMutation.isPending || updatePoolMutation.isPending}
        onSubmit={editingPool ? handleUpdatePool : handleCreatePool}
      />

      <TipOutRuleDialog
        open={isRuleDialogOpen}
        onOpenChange={(open) => { if (!open) closeRuleDialog(); else setIsRuleDialogOpen(true); }}
        rule={editingRule}
        roles={roles}
        isLoading={createRuleMutation.isPending || updateRuleMutation.isPending}
        onSubmit={editingRule ? handleUpdateRule : handleCreateRule}
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
    </div>
  );
}
