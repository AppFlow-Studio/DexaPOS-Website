import { Trash2, Edit2, ArrowRight, Split } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { TipOutRule, Role } from "@/app/dashboard/actions/tips";

interface RuleCardProps {
  rule: TipOutRule;
  roles: Role[];
  onEdit: (rule: TipOutRule) => void;
  onDelete: (rule: TipOutRule) => void;
  onToggle: (ruleId: string, isActive: boolean) => void;
  isToggling?: boolean;
}

const typeConfig: Record<string, { label: string; className: string }> = {
  percentage_of_tips:  { label: "% of Tips",   className: "border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  percentage_of_sales: { label: "% of Sales",  className: "border-violet-500/40 bg-violet-500/10 text-violet-600 dark:text-violet-400" },
  flat_amount:         { label: "Flat Amount",  className: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400" },
};

export function RuleCard({ rule, roles, onEdit, onDelete, onToggle, isToggling }: RuleCardProps) {
  const fromRole = roles.find((r) => r.code === rule.from_role_code)?.name || rule.from_role_code;
  const toRole = roles.find((r) => r.code === rule.to_role_code)?.name || rule.to_role_code;

  const type = typeConfig[rule.tip_out_type] ?? { label: rule.tip_out_type, className: "" };

  const formatValue = () => {
    if (rule.tip_out_type === "flat_amount") return `$${rule.tip_out_value.toFixed(2)} / shift`;
    return `${rule.tip_out_value}%`;
  };

  return (
    <Card
      className={cn(
        "min-w-0 transition-all duration-200 hover:shadow-md",
        !rule.is_active && "opacity-60"
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 min-w-0">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
              <Split className="w-4 h-4 text-primary" />
            </div>
            {/* From → To */}
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <div className="flex flex-col min-w-0">
                <span className="font-semibold text-sm text-foreground leading-tight truncate">{rule.from_role_code}</span>
                <span className="text-xs text-muted-foreground leading-tight truncate">{fromRole}</span>
              </div>
              <ArrowRight className="w-4 h-4 text-primary shrink-0" />
              <div className="flex flex-col min-w-0">
                <span className="font-semibold text-sm text-foreground leading-tight truncate">{rule.to_role_code}</span>
                <span className="text-xs text-muted-foreground leading-tight truncate">{toRole}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge
              variant="outline"
              className={cn(
                "text-xs font-medium",
                rule.is_active
                  ? "border-green-500/50 bg-green-500/10 text-green-600 dark:text-green-400"
                  : "border-gray-400/50 bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
              )}
            >
              {rule.is_active ? "Active" : "Inactive"}
            </Badge>
            <Switch
              checked={rule.is_active}
              onCheckedChange={(checked) => onToggle(rule.id, checked)}
              disabled={isToggling}
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Type + Value */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Type</p>
            <Badge variant="outline" className={cn("text-xs font-medium", type.className)}>
              {type.label}
            </Badge>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Amount</p>
            <p className="text-sm font-bold tabular-nums text-foreground">{formatValue()}</p>
          </div>
        </div>

        {/* Effective Date */}
        <p className="text-xs text-muted-foreground">
          Effective {new Date(rule.effective_date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
          {rule.end_date && ` → ${new Date(rule.end_date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`}
        </p>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <Button size="sm" variant="outline" onClick={() => onEdit(rule)} className="flex-1">
            <Edit2 className="w-3.5 h-3.5 mr-1.5" />
            Edit
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onDelete(rule)}
            className="flex-1 text-destructive hover:text-destructive hover:bg-destructive/10 hover:border-destructive/40"
          >
            <Trash2 className="w-3.5 h-3.5 mr-1.5" />
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
