import "server-only";

import { sendEmail } from "@/lib/messaging/resend";

import {
  buildFormNotificationMessage,
  type FormNotificationMessage,
} from "./notification";
import type { SubmissionRecord } from "./submission";

export interface NotificationDeliveryResult {
  ok: boolean;
  messageIds: string[];
  error: string | null;
}

/**
 * The provider-facing half of form notifications.
 *
 * The submission must already exist before this is called. A provider outage
 * therefore changes only the delivery state; it can never lose the response.
 */
export async function deliverFormSubmissionNotification({
  recipients,
  formName,
  record,
  receivedAt,
}: {
  recipients: string[];
  formName: string;
  record: SubmissionRecord;
  receivedAt: string;
}): Promise<NotificationDeliveryResult> {
  if (recipients.length === 0) return { ok: true, messageIds: [], error: null };

  const message = buildFormNotificationMessage({ formName, record, receivedAt });
  return deliverMessage(recipients, message);
}

async function deliverMessage(
  recipients: string[],
  message: FormNotificationMessage,
): Promise<NotificationDeliveryResult> {
  const result = await sendEmail(recipients, message.subject, message.html);
  if ("error" in result) {
    return {
      ok: false,
      messageIds: [],
      error: result.error.slice(0, 500),
    };
  }

  return {
    ok: true,
    messageIds: result.id ? [result.id] : [],
    error: null,
  };
}
