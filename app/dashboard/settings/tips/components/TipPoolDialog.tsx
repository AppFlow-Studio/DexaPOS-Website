"use client";

import { useState, useEffect } from "react";
import { ChevronRight, ChevronLeft, AlertCircle } from "lucide-react";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import type { TipPoolConfigWithShares, Role } from "@/app/dashboard/actions/tips";

interface TipPoolDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pool?: TipPoolConfigWithShares | null;
  roles: Role[];
  isLoading?: boolean;
  onSubmit: (data: TipPoolFormData) => void;
}

export interface TipPoolFormData {
  name: string;
  description: string;
  distribution_method: "percentage" | "hours_weighted" | "equal_split" | "points";
  tip_source: "charged_tips" | "all_tips" | "cash_only" | "custom_percentage";
  source_percentage: number;
  contributing_role_codes: string[];
  receiving_role_codes: string[];
  is_active: boolean;
  effective_date: string;
  end_date: string | null;
  role_shares: { role_code: string; share_percentage?: number; points_per_hour?: number }[];
}

const TOTAL_STEPS = 4;

const STEP_LABELS = [
  "Basic Info",
  "Contributing Roles",
  "Receiving Roles",
  "Share Config",
];

const defaultFormData: TipPoolFormData = {
  name: "",
  description: "",
  distribution_method: "percentage",
  tip_source: "charged_tips",
  source_percentage: 100,
  contributing_role_codes: [],
  receiving_role_codes: [],
  is_active: true,
  effective_date: new Date().toISOString().split("T")[0],
  end_date: null,
  role_shares: [],
};

export function TipPoolDialog({
  open,
  onOpenChange,
  pool,
  roles,
  isLoading,
  onSubmit,
}: TipPoolDialogProps) {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<TipPoolFormData>({ ...defaultFormData });

  useEffect(() => {
    if (!open) return;

    if (pool) {
      // Extract receiving roles from existing role_shares
      const receivingCodes = (pool.tip_pool_role_shares || []).map((s) => s.role_code);
      setFormData({
        name: pool.name,
        description: pool.description || "",
        distribution_method: pool.distribution_method,
        tip_source: pool.tip_source as TipPoolFormData["tip_source"],
        source_percentage: pool.source_percentage,
        contributing_role_codes: pool.contributing_role_codes,
        receiving_role_codes: receivingCodes,
        is_active: pool.is_active,
        effective_date: pool.effective_date,
        end_date: (pool as any).end_date ?? null,
        role_shares: (pool.tip_pool_role_shares || []).map((share) => ({
          role_code: share.role_code,
          share_percentage: share.share_percentage ?? undefined,
          points_per_hour: share.points_per_hour ?? undefined,
        })),
      });
    } else {
      setFormData({
        ...defaultFormData,
        effective_date: new Date().toISOString().split("T")[0],
      });
    }
    setStep(1);
  }, [pool, open]);

  const set = (field: keyof TipPoolFormData, value: any) =>
    setFormData((prev) => ({ ...prev, [field]: value }));

  // --- Contributing role toggle ---
  const toggleContributing = (code: string, checked: boolean) => {
    set(
      "contributing_role_codes",
      checked
        ? [...formData.contributing_role_codes, code]
        : formData.contributing_role_codes.filter((c) => c !== code)
    );
  };

  // --- Receiving role toggle ---
  const toggleReceiving = (code: string, checked: boolean) => {
    const newReceiving = checked
      ? [...formData.receiving_role_codes, code]
      : formData.receiving_role_codes.filter((c) => c !== code);

    // Keep role_shares in sync with receiving_role_codes
    let newShares = formData.role_shares.filter((s) => newReceiving.includes(s.role_code));
    if (checked && !newShares.find((s) => s.role_code === code)) {
      newShares.push({
        role_code: code,
        share_percentage: formData.distribution_method === "percentage" ? 0 : undefined,
        points_per_hour: formData.distribution_method === "points" ? 0 : undefined,
      });
    }

    setFormData((prev) => ({
      ...prev,
      receiving_role_codes: newReceiving,
      role_shares: newShares,
    }));
  };

  const handleShareChange = (
    roleCode: string,
    field: "share_percentage" | "points_per_hour",
    value: number
  ) => {
    setFormData((prev) => ({
      ...prev,
      role_shares: prev.role_shares.map((s) =>
        s.role_code === code ? { ...s, [field]: value } : s
      ),
    }));
  };

  // Fix: use correct variable in handleShareChange
  const updateShare = (
    roleCode: string,
    field: "share_percentage" | "points_per_hour",
    value: number
  ) => {
    setFormData((prev) => ({
      ...prev,
      role_shares: prev.role_shares.map((s) =>
        s.role_code === roleCode ? { ...s, [field]: value } : s
      ),
    }));
  };

  const totalPercentage = formData.role_shares.reduce(
    (sum, s) => sum + (s.share_percentage || 0),
    0
  );

  const canProceed = () => {
    switch (step) {
      case 1:
        return formData.name.trim().length > 0;
      case 2:
        return formData.contributing_role_codes.length > 0;
      case 3:
        return formData.receiving_role_codes.length > 0;
      case 4:
        if (formData.distribution_method === "percentage") {
          return Math.abs(totalPercentage - 100) < 0.01;
        }
        return true;
      default:
        return true;
    }
  };

  const getRoleName = (code: string) => roles.find((r) => r.code === code)?.name || code;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{pool ? "Edit Tip Pool" : "Create Tip Pool"}</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2">
              {/* Step progress */}
              <div className="flex items-center gap-1 pt-1">
                {STEP_LABELS.map((label, i) => {
                  const num = i + 1;
                  const isActive = num === step;
                  const isDone = num < step;
                  return (
                    <div key={num} className="flex items-center gap-1">
                      <div
                        className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold ${
                          isActive
                            ? "bg-teal-500 text-white"
                            : isDone
                            ? "bg-teal-100 text-teal-700"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {num}
                      </div>
                      <span
                        className={`text-xs hidden sm:block ${
                          isActive ? "text-foreground font-medium" : "text-muted-foreground"
                        }`}
                      >
                        {label}
                      </span>
                      {num < TOTAL_STEPS && (
                        <ChevronRight className="w-3 h-3 text-muted-foreground mx-1" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* ──────────── STEP 1: Basic Info ──────────── */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Pool Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="e.g., Front of House Pool, Bar Pool"
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder="Optional description"
                  className="mt-1"
                  rows={2}
                />
              </div>

              <div>
                <Label>Distribution Method *</Label>
                <RadioGroup
                  value={formData.distribution_method}
                  onValueChange={(v) => set("distribution_method", v)}
                  className="mt-2 space-y-2"
                >
                  {[
                    {
                      value: "percentage",
                      label: "Percentage-Based",
                      desc: "Each receiving role gets a fixed % of the pool",
                    },
                    {
                      value: "hours_weighted",
                      label: "Hours Weighted",
                      desc: "Distributed proportionally by hours worked",
                    },
                    {
                      value: "equal_split",
                      label: "Equal Split",
                      desc: "Divided equally among all eligible employees",
                    },
                    {
                      value: "points",
                      label: "Points-Based",
                      desc: "Role points per hour × hours worked",
                    },
                  ].map((opt) => (
                    <div key={opt.value} className="flex items-start gap-2">
                      <RadioGroupItem value={opt.value} id={`method-${opt.value}`} className="mt-0.5" />
                      <Label htmlFor={`method-${opt.value}`} className="font-normal cursor-pointer">
                        <span className="font-medium">{opt.label}</span>
                        <span className="text-muted-foreground"> — {opt.desc}</span>
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              <div>
                <Label>Tip Source *</Label>
                <RadioGroup
                  value={formData.tip_source}
                  onValueChange={(v) => set("tip_source", v)}
                  className="mt-2 space-y-2"
                >
                  {[
                    { value: "charged_tips", label: "Charged Tips Only" },
                    { value: "all_tips", label: "All Tips (charged + cash)" },
                    { value: "cash_only", label: "Cash Tips Only" },
                    { value: "custom_percentage", label: "Custom Percentage of Tips" },
                  ].map((opt) => (
                    <div key={opt.value} className="flex items-center gap-2">
                      <RadioGroupItem value={opt.value} id={`source-${opt.value}`} />
                      <Label htmlFor={`source-${opt.value}`} className="font-normal cursor-pointer">
                        {opt.label}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              <div>
                <Label htmlFor="source-pct">Source Percentage (%)</Label>
                <Input
                  id="source-pct"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={formData.source_percentage}
                  onChange={(e) => set("source_percentage", parseFloat(e.target.value) || 0)}
                  className="mt-1 w-32"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  % of selected tip source that goes into the pool (100 = all)
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="effective-date">Effective Date</Label>
                  <Input
                    id="effective-date"
                    type="date"
                    value={formData.effective_date}
                    min={new Date().toISOString().split("T")[0]}
                    onChange={(e) => {
                      set("effective_date", e.target.value);
                      // Clear end_date if it's now before the new effective date
                      if (formData.end_date && e.target.value >= formData.end_date) {
                        set("end_date", null);
                      }
                    }}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="end-date">End Date</Label>
                  <Input
                    id="end-date"
                    type="date"
                    value={formData.end_date || ""}
                    min={(() => {
                      const today = new Date().toISOString().split("T")[0];
                      const d = new Date(formData.effective_date + "T00:00:00");
                      d.setDate(d.getDate() + 1);
                      const minFromEffective = d.toISOString().split("T")[0];
                      return minFromEffective > today ? minFromEffective : today;
                    })()}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (!val) { set("end_date", null); return; }
                      const today = new Date().toISOString().split("T")[0];
                      if (val < today) return;
                      if (val <= formData.effective_date) return;
                      set("end_date", val);
                    }}
                    className="mt-1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Leave blank = no end date</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => set("is_active", !!checked)}
                />
                <Label htmlFor="active" className="font-normal cursor-pointer">Active</Label>
              </div>
            </div>
          )}

          {/* ──────────── STEP 2: Contributing Roles ──────────── */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <Label className="text-base">Contributing Roles *</Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Select the roles whose tips go <strong>into</strong> this pool.
                  These employees give up a portion of their tips to be pooled.
                </p>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto border rounded-lg p-4">
                {roles.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No roles available</p>
                ) : (
                  roles.map((role) => (
                    <div key={role.code} className="flex items-center gap-2 py-0.5">
                      <Checkbox
                        id={`contrib-${role.code}`}
                        checked={formData.contributing_role_codes.includes(role.code)}
                        onCheckedChange={(checked) => toggleContributing(role.code, !!checked)}
                      />
                      <Label
                        htmlFor={`contrib-${role.code}`}
                        className="font-normal cursor-pointer flex-1"
                      >
                        <span className="font-semibold text-sm">{role.code}</span>
                        <span className="text-muted-foreground ml-2">— {role.name}</span>
                      </Label>
                    </div>
                  ))
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {formData.contributing_role_codes.length} role(s) selected
              </p>
            </div>
          )}

          {/* ──────────── STEP 3: Receiving Roles ──────────── */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <Label className="text-base">Receiving Roles *</Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Select the roles that <strong>receive</strong> money from this pool.
                  These can be different from the contributing roles.
                </p>
              </div>
              {formData.contributing_role_codes.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  <span className="text-xs text-muted-foreground">Contributors:</span>
                  {formData.contributing_role_codes.map((code) => (
                    <Badge key={code} variant="secondary" className="text-xs">
                      {code}
                    </Badge>
                  ))}
                </div>
              )}
              <div className="space-y-2 max-h-64 overflow-y-auto border rounded-lg p-4">
                {roles.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No roles available</p>
                ) : (
                  roles.map((role) => (
                    <div key={role.code} className="flex items-center gap-2 py-0.5">
                      <Checkbox
                        id={`recv-${role.code}`}
                        checked={formData.receiving_role_codes.includes(role.code)}
                        onCheckedChange={(checked) => toggleReceiving(role.code, !!checked)}
                      />
                      <Label
                        htmlFor={`recv-${role.code}`}
                        className="font-normal cursor-pointer flex-1"
                      >
                        <span className="font-semibold text-sm">{role.code}</span>
                        <span className="text-muted-foreground ml-2">— {role.name}</span>
                      </Label>
                    </div>
                  ))
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {formData.receiving_role_codes.length} role(s) selected
              </p>
            </div>
          )}

          {/* ──────────── STEP 4: Share Config ──────────── */}
          {step === 4 && (
            <div className="space-y-4">
              <div>
                <Label className="text-base">Configure Receiving Shares</Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Set how the pooled amount is split among receiving roles.
                </p>
              </div>

              {formData.distribution_method === "percentage" && (
                <Alert
                  variant={Math.abs(totalPercentage - 100) < 0.01 ? "default" : "destructive"}
                >
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Total: {totalPercentage.toFixed(1)}%
                    {Math.abs(totalPercentage - 100) >= 0.01
                      ? " — Must total exactly 100%"
                      : " ✓"}
                  </AlertDescription>
                </Alert>
              )}

              {(formData.distribution_method === "hours_weighted" ||
                formData.distribution_method === "equal_split") && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {formData.distribution_method === "hours_weighted"
                      ? "Tips are distributed proportionally by each employee's hours worked."
                      : "Tips are divided equally among all eligible employees in the receiving roles."}
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-3 max-h-72 overflow-y-auto">
                {formData.role_shares.map((share) => (
                  <Card key={share.role_code} className="p-4">
                    <p className="font-medium mb-3">
                      <span className="font-bold">{share.role_code}</span>
                      <span className="text-muted-foreground ml-2">
                        — {getRoleName(share.role_code)}
                      </span>
                    </p>
                    {formData.distribution_method === "percentage" && (
                      <div className="flex items-center gap-2">
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
                          className="w-24"
                        />
                        <span className="text-muted-foreground">%</span>
                      </div>
                    )}
                    {formData.distribution_method === "points" && (
                      <div className="flex items-center gap-2">
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
                          className="w-24"
                        />
                        <span className="text-muted-foreground text-sm">pts / hr</span>
                      </div>
                    )}
                    {(formData.distribution_method === "hours_weighted" ||
                      formData.distribution_method === "equal_split") && (
                      <p className="text-sm text-muted-foreground">
                        Eligible for{" "}
                        {formData.distribution_method === "hours_weighted"
                          ? "hours-weighted"
                          : "equal"}{" "}
                        distribution
                      </p>
                    )}
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex justify-between pt-4 border-t">
          <div>
            {step > 1 && (
              <Button variant="outline" onClick={() => setStep((s) => s - 1)} disabled={isLoading}>
                <ChevronLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
            )}
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
              Cancel
            </Button>
            {step < TOTAL_STEPS ? (
              <Button
                onClick={() => setStep((s) => s + 1)}
                disabled={!canProceed() || isLoading}
                className="bg-teal-500 hover:bg-teal-600 text-white"
              >
                Next
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button
                onClick={() => onSubmit(formData)}
                disabled={!canProceed() || isLoading}
                className="bg-teal-500 hover:bg-teal-600 text-white"
              >
                {isLoading ? "Saving…" : pool ? "Update Pool" : "Create Pool"}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
