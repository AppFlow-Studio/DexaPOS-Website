"use client";

import React, { useState, useRef, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Send,
  Loader2,
  User,
  Shield,
  Lock,
  Building2,
  MapPin,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  GetAdminTicketDetail,
  AdminAddMessage,
  AdminUpdateTicketStatus,
  AssignTicket,
  UpdateTicketPriority,
  UpdateTicketCategory,
} from "../../actions/support";
import {
  TICKET_CATEGORY_LABELS,
  TICKET_STATUS_LABELS,
  TICKET_STATUS_COLORS,
  TICKET_PRIORITY_COLORS,
  TICKET_PRIORITY_LABELS,
  SupportTicketMessage,
  TicketStatus,
  TicketPriority,
  TicketCategory,
} from "@/types/support-ticket";
import { format, isToday, isYesterday } from "date-fns";
import { useUserInfo } from "../../hooks/useUserInfo.";

function formatMessageTime(dateStr: string): string {
  const date = new Date(dateStr);
  if (isToday(date)) return format(date, "h:mm a");
  if (isYesterday(date)) return `Yesterday at ${format(date, "h:mm a")}`;
  return format(date, "MMM d, yyyy 'at' h:mm a");
}

function MessageBubble({ message }: { message: SupportTicketMessage }) {
  const isMerchant = message.sender_role === "merchant";
  const isInternal = message.is_internal;

  return (
    <div
      className={cn(
        "flex gap-3",
        !isMerchant && "flex-row-reverse"
      )}
    >
      <div
        className={cn(
          "h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold",
          isMerchant ? "bg-muted text-foreground" : "bg-blue-100 text-blue-700"
        )}
      >
        {isMerchant ? <User className="h-4 w-4" /> : <Shield className="h-4 w-4" />}
      </div>

      <div className={cn("max-w-[70%] space-y-1", !isMerchant && "items-end flex flex-col")}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-muted-foreground">
            {isMerchant ? message.sender_name : `${message.sender_name} (DEXA)`}
          </span>
          {isInternal && (
            <Badge variant="outline" className="text-xs bg-amber-50 border-amber-300 text-amber-700">
              <Lock className="h-2.5 w-2.5 mr-1" />
              Staff only
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">
            {formatMessageTime(message.created_at)}
          </span>
        </div>
        <div
          className={cn(
            "rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
            isMerchant
              ? "bg-muted text-foreground rounded-tl-sm"
              : isInternal
              ? "bg-amber-50 border border-amber-200 text-amber-900 rounded-tr-sm"
              : "bg-blue-600 text-white rounded-tr-sm"
          )}
        >
          <p className="whitespace-pre-wrap">{message.message}</p>
        </div>
      </div>
    </div>
  );
}

function SidebarSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{title}</p>
      {children}
    </div>
  );
}

export default function AdminTicketDetailPage() {
  const params = useParams();
  const ticketId = params.ticketId as string;
  const queryClient = useQueryClient();
  const { data: userInfo } = useUserInfo();

  const [reply, setReply] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const queryKey = ["admin-support-ticket", ticketId];

  const { data: result, isLoading } = useQuery({
    queryKey,
    queryFn: () => GetAdminTicketDetail(ticketId),
    refetchInterval: 30_000,
  });

  const ticket = result?.data;
  const messages = ticket?.messages || [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey });
    queryClient.invalidateQueries({ queryKey: ["admin-support-tickets"] });
  };

  const sendMutation = useMutation({
    mutationFn: ({ msg, internal }: { msg: string; internal: boolean }) =>
      AdminAddMessage(ticketId, msg, internal),
    onSuccess: (res) => {
      if (res.error) { toast.error(res.error); return; }
      setReply("");
      invalidate();
    },
    onError: () => toast.error("Failed to send message"),
  });

  const statusMutation = useMutation({
    mutationFn: ({ status, notes }: { status: TicketStatus; notes?: string }) =>
      AdminUpdateTicketStatus(ticketId, status, notes),
    onSuccess: (res) => {
      if (res.error) { toast.error(res.error); return; }
      toast.success("Status updated");
      invalidate();
    },
  });

  const assignMutation = useMutation({
    mutationFn: ({ to, name }: { to: string | null; name: string | null }) =>
      AssignTicket(ticketId, to, name),
    onSuccess: (res) => {
      if (res.error) { toast.error(res.error); return; }
      toast.success("Ticket assigned");
      invalidate();
    },
  });

  const priorityMutation = useMutation({
    mutationFn: (priority: TicketPriority) => UpdateTicketPriority(ticketId, priority),
    onSuccess: (res) => {
      if (res.error) { toast.error(res.error); return; }
      invalidate();
    },
  });

  const categoryMutation = useMutation({
    mutationFn: (category: TicketCategory) => UpdateTicketCategory(ticketId, category),
    onSuccess: (res) => {
      if (res.error) { toast.error(res.error); return; }
      invalidate();
    },
  });

  const handleSend = () => {
    const trimmed = reply.trim();
    if (!trimmed) return;
    sendMutation.mutate({ msg: trimmed, internal: isInternal });
  };

  if (isLoading) {
    return (
      <div className="flex gap-6 h-full">
        <div className="flex-1 space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-6 w-64" />
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="w-64 h-full" />
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="text-center py-16">
        <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
        <p className="font-medium">Ticket not found</p>
        <Button variant="outline" size="sm" className="mt-4" asChild>
          <Link href="/manage/support">Back to Support</Link>
        </Button>
      </div>
    );
  }

  const merchantInfo = ticket.merchant as any;
  const locationInfo = ticket.location as any;
  const metadata = ticket.metadata as any;

  return (
    <div className="flex gap-6 h-full" style={{ height: "calc(100vh - 100px)" }}>
      {/* Left: Chat */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="shrink-0 space-y-2 pb-4 border-b">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
              <Link href="/manage/support">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <span className="text-sm text-muted-foreground">Support Inbox</span>
          </div>
          <div className="flex items-start justify-between gap-3 px-1">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-xs font-mono text-muted-foreground">{ticket.ticket_number}</span>
                <Badge variant="outline" className={cn("text-xs", TICKET_STATUS_COLORS[ticket.status])}>
                  {TICKET_STATUS_LABELS[ticket.status]}
                </Badge>
                <Badge variant="secondary" className={cn("text-xs", TICKET_PRIORITY_COLORS[ticket.priority])}>
                  {TICKET_PRIORITY_LABELS[ticket.priority]}
                </Badge>
              </div>
              <h1 className="font-semibold text-base truncate">{ticket.subject}</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                {merchantInfo?.name} · {format(new Date(ticket.created_at), "MMM d, yyyy")}
              </p>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4 min-h-0">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Reply Box */}
        <div className="shrink-0 pt-3 border-t space-y-2">
          <div className="flex items-center gap-2">
            <Switch
              id="internal"
              checked={isInternal}
              onCheckedChange={setIsInternal}
            />
            <Label htmlFor="internal" className="text-sm cursor-pointer">
              {isInternal ? (
                <span className="flex items-center gap-1.5 text-amber-700">
                  <Lock className="h-3.5 w-3.5" />
                  Internal note (staff only)
                </span>
              ) : (
                <span className="text-muted-foreground">Reply to merchant</span>
              )}
            </Label>
          </div>
          <div className="flex gap-2 items-end">
            <Textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={
                isInternal
                  ? "Add an internal note (not visible to merchant)..."
                  : "Type your reply..."
              }
              className={cn(
                "resize-none min-h-[80px]",
                isInternal && "border-amber-300 bg-amber-50/50"
              )}
              disabled={sendMutation.isPending}
            />
            <Button
              onClick={handleSend}
              disabled={!reply.trim() || sendMutation.isPending}
              size="icon"
              className={cn("shrink-0 h-[80px] w-10", isInternal && "bg-amber-600 hover:bg-amber-700")}
            >
              {sendMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Right: Sidebar */}
      <div className="w-64 shrink-0 overflow-y-auto space-y-5 border-l pl-5">
        {/* Ticket Controls */}
        <SidebarSection title="Ticket Details">
          <div className="space-y-2">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Status</p>
              <Select
                value={ticket.status}
                onValueChange={(v) => statusMutation.mutate({ status: v as TicketStatus })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="waiting_on_merchant">Waiting on Merchant</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <p className="text-xs text-muted-foreground mb-1">Priority</p>
              <Select
                value={ticket.priority}
                onValueChange={(v) => priorityMutation.mutate(v as TicketPriority)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <p className="text-xs text-muted-foreground mb-1">Category</p>
              <Select
                value={ticket.category}
                onValueChange={(v) => categoryMutation.mutate(v as TicketCategory)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TICKET_CATEGORY_LABELS).map(([k, label]) => (
                    <SelectItem key={k} value={k} className="text-xs">{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <p className="text-xs text-muted-foreground mb-1">Assigned To</p>
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant={ticket.assigned_to === userInfo?.id ? "default" : "outline"}
                  className="h-7 text-xs flex-1"
                  onClick={() =>
                    assignMutation.mutate({
                      to: userInfo?.id || null,
                      name: `${userInfo?.first_name} ${userInfo?.last_name}`.trim() || null,
                    })
                  }
                >
                  {ticket.assigned_to === userInfo?.id ? "Assigned to me" : "Assign to me"}
                </Button>
                {ticket.assigned_to && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    onClick={() => assignMutation.mutate({ to: null, name: null })}
                  >
                    <XCircle className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              {ticket.assigned_to && ticket.assigned_to !== userInfo?.id && (
                <p className="text-xs text-muted-foreground mt-1">{ticket.assigned_to_name}</p>
              )}
            </div>
          </div>
        </SidebarSection>

        <Separator />

        {/* Quick Actions */}
        <SidebarSection title="Actions">
          <div className="space-y-1.5">
            <Button
              size="sm"
              variant="outline"
              className="w-full h-7 text-xs justify-start"
              onClick={() => statusMutation.mutate({ status: "resolved" })}
              disabled={ticket.status === "resolved" || ticket.status === "closed"}
            >
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5 text-green-600" />
              Mark Resolved
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="w-full h-7 text-xs justify-start"
              onClick={() => statusMutation.mutate({ status: "closed" })}
              disabled={ticket.status === "closed"}
            >
              <XCircle className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
              Close Ticket
            </Button>
          </div>
        </SidebarSection>

        <Separator />

        {/* Merchant Info */}
        {merchantInfo && (
          <SidebarSection title="Merchant Info">
            <div className="space-y-1.5 text-sm">
              <div className="flex items-start gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <span className="text-xs">{merchantInfo.name}</span>
              </div>
              {locationInfo && (
                <div className="flex items-start gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                  <span className="text-xs">{locationInfo.name}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-xs text-muted-foreground">{ticket.submitted_by_name}</span>
              </div>
              {ticket.submitted_by_email && (
                <p className="text-xs text-muted-foreground pl-5">{ticket.submitted_by_email}</p>
              )}
            </div>
          </SidebarSection>
        )}

        {/* Context from metadata */}
        {metadata && Object.keys(metadata).length > 0 && (
          <>
            <Separator />
            <SidebarSection title="Context">
              <div className="space-y-1 text-xs text-muted-foreground">
                {metadata.userAgent && (
                  <p className="truncate" title={metadata.userAgent}>
                    Device: {
                      /Android/.test(metadata.userAgent) ? "Android" :
                      /iPhone|iPad/.test(metadata.userAgent) ? "iOS" :
                      "Desktop"
                    }
                  </p>
                )}
                {metadata.app_version && <p>App version: {metadata.app_version}</p>}
              </div>
            </SidebarSection>
          </>
        )}

        <Separator />

        {/* Related Links */}
        <SidebarSection title="Related">
          {merchantInfo?.clerk_org_id && (
            <Button size="sm" variant="outline" className="w-full h-7 text-xs justify-start" asChild>
              <Link href={`/manage/merchants/${merchantInfo.id}`}>
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                View Merchant Dashboard
              </Link>
            </Button>
          )}
        </SidebarSection>
      </div>
    </div>
  );
}
