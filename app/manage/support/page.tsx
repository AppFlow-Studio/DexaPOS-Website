"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
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
  RecordCardSkeletons,
  TableEmptyRow,
} from "@/app/manage/transactions/components/ledger-primitives";
import {
  GetAllTickets,
  GetSupportStats,
  GetUnreadTicketCounts,
} from "../actions/support";
import {
  SupportTicket,
  TicketFilters,
  TICKET_CATEGORY_LABELS,
  TICKET_PRIORITY_LABELS,
  getTicketStatusLabel,
} from "@/types/support-ticket";
import { useUserInfo } from "../hooks/useUserInfo.";
import { useAdminPermissions } from "@/lib/hooks/useAdminPermissions";

/*
 * UI-DESIGN-SYSTEM skeleton A (list + filters + table), HQ flavour (§14.1):
 * a KPI panel, then one panel holding the status rail, the toolbar, the
 * table well and its pager (§5.2).
 */

const PAGE_SIZE = 10;
const COLUMN_COUNT = 5;

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

type TicketListRow = SupportTicket & {
  merchant?: { name: string } | null;
  location?: { name: string } | null;
};

/** Merchant · location · category, or the HQ equivalent for developer tickets. */
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
  const router = useRouter();
  const { data: userInfo } = useUserInfo();
  const { hasPermission } = useAdminPermissions();
  const canCreateTicket = hasPermission("hq.support.manage");

  const [activeStatus, setActiveStatus] = useState<StatusKey>("open");
  const [filters, setFilters] = useState<Omit<TicketFilters, "status">>({});
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const effectiveFilters: TicketFilters = {
    ...filters,
    status: activeStatus,
    search: search || undefined,
  };

  const {
    data: ticketsResult,
    isLoading: ticketsLoading,
    isFetching: ticketsFetching,
    isError: ticketsThrew,
    refetch: refetchTickets,
  } = useQuery({
    queryKey: ["admin-support-tickets", effectiveFilters, page],
    queryFn: () => GetAllTickets(effectiveFilters, PAGE_SIZE, (page - 1) * PAGE_SIZE),
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
  const total = ticketsResult?.total ?? 0;
  const ticketsFailed = ticketsThrew || !!ticketsResult?.error;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Clamp the page (§5.7) if the list shrinks under the user, e.g. a ticket
  // resolved elsewhere empties the last page. Adjusted during render rather
  // than in an effect, so the stranded page never paints.
  if (!ticketsFetching && page > totalPages) setPage(totalPages);

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

  const setFilter = <K extends keyof Omit<TicketFilters, "status">>(
    key: K,
    value: TicketFilters[K],
  ) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const hasActiveFilters =
    search.trim() !== "" ||
    Object.values(filters).some((value) => value !== undefined && value !== "all");

  const clearFilters = () => {
    setFilters({});
    setSearch("");
    setPage(1);
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

  const showSkeleton = ticketsLoading;
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
                  onClick={() => {
                    setActiveStatus(tab.key);
                    setPage(1);
                  }}
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
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="h-9 pl-9 text-[0.8125rem]"
            />
          </div>

          <div className="grid min-w-0 grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
            <FilterSelect
              ariaLabel="Source"
              allLabel="All sources"
              value={(filters.ticket_scope as string) || "all"}
              onValueChange={(v) => setFilter("ticket_scope", v as TicketFilters["ticket_scope"])}
              options={SCOPE_OPTIONS}
              className="sm:w-40"
            />
            <FilterSelect
              ariaLabel="Category"
              allLabel="All categories"
              value={(filters.category as string) || "all"}
              onValueChange={(v) => setFilter("category", v as TicketFilters["category"])}
              options={CATEGORY_OPTIONS}
              className="sm:w-44"
            />
            <FilterSelect
              ariaLabel="Priority"
              allLabel="All priorities"
              value={(filters.priority as string) || "all"}
              onValueChange={(v) => setFilter("priority", v as TicketFilters["priority"])}
              options={PRIORITY_OPTIONS}
              className="sm:w-36"
            />
            <FilterSelect
              ariaLabel="Assignee"
              allLabel="Anyone"
              value={(filters.assigned_to as string) || "all"}
              onValueChange={(v) => setFilter("assigned_to", v)}
              options={[
                { value: "unassigned", label: "Unassigned" },
                ...(userInfo?.id ? [{ value: userInfo.id, label: "Assigned to me" }] : []),
              ]}
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
          {ticketsFailed && !ticketsResult?.data ? (
            <LoadError
              title="We hit a snag loading tickets"
              detail={ticketsResult?.error}
              onRetry={() => void refetchTickets()}
            />
          ) : (
            <>
              {/* ≤ 720px wide, so it fits the `lg` content column (§5.3, D-23). */}
              <Table variant="data" bounded={false} containerClassName="hidden lg:block" className="min-w-[680px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Ticket</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Assignee</TableHead>
                    <TableHead className="text-right">Last activity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {showSkeleton ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <Skeleton className="h-3 w-20" />
                          <Skeleton className="mt-2 h-4 w-64 max-w-full" />
                          <Skeleton className="mt-2 h-3 w-48 max-w-full" />
                        </TableCell>
                        <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-14 rounded-full" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="ml-auto h-4 w-20" /></TableCell>
                      </TableRow>
                    ))
                  ) : tickets.length === 0 ? (
                    <TableEmptyRow colSpan={COLUMN_COUNT} title={empty.title} hint={empty.hint} />
                  ) : (
                    tickets.map((ticket) => {
                      const unread = unreadByTicket.get(ticket.id) ?? 0;
                      const assignee = assigneeLabel(ticket);
                      const lastActivity = new Date(ticket.last_message_at);
                      return (
                        <TableRow
                          key={ticket.id}
                          className="cursor-pointer"
                          onClick={() => router.push(ticketHref(ticket))}
                        >
                          {/* `w-full max-w-0` lets the subject take the spare
                              width and truncate instead of widening the table. */}
                          <TableCell className="w-full max-w-0">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="shrink-0 font-mono text-xs text-muted-foreground">
                                {ticket.ticket_number}
                              </span>
                              {unread > 0 && (
                                <Badge variant="outline" className="text-foreground tabular-nums">
                                  {unread} unread
                                </Badge>
                              )}
                            </div>
                            <Link
                              href={ticketHref(ticket)}
                              onClick={(e) => e.stopPropagation()}
                              className={cn(
                                "mt-1 block truncate text-sm hover:underline",
                                unread > 0 ? "font-semibold" : "font-medium",
                              )}
                            >
                              {ticket.subject}
                            </Link>
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {ticketContext(ticket)}
                            </p>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {getTicketStatusLabel(ticket.status, ticket.ticket_scope)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={cn(needsAttention(ticket) && "font-semibold text-foreground")}
                            >
                              {TICKET_PRIORITY_LABELS[ticket.priority]}
                            </Badge>
                          </TableCell>
                          <TableCell
                            className={cn(
                              "max-w-48 truncate text-sm",
                              assignee ? "text-muted-foreground" : "font-medium text-foreground",
                            )}
                          >
                            {assignee ?? "Unassigned"}
                          </TableCell>
                          <TableCell
                            className="whitespace-nowrap text-right text-sm text-muted-foreground tabular-nums"
                            title={format(lastActivity, "PPpp")}
                          >
                            {formatDistanceToNow(lastActivity, { addSuffix: true })}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>

              {/* §5.3: a card grid below the table's fit breakpoint, never a
                  sideways-scrolling table. */}
              <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
                {showSkeleton ? (
                  <RecordCardSkeletons count={4} />
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
                        className="block min-w-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <RecordCard className="h-full transition-colors hover:bg-muted">
                          <div className="flex min-w-0 items-baseline justify-between gap-3">
                            <span className="truncate font-mono text-xs text-muted-foreground">
                              {ticket.ticket_number}
                            </span>
                            {unread > 0 && (
                              <span className="shrink-0 text-xs font-medium tabular-nums">
                                {unread} unread
                              </span>
                            )}
                          </div>
                          <p
                            className={cn(
                              "mt-1 truncate",
                              unread > 0 ? "font-semibold" : "font-medium",
                            )}
                          >
                            {ticket.subject}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {ticketContext(ticket)}
                          </p>
                          <CardFields>
                            <CardField
                              label="Status"
                              value={getTicketStatusLabel(ticket.status, ticket.ticket_scope)}
                            />
                            <CardField
                              label="Priority"
                              value={TICKET_PRIORITY_LABELS[ticket.priority]}
                            />
                            <CardField label="Assignee" value={assignee ?? "Unassigned"} />
                            <CardField
                              label="Last activity"
                              value={formatDistanceToNow(new Date(ticket.last_message_at), {
                                addSuffix: true,
                              })}
                            />
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
