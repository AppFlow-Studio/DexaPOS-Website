"use server";

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { currentUser } from "@clerk/nextjs/server";
import { z } from "zod";
import { assertHQPermission } from "@/lib/admin/auth";
import { LogAuditEvent } from "@/app/dashboard/actions/audit-logs";
import {
  parseSupportAssigneeEmails,
  validateSupportAssigneeSelection,
} from "@/lib/support/assignees";
import {
  requestSupportTicketCreatedNotification,
  requestSupportTicketMessageNotification,
} from "@/lib/support/ticket-notification-request";
import {
  SUPPORT_ATTACHMENT_MAX_BYTES,
  SUPPORT_ATTACHMENT_MAX_FILES,
  SUPPORT_ATTACHMENT_MIME_TYPES,
  getAttachmentMimeTypeFromFileName,
  getSupportAttachmentMaxBytes,
  isSupportVideoMimeType,
} from "@/lib/support/attachment-constraints";
import { validateSupportUploadRequest } from "@/lib/support/attachment-validation";
import {
  buildSupportCdnFileName,
  buildSupportCdnStoragePath,
  buildSupportCdnUrl,
  parseSupportCdnStoragePath,
  sanitizeSupportFileName,
  sanitizeSupportIdentitySegment,
} from "@/lib/support/cdn";
import {
  SupportTicket,
  SupportTicketWithMessages,
  SupportTicketAttachmentWithUrl,
  AttachmentInput,
  SupportUploadTarget,
  SupportDashboardStats,
  TicketFilters,
  TicketStatus,
  TicketPriority,
  TicketCategory,
} from "@/types/support-ticket";

const hqSupportAttachmentsSchema = z
  .array(
    z
      .object({
        file_name: z.string().trim().min(1).max(255),
        file_path: z.string().trim().min(1).max(1000),
        file_size: z.number().int().positive().max(SUPPORT_ATTACHMENT_MAX_BYTES),
        file_type: z.enum(SUPPORT_ATTACHMENT_MIME_TYPES),
      })
      .strict()
      .superRefine((attachment, context) => {
        const expectedType = getAttachmentMimeTypeFromFileName(
          attachment.file_name,
        );
        if (!expectedType) {
          context.addIssue({
            code: "custom",
            path: ["file_name"],
            message: "Unsupported attachment type",
          });
        } else if (expectedType !== attachment.file_type) {
          context.addIssue({
            code: "custom",
            path: ["file_type"],
            message: "Attachment type does not match its filename",
          });
        }
        if (
          attachment.file_size >
          getSupportAttachmentMaxBytes(attachment.file_type)
        ) {
          context.addIssue({
            code: "custom",
            path: ["file_size"],
            message: "Attachment exceeds the allowed size",
          });
        }
      }),
  )
  .max(SUPPORT_ATTACHMENT_MAX_FILES);

const createHQSupportTicketSchema = z.object({
  subject: z.string().trim().min(5).max(150),
  description: z.string().trim().min(10).max(3000),
  category: z.enum([
    "general",
    "billing",
    "hardware",
    "pos_app",
    "menu",
    "payments",
    "kitchen",
    "feature_request",
    "onboarding",
  ]),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  assignedToEmails: z.array(z.string().trim().email()).max(50).optional(),
  uploadSessionId: z.string().uuid().optional(),
  attachments: hqSupportAttachmentsSchema.optional(),
});

function isValidHqCdnAttachmentPath(
  attachment: AttachmentInput,
  organizationId: string,
  identityPrefixSegments: string[],
): boolean {
  if (!isSupportVideoMimeType(attachment.file_type)) return false;

  const storagePath = parseSupportCdnStoragePath(
    attachment.file_path,
    process.env.BUNNY_CDN_HOSTNAME ?? "",
    `organizations/${organizationId}`,
  );
  const storedFileName = storagePath?.split("/").at(-1);
  const identityPrefix =
    identityPrefixSegments.map(sanitizeSupportIdentitySegment).join("_") + "_";
  if (!storedFileName?.startsWith(identityPrefix)) return false;

  const remainder = storedFileName.slice(identityPrefix.length);
  const fileId = remainder.slice(0, 36);
  const separator = remainder.charAt(36);
  const pathFileName = remainder.slice(37);

  return (
    z.string().uuid().safeParse(fileId).success &&
    separator === "_" &&
    pathFileName === sanitizeSupportFileName(attachment.file_name)
  );
}

export type CreateHQSupportTicketInput = {
  subject: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  assignedToEmails?: string[];
  uploadSessionId?: string;
  attachments?: AttachmentInput[];
};

// ============================================================================
// GET ALL TICKETS (Admin)
// ============================================================================

export async function GetAllTickets(
  filters?: TicketFilters,
  limit: number = 30,
  offset: number = 0
): Promise<{ data?: SupportTicket[]; total?: number; error?: string }> {
  await assertHQPermission("hq.support.view");

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

  if (filters?.ticket_scope && filters.ticket_scope !== "all") {
    query = query.eq("ticket_scope", filters.ticket_scope);
  }

  if (filters?.category && filters.category !== "all") {
    query = query.eq("category", filters.category);
  }

  if (filters?.priority && filters.priority !== "all") {
    query = query.eq("priority", filters.priority);
  }

  if (filters?.assigned_to) {
    if (filters.assigned_to === "unassigned") {
      query = query
        .is("assigned_to", null)
        .eq("assigned_to_emails", []);
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
// CREATE DEXA HQ DEVELOPER TICKET
// ============================================================================

export async function GetConfiguredSupportAssignees(): Promise<{
  data?: string[];
  error?: string;
}> {
  try {
    await assertHQPermission("hq.support.manage");
    return {
      data: parseSupportAssigneeEmails(
        process.env.SUPPORT_TICKET_NOTIFICATION_EMAILS ?? "",
      ),
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Failed to load support assignees",
    };
  }
}

export async function CreateHQSupportTicket(
  input: CreateHQSupportTicketInput,
): Promise<{
  data?: {
    ticket_id: string;
    ticket_number: string;
    ticket_scope: "hq_internal";
    merchant_id: null;
    location_id: null;
  };
  error?: string;
  notificationWarning?: string;
}> {
  try {
    const { userId, orgId } = await assertHQPermission("hq.support.manage");
    const parsed = createHQSupportTicketSchema.safeParse(input);
    if (!parsed.success) {
      return {
        error: parsed.error.issues[0]?.message || "Invalid ticket details",
      };
    }

    const supabase = createServiceRoleClient();
    const user = await currentUser();
    const submittedByName =
      user?.fullName || user?.firstName || "DEXA HQ Admin";
    const submittedByEmail =
      user?.primaryEmailAddress?.emailAddress ||
      user?.emailAddresses?.[0]?.emailAddress ||
      null;
    const attachments = parsed.data.attachments ?? [];
    let assignedToEmails: string[];

    try {
      assignedToEmails = validateSupportAssigneeSelection(
        parsed.data.assignedToEmails ?? [],
        process.env.SUPPORT_TICKET_NOTIFICATION_EMAILS ?? "",
      );
    } catch (error) {
      return {
        error:
          error instanceof Error
            ? error.message
            : "Invalid support assignee selection",
      };
    }

    if (attachments.length > 0 && !parsed.data.uploadSessionId) {
      return { error: "Attachment upload session is missing" };
    }

    if (attachments.length > 0) {
      const expectedPathPrefix =
        `admin/drafts/${userId}/${parsed.data.uploadSessionId}/`;
      const hasInvalidPath = attachments.some(
        (attachment) =>
          isSupportVideoMimeType(attachment.file_type)
            ? !isValidHqCdnAttachmentPath(
                attachment,
                orgId,
                [userId, parsed.data.uploadSessionId!],
              )
            : !attachment.file_path.startsWith(expectedPathPrefix),
      );

      if (hasInvalidPath) {
        return { error: "One or more attachment paths are invalid" };
      }
    }

    const { data, error } = await supabase.rpc("create_hq_support_ticket", {
      p_subject: parsed.data.subject,
      p_description: parsed.data.description,
      p_category: parsed.data.category,
      p_submitted_by: userId,
      p_submitted_by_name: submittedByName,
      p_submitted_by_email: submittedByEmail,
      p_priority: parsed.data.priority,
      p_metadata: {
        created_from: "manage_support",
        source_org_id: orgId,
        assigned_to_emails: assignedToEmails,
      },
      p_attachments: attachments,
    });

    if (error || !data) {
      return { error: error?.message || "Failed to create support ticket" };
    }

    const result = data as {
      ticket_id: string;
      ticket_number: string;
      ticket_scope: "hq_internal";
      merchant_id: null;
      location_id: null;
    };

    try {
      await LogAuditEvent({
        clerkOrgId: orgId,
        locationId: null,
        platformScoped: true,
        action: "created",
        actionCategory: "support",
        severity: "info",
        resourceType: "support_ticket",
        resourceId: result.ticket_id,
        resourceName: parsed.data.subject,
        metadata: {
          source: "hq_admin",
          ticket_number: result.ticket_number,
          priority: parsed.data.priority,
          category: parsed.data.category,
          ticket_scope: "hq_internal",
          assigned_to_emails: assignedToEmails,
        },
      });
    } catch (auditError) {
      console.error("[CreateHQSupportTicket] Audit logging failed", auditError);
    }

    const notificationResult =
      await requestSupportTicketCreatedNotification(result.ticket_id);
    const notificationWarning = notificationResult.ok
      ? undefined
      : "Ticket created, but email notification delivery could not be confirmed.";

    if (!notificationResult.ok) {
      console.error("[CreateHQSupportTicket] Notification request failed", {
        ticketId: result.ticket_id,
        error: notificationResult.error,
      });
    }

    return { data: result, notificationWarning };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Failed to create support ticket",
    };
  }
}

// ============================================================================
// GET SIGNED DRAFT UPLOAD URL (HQ ticket creation)
// ============================================================================

export async function GetHQSupportDraftUploadUrl(
  fileName: string,
  fileId: string,
  uploadSessionId: string,
  contentType: string,
): Promise<{ target?: SupportUploadTarget; error?: string }> {
  try {
    const { userId, orgId } = await assertHQPermission("hq.support.manage");
    const uploadRequest = validateSupportUploadRequest(
      fileName,
      fileId,
      uploadSessionId,
      contentType,
    );
    if ("error" in uploadRequest) return { error: uploadRequest.error };

    if (uploadRequest.data.isVideo) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const cdnHostname = process.env.BUNNY_CDN_HOSTNAME;
      if (!supabaseUrl || !cdnHostname) {
        return { error: "CDN upload is not configured" };
      }

      const storedFileName = buildSupportCdnFileName(
        [userId, uploadRequest.data.uploadSessionId, uploadRequest.data.fileId],
        uploadRequest.data.fileName,
      );
      const storagePath = buildSupportCdnStoragePath(
        { scope: "organization", organizationId: orgId },
        storedFileName,
      );

      return {
        target: {
          provider: "cdn",
          upload_url: `${supabaseUrl}/functions/v1/cdn-upload`,
          method: "POST",
          file_path: buildSupportCdnUrl(cdnHostname, storagePath),
          headers: {
            "x-cdn-scope": "organization",
            "x-cdn-organization-id": orgId,
            "x-cdn-category": "support",
            "x-cdn-file-name": storedFileName,
            "x-cdn-content-type": uploadRequest.data.contentType,
          },
        },
      };
    }

    const path =
      `admin/drafts/${userId}/${uploadRequest.data.uploadSessionId}/` +
      `${uploadRequest.data.fileId}_${uploadRequest.data.sanitizedFileName}`;
    const supabase = createServiceRoleClient();
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
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Failed to prepare attachment",
    };
  }
}

// ============================================================================
// GET TICKET DETAIL (Admin — includes internal notes)
// ============================================================================

export async function GetAdminTicketDetail(
  ticketId: string
): Promise<{ data?: SupportTicketWithMessages; error?: string }> {
  await assertHQPermission("hq.support.view");

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

  // Fetch attachment metadata only. Bytes are streamed through
  // /api/support/attachments/[id], which audit-logs every access. We no longer
  // mint bulk signed URLs at page-load time — that overstated access (most
  // URLs were never redeemed) and bypassed any audit trail.
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
  fileId: string,
  uploadSessionId: string,
  contentType: string,
): Promise<{ target?: SupportUploadTarget; error?: string }> {
  const { userId, orgId } = await assertHQPermission("hq.support.manage");

  const uploadRequest = validateSupportUploadRequest(
    fileName,
    fileId,
    uploadSessionId,
    contentType,
  );
  if ("error" in uploadRequest) return { error: uploadRequest.error };

  const supabase = createServiceRoleClient();
  const user = await currentUser();
  if (!user) return { error: "Authentication required" };

  if (uploadRequest.data.isVideo) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const cdnHostname = process.env.BUNNY_CDN_HOSTNAME;
    if (!supabaseUrl || !cdnHostname) {
      return { error: "CDN upload is not configured" };
    }

    const storedFileName = buildSupportCdnFileName(
      [userId, ticketId, uploadRequest.data.fileId],
      uploadRequest.data.fileName,
    );
    const storagePath = buildSupportCdnStoragePath(
      { scope: "organization", organizationId: orgId },
      storedFileName,
    );

    return {
      target: {
        provider: "cdn",
        upload_url: `${supabaseUrl}/functions/v1/cdn-upload`,
        method: "POST",
        file_path: buildSupportCdnUrl(cdnHostname, storagePath),
        headers: {
          "x-cdn-scope": "organization",
          "x-cdn-organization-id": orgId,
          "x-cdn-category": "support",
          "x-cdn-file-name": storedFileName,
          "x-cdn-content-type": uploadRequest.data.contentType,
        },
      },
    };
  }

  const path =
    `admin/tickets/${ticketId}/` +
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
// DISCARD UPLOADED ATTACHMENT (Admin) — cancel / remove before send
// ============================================================================

/**
 * Deletes an uploaded object that an HQ user cancelled or removed before
 * sending, so a discarded upload leaves no orphan in the bucket.
 *
 * Constrained to the `admin/` prefix that HQ uploads write to, so this cannot be
 * used to delete a merchant's attachments.
 */
export async function DiscardAdminSupportUpload(
  filePath: string,
): Promise<{ success?: boolean; error?: string }> {
  const { orgId } = await assertHQPermission("hq.support.manage");

  if (!filePath) return { error: "File path is required" };
  if (/^https:\/\//i.test(filePath)) {
    const storagePath = parseSupportCdnStoragePath(
      filePath,
      process.env.BUNNY_CDN_HOSTNAME ?? "",
      `organizations/${orgId}`,
    );
    if (!storagePath) return { error: "Invalid attachment path" };

    const userSupabase = createServerSupabaseClient();
    const { data, error } = await userSupabase.functions.invoke("cdn-upload", {
      method: "DELETE",
      body: {
        scope: "organization",
        organizationId: orgId,
        storagePath,
      },
    });

    if (error) return { error: error.message };
    if (!data?.success) return { error: data?.error || "Failed to delete upload" };
    return { success: true };
  }

  if (
    !filePath.startsWith("admin/tickets/") &&
    !filePath.startsWith("admin/drafts/")
  ) {
    return { error: "Invalid attachment path" };
  }

  const supabase = createServiceRoleClient();
  const { error } = await supabase.storage
    .from("support-attachments")
    .remove([filePath]);

  if (error) return { error: error.message };
  return { success: true };
}

// ============================================================================
// ADMIN ADD MESSAGE
// ============================================================================

export async function AdminAddMessage(
  ticketId: string,
  message: string,
  isInternal: boolean = false,
  attachments: AttachmentInput[] = []
): Promise<{
  data?: { message_id: string };
  error?: string;
  notificationWarning?: string;
}> {
  const { userId, orgId } = await assertHQPermission("hq.support.manage");

  const supabase = createServiceRoleClient();
  const user = await currentUser();

  if (!user) return { error: "Authentication required" };

  const parsedAttachments = hqSupportAttachmentsSchema.safeParse(attachments);
  if (!parsedAttachments.success) {
    return {
      error:
        parsedAttachments.error.issues[0]?.message ||
        "Invalid attachment metadata",
    };
  }

  const hasInvalidPath = parsedAttachments.data.some((attachment) =>
    isSupportVideoMimeType(attachment.file_type)
      ? !isValidHqCdnAttachmentPath(
          attachment,
          orgId,
          [userId, ticketId],
        )
      : !attachment.file_path.startsWith(`admin/tickets/${ticketId}/`),
  );
  if (hasInvalidPath) {
    return { error: "One or more attachment paths are invalid" };
  }

  const userName = user.fullName || user.firstName || "DEXA Support";

  const { data, error } = await supabase.rpc("add_ticket_message_with_attachments", {
    p_ticket_id: ticketId,
    p_sender_id: user.id,
    p_sender_name: userName,
    p_sender_role: "admin",
    p_message: message,
    p_is_internal: isInternal,
    p_attachments: parsedAttachments.data,
  });

  if (error) return { error: error.message };

  const notificationResult = await requestSupportTicketMessageNotification(
    data.message_id,
  );
  const notificationWarning = notificationResult.ok
    ? undefined
    : "Message saved, but email notification delivery could not be confirmed.";

  if (!notificationResult.ok) {
    console.error("[AdminAddMessage] Notification request failed", {
      ticketId,
      messageId: data.message_id,
      isInternal,
      error: notificationResult.error,
    });
  }

  return { data, notificationWarning };
}

// ============================================================================
// UPDATE TICKET STATUS (Admin)
// ============================================================================

export async function AdminUpdateTicketStatus(
  ticketId: string,
  status: TicketStatus,
  resolutionNotes?: string
): Promise<{ success?: boolean; error?: string }> {
  await assertHQPermission("hq.support.manage");

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
  await assertHQPermission("hq.support.manage");

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
  await assertHQPermission("hq.support.manage");

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
  await assertHQPermission("hq.support.manage");

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
  await assertHQPermission("hq.support.manage");

  const supabase = createServiceRoleClient();
  // organizations.id IS the Clerk org ID (text primary key) — no lookup needed
  const hqOrgId = process.env.DEXA_POS_INTERNAL_TEAM_ID!;

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
  await assertHQPermission("hq.support.view");

  const supabase = createServiceRoleClient();

  const { data, error } = await supabase.rpc("get_support_dashboard_stats");

  if (error) return { error: error.message };
  return { data };
}

// ============================================================================
// GET UNREAD TICKET COUNTS (notification bell — role-aware via JWT)
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
