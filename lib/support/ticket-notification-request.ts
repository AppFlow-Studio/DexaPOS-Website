import "server-only";

import { resolveAppUrl } from "@/lib/messaging/app-url";

export type SupportTicketNotificationRequestResult = {
  ok: boolean;
  skipped?: string;
  error?: string;
};

type SupportTicketNotificationPayload =
  | { ticket_id: string }
  | { message_id: string };

/**
 * Requests the same idempotent delivery path used by the database trigger.
 * This gives website-created tickets an immediate fallback when pg_net or its
 * Vault endpoint configuration is unavailable in an environment.
 */
async function requestSupportTicketNotification(
  payload: SupportTicketNotificationPayload,
): Promise<SupportTicketNotificationRequestResult> {
  const secret = process.env.INTERNAL_NOTIFICATION_SECRET?.trim();
  if (!secret) {
    return { ok: false, error: "INTERNAL_NOTIFICATION_SECRET is not configured" };
  }

  const appUrl = await resolveAppUrl();
  if (!appUrl) {
    return { ok: false, error: "The public website URL could not be resolved" };
  }

  try {
    const response = await fetch(
      `${appUrl}/api/internal/support-ticket-created`,
      {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          "x-internal-secret": secret,
        },
        body: JSON.stringify(payload),
      },
    );
    const responsePayload = (await response.json().catch(() => ({}))) as {
      skipped?: string;
      error?: string;
    };

    if (!response.ok) {
      return {
        ok: false,
        error:
          responsePayload.error ||
          `Notification endpoint returned ${response.status}`,
      };
    }

    return { ok: true, skipped: responsePayload.skipped };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Notification endpoint request failed",
    };
  }
}

export async function requestSupportTicketCreatedNotification(
  ticketId: string,
): Promise<SupportTicketNotificationRequestResult> {
  return requestSupportTicketNotification({ ticket_id: ticketId });
}

/**
 * Requests delivery for a reply or private note after its database write.
 * The endpoint's message-level claim prevents duplicates when the database
 * trigger and this application fallback race each other.
 */
export async function requestSupportTicketMessageNotification(
  messageId: string,
): Promise<SupportTicketNotificationRequestResult> {
  return requestSupportTicketNotification({ message_id: messageId });
}
