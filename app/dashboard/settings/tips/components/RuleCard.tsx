import { Trash2, Edit2, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { TipOutRule, Role } from "@/app/dashboard/actions/tips";

interface RuleCardProps {
  rule: TipOutRule;
  roles: Role[];
  onEdit: (rule: TipOutRule) => void;
  onDelete: (rule: TipOutRule) => void;
  onToggle: (ruleId: string, isActive: boolean) => void;
  isToggling?: boolean;
}

const typeLabels: Record<string, string> = {
  percentage_of_tips: "% of Tips",
  percentage_of_sales: "% of Sales",
  flat_amount: "Flat Amount",
};

export function RuleCard({ rule, roles, onEdit, onDelete, onToggle, isToggling }: RuleCardProps) {
  const fromRole = roles.find((r) => r.code === rule.from_role_code)?.name || rule.from_role_code;
  const toRole = roles.find((r) => r.code === rule.to_role_code)?.name || rule.to_role_code;

  const formatValue = () => {
    if (rule.tip_out_type === "flat_amount") return `$${rule.tip_out_value.toFixed(2)}`;
    return `${rule.tip_out_value}%`;
  };

  return (
    <Card className={rule.is_active ? "" : "opacity-60"}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 flex-wrap">
            <div className="flex items-center gap-1 text-sm">
              <span className="font-semibold text-foreground">{rule.from_role_code}</span>
              <span className="text-xs text-muted-foreground">({fromRole})</span>
            </div>
            <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
            <div className="flex items-center gap-1 text-sm">
              <span className="font-semibold text-foreground">{rule.to_role_code}</span>
              <span className="text-xs text-muted-foreground">({toRole})</span>
            </div>
          </div>
          <Switch
            checked={rule.is_active}
            onCheckedChange={(checked) => onToggle(rule.id, checked)}
            disabled={isToggling}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Type</p>
            <p className="text-base font-semibold mt-1">{typeLabels[rule.tip_out_type]}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Amount</p>
            <p className="text-base font-semibold mt-1">{formatValue()}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground bg-muted/50 rounded p-2">
          <span>Effective: {new Date(rule.effective_date + "T00:00:00").toLocaleDateString()}</span>
          {rule.end_date && (
            <span>Ends: {new Date(rule.end_date + "T00:00:00").toLocaleDateString()}</span>
          )}
          {!rule.is_active && (
            <Badge variant="outline" className="text-xs px-1.5 py-0 border-amber-300 text-amber-700 bg-amber-50">
              Inactive
            </Badge>
          )}
        </div>

        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => onEdit(rule)} className="flex-1">
            <Edit2 className="w-4 h-4 mr-1" />
            Edit
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onDelete(rule)}
            className="flex-1 text-destructive hover:text-destructive"
          >
            <Trash2 className="w-4 h-4 mr-1" />
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
