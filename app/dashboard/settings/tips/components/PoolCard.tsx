import { Trash2, Edit2, Users, Percent } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { TipPoolConfigWithShares, Role } from "@/app/dashboard/actions/tips";

interface PoolCardProps {
  pool: TipPoolConfigWithShares;
  roles: Role[];
  onEdit: (pool: TipPoolConfigWithShares) => void;
  onDelete: (pool: TipPoolConfigWithShares) => void;
  onToggle: (poolId: string, isActive: boolean) => void;
  isToggling?: boolean;
}

const methodConfig: Record<string, { label: string; className: string }> = {
  percentage:     { label: "Percentage",     className: "border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  hours_weighted: { label: "Hours Weighted", className: "border-violet-500/40 bg-violet-500/10 text-violet-600 dark:text-violet-400" },
  equal_split:    { label: "Equal Split",    className: "border-teal-500/40 bg-teal-500/10 text-teal-600 dark:text-teal-400" },
  points:         { label: "Points-Based",   className: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400" },
};

const sourceConfig: Record<string, { label: string; className: string }> = {
  charged_tips:      { label: "Charged Tips",       className: "border-green-500/40 bg-green-500/10 text-green-600 dark:text-green-400" },
  all_tips:          { label: "All Tips",            className: "border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  cash_only:         { label: "Cash Only",           className: "border-gray-400/40 bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400" },
  custom_percentage: { label: "Custom %",            className: "border-purple-500/40 bg-purple-500/10 text-purple-600 dark:text-purple-400" },
};

export function PoolCard({ pool, roles, onEdit, onDelete, onToggle, isToggling }: PoolCardProps) {
  const getRoleName = (code: string) => roles.find((r) => r.code === code)?.name || code;

  const method = methodConfig[pool.distribution_method] ?? { label: pool.distribution_method, className: "" };
  const source = sourceConfig[pool.tip_source] ?? { label: pool.tip_source, className: "" };

  return (
    <Card
      className={cn(
        "transition-all duration-200 hover:shadow-md",
        !pool.is_active && "opacity-60"
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
              <Percent className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground leading-tight truncate">{pool.name}</p>
              {pool.description && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{pool.description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge
              variant="outline"
              className={cn(
                "text-xs font-medium",
                pool.is_active
                  ? "border-green-500/50 bg-green-500/10 text-green-600 dark:text-green-400"
                  : "border-gray-400/50 bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
              )}
            >
              {pool.is_active ? "Active" : "Inactive"}
            </Badge>
            <Switch
              checked={pool.is_active}
              onCheckedChange={(checked) => onToggle(pool.id, checked)}
              disabled={isToggling}
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Method + Source */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Method</p>
            <Badge variant="outline" className={cn("text-xs font-medium", method.className)}>
              {method.label}
            </Badge>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Source</p>
            <Badge variant="outline" className={cn("text-xs font-medium", source.className)}>
              {source.label}
              {pool.source_percentage < 100 && ` (${pool.source_percentage}%)`}
            </Badge>
          </div>
        </div>

        {/* Contributing Roles */}
        {pool.contributing_role_codes.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-muted-foreground" />
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Contributors</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {pool.contributing_role_codes.map((code) => (
                <Badge
                  key={code}
                  variant="secondary"
                  className="text-xs border border-border/60"
                >
                  {code}
                  <span className="ml-1 text-muted-foreground font-normal">· {getRoleName(code)}</span>
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Role Shares */}
        {pool.tip_pool_role_shares.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Distribution</p>
            <div className="rounded-lg border bg-muted/30 divide-y divide-border/50">
              {pool.tip_pool_role_shares.map((share) => (
                <div key={share.role_code} className="flex items-center justify-between px-3 py-1.5">
                  <div className="flex items-center gap-1.5 text-sm">
                    <span className="font-medium text-foreground">{share.role_code}</span>
                    <span className="text-muted-foreground text-xs">· {getRoleName(share.role_code)}</span>
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-foreground">
                    {share.share_percentage !== null
                      ? `${share.share_percentage}%`
                      : `${share.points_per_hour} pts/hr`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Effective Date */}
        <p className="text-xs text-muted-foreground">
          Effective {new Date(pool.effective_date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
          {pool.end_date && ` → ${new Date(pool.end_date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`}
        </p>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <Button size="sm" variant="outline" onClick={() => onEdit(pool)} className="flex-1">
            <Edit2 className="w-3.5 h-3.5 mr-1.5" />
            Edit
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onDelete(pool)}
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
