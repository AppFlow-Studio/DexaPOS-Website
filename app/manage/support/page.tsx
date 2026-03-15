"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  MessageSquare,
  Clock,
  Users,
  TrendingUp,
  CheckCircle2,
  Search,
  ChevronRight,
  Filter,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  GetAllTickets,
  GetSupportStats,
  AssignTicket,
} from "../actions/support";
import {
  SupportTicket,
  TicketFilters,
  TICKET_CATEGORY_LABELS,
  TICKET_STATUS_LABELS,
  TICKET_STATUS_COLORS,
  TICKET_PRIORITY_COLORS,
  TICKET_PRIORITY_LABELS,
} from "@/types/support-ticket";
import { formatDistanceToNow } from "date-fns";
import { useUserInfo } from "../hooks/useUserInfo.";

function StatCard({
  label,
  value,
  icon: Icon,
  suffix,
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  suffix?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4 flex items-start gap-3">
      <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div>
        <p className="text-2xl font-bold leading-none">
          {value}
          {suffix && <span className="text-sm font-normal text-muted-foreground ml-1">{suffix}</span>}
        </p>
        <p className="text-xs text-muted-foreground mt-1">{label}</p>
      </div>
    </div>
  );
}

function TicketRow({ ticket, onOpen }: { ticket: any; onOpen: () => void }) {
  const isUrgent = ticket.priority === "urgent" || ticket.priority === "high";
  const isUnassigned = !ticket.assigned_to;

  return (
    <div
      onClick={onOpen}
      className={cn(
        "flex items-center gap-3 px-4 py-3 border-b last:border-0 cursor-pointer hover:bg-muted/40 transition-colors",
        isUrgent && !["resolved", "closed"].includes(ticket.status) && "border-l-4 border-l-red-400"
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs font-mono text-muted-foreground">{ticket.ticket_number}</span>
          <Badge
            variant="outline"
            className={cn("text-xs", TICKET_STATUS_COLORS[ticket.status as keyof typeof TICKET_STATUS_COLORS])}
          >
            {TICKET_STATUS_LABELS[ticket.status as keyof typeof TICKET_STATUS_LABELS]}
          </Badge>
          <Badge
            variant="secondary"
            className={cn("text-xs", TICKET_PRIORITY_COLORS[ticket.priority as keyof typeof TICKET_PRIORITY_COLORS])}
          >
            {TICKET_PRIORITY_LABELS[ticket.priority as keyof typeof TICKET_PRIORITY_LABELS]}
          </Badge>
        </div>
        <p className="font-medium text-sm truncate">{ticket.subject}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {ticket.merchant?.name || "Unknown Merchant"}
          {ticket.location?.name && ` · ${ticket.location.name}`}
          {" · "}
          {TICKET_CATEGORY_LABELS[ticket.category as keyof typeof TICKET_CATEGORY_LABELS]}
        </p>
      </div>

      <div className="text-right shrink-0 space-y-1">
        <p className="text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(ticket.last_message_at), { addSuffix: true })}
        </p>
        <p className={cn("text-xs", isUnassigned ? "text-amber-600 font-medium" : "text-muted-foreground")}>
          {isUnassigned ? "Unassigned" : ticket.assigned_to_name}
        </p>
      </div>

      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </div>
  );
}

export default function AdminSupportPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: userInfo } = useUserInfo();

  const [filters, setFilters] = useState<TicketFilters>({ status: "open" });
  const [search, setSearch] = useState("");

  const effectiveFilters: TicketFilters = {
    ...filters,
    search: search || undefined,
  };

  const { data: ticketsResult, isLoading: ticketsLoading } = useQuery({
    queryKey: ["admin-support-tickets", effectiveFilters],
    queryFn: () => GetAllTickets(effectiveFilters, 50, 0),
  });

  const { data: statsResult } = useQuery({
    queryKey: ["admin-support-stats"],
    queryFn: () => GetSupportStats(),
    refetchInterval: 60_000,
  });

  const stats = statsResult?.data;
  const tickets = ticketsResult?.data || [];
  const total = ticketsResult?.total || 0;

  const setFilter = <K extends keyof TicketFilters>(key: K, value: TicketFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MessageSquare className="h-6 w-6" />
            Support Inbox
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage merchant support tickets
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => queryClient.invalidateQueries({ queryKey: ["admin-support-tickets"] })}
        >
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          Refresh
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Open Tickets"
          value={stats?.open_count ?? "—"}
          icon={MessageSquare}
        />
        <StatCard
          label="Unassigned"
          value={stats?.unassigned_count ?? "—"}
          icon={Users}
        />
        <StatCard
          label="Avg First Response"
          value={stats?.avg_first_response_hours ?? "—"}
          suffix="hrs"
          icon={Clock}
        />
        <StatCard
          label="Avg Resolution"
          value={stats?.avg_resolution_hours ?? "—"}
          suffix="hrs"
          icon={TrendingUp}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search tickets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select
          value={filters.status || "all"}
          onValueChange={(v) => setFilter("status", v as any)}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="open">Open (all active)</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="waiting_on_merchant">Waiting on Merchant</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filters.category || "all"}
          onValueChange={(v) => setFilter("category", v as any)}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {Object.entries(TICKET_CATEGORY_LABELS).map(([k, label]) => (
              <SelectItem key={k} value={k}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.priority || "all"}
          onValueChange={(v) => setFilter("priority", v as any)}
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priorities</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filters.assigned_to || "all"}
          onValueChange={(v) => setFilter("assigned_to", v as any)}
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Assigned To" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {userInfo?.id && (
              <SelectItem value={userInfo.id}>Assigned to Me</SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>

      {/* Tickets Table */}
      <div className="rounded-lg border bg-card overflow-hidden">
        {ticketsLoading ? (
          <div className="divide-y">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="px-4 py-3 flex items-center gap-3">
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-64" />
                  <Skeleton className="h-3 w-48" />
                </div>
                <Skeleton className="h-8 w-20" />
              </div>
            ))}
          </div>
        ) : tickets.length === 0 ? (
          <div className="py-16 text-center">
            <CheckCircle2 className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium text-sm">No tickets found</p>
            <p className="text-xs text-muted-foreground mt-1">
              Adjust your filters or all tickets are resolved!
            </p>
          </div>
        ) : (
          <>
            <div className="px-4 py-2 bg-muted/30 border-b flex items-center justify-between text-xs text-muted-foreground">
              <span>{total} ticket{total !== 1 ? "s" : ""}</span>
            </div>
            <div className="divide-y divide-border/50">
              {tickets.map((ticket: any) => (
                <TicketRow
                  key={ticket.id}
                  ticket={ticket}
                  onOpen={() => router.push(`/manage/support/${ticket.id}`)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
