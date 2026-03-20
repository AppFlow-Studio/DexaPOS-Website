"use client";

import React, { useState, useRef, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Send,
  Loader2,
  RefreshCw,
  AlertCircle,
  MessageSquarePlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
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
  TICKET_STATUS_COLORS,
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
            ? "bg-indigo-600 text-white"
            : "bg-indigo-100 text-indigo-700"
        )}
      >
        {isOwn ? initials : "D"}
      </div>

      <div className={cn("max-w-[75%] space-y-1", isOwn && "items-end flex flex-col")}>
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
            "rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
            isOwn
              ? "bg-indigo-600 text-white rounded-tr-sm"
              : "bg-gray-100 text-gray-900 rounded-tl-sm"
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

export default function TicketDetailPage() {
  const params = useParams();
  const ticketId = params.ticketId as string;
  const clerkOrgId = useClerkOrgId();

  const [reply, setReply] = useState("");
  const [attachments, setAttachments] = useState<AttachmentInput[]>([]);
  const [uploadSessionId] = useState(() => crypto.randomUUID());
  const [uploadKey, setUploadKey] = useState(0);
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
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-6 w-64" />
        <div className="space-y-4 mt-8">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
        <p className="font-medium">Ticket not found</p>
        <Button variant="outline" size="sm" className="mt-4" asChild>
          <Link href="/dashboard/support">Back to Support</Link>
        </Button>
      </div>
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
    <div className="max-w-2xl mx-auto flex flex-col" style={{ height: "calc(100vh - 120px)" }}>
      {/* Header */}
      <div className="shrink-0 space-y-3 pb-4 border-b">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
            <Link href="/dashboard/support">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <span className="text-sm text-muted-foreground">Back to tickets</span>
        </div>

        <div className="px-1 space-y-2">
          <h1 className="font-semibold text-xl leading-snug">{ticket.subject}</h1>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono text-muted-foreground">{ticket.ticket_number}</span>
            <Badge
              className={cn(
                "text-xs rounded-full border font-medium",
                TICKET_STATUS_COLORS[ticket.status]
              )}
            >
              {TICKET_STATUS_LABELS[ticket.status]}
            </Badge>
            <Badge className="text-xs rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 font-medium">
              {TICKET_CATEGORY_LABELS[ticket.category]}
            </Badge>
            <span className="text-xs text-muted-foreground">
              Opened {format(new Date(ticket.created_at), "MMM d, yyyy")}
            </span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4 space-y-4 min-h-0 px-1">
        {messages.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-12 w-12 rounded-full bg-indigo-50 flex items-center justify-center mb-3">
              <MessageSquarePlus className="h-6 w-6 text-indigo-400" />
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

      {/* Reply Box or Reopen */}
      <div className="shrink-0 pt-3 border-t">
        {isResolved ? (
          <div className="flex flex-col items-center gap-3 py-3">
            <p className="text-sm text-muted-foreground text-center">
              This ticket has been resolved. Still having issues?
            </p>
            <Button
              variant="outline"
              size="sm"
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
            <FileUploadInput
              key={uploadKey}
              onUploadsChange={setAttachments}
              getUploadUrl={handleGetUploadUrl}
              sessionId={uploadSessionId}
              disabled={isSending}
            />
            <div className="flex gap-2 items-end">
              <Textarea
                ref={textareaRef}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your reply…"
                className="resize-none min-h-[80px] max-h-[160px]"
                disabled={isSending}
              />
              <Button
                onClick={handleSend}
                disabled={!canSend}
                size="icon"
                className={cn(
                  "shrink-0 h-[80px] w-10 bg-indigo-600 hover:bg-indigo-700 transition-opacity",
                  !canSend && "opacity-40 cursor-not-allowed"
                )}
              >
                {isSending ? (
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
        )}
      </div>
    </div>
  );
}
