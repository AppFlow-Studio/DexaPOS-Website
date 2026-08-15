"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Settings, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { Panel } from "@/components/dashboard/shell";
import Link from "next/link";
import {
  useTipPoolConfigs,
  useTipOutRules,
} from "@/app/dashboard/settings/tips/hooks/useTipSettings";

interface ConfigSummaryPanelProps {
  clerkOrgId: string | undefined;
  locationId: string | undefined;
}

export function ConfigSummaryPanel({
  clerkOrgId,
  locationId,
}: ConfigSummaryPanelProps) {
  const [open, setOpen] = useState(false);

  const { data: pools = [] } = useTipPoolConfigs(clerkOrgId, locationId);
  const { data: rules = [] } = useTipOutRules(clerkOrgId, locationId);

  const today = new Date().toISOString().split("T")[0];
  const activePools = pools.filter(
    (p) =>
      p.is_active &&
      p.effective_date <= today &&
      (!(p as any).end_date || (p as any).end_date >= today)
  );
  const activeRules = rules.filter(
    (r) =>
      r.is_active &&
      r.effective_date <= today &&
      (!r.end_date || r.end_date >= today)
  );

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Panel>
        <CollapsibleTrigger asChild>
          <button className="flex w-full min-w-0 items-center justify-between gap-3 rounded-3xl px-4 py-4 text-left transition-colors hover:bg-muted/30 sm:px-6">
            <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <span className="flex items-center gap-2 text-[1.0625rem] font-semibold text-[#0C4FD1] dark:text-[#6CA0FF]">
                <Settings className="h-[1.125rem] w-[1.125rem] shrink-0" />
                Active Tip Configuration
              </span>
              <span className="shrink-0 rounded-full bg-muted/60 px-2.5 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
                {activePools.length} pool{activePools.length !== 1 ? "s" : ""} ·{" "}
                {activeRules.length} rule{activeRules.length !== 1 ? "s" : ""}
              </span>
            </span>
            {open ? (
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="min-w-0 space-y-6 border-t border-border/60 px-4 pb-6 pt-5 sm:px-6">
            {/* Pools */}
            <div className="min-w-0">
              <p className="mb-3 text-sm text-muted-foreground">Tip Pools</p>
              {activePools.length > 0 ? (
                <div className="space-y-2">
                  {activePools.map((pool) => (
                    <div
                      key={pool.id}
                      className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1.5 rounded-2xl border-0 bg-muted/60 px-3 py-2.5 shadow-none"
                    >
                      <span className="min-w-0 flex-1 text-sm">
                        <span className="font-medium">{pool.name}</span>
                        <span className="ml-2 text-muted-foreground">
                          {pool.distribution_method.replace("_", " ")}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-full bg-background px-2.5 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
                        {pool.source_percentage}% of {pool.tip_source.replace("_", " ")}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No active tip pools</p>
              )}
            </div>

            {/* Rules */}
            <div className="min-w-0">
              <p className="mb-3 text-sm text-muted-foreground">Tip-Out Rules</p>
              {activeRules.length > 0 ? (
                <div className="space-y-2">
                  {activeRules.map((rule) => (
                    <div
                      key={rule.id}
                      className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1.5 rounded-2xl border-0 bg-muted/60 px-3 py-2.5 shadow-none"
                    >
                      <span className="flex min-w-0 flex-1 items-center gap-1.5 text-sm">
                        <span className="truncate font-medium">{rule.from_role_code}</span>
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate font-medium">{rule.to_role_code}</span>
                      </span>
                      <span className="shrink-0 rounded-full bg-background px-2.5 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
                        {rule.tip_out_type === "flat_amount"
                          ? `$${rule.tip_out_value}`
                          : `${rule.tip_out_value}%`}{" "}
                        {rule.tip_out_type.replace("_", " ")}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No active tip-out rules</p>
              )}
            </div>

            <Button
              variant="outline"
              size="sm"
              className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
              asChild
            >
              <Link href="/dashboard/settings/tips">Edit in Tip Configuration</Link>
            </Button>
          </div>
        </CollapsibleContent>
      </Panel>
    </Collapsible>
  );
}
