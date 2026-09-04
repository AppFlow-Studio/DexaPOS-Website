"use client";

import React, { useState, useRef, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Send,
  Loader2,
  RefreshCw,
  AlertCircle,
  MessageSquarePlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { PageShell, PageHeader, Panel } from "@/components/dashboard/shell";
import { DataPageSkeleton } from "@/components/dashboard/loading/DataPageSkeleton";
import {
  useTicketDetail,
  useAddMessage,
  useReopenTicket,
  GetSupportUploadUrl,
} from "../../hooks/useSupport";
import { useClerkOrgId } from "../../hooks/useLocationScoped";
import {
  TICKET_CATEGORY_LABELS,
  TICKET_STATUS_LABELS,
  SupportTicketMessage,
  AttachmentInput,
} from "@/types/support-ticket";
import AttachmentList from "@/components/support/AttachmentList";
import FileUploadInput from "@/components/support/FileUploadInput";
import { format, isToday, isYesterday, isSameDay } from "date-fns";

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
    <div className="flex items-center justify-center py-2">
      <span className="rounded-full bg-muted/60 px-3 py-1 text-xs font-medium text-muted-foreground whitespace-nowrap">
        {formatDateSeparator(date)}
      </span>
    </div>
  );
}

function MessageBubble({
  message,
  isOwn,
}: {
  message: SupportTicketMessage;
  isOwn: boolean;
}) {
  const initials = message.sender_name ? getInitials(message.sender_name) : "?";

  return (
    <div className={cn("flex gap-3", isOwn && "flex-row-reverse")}>
      {/* Avatar */}
      <div
        className={cn(
          "h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold",
          isOwn
            ? "bg-[#0C4FD1] dark:bg-[#6CA0FF] text-white dark:text-[#0f1115]"
            : "bg-muted/60 text-muted-foreground"
        )}
      >
        {isOwn ? initials : "D"}
      </div>

      <div className={cn("min-w-0 max-w-[75%] space-y-1", isOwn && "items-end flex flex-col")}>
        {!isOwn && (
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            DEXA Team
          </span>
        )}
        <div className={cn("flex items-center gap-2", isOwn && "flex-row-reverse")}>
          <span className="text-xs font-medium text-muted-foreground">
            {isOwn ? "You" : message.sender_name}
          </span>
          <span className="text-xs text-muted-foreground/70">
            {formatMessageTime(message.created_at)}
          </span>
        </div>
        <div
          className={cn(
            "min-w-0 rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
            isOwn
              ? "bg-[#0C4FD1] dark:bg-[#6CA0FF] text-white dark:text-[#0f1115] rounded-tr-sm"
              : "bg-muted/60 text-foreground rounded-tl-sm"
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

export default function TicketDetailPage() {
  const params = useParams();
  const router = useRouter();
  const ticketId = params.ticketId as string;
  const clerkOrgId = useClerkOrgId();

  const [reply, setReply] = useState("");
  const [attachments, setAttachments] = useState<AttachmentInput[]>([]);
  const [uploadSessionId] = useState(() => crypto.randomUUID());
  const [uploadKey, setUploadKey] = useState(0);
  // Callback ref, not useRef: the portal target must trigger a re-render once
  // it mounts, or the first render passes `null` and the chips never appear.
  const [chipsNode, setChipsNode] = useState<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: result, isLoading } = useTicketDetail(ticketId);
  const { mutateAsync: addMessage, isPending: isSending } = useAddMessage(ticketId);
  const { mutateAsync: reopenTicket, isPending: isReopening } = useReopenTicket();

  const ticket = result?.data;
  const messages = ticket?.messages || [];
  const isResolved = ticket?.status === "resolved" || ticket?.status === "closed";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleGetUploadUrl = async (fileName: string, fileId: string, sessionId: string) => {
    if (!clerkOrgId) return { error: "Not authenticated" };
    return GetSupportUploadUrl(clerkOrgId, fileName, fileId, sessionId);
  };

  const handleSend = async () => {
    const trimmed = reply.trim();
    if (!trimmed || isSending) return;
    setReply("");
    setAttachments([]);
    setUploadKey((k) => k + 1);
    await addMessage({ message: trimmed, attachments });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (isLoading) {
    // Same shape the route loader draws, so the handoff from navigation to
    // data-fetch does not re-flow the page.
    return <DataPageSkeleton variant="thread" label="Loading ticket" />;
  }

  if (!ticket) {
    return (
      <PageShell width="narrow">
        <div className="text-center py-16">
          <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-medium">Ticket not found</p>
          <Button variant="outline" size="sm" className="mt-4 rounded-full" onClick={() => router.push("/dashboard/support")}>
            Back to Support
          </Button>
        </div>
      </PageShell>
    );
  }

  // Build message list with date separators
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

  const canSend = !!reply.trim() && !isSending;

  return (
    <PageShell width="narrow" className="flex flex-col">
      {/* Mobile takes no fixed height: the layout's `MobileBottomNav` is fixed and
          overlays the page, so pinning to the viewport clipped the composer with
          no way to reach it. Letting the content flow lets `#main-content` scroll
          to it instead. From `sm` up the nav is gone and the chat pins to the
          viewport so the thread — not the page — is what scrolls. */}
      <div className="flex flex-col sm:min-h-0 sm:h-[calc(100dvh-140px)]">
        <PageHeader
          title={ticket.subject}
          backHref="/dashboard/support"
          backLabel="Back to Support"
        />

        <div className="flex items-center gap-2 flex-wrap mt-3 mb-4">
          <span className="text-xs font-mono text-muted-foreground tabular-nums">{ticket.ticket_number}</span>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border-0 bg-muted/60 px-2.5 py-0.5 text-xs font-medium">
            {TICKET_STATUS_LABELS[ticket.status]}
          </span>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border-0 bg-muted/60 px-2.5 py-0.5 text-xs font-medium">
            {TICKET_CATEGORY_LABELS[ticket.category]}
          </span>
          <span className="text-xs text-muted-foreground">
            Opened {format(new Date(ticket.created_at), "MMM d, yyyy")}
          </span>
        </div>

        {/* Messages */}
        {/* Mobile gets an explicit height (the parent no longer constrains it);
            desktop flexes to fill whatever the pinned wrapper leaves over. */}
        <Panel className="flex h-[55dvh] flex-col sm:h-auto sm:flex-1 sm:min-h-[420px]" padded>
          <div className="flex-1 overflow-y-auto min-h-0 space-y-4 thin-scrollbar overscroll-contain">
            {messages.length === 0 && !isLoading && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="h-12 w-12 rounded-full bg-muted/60 flex items-center justify-center mb-3">
                  <MessageSquarePlus className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="font-medium text-sm">No messages yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Send your first message below.
                </p>
              </div>
            )}
            {messagesWithSeparators.map((item) =>
              item.type === "separator" ? (
                <DateSeparator key={item.key} date={item.date} />
              ) : (
                <MessageBubble
                  key={item.data.id}
                  message={item.data}
                  isOwn={item.data.sender_role === "merchant"}
                />
              )
            )}
            <div ref={messagesEndRef} />
          </div>
        </Panel>

        {/* Reply Box or Reopen */}
        <div className="shrink-0 pt-4 pb-4 sm:pb-0">
          {isResolved ? (
            <div className="flex flex-col items-center gap-3 py-3">
              <p className="text-sm text-muted-foreground text-center">
                This ticket has been resolved. Still having issues?
              </p>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() => reopenTicket(ticketId)}
                disabled={isReopening}
              >
                {isReopening ? (
                  <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5 mr-2" />
                )}
                Reopen Ticket
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Selected files sit above the composer, filled by the picker's portal */}
              <div ref={setChipsNode} className="empty:hidden" />

              <div className="flex items-end gap-2">
                <Textarea
                  ref={textareaRef}
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type your reply…"
                  className="min-w-0 flex-1 resize-none min-h-[72px] sm:min-h-[100px] max-h-[200px]"
                  disabled={isSending}
                />
                {/* Send above attach, stacked beside the textarea at every width. */}
                <div className="flex shrink-0 flex-col gap-2">
                  <Button
                    onClick={handleSend}
                    disabled={!canSend}
                    size="icon"
                    className={cn(
                      "shrink-0 h-9 w-9 rounded-full transition-opacity",
                      !canSend && "opacity-40 cursor-not-allowed"
                    )}
                  >
                    {isSending ? (
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
                    sessionId={uploadSessionId}
                    disabled={isSending}
                  />
                </div>
              </div>
              <p className="hidden sm:block text-xs text-muted-foreground text-center">
                Press Enter to send · Shift+Enter for new line
              </p>
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
