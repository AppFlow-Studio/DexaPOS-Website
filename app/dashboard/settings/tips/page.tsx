"use client";

import { useState } from "react";
import { Plus, MapPin } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  useRoles,
} from "./hooks/useTipSettings";
import { TipPoolDialog, type TipPoolFormData } from "./components/TipPoolDialog";
import { TipOutRuleDialog, type TipOutRuleFormData } from "./components/TipOutRuleDialog";
import { PoolCard } from "./components/PoolCard";
import { RuleCard } from "./components/RuleCard";
import type { TipPoolConfigWithShares, TipOutRule } from "@/app/dashboard/actions/tips";

export default function TipsSettingsPage() {
  const clerkOrgId = useClerkOrgId();
  const { selectedLocationId } = useLocationStore();

  // Dialog states
  const [isPoolDialogOpen, setIsPoolDialogOpen] = useState(false);
  const [editingPool, setEditingPool] = useState<TipPoolConfigWithShares | null>(null);
  const [poolToDelete, setPoolToDelete] = useState<TipPoolConfigWithShares | null>(null);

  const [isRuleDialogOpen, setIsRuleDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<TipOutRule | null>(null);
  const [ruleToDelete, setRuleToDelete] = useState<TipOutRule | null>(null);

  // Close dialog callbacks (called from hooks on success)
  const closePoolDialog = () => {
    setIsPoolDialogOpen(false);
    setEditingPool(null);
  };

  const closeRuleDialog = () => {
    setIsRuleDialogOpen(false);
    setEditingRule(null);
  };

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
  const { data: rules = [], isLoading: rulesLoading } = useTipOutRules(
    clerkOrgId,
    selectedLocationId !== "all" ? selectedLocationId : undefined
  );

  // Roles
  const { data: roles = [] } = useRoles(clerkOrgId);

  // Handlers for pools
  const handleCreatePool = (data: TipPoolFormData) => {
    createPoolMutation.mutate({
      clerkOrgId: clerkOrgId!,
      locationId: selectedLocationId!,
      input: data,
    });
  };

  const handleUpdatePool = (data: TipPoolFormData) => {
    if (editingPool) {
      updatePoolMutation.mutate({
        clerkOrgId: clerkOrgId!,
        configId: editingPool.id,
        input: data,
      });
    }
  };

  const handleEditPool = (pool: TipPoolConfigWithShares) => {
    setEditingPool(pool);
    setIsPoolDialogOpen(true);
  };

  const handleDeletePool = (pool: TipPoolConfigWithShares) => {
    setPoolToDelete(pool);
  };

  const confirmDeletePool = () => {
    if (poolToDelete) {
      deletePoolMutation.mutate({
        clerkOrgId: clerkOrgId!,
        configId: poolToDelete.id,
      });
      setPoolToDelete(null);
    }
  };

  const handleTogglePool = (poolId: string, isActive: boolean) => {
    togglePoolMutation.mutate({
      clerkOrgId: clerkOrgId!,
      configId: poolId,
      isActive,
    });
  };

  // Handlers for rules
  const handleCreateRule = (data: TipOutRuleFormData) => {
    createRuleMutation.mutate({
      clerkOrgId: clerkOrgId!,
      locationId: selectedLocationId!,
      input: data,
    });
  };

  const handleUpdateRule = (data: TipOutRuleFormData) => {
    if (editingRule) {
      updateRuleMutation.mutate({
        clerkOrgId: clerkOrgId!,
        ruleId: editingRule.id,
        input: data,
      });
    }
  };

  const handleEditRule = (rule: TipOutRule) => {
    setEditingRule(rule);
    setIsRuleDialogOpen(true);
  };

  const handleDeleteRule = (rule: TipOutRule) => {
    setRuleToDelete(rule);
  };

  const confirmDeleteRule = () => {
    if (ruleToDelete) {
      deleteRuleMutation.mutate({
        clerkOrgId: clerkOrgId!,
        ruleId: ruleToDelete.id,
      });
      setRuleToDelete(null);
    }
  };

  // Guard: location must be selected
  if (selectedLocationId === "all") {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Tip Configuration</h1>
          <p className="text-muted-foreground mt-2">
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
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Tip Configuration</h1>
        <p className="text-muted-foreground mt-2">
          Set up tip pools and tip-out rules for your location
        </p>
      </div>

      {/* TIP POOLS SECTION */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Tip Pools</h2>
          <Button
            onClick={() => {
              setEditingPool(null);
              setIsPoolDialogOpen(true);
            }}
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
          <Card className="p-6 text-center">
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
                onEdit={handleEditPool}
                onDelete={handleDeletePool}
                onToggle={handleTogglePool}
                isToggling={togglePoolMutation.isPending}
              />
            ))}
          </div>
        )}
      </section>

      {/* TIP-OUT RULES SECTION */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Tip-Out Rules</h2>
          <Button
            onClick={() => {
              setEditingRule(null);
              setIsRuleDialogOpen(true);
            }}
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
          <Card className="p-6 text-center">
            <p className="text-muted-foreground">No tip-out rules configured yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Create your first tip-out rule to distribute tips between roles
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {rules.map((rule) => (
              <RuleCard
                key={rule.id}
                rule={rule}
                roles={roles}
                onEdit={handleEditRule}
                onDelete={handleDeleteRule}
              />
            ))}
          </div>
        )}
      </section>

      {/* TIP POOL DIALOG */}
      <TipPoolDialog
        open={isPoolDialogOpen}
        onOpenChange={(open) => {
          if (!open) closePoolDialog();
          else setIsPoolDialogOpen(true);
        }}
        pool={editingPool}
        roles={roles}
        isLoading={createPoolMutation.isPending || updatePoolMutation.isPending}
        onSubmit={editingPool ? handleUpdatePool : handleCreatePool}
      />

      {/* TIP-OUT RULE DIALOG */}
      <TipOutRuleDialog
        open={isRuleDialogOpen}
        onOpenChange={(open) => {
          if (!open) closeRuleDialog();
          else setIsRuleDialogOpen(true);
        }}
        rule={editingRule}
        roles={roles}
        isLoading={createRuleMutation.isPending || updateRuleMutation.isPending}
        onSubmit={editingRule ? handleUpdateRule : handleCreateRule}
      />

      {/* DELETE POOL CONFIRMATION */}
      <AlertDialog open={!!poolToDelete} onOpenChange={() => setPoolToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Tip Pool</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{poolToDelete?.name}&quot;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeletePool}
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* DELETE RULE CONFIRMATION */}
      <AlertDialog open={!!ruleToDelete} onOpenChange={() => setRuleToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Tip-Out Rule</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this tip-out rule? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteRule}
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
