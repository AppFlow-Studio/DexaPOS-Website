"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { format, formatDistanceToNowStrict } from "date-fns";
import {
  Clock,
  MessageSquare,
  MessageSquarePlus,
  Search,
  TrendingUp,
  Users,
} from "lucide-react";

import { PageHeader, PageShell, Panel, StatRow, StatTile } from "@/components/dashboard/shell";
import { PaginationBar } from "@/components/dashboard/PaginationBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { PaginationMeta } from "@/types/pagination";
import {
  CardField,
  CardFields,
  CardGridEmpty,
  FilterSelect,
  LoadError,
  RecordCard,
  TableEmptyRow,
} from "@/app/manage/transactions/components/ledger-primitives";
import {
  GetAllTickets,
  GetSupportStats,
  GetUnreadTicketCounts,
} from "../actions/support";
import {
  SupportTicket,
  TicketCategory,
  TicketFilters,
  TicketPriority,
  TicketStatus,
  TICKET_CATEGORY_LABELS,
  TICKET_PRIORITY_LABELS,
  getTicketStatusLabel,
} from "@/types/support-ticket";
import { useUserInfo } from "../hooks/useUserInfo.";
import { useAdminPermissions } from "@/lib/hooks/useAdminPermissions";
import RouteLoading from "./loading";

/*
 * UI-DESIGN-SYSTEM skeleton A (list + filters + table), HQ flavour (§14.1):
 * a KPI panel, then one panel holding the status rail, the toolbar, the
 * table well and its pager (§5.2).
 *
 * The list's state — status tab, filters, search and page — lives in the URL
 * (§5.9, D-28), so Back from a ticket lands on the same page of 10.
 */

const SUPPORT_HREF = "/manage/support";
const PAGE_SIZE = 10;
const COLUMN_COUNT = 6;
const SEARCH_DELAY_MS = 300;

const STATUS_TABS = [
  { key: "open", label: "Open" },
  { key: "in_progress", label: "In Progress" },
  { key: "waiting_on_merchant", label: "Waiting" },
  { key: "resolved", label: "Resolved" },
  { key: "all", label: "All" },
] as const;

type StatusKey = (typeof STATUS_TABS)[number]["key"];

/** §4.9: when nothing matches, say which list is empty — good news as good news. */
const EMPTY_BY_STATUS: Record<StatusKey, { title: string; hint: string }> = {
  open: {
    title: "All clear — no open tickets",
    hint: "New merchant requests and developer tickets will appear here.",
  },
  in_progress: {
    title: "No tickets in progress",
    hint: "Tickets move here once someone starts working on them.",
  },
  waiting_on_merchant: {
    title: "No tickets waiting on a reply",
    hint: "Tickets waiting on the merchant or reporter will appear here.",
  },
  resolved: {
    title: "No resolved tickets yet",
    hint: "Tickets appear here once they are marked resolved.",
  },
  all: {
    title: "No support tickets yet",
    hint: "Merchant requests and developer tickets will appear here.",
  },
};

const SCOPE_OPTIONS = [
  { value: "merchant", label: "Merchant" },
  { value: "hq_internal", label: "Developer tickets" },
];

const CATEGORY_OPTIONS = Object.entries(TICKET_CATEGORY_LABELS).map(([value, label]) => ({
  value,
  label,
}));

const PRIORITY_OPTIONS = (["urgent", "high", "normal", "low"] as const).map((value) => ({
  value,
  label: TICKET_PRIORITY_LABELS[value],
}));

/**
 * "Assigned to me" is `assignee=me` in the URL, resolved to the viewer's id at
 * query time, so a shared or bookmarked link never carries someone's user id.
 */
const ASSIGNEE_OPTIONS = [
  { value: "unassigned", label: "Unassigned" },
  { value: "me", label: "Assigned to me" },
];

/** The filter URL params, all cleared by "Clear filters". The status tab is not a filter. */
const FILTER_PARAMS = ["q", "source", "category", "priority", "assignee"] as const;

/**
 * The list's one-word status, as the tab rail words it: the table and the phone
 * card have room for "Waiting", not "Waiting on Merchant". The full label rides
 * in the `title` and on the ticket page.
 */
const SHORT_STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  waiting_on_merchant: "Waiting",
  resolved: "Resolved",
  closed: "Closed",
};

type TicketListRow = SupportTicket & {
  merchant?: { name: string } | null;
  location?: { name: string } | null;
};

/** One of `allowed`, or `null` for a missing or hand-edited param. */
function pick<T extends string>(raw: string | null, allowed: readonly T[]): T | null {
  return raw !== null && (allowed as readonly string[]).includes(raw) ? (raw as T) : null;
}

function positivePage(raw: string | null): number {
  const page = Number(raw ?? "1");
  return Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
}

/** Who raised it: the merchant, or DEXA HQ for developer tickets. */
function ticketSource(ticket: TicketListRow) {
  if (ticket.ticket_scope === "hq_internal") return "DEXA HQ";
  return ticket.merchant?.name || "Unknown merchant";
}

/** Merchant · location · category, for the source cell's tooltip. */
function ticketContext(ticket: TicketListRow) {
  const category = TICKET_CATEGORY_LABELS[ticket.category];
  if (ticket.ticket_scope === "hq_internal") {
    return ["DEXA HQ", "Developer ticket", category].join(" · ");
  }
  return [ticket.merchant?.name || "Unknown merchant", ticket.location?.name, category]
    .filter(Boolean)
    .join(" · ");
}

/** The assignee's name, or `null` when nobody has picked the ticket up. */
function assigneeLabel(ticket: TicketListRow): string | null {
  const emails = Array.isArray(ticket.assigned_to_emails) ? ticket.assigned_to_emails : [];
  if (!ticket.assigned_to && emails.length === 0) return null;
  if (ticket.ticket_scope === "hq_internal") {
    return emails.length > 1 ? `${emails[0]} +${emails.length - 1}` : emails[0] || "Assigned";
  }
  return ticket.assigned_to_name || "Assigned";
}

/** High/urgent and still open. Marked by weight, never a red edge (§3.5). */
function needsAttention(ticket: TicketListRow) {
  return (
    (ticket.priority === "urgent" || ticket.priority === "high") &&
    !["resolved", "closed"].includes(ticket.status)
  );
}

/** "2 hours ago": the strict form drops "about", so the column stays narrow. */
function lastActivity(ticket: TicketListRow) {
  return formatDistanceToNowStrict(new Date(ticket.last_message_at), { addSuffix: true });
}

/** Unknown is not zero (§4.9): a missing average renders "—". */
function hoursValue(value: unknown) {
  if (value === null || value === undefined) return null;
  const hours = Number(value);
  return Number.isFinite(hours)
    ? hours.toLocaleString(undefined, { maximumFractionDigits: 1 })
    : null;
}

function HoursFigure({ value }: { value: string | null }) {
  if (value === null) return <>—</>;
  return (
    <>
      {value}
      <span className="ml-1 text-sm font-normal text-muted-foreground">hrs</span>
    </>
  );
}

export default function AdminSupportPage() {
  // useSearchParams needs a Suspense boundary; the fallback is the route skeleton.
  return (
    <Suspense fallback={<RouteLoading />}>
      <SupportInbox />
    </Suspense>
  );
}

function SupportInbox() {
  const router = useRouter();
  const { data: userInfo } = useUserInfo();
  const { hasPermission } = useAdminPermissions();
  const canCreateTicket = hasPermission("hq.support.manage");

  const searchParams = useSearchParams();
  // Memo on the string: useSearchParams() returns a new object every render.
  const listQuery = searchParams.toString();
  const params = useMemo(() => new URLSearchParams(listQuery), [listQuery]);

  /**
   * Writes to the URL. Any change but a page turn sends the list back to page
   * 1. A patch that changes nothing is a no-op, so the settled search never
   * wipes a restored page.
   */
  const updateParams = useCallback(
    (patch: Record<string, string | null>, { resetPage = true }: { resetPage?: boolean } = {}) => {
      const next = new URLSearchParams(listQuery);
      let changed = false;
      for (const [key, value] of Object.entries(patch)) {
        if (value) {
          if (next.get(key) !== value) {
            next.set(key, value);
            changed = true;
          }
        } else if (next.has(key)) {
          next.delete(key);
          changed = true;
        }
      }
      if (!changed) return;
      if (resetPage) next.delete("page");
      const query = next.toString();
      router.replace(query ? `?${query}` : SUPPORT_HREF, { scroll: false });
    },
    [listQuery, router],
  );

  const search = params.get("q") ?? "";

  // Search types into local state and reaches the URL once typing settles.
  const [searchInput, setSearchInput] = useState(search);
  // The last `q` this page wrote. A different `q` arriving in the URL came
  // from outside (e.g. the sidebar link back to a bare inbox), so the box
  // follows it instead of the debounce writing the stale text back.
  const writtenSearch = useRef(search);
  useEffect(() => {
    if (search === writtenSearch.current) return;
    writtenSearch.current = search;
    setSearchInput(search);
  }, [search]);
  useEffect(() => {
    const timer = setTimeout(() => {
      const q = searchInput.trim();
      writtenSearch.current = q;
      updateParams({ q: q || null });
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [searchInput, updateParams]);

  const activeStatus: StatusKey =
    pick(params.get("status"), STATUS_TABS.map((tab) => tab.key)) ?? "open";
  const source = pick(params.get("source"), ["merchant", "hq_internal"] as const);
  const category = pick(
    params.get("category"),
    Object.keys(TICKET_CATEGORY_LABELS) as TicketCategory[],
  );
  const priority = pick(
    params.get("priority"),
    PRIORITY_OPTIONS.map((option) => option.value) as TicketPriority[],
  );
  const assignee = pick(params.get("assignee"), ["unassigned", "me"] as const);
  const page = positivePage(params.get("page"));

  const myId = userInfo?.id;
  const effectiveFilters = useMemo<TicketFilters>(
    () => ({
      status: activeStatus,
      ticket_scope: source ?? undefined,
      category: category ?? undefined,
      priority: priority ?? undefined,
      assigned_to: assignee === "me" ? myId : (assignee ?? undefined),
      search: search || undefined,
    }),
    [activeStatus, source, category, priority, assignee, myId, search],
  );

  const {
    data: ticketsResult,
    isPending: ticketsPending,
    isFetching: ticketsFetching,
    isPlaceholderData: ticketsPlaceholder,
    isError: ticketsThrew,
    error: ticketsError,
    refetch: refetchTickets,
  } = useQuery({
    queryKey: ["admin-support-tickets", effectiveFilters, page],
    queryFn: () => GetAllTickets(effectiveFilters, PAGE_SIZE, (page - 1) * PAGE_SIZE),
    // "Assigned to me" waits for the viewer's id rather than listing everyone.
    enabled: assignee !== "me" || !!myId,
    // Paging and filtering keep the current rows on screen until the next
    // page lands, instead of flashing the skeleton on every click.
    placeholderData: keepPreviousData,
  });

  const {
    data: statsResult,
    isLoading: statsLoading,
    isError: statsThrew,
  } = useQuery({
    queryKey: ["admin-support-stats"],
    queryFn: () => GetSupportStats(),
    refetchInterval: 60_000,
  });

  const { data: unreadCounts } = useQuery({
    queryKey: ["hq-unread-ticket-counts"],
    queryFn: GetUnreadTicketCounts,
    staleTime: 30_000,
  });

  const stats = statsResult?.data;
  const statsFailed = statsThrew || !!statsResult?.error;
  const tickets = (ticketsResult?.data ?? []) as TicketListRow[];
  const hasRows = !!ticketsResult?.data;
  const total = ticketsResult?.total ?? 0;
  const ticketsFailed = ticketsThrew || !!ticketsResult?.error;
  const ticketsErrorDetail =
    ticketsResult?.error ?? (ticketsError instanceof Error ? ticketsError.message : undefined);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const setPage = useCallback(
    (next: number) => updateParams({ page: next > 1 ? String(next) : null }, { resetPage: false }),
    [updateParams],
  );

  // Clamp the page (§5.7) if the list shrinks under the user, e.g. a ticket
  // resolved elsewhere empties the last page, or a restored URL points past
  // the end. Only against a real result: never a placeholder or a failure,
  // whose total would read as 0.
  useEffect(() => {
    if (!hasRows || ticketsPlaceholder || ticketsFetching || page <= totalPages) return;
    setPage(totalPages);
  }, [hasRows, ticketsPlaceholder, ticketsFetching, page, totalPages, setPage]);

  const pagination: PaginationMeta = {
    page,
    pageSize: PAGE_SIZE,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };

  const unreadByTicket = useMemo(
    () => new Map((unreadCounts?.perTicket ?? []).map((entry) => [entry.ticket_id, entry.count])),
    [unreadCounts],
  );

  const setFilter = (key: (typeof FILTER_PARAMS)[number], value: string) =>
    updateParams({ [key]: value === "all" ? null : value });

  const hasActiveFilters =
    searchInput.trim() !== "" || FILTER_PARAMS.some((key) => key !== "q" && params.has(key));

  const clearFilters = () => {
    setSearchInput("");
    updateParams(Object.fromEntries(FILTER_PARAMS.map((key) => [key, null])));
  };

  const empty = hasActiveFilters
    ? {
        title: "No tickets match these filters",
        hint: "Clear the search or filters to widen the results.",
      }
    : EMPTY_BY_STATUS[activeStatus];

  // §13.2: keep the active status pill in view by scrolling the rail itself.
  const railRef = useRef<HTMLDivElement>(null);
  const railPositioned = useRef(false);
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    let done = false;
    const align = () => {
      const max = rail.scrollWidth - rail.clientWidth;
      const tab = rail.querySelector<HTMLElement>('[data-state="active"]');
      if (done || !tab || max <= 0) return;
      const left = tab.offsetLeft - (rail.clientWidth - tab.offsetWidth) / 2;
      const smooth =
        railPositioned.current && !matchMedia("(prefers-reduced-motion: reduce)").matches;
      rail.scrollTo({ left: Math.max(0, Math.min(left, max)), behavior: smooth ? "smooth" : "auto" });
      railPositioned.current = done = true;
    };
    align();
    const observer = new ResizeObserver(align);
    observer.observe(rail);
    return () => observer.disconnect();
  }, [activeStatus]);

  // `isPending`, not `isLoading`: an "Assigned to me" query waiting on the
  // viewer's id is pending without fetching, and must not read as empty.
  const showSkeleton = ticketsPending && !ticketsFailed;
  const ticketHref = (ticket: TicketListRow) => `/manage/support/${ticket.id}`;

  return (
    /* `as="div"`: app/manage/layout.tsx already owns this surface's <main>. */
    <PageShell as="div">
      <PageHeader
        title="Support Inbox"
        subtitle="Manage merchant support requests and internal developer tickets"
        actions={
          <>
            {canCreateTicket && (
              <Button asChild className="h-11 px-4 sm:h-9">
                <Link href="/manage/support/new">
                  <MessageSquarePlus className="h-3.5 w-3.5" />
                  New Developer Ticket
                </Link>
              </Button>
            )}
          </>
        }
      />

      <Panel>
        <div className="px-4 py-6 sm:px-6">
          <StatRow columns={4}>
            <StatTile
              label="Open tickets"
              icon={<MessageSquare />}
              isLoading={statsLoading}
              value={stats ? Number(stats.open_count ?? 0).toLocaleString() : "—"}
              meta={statsFailed ? "Couldn't load" : undefined}
              showMetaOnMobile
            />
            <StatTile
              label="Unassigned"
              icon={<Users />}
              isLoading={statsLoading}
              value={stats ? Number(stats.unassigned_count ?? 0).toLocaleString() : "—"}
              meta={statsFailed ? "Couldn't load" : undefined}
              showMetaOnMobile
            />
            <StatTile
              label="Avg first response"
              icon={<Clock />}
              isLoading={statsLoading}
              value={<HoursFigure value={hoursValue(stats?.avg_first_response_hours)} />}
              meta={
                statsFailed
                  ? "Couldn't load"
                  : stats && hoursValue(stats.avg_first_response_hours) === null
                    ? "No responses yet"
                    : undefined
              }
              showMetaOnMobile
            />
            <StatTile
              label="Avg resolution"
              icon={<TrendingUp />}
              isLoading={statsLoading}
              value={<HoursFigure value={hoursValue(stats?.avg_resolution_hours)} />}
              meta={
                statsFailed
                  ? "Couldn't load"
                  : stats && hoursValue(stats.avg_resolution_hours) === null
                    ? "No resolved tickets yet"
                    : undefined
              }
              showMetaOnMobile
            />
          </StatRow>
        </div>
      </Panel>

      <Panel padded>
        {/* Status rail (§4.5): pill segments, neutral active state. Scrolls
            rather than wraps on a phone; the scrollbar stays hidden. */}
        <div
          ref={railRef}
          className="relative w-full min-w-0 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <div
            role="group"
            aria-label="Ticket status"
            className="inline-flex h-auto w-max flex-nowrap gap-0.5 rounded-full bg-muted/70 p-1"
          >
            {STATUS_TABS.map((tab) => {
              const isActive = activeStatus === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  data-state={isActive ? "active" : "inactive"}
                  aria-pressed={isActive}
                  onClick={() => updateParams({ status: tab.key === "open" ? null : tab.key })}
                  className={cn(
                    "shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-medium transition-colors",
                    isActive
                      ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Toolbar (§5.2): search left, borderless muted filter pills right. */}
        <div className="mt-4 flex min-w-0 flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
          <div className="relative min-w-0 lg:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
            <Input
              aria-label="Search tickets"
              placeholder="Search subject, submitter or ticket #"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="h-9 pl-9 text-[0.8125rem]"
            />
          </div>

          <div className="grid min-w-0 grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
            <FilterSelect
              ariaLabel="Source"
              allLabel="All sources"
              value={source ?? "all"}
              onValueChange={(v) => setFilter("source", v)}
              options={SCOPE_OPTIONS}
              className="sm:w-40"
            />
            <FilterSelect
              ariaLabel="Category"
              allLabel="All categories"
              value={category ?? "all"}
              onValueChange={(v) => setFilter("category", v)}
              options={CATEGORY_OPTIONS}
              className="sm:w-44"
            />
            <FilterSelect
              ariaLabel="Priority"
              allLabel="All priorities"
              value={priority ?? "all"}
              onValueChange={(v) => setFilter("priority", v)}
              options={PRIORITY_OPTIONS}
              className="sm:w-36"
            />
            <FilterSelect
              ariaLabel="Assignee"
              allLabel="Anyone"
              value={assignee ?? "all"}
              onValueChange={(v) => setFilter("assignee", v)}
              options={ASSIGNEE_OPTIONS}
              className="sm:w-40"
            />
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="col-span-2 h-9 px-4 sm:col-span-1"
                onClick={clearFilters}
              >
                Clear filters
              </Button>
            )}
          </div>
        </div>

        <div className="mt-5 min-w-0">
          {/* §4.9: a failure is always said. With rows from an earlier load
              still on screen, the sentence sits above them rather than
              replacing them. */}
          {ticketsFailed && (
            <LoadError
              title="We hit a snag loading tickets"
              detail={ticketsErrorDetail}
              onRetry={() => void refetchTickets()}
              className={cn(hasRows && "mb-4")}
            />
          )}
          {(!ticketsFailed || hasRows) && (
            <>
              {/*
                §5.3 (D-26): the table from `md`, cards below. Inside the padded
                panel (48px + 2px border) the content column leaves 414px at
                `md`, 670 at `lg`, 926 at `xl`. Essential columns — ticket,
                status, last activity — take 128 + 128, leaving the ticket
                ~158px at `md`, so its number and unread count join at `xl`.
                Priority (96) and assignee (128) join at `lg` (ticket ~190);
                the source merchant (176) at `xl` (ticket ~222 with the
                assignee at 160). Location and category live on the ticket
                page. `table-fixed` truncates every cell to one line (§5.7).
              */}
              <Table
                variant="data"
                bounded={false}
                containerClassName="hidden md:block"
                className="table-fixed"
              >
                <TableHeader>
                  <TableRow>
                    <TableHead>Ticket</TableHead>
                    <TableHead className="hidden w-44 xl:table-cell">Merchant</TableHead>
                    <TableHead className="w-32">Status</TableHead>
                    <TableHead className="hidden w-24 lg:table-cell">Priority</TableHead>
                    <TableHead className="hidden w-32 lg:table-cell xl:w-40">Assignee</TableHead>
                    <TableHead className="w-32 text-right">Last activity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {showSkeleton ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-4 w-3/4" /></TableCell>
                        <TableCell className="hidden xl:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                        <TableCell className="hidden lg:table-cell"><Skeleton className="h-5 w-14 rounded-full" /></TableCell>
                        <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-20" /></TableCell>
                        <TableCell><Skeleton className="ml-auto h-4 w-20" /></TableCell>
                      </TableRow>
                    ))
                  ) : tickets.length === 0 ? (
                    <TableEmptyRow colSpan={COLUMN_COUNT} title={empty.title} hint={empty.hint} />
                  ) : (
                    tickets.map((ticket) => {
                      const unread = unreadByTicket.get(ticket.id) ?? 0;
                      const assignee = assigneeLabel(ticket);
                      const statusLabel = getTicketStatusLabel(ticket.status, ticket.ticket_scope);
                      return (
                        <TableRow
                          key={ticket.id}
                          className="cursor-pointer"
                          onClick={() => router.push(ticketHref(ticket))}
                        >
                          {/* One line (§5.7): number, unread count, subject. */}
                          <TableCell>
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="hidden shrink-0 font-mono text-xs text-muted-foreground xl:inline">
                                {ticket.ticket_number}
                              </span>
                              {unread > 0 && (
                                <span className="hidden shrink-0 xl:inline-flex">
                                  <Badge variant="outline" className="text-foreground tabular-nums">
                                    {unread} unread
                                  </Badge>
                                </span>
                              )}
                              <Link
                                href={ticketHref(ticket)}
                                onClick={(e) => e.stopPropagation()}
                                title={`${ticket.ticket_number} · ${ticket.subject}`}
                                className={cn(
                                  "min-w-0 truncate text-sm hover:underline",
                                  unread > 0 ? "font-semibold" : "font-medium",
                                )}
                              >
                                {ticket.subject}
                              </Link>
                              {unread > 0 && (
                                <span className="sr-only xl:hidden">, {unread} unread</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell
                            className="hidden truncate text-sm text-muted-foreground xl:table-cell"
                            title={ticketContext(ticket)}
                          >
                            {ticketSource(ticket)}
                          </TableCell>
                          <TableCell title={statusLabel}>
                            <Badge variant="outline">{SHORT_STATUS_LABELS[ticket.status]}</Badge>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            <Badge
                              variant="outline"
                              className={cn(needsAttention(ticket) && "font-semibold text-foreground")}
                            >
                              {TICKET_PRIORITY_LABELS[ticket.priority]}
                            </Badge>
                          </TableCell>
                          <TableCell
                            className={cn(
                              "hidden truncate text-sm lg:table-cell",
                              assignee ? "text-muted-foreground" : "font-medium text-foreground",
                            )}
                            title={assignee ?? undefined}
                          >
                            {assignee ?? "Unassigned"}
                          </TableCell>
                          <TableCell
                            className="truncate text-right text-sm text-muted-foreground tabular-nums"
                            title={format(new Date(ticket.last_message_at), "PPpp")}
                          >
                            {lastActivity(ticket)}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>

              {/*
                §5.3 (D-27): subject and status lead, then four pairs. The
                ticket number, location and category are one tap away on the
                ticket page.
              */}
              <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 md:hidden">
                {showSkeleton ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="min-w-0 rounded-2xl bg-muted/45 p-4">
                      <div className="flex h-6 items-center justify-between gap-3">
                        <Skeleton className="h-4 w-2/3" />
                        <Skeleton className="h-3 w-14" />
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
                        {Array.from({ length: 4 }).map((_, j) => (
                          <div key={j} className="min-w-0">
                            <Skeleton className="my-0.5 h-3 w-14" />
                            <Skeleton className="my-0.5 h-4 w-20 max-w-full" />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                ) : tickets.length === 0 ? (
                  <CardGridEmpty title={empty.title} hint={empty.hint} />
                ) : (
                  tickets.map((ticket) => {
                    const unread = unreadByTicket.get(ticket.id) ?? 0;
                    const assignee = assigneeLabel(ticket);
                    return (
                      <Link
                        key={ticket.id}
                        href={ticketHref(ticket)}
                        title={`${ticket.ticket_number} · ${ticket.subject}`}
                        className="block min-w-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <RecordCard className="h-full transition-colors hover:bg-muted">
                          <div className="flex min-w-0 items-baseline justify-between gap-3">
                            <p
                              className={cn(
                                "min-w-0 truncate",
                                unread > 0 ? "font-semibold" : "font-medium",
                              )}
                            >
                              {ticket.subject}
                            </p>
                            {/* On a muted card the status is plain text, not a pill (§5.3). */}
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {unread > 0 && (
                                <span className="font-medium text-foreground tabular-nums">
                                  {unread} unread ·{" "}
                                </span>
                              )}
                              {SHORT_STATUS_LABELS[ticket.status]}
                            </span>
                          </div>
                          <CardFields>
                            <CardField
                              label="Priority"
                              value={
                                <span
                                  className={cn(
                                    needsAttention(ticket) && "font-semibold text-foreground",
                                  )}
                                >
                                  {TICKET_PRIORITY_LABELS[ticket.priority]}
                                </span>
                              }
                            />
                            <CardField label="Assignee" value={assignee ?? "Unassigned"} />
                            <CardField label="Last activity" value={lastActivity(ticket)} />
                            <CardField label="Merchant" value={ticketSource(ticket)} />
                          </CardFields>
                        </RecordCard>
                      </Link>
                    );
                  })
                )}
              </div>

              <PaginationBar
                pagination={pagination}
                onPageChange={setPage}
                itemLabel="tickets"
                isLoading={ticketsFetching}
              />
              {total > 0 && total <= PAGE_SIZE && (
                <p className="mt-3 text-xs text-muted-foreground tabular-nums sm:text-sm">
                  {total.toLocaleString()} {total === 1 ? "ticket" : "tickets"}
                </p>
              )}
            </>
          )}
        </div>
      </Panel>
    </PageShell>
  );
}
