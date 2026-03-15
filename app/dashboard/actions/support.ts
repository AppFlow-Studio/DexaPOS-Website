"use server";

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { currentUser } from "@clerk/nextjs/server";
import {
  SupportTicket,
  SupportTicketWithMessages,
  TicketStatus,
  TicketCategory,
  TicketPriority,
} from "@/types/support-ticket";
import { LogAuditEvent } from "./audit-logs";

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
// GET TICKET DETAIL (Merchant)
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
    .select(`
      *,
      location:locations(id, name)
    `)
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

  return {
    data: {
      ...ticket,
      location: Array.isArray(ticket.location) ? ticket.location[0] : ticket.location,
      messages: messages || [],
    },
  };
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
}

export async function CreateTicket(
  clerkOrgId: string,
  input: CreateTicketInput
): Promise<{ data?: { ticket_id: string; ticket_number: string }; error?: string }> {
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
  });

  if (error) return { error: error.message };

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

  return { data };
}

// ============================================================================
// ADD MESSAGE (Merchant)
// ============================================================================

export async function AddMessage(
  clerkOrgId: string,
  ticketId: string,
  message: string
): Promise<{ data?: { message_id: string }; error?: string }> {
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

  const { data, error } = await supabase.rpc("add_ticket_message", {
    p_ticket_id: ticketId,
    p_sender_id: user.id,
    p_sender_name: userName,
    p_sender_role: "merchant",
    p_message: message,
    p_is_internal: false,
  });

  if (error) return { error: error.message };
  return { data };
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
