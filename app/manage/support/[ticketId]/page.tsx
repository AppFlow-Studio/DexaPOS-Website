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
import { SupportTicketSkeleton } from "./SupportTicketSkeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  DiscardAdminSupportUpload,
  GetHQTeamMembers,
} from "../../actions/support";
import {
  TICKET_CATEGORY_LABELS,
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

// A pill rather than a rule either side — no horizontal lines (UI-DESIGN-SYSTEM §5.5).
function DateSeparator({ date }: { date: string }) {
  return (
    <div className="flex items-center justify-center py-2">
      <span className="rounded-full bg-muted/60 px-3 py-1 text-xs font-medium text-muted-foreground whitespace-nowrap">
        {formatDateSeparator(date)}
      </span>
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

  // Internal notes: a full-width muted well. The width, the lock and the
  // "Staff only" words set it apart from the thread, not a hue (§3.5).
  if (isInternal) {
    return (
      <div className="w-full rounded-2xl bg-muted/60 px-4 py-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex min-w-0 items-center gap-2">
            <div className="h-6 w-6 rounded-full bg-background text-muted-foreground flex items-center justify-center text-[10px] font-bold shrink-0">
              {initials}
            </div>
            <span className="truncate text-xs font-semibold text-foreground">{message.sender_name}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{formatMessageTime(message.created_at)}</span>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-muted-foreground">
            <Lock className="h-3 w-3" />
            Staff only
          </span>
        </div>
        <p className="text-sm text-foreground whitespace-pre-wrap">{message.message}</p>
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
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground ring-1 ring-border/70">
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
            "min-w-0 rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
            // Neutral on both sides (§3.5): own messages are a muted fill on
            // the right, the other party a card on the left. Side and surface
            // tell them apart, not a hue.
            isMine
              ? "rounded-tr-sm bg-muted text-foreground"
              : "rounded-tl-sm bg-card text-card-foreground ring-1 ring-border/70 shadow-sm"
          )}
        >
          <p className="whitespace-pre-wrap break-words">{message.message}</p>
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
  const [chipsNode, setChipsNode] = useState<HTMLDivElement | null>(null);
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

  const handleGetUploadUrl = (
    fileName: string,
    fileId: string,
    sessionId: string,
    contentType: string,
  ) =>
    GetAdminSupportUploadUrl(
      ticketId,
      fileName,
      fileId,
      sessionId,
      contentType,
    );

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
      <SupportTicketSkeleton />
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
    <div className="flex min-w-0 flex-col gap-6 lg:h-[calc(100vh-100px)] lg:flex-row">
      {/* Left: Chat */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Header */}
        <div className="shrink-0 space-y-2 pb-2">
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
              <h1 className="mb-2 break-words text-xl font-semibold leading-snug">{ticket.subject}</h1>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-mono text-muted-foreground tabular-nums">{ticket.ticket_number}</span>
                {/* One neutral pill per state; the word carries the meaning (§4.6b). */}
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border-0 bg-muted/60 px-2.5 py-0.5 text-xs font-medium">
                  {getTicketStatusLabel(ticket.status, ticket.ticket_scope)}
                </span>
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border-0 bg-muted/60 px-2.5 py-0.5 text-xs font-medium">
                  {TICKET_PRIORITY_LABELS[ticket.priority]}
                </span>
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
        <div className="min-h-0 flex-1 space-y-4 px-1 py-4 lg:overflow-y-auto">
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
        <div className="shrink-0 pt-3 space-y-2" ref={replyAreaRef}>
          {/* Toggle — the label and the lock say "internal"; no hue (§3.5) */}
          <div className="flex items-center gap-2">
            <Switch
              id="internal"
              checked={isInternal}
              onCheckedChange={setIsInternal}
            />
            <Label htmlFor="internal" className="text-sm cursor-pointer select-none">
              {isInternal ? (
                <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                  <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                  Internal note — only visible to staff
                </span>
              ) : (
                <span className="text-muted-foreground">
                  {isHQInternal ? "Developer update" : "Reply to merchant"}
                </span>
              )}
            </Label>
          </div>

          {/* Selected files sit above the composer, filled by the picker's portal */}
          <div ref={setChipsNode} className="empty:hidden" />

          <div className="flex items-end gap-2">
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
              className="min-w-0 flex-1 resize-none min-h-[80px] max-h-[200px]"
              disabled={sendMutation.isPending}
            />
            {/* Send above attach, stacked beside the textarea — matches the merchant thread. */}
            <div className="flex shrink-0 flex-col gap-2">
              <Button
                onClick={handleSend}
                disabled={!canSend}
                size="icon"
                aria-label={isInternal ? "Add internal note" : "Send reply"}
                className={cn(
                  "shrink-0 h-9 w-9 rounded-full transition-opacity",
                  !canSend && "opacity-40 cursor-not-allowed"
                )}
              >
                {sendMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
              <FileUploadInput
                key={uploadKey}
                variant="compact"
                chipsContainer={chipsNode}
                onUploadsChange={setAttachments}
                getUploadUrl={handleGetUploadUrl}
                onDiscardUpload={DiscardAdminSupportUpload}
                sessionId={uploadSessionId}
                disabled={sendMutation.isPending}
              />
            </div>
          </div>
          <p className="hidden sm:block text-xs text-muted-foreground text-center">
            Press Enter to send · Shift+Enter for new line
          </p>
        </div>
      </div>

      {/* Right: Sidebar */}
      <div className="w-full min-w-0 shrink-0 space-y-6 lg:w-72 lg:overflow-y-auto lg:border-l lg:pl-5">
        {/* Ticket Details */}
        <SidebarSection title="Ticket Details">
          <div className="space-y-2.5">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Status</p>
              <Select
                value={ticket.status}
                onValueChange={(v) => statusMutation.mutate({ status: v as TicketStatus })}
              >
                <SelectTrigger className="h-8 w-full border-0 bg-muted/60 text-xs shadow-none">
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
                <SelectTrigger className="h-8 w-full border-0 bg-muted/60 text-xs shadow-none">
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
                <SelectTrigger className="h-8 w-full border-0 bg-muted/60 text-xs shadow-none">
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
                    <SelectTrigger className="h-8 w-full flex-1 border-0 bg-muted/60 text-xs shadow-none">
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
                        variant="outline"
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


        {/* Actions */}
        <SidebarSection title="Actions">
          <div className="space-y-1.5">
            <Button
              size="sm"
              variant="outline"
              className="w-full h-8 text-xs justify-start"
              onClick={() => statusMutation.mutate({ status: "resolved" })}
              disabled={ticket.status === "resolved" || ticket.status === "closed"}
            >
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
              Mark Resolved
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="w-full h-8 text-xs justify-start"
              onClick={() => statusMutation.mutate({ status: "closed" })}
              disabled={ticket.status === "closed"}
            >
              <XCircle className="h-3.5 w-3.5 mr-1.5" />
              Close Ticket
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="w-full h-8 text-xs justify-start"
              onClick={handleAddInternalNote}
            >
              <StickyNote className="h-3.5 w-3.5 mr-1.5" />
              Add Internal Note
            </Button>
          </div>
        </SidebarSection>


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
        )}

        {/* Related Links */}
        {merchantInfo?.clerk_org_id && (
          <SidebarSection title="Related">
            <Button size="sm" variant="outline" className="w-full h-7 text-xs justify-start" asChild>
              <Link href={`/manage/merchants/${merchantInfo.id}`}>
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                View Merchant Dashboard
              </Link>
            </Button>
          </SidebarSection>
        )}
      </div>
    </div>
  );
}
