"use server";

import { auth } from "@clerk/nextjs/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolveImpersonationFromCookies } from "@/lib/admin/impersonation";

export type MerchantRoleInfo = {
  userId: string;
  merchantId: string;
  clerkOrgId: string;
  roleCode: string;
  isOwnerOrAdmin: boolean;
  isManager: boolean;
  isMember: boolean;
  assignedLocationIds: string[];
};

/**
 * Gets the current authenticated user's merchant role and assigned locations.
 * Uses Clerk's auth() to automatically resolve the current user and org.
 *
 * Role rules enforced by callers:
 *  - owner / admin  → full CRUD on all entities
 *  - manager        → full CRUD on location-specific entities (their locations only)
 *                     edit price/availability on global items (via location overrides)
 *                     cannot create/delete global entities
 *  - member         → view only
 *
 * Under HQ impersonation: the calling HQ admin is treated as merchant.owner
 * for the impersonated merchant. This function is the one chokepoint every
 * dashboard server action consults, so the override here cascades to menus,
 * items, orderout, useManagerPermissions, etc.
 */
export async function getCurrentUserMerchantRole(): Promise<MerchantRoleInfo | null> {
  const { userId, orgId } = await auth();
  if (!userId) return null;

  const supabase = createServerSupabaseClient();

  // ── Impersonation path ────────────────────────────────────────────────────
  const impersonation = await resolveImpersonationFromCookies().catch(() => null);
  if (impersonation) {
    return {
      userId,
      merchantId: impersonation.merchantId,
      clerkOrgId: impersonation.clerkOrgId,
      roleCode: "merchant.owner",
      isOwnerOrAdmin: true,
      isManager: false,
      isMember: false,
      assignedLocationIds: [], // owner sees all locations; this list is unused for owners
    };
  }

  if (!orgId) return null;

  const { data: merchant } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", orgId)
    .single();

  if (!merchant) return null;

  const { data: member } = await supabase
    .from("members")
    .select("role")
    .eq("organization_id", orgId)
    .eq("user_id", userId)
    .single();

  const roleCode = member?.role || "";
  const isOwnerOrAdmin =
    roleCode === "merchant.owner" ||
    roleCode === "merchant.admin" ||
    roleCode === "org:admin" ||
    roleCode === "admin";
  const isManager = roleCode === "merchant.manager";
  const isMember = roleCode === "merchant.member";

  let assignedLocationIds: string[] = [];
  if (!isOwnerOrAdmin) {
    const { data: locationMembers } = await supabase
      .from("location_members")
      .select("location_id")
      .eq("user_id", userId)
      .eq("merchant_id", merchant.id);

    assignedLocationIds = (locationMembers || [])
      .map((lm) => lm.location_id)
      .filter(Boolean) as string[];
  }

  return {
    userId,
    merchantId: merchant.id,
    clerkOrgId: orgId,
    roleCode,
    isOwnerOrAdmin,
    isManager,
    isMember,
    assignedLocationIds,
  };
}

/**
 * Exported for use in client-side hooks via a server action wrapper.
 * Returns a serializable subset of role info.
 */
export async function GetCurrentUserRoleInfo(): Promise<{
  roleCode: string;
  isOwnerOrAdmin: boolean;
  isManager: boolean;
  isMember: boolean;
  assignedLocationIds: string[];
} | null> {
  const info = await getCurrentUserMerchantRole();
  if (!info) return null;
  return {
    roleCode: info.roleCode,
    isOwnerOrAdmin: info.isOwnerOrAdmin,
    isManager: info.isManager,
    isMember: info.isMember,
    assignedLocationIds: info.assignedLocationIds,
  };
}
