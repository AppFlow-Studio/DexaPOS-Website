"use client";

import { useState, useEffect, useMemo } from "react";
import {
  AlertCircle,
  Lock,
  X,
  Plus,
  Clock,
  CalendarDays,
  ShoppingCart,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { DatePopover } from "./DatePopover";
import type { TipPoolConfigWithShares, Role } from "@/app/dashboard/actions/tips";

interface TipPoolDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pool?: TipPoolConfigWithShares | null;
  roles: Role[];
  poolCount: number;
  isLoading?: boolean;
  onSubmit: (data: TipPoolFormData) => void;
}

export interface TipPoolFormData {
  name: string;
  description: string;
  distribution_method: "percentage" | "hours_weighted" | "equal_split" | "points";
  tip_source: "charged_tips" | "all_tips" | "cash_only";
  source_percentage: number;
  contributing_role_codes: string[];
  is_active: boolean;
  effective_date: string;
  end_date: string | null;
  priority: number;
  policy_interval: "full_workday" | "by_shift" | "order";
  role_shares: {
    role_code: string;
    share_percentage?: number;
    points_per_hour?: number;
    is_eligible: boolean;
  }[];
}

const defaultFormData: TipPoolFormData = {
  name: "",
  description: "",
  distribution_method: "percentage",
  tip_source: "charged_tips",
  source_percentage: 100,
  contributing_role_codes: [],
  is_active: true,
  effective_date: new Date().toISOString().split("T")[0],
  end_date: null,
  priority: 100,
  policy_interval: "full_workday",
  role_shares: [],
};

export function TipPoolDialog({
  open,
  onOpenChange,
  pool,
  roles,
  poolCount,
  isLoading,
  onSubmit,
}: TipPoolDialogProps) {
  const [formData, setFormData] = useState<TipPoolFormData>({ ...defaultFormData });
  const [showUnderWarning, setShowUnderWarning] = useState(false);

  useEffect(() => {
    if (!open) return;

    if (pool) {
      // Handle legacy custom_percentage → map to all_tips
      let tipSource = pool.tip_source as TipPoolFormData["tip_source"];
      if ((pool.tip_source as string) === "custom_percentage") {
        tipSource = "all_tips";
        toast.info("This pool was using a legacy tip source. It has been updated to 'All Tips'.");
      }

      setFormData({
        name: pool.name,
        description: pool.description || "",
        distribution_method: pool.distribution_method,
        tip_source: tipSource,
        source_percentage: pool.source_percentage,
        contributing_role_codes: pool.contributing_role_codes || [],
        is_active: pool.is_active,
        effective_date: pool.effective_date,
        end_date: (pool as any).end_date ?? null,
        priority: (pool as any).priority ?? 100,
        policy_interval: (pool as any).policy_interval ?? "full_workday",
        role_shares: (pool.tip_pool_role_shares || []).map((share) => ({
          role_code: share.role_code,
          share_percentage: share.share_percentage ?? undefined,
          points_per_hour: share.points_per_hour ?? undefined,
          is_eligible: share.is_eligible,
        })),
      });
    } else {
      setFormData({
        ...defaultFormData,
        effective_date: new Date().toISOString().split("T")[0],
      });
    }
    setShowUnderWarning(false);
  }, [pool, open]);

  const set = <K extends keyof TipPoolFormData>(field: K, value: TipPoolFormData[K]) =>
    setFormData((prev) => ({ ...prev, [field]: value }));

  // ─── Contributing role toggle ─────────────────────────────
  const toggleContributing = (code: string) => {
    set(
      "contributing_role_codes",
      formData.contributing_role_codes.includes(code)
        ? formData.contributing_role_codes.filter((c) => c !== code)
        : [...formData.contributing_role_codes, code]
    );
  };

  // ─── Role shares management ───────────────────────────────
  const addRoleShare = (code: string) => {
    if (formData.role_shares.find((s) => s.role_code === code)) return;
    setFormData((prev) => ({
      ...prev,
      role_shares: [
        ...prev.role_shares,
        {
          role_code: code,
          share_percentage: prev.distribution_method === "percentage" ? 0 : undefined,
          points_per_hour: prev.distribution_method === "points" ? 0 : undefined,
          is_eligible: true,
        },
      ],
    }));
  };

  const removeRoleShare = (code: string) => {
    setFormData((prev) => ({
      ...prev,
      role_shares: prev.role_shares.filter((s) => s.role_code !== code),
    }));
  };

  const updateShare = (
    roleCode: string,
    field: "share_percentage" | "points_per_hour" | "is_eligible",
    value: number | boolean
  ) => {
    setFormData((prev) => ({
      ...prev,
      role_shares: prev.role_shares.map((s) =>
        s.role_code === roleCode ? { ...s, [field]: value } : s
      ),
    }));
  };

  // When distribution method changes, reset share values but keep roles
  const handleMethodChange = (method: TipPoolFormData["distribution_method"]) => {
    setFormData((prev) => ({
      ...prev,
      distribution_method: method,
      role_shares: prev.role_shares.map((s) => ({
        role_code: s.role_code,
        share_percentage: method === "percentage" ? 0 : undefined,
        points_per_hour: method === "points" ? 0 : undefined,
        is_eligible: true,
      })),
    }));
  };

  // ─── Computed values ──────────────────────────────────────
  const totalPercentage = useMemo(
    () =>
      formData.role_shares
        .filter((s) => s.is_eligible)
        .reduce((sum, s) => sum + (s.share_percentage || 0), 0),
    [formData.role_shares]
  );

  const availableReceivingRoles = useMemo(
    () => roles.filter((r) => !formData.role_shares.find((s) => s.role_code === r.code)),
    [roles, formData.role_shares]
  );

  const getRoleName = (code: string) => roles.find((r) => r.code === code)?.name || code;

  // ─── Validation ───────────────────────────────────────────
  const validationErrors = useMemo(() => {
    const errors: Record<string, string> = {};
    if (!formData.name.trim()) errors.name = "Pool name is required";
    if (formData.contributing_role_codes.length === 0)
      errors.contributing = "Select at least one contributing role";
    if (formData.role_shares.filter((s) => s.is_eligible).length === 0)
      errors.role_shares = "Select at least one receiving role";
    if (formData.distribution_method === "percentage" && totalPercentage > 100.01)
      errors.share_total = `Share percentages total ${totalPercentage.toFixed(1)}%, must be ≤ 100%`;
    if (formData.distribution_method === "points") {
      const missingPoints = formData.role_shares.filter(
        (s) => s.is_eligible && (!s.points_per_hour || s.points_per_hour <= 0)
      );
      if (missingPoints.length > 0)
        errors.points = "All eligible roles must have points_per_hour > 0";
    }
    if (formData.source_percentage <= 0 || formData.source_percentage > 100)
      errors.source_percentage = "Source percentage must be between 1 and 100";
    return errors;
  }, [formData, totalPercentage]);

  const isValid = Object.keys(validationErrors).length === 0;

  const handleSubmit = () => {
    if (!isValid) return;
    // Check for percentage under warning
    if (
      formData.distribution_method === "percentage" &&
      totalPercentage < 99.99
    ) {
      setShowUnderWarning(true);
      return;
    }
    onSubmit(formData);
  };

  const confirmUnderWarning = () => {
    setShowUnderWarning(false);
    onSubmit(formData);
  };

  const showPriority = poolCount >= 2 || (pool && poolCount >= 1);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] grid-cols-[minmax(0,1fr)] overflow-x-hidden overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{pool ? "Edit Tip Pool" : "Create Tip Pool"}</DialogTitle>
            <DialogDescription>
              Configure how tips are collected and distributed among staff roles
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-2">
            {/* ────── SECTION 1: BASICS ────── */}
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Basics
              </h3>

              <div>
                <Label htmlFor="pool-name">Pool Name *</Label>
                <Input
                  id="pool-name"
                  value={formData.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="e.g., Front of House Pool, Bar Pool"
                  className={cn("mt-1", validationErrors.name && "border-red-500")}
                />
                {validationErrors.name && (
                  <p className="text-xs text-red-500 mt-1">{validationErrors.name}</p>
                )}
              </div>

              <div>
                <Label htmlFor="pool-desc">Description</Label>
                <Textarea
                  id="pool-desc"
                  value={formData.description}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder="Optional description"
                  className="mt-1"
                  rows={2}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="pool-active">Active</Label>
                  <p className="text-xs text-muted-foreground">
                    Inactive pools are skipped during distribution
                  </p>
                </div>
                <Switch
                  id="pool-active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => set("is_active", checked)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="min-w-0">
                  <Label htmlFor="pool-eff-date">Effective Date</Label>
                  <div className="mt-1">
                    <DatePopover
                      id="pool-eff-date"
                      value={formData.effective_date}
                      onChange={(v) => {
                        set("effective_date", v ?? "");
                        if (v && formData.end_date && v >= formData.end_date) {
                          set("end_date", null);
                        }
                      }}
                    />
                  </div>
                </div>
                <div className="min-w-0">
                  <Label htmlFor="pool-end-date">End Date</Label>
                  <div className="mt-1">
                    <DatePopover
                      id="pool-end-date"
                      value={formData.end_date || ""}
                      min={formData.effective_date}
                      placeholder="No end date"
                      onChange={(v) => set("end_date", v)}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Leave blank = no end date</p>
                </div>
              </div>

              {showPriority && (
                <div>
                  <Label htmlFor="pool-priority">Priority</Label>
                  <Input
                    id="pool-priority"
                    type="number"
                    min="1"
                    max="999"
                    value={formData.priority}
                    onChange={(e) =>
                      set("priority", parseInt(e.target.value) || 100)
                    }
                    className="mt-1 w-28"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Lower runs first. Default 100. Pools with the same priority run in creation order.
                  </p>
                </div>
              )}
            </section>

            <Separator />

            {/* ────── SECTION 2: POLICY INTERVAL ────── */}
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Policy Interval
              </h3>
              <p className="text-sm text-muted-foreground">
                How tips are grouped for distribution
              </p>

              <TooltipProvider>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Full Workday */}
                  <button
                    type="button"
                    onClick={() => set("policy_interval", "full_workday")}
                    className={cn(
                      "relative rounded-lg border-2 p-4 text-left transition-all",
                      formData.policy_interval === "full_workday"
                        ? "border-teal-500 bg-teal-500/5"
                        : "border-border hover:border-muted-foreground/30"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <CalendarDays className="w-4 h-4 text-teal-500" />
                      <span className="text-sm font-semibold">Full Workday</span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Tips are pooled between employees that work the same day.
                    </p>
                    <Badge className="mt-2 bg-teal-500/10 text-teal-600 border-teal-500/30 text-[10px]">
                      Most common setup
                    </Badge>
                  </button>

                  {/* By Shift — disabled */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className="relative rounded-lg border-2 border-border p-4 text-left opacity-50 cursor-not-allowed"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <Clock className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm font-semibold text-muted-foreground">By Shift</span>
                          <Lock className="w-3.5 h-3.5 text-muted-foreground ml-auto" />
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Tips are pooled by employees that work the same service (i.e. breakfast, lunch, dinner).
                        </p>
                        <Badge variant="outline" className="mt-2 text-[10px]">
                          Coming soon
                        </Badge>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Available in a future release — Full Workday works for most restaurants right now.</p>
                    </TooltipContent>
                  </Tooltip>

                  {/* Order — disabled */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className="relative rounded-lg border-2 border-border p-4 text-left opacity-50 cursor-not-allowed"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <ShoppingCart className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm font-semibold text-muted-foreground">Order</span>
                          <Lock className="w-3.5 h-3.5 text-muted-foreground ml-auto" />
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Uses the exact time a check is opened.
                        </p>
                        <Badge variant="outline" className="mt-2 text-[10px]">
                          Coming soon
                        </Badge>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Available in a future release — Full Workday works for most restaurants right now.</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </TooltipProvider>
            </section>

            <Separator />

            {/* ────── SECTION 3: TIP SOURCE ────── */}
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Tip Source
              </h3>

              <RadioGroup
                value={formData.tip_source}
                onValueChange={(v) => set("tip_source", v as TipPoolFormData["tip_source"])}
                className="space-y-2"
              >
                {[
                  { value: "charged_tips", label: "Charged Tips Only", desc: "Credit/debit card tips" },
                  { value: "all_tips", label: "All Tips", desc: "Charged + declared cash tips" },
                  { value: "cash_only", label: "Cash Only", desc: "Declared cash tips only" },
                ].map((opt) => (
                  <div key={opt.value} className="flex items-start gap-2">
                    <RadioGroupItem value={opt.value} id={`src-${opt.value}`} className="mt-0.5" />
                    <Label htmlFor={`src-${opt.value}`} className="font-normal cursor-pointer">
                      <span className="font-medium">{opt.label}</span>
                      <span className="text-muted-foreground"> — {opt.desc}</span>
                    </Label>
                  </div>
                ))}
              </RadioGroup>

              <div className="space-y-2">
                <Label>
                  Source Percentage: {formData.source_percentage}%
                </Label>
                <div className="flex items-center gap-3">
                  <Slider
                    value={[formData.source_percentage]}
                    onValueChange={([v]) => set("source_percentage", v)}
                    min={1}
                    max={100}
                    step={1}
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    min="1"
                    max="100"
                    value={formData.source_percentage}
                    onChange={(e) =>
                      set("source_percentage", Math.min(100, Math.max(1, parseInt(e.target.value) || 1)))
                    }
                    className="w-20"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  % of this source going into the pool. 100 = all tips from the selected source.
                </p>
                {validationErrors.source_percentage && (
                  <p className="text-xs text-red-500">{validationErrors.source_percentage}</p>
                )}
              </div>
            </section>

            <Separator />

            {/* ────── SECTION 4: DISTRIBUTION & ROLE SHARES ────── */}
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Distribution & Role Shares
              </h3>

              {/* Distribution Method */}
              <div>
                <Label>Distribution Method</Label>
                <Select
                  value={formData.distribution_method}
                  onValueChange={(v) => handleMethodChange(v as TipPoolFormData["distribution_method"])}
                >
                  <SelectTrigger className="mt-1 w-full min-w-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">
                      Percentage — Each role gets a fixed % of the pool
                    </SelectItem>
                    <SelectItem value="equal_split">
                      Equal Split — Divided equally among eligible employees
                    </SelectItem>
                    <SelectItem value="hours_weighted">
                      Hours Weighted — Proportional to hours worked
                    </SelectItem>
                    <SelectItem value="points">
                      Points — Role points per hour x hours worked
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Contributing Roles */}
              <div>
                <Label>Contributing Roles *</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Roles whose tips go <strong>into</strong> this pool
                </p>

                {/* Selected contributing roles as pills */}
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {formData.contributing_role_codes.map((code) => (
                    <Badge
                      key={code}
                      variant="secondary"
                      className="text-xs gap-1 pr-1 max-w-full"
                    >
                      <span className="truncate">{code} · {getRoleName(code)}</span>
                      <button
                        type="button"
                        onClick={() => toggleContributing(code)}
                        className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20 shrink-0"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>

                {/* Add contributing role dropdown */}
                {roles.filter((r) => !formData.contributing_role_codes.includes(r.code)).length > 0 && (
                  <Select onValueChange={(v) => toggleContributing(v)}>
                    <SelectTrigger className="w-full min-w-0">
                      <SelectValue placeholder="Add contributing role..." />
                    </SelectTrigger>
                    <SelectContent>
                      {roles
                        .filter((r) => !formData.contributing_role_codes.includes(r.code))
                        .map((role) => (
                          <SelectItem key={role.code} value={role.code}>
                            {role.code} — {role.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )}

                {validationErrors.contributing && (
                  <p className="text-xs text-red-500 mt-1">{validationErrors.contributing}</p>
                )}
              </div>

              {/* Role Shares Table */}
              <div>
                <Label>Receiving Roles & Shares *</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Roles that <strong>receive</strong> from this pool and how it's split
                </p>

                {validationErrors.role_shares && (
                  <Alert variant="destructive" className="mb-2">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{validationErrors.role_shares}</AlertDescription>
                  </Alert>
                )}

                {formData.role_shares.length > 0 && (
                  <div className="rounded-lg border divide-y">
                    {formData.role_shares.map((share) => (
                      <div
                        key={share.role_code}
                        className="flex items-center gap-3 px-3 py-2.5"
                      >
                        <div className="flex-1 min-w-0 truncate">
                          <span className="text-sm font-medium">{share.role_code}</span>
                          <span className="text-xs text-muted-foreground ml-1.5">
                            · {getRoleName(share.role_code)}
                          </span>
                        </div>

                        {/* Percentage method: % input */}
                        {formData.distribution_method === "percentage" && (
                          <div className="flex items-center gap-1.5">
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              step="0.01"
                              value={share.share_percentage ?? ""}
                              onChange={(e) =>
                                updateShare(
                                  share.role_code,
                                  "share_percentage",
                                  parseFloat(e.target.value) || 0
                                )
                              }
                              className="w-20 h-8 text-sm"
                            />
                            <span className="text-sm text-muted-foreground">%</span>
                          </div>
                        )}

                        {/* Points method: points_per_hour input */}
                        {formData.distribution_method === "points" && (
                          <div className="flex items-center gap-1.5">
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={share.points_per_hour ?? ""}
                              onChange={(e) =>
                                updateShare(
                                  share.role_code,
                                  "points_per_hour",
                                  parseFloat(e.target.value) || 0
                                )
                              }
                              className={cn(
                                "w-20 h-8 text-sm",
                                validationErrors.points &&
                                  share.is_eligible &&
                                  (!share.points_per_hour || share.points_per_hour <= 0) &&
                                  "border-red-500"
                              )}
                            />
                            <span className="text-xs text-muted-foreground">pts/hr</span>
                          </div>
                        )}

                        {/* Equal split / hours weighted: just eligibility info */}
                        {(formData.distribution_method === "equal_split" ||
                          formData.distribution_method === "hours_weighted") && (
                          <span className="text-xs text-muted-foreground">
                            {formData.distribution_method === "hours_weighted"
                              ? "Hours-weighted"
                              : "Equal share"}
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={() => removeRoleShare(share.role_code)}
                          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}

                    {/* Percentage total footer */}
                    {formData.distribution_method === "percentage" && (
                      <div className="flex items-center justify-between px-3 py-2 bg-muted/30">
                        <span className="text-sm font-medium">Total</span>
                        <span
                          className={cn(
                            "text-sm font-bold tabular-nums",
                            totalPercentage > 100.01
                              ? "text-red-500"
                              : totalPercentage < 99.99
                              ? "text-amber-500"
                              : "text-green-600"
                          )}
                        >
                          {totalPercentage.toFixed(1)}%
                          {totalPercentage > 100.01 && (
                            <span className="font-normal ml-1">
                              — over by {(totalPercentage - 100).toFixed(1)}%
                            </span>
                          )}
                          {totalPercentage < 99.99 && totalPercentage > 0 && (
                            <span className="font-normal ml-1">
                              — {(100 - totalPercentage).toFixed(1)}% unallocated
                            </span>
                          )}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {validationErrors.share_total && (
                  <p className="text-xs text-red-500 mt-1">{validationErrors.share_total}</p>
                )}

                {validationErrors.points && (
                  <p className="text-xs text-red-500 mt-1">{validationErrors.points}</p>
                )}

                {/* Add receiving role */}
                {availableReceivingRoles.length > 0 && (
                  <div className="mt-2">
                    <Select onValueChange={(v) => addRoleShare(v)}>
                      <SelectTrigger className="w-full min-w-0">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add receiving role...</span>
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        {availableReceivingRoles.map((role) => (
                          <SelectItem key={role.code} value={role.code}>
                            {role.code} — {role.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </section>
          </div>

          <DialogFooter className="pt-4 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!isValid || isLoading}
              className="bg-teal-500 hover:bg-teal-600 text-white"
            >
              {isLoading ? "Saving..." : pool ? "Update Pool" : "Create Pool"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Under-100% confirmation dialog */}
      <AlertDialog open={showUnderWarning} onOpenChange={setShowUnderWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unallocated Pool Share</AlertDialogTitle>
            <AlertDialogDescription>
              Your pool shares add up to {totalPercentage.toFixed(1)}%. The remaining{" "}
              {(100 - totalPercentage).toFixed(1)}% will not be distributed to any role. Save anyway?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go Back</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmUnderWarning}
              className="bg-teal-500 hover:bg-teal-600 text-white"
            >
              Save Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
