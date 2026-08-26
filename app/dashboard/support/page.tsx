"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Plus, ChevronRight, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { PageShell, PageHeader, Panel } from "@/components/dashboard/shell";
import { useMyTickets } from "../hooks/useSupport";
import { GetUnreadTicketCounts } from "../actions/support";
import {
  SupportTicket,
  TICKET_CATEGORY_LABELS,
  TICKET_STATUS_LABELS,
  TicketStatus,
} from "@/types/support-ticket";
import { getViewerStatusLabel } from "@/lib/support/ticket-display";
import { formatDistanceToNow } from "date-fns";

type TabKey = "open" | "resolved" | "all";

const TABS: { key: TabKey; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "resolved", label: "Resolved" },
  { key: "all", label: "All" },
];

function TicketCard({
  ticket,
  unreadCount,
}: {
  ticket: SupportTicket;
  unreadCount: number;
}) {
  const router = useRouter();

  return (
    <div
      onClick={() => router.push(`/dashboard/support/${ticket.id}`)}
      className="group flex flex-col gap-2 rounded-2xl border-0 bg-muted/45 px-4 py-3.5 cursor-pointer transition-colors hover:bg-muted"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm leading-snug truncate">{ticket.subject}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {ticket.ticket_number} · {TICKET_CATEGORY_LABELS[ticket.category]}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {unreadCount > 0 && (
            <Badge className="rounded-full border-0 bg-red-600 text-xs font-semibold text-white hover:bg-red-600">
              {unreadCount} unread
            </Badge>
          )}
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border-0 bg-muted/60 px-2.5 py-0.5 text-xs font-medium">
            {TICKET_STATUS_LABELS[ticket.status]}
          </span>
          <ChevronRight className="hidden h-4 w-4 text-muted-foreground opacity-0 transition-opacity sm:block group-hover:opacity-100" />
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{getViewerStatusLabel(ticket.status, { role: "merchant" })}</span>
        <span>{formatDistanceToNow(new Date(ticket.last_message_at), { addSuffix: true })}</span>
      </div>
    </div>
  );
}

function TicketCardSkeleton() {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border-0 bg-muted/45 px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-3 w-32" />
        </div>
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
      <div className="flex justify-between">
        <Skeleton className="h-3 w-36" />
        <Skeleton className="h-3 w-20" />
      </div>
    </div>
  );
}

export default function SupportPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("open");

  const statusFilter = activeTab === "all" ? "all" : activeTab;
  const { data: result, isLoading } = useMyTickets(
    statusFilter as TicketStatus | "all"
  );
  const { data: unreadCounts } = useQuery({
    queryKey: ["merchant-unread-ticket-counts"],
    queryFn: GetUnreadTicketCounts,
    staleTime: 30_000,
  });

  const tickets = result?.data || [];
  const total = result?.total || 0;

  return (
    <PageShell width="narrow">
      <PageHeader
        title="Support"
        subtitle="Get help from the DEXA team"
        actions={
          <Button asChild className="rounded-full">
            <Link href="/dashboard/support/new">
              <Plus className="h-4 w-4 mr-2" />
              New Ticket
            </Link>
          </Button>
        }
      />

      <div className="w-full min-w-0 overflow-x-auto pb-1">
        <div className="inline-flex h-auto w-max flex-nowrap gap-0.5 rounded-full bg-muted/70 p-1">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-medium transition-colors",
                activeTab === tab.key
                  ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
              {tab.key === "open" && total > 0 && activeTab !== "open" && (
                <Badge variant="secondary" className="ml-2 rounded-full text-xs h-4 px-1.5 tabular-nums">
                  {total}
                </Badge>
              )}
            </button>
          ))}
        </div>
      </div>

      <Panel padded>
        <div className="space-y-2.5">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => <TicketCardSkeleton key={i} />)
          ) : tickets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="h-16 w-16 rounded-2xl bg-muted/60 flex items-center justify-center mb-4">
                <Inbox className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="font-semibold text-base">
                {activeTab === "open"
                  ? "No open tickets"
                  : activeTab === "resolved"
                  ? "No resolved tickets yet"
                  : "No support tickets yet"}
              </p>
              <p className="text-sm text-muted-foreground mt-1.5 max-w-xs">
                {activeTab === "open" || activeTab === "all"
                  ? "Need help from the DEXA team? Open a support ticket and we'll get back to you."
                  : "Resolved tickets will appear here."}
              </p>
              {(activeTab === "open" || activeTab === "all") && (
                <Button asChild className="mt-5 rounded-full">
                  <Link href="/dashboard/support/new">
                    <Plus className="h-4 w-4 mr-2" />
                    Open your first ticket
                  </Link>
                </Button>
              )}
            </div>
          ) : (
            tickets.map((ticket) => (
              <TicketCard
                key={ticket.id}
                ticket={ticket}
                unreadCount={
                  unreadCounts?.perTicket.find(
                    (entry) => entry.ticket_id === ticket.id,
                  )?.count ?? 0
                }
              />
            ))
          )}
        </div>
      </Panel>
    </PageShell>
  );
}
