import { Trash2, Edit2, Users, Percent } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { TipPoolConfigWithShares, Role } from "@/app/dashboard/actions/tips";

interface PoolCardProps {
  pool: TipPoolConfigWithShares;
  roles: Role[];
  poolCount: number;
  onEdit: (pool: TipPoolConfigWithShares) => void;
  onDelete: (pool: TipPoolConfigWithShares) => void;
  onToggle: (poolId: string, isActive: boolean) => void;
  isToggling?: boolean;
}

/**
 * Attribute chips use the soft-tint recipe (DS-CTL-09): a translucent fill of
 * the same hue as the text, so the chip reads in both themes. The previous
 * `bg-blue-500/10 border-blue-500/40` pairs added a second competing border
 * beside the panel edge, and `bg-gray-100` had no dark variant at all.
 */
const methodConfig: Record<string, { label: string; className: string }> = {
  percentage:     { label: "Percentage",     className: "bg-blue-500/10 text-blue-700 dark:bg-blue-400/10 dark:text-blue-300" },
  hours_weighted: { label: "Hours Weighted", className: "bg-violet-500/10 text-violet-700 dark:bg-violet-400/10 dark:text-violet-300" },
  equal_split:    { label: "Equal Split",    className: "bg-teal-500/10 text-teal-700 dark:bg-teal-400/10 dark:text-teal-300" },
  points:         { label: "Points-Based",   className: "bg-amber-500/10 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300" },
};

const sourceConfig: Record<string, { label: string; className: string }> = {
  charged_tips: { label: "Charged Tips", className: "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300" },
  all_tips:     { label: "All Tips",     className: "bg-blue-500/10 text-blue-700 dark:bg-blue-400/10 dark:text-blue-300" },
  cash_only:    { label: "Cash Only",    className: "bg-slate-500/10 text-slate-700 dark:bg-slate-400/10 dark:text-slate-300" },
};

const intervalConfig: Record<string, { label: string; className: string }> = {
  full_workday: { label: "Full Workday", className: "bg-indigo-500/10 text-indigo-700 dark:bg-indigo-400/10 dark:text-indigo-300" },
  by_shift:     { label: "By Shift",     className: "bg-purple-500/10 text-purple-700 dark:bg-purple-400/10 dark:text-purple-300" },
  order:        { label: "Per Order",    className: "bg-pink-500/10 text-pink-700 dark:bg-pink-400/10 dark:text-pink-300" },
};

/** A quiet attribute chip. Borderless tint, never a bordered outline badge. */
function AttributeChip({ label, className }: { label: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        className
      )}
    >
      <span className="truncate">{label}</span>
    </span>
  );
}

export function PoolCard({ pool, roles, poolCount, onEdit, onDelete, onToggle, isToggling }: PoolCardProps) {
  const getRoleName = (code: string) => roles.find((r) => r.code === code)?.name || code;

  const method = methodConfig[pool.distribution_method] ?? { label: pool.distribution_method, className: "bg-muted text-muted-foreground" };
  const source = sourceConfig[pool.tip_source] ?? { label: pool.tip_source, className: "bg-muted text-muted-foreground" };
  const interval = intervalConfig[(pool as any).policy_interval] ?? intervalConfig.full_workday;
  const priority = (pool as any).priority ?? 100;
  const showPriority = poolCount >= 2 || priority !== 100;

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col rounded-2xl border bg-card p-5 transition-opacity",
        !pool.is_active && "opacity-60"
      )}
    >
      {/* Identity row */}
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0C4FD1]/10 dark:bg-[#6CA0FF]/10">
            <Percent className="h-4 w-4 text-[#0C4FD1] dark:text-[#6CA0FF]" />
          </span>
          <div className="min-w-0 flex-1">
            {/* flex-1 spacer + wrap, not truncate: a name-plus-badge row
                collapses the badge off-screen at 320px otherwise. */}
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <p className="min-w-0 flex-1 truncate font-semibold leading-tight text-foreground">
                {pool.name}
              </p>
              {showPriority && (
                <span className="shrink-0 rounded-full bg-muted/60 px-2 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
                  #{priority}
                </span>
              )}
            </div>
            {pool.description && (
              <p className="mt-1 line-clamp-2 text-[0.8125rem] text-muted-foreground">
                {pool.description}
              </p>
            )}
          </div>
        </div>

        {/* The switch is the control; a second "Active" badge beside it says
            the same thing twice. The label below the switch carries state. */}
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Switch
            checked={pool.is_active}
            onCheckedChange={(checked) => onToggle(pool.id, checked)}
            disabled={isToggling}
          />
          <span className="text-[0.8125rem] text-muted-foreground">
            {pool.is_active ? "Active" : "Inactive"}
          </span>
        </div>
      </div>

      {/* Method + Source + Interval — stacked labels rather than a 3-col grid,
          which crushed the chips below ~360px. */}
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="min-w-0">
          <p className="text-[0.8125rem] text-muted-foreground">Method</p>
          <div className="mt-1.5">
            <AttributeChip label={method.label} className={method.className} />
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-[0.8125rem] text-muted-foreground">Source</p>
          <div className="mt-1.5">
            <AttributeChip
              label={
                pool.source_percentage < 100
                  ? `${source.label} (${pool.source_percentage}%)`
                  : source.label
              }
              className={source.className}
            />
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-[0.8125rem] text-muted-foreground">Interval</p>
          <div className="mt-1.5">
            <AttributeChip label={interval.label} className={interval.className} />
          </div>
        </div>
      </div>

      {/* Contributing Roles */}
      {pool.contributing_role_codes.length > 0 && (
        <div className="mt-5 min-w-0">
          <div className="flex items-center gap-1.5">
            <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="text-[0.8125rem] text-muted-foreground">Contributors</p>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {pool.contributing_role_codes.map((code) => (
              <span
                key={code}
                className="inline-flex max-w-full items-center rounded-full bg-muted/60 px-2.5 py-0.5 text-xs"
              >
                <span className="truncate">
                  <span className="font-medium">{code}</span>
                  <span className="ml-1 text-muted-foreground">· {getRoleName(code)}</span>
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Role Shares — an inset well, hairline-separated rows */}
      {pool.tip_pool_role_shares.length > 0 && (
        <div className="mt-5 min-w-0">
          <p className="text-[0.8125rem] text-muted-foreground">Distribution</p>
          <div className="mt-2 divide-y divide-border/60 rounded-2xl border-0 bg-muted/60 shadow-none">
            {pool.tip_pool_role_shares.map((share) => (
              <div
                key={share.role_code}
                className="flex min-w-0 items-center justify-between gap-3 px-3 py-2"
              >
                <div className="flex min-w-0 items-baseline gap-1.5 text-sm">
                  <span className="shrink-0 font-medium text-foreground">{share.role_code}</span>
                  <span className="truncate text-[0.8125rem] text-muted-foreground">
                    · {getRoleName(share.role_code)}
                  </span>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                  {share.share_percentage !== null
                    ? `${share.share_percentage}%`
                    : share.points_per_hour !== null
                    ? `${share.points_per_hour} pts/hr`
                    : "Eligible"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Effective window — pushed to the bottom so cards in a row align */}
      <p className="mt-5 text-[0.8125rem] tabular-nums text-muted-foreground">
        Effective {new Date(pool.effective_date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
        {pool.end_date && ` → ${new Date(pool.end_date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`}
      </p>

      {/* Actions */}
      <div className="mt-4 flex gap-2 border-t border-border/60 pt-4">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onEdit(pool)}
          className="h-9 flex-1 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
        >
          <Edit2 className="mr-1.5 h-3.5 w-3.5" />
          Edit
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onDelete(pool)}
          className="h-9 rounded-full px-4 text-[0.8125rem] font-medium text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
          Delete
        </Button>
      </div>
    </div>
  );
}
