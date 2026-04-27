"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Camera, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { format } from "date-fns";

interface ConfigSnapshotPanelProps {
  snapshot: any;
}

export function ConfigSnapshotPanel({ snapshot }: ConfigSnapshotPanelProps) {
  const [open, setOpen] = useState(false);

  if (!snapshot) return null;

  const pools = snapshot.pools || [];
  const tipOutRules = snapshot.tip_out_rules || [];
  const snapshotTime = snapshot.snapshot_taken_at
    ? format(new Date(snapshot.snapshot_taken_at), "MMM d, yyyy 'at' h:mm a")
    : null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="border rounded-lg">
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/30 transition-colors">
            <div className="flex items-center gap-2">
              <Camera className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Configuration Snapshot
              </span>
              {snapshotTime && (
                <span className="text-xs text-muted-foreground">
                  — captured {snapshotTime}
                </span>
              )}
            </div>
            {open ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-4 pb-4 space-y-4 border-t pt-3">
            <p className="text-xs text-muted-foreground">
              This shows the exact pool and tip-out rules that were active when
              this session was calculated. Even if the configuration has changed
              since, this snapshot reflects what was used.
            </p>

            {/* Pools */}
            {pools.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Tip Pools ({pools.length})
                </p>
                {pools.map((pool: any, i: number) => (
                  <div
                    key={pool.id || i}
                    className="rounded border px-3 py-2.5 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{pool.name}</span>
                      <div className="flex gap-1.5">
                        <Badge variant="outline" className="text-[10px]">
                          {(pool.distribution_method || "").replace("_", " ")}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {pool.source_percentage}% of{" "}
                          {(pool.tip_source || "").replace("_", " ")}
                        </Badge>
                      </div>
                    </div>

                    {/* Contributing roles */}
                    {pool.contributing_role_codes?.length > 0 && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span>Contributors:</span>
                        {pool.contributing_role_codes.map((code: string) => (
                          <Badge key={code} variant="secondary" className="text-[10px]">
                            {code}
                          </Badge>
                        ))}
                      </div>
                    )}

                    {/* Role shares */}
                    {pool.role_shares?.length > 0 && (
                      <div className="text-xs space-y-0.5">
                        {pool.role_shares
                          .filter((rs: any) => rs.is_eligible)
                          .map((rs: any, j: number) => (
                            <div
                              key={j}
                              className="flex items-center justify-between text-muted-foreground"
                            >
                              <span>{rs.role_code}</span>
                              <span className="font-medium text-foreground">
                                {rs.share_percentage != null
                                  ? `${rs.share_percentage}%`
                                  : rs.points_per_hour != null
                                  ? `${rs.points_per_hour} pts/hr`
                                  : "Eligible"}
                              </span>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No tip pools were active at the time of calculation
              </p>
            )}

            {/* Tip-Out Rules */}
            {tipOutRules.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Tip-Out Rules ({tipOutRules.length})
                </p>
                {tipOutRules.map((rule: any, i: number) => (
                  <div
                    key={rule.id || i}
                    className="flex items-center justify-between rounded border px-3 py-2 text-sm"
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
                      {(rule.tip_out_type || "").replace(/_/g, " ")}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No tip-out rules were active at the time of calculation
              </p>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
