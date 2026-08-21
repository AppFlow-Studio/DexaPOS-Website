"use client";

import React, { useState, useRef, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Send,
  Loader2,
  Lock,
  Building2,
  MapPin,
  User,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  XCircle,
  StickyNote,
} from "lucide-react";
import AttachmentList from "@/components/support/AttachmentList";
import FileUploadInput from "@/components/support/FileUploadInput";
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
import { isSupportMessageMine } from "@/lib/support/message-alignment";
import { buildSupportTicketContext } from "@/lib/support/ticket-context";
import { toast } from "sonner";
import {
  GetAdminTicketDetail,
  AdminAddMessage,
  AdminUpdateTicketStatus,
  AssignTicket,
  UpdateTicketPriority,
  UpdateTicketCategory,
  GetAdminSupportUploadUrl,
  GetHQTeamMembers,
} from "../../actions/support";
import {
  TICKET_CATEGORY_LABELS,
  TICKET_STATUS_COLORS,
  TICKET_PRIORITY_COLORS,
  TICKET_PRIORITY_LABELS,
  SupportTicketMessage,
  AttachmentInput,
  TicketStatus,
  TicketPriority,
  TicketCategory,
  getTicketStatusLabel,
} from "@/types/support-ticket";
import { format, isToday, isYesterday, isSameDay } from "date-fns";
import { useUserInfo } from "../../hooks/useUserInfo.";

function formatMessageTime(dateStr: string): string {
  const date = new Date(dateStr);
  return format(date, "MMM d 'at' h:mm a");
}

function formatDateSeparator(dateStr: string): string {
  const date = new Date(dateStr);
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  return format(date, "MMMM d, yyyy");
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function DateSeparator({ date }: { date: string }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="flex-1 h-px bg-border" />
      <span className="text-xs text-muted-foreground font-medium whitespace-nowrap">
        {formatDateSeparator(date)}
      </span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

function MessageBubble({
  message,
  currentUserId,
}: {
  message: SupportTicketMessage;
  currentUserId?: string;
}) {
  const isMine = isSupportMessageMine(message.sender_id, currentUserId);
  const isInternal = message.is_internal;
  const initials = message.sender_name ? getInitials(message.sender_name) : "?";
  const senderLabel = isMine
    ? `${message.sender_name} (you)`
    : message.sender_role === "admin"
      ? `${message.sender_name} (DEXA)`
      : message.sender_name;

  // Internal notes: full-width amber card
  if (isInternal) {
    return (
      <div className="w-full rounded-lg bg-amber-50 border border-amber-200 border-l-4 border-l-amber-400 px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-bold shrink-0">
              {initials}
            </div>
            <span className="text-xs font-semibold text-amber-900">{message.sender_name}</span>
            <span className="text-xs text-amber-700/60">{formatMessageTime(message.created_at)}</span>
          </div>
          <Badge className="text-[10px] bg-amber-100 text-amber-700 border border-amber-300 rounded-full gap-1">
            <Lock className="h-2.5 w-2.5" />
            Staff only
          </Badge>
        </div>
        <p className="text-sm text-amber-900 whitespace-pre-wrap">{message.message}</p>
        {message.attachments && message.attachments.length > 0 && (
          <AttachmentList attachments={message.attachments} />
        )}
      </div>
    );
  }

  return (
    <div
      className={cn("flex w-full items-start gap-3", isMine && "justify-end")}
      data-message-party={isMine ? "self" : "other"}
      aria-label={isMine ? "Your message" : `Message from ${message.sender_name}`}
    >
      {!isMine && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-gray-100 text-xs font-bold text-gray-700">
          {initials}
        </div>
      )}

      <div className={cn("flex max-w-[70%] flex-col gap-1", isMine && "items-end")}>
        <div className={cn("flex items-center gap-2", isMine && "flex-row-reverse")}>
          <span className="text-xs font-medium text-muted-foreground">
            {senderLabel}
          </span>
          <span className="text-xs text-muted-foreground/70">
            {formatMessageTime(message.created_at)}
          </span>
        </div>
        <div
          className={cn(
            "rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
            isMine
              ? "rounded-tr-sm bg-blue-600 text-white"
              : "rounded-tl-sm border border-[#E5E7EB] bg-white text-gray-950 shadow-sm"
          )}
        >
          <p className="whitespace-pre-wrap">{message.message}</p>
          {message.attachments && message.attachments.length > 0 && (
            <AttachmentList attachments={message.attachments} />
          )}
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
  const [attachments, setAttachments] = useState<AttachmentInput[]>([]);
  const [uploadSessionId] = useState(() => crypto.randomUUID());
  const [uploadKey, setUploadKey] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const replyAreaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const queryKey = ["admin-support-ticket", ticketId];

  const { data: result, isLoading } = useQuery({
    queryKey,
    queryFn: () => GetAdminTicketDetail(ticketId),
    refetchInterval: 30_000,
  });

  const { data: teamResult } = useQuery({
    queryKey: ["hq-team-members"],
    queryFn: () => GetHQTeamMembers(),
    staleTime: 5 * 60_000,
  });
  const teamMembers = teamResult?.data || [];

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
    mutationFn: ({ msg, internal, atts }: { msg: string; internal: boolean; atts: AttachmentInput[] }) =>
      AdminAddMessage(ticketId, msg, internal, atts),
    onSuccess: (res) => {
      if (res.error) { toast.error(res.error); return; }
      toast.success(
        isInternal
          ? "Internal note added"
          : ticket?.ticket_scope === "hq_internal"
            ? "Developer update added"
            : "Reply sent",
      );
      if (res.notificationWarning) {
        toast.warning(res.notificationWarning);
      }
      setReply("");
      setAttachments([]);
      setUploadKey((k) => k + 1);
      invalidate();
    },
    onError: () => {},
  });

  const statusMutation = useMutation({
    mutationFn: ({ status, notes }: { status: TicketStatus; notes?: string }) =>
      AdminUpdateTicketStatus(ticketId, status, notes),
    onSuccess: (res) => {
      if (res.error) { return; }
      invalidate();
    },
  });

  const assignMutation = useMutation({
    mutationFn: ({ to, name }: { to: string | null; name: string | null }) =>
      AssignTicket(ticketId, to, name),
    onSuccess: (res) => {
      if (res.error) { return; }
      invalidate();
    },
  });

  const priorityMutation = useMutation({
    mutationFn: (priority: TicketPriority) => UpdateTicketPriority(ticketId, priority),
    onSuccess: (res) => {
      if (res.error) { return; }
      invalidate();
    },
  });

  const categoryMutation = useMutation({
    mutationFn: (category: TicketCategory) => UpdateTicketCategory(ticketId, category),
    onSuccess: (res) => {
      if (res.error) { return; }
      invalidate();
    },
  });

  const handleGetUploadUrl = (fileName: string, fileId: string, _sessionId: string) =>
    GetAdminSupportUploadUrl(ticketId, fileName, fileId);

  const handleSend = () => {
    const trimmed = reply.trim();
    if (!trimmed) return;
    sendMutation.mutate({ msg: trimmed, internal: isInternal, atts: attachments });
  };

  const handleAddInternalNote = () => {
    setIsInternal(true);
    replyAreaRef.current?.scrollIntoView({ behavior: "smooth" });
    setTimeout(() => textareaRef.current?.focus(), 300);
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
  const contextItems = buildSupportTicketContext(ticket.metadata);
  const isHQInternal = ticket.ticket_scope === "hq_internal";

  // Build messages with date separators
  const messagesWithSeparators: Array<
    | { type: "message"; data: SupportTicketMessage }
    | { type: "separator"; date: string; key: string }
  > = [];
  messages.forEach((msg, i) => {
    const prev = messages[i - 1];
    if (i === 0 || !isSameDay(new Date(msg.created_at), new Date(prev.created_at))) {
      messagesWithSeparators.push({ type: "separator", date: msg.created_at, key: `sep-${i}` });
    }
    messagesWithSeparators.push({ type: "message", data: msg });
  });

  const canSend = !!reply.trim() && !sendMutation.isPending;

  return (
    <div className="flex gap-6" style={{ height: "calc(100vh - 100px)" }}>
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
              <h1 className="font-semibold text-xl leading-snug truncate mb-2">{ticket.subject}</h1>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-mono text-muted-foreground">{ticket.ticket_number}</span>
                <Badge
                  className={cn(
                    "text-xs rounded-full border font-medium",
                    TICKET_STATUS_COLORS[ticket.status]
                  )}
                >
                  {getTicketStatusLabel(ticket.status, ticket.ticket_scope)}
                </Badge>
                <Badge
                  className={cn(
                    "text-xs rounded-full border font-medium",
                    TICKET_PRIORITY_COLORS[ticket.priority]
                  )}
                >
                  {TICKET_PRIORITY_LABELS[ticket.priority]}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {isHQInternal ? "DEXA HQ" : merchantInfo?.name}
                  {" / "}
                  {format(new Date(ticket.created_at), "MMM d, yyyy")}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4 min-h-0 px-1">
          {messagesWithSeparators.map((item) =>
            item.type === "separator" ? (
              <DateSeparator key={item.key} date={item.date} />
            ) : (
              <MessageBubble
                key={item.data.id}
                message={item.data}
                currentUserId={userInfo?.id}
              />
            )
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Reply Box */}
        <div className="shrink-0 pt-3 border-t space-y-2" ref={replyAreaRef}>
          {/* Internal note indicator */}
          {isInternal && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-amber-100 border border-amber-300">
              <Lock className="h-3.5 w-3.5 text-amber-700 shrink-0" />
              <span className="text-xs font-semibold text-amber-800">
                Internal note — only visible to staff
              </span>
            </div>
          )}

          {/* Toggle */}
          <div className="flex items-center gap-2">
            <Switch
              id="internal"
              checked={isInternal}
              onCheckedChange={setIsInternal}
            />
            <Label htmlFor="internal" className="text-sm cursor-pointer select-none">
              {isInternal ? (
                <span className="font-semibold text-amber-700">Internal Note</span>
              ) : (
                <span className="text-muted-foreground">
                  {isHQInternal ? "Developer update" : "Reply to merchant"}
                </span>
              )}
            </Label>
          </div>

          <FileUploadInput
            key={uploadKey}
            onUploadsChange={setAttachments}
            getUploadUrl={handleGetUploadUrl}
            sessionId={uploadSessionId}
            disabled={sendMutation.isPending}
          />

          <div
            className={cn(
              "flex gap-2 items-end rounded-lg transition-all duration-200",
              isInternal && "bg-amber-50 p-2 border border-amber-200"
            )}
          >
            <Textarea
              ref={textareaRef}
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
                  ? isHQInternal
                    ? "Add a private HQ note..."
                    : "Add an internal note (not visible to merchant)..."
                  : isHQInternal
                    ? "Add a developer update..."
                    : "Type your reply..."
              }
              className={cn(
                "resize-none min-h-[80px] transition-colors",
                isInternal && "border-amber-300 bg-amber-50/80 focus-visible:ring-amber-400"
              )}
              disabled={sendMutation.isPending}
            />
            <Button
              onClick={handleSend}
              disabled={!canSend}
              size="icon"
              className={cn(
                "shrink-0 h-[80px] w-10 transition-all",
                isInternal
                  ? "bg-amber-600 hover:bg-amber-700"
                  : "bg-indigo-600 hover:bg-indigo-700",
                !canSend && "opacity-40 cursor-not-allowed"
              )}
            >
              {sendMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground text-center">
            Press Enter to send · Shift+Enter for new line
          </p>
        </div>
      </div>

      {/* Right: Sidebar */}
      <div className="w-72 shrink-0 overflow-y-auto space-y-5 border-l pl-5">
        {/* Ticket Details */}
        <SidebarSection title="Ticket Details">
          <div className="space-y-2.5">
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
                  <SelectItem value="waiting_on_merchant">
                    {isHQInternal ? "Waiting on Reporter" : "Waiting on Merchant"}
                  </SelectItem>
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

            {!isHQInternal && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">
                  Assigned To
                </p>
                <div className="flex gap-1.5">
                  <Select
                    value={ticket.assigned_to ?? "unassigned"}
                    onValueChange={(v) => {
                      if (v === "unassigned") {
                        assignMutation.mutate({ to: null, name: null });
                      } else {
                        const member = teamMembers.find((m) => m.id === v);
                        assignMutation.mutate({
                          to: v,
                          name: member?.name ?? null,
                        });
                      }
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs flex-1">
                      <SelectValue placeholder="Unassigned" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem
                        value="unassigned"
                        className="text-xs text-muted-foreground"
                      >
                        Unassigned
                      </SelectItem>
                      {teamMembers.map((m) => (
                        <SelectItem key={m.id} value={m.id} className="text-xs">
                          {m.id === userInfo?.id ? `${m.name} (you)` : m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {isHQInternal && (
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">
                  Developer assignees
                </p>
                {ticket.assigned_to_emails?.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {ticket.assigned_to_emails.map((email) => (
                      <Badge
                        key={email}
                        variant="secondary"
                        className="max-w-full truncate text-[11px] font-normal"
                      >
                        {email}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Unassigned</p>
                )}
              </div>
            )}
          </div>
        </SidebarSection>

        <Separator />

        {/* Actions */}
        <SidebarSection title="Actions">
          <div className="space-y-1.5">
            <Button
              size="sm"
              variant="outline"
              className="w-full h-8 text-xs justify-start border-green-300 text-green-700 hover:bg-green-50 hover:text-green-800 hover:border-green-400 transition-colors"
              onClick={() => statusMutation.mutate({ status: "resolved" })}
              disabled={ticket.status === "resolved" || ticket.status === "closed"}
            >
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
              Mark Resolved
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="w-full h-8 text-xs justify-start border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700 hover:border-red-400 transition-colors"
              onClick={() => statusMutation.mutate({ status: "closed" })}
              disabled={ticket.status === "closed"}
            >
              <XCircle className="h-3.5 w-3.5 mr-1.5" />
              Close Ticket
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="w-full h-8 text-xs justify-start border-amber-300 text-amber-700 hover:bg-amber-50 hover:border-amber-400 transition-colors"
              onClick={handleAddInternalNote}
            >
              <StickyNote className="h-3.5 w-3.5 mr-1.5" />
              Add Internal Note
            </Button>
          </div>
        </SidebarSection>

        <Separator />

        {/* Merchant Info */}
        {merchantInfo && (
          <SidebarSection title="Merchant Info">
            <div className="space-y-2 text-sm">
              <div className="flex items-start gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                {merchantInfo.id ? (
                  <Link
                    href={`/manage/merchants/${merchantInfo.id}`}
                    className="text-xs font-medium hover:underline text-foreground"
                  >
                    {merchantInfo.name}
                  </Link>
                ) : (
                  <span className="text-xs font-medium">{merchantInfo.name}</span>
                )}
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
        {isHQInternal && (
          <SidebarSection title="Reporter">
            <div className="space-y-2 text-sm">
              <div className="flex items-start gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <span className="text-xs font-medium">DEXA HQ</span>
              </div>
              <div className="flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-xs text-muted-foreground">
                  {ticket.submitted_by_name}
                </span>
              </div>
              {ticket.submitted_by_email && (
                <p className="text-xs text-muted-foreground pl-5">
                  {ticket.submitted_by_email}
                </p>
              )}
            </div>
          </SidebarSection>
        )}

        {/* Context from metadata */}
        {contextItems.length > 0 && (
          <>
            <Separator />
            <SidebarSection title="Context">
              <div className="space-y-1.5 text-xs">
                {contextItems.map((item) => (
                  <div key={item.label} className="flex items-start justify-between gap-3">
                    <span className="text-muted-foreground">{item.label}</span>
                    <span
                      className="max-w-[9rem] truncate text-right font-medium text-foreground"
                      title={item.title || item.value}
                    >
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
            </SidebarSection>
          </>
        )}

        {merchantInfo?.clerk_org_id && (
          <>
            <Separator />
            {/* Related Links */}
            <SidebarSection title="Related">
            <Button size="sm" variant="outline" className="w-full h-7 text-xs justify-start" asChild>
              <Link href={`/manage/merchants/${merchantInfo.id}`}>
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                View Merchant Dashboard
              </Link>
            </Button>
            </SidebarSection>
          </>
        )}
      </div>
    </div>
  );
}
