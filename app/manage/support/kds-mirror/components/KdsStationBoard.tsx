"use client";

import * as React from "react";
import {
  AlertTriangle,
  ChevronRight,
  Clock,
  Flame,
  ShoppingBag,
  User,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PaginationBar } from "@/components/dashboard/PaginationBar";
import { useClientPagination } from "@/lib/hooks/useClientPagination";
import type {
  KdsDisplaySummary,
  KdsMirrorItem,
  KdsMirrorModifier,
  KdsMirrorTicket,
} from "@/app/manage/actions/kds-mirror";
import { CardGridEmpty } from "@/app/manage/transactions/components/ledger-primitives";
import {
  orderTypeLabel,
  PillRail,
  SegmentedFilter,
  WindowSelect,
} from "./kds-primitives";

// ---------------------------------------------------------------------------
// Station board.
//
// The filters and the ticket content are ported from the tablet's own KDS
// screen (app/(main)/kds.tsx in the Dexa-POS repo) so HQ sees the same tickets,
// in the same order, under the same tabs. Where the two repos disagree, the
// tablet wins.
//
// Ported deliberately, with the tablet as the source of truth:
//   STATUS_TABS       - note `ready` is labelled "Served", not "Ready".
//   TYPE_TABS         - All / Delivery / To Go / Dine-In.
//   matchesTypeFilter - ported, including its empty/NULL order_type falling
//                       through to Dine-In. One deliberate difference:
//                       qr_dine_in counts as Dine-In (2026-10-03). The port
//                       knew only dine_in, so QR dine-in tickets (43 orders on
//                       record) showed under All and under no type tab, and
//                       the type counts did not add up to All. If the tablet's
//                       kds.tsx still has the old check, its Dine-In tab has
//                       the same gap.
//   ALLERGEN_KEYWORDS - the tablet flags allergens on MODIFIER names, and does
//                       so unconditionally: it is NOT gated by the display's
//                       show_allergy_flags column despite that column existing.
//
// The tablet's column grid is NOT ported (changed 2026-10-03 at the user's
// request): from `md` the tickets are a paged table, one ticket per row with
// the full ticket in the expanded row; below `md` they are compact cards
// (§5.3, §13.4: no item instructions, the stale hint as one word).
// Rush, allergens, voids and refunds are carried by words and weight
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

/** The type filter as a phone dropdown: "All" needs its noun there. */
const TYPE_SELECT_OPTIONS = TYPE_TABS.map((tab) =>
  tab.key === "all" ? { ...tab, label: "All order types" } : tab
);

/** The tablet's matchesTypeFilter, plus qr_dine_in under Dine-In (see above). */
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
  return (
    t === "dine_in" ||
    t === "dine in" ||
    t === "qr_dine_in" ||
    t === "" ||
    !ticket.order_type
  );
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
  if (hours < 24) return `${hours}h ${totalMinutes % 60}m`;

  // A ticket left on the board for days reads "166d 18h", not "4002h 12m".
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
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

function StationItemRow({
  item,
  showInstructions = true,
}: {
  item: KdsMirrorItem;
  showInstructions?: boolean;
}) {
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

        {showInstructions && item.special_instructions && (
          <div className="mt-[0.1em] text-[0.85em] font-medium italic text-foreground">
            {item.special_instructions}
          </div>
        )}
      </div>
    </li>
  );
}

/** Short words for the stale hint, for the one-line Flags cell. */
function staleLabel(ticket: KdsMirrorTicket): string {
  return ticket.status === "ready" ? "Never cleared" : "Untouched";
}

/**
 * The flags a row shows in words: the things support scans the board for.
 * Linked order and the stale hint come first because they are why support is
 * here; then what the kitchen also sees (rush, allergens, voids, refunds).
 */
function ticketFlags(
  ticket: KdsMirrorTicket,
  hint: string | null,
  isLinked: boolean
): { label: string; title?: string }[] {
  const flags: { label: string; title?: string }[] = [];
  if (isLinked) flags.push({ label: "Linked order" });
  if (hint) flags.push({ label: staleLabel(ticket), title: hint });
  if (ticket.any_rush || ticket.prioritized) flags.push({ label: "Rush" });

  const allergens = new Set<string>();
  for (const item of ticket.items) {
    for (const modifier of item.modifiers) {
      const allergen = detectAllergen(modifier.modifier_name);
      if (allergen) allergens.add(allergen);
    }
  }
  if (allergens.size > 0) {
    flags.push({ label: `Allergen: ${Array.from(allergens).join(", ")}` });
  }
  if (ticket.items.some((item) => item.is_voided)) flags.push({ label: "Void" });
  if (ticket.items.some((item) => item.is_refunded)) {
    flags.push({ label: "Refunded" });
  }
  return flags;
}

function ticketNumberLabel(ticket: KdsMirrorTicket): string {
  const number = ticket.display_number ?? ticket.order_number;
  // display_number can already carry its "#"; never print "##0001".
  return number != null ? `#${String(number).replace(/^#+/, "")}` : "—";
}

/** "2× Burger, Fries" for the one-line Items cell. */
function itemsSummary(ticket: KdsMirrorTicket): string {
  return ticket.items
    .map((item) =>
      item.quantity > 1
        ? `${item.quantity}× ${item.name ?? "Unnamed item"}`
        : (item.name ?? "Unnamed item")
    )
    .join(", ");
}

function ticketWhere(ticket: KdsMirrorTicket): string {
  return (
    [
      orderTypeLabel(ticket.order_type),
      ticket.table_name && `Table ${ticket.table_name}`,
      ticket.course_number > 1 && `C${ticket.course_number}`,
    ]
      .filter(Boolean)
      .join(" · ") || "—"
  );
}

/**
 * The expanded table row: the items as rows on the left (the same material as
 * the send ledger's expanded items), the facts about the ticket on the right
 * (guest or server, order note, the stale hint in full). Stacks below `lg`,
 * where the table is too narrow for two columns.
 *
 * The phone card keeps the kitchen-ticket layout (`TicketDetail`), which suits
 * a narrow card; this layout suits a wide row. Both show the same fields.
 */
function TicketRowDetail({
  ticket,
  showOrderNotes,
  hint,
}: {
  ticket: KdsMirrorTicket;
  showOrderNotes: boolean;
  hint: string | null;
}) {
  const units = ticket.items.reduce((sum, item) => sum + item.quantity, 0);
  const facts: { label: string; value: string }[] = [];
  if (ticket.customer_name) {
    facts.push({ label: "Guest", value: ticket.customer_name });
  } else if (ticket.server_name) {
    // NULL when the display has show_server_name off (applied server-side).
    facts.push({ label: "Server", value: ticket.server_name });
  }
  if (showOrderNotes && ticket.order_notes) {
    facts.push({ label: "Order note", value: ticket.order_notes });
  }
  if (hint) facts.push({ label: staleLabel(ticket), value: hint });

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="min-w-0">
        <p className="mb-2 text-xs text-muted-foreground">
          <span className="tabular-nums">{units}</span>{" "}
          {units === 1 ? "item" : "items"}
          {ticket.items.length !== units && (
            <>
              {" "}
              on <span className="tabular-nums">{ticket.items.length}</span>{" "}
              {ticket.items.length === 1 ? "line" : "lines"}
            </>
          )}
        </p>
        {ticket.items.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No items on this ticket.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {ticket.items.map((item) => (
              <li
                key={item.id}
                className="flex items-start gap-3 rounded-2xl bg-background/70 px-3 py-2"
              >
                <span className="w-6 shrink-0 text-right text-sm font-semibold tabular-nums">
                  {item.quantity}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span
                      className={cn(
                        "text-sm font-medium",
                        item.is_voided && "text-muted-foreground line-through"
                      )}
                    >
                      {item.name ?? "Unnamed item"}
                    </span>
                    {item.rush && <FlagWord>Rush</FlagWord>}
                    {item.is_to_go && <FlagWord>To go</FlagWord>}
                    {item.is_voided && <FlagWord>Void</FlagWord>}
                    {item.is_refunded && <FlagWord>Refunded</FlagWord>}
                  </div>
                  {item.modifiers.length > 0 && (
                    <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                      {item.modifiers.map((modifier, index) => (
                        <ModifierLine key={index} modifier={modifier} />
                      ))}
                    </div>
                  )}
                  {item.special_instructions && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {item.special_instructions}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {facts.length > 0 && (
        <dl className="min-w-0 space-y-3 text-sm">
          {facts.map((fact) => (
            <div key={fact.label}>
              <dt className="text-xs text-muted-foreground">{fact.label}</dt>
              <dd className="mt-0.5 break-words">{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/**
 * The full ticket below its header, as the kitchen sees it: who, the items
 * with modifiers and instructions, the order notes and the stale hint. The
 * phone card renders it; the table's expanded row uses `TicketRowDetail`.
 */
function TicketDetail({
  ticket,
  showOrderNotes,
  isHighlighted,
  hint,
  compact = false,
}: {
  ticket: KdsMirrorTicket;
  showOrderNotes: boolean;
  isHighlighted: boolean;
  hint: string | null;
  /** Phone card: no item instructions, and the stale hint is said in the header. */
  compact?: boolean;
}) {
  return (
    <>
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
          <StationItemRow
            key={item.id}
            item={item}
            showInstructions={!compact}
          />
        ))}
      </ul>

      {showOrderNotes && ticket.order_notes && (
        <p className="mt-[0.4em] text-[0.85em] italic text-muted-foreground">
          {ticket.order_notes}
        </p>
      )}

      {/* Not an HQ-2 alarm: marked by weight and words, never a tinted wash. */}
      {hint && !compact && (
        <div className="mt-[0.5em] flex items-start gap-1 text-[0.8em] font-medium text-foreground">
          <AlertTriangle className="mt-[0.15em] h-[0.9em] w-[0.9em] shrink-0 text-muted-foreground" />
          <span>{hint}</span>
        </div>
      )}
    </>
  );
}

/** One ticket as a card, below `md` (§5.3). */
export function StationTicketCard({
  ticket,
  now,
  showOrderNotes,
  isHighlighted,
  hint,
}: {
  ticket: KdsMirrorTicket;
  now: number;
  showOrderNotes: boolean;
  isHighlighted: boolean;
  hint: string | null;
}) {
  const isRush = ticket.any_rush || ticket.prioritized;

  return (
    <div
      className={cn(
        // The record-card material (§5.3). The linked order is the selected
        // state — a ring, not a coloured border — and says so in words.
        "min-w-0 rounded-2xl bg-muted/45 p-[0.75em]",
        isHighlighted && "bg-muted ring-1 ring-border"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2">
            <span className="truncate font-semibold tabular-nums">
              {ticketNumberLabel(ticket)}
            </span>
            {isRush && (
              <span className="inline-flex items-center gap-0.5">
                <Flame className="h-[0.9em] w-[0.9em] text-muted-foreground" />
                <FlagWord>Rush</FlagWord>
              </span>
            )}
            {/* The stale hint in one word; the sentence is in its tooltip. */}
            {hint && (
              <span title={hint}>
                <FlagWord>{staleLabel(ticket)}</FlagWord>
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 text-[0.8em] text-muted-foreground">
            {/* No order type on the phone card: the type filter above already
                scopes the list, and the table shows it from `xl`. */}
            {ticket.table_name && <span>Table {ticket.table_name}</span>}
            {ticket.course_number > 1 && <span>C{ticket.course_number}</span>}
          </div>
        </div>

        <span className="flex shrink-0 items-center gap-1 font-medium tabular-nums">
          <Clock className="h-[0.9em] w-[0.9em] text-muted-foreground" />
          {elapsed(ticket.start_time, now)}
        </span>
      </div>

      <TicketDetail
        ticket={ticket}
        showOrderNotes={showOrderNotes}
        isHighlighted={isHighlighted}
        hint={hint}
        compact
      />
    </div>
  );
}

/** Page size for the board table and its cards (UI-DESIGN-SYSTEM §5.7). */
const BOARD_PAGE_SIZE = 10;

/** The table's column count, for the full-width expanded row. */
const BOARD_COLUMNS = 7;

/** One ticket as a one-line table row that expands into the full ticket. */
function TicketRow({
  ticket,
  now,
  showOrderNotes,
  isHighlighted,
  hint,
}: {
  ticket: KdsMirrorTicket;
  now: number;
  showOrderNotes: boolean;
  isHighlighted: boolean;
  hint: string | null;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const toggle = () => setExpanded((v) => !v);
  const flags = ticketFlags(ticket, hint, isHighlighted);
  const summary = itemsSummary(ticket);
  const who = ticket.customer_name ?? ticket.server_name;

  return (
    <React.Fragment>
      <TableRow
        className={cn(
          "cursor-pointer",
          // Attention by weight, not a tinted row (§3.5).
          (hint || isHighlighted) && "font-medium"
        )}
        data-state={expanded || isHighlighted ? "selected" : undefined}
        onClick={toggle}
      >
        <TableCell className="pr-0">
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={`${expanded ? "Hide" : "Show"} ticket ${ticketNumberLabel(ticket)}`}
            onClick={(event) => {
              event.stopPropagation();
              toggle();
            }}
            className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronRight
              className={cn("h-4 w-4 transition-transform", expanded && "rotate-90")}
            />
          </button>
        </TableCell>
        <TableCell className="truncate font-medium tabular-nums">
          {ticketNumberLabel(ticket)}
        </TableCell>
        <TableCell
          className="hidden truncate text-muted-foreground lg:table-cell"
          title={summary || undefined}
        >
          {summary || "No items"}
        </TableCell>
        <TableCell className="hidden truncate text-muted-foreground xl:table-cell">
          {ticketWhere(ticket)}
        </TableCell>
        <TableCell
          className="hidden truncate text-muted-foreground xl:table-cell"
          title={who ?? undefined}
        >
          {who ?? "—"}
        </TableCell>
        <TableCell className="truncate text-right tabular-nums">
          {elapsed(ticket.start_time, now)}
        </TableCell>
        <TableCell
          className="truncate"
          title={flags.map((flag) => flag.title ?? flag.label).join("\n") || undefined}
        >
          {flags.length > 0 ? (
            flags.map((flag) => flag.label).join(" · ")
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow className="hover:bg-transparent">
          <TableCell
            colSpan={BOARD_COLUMNS}
            className="whitespace-normal bg-muted/30 px-6 py-4"
          >
            <TicketRowDetail
              ticket={ticket}
              showOrderNotes={showOrderNotes}
              hint={hint}
            />
          </TableCell>
        </TableRow>
      )}
    </React.Fragment>
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

  // v3 already returns rush/prioritised first, then oldest: the order the
  // tablet renders, and the "rank before you slice" order for paging (§5.7).
  const activeTickets = React.useMemo(
    () => byStatus[activeStatus].filter((t) => matchesTypeFilter(t, activeType)),
    [byStatus, activeStatus, activeType]
  );
  const { pageRows, pagination, setPage } = useClientPagination(
    activeTickets,
    BOARD_PAGE_SIZE
  );

  const statusOptions = visibleStatusTabs.map((tab) => ({
    key: tab.key,
    label: tab.label,
    count: byStatus[tab.key].filter((t) => matchesTypeFilter(t, activeType))
      .length,
  }));
  const changeStatus = (value: StatusFilter) => {
    setActiveStatus(value);
    setPage(1);
  };
  const changeType = (value: OrderTypeFilter) => {
    setActiveType(value);
    setPage(1);
  };

  const activeStatusLabel =
    STATUS_TABS.find((t) => t.key === activeStatus)?.label ?? activeStatus;
  const activeTypeLabel =
    TYPE_TABS.find((t) => t.key === activeType)?.label ?? activeType;

  const ticketProps = (ticket: KdsMirrorTicket) => ({
    ticket,
    now,
    showOrderNotes,
    isHighlighted: !!highlightOrderId && ticket.order_id === highlightOrderId,
    // The one thing on this board the kitchen does not see, and the reason
    // the tool exists: a ticket parked in Served that was never bumped, or
    // one sitting in Pending untouched.
    hint: stalenessHint(ticket, now),
  });

  return (
    <div className={cn("min-w-0 space-y-4", className)}>
      {/*
        Phones: status is a segmented bar that always fits (label over count),
        order type a dropdown, so nothing scrolls or is cut off. From `sm` the
        two pill rails, which have room.
      */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        <SegmentedFilter
          ariaLabel="Ticket status"
          value={activeStatus}
          onValueChange={changeStatus}
          options={statusOptions}
          className="w-full sm:hidden"
        />
        <div className="w-full sm:hidden">
          <WindowSelect
            ariaLabel="Order type"
            value={activeType}
            onValueChange={changeType}
            options={TYPE_SELECT_OPTIONS}
          />
        </div>
        <PillRail
          ariaLabel="Ticket status"
          value={activeStatus}
          onValueChange={changeStatus}
          options={statusOptions}
          className="max-sm:hidden"
        />
        <PillRail
          ariaLabel="Order type"
          value={activeType}
          onValueChange={changeType}
          options={TYPE_TABS}
          className="max-sm:hidden"
        />

        {/* Says why there is no Pending tab. */}
        {isTwoStep && (
          <span className="text-xs text-muted-foreground lg:ml-auto">
            2-step workflow
          </span>
        )}
      </div>

      {isLoading ? (
        // Skeletons match the breakpoint (§5.4): table rows from `md`, cards below.
        <>
          <div className="hidden space-y-2 md:block">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-2xl" />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:hidden">
            <Skeleton className="h-32 w-full rounded-2xl" />
            <Skeleton className="h-24 w-full rounded-2xl" />
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
        <div className="min-w-0">
          {/*
            §5.3 (D-26): the table from `md`, cards below. Columns are tiered
            so nothing scrolls sideways: ticket, elapsed and flags from `md`
            (flags carry the stale hint, the reason this view exists); items
            from `lg`; type/table and server/guest from `xl`. One line per
            row (§5.7); the full ticket is in the expanded row.
          */}
          <Table
            variant="data"
            bounded={false}
            containerClassName="hidden md:block"
            className="table-fixed"
          >
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-11">
                  <span className="sr-only">Expand</span>
                </TableHead>
                <TableHead className="w-28">Ticket</TableHead>
                <TableHead className="hidden lg:table-cell">Items</TableHead>
                <TableHead className="hidden w-40 xl:table-cell">
                  Type / table
                </TableHead>
                <TableHead className="hidden w-36 xl:table-cell">
                  Server / guest
                </TableHead>
                <TableHead className="w-24 text-right">Elapsed</TableHead>
                <TableHead className="w-40">Flags</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.map((ticket) => (
                <TicketRow key={ticket.ticket_id} {...ticketProps(ticket)} />
              ))}
            </TableBody>
          </Table>

          {/* Cards size in em, so they keep the ticket's own proportions. */}
          <div
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:hidden"
            style={{ fontSize: "14px" }}
          >
            {pageRows.map((ticket) => (
              <StationTicketCard key={ticket.ticket_id} {...ticketProps(ticket)} />
            ))}
          </div>

          <PaginationBar
            pagination={pagination}
            onPageChange={setPage}
            itemLabel="tickets"
          />
          {activeTickets.length <= BOARD_PAGE_SIZE && (
            <p className="mt-3 text-xs text-muted-foreground tabular-nums sm:text-sm">
              {activeTickets.length}{" "}
              {activeTickets.length === 1 ? "ticket" : "tickets"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
