"use client";

import React, { useState, useRef, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Send,
  Loader2,
  Lock,
  Building2,
  MapPin,
  User,
  ExternalLink,
  CheckCircle2,
  XCircle,
  StickyNote,
} from "lucide-react";
import AttachmentList from "@/components/support/AttachmentList";
import FileUploadInput from "@/components/support/FileUploadInput";
import { PageHeader, PageShell, Panel, PanelSection } from "@/components/dashboard/shell";
import { DetailUnavailable } from "@/app/manage/transactions/components/detail-primitives";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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

const BACK_HREF = "/manage/support";
const BACK_LABEL = "Back to Support";

// `GetAdminTicketDetail` returns this exact string for a missing row; any other
// error (or a thrown action) is a load failure that deserves a Retry.
const NOT_FOUND_ERROR = "Ticket not found";

// Rail select triggers. `max-sm:min-h-11`, not `h-11`: the trigger's own
// `data-[size=default]:h-9` outranks a plain height utility on specificity, so
// a min-height is the only override that lands (§13.6).
const RAIL_TRIGGER = "w-full border-0 bg-muted/60 text-xs shadow-none max-sm:min-h-11";

/** Time only: the date pill above each day's messages already names the day. */
function formatMessageTime(dateStr: string): string {
  return format(new Date(dateStr), "h:mm a");
}

/** The full stamp, for the `title` tooltip and `<time dateTime>`. */
function formatMessageStamp(dateStr: string): string {
  return format(new Date(dateStr), "MMM d, yyyy 'at' h:mm a");
}

/**
 * Messages from one sender, of one kind, sent within this window of each
 * other read as one burst: only the first carries the name and time.
 */
const MESSAGE_GROUP_WINDOW_MS = 5 * 60 * 1000;

function continuesGroup(prev: SupportTicketMessage, msg: SupportTicketMessage): boolean {
  return (
    prev.sender_id === msg.sender_id &&
    prev.is_internal === msg.is_internal &&
    new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime() <=
      MESSAGE_GROUP_WINDOW_MS
  );
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

/** Programmatic smooth scrolling respects the OS setting (§7). */
function scrollBehavior(): ScrollBehavior {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

/** A failed mutation says what failed, in a sentence (§4.9). */
function toastFailure(what: string, detail?: string) {
  toast.error(`We couldn't ${what}.`, {
    description: detail || "Check your connection and try again.",
  });
}

// A pill rather than a rule either side — no horizontal lines (UI-DESIGN-SYSTEM §5.5).
function DateSeparator({ date }: { date: string }) {
  return (
    <div className="flex items-center justify-center py-2">
      <span className="rounded-full bg-muted/60 px-3 py-1 text-xs font-medium text-muted-foreground whitespace-nowrap tabular-nums">
        {formatDateSeparator(date)}
      </span>
    </div>
  );
}

function MessageBubble({
  message,
  currentUserId,
  isContinuation = false,
}: {
  message: SupportTicketMessage;
  currentUserId?: string;
  /**
   * Follows a message from the same sender (see `continuesGroup`): drops the
   * name/time header and the avatar, and tucks up under the one before.
   */
  isContinuation?: boolean;
}) {
  const isMine = isSupportMessageMine(message.sender_id, currentUserId);
  const isInternal = message.is_internal;
  const initials = message.sender_name ? getInitials(message.sender_name) : "?";
  // The right-hand side already says it is yours; the name would only repeat it.
  const senderLabel = isMine
    ? "You"
    : message.sender_role === "admin"
      ? `${message.sender_name} (DEXA)`
      : message.sender_name;
  const stamp = formatMessageStamp(message.created_at);

  // Internal notes: a full-width muted well. The width, the lock and the
  // "Staff only" words set it apart from the thread, not a hue (§3.5).
  if (isInternal) {
    return (
      <div
        className={cn("w-full rounded-2xl bg-muted/60 px-4 py-3", isContinuation && "-mt-3")}
        title={isContinuation ? stamp : undefined}
      >
        {!isContinuation && (
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex min-w-0 items-center gap-2">
              {/* Avatar plates drop on phones (§13.4). */}
              <div className="hidden h-6 w-6 shrink-0 items-center justify-center rounded-full bg-background text-[10px] font-bold text-muted-foreground sm:flex">
                {initials}
              </div>
              <span className="truncate text-xs font-semibold text-foreground">{senderLabel}</span>
              <time
                dateTime={message.created_at}
                title={stamp}
                className="shrink-0 whitespace-nowrap text-xs text-muted-foreground tabular-nums"
              >
                {formatMessageTime(message.created_at)}
              </time>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-muted-foreground">
              <Lock className="h-3 w-3" aria-hidden />
              Staff only
            </span>
          </div>
        )}
        <p className="text-sm text-foreground whitespace-pre-wrap">{message.message}</p>
        {message.attachments && message.attachments.length > 0 && (
          <AttachmentList attachments={message.attachments} />
        )}
      </div>
    );
  }

  return (
    <div
      // `-mt-3` against the thread's `space-y-4` leaves 4px inside a burst.
      className={cn(
        "flex w-full items-start gap-3",
        isMine && "justify-end",
        isContinuation && "-mt-3"
      )}
      data-message-party={isMine ? "self" : "other"}
      aria-label={isMine ? "Your message" : `Message from ${message.sender_name}`}
    >
      {/* The avatar marks the start of a burst; follow-ups keep its column
          empty so their bubbles stay aligned under the first. */}
      {!isMine && (
        <div
          aria-hidden={isContinuation || undefined}
          className={cn(
            "hidden h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-muted-foreground sm:flex",
            !isContinuation && "bg-muted ring-1 ring-border/70"
          )}
        >
          {!isContinuation && initials}
        </div>
      )}

      {/* Wider on phones, where the avatar no longer takes a column. */}
      <div className={cn("flex min-w-0 max-w-[85%] flex-col gap-1 sm:max-w-[70%]", isMine && "items-end")}>
        {!isContinuation && (
          // One line on a phone: the name truncates, the time never wraps.
          <div className={cn("flex min-w-0 max-w-full items-center gap-2", isMine && "flex-row-reverse")}>
            <span className="truncate text-xs font-medium text-muted-foreground">
              {senderLabel}
            </span>
            <time
              dateTime={message.created_at}
              title={stamp}
              className="shrink-0 whitespace-nowrap text-xs text-muted-foreground/70 tabular-nums"
            >
              {formatMessageTime(message.created_at)}
            </time>
          </div>
        )}
        <div
          title={isContinuation ? stamp : undefined}
          className={cn(
            "min-w-0 rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
            // Neutral on both sides (§3.5): own messages are a muted fill on
            // the right, the other party a card on the left. Side and surface
            // tell them apart, not a hue. Only a burst's first bubble keeps
            // the tucked corner that points at the sender.
            isMine
              ? "bg-muted text-foreground"
              : "bg-card text-card-foreground ring-1 ring-border/70",
            !isContinuation && (isMine ? "rounded-tr-sm" : "rounded-tl-sm")
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

/** A labelled rail field: the label names the control for assistive tech. */
function RailField({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs font-normal text-muted-foreground">
        {label}
      </Label>
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
  const threadRef = useRef<HTMLDivElement>(null);
  const replyAreaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasScrolledRef = useRef(false);

  const queryKey = ["admin-support-ticket", ticketId];

  const ticketQuery = useQuery({
    queryKey,
    queryFn: () => GetAdminTicketDetail(ticketId),
    refetchInterval: 30_000,
  });
  const { data: result, isLoading } = ticketQuery;

  const { data: teamResult } = useQuery({
    queryKey: ["hq-team-members"],
    queryFn: () => GetHQTeamMembers(),
    staleTime: 5 * 60_000,
  });
  const teamMembers = teamResult?.data || [];

  const ticket = result?.data;
  const messages = ticket?.messages || [];

  // Keep the newest message in view. The thread is its own scroller at every
  // width (a screen-tall panel below `lg`, the rail-height row from `lg`), so
  // it scrolls itself to the bottom on load and on each new message without
  // moving the page.
  useEffect(() => {
    const thread = threadRef.current;
    if (!thread) return;
    // The first jump to the bottom is instant; animating through a long
    // history on load reads as the page moving by itself.
    const behavior = hasScrolledRef.current ? scrollBehavior() : "auto";
    hasScrolledRef.current = true;
    thread.scrollTo({ top: thread.scrollHeight, behavior });
  }, [messages.length]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey });
    queryClient.invalidateQueries({ queryKey: ["admin-support-tickets"] });
  };

  const sendMutation = useMutation({
    mutationFn: ({ msg, internal, atts }: { msg: string; internal: boolean; atts: AttachmentInput[] }) =>
      AdminAddMessage(ticketId, msg, internal, atts),
    onSuccess: (res, { internal }) => {
      if (res.error) {
        toastFailure(internal ? "add the note" : "send your reply", res.error);
        return;
      }
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
    onError: (_err, { internal }) => toastFailure(internal ? "add the note" : "send your reply"),
  });

  const statusMutation = useMutation({
    mutationFn: ({ status, notes }: { status: TicketStatus; notes?: string }) =>
      AdminUpdateTicketStatus(ticketId, status, notes),
    onSuccess: (res) => {
      if (res.error) { toastFailure("change the ticket status", res.error); return; }
      invalidate();
    },
    onError: () => toastFailure("change the ticket status"),
  });

  const assignMutation = useMutation({
    mutationFn: ({ to, name }: { to: string | null; name: string | null }) =>
      AssignTicket(ticketId, to, name),
    onSuccess: (res) => {
      if (res.error) { toastFailure("reassign the ticket", res.error); return; }
      invalidate();
    },
    onError: () => toastFailure("reassign the ticket"),
  });

  const priorityMutation = useMutation({
    mutationFn: (priority: TicketPriority) => UpdateTicketPriority(ticketId, priority),
    onSuccess: (res) => {
      if (res.error) { toastFailure("change the priority", res.error); return; }
      invalidate();
    },
    onError: () => toastFailure("change the priority"),
  });

  const categoryMutation = useMutation({
    mutationFn: (category: TicketCategory) => UpdateTicketCategory(ticketId, category),
    onSuccess: (res) => {
      if (res.error) { toastFailure("change the category", res.error); return; }
      invalidate();
    },
    onError: () => toastFailure("change the category"),
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
    replyAreaRef.current?.scrollIntoView({ behavior: scrollBehavior(), block: "nearest" });
    setTimeout(() => textareaRef.current?.focus(), 300);
  };

  if (isLoading) {
    return <SupportTicketSkeleton />;
  }

  if (!ticket) {
    // A missing ticket and a failed load are different sentences; only the
    // failure offers Retry (§4.9).
    const failed = ticketQuery.isError || (!!result?.error && result.error !== NOT_FOUND_ERROR);
    return (
      <DetailUnavailable
        title={failed ? "Ticket unavailable" : "Ticket not found"}
        heading={failed ? "We couldn't load this ticket" : "We couldn't find this ticket"}
        detail={
          failed
            ? (result?.error ?? (ticketQuery.error as Error | null)?.message)
            : "The link may be incomplete, or the ticket may no longer exist."
        }
        backHref={BACK_HREF}
        backLabel={BACK_LABEL}
        onRetry={failed ? () => void ticketQuery.refetch() : undefined}
      />
    );
  }

  const merchantInfo = ticket.merchant as any;
  const locationInfo = ticket.location as any;
  const contextItems = buildSupportTicketContext(ticket.metadata);
  const isHQInternal = ticket.ticket_scope === "hq_internal";
  const hasInfoPanel = !!merchantInfo || isHQInternal || contextItems.length > 0;

  // Build messages with date separators
  const messagesWithSeparators: Array<
    | { type: "message"; data: SupportTicketMessage; isContinuation: boolean }
    | { type: "separator"; date: string; key: string }
  > = [];
  messages.forEach((msg, i) => {
    const prev = messages[i - 1];
    const newDay = i === 0 || !isSameDay(new Date(msg.created_at), new Date(prev.created_at));
    if (newDay) {
      messagesWithSeparators.push({ type: "separator", date: msg.created_at, key: `sep-${i}` });
    }
    // A date pill always restarts the burst, so each day opens with a name.
    messagesWithSeparators.push({
      type: "message",
      data: msg,
      isContinuation: !newDay && continuesGroup(prev, msg),
    });
  });

  const canSend = !!reply.trim() && !sendMutation.isPending;

  return (
    <PageShell as="div">
      <PageHeader
        title={ticket.subject}
        // On phones the pills would squeeze the subject to a sliver; the
        // Status and Priority fields directly below carry the same words.
        titleBadge={
          <div className="flex shrink-0 flex-wrap items-center gap-1.5 max-sm:hidden">
            <Badge variant="outline">{getTicketStatusLabel(ticket.status, ticket.ticket_scope)}</Badge>
            <Badge variant="outline">{TICKET_PRIORITY_LABELS[ticket.priority]}</Badge>
          </div>
        }
        // The ticket number is the record id, so it stays on phones (§13.4).
        subtitle={[
          ticket.ticket_number,
          isHQInternal ? "DEXA HQ" : merchantInfo?.name,
          `Opened ${format(new Date(ticket.created_at), "MMM d, yyyy")}`,
        ]
          .filter(Boolean)
          .join(" · ")}
        showSubtitleOnMobile
        subtitleClassName="tabular-nums"
        backHref={BACK_HREF}
        backLabel={BACK_LABEL}
        // The record's actions live in the header (skeleton C), not the rail:
        // as a rail section they made the rail far taller than the thread.
        // 44px targets on phones (§13.6).
        actions={
          <>
            <Button
              variant="outline"
              className="h-11 px-4 sm:h-9"
              onClick={() => statusMutation.mutate({ status: "resolved" })}
              disabled={ticket.status === "resolved" || ticket.status === "closed"}
            >
              <CheckCircle2 aria-hidden />
              Mark Resolved
            </Button>
            <Button
              variant="outline"
              className="h-11 px-4 sm:h-9"
              onClick={() => statusMutation.mutate({ status: "closed" })}
              disabled={ticket.status === "closed"}
            >
              <XCircle aria-hidden />
              Close Ticket
            </Button>
            <Button variant="outline" className="h-11 px-4 sm:h-9" onClick={handleAddInternalNote}>
              <StickyNote aria-hidden />
              Add Internal Note
            </Button>
          </>
        }
        // Subjects are user-typed; a long unbroken token must wrap, not overflow.
        className="[&_h1]:break-words"
      />

      {/* Skeleton C. DOM order is the phone order — ticket fields, thread,
          then context — with no `order-*` shuffling.
          From `lg`: the four fields form one row across the top, then the
          thread sits beside a rail holding only who raised the ticket and its
          context. The row is as tall as the taller of the rail and the
          thread's viewport-fit minimum, and both panels stretch to it, so
          neither column leaves empty space under the shorter one. */}
      <div
        className={cn(
          "grid min-w-0 grid-cols-1 gap-6",
          hasInfoPanel && "lg:grid-cols-[minmax(0,1fr)_18rem]"
        )}
      >
        {/* Ticket fields */}
        <Panel nested className="lg:col-span-full">
          <h2 className="sr-only">Ticket details</h2>
          <div className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-3 px-4 py-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
            <RailField id="ticket-status" label="Status">
              <Select
                value={ticket.status}
                onValueChange={(v) => statusMutation.mutate({ status: v as TicketStatus })}
              >
                <SelectTrigger id="ticket-status" className={RAIL_TRIGGER}>
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
            </RailField>

            <RailField id="ticket-priority" label="Priority">
              <Select
                value={ticket.priority}
                onValueChange={(v) => priorityMutation.mutate(v as TicketPriority)}
              >
                <SelectTrigger id="ticket-priority" className={RAIL_TRIGGER}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </RailField>

            <RailField id="ticket-category" label="Category">
              <Select
                value={ticket.category}
                onValueChange={(v) => categoryMutation.mutate(v as TicketCategory)}
              >
                <SelectTrigger id="ticket-category" className={RAIL_TRIGGER}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TICKET_CATEGORY_LABELS).map(([k, label]) => (
                    <SelectItem key={k} value={k} className="text-xs">{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </RailField>

            {!isHQInternal && (
              <RailField id="ticket-assignee" label="Assigned To">
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
                  <SelectTrigger id="ticket-assignee" className={RAIL_TRIGGER}>
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
              </RailField>
            )}

            {isHQInternal && (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Developer assignees</p>
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
        </Panel>

        {/* Thread. From `lg` it scrolls inside itself — the chronological-feed
            exception (§5.7). Its content is lifted out of flow (`absolute
            inset-0`), so it never sets the row's height: the row takes the
            rail's height or this minimum, whichever is taller, and the thread
            fills it. The minimum is the viewport less the layout bar (4rem),
            the canvas padding (3rem), the page header (~6.6rem), the fields
            row (~5.5rem) and two gaps (3rem), so the composer is in view on
            load.
            Below `lg` the panel is exactly the visible screen height and the
            thread scrolls inside it, with the composer pinned at the bottom.
            Phones: the viewport less the top bar (4rem) and the fixed bottom
            nav (56px tabs + 1px border + its `max(0.5rem, safe-area)` bottom
            padding — see MobileBottomNav). Tablets have no bottom nav, so
            only the top bar comes off. */}
        <Panel
          nested
          className={cn(
            "max-sm:h-[calc(100svh-7.5rem-1px-max(0.5rem,env(safe-area-inset-bottom)))] sm:max-lg:h-[calc(100svh-4rem)]",
            "lg:relative lg:min-h-[max(26rem,calc(100svh-22.5rem))]",
            !hasInfoPanel && "lg:col-span-full"
          )}
        >
          <div className="flex h-full min-w-0 flex-col lg:absolute lg:inset-0 lg:h-auto">
            <h2 className="sr-only">Conversation</h2>
            <div
              ref={threadRef}
              className="thin-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6"
            >
              {messages.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  No messages yet — replies and internal notes will appear here.
                </p>
              ) : (
                messagesWithSeparators.map((item) =>
                  item.type === "separator" ? (
                    <DateSeparator key={item.key} date={item.date} />
                  ) : (
                    <MessageBubble
                      key={item.data.id}
                      message={item.data}
                      currentUserId={userInfo?.id}
                      isContinuation={item.isContinuation}
                    />
                  )
                )
              )}
            </div>

            {/* Composer — set off from the thread by spacing, not a rule (§5.5) */}
            <div className="shrink-0 space-y-2 px-4 pb-4 pt-2 sm:px-6 sm:pb-5" ref={replyAreaRef}>
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
                      <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
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
                {/* Muted, borderless field; focus turns the fill (§4.2). */}
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
                  aria-label={isInternal ? "Internal note" : "Reply"}
                  className="min-h-[80px] max-h-[200px] min-w-0 flex-1 resize-none border-0 bg-muted/60 shadow-none focus-visible:bg-background"
                  disabled={sendMutation.isPending}
                />
                {/* Send above attach, stacked beside the textarea — matches the merchant thread. */}
                <div className="flex shrink-0 flex-col items-center gap-2">
                  <Button
                    onClick={handleSend}
                    disabled={!canSend}
                    size="icon-sm"
                    aria-label={isInternal ? "Add internal note" : "Send reply"}
                  >
                    {sendMutation.isPending ? (
                      <Loader2 className="animate-spin" aria-hidden />
                    ) : (
                      <Send aria-hidden />
                    )}
                  </Button>
                  <FileUploadInput
                    key={uploadKey}
                    variant="compact"
                    // 32px, matching the send button above it (`icon-sm`).
                    buttonClassName="size-8"
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
        </Panel>

        {/* Who raised it and where from — after the thread on phones, the
            rail from `lg`, stretched to the row's height. */}
        {hasInfoPanel && (
          <Panel nested>
            {merchantInfo && (
              <PanelSection label="Merchant">
                <div className="space-y-2 text-xs">
                  <div className="flex items-start gap-1.5">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" aria-hidden />
                    {merchantInfo.id ? (
                      <Link
                        href={`/manage/merchants/${merchantInfo.id}`}
                        className="font-medium hover:underline text-foreground"
                      >
                        {merchantInfo.name}
                      </Link>
                    ) : (
                      <span className="font-medium">{merchantInfo.name}</span>
                    )}
                  </div>
                  {locationInfo && (
                    <div className="flex items-start gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" aria-hidden />
                      <span>{locationInfo.name}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden />
                    <span className="text-muted-foreground">{ticket.submitted_by_name}</span>
                  </div>
                  {ticket.submitted_by_email && (
                    <p className="break-all text-muted-foreground pl-5">{ticket.submitted_by_email}</p>
                  )}
                </div>
              </PanelSection>
            )}
            {isHQInternal && (
              <PanelSection label="Reporter">
                <div className="space-y-2 text-xs">
                  <div className="flex items-start gap-1.5">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" aria-hidden />
                    <span className="font-medium">DEXA HQ</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden />
                    <span className="text-muted-foreground">{ticket.submitted_by_name}</span>
                  </div>
                  {ticket.submitted_by_email && (
                    <p className="break-all text-muted-foreground pl-5">{ticket.submitted_by_email}</p>
                  )}
                </div>
              </PanelSection>
            )}

            {/* Context from metadata */}
            {contextItems.length > 0 && (
              <PanelSection label="Context">
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
              </PanelSection>
            )}

            {/* Related Links */}
            {merchantInfo?.clerk_org_id && (
              <PanelSection label="Related">
                <Button variant="outline" className="h-11 w-full justify-start sm:h-9" asChild>
                  <Link href={`/manage/merchants/${merchantInfo.id}`}>
                    <ExternalLink aria-hidden />
                    View Merchant Dashboard
                  </Link>
                </Button>
              </PanelSection>
            )}
          </Panel>
        )}
      </div>
    </PageShell>
  );
}
