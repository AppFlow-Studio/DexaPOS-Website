import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { resolveAppUrl } from "@/lib/messaging/app-url";
import { isValidEmail, sendEmail } from "@/lib/messaging/resend";
import {
  TICKET_CATEGORY_LABELS,
  TICKET_PRIORITY_LABELS,
  type TicketCategory,
  type TicketPriority,
} from "@/types/support-ticket";

const NOTIFICATION_RECIPIENTS_ENV = "SUPPORT_TICKET_NOTIFICATION_EMAILS";

type TicketNotificationRecord = {
  id: string;
  ticket_number: string;
  subject: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  submitted_by_name: string;
  submitted_by_email: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
  merchant: { name: string } | { name: string }[] | null;
  location: { name: string } | { name: string }[] | null;
};

export type SupportTicketNotificationResult = {
  recipients: string[];
  resendMessageIds: string[];
};

export function parseSupportTicketNotificationRecipients(
  raw = process.env[NOTIFICATION_RECIPIENTS_ENV] ?? "",
): string[] {
  const seen = new Set<string>();

  return raw
    .split(/[,\n;]/)
    .map((email) => email.trim())
    .filter((email) => {
      const normalized = email.toLowerCase();
      if (!isValidEmail(email) || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getRelationName(
  relation: { name: string } | { name: string }[] | null,
): string {
  if (Array.isArray(relation)) return relation[0]?.name ?? "Unknown";
  return relation?.name ?? "Unknown";
}

function getTicketSource(metadata: Record<string, unknown> | null): string {
  const source = metadata?.source;
  if (source === "hq_admin") return "HQ admin dashboard";
  if (typeof source === "string" && source.trim()) return source.trim();
  return "Merchant support channel";
}

function buildNotificationHtml(
  ticket: TicketNotificationRecord,
  ticketUrl: string,
): string {
  const merchantName = getRelationName(ticket.merchant);
  const locationName = getRelationName(ticket.location);
  const category = TICKET_CATEGORY_LABELS[ticket.category] ?? ticket.category;
  const priority = TICKET_PRIORITY_LABELS[ticket.priority] ?? ticket.priority;
  const submitter = ticket.submitted_by_email
    ? `${ticket.submitted_by_name} (${ticket.submitted_by_email})`
    : ticket.submitted_by_name;

  return `<!doctype html>
<html>
  <body style="margin:0;background:#f4f6f8;color:#172033;font-family:Arial,sans-serif">
    <div style="max-width:680px;margin:0 auto;padding:28px 16px">
      <div style="background:#0f172a;color:#fff;border-radius:14px 14px 0 0;padding:22px 26px">
        <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;opacity:.7">New support ticket</div>
        <h1 style="margin:8px 0 0;font-size:22px">${escapeHtml(ticket.ticket_number)} - ${escapeHtml(ticket.subject)}</h1>
      </div>
      <div style="background:#fff;border:1px solid #dfe4ea;border-top:0;border-radius:0 0 14px 14px;padding:24px 26px">
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:7px 0;color:#64748b;width:150px">Priority</td><td style="padding:7px 0;font-weight:700">${escapeHtml(priority)}</td></tr>
          <tr><td style="padding:7px 0;color:#64748b">Category</td><td style="padding:7px 0">${escapeHtml(category)}</td></tr>
          <tr><td style="padding:7px 0;color:#64748b">Merchant</td><td style="padding:7px 0">${escapeHtml(merchantName)}</td></tr>
          <tr><td style="padding:7px 0;color:#64748b">Location</td><td style="padding:7px 0">${escapeHtml(locationName)}</td></tr>
          <tr><td style="padding:7px 0;color:#64748b">Submitted by</td><td style="padding:7px 0">${escapeHtml(submitter)}</td></tr>
          <tr><td style="padding:7px 0;color:#64748b">Source</td><td style="padding:7px 0">${escapeHtml(getTicketSource(ticket.metadata))}</td></tr>
        </table>
        <div style="margin-top:20px;padding:16px;border-radius:10px;background:#f8fafc;white-space:pre-wrap;font-size:14px;line-height:1.55">${escapeHtml(ticket.description)}</div>
        ${
          ticketUrl
            ? `<a href="${escapeHtml(ticketUrl)}" style="display:inline-block;margin-top:22px;padding:11px 18px;border-radius:9px;background:#2563eb;color:#fff;text-decoration:none;font-weight:700">Open ticket in DEXA HQ</a>`
            : ""
        }
      </div>
    </div>
  </body>
</html>`;
}

export async function sendSupportTicketCreatedNotification(
  ticketId: string,
): Promise<SupportTicketNotificationResult> {
  const recipients = parseSupportTicketNotificationRecipients();
  if (recipients.length === 0) {
    throw new Error(
      `${NOTIFICATION_RECIPIENTS_ENV} has no valid email addresses`,
    );
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("support_tickets")
    .select(
      `
        id,
        ticket_number,
        subject,
        description,
        category,
        priority,
        submitted_by_name,
        submitted_by_email,
        created_at,
        metadata,
        merchant:merchants(name),
        location:locations(name)
      `,
    )
    .eq("id", ticketId)
    .single();

  if (error || !data) {
    throw new Error(`Support ticket ${ticketId} was not found`);
  }

  const ticket = data as unknown as TicketNotificationRecord;
  const appUrl = await resolveAppUrl();
  const ticketUrl = appUrl ? `${appUrl}/manage/support/${ticket.id}` : "";
  const priority = TICKET_PRIORITY_LABELS[ticket.priority] ?? ticket.priority;
  const subject = `[DEXA Support - ${priority}] ${ticket.ticket_number} - ${ticket.subject}`;
  const html = buildNotificationHtml(ticket, ticketUrl);
  const result = await sendEmail(recipients, subject, html);

  if ("error" in result) {
    throw new Error(result.error);
  }

  return {
    recipients,
    resendMessageIds: result.id ? [result.id] : [],
  };
}
