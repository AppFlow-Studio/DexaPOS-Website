"use client";

import * as React from "react";
import {
  AlertTriangle,
  Ban,
  Clock,
  Flame,
  RotateCcw,
  ShoppingBag,
  User,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  KdsDisplaySummary,
  KdsMirrorItem,
  KdsMirrorModifier,
  KdsMirrorTicket,
} from "@/app/manage/actions/kds-mirror";

// ---------------------------------------------------------------------------
// Faithful station layout.
//
// Everything in this file is ported from the tablet's own KDS screen
// (app/(main)/kds.tsx in the Dexa-POS repo) so HQ sees the board arranged the
// way the kitchen sees it, rather than the analytical four-column view in
// KdsMirrorBoard. Where the two repos disagree, the tablet wins.
//
// Ported deliberately, with the tablet as the source of truth:
//   STATUS_TABS       - note `ready` is labelled "Served", not "Ready".
//   TYPE_TABS         - All / Delivery / To Go / Dine-In.
//   matchesTypeFilter - copied verbatim, including its empty/NULL order_type
//                       falling through to Dine-In.
//   ALLERGEN_KEYWORDS - the tablet flags allergens on MODIFIER names, and does
//                       so unconditionally: it is NOT gated by the display's
//                       show_allergy_flags column despite that column existing.
//   column count      - kds_displays.columns, default 4.
//
// NOT ported, on purpose:
//   alert_minutes / warning_minutes - stored and plumbed into the POS config
//     object but consumed by no tablet rendering today. Colouring tickets by
//     them here would show HQ something the kitchen cannot see, which is the
//     one thing this tool must never do.
//   the done-tab time window - the tablet re-filters done tickets to 60
//     minutes, which is exactly get_kds_tickets_v3's own done_retention, so
//     the RPC has already applied it.
//   ticket sort - v3 returns rush/prioritised first then oldest first, which
//     is the order the tablet renders; re-sorting here could only introduce
//     drift.
// ---------------------------------------------------------------------------

type StatusFilter = "pending" | "cooking" | "ready" | "done";
type OrderTypeFilter = "all" | "delivery" | "takeout" | "dine_in";

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "cooking", label: "Cooking" },
  { key: "ready", label: "Served" },
  { key: "done", label: "Done" },
];

const TYPE_TABS: { key: OrderTypeFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "delivery", label: "Delivery" },
  { key: "takeout", label: "To Go" },
  { key: "dine_in", label: "Dine-In" },
];

/** Verbatim port of matchesTypeFilter from the tablet's kds.tsx. */
function matchesTypeFilter(
  ticket: KdsMirrorTicket,
  filter: OrderTypeFilter
): boolean {
  if (filter === "all") return true;
  const t = (ticket.order_type || "").toLowerCase();
  if (filter === "delivery") return t === "delivery";
  if (filter === "takeout")
    return t === "takeout" || t === "to_go" || t === "to go";
  // dine_in
  return t === "dine_in" || t === "dine in" || t === "" || !ticket.order_type;
}

const ALLERGEN_KEYWORDS: Record<string, { label: string; className: string }> = {
  shellfish: {
    label: "SHELLFISH",
    className: "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300",
  },
  dairy: {
    label: "DAIRY",
    className:
      "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
  },
  nuts: {
    label: "NUTS",
    className:
      "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300",
  },
  gluten: {
    label: "GLUTEN",
    className:
      "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
  },
  soy: {
    label: "SOY",
    className:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
  },
};

function detectAllergen(modifierName: string | null | undefined) {
  if (!modifierName) return null;
  const lower = modifierName.toLowerCase();
  for (const [keyword, meta] of Object.entries(ALLERGEN_KEYWORDS)) {
    if (lower.includes(keyword)) return meta;
  }
  return null;
}

function elapsed(fromIso: string | null, now: number): string {
  if (!fromIso) return "--";
  const ms = now - new Date(fromIso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "--";

  const totalMinutes = Math.floor(ms / 60000);
  if (totalMinutes < 60) return `${totalMinutes}m`;

  const hours = Math.floor(totalMinutes / 60);
  return `${hours}h ${totalMinutes % 60}m`;
}

// ---------------------------------------------------------------------------
// Staleness hints.
//
// These are the one thing on a card the kitchen does NOT see. A ticket parked
// in Served for a long time is the signature of the display-side anomaly behind
// this whole tool: the cook marked items ready but the KDS row was never
// bumped, so the card never cleared. A ticket stuck in Pending is the opposite
// signature -- nobody ever touched it.
//
// They are therefore opt-in per view: the per-status triage board turns them
// on, the faithful station layout leaves them off.
// ---------------------------------------------------------------------------
const STALE_READY_MS = 10 * 60 * 1000;
const STALE_PENDING_MS = 20 * 60 * 1000;

function stalenessHint(ticket: KdsMirrorTicket, now: number): string | null {
  if (ticket.status === "ready") {
    const readyAt = ticket.ready_time ?? ticket.start_time;
    if (readyAt && now - new Date(readyAt).getTime() > STALE_READY_MS) {
      return "Ready and never cleared. Either nobody bumped it, or the bump never reached the server.";
    }
  }

  if (ticket.status === "pending") {
    if (
      ticket.start_time &&
      now - new Date(ticket.start_time).getTime() > STALE_PENDING_MS
    ) {
      return "Sent long ago and still untouched. Consistent with a screen that never showed it.";
    }
  }

  return null;
}

/**
 * MasonryFlashList is mounted without `optimizeItemArrangement`, so FlashList
 * distributes round-robin (item i -> column i % n) rather than to the shortest
 * column. Matching that matters: CSS multi-column would flow top-to-bottom down
 * column one before starting column two, which silently reorders the board and
 * changes which ticket the kitchen reads first.
 */
export function distributeRoundRobin<T>(items: T[], columnCount: number): T[][] {
  const columns: T[][] = Array.from({ length: columnCount }, () => []);
  items.forEach((item, index) => {
    columns[index % columnCount].push(item);
  });
  return columns;
}

function ModifierLine({ modifier }: { modifier: KdsMirrorModifier }) {
  const allergen = detectAllergen(modifier.modifier_name);
  const label = modifier.is_no
    ? `No ${modifier.modifier_name}`
    : modifier.modifier_name;

  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn(modifier.is_no && "text-red-600 dark:text-red-400")}>
        {label}
      </span>
      {allergen && (
        <span
          className={cn(
            "rounded px-1 py-px text-[0.6em] font-bold tracking-wide",
            allergen.className
          )}
        >
          {allergen.label}
        </span>
      )}
    </span>
  );
}

function StationItemRow({ item }: { item: KdsMirrorItem }) {
  return (
    <li className="flex items-start gap-2 py-[0.2em]">
      <span className="min-w-[1.6em] shrink-0 text-right font-bold tabular-nums">
        {item.quantity}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1">
          <span className={cn(item.is_voided && "line-through opacity-60")}>
            {item.name ?? "Unnamed item"}
          </span>
          {item.rush && <Flame className="h-[0.9em] w-[0.9em] text-orange-500" />}
          {item.is_to_go && (
            <ShoppingBag className="h-[0.9em] w-[0.9em] opacity-60" />
          )}
          {item.is_voided && <Ban className="h-[0.9em] w-[0.9em] text-red-500" />}
          {item.is_refunded && (
            <RotateCcw className="h-[0.9em] w-[0.9em] text-red-500" />
          )}
        </div>

        {item.modifiers.length > 0 && (
          <div className="mt-[0.1em] flex flex-wrap gap-x-2 text-[0.85em] opacity-80">
            {item.modifiers.map((modifier, index) => (
              <ModifierLine key={index} modifier={modifier} />
            ))}
          </div>
        )}

        {item.special_instructions && (
          <div className="mt-[0.1em] text-[0.85em] italic text-amber-700 dark:text-amber-400">
            {item.special_instructions}
          </div>
        )}
      </div>
    </li>
  );
}

export function StationTicketCard({
  ticket,
  now,
  showOrderNotes,
  isHighlighted,
  showStaleHint = false,
}: {
  ticket: KdsMirrorTicket;
  now: number;
  showOrderNotes: boolean;
  isHighlighted: boolean;
  /** Triage-only. Off in the faithful station layout. */
  showStaleHint?: boolean;
}) {
  const isRush = ticket.any_rush || ticket.prioritized;
  const hint = showStaleHint ? stalenessHint(ticket, now) : null;

  return (
    <div
      className={cn(
        "rounded-lg border-2 bg-card p-[0.6em] shadow-sm",
        isRush
          ? "border-orange-500"
          : "border-border",
        hint && "border-amber-500",
        isHighlighted && "ring-2 ring-violet-400/70"
      )}
    >
      <div className="flex items-start justify-between gap-2 border-b pb-[0.4em]">
        <div className="min-w-0">
          <div className="truncate font-bold">
            #{ticket.display_number ?? ticket.order_number ?? "--"}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 text-[0.8em] opacity-70">
            {ticket.table_name && <span>Table {ticket.table_name}</span>}
            {ticket.order_type && <span>{ticket.order_type}</span>}
            {ticket.course_number > 1 && <span>C{ticket.course_number}</span>}
          </div>
        </div>

        <span className="flex shrink-0 items-center gap-1 font-semibold tabular-nums">
          <Clock className="h-[0.9em] w-[0.9em]" />
          {elapsed(ticket.start_time, now)}
        </span>
      </div>

      {/* server_name is already NULL when the display has show_server_name
          off -- get_kds_tickets_v3 applies that server-side. */}
      {(ticket.server_name || ticket.customer_name) && (
        <div className="flex items-center gap-1 pt-[0.3em] text-[0.8em] opacity-70">
          <User className="h-[0.9em] w-[0.9em]" />
          <span className="truncate">
            {ticket.customer_name ?? ticket.server_name}
          </span>
        </div>
      )}

      <ul className="pt-[0.3em]">
        {ticket.items.map((item) => (
          <StationItemRow key={item.id} item={item} />
        ))}
      </ul>

      {showOrderNotes && ticket.order_notes && (
        <div className="mt-[0.4em] rounded bg-muted/70 px-[0.5em] py-[0.3em] text-[0.85em] italic">
          {ticket.order_notes}
        </div>
      )}

      {hint && (
        <div className="mt-[0.4em] flex items-start gap-1 rounded bg-amber-50 px-[0.5em] py-[0.3em] text-[0.8em] text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          <AlertTriangle className="mt-[0.15em] h-[0.9em] w-[0.9em] shrink-0" />
          <span>{hint}</span>
        </div>
      )}
    </div>
  );
}

function TabButton({
  label,
  count,
  isActive,
  onClick,
}: {
  label: string;
  count?: number;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        isActive
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground hover:bg-muted/70"
      )}
    >
      {label}
      {count !== undefined && (
        <span className="ml-1.5 tabular-nums opacity-80">{count}</span>
      )}
    </button>
  );
}

export function KdsStationBoard({
  tickets,
  display,
  isLoading,
  highlightOrderId,
  className,
}: {
  tickets: KdsMirrorTicket[];
  display: KdsDisplaySummary | null;
  isLoading?: boolean;
  highlightOrderId?: string | null;
  className?: string;
}) {
  const columnCount = Math.min(Math.max(display?.columns ?? 4, 1), 8);
  const fontScale = display?.font_scale ?? 1;
  const showOrderNotes = display?.show_order_notes ?? true;
  const isTwoStep = display?.kds_workflow_mode === "2-step";

  const visibleStatusTabs = React.useMemo(
    () => (isTwoStep ? STATUS_TABS.filter((t) => t.key !== "pending") : STATUS_TABS),
    [isTwoStep]
  );

  const [activeStatus, setActiveStatus] = React.useState<StatusFilter>(
    isTwoStep ? "cooking" : "pending"
  );
  const [activeType, setActiveType] = React.useState<OrderTypeFilter>("all");

  // The tablet does the same reset when workflow mode changes under it.
  React.useEffect(() => {
    if (isTwoStep && activeStatus === "pending") {
      setActiveStatus("cooking");
    }
  }, [isTwoStep, activeStatus]);

  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);

  const byStatus = React.useMemo(() => {
    const base: Record<StatusFilter, KdsMirrorTicket[]> = {
      pending: [],
      cooking: [],
      ready: [],
      done: [],
    };
    for (const ticket of tickets) {
      const bucket = base[ticket.status as StatusFilter];
      if (bucket) bucket.push(ticket);
    }
    return base;
  }, [tickets]);

  const activeTickets = React.useMemo(
    () => byStatus[activeStatus].filter((t) => matchesTypeFilter(t, activeType)),
    [byStatus, activeStatus, activeType]
  );

  const columns = React.useMemo(
    () => distributeRoundRobin(activeTickets, columnCount),
    [activeTickets, columnCount]
  );

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5">
          {visibleStatusTabs.map((tab) => (
            <TabButton
              key={tab.key}
              label={tab.label}
              count={
                byStatus[tab.key].filter((t) => matchesTypeFilter(t, activeType))
                  .length
              }
              isActive={activeStatus === tab.key}
              onClick={() => setActiveStatus(tab.key)}
            />
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {TYPE_TABS.map((tab) => (
            <TabButton
              key={tab.key}
              label={tab.label}
              isActive={activeType === tab.key}
              onClick={() => setActiveType(tab.key)}
            />
          ))}
        </div>

        <span className="ml-auto text-xs text-muted-foreground">
          {columnCount} column{columnCount === 1 ? "" : "s"}
          {fontScale !== 1 && ` · ${fontScale}x type`}
          {isTwoStep && " · 2-step workflow"}
        </span>
      </div>

      {isLoading ? (
        <div className="flex gap-2">
          {Array.from({ length: columnCount }).map((_, i) => (
            <div key={i} className="flex-1 space-y-2">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ))}
        </div>
      ) : activeTickets.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
          {activeStatus === "done"
            ? "No done tickets"
            : `No ${activeStatus} tickets`}
        </div>
      ) : (
        <div
          className="flex items-start gap-2"
          // font_scale is applied once here and every card sizes in em, so the
          // whole station scales the way the tablet's s() helper scales it.
          style={{ fontSize: `${14 * fontScale}px` }}
        >
          {columns.map((columnTickets, index) => (
            <div key={index} className="flex min-w-0 flex-1 flex-col gap-2">
              {columnTickets.map((ticket) => (
                <StationTicketCard
                  key={ticket.ticket_id}
                  ticket={ticket}
                  now={now}
                  showOrderNotes={showOrderNotes}
                  // The one thing on this board the kitchen does not see, and
                  // the reason the tool exists: a ticket parked in Served that
                  // was never bumped, or one sitting in Pending untouched.
                  // Without it the mirror is a pretty screenshot.
                  showStaleHint
                  isHighlighted={
                    !!highlightOrderId && ticket.order_id === highlightOrderId
                  }
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
