import { Trash2, Edit2, ArrowRight, Split } from "lucide-react";
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
  percentage_of_tips:  { label: "% of Tips",   className: "bg-blue-500/10 text-blue-700 dark:bg-blue-400/10 dark:text-blue-300" },
  percentage_of_sales: { label: "% of Sales",  className: "bg-violet-500/10 text-violet-700 dark:bg-violet-400/10 dark:text-violet-300" },
  flat_amount:         { label: "Flat Amount", className: "bg-amber-500/10 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300" },
};

export function RuleCard({ rule, roles, onEdit, onDelete, onToggle, isToggling }: RuleCardProps) {
  const fromRole = roles.find((r) => r.code === rule.from_role_code)?.name || rule.from_role_code;
  const toRole = roles.find((r) => r.code === rule.to_role_code)?.name || rule.to_role_code;

  const type = typeConfig[rule.tip_out_type] ?? {
    label: rule.tip_out_type,
    className: "bg-muted text-muted-foreground",
  };

  const formatValue = () =>
    rule.tip_out_type === "flat_amount"
      ? `$${rule.tip_out_value.toFixed(2)}`
      : `${rule.tip_out_value}%`;

  const valueSuffix = rule.tip_out_type === "flat_amount" ? "per shift" : null;

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col rounded-2xl border bg-card p-5 transition-opacity",
        !rule.is_active && "opacity-60"
      )}
    >
      {/* Identity row */}
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0C4FD1]/10 dark:bg-[#6CA0FF]/10">
            <Split className="h-4 w-4 text-[#0C4FD1] dark:text-[#6CA0FF]" />
          </span>

          {/* From → To. Wraps rather than truncating both halves to nothing. */}
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-2">
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-semibold leading-tight text-foreground">
                {rule.from_role_code}
              </span>
              <span className="truncate text-xs leading-tight text-muted-foreground">{fromRole}</span>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-[#0C4FD1] dark:text-[#6CA0FF]" />
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-semibold leading-tight text-foreground">
                {rule.to_role_code}
              </span>
              <span className="truncate text-xs leading-tight text-muted-foreground">{toRole}</span>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <Switch
            checked={rule.is_active}
            onCheckedChange={(checked) => onToggle(rule.id, checked)}
            disabled={isToggling}
          />
          <span className="text-[0.8125rem] text-muted-foreground">
            {rule.is_active ? "Active" : "Inactive"}
          </span>
        </div>
      </div>

      {/* Type + Amount — the amount is the figure the card exists to state, so
          it carries the stat-figure scale rather than a bolded 14px. */}
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="min-w-0">
          <p className="text-[0.8125rem] text-muted-foreground">Type</p>
          <div className="mt-1.5">
            <span
              className={cn(
                "inline-flex max-w-full items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                type.className
              )}
            >
              <span className="truncate">{type.label}</span>
            </span>
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-[0.8125rem] text-muted-foreground">Amount</p>
          <p className="mt-1 text-[1.75rem] font-medium leading-tight tracking-[-0.02em] tabular-nums">
            {formatValue()}
          </p>
          {valueSuffix && (
            <p className="mt-0.5 text-[0.8125rem] text-muted-foreground">{valueSuffix}</p>
          )}
        </div>
      </div>

      {/* Effective window */}
      <p className="mt-5 text-[0.8125rem] tabular-nums text-muted-foreground">
        Effective {new Date(rule.effective_date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
        {rule.end_date && ` → ${new Date(rule.end_date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`}
      </p>

      {/* Actions */}
      <div className="mt-4 flex gap-2 border-t border-border/60 pt-4">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onEdit(rule)}
          className="h-9 flex-1 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
        >
          <Edit2 className="mr-1.5 h-3.5 w-3.5" />
          Edit
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onDelete(rule)}
          className="h-9 rounded-full px-4 text-[0.8125rem] font-medium text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
          Delete
        </Button>
      </div>
    </div>
  );
}
