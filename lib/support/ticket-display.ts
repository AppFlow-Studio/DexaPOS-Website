import type { SupportTicket, TicketStatus } from "@/types/support-ticket";

export type TicketViewerRole = "merchant" | "admin";

export interface ViewerContext {
  role: TicketViewerRole;
  userId?: string | null;
}

/**
 * Returns a second-person, viewer-aware label for a ticket status.
 * Use in UIs that know who's reading. For viewer-neutral contexts
 * (audit logs, emails, exports), use TICKET_STATUS_LABELS instead.
 */
export function getViewerStatusLabel(
  status: TicketStatus,
  viewer: ViewerContext,
  ticket?: Pick<SupportTicket, "assigned_to"> | null,
): string {
  if (status === "resolved") return "Resolved";
  if (status === "closed") return "Closed";

  if (viewer.role === "merchant") {
    if (status === "waiting_on_merchant") return "Waiting on your reply";
    if (status === "in_progress") return "DEXA team is working on it";
    return "Waiting for DEXA team";
  }

  if (status === "waiting_on_merchant") return "Waiting on merchant";
  if (status === "in_progress") {
    const isMine =
      !!ticket?.assigned_to && !!viewer.userId && ticket.assigned_to === viewer.userId;
    return isMine ? "You're working on this" : "In progress";
  }
  return "New — needs triage";
}
