import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { resolveAppUrl } from "@/lib/messaging/app-url";
import { sendEmail } from "@/lib/messaging/resend";
import { parseSupportAssigneeEmails } from "@/lib/support/assignees";
import {
  TICKET_CATEGORY_LABELS,
  TICKET_PRIORITY_LABELS,
  type TicketCategory,
  type TicketPriority,
  type TicketScope,
} from "@/types/support-ticket";

const NOTIFICATION_RECIPIENTS_ENV = "SUPPORT_TICKET_NOTIFICATION_EMAILS";

type TicketNotificationRecord = {
  id: string;
  ticket_number: string;
  ticket_scope: TicketScope;
  subject: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  submitted_by_name: string;
  submitted_by_email: string | null;
  assigned_to_emails: string[];
  created_at: string;
  metadata: Record<string, unknown> | null;
  merchant: { name: string } | { name: string }[] | null;
  location: { name: string } | { name: string }[] | null;
};

type TicketMessageNotificationRecord = {
  id: string;
  ticket_id: string;
  sender_name: string;
  sender_role: string;
  message: string;
  is_internal: boolean;
  created_at: string;
};

export type SupportTicketNotificationResult = {
  recipients: string[];
  resendMessageIds: string[];
};

export function parseSupportTicketNotificationRecipients(
  raw = process.env[NOTIFICATION_RECIPIENTS_ENV] ?? "",
): string[] {
  return parseSupportAssigneeEmails(raw);
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
  const isHQInternal = ticket.ticket_scope === "hq_internal";
  const category = TICKET_CATEGORY_LABELS[ticket.category] ?? ticket.category;
  const priority = TICKET_PRIORITY_LABELS[ticket.priority] ?? ticket.priority;
  const submitter = ticket.submitted_by_email
    ? `${ticket.submitted_by_name} (${ticket.submitted_by_email})`
    : ticket.submitted_by_name;
  const assignees =
    ticket.assigned_to_emails.length > 0
      ? ticket.assigned_to_emails.join(", ")
      : "Unassigned";

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
          ${
            isHQInternal
              ? '<tr><td style="padding:7px 0;color:#64748b">Scope</td><td style="padding:7px 0">DEXA HQ Developer Ticket</td></tr>'
              : `<tr><td style="padding:7px 0;color:#64748b">Merchant</td><td style="padding:7px 0">${escapeHtml(merchantName)}</td></tr>
          <tr><td style="padding:7px 0;color:#64748b">Location</td><td style="padding:7px 0">${escapeHtml(locationName)}</td></tr>`
          }
          <tr><td style="padding:7px 0;color:#64748b">Submitted by</td><td style="padding:7px 0">${escapeHtml(submitter)}</td></tr>
          <tr><td style="padding:7px 0;color:#64748b">Assigned to</td><td style="padding:7px 0">${escapeHtml(assignees)}</td></tr>
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

function buildMessageNotificationHtml(
  ticket: TicketNotificationRecord,
  message: TicketMessageNotificationRecord,
  ticketUrl: string,
): string {
  const merchantName = getRelationName(ticket.merchant);
  const locationName = getRelationName(ticket.location);
  const isHQInternal = ticket.ticket_scope === "hq_internal";
  const messageType = message.is_internal ? "Private note" : "Thread reply";

  return `<!doctype html>
<html>
  <body style="margin:0;background:#f4f6f8;color:#172033;font-family:Arial,sans-serif">
    <div style="max-width:680px;margin:0 auto;padding:28px 16px">
      <div style="background:#0f172a;color:#fff;border-radius:14px 14px 0 0;padding:22px 26px">
        <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;opacity:.7">New ${escapeHtml(messageType)}</div>
        <h1 style="margin:8px 0 0;font-size:22px">${escapeHtml(ticket.ticket_number)} - ${escapeHtml(ticket.subject)}</h1>
      </div>
      <div style="background:#fff;border:1px solid #dfe4ea;border-top:0;border-radius:0 0 14px 14px;padding:24px 26px">
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:7px 0;color:#64748b;width:150px">Message type</td><td style="padding:7px 0;font-weight:700">${escapeHtml(messageType)}</td></tr>
          <tr><td style="padding:7px 0;color:#64748b">Sent by</td><td style="padding:7px 0">${escapeHtml(message.sender_name)}</td></tr>
          <tr><td style="padding:7px 0;color:#64748b">Sender role</td><td style="padding:7px 0">${escapeHtml(message.sender_role)}</td></tr>
          ${
            isHQInternal
              ? '<tr><td style="padding:7px 0;color:#64748b">Scope</td><td style="padding:7px 0">DEXA HQ Developer Ticket</td></tr>'
              : `<tr><td style="padding:7px 0;color:#64748b">Merchant</td><td style="padding:7px 0">${escapeHtml(merchantName)}</td></tr>
          <tr><td style="padding:7px 0;color:#64748b">Location</td><td style="padding:7px 0">${escapeHtml(locationName)}</td></tr>`
          }
        </table>
        <div style="margin-top:20px;padding:16px;border-radius:10px;background:#f8fafc;white-space:pre-wrap;font-size:14px;line-height:1.55">${escapeHtml(message.message)}</div>
        ${
          ticketUrl
            ? `<a href="${escapeHtml(ticketUrl)}" style="display:inline-block;margin-top:22px;padding:11px 18px;border-radius:9px;background:#2563eb;color:#fff;text-decoration:none;font-weight:700">Open ticket thread in DEXA HQ</a>`
            : ""
        }
      </div>
    </div>
  </body>
</html>`;
}

async function loadTicketNotificationRecord(
  ticketId: string,
): Promise<TicketNotificationRecord> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("support_tickets")
    .select(
      `
        id,
        ticket_number,
        ticket_scope,
        subject,
        description,
        category,
        priority,
        submitted_by_name,
        submitted_by_email,
        assigned_to_emails,
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

  return data as unknown as TicketNotificationRecord;
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

  const ticket = await loadTicketNotificationRecord(ticketId);
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

export async function sendSupportTicketMessageNotification(
  messageId: string,
): Promise<SupportTicketNotificationResult> {
  const recipients = parseSupportTicketNotificationRecipients();
  if (recipients.length === 0) {
    throw new Error(
      `${NOTIFICATION_RECIPIENTS_ENV} has no valid email addresses`,
    );
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("support_ticket_messages")
    .select(
      "id, ticket_id, sender_name, sender_role, message, is_internal, created_at",
    )
    .eq("id", messageId)
    .single();

  if (error || !data) {
    throw new Error(`Support ticket message ${messageId} was not found`);
  }

  const message = data as TicketMessageNotificationRecord;
  const ticket = await loadTicketNotificationRecord(message.ticket_id);
  const appUrl = await resolveAppUrl();
  const ticketUrl = appUrl ? `${appUrl}/manage/support/${ticket.id}` : "";
  const messageType = message.is_internal ? "Private Note" : "New Reply";
  const subject =
    `[DEXA Support - ${messageType}] ` +
    `${ticket.ticket_number} - ${ticket.subject}`;
  const html = buildMessageNotificationHtml(ticket, message, ticketUrl);
  const result = await sendEmail(recipients, subject, html);

  if ("error" in result) {
    throw new Error(result.error);
  }

  return {
    recipients,
    resendMessageIds: result.id ? [result.id] : [],
  };
}
