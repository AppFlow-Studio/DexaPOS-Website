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
 * Attribute chips carry no per-value hue. The soft-tint recipe these used
 * (D-11) is superseded by D-12: one neutral `bg-muted/60` pill for every value,
 * with the word carrying the meaning. Ten hues across method, source, and
 * interval turned a pool card into a colour key the reader had to learn.
 *
 * ⚠️ This is a `.ts`-shaped constant block inside a `.tsx`, so its classes are
 * still scanned — but they are also spelled out literally in `AttributeChip`
 * below, which is what actually generates the rule (C7).
 */
const methodConfig: Record<string, { label: string }> = {
  percentage:     { label: "Percentage" },
  hours_weighted: { label: "Hours Weighted" },
  equal_split:    { label: "Equal Split" },
  points:         { label: "Points-Based" },
};

const sourceConfig: Record<string, { label: string }> = {
  charged_tips: { label: "Charged Tips" },
  all_tips:     { label: "All Tips" },
  cash_only:    { label: "Cash Only" },
};

const intervalConfig: Record<string, { label: string }> = {
  full_workday: { label: "Full Workday" },
  by_shift:     { label: "By Shift" },
  order:        { label: "Per Order" },
};

/** A quiet attribute chip. One neutral borderless pill for every value. */
function AttributeChip({ label }: { label: string }) {
  return (
    <span className="inline-flex max-w-full items-center rounded-full border-0 bg-muted/60 px-2.5 py-0.5 text-xs font-medium">
      <span className="truncate">{label}</span>
    </span>
  );
}

export function PoolCard({ pool, roles, poolCount, onEdit, onDelete, onToggle, isToggling }: PoolCardProps) {
  const getRoleName = (code: string) => roles.find((r) => r.code === code)?.name || code;

  const method = methodConfig[pool.distribution_method] ?? { label: pool.distribution_method };
  const source = sourceConfig[pool.tip_source] ?? { label: pool.tip_source };
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
            <AttributeChip label={method.label} />
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
            />
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-[0.8125rem] text-muted-foreground">Interval</p>
          <div className="mt-1.5">
            <AttributeChip label={interval.label} />
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

      {/* Role Shares — an inset well; rows separate by spacing, not rules (§5.5) */}
      {pool.tip_pool_role_shares.length > 0 && (
        <div className="mt-5 min-w-0">
          <p className="text-[0.8125rem] text-muted-foreground">Distribution</p>
          <div className="mt-2 min-w-0 space-y-1 rounded-2xl border-0 bg-muted/60 p-1 shadow-none">
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
      <div className="mt-6 flex gap-2">
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
