"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Route,
  MapPin,
  Monitor,
  CheckCircle2,
  MinusCircle,
  AlertTriangle,
  ChevronDown,
  Info,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  GetOrderRoutingTrace,
  type OrderRoutingTrace,
  type OrderRoutingTraceItem,
  type OrderRoutingDecision,
  type KdsMatchReason,
  type KdsPrepStationSource,
  type KdsRoutingOutcome,
} from "@/app/dashboard/actions/order-routing-trace";

// ---------------------------------------------------------------------------
// Label + tone maps for the routing enums
// ---------------------------------------------------------------------------

const MATCH_REASON_META: Record<
  KdsMatchReason,
  { label: string; help: string }
> = {
  rule_prep_station: {
    label: "Prep-station rule",
    help: "This display has a rule matching the item's prep station.",
  },
  rule_category_id: {
    label: "Category rule",
    help: "This display has a rule matching the item's category.",
  },
  rule_category_name: {
    label: "Category rule",
    help: "This display has a rule matching the item's category name.",
  },
  rule_order_type: {
    label: "Order-type rule",
    help: "This display has a rule matching the order type.",
  },
  routing_mode_all: {
    label: "Receives all items",
    help: "This display is configured to receive every fired item.",
  },
  show_all_items: {
    label: "Show-all fallback",
    help: "No rule matched, but this display shows all items.",
  },
  fallback_expo: {
    label: "Expo fallback",
    help: "No specific display matched; a show-all display caught the item.",
  },
  fallback_blast: {
    label: "Blast fallback",
    help: "No display matched, so the item was sent to every active display.",
  },
  no_rule_match: {
    label: "No matching rule",
    help: "This display's rules did not match the item.",
  },
  no_active_display: {
    label: "No active KDS",
    help: "The location had no active KDS display when the item fired.",
  },
  backfill_unknown: {
    label: "Historical",
    help: "Recorded before tracing existed; the exact rule is unknown.",
  },
};

const PREP_SOURCE_META: Record<KdsPrepStationSource, string> = {
  item_override: "Item override",
  category_default: "Category default",
  item_column: "Item setting",
  none: "Unassigned",
};

function outcomeMeta(outcome: KdsRoutingOutcome) {
  switch (outcome) {
    case "routed":
      return {
        label: "Routed",
        icon: <CheckCircle2 className="h-3 w-3" />,
        className:
          "border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
      };
    case "dropped":
      return {
        label: "Dropped",
        icon: <AlertTriangle className="h-3 w-3" />,
        className:
          "border-transparent bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300",
      };
    case "skipped":
    default:
      return {
        label: "Skipped",
        icon: <MinusCircle className="h-3 w-3" />,
        className:
          "border-border/70 bg-muted/60 text-muted-foreground",
      };
  }
}

/** Human-readable "what the station rule was" for a matched decision. */
function matchedRuleText(d: OrderRoutingDecision): string | null {
  if (d.match_reason === "routing_mode_all") {
    return "Display receives all fired items";
  }
  if (!d.matched_rule_type || !d.matched_rule_value) {
    return null;
  }
  const field =
    d.matched_rule_type === "prep_station"
      ? "Prep station"
      : d.matched_rule_type === "category"
        ? "Category"
        : d.matched_rule_type === "order_type"
          ? "Order type"
          : d.matched_rule_type;
  return `${field} = ${d.matched_rule_value}`;
}

function formatKitchenStatus(status: string | null): string | null {
  if (!status) return null;
  return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ");
}

// ---------------------------------------------------------------------------
// Per-decision (one KDS display) row
// ---------------------------------------------------------------------------

function DecisionRow({ decision }: { decision: OrderRoutingDecision }) {
  const meta = outcomeMeta(decision.outcome);
  const reason = MATCH_REASON_META[decision.match_reason] ?? {
    label: decision.match_reason,
    help: "",
  };
  const rule = matchedRuleText(decision);
  const onScreen = formatKitchenStatus(decision.current_kds_status);

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-background/60 px-3 py-2.5">
      <Badge
        className={cn("mt-0.5 shrink-0 gap-1", meta.className)}
        variant="outline"
      >
        {meta.icon}
        {meta.label}
      </Badge>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <Monitor className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">
            {decision.kds_display_name ?? "Unknown display"}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1" title={reason.help}>
            <Info className="h-3 w-3" />
            {reason.label}
          </span>
          {rule && (
            <>
              <span aria-hidden>•</span>
              <span className="font-medium text-foreground/80">{rule}</span>
            </>
          )}
          {onScreen && (
            <>
              <span aria-hidden>•</span>
              <span>On screen: {onScreen}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-item block (item -> resolved station -> list of display decisions)
// ---------------------------------------------------------------------------

function ItemTrace({ item }: { item: OrderRoutingTraceItem }) {
  // Routed decisions first, then skipped/dropped, so "where it landed" is on top.
  const decisions = React.useMemo(() => {
    const order: Record<KdsRoutingOutcome, number> = {
      routed: 0,
      dropped: 1,
      skipped: 2,
    };
    return [...item.routing].sort(
      (a, b) => (order[a.outcome] ?? 9) - (order[b.outcome] ?? 9)
    );
  }, [item.routing]);

  const routedCount = decisions.filter((d) => d.outcome === "routed").length;
  const evaluated = decisions[0]?.displays_evaluated ?? decisions.length;
  const dropped = decisions.some((d) => d.outcome === "dropped");
  const kitchenStatus = formatKitchenStatus(item.kitchen_status);

  // Expand by default when something needs attention.
  const defaultOpen = item.divergence || dropped || routedCount === 0;

  return (
    <Collapsible
      defaultOpen={defaultOpen}
      className="rounded-xl border border-border/60 bg-muted/30"
    >
      <CollapsibleTrigger className="group flex w-full items-start justify-between gap-3 px-3.5 py-3 text-left">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold text-foreground">
              {item.item_name ?? "Item"}
            </span>
            {kitchenStatus && (
              <Badge variant="secondary" className="text-[10px]">
                {kitchenStatus}
              </Badge>
            )}
            {item.divergence && (
              <Badge
                variant="outline"
                className="gap-1 border-transparent bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
              >
                <AlertTriangle className="h-3 w-3" />
                Status mismatch
              </Badge>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {item.resolved_prep_station ? (
                <>
                  <span className="font-medium text-foreground/80">
                    {item.resolved_prep_station}
                  </span>
                  <span className="text-muted-foreground/80">
                    ({PREP_SOURCE_META[item.prep_station_source]})
                  </span>
                </>
              ) : (
                <span>No prep station</span>
              )}
            </span>
            {item.category_name && (
              <>
                <span aria-hidden>•</span>
                <span>{item.category_name}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={cn(
              "text-xs font-medium",
              routedCount === 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"
            )}
          >
            {routedCount === 0
              ? "Not routed"
              : `Routed to ${routedCount} of ${evaluated}`}
          </span>
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-2 px-3.5 pb-3.5">
          {decisions.length === 0 ? (
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-amber-300/60 bg-amber-50/60 px-3 py-2.5 text-xs text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Item was fired but no routing decision was recorded.
            </div>
          ) : (
            decisions.map((d, i) => (
              <DecisionRow
                key={`${d.kds_display_id ?? "none"}-${i}`}
                decision={d}
              />
            ))
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ---------------------------------------------------------------------------
// Inner body (shared by both surfaces)
// ---------------------------------------------------------------------------

function TraceBody({
  trace,
  items,
}: {
  trace: OrderRoutingTrace;
  items: OrderRoutingTraceItem[];
}) {
  return (
    <div className="space-y-3">
      {trace.has_divergence && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50/70 px-3 py-2.5 text-xs text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            One or more items are out of sync between the order and the kitchen
            display. Review the flagged items below.
          </span>
        </div>
      )}
      {items.map((item) => (
        <ItemTrace key={item.order_item_id} item={item} />
      ))}
    </div>
  );
}

function LoadingBody() {
  return (
    <div className="space-y-3">
      {[0, 1].map((i) => (
        <div
          key={i}
          className="space-y-2 rounded-xl border border-border/60 bg-muted/30 p-3.5"
        >
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-56" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

interface KDSRoutingTraceSectionProps {
  orderId: string | undefined | null;
  /** Gate the query (e.g. only fetch while a sheet is open). Defaults to true. */
  enabled?: boolean;
  /**
   * Chrome to render around the trace:
   * - "sheet": matches the OrderDetailSheet SectionCard styling.
   * - "page": matches the full-page Card styling.
   */
  variant?: "sheet" | "page";
}

export function KDSRoutingTraceSection({
  orderId,
  enabled = true,
  variant = "page",
}: KDSRoutingTraceSectionProps) {
  const { data: trace, isLoading } = useQuery({
    queryKey: ["order-routing-trace", orderId],
    queryFn: () => GetOrderRoutingTrace(orderId as string),
    enabled: !!orderId && enabled,
    staleTime: 30_000,
  });

  // Only items that were actually fired (have decisions) or need attention.
  const tracedItems = React.useMemo(
    () =>
      (trace?.items ?? []).filter(
        (it) => it.routing.length > 0 || it.divergence
      ),
    [trace]
  );

  // Nothing to show for orders that were never sent to the kitchen.
  if (!isLoading && (!trace || tracedItems.length === 0)) {
    return null;
  }

  const body = isLoading ? (
    <LoadingBody />
  ) : trace ? (
    <TraceBody trace={trace} items={tracedItems} />
  ) : null;

  const description =
    "Where each fired item was routed across kitchen displays and why.";

  if (variant === "sheet") {
    return (
      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/95 shadow-[0_16px_40px_-24px_rgba(15,23,42,0.35)] backdrop-blur-sm">
        <div className="flex items-center justify-between gap-3 border-b border-border/60 bg-gradient-to-r from-muted/70 via-background to-background px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-background/80 text-muted-foreground shadow-sm">
              <Route className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Section
              </p>
              <h3 className="truncate text-sm font-semibold text-foreground">
                KDS Routing
              </h3>
            </div>
          </div>
        </div>
        <div className="p-5">{body}</div>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Route className="h-4 w-4" />
          KDS Routing
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}

export default KDSRoutingTraceSection;
