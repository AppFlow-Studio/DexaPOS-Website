"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
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

  // Auto-expire: mark any pending invites whose expires_at has passed
  await supabase
    .from("location_invites")
    .update({ status: "expired", updated_at: new Date().toISOString() })
    .eq("merchant_id", merchant.id)
    .eq("status", "pending")
    .lt("expires_at", new Date().toISOString());

  const { data, error } = await supabase
    .from("location_invites")
    .select(
      "id, email, first_name, last_name, role_code, invite_type, status, created_at, expires_at, clerk_invite_id, location_assignments, merchant_id",
    )
    .eq("merchant_id", merchant.id)
    .eq("status", "pending")
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

  try {
    const clerk = await clerkClient();

    // 1. Revoke old Clerk invitation (ignore errors — may already be expired)
    if (invite.clerk_invite_id) {
      try {
        await clerk.organizations.revokeOrganizationInvitation({
          organizationId: clerkOrgId,
          invitationId: invite.clerk_invite_id,
          requestingUserId: actorUserId,
        });
      } catch (revokeErr) {
        console.warn(
          "[ResendStaffInvite] Could not revoke old invite (may already be expired):",
          revokeErr,
        );
      }
    }

    // 2. Build redirectUrl from env var
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const redirectUrl = appUrl ? `${appUrl}/dashboard` : undefined;

    // 3. Create a fresh Clerk invitation with the original metadata
    const invitation = await clerk.organizations.createOrganizationInvitation({
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

    // 4. Update DB record
    await supabase
      .from("location_invites")
      .update({
        clerk_invite_id: invitation.id,
        expires_at: new Date(
          Date.now() + 7 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", inviteId);

    revalidatePath("/dashboard/staff");
    return { data: { newClerkInviteId: invitation.id } };
  } catch (error: any) {
    console.error("[ResendStaffInvite] Error:", error);
    return {
      error: error?.errors?.[0]?.message ?? "Failed to resend invitation",
    };
  }
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
  if (invite.status !== "pending") {
    return { error: "Only pending invites can be revoked" };
  }

  try {
    const clerk = await clerkClient();

    // 1. Revoke Clerk invitation (best-effort — may already be expired/accepted)
    if (invite.clerk_invite_id) {
      try {
        await clerk.organizations.revokeOrganizationInvitation({
          organizationId: clerkOrgId,
          invitationId: invite.clerk_invite_id,
          requestingUserId: actorUserId,
        });
      } catch (revokeErr) {
        console.warn(
          "[RevokeStaffInvite] Clerk revoke failed (continuing):",
          revokeErr,
        );
      }
    }

    // 2. Update local status to 'cancelled'
    await supabase
      .from("location_invites")
      .update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", inviteId);

    revalidatePath("/dashboard/staff");
    return { data: { success: true } };
  } catch (error: any) {
    console.error("[RevokeStaffInvite] Error:", error);
    return { error: "Failed to revoke invitation" };
  }
}
