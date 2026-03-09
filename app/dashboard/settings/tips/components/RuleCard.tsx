import { Trash2, Edit2, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { TipOutRule, Role } from "@/app/dashboard/actions/tips";

interface RuleCardProps {
  rule: TipOutRule;
  roles: Role[];
  onEdit: (rule: TipOutRule) => void;
  onDelete: (rule: TipOutRule) => void;
}

const typeLabels: Record<string, string> = {
  percentage_of_tips: "% of Tips",
  percentage_of_sales: "% of Sales",
  flat_amount: "Flat Amount",
};

export function RuleCard({ rule, roles, onEdit, onDelete }: RuleCardProps) {
  const fromRole = roles.find((r) => r.code === rule.from_role_code)?.name || rule.from_role_code;
  const toRole = roles.find((r) => r.code === rule.to_role_code)?.name || rule.to_role_code;

  const formatValue = () => {
    if (rule.tip_out_type === "flat_amount") {
      return `$${rule.tip_out_value.toFixed(2)}`;
    }
    return `${rule.tip_out_value}%`;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap gap-y-2">
          <div className="flex items-center gap-2 flex-1">
            <div className="flex items-center gap-1 text-sm">
              <span className="font-semibold text-foreground">{rule.from_role_code}</span>
              <span className="text-xs text-muted-foreground">({fromRole})</span>
            </div>
            <ArrowRight className="w-4 h-4 text-muted-foreground" />
            <div className="flex items-center gap-1 text-sm">
              <span className="font-semibold text-foreground">{rule.to_role_code}</span>
              <span className="text-xs text-muted-foreground">({toRole})</span>
            </div>
          </div>
          {!rule.is_active && <Badge variant="outline">Inactive</Badge>}
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

        <div className="p-2 bg-muted/50 rounded text-sm text-muted-foreground">
          Effective: {new Date(rule.effective_date).toLocaleDateString()}
          {rule.end_date && ` to ${new Date(rule.end_date).toLocaleDateString()}`}
        </div>

        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onEdit(rule)}
            className="flex-1"
          >
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
