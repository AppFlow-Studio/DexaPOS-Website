"use server";

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { currentUser } from "@clerk/nextjs/server";
import {
  SupportTicket,
  SupportTicketWithMessages,
  SupportTicketAttachmentWithUrl,
  AttachmentInput,
  SupportDashboardStats,
  TicketFilters,
  TicketStatus,
  TicketPriority,
  TicketCategory,
} from "@/types/support-ticket";

// ============================================================================
// GET ALL TICKETS (Admin)
// ============================================================================

export async function GetAllTickets(
  filters?: TicketFilters,
  limit: number = 30,
  offset: number = 0
): Promise<{ data?: SupportTicket[]; total?: number; error?: string }> {
  const supabase = createServiceRoleClient();

  let query = supabase
    .from("support_tickets")
    .select(
      `
      *,
      merchant:merchants(id, name, clerk_org_id),
      location:locations(id, name)
    `,
      { count: "exact" }
    )
    .order("last_message_at", { ascending: false });

  if (filters?.status && filters.status !== "all") {
    if (filters.status === "open") {
      query = query.in("status", ["open", "in_progress", "waiting_on_merchant"]);
    } else {
      query = query.eq("status", filters.status);
    }
  }

  if (filters?.category && filters.category !== "all") {
    query = query.eq("category", filters.category);
  }

  if (filters?.priority && filters.priority !== "all") {
    query = query.eq("priority", filters.priority);
  }

  if (filters?.assigned_to) {
    if (filters.assigned_to === "unassigned") {
      query = query.is("assigned_to", null);
    } else if (filters.assigned_to !== "all") {
      query = query.eq("assigned_to", filters.assigned_to);
    }
  }

  if (filters?.merchant_id) {
    query = query.eq("merchant_id", filters.merchant_id);
  }

  if (filters?.location_id) {
    query = query.eq("location_id", filters.location_id);
  }

  if (filters?.date_from) {
    query = query.gte("created_at", filters.date_from);
  }

  if (filters?.date_to) {
    query = query.lte("created_at", filters.date_to);
  }

  if (filters?.search) {
    query = query.or(
      `subject.ilike.%${filters.search}%,submitted_by_name.ilike.%${filters.search}%,ticket_number.ilike.%${filters.search}%`
    );
  }

  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) return { error: error.message };

  const tickets = (data || []).map((t: any) => ({
    ...t,
    merchant: Array.isArray(t.merchant) ? t.merchant[0] : t.merchant,
    location: Array.isArray(t.location) ? t.location[0] : t.location,
  }));

  return { data: tickets, total: count || 0 };
}

// ============================================================================
// GET TICKET DETAIL (Admin — includes internal notes)
// ============================================================================

export async function GetAdminTicketDetail(
  ticketId: string
): Promise<{ data?: SupportTicketWithMessages; error?: string }> {
  const supabase = createServiceRoleClient();

  const { data: ticket, error: ticketError } = await supabase
    .from("support_tickets")
    .select(`
      *,
      merchant:merchants(id, name, clerk_org_id),
      location:locations(id, name)
    `)
    .eq("id", ticketId)
    .single();

  if (ticketError || !ticket) return { error: "Ticket not found" };

  const { data: messages, error: messagesError } = await supabase
    .from("support_ticket_messages")
    .select("*")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });

  if (messagesError) return { error: messagesError.message };

  // Mark merchant messages as read by admin
  const unread = (messages || [])
    .filter((m) => m.sender_role === "merchant" && !m.read_by_admin)
    .map((m) => m.id);

  if (unread.length > 0) {
    await supabase
      .from("support_ticket_messages")
      .update({ read_by_admin: true })
      .in("id", unread);
  }

  // Fetch attachments and generate signed URLs
  const { data: attachments } = await supabase
    .from("support_ticket_attachments")
    .select("*")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });

  let attachmentsWithUrls: SupportTicketAttachmentWithUrl[] = [];
  if (attachments && attachments.length > 0) {
    const paths = attachments.map((a) => a.file_path);
    const { data: signedData } = await supabase.storage
      .from("support-attachments")
      .createSignedUrls(paths, 3600);

    const urlMap: Record<string, string> = {};
    (signedData || []).forEach((item) => {
      urlMap[item.path] = item.signedUrl;
    });

    attachmentsWithUrls = attachments.map((a) => ({
      ...a,
      signed_url: urlMap[a.file_path],
    }));
  }

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
      merchant: Array.isArray(ticket.merchant) ? ticket.merchant[0] : ticket.merchant,
      location: Array.isArray(ticket.location) ? ticket.location[0] : ticket.location,
      messages: messagesWithAttachments,
    },
  };
}

// ============================================================================
// GET SIGNED UPLOAD URL (Admin)
// ============================================================================

export async function GetAdminSupportUploadUrl(
  ticketId: string,
  fileName: string,
  fileId: string
): Promise<{ signedUrl?: string; path?: string; error?: string }> {
  const supabase = createServiceRoleClient();
  const user = await currentUser();
  if (!user) return { error: "Authentication required" };

  const sanitizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `admin/tickets/${ticketId}/${fileId}_${sanitizedName}`;

  const { data, error } = await supabase.storage
    .from("support-attachments")
    .createSignedUploadUrl(path);

  if (error) return { error: error.message };
  return { signedUrl: data.signedUrl, path };
}

// ============================================================================
// ADMIN ADD MESSAGE
// ============================================================================

export async function AdminAddMessage(
  ticketId: string,
  message: string,
  isInternal: boolean = false,
  attachments: AttachmentInput[] = []
): Promise<{ data?: { message_id: string }; error?: string }> {
  const supabase = createServiceRoleClient();
  const user = await currentUser();

  if (!user) return { error: "Authentication required" };

  const userName = user.fullName || user.firstName || "DEXA Support";

  const { data, error } = await supabase.rpc("add_ticket_message_with_attachments", {
    p_ticket_id: ticketId,
    p_sender_id: user.id,
    p_sender_name: userName,
    p_sender_role: "admin",
    p_message: message,
    p_is_internal: isInternal,
    p_attachments: attachments,
  });

  if (error) return { error: error.message };
  return { data };
}

// ============================================================================
// UPDATE TICKET STATUS (Admin)
// ============================================================================

export async function AdminUpdateTicketStatus(
  ticketId: string,
  status: TicketStatus,
  resolutionNotes?: string
): Promise<{ success?: boolean; error?: string }> {
  const supabase = createServiceRoleClient();
  const user = await currentUser();

  const { data, error } = await supabase.rpc("update_ticket_status", {
    p_ticket_id: ticketId,
    p_status: status,
    p_resolution_notes: resolutionNotes || null,
    p_resolved_by: user?.id || null,
  });

  if (error) return { error: error.message };
  return { success: true };
}

// ============================================================================
// ASSIGN TICKET (Admin)
// ============================================================================

export async function AssignTicket(
  ticketId: string,
  assignedTo: string | null,
  assignedToName: string | null
): Promise<{ success?: boolean; error?: string }> {
  const supabase = createServiceRoleClient();

  const { error } = await supabase
    .from("support_tickets")
    .update({
      assigned_to: assignedTo,
      assigned_to_name: assignedToName,
      assigned_at: assignedTo ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ticketId);

  if (error) return { error: error.message };
  return { success: true };
}

// ============================================================================
// UPDATE PRIORITY (Admin)
// ============================================================================

export async function UpdateTicketPriority(
  ticketId: string,
  priority: TicketPriority
): Promise<{ success?: boolean; error?: string }> {
  const supabase = createServiceRoleClient();

  const { error } = await supabase
    .from("support_tickets")
    .update({ priority, updated_at: new Date().toISOString() })
    .eq("id", ticketId);

  if (error) return { error: error.message };
  return { success: true };
}

// ============================================================================
// UPDATE CATEGORY (Admin)
// ============================================================================

export async function UpdateTicketCategory(
  ticketId: string,
  category: TicketCategory
): Promise<{ success?: boolean; error?: string }> {
  const supabase = createServiceRoleClient();

  const { error } = await supabase
    .from("support_tickets")
    .update({ category, updated_at: new Date().toISOString() })
    .eq("id", ticketId);

  if (error) return { error: error.message };
  return { success: true };
}

// ============================================================================
// GET HQ TEAM MEMBERS (for ticket assignment dropdown)
// ============================================================================

export async function GetHQTeamMembers(): Promise<{
  data?: { id: string; name: string }[];
  error?: string;
}> {
  const supabase = createServiceRoleClient();
  // organizations.id IS the Clerk org ID (text primary key) — no lookup needed
  const hqOrgId =
    process.env.DEXA_POS_INTERNAL_TEAM_ID || "org_33z36QibAMZy6kc2xZNYmDl5duh";

  const { data: members, error } = await supabase
    .from("members")
    .select("user_id, users(id, first_name, last_name)")
    .eq("organization_id", hqOrgId);

  if (error) return { error: error.message };

  const result = (members || [])
    .map((m: any) => {
      const u = Array.isArray(m.users) ? m.users[0] : m.users;
      if (!u) return null;
      const name = [u.first_name, u.last_name].filter(Boolean).join(" ") || "Unknown";
      return { id: u.id as string, name };
    })
    .filter((x): x is { id: string; name: string } => x !== null);

  return { data: result };
}

// ============================================================================
// GET SUPPORT STATS (Admin)
// ============================================================================

export async function GetSupportStats(): Promise<{
  data?: SupportDashboardStats;
  error?: string;
}> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase.rpc("get_support_dashboard_stats");

  if (error) return { error: error.message };
  return { data };
}
