import "server-only";

import { resolveAppUrl } from "@/lib/messaging/app-url";

export type SupportTicketNotificationRequestResult = {
  ok: boolean;
  skipped?: string;
  error?: string;
};

/**
 * Requests the same idempotent delivery path used by the database trigger.
 * This gives website-created tickets an immediate fallback when pg_net or its
 * Vault endpoint configuration is unavailable in an environment.
 */
export async function requestSupportTicketCreatedNotification(
  ticketId: string,
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
        body: JSON.stringify({ ticket_id: ticketId }),
      },
    );
    const payload = (await response.json().catch(() => ({}))) as {
      skipped?: string;
      error?: string;
    };

    if (!response.ok) {
      return {
        ok: false,
        error: payload.error || `Notification endpoint returned ${response.status}`,
      };
    }

    return { ok: true, skipped: payload.skipped };
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
