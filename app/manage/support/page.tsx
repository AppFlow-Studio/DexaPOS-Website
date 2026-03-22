"use client";

import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  MessageSquare,
  Clock,
  Users,
  TrendingUp,
  CheckCircle2,
  Search,
  ChevronRight,
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

const STATUS_TABS = [
  { key: "open", label: "Open" },
  { key: "in_progress", label: "In Progress" },
  { key: "waiting_on_merchant", label: "Waiting" },
  { key: "resolved", label: "Resolved" },
  { key: "all", label: "All" },
] as const;

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
    <div className="rounded-xl border bg-card p-5 flex items-start gap-4 shadow-sm">
      <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <div>
        <p className="text-2xl font-bold leading-none tabular-nums">
          {value}
          {suffix && (
            <span className="text-sm font-normal text-muted-foreground ml-1">{suffix}</span>
          )}
        </p>
        <p className="text-xs text-muted-foreground mt-1.5">{label}</p>
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
        "flex items-center gap-3 px-4 py-3.5 border-b last:border-0 cursor-pointer hover:bg-muted/40 transition-colors",
        isUrgent && !["resolved", "closed"].includes(ticket.status)
          ? "border-l-4 border-l-red-400"
          : "border-l-4 border-l-transparent"
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-mono text-muted-foreground">{ticket.ticket_number}</span>
          <Badge
            className={cn(
              "text-xs rounded-full border font-medium",
              TICKET_STATUS_COLORS[ticket.status as keyof typeof TICKET_STATUS_COLORS]
            )}
          >
            {TICKET_STATUS_LABELS[ticket.status as keyof typeof TICKET_STATUS_LABELS]}
          </Badge>
          <Badge
            className={cn(
              "text-xs rounded-full border font-medium",
              TICKET_PRIORITY_COLORS[ticket.priority as keyof typeof TICKET_PRIORITY_COLORS]
            )}
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
        <p
          className={cn(
            "text-xs",
            isUnassigned ? "text-amber-600 font-semibold" : "text-muted-foreground"
          )}
        >
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

  const [activeStatus, setActiveStatus] = useState<string>("open");
  const [filters, setFilters] = useState<Omit<TicketFilters, "status">>({});
  const [search, setSearch] = useState("");

  const effectiveFilters: TicketFilters = {
    ...filters,
    status: activeStatus as any,
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

  const setFilter = <K extends keyof Omit<TicketFilters, "status">>(
    key: K,
    value: TicketFilters[K]
  ) => {
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
          onClick={() =>
            queryClient.invalidateQueries({ queryKey: ["admin-support-tickets"] })
          }
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

      {/* Status Tabs */}
      <div className="flex gap-0 border-b">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveStatus(tab.key)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
              activeStatus === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Secondary Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by merchant or ticket #..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select
          value={(filters.category as string) || "all"}
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
          value={(filters.priority as string) || "all"}
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
          value={(filters.assigned_to as string) || "all"}
          onValueChange={(v) => setFilter("assigned_to", v as any)}
        >
          <SelectTrigger className="w-40">
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
      <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
        {ticketsLoading ? (
          <div className="divide-y">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="px-4 py-3.5 flex items-center gap-3">
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
            <div className="px-4 py-2.5 bg-muted/30 border-b flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {total} ticket{total !== 1 ? "s" : ""}
              </span>
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
