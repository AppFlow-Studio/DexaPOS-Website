"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { clerkClient, auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

// ============================================================================
// TYPES
// ============================================================================

export interface PendingInvite {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role_code: string;
  invite_type: string | null;
  status: string;
  created_at: string;
  expires_at: string;
  clerk_invite_id: string | null;
  location_assignments: any[];
  merchant_id: string;
}

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Fetch all pending (status = 'pending') invitations for a merchant.
 * Excludes 'direct_created' audit records — those are not actionable invites.
 */
export async function GetPendingInvites(
  clerkOrgId: string,
): Promise<PendingInvite[]> {
  if (!clerkOrgId) return [];

  const supabase = createServerSupabaseClient();

  const { data: merchant } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (!merchant) return [];

  // Auto-expire via service role so RLS can't silently no-op the update.
  const nowIso = new Date().toISOString();
  const admin = createServiceRoleClient();
  await admin
    .from("location_invites")
    .update({ status: "expired", updated_at: nowIso })
    .eq("merchant_id", merchant.id)
    .eq("status", "pending")
    .lt("expires_at", nowIso);

  // Belt and suspenders: also filter out rows whose expires_at is in the past,
  // even if the status flip above didn't land. The UI should only ever see
  // truly-still-pending invites.
  const { data, error } = await supabase
    .from("location_invites")
    .select(
      "id, email, first_name, last_name, role_code, invite_type, status, created_at, expires_at, clerk_invite_id, location_assignments, merchant_id",
    )
    .eq("merchant_id", merchant.id)
    .eq("status", "pending")
    .gte("expires_at", nowIso)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[GetPendingInvites] Error:", error);
    return [];
  }

  return (data || []) as PendingInvite[];
}

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Resend a pending invitation:
 *  1. Revoke the old Clerk invitation (best-effort)
 *  2. Create a new Clerk invitation with the same metadata
 *  3. Update location_invites with the new clerk_invite_id + reset expires_at
 */
export async function ResendStaffInvite(
  inviteId: string,
  clerkOrgId: string,
): Promise<{ error?: string; data?: { newClerkInviteId: string } }> {
  const { userId: actorUserId } = await auth();
  if (!actorUserId) return { error: "Unauthorized" };

  const supabase = createServerSupabaseClient();

  const { data: invite, error: fetchError } = await supabase
    .from("location_invites")
    .select("*")
    .eq("id", inviteId)
    .single();

  if (fetchError || !invite) return { error: "Invite not found" };
  if (invite.status !== "pending") {
    return { error: "Only pending invites can be resent" };
  }

  const clerk = await clerkClient();

  // 1. Revoke the old Clerk invitation (best-effort — may already be expired)
  if (invite.clerk_invite_id) {
    try {
      await clerk.organizations.revokeOrganizationInvitation({
        organizationId: clerkOrgId,
        invitationId: invite.clerk_invite_id,
        requestingUserId: actorUserId,
      });
    } catch (revokeErr) {
      console.warn(
        "[ResendStaffInvite] Could not revoke old invite (continuing):",
        revokeErr,
      );
    }
  }

  // 2. Try to create a fresh Clerk invitation. If Clerk rejects (org mismatch,
  // email already accepted elsewhere, etc.), fall back to cancelling the DB
  // row so the user can re-invite manually instead of being stuck.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  // New invitees must land on /accept-invitation (which renders the Clerk
  // CAPTCHA anchor required for custom sign-up). /dashboard has no sign-up
  // handling, so a brand-new user would be bounced to sign-in.
  const redirectUrl = appUrl
    ? `${appUrl}/accept-invitation?email=${encodeURIComponent(invite.email)}&firstName=${encodeURIComponent(invite.first_name ?? "")}&lastName=${encodeURIComponent(invite.last_name ?? "")}`
    : undefined;

  let invitation;
  try {
    invitation = await clerk.organizations.createOrganizationInvitation({
      organizationId: clerkOrgId,
      emailAddress: invite.email,
      role: "org:member",
      ...(redirectUrl && { redirectUrl }),
      publicMetadata: {
        creationType: "invitation",
        roleCode: invite.role_code,
        organizationId: clerkOrgId,
        merchantId: invite.merchant_id,
        locationAssignments: invite.location_assignments ?? [],
        firstName: invite.first_name,
        lastName: invite.last_name,
        phone: invite.phone ?? null,
      },
    });
  } catch (createErr: any) {
    console.error("[ResendStaffInvite] Clerk create failed, cancelling locally:", createErr);
    // RLS on location_invites has no UPDATE policy → use service role.
    const adminCancel = createServiceRoleClient();
    await adminCancel
      .from("location_invites")
      .update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", inviteId);
    revalidatePath("/dashboard/staff");
    return {
      error:
        createErr?.errors?.[0]?.message ??
        "Failed to resend invitation. The pending invite was cancelled — please re-invite manually.",
    };
  }

  // RLS on location_invites has no UPDATE policy → use service role.
  const admin = createServiceRoleClient();
  const { data: updatedRows, error: updateError } = await admin
    .from("location_invites")
    .update({
      clerk_invite_id: invitation.id,
      expires_at: new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000,
      ).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", inviteId)
    .select("id");

  if (updateError) {
    console.error("[ResendStaffInvite] DB update failed:", updateError);
    return { error: "Invitation sent but failed to update database" };
  }
  if (!updatedRows || updatedRows.length === 0) {
    return { error: "Invitation sent but failed to update database" };
  }

  revalidatePath("/dashboard/staff");
  return { data: { newClerkInviteId: invitation.id } };
}

/**
 * Revoke a pending invitation:
 *  1. Revoke via Clerk API (best-effort)
 *  2. Set local status to 'cancelled'
 */
export async function RevokeStaffInvite(
  inviteId: string,
  clerkOrgId: string,
): Promise<{ error?: string; data?: { success: boolean } }> {
  const { userId: actorUserId } = await auth();
  if (!actorUserId) return { error: "Unauthorized" };

  const supabase = createServerSupabaseClient();

  const { data: invite, error: fetchError } = await supabase
    .from("location_invites")
    .select("clerk_invite_id, status, email")
    .eq("id", inviteId)
    .single();

  if (fetchError || !invite) return { error: "Invite not found" };

  // Idempotent: already terminal → nothing to do, but report success so the
  // UI can refresh. Re-inviting is unblocked because the email-conflict check
  // only counts status='pending' in location_invites.
  if (invite.status === "cancelled" || invite.status === "accepted") {
    return { data: { success: true } };
  }

  // Best-effort Clerk revoke. If it fails (already expired/accepted, org
  // mismatch, transient network), we still mark the DB row cancelled so the
  // user isn't stuck and can re-invite manually.
  if (invite.clerk_invite_id && clerkOrgId) {
    try {
      const clerk = await clerkClient();
      await clerk.organizations.revokeOrganizationInvitation({
        organizationId: clerkOrgId,
        invitationId: invite.clerk_invite_id,
        requestingUserId: actorUserId,
      });
    } catch (revokeErr) {
      console.warn(
        "[RevokeStaffInvite] Clerk revoke failed (falling back to DB-only cancel):",
        revokeErr,
      );
    }
  }

  // RLS on location_invites declares INSERT + SELECT only — no UPDATE policy —
  // so a Clerk-authed update silently no-ops (0 rows affected, no error).
  // Use the service-role client; auth has already been enforced above.
  const admin = createServiceRoleClient();
  const { data: updatedRows, error: updateError } = await admin
    .from("location_invites")
    .update({
      status: "cancelled",
      updated_at: new Date().toISOString(),
    })
    .eq("id", inviteId)
    .select("id");

  if (updateError) {
    console.error("[RevokeStaffInvite] DB update failed:", updateError);
    return { error: "Failed to cancel invitation in database" };
  }
  if (!updatedRows || updatedRows.length === 0) {
    return { error: "Failed to cancel invitation in database" };
  }

  revalidatePath("/dashboard/staff");
  return { data: { success: true } };
}
