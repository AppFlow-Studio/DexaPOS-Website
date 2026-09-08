import type { SubmissionRecord } from "./submission";

/** The durable states shown in the merchant's submissions inbox. */
export const NOTIFICATION_STATES = [
  "not_requested",
  "pending",
  "sending",
  "sent",
  "failed",
] as const;

export type NotificationState = (typeof NOTIFICATION_STATES)[number];

export interface FormNotificationMessage {
  subject: string;
  html: string;
}

/**
 * Builds the transactional email sent to a form's configured recipients.
 *
 * Values have already passed through the submission sanitizer, but email HTML
 * is a separate output boundary and is escaped again here. This keeps a public
 * answer from becoming markup when it leaves React's automatic escaping.
 */
export function buildFormNotificationMessage({
  formName,
  record,
  receivedAt,
}: {
  formName: string;
  record: SubmissionRecord;
  receivedAt: string;
}): FormNotificationMessage {
  const safeName = singleLine(formName || "Website form").slice(0, 100);
  const rows = record.answers
    .map(
      (answer) => `
        <tr>
          <th style="padding:10px 12px;text-align:left;vertical-align:top;border-bottom:1px solid #e5e7eb;font-size:13px;color:#6b7280;font-weight:600">${escapeHtml(answer.label)}</th>
          <td style="padding:10px 12px;vertical-align:top;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;white-space:pre-wrap">${escapeHtml(answer.value)}</td>
        </tr>`,
    )
    .join("");

  const received = formatReceivedAt(receivedAt);

  return {
    subject: `New response to ${safeName}`,
    html: `<!doctype html>
<html>
  <body style="margin:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111827">
    <div style="max-width:640px;margin:0 auto;padding:28px 16px">
      <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
        <div style="padding:22px 24px;background:#111827;color:#ffffff">
          <p style="margin:0 0 4px;font-size:12px;opacity:.75">New website response</p>
          <h1 style="margin:0;font-size:22px;line-height:1.3">${escapeHtml(safeName)}</h1>
        </div>
        <div style="padding:20px 24px">
          <p style="margin:0 0 16px;font-size:13px;color:#6b7280">Received ${escapeHtml(received)}</p>
          <table role="presentation" style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px">
            <tbody>${rows || '<tr><td style="padding:12px;font-size:14px;color:#6b7280">No answers were stored.</td></tr>'}</tbody>
          </table>
          <p style="margin:18px 0 0;font-size:12px;color:#6b7280">Open the Forms inbox in DexaPOS to review and export this response.</p>
        </div>
      </div>
    </div>
  </body>
</html>`,
  };
}

/** Converts a database row back into the same shape used for a fresh send. */
export function submissionRecordFromRow(row: Record<string, unknown>): SubmissionRecord {
  return {
    contact: {
      name: nullableString(row.contact_name),
      email: nullableString(row.contact_email),
      phone: nullableString(row.contact_phone),
      address: nullableString(row.contact_address),
    },
    answers: Array.isArray(row.answers)
      ? row.answers.flatMap((value) => {
          if (!value || typeof value !== "object" || Array.isArray(value)) return [];
          const answer = value as Record<string, unknown>;
          return [{
            fieldId: String(answer.fieldId ?? ""),
            label: String(answer.label ?? ""),
            kind: String(answer.kind ?? ""),
            value: String(answer.value ?? ""),
            ...(Array.isArray(answer.values)
              ? { values: answer.values.map((entry) => String(entry)) }
              : {}),
          }];
        })
      : [],
  };
}

export function isNotificationState(value: unknown): value is NotificationState {
  return (NOTIFICATION_STATES as readonly unknown[]).includes(value);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function singleLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function formatReceivedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "just now";
  return date.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }) + " UTC";
}
