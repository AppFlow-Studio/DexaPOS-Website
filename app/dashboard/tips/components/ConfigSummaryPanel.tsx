"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Settings, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
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
      <div className="min-w-0 rounded-2xl border bg-card">
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/30 transition-colors">
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Active Tip Configuration
              </span>
              <Badge variant="secondary" className="text-[10px]">
                {activePools.length} pool{activePools.length !== 1 ? "s" : ""},{" "}
                {activeRules.length} rule{activeRules.length !== 1 ? "s" : ""}
              </Badge>
            </div>
            {open ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-4 pb-4 space-y-4 border-t border-border/60 pt-3">
            {/* Pools */}
            {activePools.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Tip Pools
                </p>
                {activePools.map((pool) => (
                  <div
                    key={pool.id}
                    className="flex items-center justify-between rounded-2xl border-0 bg-muted/60 px-3 py-2 text-sm"
                  >
                    <div>
                      <span className="font-medium">{pool.name}</span>
                      <span className="text-muted-foreground ml-2">
                        — {pool.distribution_method.replace("_", " ")}
                      </span>
                    </div>
                    <Badge variant="outline" className="text-[10px]">
                      {pool.source_percentage}% of {pool.tip_source.replace("_", " ")}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No active tip pools</p>
            )}

            {/* Rules */}
            {activeRules.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Tip-Out Rules
                </p>
                {activeRules.map((rule) => (
                  <div
                    key={rule.id}
                    className="flex items-center justify-between rounded-2xl border-0 bg-muted/60 px-3 py-2 text-sm"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium">{rule.from_role_code}</span>
                      <ArrowRight className="w-3 h-3 text-muted-foreground" />
                      <span className="font-medium">{rule.to_role_code}</span>
                    </div>
                    <Badge variant="outline" className="text-[10px]">
                      {rule.tip_out_type === "flat_amount"
                        ? `$${rule.tip_out_value}`
                        : `${rule.tip_out_value}%`}{" "}
                      {rule.tip_out_type.replace("_", " ")}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No active tip-out rules</p>
            )}

            {/* Link to settings */}
            <Link href="/dashboard/settings/tips">
              <Button variant="link" size="sm" className="p-0 h-auto text-[#0C4FD1] dark:text-[#6CA0FF]">
                Edit in Tip Configuration →
              </Button>
            </Link>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
