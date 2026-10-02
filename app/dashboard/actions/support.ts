"use server";

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { currentUser } from "@clerk/nextjs/server";
import {
  SupportTicket,
  SupportTicketWithMessages,
  SupportTicketAttachmentWithUrl,
  AttachmentInput,
  SupportUploadTarget,
  TicketStatus,
  TicketCategory,
} from "@/types/support-ticket";
import { DeviceSupportTicketLink } from "@/types/device-registry";
import { LogAuditEvent } from "./audit-logs";
import {
  requestSupportTicketCreatedNotification,
  requestSupportTicketMessageNotification,
} from "@/lib/support/ticket-notification-request";
import { validateMerchantSupportAttachments } from "@/lib/support/attachment-validation";
import { validateSupportUploadRequest } from "@/lib/support/attachment-validation";
import {
  buildSupportCdnFileName,
  buildSupportCdnStoragePath,
  buildSupportCdnUrl,
  parseSupportCdnStoragePath,
} from "@/lib/support/cdn";

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
// GET OPEN TICKETS BY DEVICE (Merchant)
// ============================================================================

/**
 * The still-open ticket for each device the merchant has reported on, newest
 * first, keyed by device id. Feeds the band on the Devices page so a merchant
 * who already asked for help sees that, rather than filing the same report
 * twice.
 *
 * Tickets carry their device in `metadata.device_id`; open ticket volume per
 * merchant is small, so the rows are filtered here rather than in a JSON query.
 */
export async function GetDeviceTicketLinks(
  clerkOrgId: string,
): Promise<{ data?: Record<string, DeviceSupportTicketLink>; error?: string }> {
  if (!clerkOrgId) return { error: "Organization ID is required" };

  const supabase = createServiceRoleClient();

  const { data: merchant, error: merchantError } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (merchantError || !merchant) return { error: "Merchant not found" };

  const { data, error } = await supabase
    .from("support_tickets")
    .select("id, ticket_number, subject, status, created_at, metadata")
    .eq("merchant_id", merchant.id)
    .in("status", ["open", "in_progress", "waiting_on_merchant"])
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return { error: error.message };

  const byDevice: Record<string, DeviceSupportTicketLink> = {};

  for (const ticket of data ?? []) {
    const metadata = (ticket.metadata ?? {}) as Record<string, unknown>;
    const deviceId = metadata.device_id;

    if (typeof deviceId !== "string" || !deviceId) continue;
    // Rows arrive newest first, so the first hit for a device is the one to show.
    if (byDevice[deviceId]) continue;

    byDevice[deviceId] = {
      ticket_id: ticket.id,
      ticket_number: ticket.ticket_number,
      subject: ticket.subject,
      status: ticket.status,
      created_at: ticket.created_at,
    };
  }

  return { data: byDevice };
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
    .select(
      "id, ticket_id, message_id, uploaded_by, file_name, file_size, file_type, created_at",
    )
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
  uploadSessionId: string,
  contentType: string,
): Promise<{ target?: SupportUploadTarget; error?: string }> {
  if (!clerkOrgId) return { error: "Organization ID is required" };

  const uploadRequest = validateSupportUploadRequest(
    fileName,
    fileId,
    uploadSessionId,
    contentType,
  );
  if ("error" in uploadRequest) return { error: uploadRequest.error };

  const supabase = createServiceRoleClient();

  const { data: merchant, error: merchantError } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (merchantError || !merchant) return { error: "Merchant not found" };

  if (uploadRequest.data.isVideo) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const cdnHostname = process.env.BUNNY_CDN_HOSTNAME;
    if (!supabaseUrl || !cdnHostname) {
      return { error: "CDN upload is not configured" };
    }

    const storedFileName = buildSupportCdnFileName(
      [uploadRequest.data.uploadSessionId, uploadRequest.data.fileId],
      uploadRequest.data.fileName,
    );
    const storagePath = buildSupportCdnStoragePath(
      { scope: "merchant", merchantId: merchant.id },
      storedFileName,
    );

    return {
      target: {
        provider: "cdn",
        upload_url: `${supabaseUrl}/functions/v1/cdn-upload`,
        method: "POST",
        file_path: buildSupportCdnUrl(cdnHostname, storagePath),
        headers: {
          "x-cdn-scope": "merchant",
          "x-cdn-merchant-id": merchant.id,
          "x-cdn-category": "support",
          "x-cdn-file-name": storedFileName,
          "x-cdn-content-type": uploadRequest.data.contentType,
        },
      },
    };
  }

  const path =
    `${merchant.id}/tickets/${uploadRequest.data.uploadSessionId}/` +
    `${uploadRequest.data.fileId}_${uploadRequest.data.sanitizedFileName}`;

  const { data, error } = await supabase.storage
    .from("support-attachments")
    .createSignedUploadUrl(path);

  if (error) return { error: error.message };
  return {
    target: {
      provider: "supabase",
      upload_url: data.signedUrl,
      method: "PUT",
      file_path: path,
    },
  };
}

// ============================================================================
// DISCARD UPLOADED ATTACHMENT (Merchant) — cancel / remove before send
// ============================================================================

/**
 * Deletes an uploaded object that the user cancelled or removed before sending
 * the message, so a discarded upload leaves no orphan in the bucket.
 *
 * The caller's merchant id is re-derived server-side and the path is required to
 * sit under that merchant's prefix — a client cannot pass an arbitrary path and
 * delete another tenant's attachment.
 */
export async function DiscardSupportUpload(
  clerkOrgId: string,
  filePath: string
): Promise<{ success?: boolean; error?: string }> {
  if (!clerkOrgId) return { error: "Organization ID is required" };
  if (!filePath) return { error: "File path is required" };

  const supabase = createServiceRoleClient();

  const { data: merchant, error: merchantError } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (merchantError || !merchant) return { error: "Merchant not found" };

  if (/^https:\/\//i.test(filePath)) {
    const storagePath = parseSupportCdnStoragePath(
      filePath,
      process.env.BUNNY_CDN_HOSTNAME ?? "",
      `merchants/${merchant.id}`,
    );
    if (!storagePath) return { error: "Invalid attachment path" };

    const userSupabase = createServerSupabaseClient();
    const { data, error } = await userSupabase.functions.invoke("cdn-upload", {
      method: "DELETE",
      body: {
        scope: "merchant",
        merchantId: merchant.id,
        storagePath,
      },
    });

    if (error) return { error: error.message };
    if (!data?.success) return { error: data?.error || "Failed to delete upload" };
    return { success: true };
  }

  if (!filePath.startsWith(`${merchant.id}/tickets/`)) {
    return { error: "Invalid attachment path" };
  }

  const { error } = await supabase.storage
    .from("support-attachments")
    .remove([filePath]);

  if (error) return { error: error.message };
  return { success: true };
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
  /**
   * Set when the report was opened from a specific device. The id arrives from
   * a query string, so it is re-checked against the merchant before it is used.
   */
  deviceId?: string;
}

/**
 * Writes the ticket into the device's own append-only history.
 *
 * device_notes is HQ-insert-only under RLS and guarded against UPDATE/DELETE,
 * so this runs on the service-role client and never rewrites an existing note —
 * a later state change appends another row instead.
 *
 * A failure here never fails the ticket: the merchant's report is already
 * filed, and the note is a convenience for whoever picks the ticket up.
 */
async function linkTicketToDevice(
  supabase: ReturnType<typeof createServiceRoleClient>,
  params: {
    merchantId: string;
    deviceId: string;
    ticketNumber: string;
    subject: string;
    userId: string;
    userName: string;
  },
): Promise<{ ok: boolean; error?: string }> {
  const { data: device, error: deviceError } = await supabase
    .from("device_inventory")
    .select("id")
    .eq("id", params.deviceId)
    .eq("merchant_id", params.merchantId)
    .maybeSingle();

  if (deviceError) return { ok: false, error: deviceError.message };
  if (!device) {
    return { ok: false, error: "Device does not belong to this merchant" };
  }

  const { error } = await supabase.from("device_notes").insert({
    device_id: params.deviceId,
    note_type: "support",
    content: params.subject,
    created_by: params.userId,
    created_by_name: params.userName,
    external_ticket_id: params.ticketNumber,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
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

  const attachmentValidation = validateMerchantSupportAttachments(
    input.attachments,
    merchant.id,
  );
  if (attachmentValidation.error) {
    return { error: attachmentValidation.error };
  }

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
    p_metadata: input.deviceId
      ? { ...(input.metadata || {}), device_id: input.deviceId }
      : input.metadata || {},
    p_attachments: attachmentValidation.data,
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

  if (input.deviceId) {
    const link = await linkTicketToDevice(supabase, {
      merchantId: merchant.id,
      deviceId: input.deviceId,
      ticketNumber: data.ticket_number,
      subject: input.subject,
      userId: user.id,
      userName,
    });

    if (!link.ok) {
      console.error("[CreateTicket] Device link failed", {
        ticketId: data.ticket_id,
        deviceId: input.deviceId,
        error: link.error,
      });
    }
  }

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

  const attachmentValidation = validateMerchantSupportAttachments(
    attachments,
    merchant.id,
  );
  if (attachmentValidation.error) {
    return { error: attachmentValidation.error };
  }

  const userName = user.fullName || user.firstName || "Unknown";

  const { data, error } = await supabase.rpc("add_ticket_message_with_attachments", {
    p_ticket_id: ticketId,
    p_sender_id: user.id,
    p_sender_name: userName,
    p_sender_role: "merchant",
    p_message: message,
    p_is_internal: false,
    p_attachments: attachmentValidation.data,
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
