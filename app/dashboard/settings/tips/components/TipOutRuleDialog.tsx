"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { DatePopover } from "./DatePopover";
import type { TipOutRule, Role } from "@/app/dashboard/actions/tips";

interface TipOutRuleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule?: TipOutRule | null;
  roles: Role[];
  existingRules: TipOutRule[];
  clerkOrgId: string | undefined;
  isLoading?: boolean;
  onSubmit: (data: TipOutRuleFormData) => void;
  onDeactivateRule?: (ruleId: string) => void;
}

export interface TipOutRuleFormData {
  from_role_code: string;
  to_role_code: string;
  tip_out_type: "percentage_of_tips" | "percentage_of_sales" | "flat_amount";
  tip_out_value: number;
  is_active: boolean;
  effective_date: string;
  end_date: string | null;
}

const defaultFormData: TipOutRuleFormData = {
  from_role_code: "",
  to_role_code: "",
  tip_out_type: "percentage_of_sales",
  tip_out_value: 0,
  is_active: true,
  effective_date: new Date().toISOString().split("T")[0],
  end_date: null,
};

export function TipOutRuleDialog({
  open,
  onOpenChange,
  rule,
  roles,
  existingRules,
  clerkOrgId,
  isLoading,
  onSubmit,
  onDeactivateRule,
}: TipOutRuleDialogProps) {
  const [formData, setFormData] = useState<TipOutRuleFormData>({ ...defaultFormData });

  // Reset form when dialog opens/closes or rule changes
  useEffect(() => {
    if (!open) return;

    if (rule) {
      setFormData({
        from_role_code: rule.from_role_code,
        to_role_code: rule.to_role_code,
        tip_out_type: rule.tip_out_type,
        tip_out_value: rule.tip_out_value,
        is_active: rule.is_active,
        effective_date: rule.effective_date,
        end_date: rule.end_date ?? null,
      });
    } else {
      setFormData({
        ...defaultFormData,
        effective_date: new Date().toISOString().split("T")[0],
        end_date: null,
      });
    }
  }, [rule, open]);

  // ─── Reciprocity check (client-side) ──────────────────────
  const conflictingRule = useMemo(() => {
    if (!formData.from_role_code || !formData.to_role_code) return null;
    if (formData.from_role_code === formData.to_role_code) return null;

    return existingRules.find(
      (r) =>
        r.from_role_code === formData.to_role_code &&
        r.to_role_code === formData.from_role_code &&
        r.is_active &&
        // When editing, exclude the rule being edited
        (!rule || r.id !== rule.id)
    ) ?? null;
  }, [formData.from_role_code, formData.to_role_code, existingRules, rule]);

  const isValid = () => {
    if (!formData.from_role_code || !formData.to_role_code) return false;
    if (formData.from_role_code === formData.to_role_code) return false;
    if (formData.tip_out_value <= 0) return false;
    if (
      formData.tip_out_type !== "flat_amount" &&
      formData.tip_out_value > 100
    )
      return false;
    // Block submit if reciprocal conflict exists
    if (conflictingRule) return false;
    return true;
  };

  const handleChange = (field: string, value: any) => {
    setFormData({ ...formData, [field]: value });
  };

  const handleSubmit = () => {
    if (isValid()) {
      onSubmit(formData);
    }
  };

  const handleDeactivateConflicting = () => {
    if (conflictingRule && onDeactivateRule) {
      onDeactivateRule(conflictingRule.id);
      toast.success(
        `Deactivated rule: ${conflictingRule.from_role_code} → ${conflictingRule.to_role_code}`
      );
    }
  };

  const getRoleName = (code: string) => roles.find((r) => r.code === code)?.name || code;

  const formatRuleValue = (r: TipOutRule) => {
    if (r.tip_out_type === "flat_amount") return `$${r.tip_out_value}`;
    return `${r.tip_out_value}%`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] grid-cols-[minmax(0,1fr)] overflow-x-hidden overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {rule ? "Edit Tip-Out Rule" : "Create Tip-Out Rule"}
          </DialogTitle>
          <DialogDescription>
            Define how tips are distributed between roles
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <Label htmlFor="from-role">From Role *</Label>
            <Select
              value={formData.from_role_code}
              onValueChange={(value) =>
                handleChange("from_role_code", value)
              }
            >
              <SelectTrigger id="from-role" className="mt-1 w-full min-w-0">
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                {roles.map((role) => (
                  <SelectItem
                    key={role.code}
                    value={role.code}
                    disabled={role.code === formData.to_role_code}
                  >
                    <span className="font-semibold">{role.code}</span>
                    <span className="text-muted-foreground ml-2">- {role.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="to-role">To Role *</Label>
            <Select
              value={formData.to_role_code}
              onValueChange={(value) =>
                handleChange("to_role_code", value)
              }
            >
              <SelectTrigger id="to-role" className="mt-1 w-full min-w-0">
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                {roles.map((role) => (
                  <SelectItem
                    key={role.code}
                    value={role.code}
                    disabled={role.code === formData.from_role_code}
                  >
                    <span className="font-semibold">{role.code}</span>
                    <span className="text-muted-foreground ml-2">- {role.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {formData.from_role_code === formData.to_role_code &&
            formData.from_role_code && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  From and To roles must be different
                </AlertDescription>
              </Alert>
            )}

          {/* ─── Reciprocity warning ─── */}
          {conflictingRule && (
            <Alert className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800 dark:text-amber-200">
                <p className="text-sm">
                  A rule already exists sending tips the other direction:{" "}
                  <strong>
                    {getRoleName(conflictingRule.from_role_code)} → {getRoleName(conflictingRule.to_role_code)}
                  </strong>{" "}
                  at {formatRuleValue(conflictingRule)}.
                  Creating this rule would create a circular flow and double-charge both roles.
                  Deactivate the existing rule first.
                </p>
                {onDeactivateRule && (
                  <Button
                    variant="link"
                    size="sm"
                    onClick={handleDeactivateConflicting}
                    className="text-amber-700 dark:text-amber-300 underline p-0 h-auto mt-1"
                  >
                    Deactivate existing rule
                  </Button>
                )}
              </AlertDescription>
            </Alert>
          )}

          <div>
            <Label>Tip-Out Type *</Label>
            <RadioGroup
              value={formData.tip_out_type}
              onValueChange={(value) =>
                handleChange("tip_out_type", value)
              }
              className="mt-2 space-y-2"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem
                  value="percentage_of_tips"
                  id="type-tips"
                />
                <Label htmlFor="type-tips" className="font-normal">
                  Percentage of Tips — % of each giver&apos;s total tips
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem
                  value="percentage_of_sales"
                  id="type-sales"
                />
                <Label htmlFor="type-sales" className="font-normal">
                  Percentage of Sales — % of each giver&apos;s gross sales
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem
                  value="flat_amount"
                  id="type-flat"
                />
                <Label htmlFor="type-flat" className="font-normal">
                  Flat Amount — Fixed $ amount per giver per shift
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div>
            <Label htmlFor="value">
              Value {formData.tip_out_type === "flat_amount" ? "($)" : "(%)"}
              {" "}*
            </Label>
            <Input
              id="value"
              type="number"
              min="0"
              max={formData.tip_out_type === "flat_amount" ? undefined : 100}
              step="0.01"
              value={formData.tip_out_value || ""}
              onChange={(e) =>
                handleChange("tip_out_value", parseFloat(e.target.value) || 0)
              }
              placeholder={formData.tip_out_type === "flat_amount" ? "0.00" : "0"}
              className="mt-1"
            />
            {formData.tip_out_type !== "flat_amount" && (
              <p className="text-xs text-muted-foreground mt-1">
                Must be between 0 and 100
              </p>
            )}
            {formData.tip_out_type === "flat_amount" && (
              <p className="text-xs text-muted-foreground mt-1">
                Amount in dollars (e.g., 5.00 = $5 per giver per shift)
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="min-w-0">
              <Label htmlFor="effective-date">Effective Date</Label>
              <div className="mt-1">
                <DatePopover
                  id="effective-date"
                  value={formData.effective_date}
                  onChange={(v) => {
                    handleChange("effective_date", v ?? "");
                    if (v && formData.end_date && v >= formData.end_date) {
                      handleChange("end_date", null);
                    }
                  }}
                />
              </div>
            </div>
            <div className="min-w-0">
              <Label htmlFor="end-date">End Date</Label>
              <div className="mt-1">
                <DatePopover
                  id="end-date"
                  value={formData.end_date || ""}
                  min={formData.effective_date}
                  placeholder="No end date"
                  onChange={(v) => handleChange("end_date", v)}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">Leave blank = no end date</p>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="rule-active">Active</Label>
            <Switch
              id="rule-active"
              checked={formData.is_active}
              onCheckedChange={(checked) =>
                handleChange("is_active", checked)
              }
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!isValid() || isLoading}
            className="bg-teal-500 hover:bg-teal-600 text-white"
          >
            {isLoading ? "Saving..." : rule ? "Update Rule" : "Create Rule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
