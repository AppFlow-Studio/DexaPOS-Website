"use server";

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { currentUser } from "@clerk/nextjs/server";
import {
  SupportTicket,
  SupportTicketWithMessages,
  SupportTicketAttachmentWithUrl,
  AttachmentInput,
  TicketStatus,
  TicketCategory,
} from "@/types/support-ticket";
import { LogAuditEvent } from "./audit-logs";
import {
  requestSupportTicketCreatedNotification,
  requestSupportTicketMessageNotification,
} from "@/lib/support/ticket-notification-request";

// ============================================================================
// GET TICKETS (Merchant)
// ============================================================================

export async function GetMyTickets(
  clerkOrgId: string,
  status?: TicketStatus | "all",
  limit: number = 20,
  offset: number = 0
): Promise<{ data?: SupportTicket[]; total?: number; error?: string }> {
  if (!clerkOrgId) return { error: "Organization ID is required" };

  const supabase = createServiceRoleClient();

  const { data: merchant, error: merchantError } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (merchantError || !merchant) return { error: "Merchant not found" };

  let query = supabase
    .from("support_tickets")
    .select("*", { count: "exact" })
    .eq("merchant_id", merchant.id)
    .order("last_message_at", { ascending: false });

  if (status && status !== "all") {
    if (status === "resolved") {
      query = query.in("status", ["resolved", "closed"]);
    } else if (status === "open") {
      query = query.in("status", ["open", "in_progress", "waiting_on_merchant"]);
    } else {
      query = query.eq("status", status);
    }
  }

  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) return { error: error.message };
  return { data: data || [], total: count || 0 };
}

// ============================================================================
// GET TICKET DETAIL (Merchant) — includes signed URLs for attachments
// ============================================================================

export async function GetTicketDetail(
  clerkOrgId: string,
  ticketId: string
): Promise<{ data?: SupportTicketWithMessages; error?: string }> {
  if (!clerkOrgId) return { error: "Organization ID is required" };

  const supabase = createServiceRoleClient();

  const { data: merchant, error: merchantError } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (merchantError || !merchant) return { error: "Merchant not found" };

  const { data: ticket, error: ticketError } = await supabase
    .from("support_tickets")
    .select(`*, location:locations(id, name)`)
    .eq("id", ticketId)
    .eq("merchant_id", merchant.id)
    .single();

  if (ticketError || !ticket) return { error: "Ticket not found" };

  const { data: messages, error: messagesError } = await supabase
    .from("support_ticket_messages")
    .select("*")
    .eq("ticket_id", ticketId)
    .eq("is_internal", false) // Merchants never see internal notes
    .order("created_at", { ascending: true });

  if (messagesError) return { error: messagesError.message };

  // Mark admin messages as read by merchant
  const unreadAdminMessages = (messages || [])
    .filter((m) => m.sender_role === "admin" && !m.read_by_merchant)
    .map((m) => m.id);

  if (unreadAdminMessages.length > 0) {
    await supabase
      .from("support_ticket_messages")
      .update({ read_by_merchant: true })
      .in("id", unreadAdminMessages);
  }

  // Fetch attachment metadata only. Bytes are streamed through
  // /api/support/attachments/[id], which audit-logs every access. See the
  // matching comment in app/manage/actions/support.ts for rationale.
  const { data: attachments } = await supabase
    .from("support_ticket_attachments")
    .select("*")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });

  const attachmentsWithUrls: SupportTicketAttachmentWithUrl[] = (attachments || []).map(
    (a) => ({ ...a }),
  );

  // Group attachments by message_id
  const attachmentsByMessageId = attachmentsWithUrls.reduce<
    Record<string, SupportTicketAttachmentWithUrl[]>
  >((acc, att) => {
    const key = att.message_id ?? "__ticket__";
    if (!acc[key]) acc[key] = [];
    acc[key].push(att);
    return acc;
  }, {});

  const messagesWithAttachments = (messages || []).map((m) => ({
    ...m,
    attachments: attachmentsByMessageId[m.id] || [],
  }));

  return {
    data: {
      ...ticket,
      location: Array.isArray(ticket.location) ? ticket.location[0] : ticket.location,
      messages: messagesWithAttachments,
    },
  };
}

// ============================================================================
// GET SIGNED UPLOAD URL (Merchant) — called before submitting ticket/message
// ============================================================================

export async function GetSupportUploadUrl(
  clerkOrgId: string,
  fileName: string,
  fileId: string,
  uploadSessionId: string
): Promise<{ signedUrl?: string; path?: string; error?: string }> {
  if (!clerkOrgId) return { error: "Organization ID is required" };

  const supabase = createServiceRoleClient();

  const { data: merchant, error: merchantError } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (merchantError || !merchant) return { error: "Merchant not found" };

  const sanitizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${merchant.id}/tickets/${uploadSessionId}/${fileId}_${sanitizedName}`;

  const { data, error } = await supabase.storage
    .from("support-attachments")
    .createSignedUploadUrl(path);

  if (error) return { error: error.message };
  return { signedUrl: data.signedUrl, path };
}

// ============================================================================
// CREATE TICKET (Merchant)
// ============================================================================

interface CreateTicketInput {
  subject: string;
  description: string;
  category: TicketCategory;
  locationId?: string;
  metadata?: Record<string, unknown>;
  attachments?: AttachmentInput[];
}

export async function CreateTicket(
  clerkOrgId: string,
  input: CreateTicketInput
): Promise<{
  data?: { ticket_id: string; ticket_number: string };
  error?: string;
  notificationWarning?: string;
}> {
  if (!clerkOrgId) return { error: "Organization ID is required" };

  const supabase = createServiceRoleClient();
  const user = await currentUser();

  if (!user) return { error: "Authentication required" };

  const { data: merchant, error: merchantError } = await supabase
    .from("merchants")
    .select("id, carrier_id")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (merchantError || !merchant) return { error: "Merchant not found" };

  const userName = user.fullName || user.firstName || "Unknown";
  const userEmail = user.emailAddresses?.[0]?.emailAddress || null;

  const { data, error } = await supabase.rpc("create_support_ticket", {
    p_merchant_id: merchant.id,
    p_location_id: input.locationId || null,
    p_subject: input.subject,
    p_description: input.description,
    p_category: input.category,
    p_submitted_by: user.id,
    p_submitted_by_name: userName,
    p_submitted_by_email: userEmail,
    p_carrier_id: merchant.carrier_id || null,
    p_metadata: input.metadata || {},
    p_attachments: input.attachments || [],
  });

  if (error || !data) {
    return { error: error?.message || "Failed to create support ticket" };
  }

  await LogAuditEvent({
    clerkOrgId,
    locationId: input.locationId,
    action: "created",
    actionCategory: "support",
    severity: "info",
    resourceType: "support_ticket",
    resourceId: data.ticket_id,
    resourceName: input.subject,
  });

  const notificationResult =
    await requestSupportTicketCreatedNotification(data.ticket_id);
  const notificationWarning = notificationResult.ok
    ? undefined
    : "Ticket created, but email notification delivery could not be confirmed.";

  if (!notificationResult.ok) {
    console.error("[CreateTicket] Notification request failed", {
      ticketId: data.ticket_id,
      error: notificationResult.error,
    });
  }

  return { data, notificationWarning };
}

// ============================================================================
// ADD MESSAGE (Merchant) — supports attachments
// ============================================================================

export async function AddMessage(
  clerkOrgId: string,
  ticketId: string,
  message: string,
  attachments: AttachmentInput[] = []
): Promise<{
  data?: { message_id: string };
  error?: string;
  notificationWarning?: string;
}> {
  if (!clerkOrgId) return { error: "Organization ID is required" };

  const supabase = createServiceRoleClient();
  const user = await currentUser();

  if (!user) return { error: "Authentication required" };

  const { data: merchant, error: merchantError } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (merchantError || !merchant) return { error: "Merchant not found" };

  // Verify ticket belongs to this merchant
  const { data: ticket } = await supabase
    .from("support_tickets")
    .select("id, status")
    .eq("id", ticketId)
    .eq("merchant_id", merchant.id)
    .single();

  if (!ticket) return { error: "Ticket not found" };
  if (ticket.status === "closed") return { error: "This ticket is closed" };

  const userName = user.fullName || user.firstName || "Unknown";

  const { data, error } = await supabase.rpc("add_ticket_message_with_attachments", {
    p_ticket_id: ticketId,
    p_sender_id: user.id,
    p_sender_name: userName,
    p_sender_role: "merchant",
    p_message: message,
    p_is_internal: false,
    p_attachments: attachments,
  });

  if (error) return { error: error.message };

  const notificationResult = await requestSupportTicketMessageNotification(
    data.message_id,
  );
  const notificationWarning = notificationResult.ok
    ? undefined
    : "Message sent, but email notification delivery could not be confirmed.";

  if (!notificationResult.ok) {
    console.error("[AddMessage] Notification request failed", {
      ticketId,
      messageId: data.message_id,
      error: notificationResult.error,
    });
  }

  return { data, notificationWarning };
}

// ============================================================================
// REOPEN TICKET (Merchant)
// ============================================================================

export async function ReopenTicket(
  clerkOrgId: string,
  ticketId: string
): Promise<{ success?: boolean; error?: string }> {
  if (!clerkOrgId) return { error: "Organization ID is required" };

  const supabase = createServiceRoleClient();

  const { data: merchant, error: merchantError } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (merchantError || !merchant) return { error: "Merchant not found" };

  const { error } = await supabase
    .from("support_tickets")
    .update({ status: "open", updated_at: new Date().toISOString() })
    .eq("id", ticketId)
    .eq("merchant_id", merchant.id)
    .in("status", ["resolved", "closed"]);

  if (error) return { error: error.message };
  return { success: true };
}

// ============================================================================
// GET UNREAD TICKET COUNTS (notification bell — merchant's unread DEXA replies)
// ============================================================================

export interface UnreadTicketCounts {
  role: "admin" | "merchant" | "none";
  total: number;
  perTicket: { ticket_id: string; count: number }[];
}

export async function GetUnreadTicketCounts(): Promise<UnreadTicketCounts> {
  // Clerk-token client so the SECURITY DEFINER RPC can read auth.jwt() and
  // resolve the caller's role/org. (Service role has no JWT → role 'none'.)
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase.rpc("get_unread_ticket_counts");

  if (error || !data) return { role: "none", total: 0, perTicket: [] };

  const d = data as {
    role?: "admin" | "merchant" | "none";
    total?: number;
    per_ticket?: { ticket_id: string; count: number }[];
  };
  return { role: d.role ?? "none", total: d.total ?? 0, perTicket: d.per_ticket ?? [] };
}
