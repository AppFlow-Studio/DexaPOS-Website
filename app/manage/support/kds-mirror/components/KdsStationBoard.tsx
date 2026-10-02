"use client";

import * as React from "react";
import {
  AlertTriangle,
  Clock,
  Flame,
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
import { CardGridEmpty } from "@/app/manage/transactions/components/ledger-primitives";
import { PillRail } from "./kds-primitives";

// ---------------------------------------------------------------------------
// Faithful station layout.
//
// Everything in this file is ported from the tablet's own KDS screen
// (app/(main)/kds.tsx in the Dexa-POS repo) so HQ sees the board arranged the
// way the kitchen sees it, not re-arranged into an analytical per-status
// view. Where the two repos disagree, the tablet wins.
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
// What is ported is the arrangement and the content, not the palette: rush,
// allergens, voids and refunds are carried by words and weight here
// (UI-DESIGN-SYSTEM §3.5; decided 2026-09-29).
//
// NOT ported, on purpose:
//   alert_minutes / warning_minutes - stored and plumbed into the POS config
//     object but consumed by no tablet rendering today. Flagging tickets by
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

/** Allergen keywords, matched against modifier names; the value is the word shown. */
const ALLERGEN_KEYWORDS: Record<string, string> = {
  shellfish: "SHELLFISH",
  dairy: "DAIRY",
  nuts: "NUTS",
  gluten: "GLUTEN",
  soy: "SOY",
};

function detectAllergen(modifierName: string | null | undefined) {
  if (!modifierName) return null;
  const lower = modifierName.toLowerCase();
  for (const [keyword, label] of Object.entries(ALLERGEN_KEYWORDS)) {
    if (lower.includes(keyword)) return label;
  }
  return null;
}

function elapsed(fromIso: string | null, now: number): string {
  // Unknown is not zero (§4.9): an em dash, never "--" or "0m".
  if (!fromIso) return "—";
  const ms = now - new Date(fromIso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";

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

/** A small uppercase word beside an item or modifier: rush, void, allergen. */
function FlagWord({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[0.7em] font-semibold uppercase tracking-wide text-foreground">
      {children}
    </span>
  );
}

function ModifierLine({ modifier }: { modifier: KdsMirrorModifier }) {
  const allergen = detectAllergen(modifier.modifier_name);
  const label = modifier.is_no
    ? `No ${modifier.modifier_name}`
    : modifier.modifier_name;

  return (
    <span className="inline-flex items-center gap-1">
      {/* "No X" is already said in words; weight makes it hard to skim past. */}
      <span className={cn(modifier.is_no && "font-medium text-foreground")}>
        {label}
      </span>
      {allergen && <FlagWord>{allergen}</FlagWord>}
    </span>
  );
}

function StationItemRow({ item }: { item: KdsMirrorItem }) {
  return (
    <li className="flex items-start gap-2 py-[0.2em]">
      <span className="min-w-[1.6em] shrink-0 text-right font-semibold tabular-nums">
        {item.quantity}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span
            className={cn(
              item.is_voided && "text-muted-foreground line-through"
            )}
          >
            {item.name ?? "Unnamed item"}
          </span>
          {item.rush && (
            <span className="inline-flex items-center gap-0.5">
              <Flame className="h-[0.9em] w-[0.9em] text-muted-foreground" />
              <FlagWord>Rush</FlagWord>
            </span>
          )}
          {item.is_to_go && (
            <ShoppingBag
              className="h-[0.9em] w-[0.9em] text-muted-foreground"
              aria-label="To go"
            />
          )}
          {item.is_voided && <FlagWord>Void</FlagWord>}
          {item.is_refunded && <FlagWord>Refunded</FlagWord>}
        </div>

        {item.modifiers.length > 0 && (
          <div className="mt-[0.1em] flex flex-wrap gap-x-2 text-[0.85em] text-muted-foreground">
            {item.modifiers.map((modifier, index) => (
              <ModifierLine key={index} modifier={modifier} />
            ))}
          </div>
        )}

        {item.special_instructions && (
          <div className="mt-[0.1em] text-[0.85em] font-medium italic text-foreground">
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
  const ticketNumber = ticket.display_number ?? ticket.order_number;

  return (
    <div
      className={cn(
        // The record-card material (§5.3). The linked order is the selected
        // state — a ring, not a coloured border — and says so in words below.
        "min-w-0 rounded-2xl bg-muted/45 p-[0.75em]",
        isHighlighted && "bg-muted ring-1 ring-border"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2">
            <span className="truncate font-semibold tabular-nums">
              {ticketNumber != null ? `#${ticketNumber}` : "—"}
            </span>
            {isRush && (
              <span className="inline-flex items-center gap-0.5">
                <Flame className="h-[0.9em] w-[0.9em] text-muted-foreground" />
                <FlagWord>Rush</FlagWord>
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 text-[0.8em] text-muted-foreground">
            {ticket.table_name && <span>Table {ticket.table_name}</span>}
            {ticket.order_type && <span>{ticket.order_type}</span>}
            {ticket.course_number > 1 && <span>C{ticket.course_number}</span>}
          </div>
        </div>

        <span className="flex shrink-0 items-center gap-1 font-medium tabular-nums">
          <Clock className="h-[0.9em] w-[0.9em] text-muted-foreground" />
          {elapsed(ticket.start_time, now)}
        </span>
      </div>

      {isHighlighted && (
        <p className="mt-[0.3em] text-[0.75em] font-medium text-foreground">
          Linked order
        </p>
      )}

      {/* server_name is already NULL when the display has show_server_name
          off -- get_kds_tickets_v3 applies that server-side. */}
      {(ticket.server_name || ticket.customer_name) && (
        <div className="flex items-center gap-1 pt-[0.3em] text-[0.8em] text-muted-foreground">
          <User className="h-[0.9em] w-[0.9em]" />
          <span className="truncate">
            {ticket.customer_name ?? ticket.server_name}
          </span>
        </div>
      )}

      <ul className="pt-[0.4em]">
        {ticket.items.map((item) => (
          <StationItemRow key={item.id} item={item} />
        ))}
      </ul>

      {showOrderNotes && ticket.order_notes && (
        <p className="mt-[0.4em] text-[0.85em] italic text-muted-foreground">
          {ticket.order_notes}
        </p>
      )}

      {/* Not an HQ-2 alarm: marked by weight and words, never a tinted wash. */}
      {hint && (
        <div className="mt-[0.5em] flex items-start gap-1 text-[0.8em] font-medium text-foreground">
          <AlertTriangle className="mt-[0.15em] h-[0.9em] w-[0.9em] shrink-0 text-muted-foreground" />
          <span>{hint}</span>
        </div>
      )}
    </div>
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
  // Adjusted during render, not in an effect, so there is no cascading render.
  if (isTwoStep && activeStatus === "pending") {
    setActiveStatus("cooking");
  }

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

  const activeStatusLabel =
    STATUS_TABS.find((t) => t.key === activeStatus)?.label ?? activeStatus;
  const activeTypeLabel =
    TYPE_TABS.find((t) => t.key === activeType)?.label ?? activeType;

  const renderCard = (ticket: KdsMirrorTicket) => (
    <StationTicketCard
      key={ticket.ticket_id}
      ticket={ticket}
      now={now}
      showOrderNotes={showOrderNotes}
      // The one thing on this board the kitchen does not see, and the reason
      // the tool exists: a ticket parked in Served that was never bumped, or
      // one sitting in Pending untouched. Without it the mirror is a pretty
      // screenshot.
      showStaleHint
      isHighlighted={!!highlightOrderId && ticket.order_id === highlightOrderId}
    />
  );

  return (
    <div className={cn("min-w-0 space-y-4", className)}>
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        <PillRail
          ariaLabel="Ticket status"
          value={activeStatus}
          onValueChange={setActiveStatus}
          options={visibleStatusTabs.map((tab) => ({
            key: tab.key,
            label: tab.label,
            count: byStatus[tab.key].filter((t) =>
              matchesTypeFilter(t, activeType)
            ).length,
          }))}
        />
        <PillRail
          ariaLabel="Order type"
          value={activeType}
          onValueChange={setActiveType}
          options={TYPE_TABS}
        />

        <span className="text-xs text-muted-foreground lg:ml-auto">
          <span className="tabular-nums">{columnCount}</span> column
          {columnCount === 1 ? "" : "s"}
          {fontScale !== 1 && ` · ${fontScale}x type`}
          {isTwoStep && " · 2-step workflow"}
          <span className="lg:hidden"> · stacked in the tablet&apos;s order</span>
        </span>
      </div>

      {isLoading ? (
        <>
          <div className="space-y-2 lg:hidden">
            <Skeleton className="h-32 w-full rounded-2xl" />
            <Skeleton className="h-24 w-full rounded-2xl" />
          </div>
          <div className="hidden gap-2 lg:flex">
            {Array.from({ length: columnCount }).map((_, i) => (
              <div key={i} className="flex-1 space-y-2">
                <Skeleton className="h-32 w-full rounded-2xl" />
                <Skeleton className="h-24 w-full rounded-2xl" />
              </div>
            ))}
          </div>
        </>
      ) : activeTickets.length === 0 ? (
        <CardGridEmpty
          title={`No ${activeStatusLabel.toLowerCase()} tickets${
            activeType === "all" ? "" : ` for ${activeTypeLabel}`
          }`}
          hint={
            activeType === "all"
              ? "Tickets appear here as the server routes them to this station."
              : "Switch the order type to All to see every ticket in this status."
          }
        />
      ) : (
        // font_scale is applied once here and every card sizes in em, so the
        // whole station scales the way the tablet's s() helper scales it.
        <div style={{ fontSize: `${14 * fontScale}px` }}>
          {/* Below `lg` a tablet's 4–8 columns would be ~80–180px each. One
              column in list order keeps the kitchen's reading order: a
              round-robin board read row by row is exactly the list order. */}
          <div className="flex flex-col gap-2 lg:hidden">
            {activeTickets.map(renderCard)}
          </div>
          <div className="hidden items-start gap-2 lg:flex">
            {columns.map((columnTickets, index) => (
              <div key={index} className="flex min-w-0 flex-1 flex-col gap-2">
                {columnTickets.map(renderCard)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
