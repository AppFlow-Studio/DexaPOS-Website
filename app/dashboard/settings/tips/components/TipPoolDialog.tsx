"use client";

import { useState, useEffect } from "react";
import { ChevronRight, ChevronLeft } from "lucide-react";
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
import { AlertCircle } from "lucide-react";
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
  tip_source: "charged_tips" | "all_tips" | "cash_only";
  source_percentage: number;
  contributing_role_codes: string[];
  is_active: boolean;
  effective_date: string;
  role_shares: { role_code: string; share_percentage?: number; points_per_hour?: number }[];
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

  // Reset form when dialog opens/closes or pool changes
  useEffect(() => {
    if (!open) return;

    if (pool) {
      // Editing: populate from pool data
      setFormData({
        name: pool.name,
        description: pool.description || "",
        distribution_method: pool.distribution_method,
        tip_source: pool.tip_source,
        source_percentage: pool.source_percentage,
        contributing_role_codes: pool.contributing_role_codes,
        is_active: pool.is_active,
        effective_date: pool.effective_date,
        role_shares: (pool.tip_pool_role_shares || []).map((share) => ({
          role_code: share.role_code,
          share_percentage: share.share_percentage ?? undefined,
          points_per_hour: share.points_per_hour ?? undefined,
        })),
      });
    } else {
      // Creating: reset to defaults
      setFormData({
        ...defaultFormData,
        effective_date: new Date().toISOString().split("T")[0],
      });
    }
    setStep(1);
  }, [pool, open]);

  const handleStepChange = (direction: number) => {
    setStep(step + direction);
  };

  const handleBasicChange = (field: string, value: any) => {
    setFormData({ ...formData, [field]: value });
  };

  const handleRoleToggle = (roleCode: string, checked: boolean) => {
    const newCodes = checked
      ? [...formData.contributing_role_codes, roleCode]
      : formData.contributing_role_codes.filter((c) => c !== roleCode);

    const newShares = formData.role_shares.filter((s) =>
      newCodes.includes(s.role_code)
    );

    if (checked) {
      newShares.push({
        role_code: roleCode,
        share_percentage:
          formData.distribution_method === "percentage" ? 0 : undefined,
        points_per_hour:
          formData.distribution_method === "points" ? 0 : undefined,
      });
    }

    setFormData({
      ...formData,
      contributing_role_codes: newCodes,
      role_shares: newShares,
    });
  };

  const handleShareChange = (
    roleCode: string,
    field: "share_percentage" | "points_per_hour",
    value: number
  ) => {
    const newShares = formData.role_shares.map((s) =>
      s.role_code === roleCode ? { ...s, [field]: value } : s
    );
    setFormData({ ...formData, role_shares: newShares });
  };

  const totalPercentage = formData.role_shares.reduce(
    (sum, s) => sum + (s.share_percentage || 0),
    0
  );

  const handleSubmit = () => {
    if (step === 3) {
      onSubmit(formData);
    }
  };

  const canProceed = () => {
    if (step === 1) {
      return formData.name.trim().length > 0;
    }
    if (step === 2) {
      return formData.contributing_role_codes.length > 0;
    }
    return true;
  };

  const getRoleName = (code: string) => {
    return roles.find((r) => r.code === code)?.name || code;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {pool ? "Edit Tip Pool" : "Create Tip Pool"} - Step {step} of 3
          </DialogTitle>
          <DialogDescription>
            {step === 1 &&
              "Configure the basic settings for this tip pool"}
            {step === 2 &&
              "Select which roles contribute to this pool"}
            {step === 3 && "Set the tip distribution shares for each role"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* STEP 1: BASIC INFO */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Pool Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) =>
                    handleBasicChange("name", e.target.value)
                  }
                  placeholder="e.g., Server Pool, Busser Pool"
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) =>
                    handleBasicChange("description", e.target.value)
                  }
                  placeholder="Optional description of the pool"
                  className="mt-1"
                />
              </div>

              <div>
                <Label>Distribution Method *</Label>
                <RadioGroup
                  value={formData.distribution_method}
                  onValueChange={(value) =>
                    handleBasicChange("distribution_method", value)
                  }
                  className="mt-2 space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem
                      value="percentage"
                      id="method-percentage"
                    />
                    <Label htmlFor="method-percentage" className="font-normal">
                      Percentage-Based — Each role gets a fixed % of the pool
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem
                      value="hours_weighted"
                      id="method-hours"
                    />
                    <Label htmlFor="method-hours" className="font-normal">
                      Hours Weighted — Distributed proportionally by hours worked
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem
                      value="equal_split"
                      id="method-equal"
                    />
                    <Label htmlFor="method-equal" className="font-normal">
                      Equal Split — Divided equally among all eligible employees
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="points" id="method-points" />
                    <Label htmlFor="method-points" className="font-normal">
                      Points-Based — Role points per hour × hours worked
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              <div>
                <Label>Tip Source *</Label>
                <RadioGroup
                  value={formData.tip_source}
                  onValueChange={(value) =>
                    handleBasicChange("tip_source", value)
                  }
                  className="mt-2 space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem
                      value="charged_tips"
                      id="source-charged"
                    />
                    <Label htmlFor="source-charged" className="font-normal">
                      Charged Tips Only
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="all_tips" id="source-all" />
                    <Label htmlFor="source-all" className="font-normal">
                      All Tips (charged + cash)
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="cash_only" id="source-cash" />
                    <Label htmlFor="source-cash" className="font-normal">
                      Cash Tips Only
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              <div>
                <Label htmlFor="source-pct">Source Percentage</Label>
                <Input
                  id="source-pct"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={formData.source_percentage}
                  onChange={(e) =>
                    handleBasicChange(
                      "source_percentage",
                      parseFloat(e.target.value) || 0
                    )
                  }
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  What percentage of the selected tip source goes into the pool (100% = all)
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) =>
                    handleBasicChange("is_active", checked)
                  }
                />
                <Label htmlFor="active" className="font-normal">
                  Active
                </Label>
              </div>

              <div>
                <Label htmlFor="effective-date">Effective Date</Label>
                <Input
                  id="effective-date"
                  type="date"
                  value={formData.effective_date}
                  onChange={(e) =>
                    handleBasicChange("effective_date", e.target.value)
                  }
                  className="mt-1"
                />
              </div>
            </div>
          )}

          {/* STEP 2: CONTRIBUTING ROLES */}
          {step === 2 && (
            <div className="space-y-4">
              <Label>Select Contributing Roles *</Label>
              <p className="text-sm text-muted-foreground">
                These roles will contribute their tips into the pool
              </p>
              <div className="space-y-2 max-h-64 overflow-y-auto border rounded-lg p-4">
                {roles.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No roles available</p>
                ) : (
                  roles.map((role) => (
                    <div key={role.code} className="flex items-center gap-2">
                      <Checkbox
                        id={`role-${role.code}`}
                        checked={formData.contributing_role_codes.includes(
                          role.code
                        )}
                        onCheckedChange={(checked) =>
                          handleRoleToggle(role.code, !!checked)
                        }
                      />
                      <Label
                        htmlFor={`role-${role.code}`}
                        className="font-normal cursor-pointer flex-1"
                      >
                        <span className="font-semibold text-sm">{role.code}</span>
                        <span className="text-muted-foreground ml-2">- {role.name}</span>
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

          {/* STEP 3: ROLE SHARES */}
          {step === 3 && (
            <div className="space-y-4">
              <Label>Configure Role Shares</Label>

              {formData.distribution_method === "percentage" && (
                <Alert variant={Math.abs(totalPercentage - 100) < 0.01 ? "default" : "destructive"}>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Total: {totalPercentage.toFixed(1)}%
                    {Math.abs(totalPercentage - 100) >= 0.01 && " — Must total 100% for correct distribution"}
                    {Math.abs(totalPercentage - 100) < 0.01 && " ✓"}
                  </AlertDescription>
                </Alert>
              )}

              {["hours_weighted", "equal_split"].includes(formData.distribution_method) && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {formData.distribution_method === "hours_weighted"
                      ? "Tips will be distributed proportionally based on each employee's hours worked"
                      : "Tips will be divided equally among all eligible employees"}
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-3 max-h-64 overflow-y-auto">
                {formData.role_shares.map((share) => (
                  <Card key={share.role_code} className="p-4">
                    <p className="font-medium mb-2">
                      <span className="font-bold">{share.role_code}</span>
                      <span className="text-muted-foreground ml-2">— {getRoleName(share.role_code)}</span>
                    </p>
                    {formData.distribution_method === "percentage" && (
                      <div>
                        <Label htmlFor={`share-${share.role_code}`} className="text-sm">
                          Share Percentage
                        </Label>
                        <div className="flex items-center gap-2 mt-1">
                          <Input
                            id={`share-${share.role_code}`}
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={share.share_percentage ?? ""}
                            onChange={(e) =>
                              handleShareChange(
                                share.role_code,
                                "share_percentage",
                                parseFloat(e.target.value) || 0
                              )
                            }
                          />
                          <span className="text-muted-foreground">%</span>
                        </div>
                      </div>
                    )}
                    {formData.distribution_method === "points" && (
                      <div>
                        <Label htmlFor={`share-${share.role_code}`} className="text-sm">
                          Points per Hour
                        </Label>
                        <Input
                          id={`share-${share.role_code}`}
                          type="number"
                          min="0"
                          step="0.01"
                          value={share.points_per_hour ?? ""}
                          onChange={(e) =>
                            handleShareChange(
                              share.role_code,
                              "points_per_hour",
                              parseFloat(e.target.value) || 0
                            )
                          }
                          className="mt-1"
                        />
                      </div>
                    )}
                    {["hours_weighted", "equal_split"].includes(
                      formData.distribution_method
                    ) && (
                      <p className="text-sm text-muted-foreground mt-1">
                        Eligible for {formData.distribution_method === "hours_weighted" ? "hours-weighted" : "equal"} distribution
                      </p>
                    )}
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex justify-between">
          <div>
            {step > 1 && (
              <Button
                variant="outline"
                onClick={() => handleStepChange(-1)}
                disabled={isLoading}
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
            )}
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            {step < 3 ? (
              <Button
                onClick={() => handleStepChange(1)}
                disabled={!canProceed() || isLoading}
              >
                Next
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={!canProceed() || isLoading}
              >
                {isLoading ? "Saving..." : pool ? "Update Pool" : "Create Pool"}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
