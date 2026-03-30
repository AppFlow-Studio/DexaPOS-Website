"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  MessageCircle,
  Plus,
  Clock,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  Inbox,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useMyTickets } from "../hooks/useSupport";
import {
  SupportTicket,
  TICKET_CATEGORY_LABELS,
  TICKET_STATUS_LABELS,
  TICKET_STATUS_COLORS,
  TicketStatus,
} from "@/types/support-ticket";
import { formatDistanceToNow } from "date-fns";

type TabKey = "open" | "resolved" | "all";

const TABS: { key: TabKey; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "resolved", label: "Resolved" },
  { key: "all", label: "All" },
];

function getStatusIcon(status: TicketStatus) {
  if (status === "resolved" || status === "closed")
    return <CheckCircle2 className="h-4 w-4 text-gray-400" />;
  if (status === "waiting_on_merchant")
    return <AlertCircle className="h-4 w-4 text-amber-500" />;
  return <Clock className="h-4 w-4 text-blue-500" />;
}

function TicketCard({ ticket }: { ticket: SupportTicket }) {
  const router = useRouter();
  const isWaiting = ticket.status === "waiting_on_merchant";
  const isResolved = ticket.status === "resolved" || ticket.status === "closed";

  return (
    <div
      onClick={() => router.push(`/dashboard/support/${ticket.id}`)}
      className={cn(
        "group relative flex flex-col gap-2 rounded-lg border bg-card px-4 py-3.5 cursor-pointer transition-all hover:shadow-sm hover:border-primary/30",
        isWaiting && "border-l-4 border-l-amber-400",
        !isWaiting && !isResolved && "border-l-4 border-l-blue-400"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          {getStatusIcon(ticket.status)}
          <div className="min-w-0">
            <p className="font-medium text-sm leading-snug truncate">{ticket.subject}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {ticket.ticket_number} · {TICKET_CATEGORY_LABELS[ticket.category]}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge
            variant="outline"
            className={cn("text-xs", TICKET_STATUS_COLORS[ticket.status])}
          >
            {TICKET_STATUS_LABELS[ticket.status]}
          </Badge>
          <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground pl-6">
        <span>
          {isWaiting
            ? "Waiting on your reply"
            : ticket.status === "in_progress"
            ? "DEXA team is working on it"
            : isResolved
            ? "Resolved"
            : "Waiting for DEXA team"}
        </span>
        <span>{formatDistanceToNow(new Date(ticket.last_message_at), { addSuffix: true })}</span>
      </div>
    </div>
  );
}

function TicketCardSkeleton() {
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <Skeleton className="h-4 w-4 rounded-full" />
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
        <Skeleton className="h-5 w-20" />
      </div>
      <div className="flex justify-between pl-6">
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

  const tickets = result?.data || [];
  const total = result?.total || 0;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MessageCircle className="h-6 w-6" />
            Support
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Get help from the DEXA team
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/support/new">
            <Plus className="h-4 w-4 mr-2" />
            New Ticket
          </Link>
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeTab === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
            {tab.key === "open" && total > 0 && activeTab !== "open" && (
              <Badge variant="secondary" className="ml-2 text-xs h-4 px-1.5">
                {total}
              </Badge>
            )}
          </button>
        ))}
      </div>

      {/* Ticket List */}
      <div className="space-y-2.5">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <TicketCardSkeleton key={i} />)
        ) : tickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="h-16 w-16 rounded-2xl bg-indigo-50 flex items-center justify-center mb-4">
              <Inbox className="h-8 w-8 text-indigo-400" />
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
              <Button asChild className="mt-5">
                <Link href="/dashboard/support/new">
                  <Plus className="h-4 w-4 mr-2" />
                  Open your first ticket
                </Link>
              </Button>
            )}
          </div>
        ) : (
          tickets.map((ticket) => <TicketCard key={ticket.id} ticket={ticket} />)
        )}
      </div>
    </div>
  );
}
