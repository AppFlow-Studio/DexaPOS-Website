"use client";

import React, { useState, useRef, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Send,
  Loader2,
  RefreshCw,
  User,
  Shield,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useTicketDetail, useAddMessage, useReopenTicket } from "../../hooks/useSupport";
import {
  TICKET_CATEGORY_LABELS,
  TICKET_STATUS_LABELS,
  TICKET_STATUS_COLORS,
  TICKET_PRIORITY_COLORS,
  SupportTicketMessage,
} from "@/types/support-ticket";
import { format, formatDistanceToNow, isToday, isYesterday } from "date-fns";

function formatMessageTime(dateStr: string): string {
  const date = new Date(dateStr);
  if (isToday(date)) return format(date, "h:mm a");
  if (isYesterday(date)) return `Yesterday at ${format(date, "h:mm a")}`;
  return format(date, "MMM d, yyyy 'at' h:mm a");
}

function MessageBubble({
  message,
  isOwn,
}: {
  message: SupportTicketMessage;
  isOwn: boolean;
}) {
  return (
    <div className={cn("flex gap-3", isOwn && "flex-row-reverse")}>
      {/* Avatar */}
      <div
        className={cn(
          "h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold",
          isOwn
            ? "bg-primary/10 text-primary"
            : "bg-blue-100 text-blue-700"
        )}
      >
        {isOwn ? (
          <User className="h-4 w-4" />
        ) : (
          <Shield className="h-4 w-4" />
        )}
      </div>

      <div className={cn("max-w-[75%] space-y-1", isOwn && "items-end flex flex-col")}>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            {isOwn ? "You" : `${message.sender_name} from DEXA`}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatMessageTime(message.created_at)}
          </span>
        </div>
        <div
          className={cn(
            "rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
            isOwn
              ? "bg-primary text-primary-foreground rounded-tr-sm"
              : "bg-muted text-foreground rounded-tl-sm"
          )}
        >
          <p className="whitespace-pre-wrap">{message.message}</p>
        </div>
      </div>
    </div>
  );
}

export default function TicketDetailPage() {
  const params = useParams();
  const ticketId = params.ticketId as string;
  const router = useRouter();

  const [reply, setReply] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: result, isLoading } = useTicketDetail(ticketId);
  const { mutateAsync: addMessage, isPending: isSending } = useAddMessage(ticketId);
  const { mutateAsync: reopenTicket, isPending: isReopening } = useReopenTicket();

  const ticket = result?.data;
  const messages = ticket?.messages || [];

  const isResolved = ticket?.status === "resolved" || ticket?.status === "closed";

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleSend = async () => {
    const trimmed = reply.trim();
    if (!trimmed || isSending) return;

    setReply("");
    await addMessage(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleReopen = async () => {
    await reopenTicket(ticketId);
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

        <div className="space-y-1.5 px-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono text-muted-foreground">{ticket.ticket_number}</span>
            <Badge
              variant="outline"
              className={cn("text-xs", TICKET_STATUS_COLORS[ticket.status])}
            >
              {TICKET_STATUS_LABELS[ticket.status]}
            </Badge>
            <Badge variant="secondary" className="text-xs">
              {TICKET_CATEGORY_LABELS[ticket.category]}
            </Badge>
          </div>
          <h1 className="font-semibold text-base leading-snug">{ticket.subject}</h1>
          <p className="text-xs text-muted-foreground">
            Opened {format(new Date(ticket.created_at), "MMM d, yyyy")}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4 space-y-4 min-h-0">
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            isOwn={msg.sender_role === "merchant"}
          />
        ))}
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
              onClick={handleReopen}
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
          <div className="flex gap-2 items-end">
            <Textarea
              ref={textareaRef}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your reply... (Enter to send, Shift+Enter for new line)"
              className="resize-none min-h-[80px] max-h-[160px]"
              disabled={isSending}
            />
            <Button
              onClick={handleSend}
              disabled={!reply.trim() || isSending}
              size="icon"
              className="shrink-0 h-[80px] w-10"
            >
              {isSending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
