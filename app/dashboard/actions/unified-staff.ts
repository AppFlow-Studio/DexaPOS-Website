"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  UnifiedStaffMember,
  InviteStaffFormData,
  UpdateStaffAssignmentData,
  StaffActionResponse,
  ResetPINResult,
  UpgradePOSToClerkResult,
  BulkPinResetResult,
} from "@/types/staff";
import { clerkClient, auth } from "@clerk/nextjs/server";
import { LogAuditEvent } from "./audit-logs";
import { revalidatePath } from "next/cache";

// ============================================================================
// CONSTANTS
// ============================================================================

/** Role codes that receive automatic access to ALL merchant locations. */
const ADMIN_ROLE_CODES = ["merchant.owner", "merchant.admin"];

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Checks if a PIN is already in use at the given location(s).
 * Returns the conflicting location ID if found, otherwise null.
 * Optionally excludes a specific staff_profile_id or user_id (for updates).
 */
async function checkPinConflict(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  pin: string,
  locationIds: string[],
  excludeStaffProfileId?: string | null,
  excludeUserId?: string | null,
): Promise<string | null> {
  for (const locationId of locationIds) {
    let query = supabase
      .from("location_members")
      .select("id, staff_profile_id, user_id")
      .eq("location_id", locationId)
      .eq("pin_plain", pin)
      .eq("is_active", true);

    const { data } = await query;
    if (!data || data.length === 0) continue;

    // Filter out the current staff member (for edits/resets)
    const conflicts = data.filter((row) => {
      if (excludeStaffProfileId && row.staff_profile_id === excludeStaffProfileId) return false;
      if (excludeUserId && row.user_id === excludeUserId) return false;
      return true;
    });

    if (conflicts.length > 0) return locationId;
  }
  return null;
}

/**
 * Resolves the final set of location IDs for a staff creation request.
 * Owner / admin roles are automatically provisioned to EVERY merchant location.
 */
async function resolveLocationIds(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  merchantId: string,
  formData: InviteStaffFormData,
): Promise<string[]> {
  if (!ADMIN_ROLE_CODES.includes(formData.role_code)) {
    return formData.location_ids;
  }

  const { data: allLocations } = await supabase
    .from("locations")
    .select("id")
    .eq("merchant_id", merchantId);

  return (allLocations || []).map((l) => l.id);
}

// ============================================================================
// GET OPERATIONS
// ============================================================================

/**
 * Fetch unified staff view using RPC function
 * Automatically scoped by merchant via user's organization
 *
 * @param clerkOrgId - Organization ID from Clerk
 * @param locationId - Optional location ID to filter staff (for Location Managers)
 * @returns Array of unified staff members with location assignments
 */
export async function GetUnifiedStaffView(
  clerkOrgId: string,
  locationId?: string | null,
): Promise<UnifiedStaffMember[]> {
  if (!clerkOrgId) {
    console.error("[GetUnifiedStaffView] Missing clerkOrgId");
    return [];
  }

  const supabase = createServerSupabaseClient();

  try {
    // Get merchant ID from clerk org
    const { data: merchant, error: merchantError } = await supabase
      .from("merchants")
      .select("id")
      .eq("clerk_org_id", clerkOrgId)
      .single();

    if (merchantError || !merchant) {
      console.error(
        "[GetUnifiedStaffView] Error getting merchant:",
        merchantError,
      );
      return [];
    }

    // Call RPC function
    const { data, error } = await supabase.rpc("get_unified_staff_view", {
      p_merchant_id: merchant.id,
      p_location_id: locationId || null,
    });

    if (error) {
      console.error(
        "[GetUnifiedStaffView] Error fetching unified staff:",
        error,
      );
      return [];
    }
    // console.log("[GetUnifiedStaffView] Unified staff data:", data);

    return (data as UnifiedStaffMember[]) || [];
  } catch (error) {
    console.error("[GetUnifiedStaffView] Unexpected error:", error);
    return [];
  }
}

/**
 * Get single staff member details by member ID
 *
 * @param memberId - UUID of the member
 * @returns Single unified staff member or null
 */
export async function GetStaffMember(
  memberId: string,
): Promise<UnifiedStaffMember | null> {
  if (!memberId) {
    console.error("[GetStaffMember] Missing memberId");
    return null;
  }

  const supabase = createServerSupabaseClient();

  try {
    // 1. Get organization_id and staff_profile_id from member record
    const { data: memberBasic, error: memberError } = await supabase
      .from("members")
      .select("organization_id, staff_profile_id")
      .eq("id", memberId)
      .single();

    if (memberError || !memberBasic) {
      console.error(
        "[GetStaffMember] Error fetching member organization:",
        memberError,
      );
      return null;
    }

    // 2. Get merchant_id from merchants table using organization_id
    const { data: merchant, error: merchantError } = await supabase
      .from("merchants")
      .select("id")
      .eq("clerk_org_id", memberBasic.organization_id)
      .single();

    if (merchantError || !merchant) {
      console.error("[GetStaffMember] Error fetching merchant:", merchantError);
      return null;
    }

    // 3. Call RPC to get full view, filtered by member_id
    const { data, error } = await supabase
      .rpc("get_unified_staff_view", {
        p_merchant_id: merchant.id,
        p_location_id: null,
      })
      .eq("member_id", memberId)
      .single();

    if (error) {
      console.error("[GetStaffMember] Error fetching from RPC:", error);
      return null;
    }

    return {
      ...(data as any),
      staff_profile_id: memberBasic.staff_profile_id,
    } as UnifiedStaffMember;
  } catch (error) {
    console.error("[GetStaffMember] Unexpected error:", error);
    return null;
  }
}

// ============================================================================
// CREATE OPERATIONS
// ============================================================================

/**
 * Create POS-only staff member
 *
 * @param clerkOrgId - Organization ID from Clerk
 * @param formData - Staff invitation form data
 * @returns Success response with member data or error
 */
export async function CreatePOSStaff(
  clerkOrgId: string,
  formData: InviteStaffFormData,
): Promise<StaffActionResponse<{ member_id: string; generated_pin?: string }>> {
  if (!clerkOrgId) {
    return { error: "Missing organization ID" };
  }

  const supabase = createServerSupabaseClient();

  try {
    // 1. Get merchant ID
    const { data: merchant, error: merchantError } = await supabase
      .from("merchants")
      .select("id")
      .eq("clerk_org_id", clerkOrgId)
      .single();

    if (merchantError || !merchant) {
      return { error: "Merchant not found" };
    }

    // 2. Generate PIN if needed
    let pinCode: string | null = null;
    let generatedPin: string | undefined;

    if (formData.auto_generate_pin) {
      generatedPin = Math.floor(1000 + Math.random() * 9000).toString();
      pinCode = generatedPin;
    } else if (formData.pin_code) {
      pinCode = formData.pin_code;
    }

    // Check PIN uniqueness across all assigned locations
    if (pinCode) {
      const conflictLocationId = await checkPinConflict(supabase, pinCode, formData.location_ids);
      if (conflictLocationId) {
        const { data: loc } = await supabase.from("locations").select("name").eq("id", conflictLocationId).single();
        return { error: `PIN is already in use at ${loc?.name ?? "another location"}. Each staff member at a location must have a unique PIN.` };
      }
    }

    // 3. Create staff_profile record (POS-only)
    const { data: staffProfile, error: profileError } = await supabase
      .from("staff_profiles")
      .insert({
        merchant_id: merchant.id,
        user_id: null, // No Clerk user for POS staff
        first_name: formData.first_name,
        last_name: formData.last_name,
        email: formData.email,
        phone: formData.phone,
        account_type: "pos_only",
        is_active: true,
      })
      .select()
      .single();

    if (profileError || !staffProfile) {
      console.error(
        "[CreatePOSStaff] Failed to create staff profile:",
        profileError,
      );
      return { error: "Failed to create staff profile" };
    }

    // 4. Create member record (links to organization)
    // Must use service role client — members table has no RLS INSERT policy
    const { data: member, error: memberError } = await createServiceRoleClient()
      .from("members")
      .insert({
        user_id: null, // No Clerk user
        staff_profile_id: staffProfile.id,
        organization_id: clerkOrgId,
      })
      .select()
      .single();

    if (memberError || !member) {
      console.error("[CreatePOSStaff] Failed to create member:", memberError);
      // Rollback staff profile
      await supabase.from("staff_profiles").delete().eq("id", staffProfile.id);
      return { error: "Failed to create member record" };
    }

    // 5. Create location assignments
    const locationAssignments = formData.location_ids.map((locationId) => ({
      location_id: locationId,
      merchant_id: merchant.id,
      user_id: null, // POS staff has no user_id
      staff_profile_id: staffProfile.id,
      role_code: formData.role_code,
      is_primary_location: locationId === formData.primary_location_id,
      is_active: true,
      pin_plain: pinCode,
      pin_hashed: null,
      pin_code: pinCode,
      hourly_rate: formData.hourly_rate,
      employment_type: formData.employment_type,
    }));

    const { error: assignmentError } = await supabase
      .from("location_members")
      .insert(locationAssignments);

    if (assignmentError) {
      console.error(
        "[CreatePOSStaff] Failed to create assignments:",
        assignmentError,
      );
      // Rollback
      await supabase.from("members").delete().eq("id", member.id);
      await supabase.from("staff_profiles").delete().eq("id", staffProfile.id);
      return { error: "Failed to create location assignments" };
    }

    // Revalidate staff page
    revalidatePath("/dashboard/staff");

    // Fetch location names for audit log
    const { data: locationData } = await supabase
      .from("locations")
      .select("name")
      .in("id", formData.location_ids);

    const locationNames = locationData?.map((l) => l.name) || [];

    // Log audit event
    await LogAuditEvent({
      merchantId: merchant.id,
      action: `Created POS Staff: ${formData.first_name} ${formData.last_name}`,
      actionCategory: "staff",
      resourceType: "staff_profile",
      resourceId: staffProfile.id,
      resourceName: `${formData.first_name} ${formData.last_name}`,
      metadata: {
        role_code: formData.role_code,
        locations: locationNames,
        location_ids: formData.location_ids,
      },
    });

    return {
      data: {
        member_id: member.id,
        generated_pin: generatedPin,
      },
    };
  } catch (error) {
    console.error("[CreatePOSStaff] Unexpected error:", error);
    return { error: "An unexpected error occurred" };
  }
}

/**
 * Helper function to generate secure password
 */
function generateSecurePassword(length: number = 12): string {
  const charset =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
  let password = "";
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
}

/**
 * Create Clerk user directly with password (no invitation email)
 *
 * @param clerkOrgId - Organization ID from Clerk
 * @param formData - Staff creation form data
 * @returns Success response with member data or error
 */
export async function CreateClerkUserDirectly(
  clerkOrgId: string,
  formData: InviteStaffFormData,
): Promise<
  StaffActionResponse<{
    member_id: string;
    user_id: string;
    generated_pin?: string;
    temp_password: string;
  }>
> {
  if (!clerkOrgId) {
    return { error: "Missing organization ID" };
  }

  if (!formData.email) {
    return { error: "Email is required for Clerk users" };
  }

  const supabase = createServerSupabaseClient();

  try {
    // Get merchant ID from clerk org
    const { data: merchant, error: merchantError } = await supabase
      .from("merchants")
      .select("id")
      .eq("clerk_org_id", clerkOrgId)
      .single();

    if (merchantError || !merchant) {
      return { error: "Merchant not found" };
    }

    const merchantId = merchant.id;

    // Owners/admins are auto-provisioned to every location
    const resolvedLocationIds = await resolveLocationIds(
      supabase,
      merchantId,
      formData,
    );

    // 1. Generate password and PIN upfront
    const tempPassword = generateSecurePassword(12);

    let pinCode: string | null = null;
    let generatedPin: string | undefined;

    if (formData.auto_generate_pin) {
      generatedPin = Math.floor(1000 + Math.random() * 9000).toString();
      pinCode = generatedPin;
    } else if (formData.pin_code) {
      pinCode = formData.pin_code;
    }

    // Check PIN uniqueness across all assigned locations
    if (pinCode) {
      const conflictLocationId = await checkPinConflict(supabase, pinCode, resolvedLocationIds);
      if (conflictLocationId) {
        const { data: loc } = await supabase.from("locations").select("name").eq("id", conflictLocationId).single();
        return { error: `PIN is already in use at ${loc?.name ?? "another location"}. Each staff member at a location must have a unique PIN.` };
      }
    }

    // 2. Prepare location assignments for publicMetadata (webhook fallback)
    const locationAssignments = resolvedLocationIds.map((locationId) => ({
      locationId,
      roleCode: formData.role_code,
      isPrimaryLocation: locationId === formData.primary_location_id,
      hourlyRate: formData.hourly_rate,
      employmentType: formData.employment_type,
      pinCode,
    }));

    // 3. Create Clerk user with password
    const clerk = await clerkClient();
    const clerkUser = await clerk.users.createUser({
      emailAddress: [formData.email],
      password: tempPassword,
      firstName: formData.first_name,
      lastName: formData.last_name,
      phoneNumber: formData?.phone ? [formData.phone] : undefined,
      publicMetadata: {
        creationType: "direct",
        organizationId: clerkOrgId,
        merchantId,
        roleCode: formData.role_code,
        locationAssignments,
        phone: formData.phone,
      },
      skipPasswordRequirement: false,
      skipPasswordChecks: false,
    });

    if (!clerkUser || !clerkUser.id) {
      return { error: "Failed to create Clerk user" };
    }

    // 4. Add user to organization — capture membership ID for idempotent DB write
    let membership;
    try {
      membership = await clerk.organizations.createOrganizationMembership({
        organizationId: clerkOrgId,
        userId: clerkUser.id,
        role: "org:member",
      });
    } catch (orgError: any) {
      console.error(
        "[CreateClerkUserDirectly] Failed to create org membership, rolling back Clerk user:",
        orgError,
      );
      await clerk.users.deleteUser(clerkUser.id);
      return {
        error: `Failed to add user to organization: ${orgError.errors?.[0]?.message || orgError.message}`,
      };
    }

    // 4b. Eagerly create the users row — members.user_id is a FK to users.id and the
    //     user.created webhook hasn't fired yet, so we write it now (upsert = safe on retry).
    //     Must use service role — users table RLS is reserved for the Clerk webhook.
    const { error: userUpsertError } = await createServiceRoleClient()
      .from("users")
      .upsert(
        {
          id: clerkUser.id,
          first_name: formData.first_name,
          last_name: formData.last_name,
          email: formData.email,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id", ignoreDuplicates: true },
      );

    if (userUpsertError) {
      console.error(
        "[CreateClerkUserDirectly] Failed to upsert users row:",
        userUpsertError,
      );
      await clerk.users.deleteUser(clerkUser.id);
      return { error: "Failed to create user record" };
    }

    // 5. Eagerly create staff_profile (webhook acts as fallback/sync, not primary writer)
    const { data: staffProfile, error: profileError } = await supabase
      .from("staff_profiles")
      .insert({
        merchant_id: merchantId,
        user_id: clerkUser.id,
        first_name: formData.first_name,
        last_name: formData.last_name,
        email: formData.email,
        phone: formData.phone,
        account_type: "clerk",
        is_active: true,
      })
      .select()
      .single();

    if (profileError || !staffProfile) {
      console.error(
        "[CreateClerkUserDirectly] Failed to create staff profile:",
        profileError,
      );
      await clerk.users.deleteUser(clerkUser.id);
      return { error: "Failed to create staff profile" };
    }

    // 6. Eagerly create member record — use Clerk membership ID so webhook upsert is a no-op
    // Must use service role client — members table has no RLS INSERT policy
    const { data: member, error: memberError } = await createServiceRoleClient()
      .from("members")
      .insert({
        id: membership.id,
        user_id: clerkUser.id,
        staff_profile_id: staffProfile.id,
        organization_id: clerkOrgId,
        role: formData.role_code,
      })
      .select()
      .single();

    if (memberError || !member) {
      console.error(
        "[CreateClerkUserDirectly] Failed to create member:",
        memberError,
      );
      await supabase.from("staff_profiles").delete().eq("id", staffProfile.id);
      await clerk.users.deleteUser(clerkUser.id);
      return { error: "Failed to create member record" };
    }

    // 7. Eagerly create location_members records
    const locationMembersData = resolvedLocationIds.map((locationId) => ({
      location_id: locationId,
      merchant_id: merchantId,
      user_id: clerkUser.id,
      staff_profile_id: staffProfile.id,
      role_code: formData.role_code,
      is_primary_location: locationId === formData.primary_location_id,
      is_active: true,
      pin_plain: pinCode,
      pin_hashed: null,
      pin_code: pinCode,
      hourly_rate: formData.hourly_rate,
      employment_type: formData.employment_type,
    }));

    const { error: assignmentError } = await supabase
      .from("location_members")
      .insert(locationMembersData);

    if (assignmentError) {
      console.error(
        "[CreateClerkUserDirectly] Failed to create location assignments:",
        assignmentError,
      );
      await supabase.from("members").delete().eq("id", member.id);
      await supabase.from("staff_profiles").delete().eq("id", staffProfile.id);
      await clerk.users.deleteUser(clerkUser.id);
      return { error: "Failed to create location assignments" };
    }

    revalidatePath("/dashboard/staff");

    // Insert a 'direct_created' audit record in location_invites.
    // This is purely for history — the user already exists; status is never 'pending'.
    const { userId: actorUserId } = await auth();
    if (actorUserId) {
      await supabase.from("location_invites").insert({
        merchant_id: merchantId,
        location_id: null,
        invited_by_user_id: actorUserId,
        email: formData.email,
        first_name: formData.first_name,
        last_name: formData.last_name,
        phone: formData.phone ?? null,
        role_code: formData.role_code,
        invite_type: "direct_clerk",
        status: "direct_created",
        clerk_invite_id: clerkUser.id,
        location_assignments: locationAssignments,
      });
    }

    // Log audit event — use staffProfile.id (UUID), not clerkUser.id (Clerk string ID)
    await LogAuditEvent({
      merchantId,
      action: `Created Staff (Clerk): ${formData.first_name} ${formData.last_name}`,
      actionCategory: "staff",
      resourceType: "staff_profile",
      resourceId: staffProfile.id,
      resourceName: `${formData.first_name} ${formData.last_name}`,
      metadata: {
        email: formData.email,
        role_code: formData.role_code,
        locations: resolvedLocationIds,
        creation_type: "direct",
      },
    });

    return {
      data: {
        member_id: member.id,
        user_id: clerkUser.id,
        generated_pin: generatedPin,
        temp_password: tempPassword,
      },
    };
  } catch (error) {
    console.error("[CreateClerkUserDirectly] Unexpected error:", error);
    console.error(
      "[CreateClerkUserDirectly] Clerk error details:",
      (error as any)?.errors,
    );
    const clerkErrors = (error as any)?.errors;
    if (clerkErrors?.length) {
      const msg = clerkErrors
        .map((e: any) => e.longMessage || e.message)
        .join("; ");
      return { error: msg };
    }
    return { error: "An unexpected error occurred" };
  }
}

/**
 * Invite Clerk user to organization
 * @param userId - User who invited
 * @param clerkOrgId - Organization ID from Clerk
 * @param formData - Staff invitation form data
 * @returns Success response or error
 */
export async function InviteClerkStaff(
  userId: string,
  clerkOrgId: string,
  formData: InviteStaffFormData,
): Promise<StaffActionResponse<{ invite_id: string | null }>> {
  const supabase = createServerSupabaseClient();

  if (!formData.email) {
    return { error: "Email is required for Clerk invitations" };
  }

  try {
    // Get merchant ID from clerk org
    const { data: merchant, error: merchantError } = await supabase
      .from("merchants")
      .select("id")
      .eq("clerk_org_id", clerkOrgId)
      .single();

    if (merchantError || !merchant) {
      return { error: "Merchant not found" };
    }

    const merchantId = merchant.id;

    // Owners/admins are auto-provisioned to every location
    const resolvedLocationIds = await resolveLocationIds(
      supabase,
      merchantId,
      formData,
    );

    // 1. Prepare location assignments for publicMetadata (using camelCase)
    const locationAssignments = resolvedLocationIds.map((locationId) => ({
      locationId: locationId,
      roleCode: formData.role_code,
      isPrimaryLocation: locationId === formData.primary_location_id,
      hourlyRate: formData.hourly_rate,
      employmentType: formData.employment_type,
    }));

    // 2. Generate or use the PIN (stored directly in location_assignments)
    let pinCode: string | null = null;
    if (formData.auto_generate_pin) {
      const generatedPin = Math.floor(1000 + Math.random() * 9000).toString();
      pinCode = generatedPin;
    } else if (formData.pin_code) {
      pinCode = formData.pin_code;
    }

    // Check PIN uniqueness across all assigned locations
    if (pinCode) {
      const conflictLocationId = await checkPinConflict(supabase, pinCode, resolvedLocationIds);
      if (conflictLocationId) {
        const { data: loc } = await supabase.from("locations").select("name").eq("id", conflictLocationId).single();
        return { error: `PIN is already in use at ${loc?.name ?? "another location"}. Each staff member at a location must have a unique PIN.` };
      }
    }

    const locationAssignmentsWithPin = pinCode
      ? locationAssignments.map((la) => ({ ...la, pinCode }))
      : locationAssignments;

    // 3. Create Clerk organization invitation
    const clerk = await clerkClient();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

    // Clerk requires inviterUserId to be an org:admin.
    // Find the first org:admin member; if none, temporarily promote the current user.
    let inviterUserId = userId;
    let temporarilyPromoted = false;
    try {
      const memberships = await clerk.organizations.getOrganizationMembershipList({
        organizationId: clerkOrgId,
        limit: 50,
      });
      const adminMember = memberships.data.find((m) => m.role === "org:admin");
      if (adminMember?.publicUserData?.userId) {
        inviterUserId = adminMember.publicUserData.userId;
      } else {
        // No org:admin exists — promote current user temporarily so Clerk accepts the invite
        await clerk.organizations.updateOrganizationMembership({
          organizationId: clerkOrgId,
          userId: inviterUserId,
          role: "org:admin",
        });
        temporarilyPromoted = true;
      }
    } catch {
      // Non-fatal — use current userId as fallback
    }

    let invitation: Awaited<ReturnType<typeof clerk.organizations.createOrganizationInvitation>> | undefined;
    try {
      invitation = await clerk.organizations.createOrganizationInvitation({
        organizationId: clerkOrgId,
        inviterUserId,
        emailAddress: formData.email,
        role: "org:member",
        ...(appUrl && {
          redirectUrl: `${appUrl}/accept-invitation?email=${encodeURIComponent(formData.email)}&firstName=${encodeURIComponent(formData.first_name ?? '')}&lastName=${encodeURIComponent(formData.last_name ?? '')}`,
        }),
        publicMetadata: {
          creationType: "invitation", // Mark as invitation flow
          roleCode: formData.role_code,
          organizationId: clerkOrgId,
          merchantId: merchantId,
          locationAssignments: locationAssignmentsWithPin,
          firstName: formData.first_name,
          lastName: formData.last_name,
          phone: formData.phone,
        },
      });
    } finally {
      // Revert temporary promotion if we made it
      if (temporarilyPromoted) {
        try {
          await clerk.organizations.updateOrganizationMembership({
            organizationId: clerkOrgId,
            userId: inviterUserId,
            role: "org:member",
          });
        } catch {
          // Non-fatal — leave as org:admin if revert fails
        }
      }
    }

    if (!invitation || !invitation.id) {
      return { error: "Failed to create invitation" };
    }

    console.log("[InviteClerkStaff] Clerk invitation created:", invitation.id);

    // 4. Store invite in location_invites for tracking
    const { error: inviteError } = await supabase
      .from("location_invites")
      .insert({
        merchant_id: merchantId,
        location_id: null, // Null for merchant-wide invites
        invited_by_user_id: userId,
        email: formData.email,
        first_name: formData.first_name,
        last_name: formData.last_name,
        phone: formData.phone,
        role_code: formData.role_code,
        invite_type: "clerk",
        clerk_invite_id: invitation.id,
        hourly_rate: formData.hourly_rate,
        location_assignments: locationAssignmentsWithPin,
        status: "pending",
      });

    if (inviteError) {
      console.error("[InviteClerkStaff] Failed to store invite:", inviteError);
      return {
        error: "Invitation was sent but failed to save tracking data. Please check the staff list and retry if needed.",
      };
    }

    revalidatePath("/dashboard/staff");

    // Log audit event
    await LogAuditEvent({
      merchantId: merchantId,
      action: `Invited Staff (Clerk): ${formData.first_name} ${formData.last_name}`,
      actionCategory: "staff",
      resourceType: "staff_invite",
      resourceId: invitation.id,
      resourceName: `${formData.first_name} ${formData.last_name}`,
      metadata: {
        email: formData.email,
        role_code: formData.role_code,
        locations: resolvedLocationIds,
      },
    });

    return {
      data: {
        invite_id: invitation.id,
        generated_pin: pinCode ?? undefined,
      },
    };
  } catch (error) {
    console.error("[InviteClerkStaff] Unexpected error:", error);
    console.error("[InviteClerkStaff] Clerk error details:", (error as any)?.errors);
    const clerkErrors = (error as any)?.errors;
    if (clerkErrors?.length) {
      const msg = clerkErrors.map((e: any) => e.longMessage || e.message).join("; ");
      return { error: msg };
    }
    return { error: "An unexpected error occurred" };
  }
}

// ============================================================================
// UPDATE OPERATIONS
// ============================================================================

/**
 * Update staff member location assignment
 *
 * @param memberId - UUID of the member
 * @param locationId - UUID of the location
 * @param updates - Fields to update
 * @returns Success response or error
 */
export async function UpdateStaffLocationAssignment(
  memberId: string,
  locationId: string,
  updates: UpdateStaffAssignmentData,
): Promise<StaffActionResponse<{ success: boolean }>> {
  const supabase = createServerSupabaseClient();

  try {
    const { data: member } = await supabase
      .from("members")
      .select("user_id, staff_profile_id, organization_id")
      .eq("id", memberId)
      .single();

    if (!member) {
      return { error: "Member not found" };
    }

    let query = supabase
      .from("location_members")
      .update(updates)
      .eq("location_id", locationId);

    if (member.user_id) {
      query = query.eq("user_id", member.user_id);
    } else if (member.staff_profile_id) {
      query = query.eq("staff_profile_id", member.staff_profile_id);
    } else {
      return { error: "Invalid member record: no ID found" };
    }

    // Fetch current state before update for audit logging
    const { data: beforeState } = await supabase
      .from("location_members")
      .select("*")
      .eq("location_id", locationId)
      .match(
        member.user_id
          ? { user_id: member.user_id }
          : { staff_profile_id: member.staff_profile_id },
      )
      .single();

    const { error } = await query;

    if (error) {
      console.error("[UpdateStaffLocationAssignment] Error:", error);
      return { error: error.message };
    }

    revalidatePath("/dashboard/staff");

    // Fetch details for audit logging
    if (member.organization_id) {
      // Fetch staff name
      let staffName = "Unknown Staff";
      if (member.staff_profile_id) {
        const { data: sp } = await supabase
          .from("staff_profiles")
          .select("display_name, first_name, last_name")
          .eq("id", member.staff_profile_id)
          .single();
        if (sp)
          staffName = sp.display_name || `${sp.first_name} ${sp.last_name}`;
      }

      // Detect action type
      let actionDescription = `Updated Staff Assignment: ${staffName}`;
      if (updates.is_active === true)
        actionDescription = `Reactivated Staff Access: ${staffName}`;
      if (updates.is_active === false)
        actionDescription = `Deactivated Staff Access: ${staffName}`;

      const changes = {
        after: updates as any,
        before: beforeState
          ? {
              role_code: beforeState.role_code,
              hourly_rate: beforeState.hourly_rate,
              employment_type: beforeState.employment_type,
              is_active: beforeState.is_active,
              // Add other relevant fields if necessary
            }
          : {},
      };

      await LogAuditEvent({
        clerkOrgId: member.organization_id,
        locationId,
        action: actionDescription,
        actionCategory: "staff",
        resourceType: "staff_member",
        resourceId: member.staff_profile_id || member.user_id || memberId,
        resourceName: staffName,
        changes: changes,
        metadata: {
          staff_name: staffName,
          updated_fields: Object.keys(updates),
        },
      });
    }

    return { data: { success: true } };
  } catch (error) {
    console.error("[UpdateStaffLocationAssignment] Unexpected error:", error);
    return { error: "An unexpected error occurred" };
  }
}

/**
 * Reset staff PIN
 *
 * @param memberId - UUID of the member
 * @param locationId - UUID of the location
 * @param newPin - Optional new PIN (if not provided, auto-generates)
 * @returns Success response with new PIN or error
 */
export async function ResetStaffPIN(
  memberId: string,
  locationId: string,
  newPin?: string,
): Promise<StaffActionResponse<ResetPINResult>> {
  const supabase = createServerSupabaseClient();

  try {
    // Generate or use provided PIN
    const pin = newPin || Math.floor(1000 + Math.random() * 9000).toString();
    if (!/^\d{4,6}$/.test(pin)) {
      return { error: "PIN must be 4-6 digits" };
    }

    const { data: member } = await supabase
      .from("members")
      .select("user_id, staff_profile_id, organization_id")
      .eq("id", memberId)
      .single();

    if (!member) {
      return { error: "Member not found" };
    }

    // Check PIN uniqueness at this location, excluding the current staff member
    const conflictLocationId = await checkPinConflict(
      supabase,
      pin,
      [locationId],
      member.staff_profile_id,
      member.user_id,
    );
    if (conflictLocationId) {
      return { error: "PIN is already in use at this location. Please choose a different PIN." };
    }

    let query = supabase
      .from("location_members")
      .update({
        pin_plain: pin,
        pin_hashed: null,
        pin_code: pin,
        updated_at: new Date().toISOString(),
      })
      .eq("location_id", locationId);

    if (member.user_id) {
      query = query.eq("user_id", member.user_id);
    } else if (member.staff_profile_id) {
      query = query.eq("staff_profile_id", member.staff_profile_id);
    } else {
      return { error: "Invalid member record: no ID found" };
    }

    const { error } = await query;

    if (error) {
      console.error("[ResetStaffPIN] Error:", error);
      return { error: error.message };
    }

    // Log this action with human-readable names
    if (member.organization_id) {
      // Fetch staff name for user-friendly audit log
      let staffName = "Unknown Staff";
      if (member.staff_profile_id) {
        const { data: staffProfile } = await supabase
          .from("staff_profiles")
          .select("first_name, last_name, display_name")
          .eq("id", member.staff_profile_id)
          .single();
        if (staffProfile) {
          staffName =
            staffProfile.display_name ||
            `${staffProfile.first_name} ${staffProfile.last_name}`;
        }
      }

      await LogAuditEvent({
        clerkOrgId: member.organization_id,
        locationId,
        action: `Staff PIN Reset: ${staffName}`,
        actionCategory: "staff",
        resourceType: "staff_member",
        resourceId: member.staff_profile_id || member.user_id || memberId,
        resourceName: staffName,
        changes: {
          reason: "Manual Reset via Dashboard",
        },
        metadata: {
          staff_name: staffName,
        },
      });
    }

    revalidatePath("/dashboard/staff");

    return { data: { pin } };
  } catch (error) {
    console.error("[ResetStaffPIN] Unexpected error:", error);
    return { error: "An unexpected error occurred" };
  }
}

// ============================================================================
// DELETE OPERATIONS
// ============================================================================

/**
 * Deactivate staff member (soft delete)
 *
 * @param memberId - UUID of the member
 * @param locationId - Optional location ID (deactivate at specific location only)
 * @returns Success response or error
 */
export async function DeactivateStaffMember(
  memberId: string,
  locationId?: string,
): Promise<StaffActionResponse<{ success: boolean }>> {
  const supabase = createServerSupabaseClient();

  try {
    const { data: member } = await supabase
      .from("members")
      .select("user_id, staff_profile_id, organization_id")
      .eq("id", memberId)
      .single();

    if (!member) {
      return { error: "Member not found" };
    }

    let query = supabase.from("location_members").update({ is_active: false });

    if (member.user_id) {
      query = query.eq("user_id", member.user_id);
    } else if (member.staff_profile_id) {
      query = query.eq("staff_profile_id", member.staff_profile_id);
    } else {
      return { error: "Invalid member record: no ID found" };
    }

    if (locationId) {
      query = query.eq("location_id", locationId);
    }

    const { error } = await query;

    if (error) {
      console.error("[DeactivateStaffMember] Error:", error);
      return { error: error.message };
    }

    revalidatePath("/dashboard/staff");

    // Log audit event
    if (member) {
      await supabase
        .rpc("get_unified_staff_view", {
          p_merchant_id: (member as any).organization_id || "",
          p_location_id: null,
        })
        .eq("member_id", memberId)
        .single();

      // Fallback to basic fetch if RPC fails or not simple
      let resourceName = "Staff Member";
      if (member.staff_profile_id) {
        const { data: sp } = await supabase
          .from("staff_profiles")
          .select("display_name, first_name, last_name")
          .eq("id", member.staff_profile_id)
          .single();
        if (sp)
          resourceName = sp.display_name || `${sp.first_name} ${sp.last_name}`;
      }

      // We need merchant ID. Assuming member has org_id which maps to merchant in LogAuditEvent hook or we fetch it.
      // Actually DeactivateStaffMember doesn't seem to have merchant context easily available unless we fetch it.
      // The member record has organization_id (clerk). LogAuditEvent can take that.
      const orgId = (member as any).organization_id;

      if (orgId) {
        await LogAuditEvent({
          clerkOrgId: orgId,
          action: `Deactivated Staff Member: ${resourceName}`,
          actionCategory: "staff",
          resourceType: "staff_member",
          resourceId: memberId,
          resourceName: resourceName,
          locationId: locationId,
          severity: "critical",
        });
      }
    }

    return { data: { success: true } };
  } catch (error) {
    console.error("[DeactivateStaffMember] Unexpected error:", error);
    return { error: "An unexpected error occurred" };
  }
}

/**
 * Reactivate staff member
 *
 * @param memberId - UUID of the member
 * @param locationId - Optional location ID (reactivate at specific location only)
 * @returns Success response or error
 */
export async function ReactivateStaffMember(
  memberId: string,
  locationId?: string,
): Promise<StaffActionResponse<{ success: boolean }>> {
  const supabase = createServerSupabaseClient();

  try {
    const { data: member } = await supabase
      .from("members")
      .select("user_id, staff_profile_id, organization_id")
      .eq("id", memberId)
      .single();

    if (!member) {
      return { error: "Member not found" };
    }

    let query = supabase.from("location_members").update({ is_active: true });

    if (member.user_id) {
      query = query.eq("user_id", member.user_id);
    } else if (member.staff_profile_id) {
      query = query.eq("staff_profile_id", member.staff_profile_id);
    } else {
      return { error: "Invalid member record: no ID found" };
    }

    if (locationId) {
      query = query.eq("location_id", locationId);
    }

    const { error } = await query;

    if (error) {
      console.error("[ReactivateStaffMember] Error:", error);
      return { error: error.message };
    }

    revalidatePath("/dashboard/staff");

    // Log audit event
    if (member) {
      let resourceName = "Staff Member";
      if (member.staff_profile_id) {
        const { data: sp } = await supabase
          .from("staff_profiles")
          .select("display_name, first_name, last_name")
          .eq("id", member.staff_profile_id)
          .single();
        if (sp)
          resourceName = sp.display_name || `${sp.first_name} ${sp.last_name}`;
      }

      const orgId = (member as any).organization_id;

      if (orgId) {
        await LogAuditEvent({
          clerkOrgId: orgId,
          action: `Reactivated Staff Member: ${resourceName}`,
          actionCategory: "staff",
          resourceType: "staff_member",
          resourceId: memberId,
          resourceName: resourceName,
          locationId: locationId,
          severity: "critical",
        });
      }
    }

    return { data: { success: true } };
  } catch (error) {
    console.error("[ReactivateStaffMember] Unexpected error:", error);
    return { error: "An unexpected error occurred" };
  }
}

// ============================================================================
// UPGRADE OPERATIONS
// ============================================================================

/**
 * Upgrade POS-only staff to Clerk dashboard user
 * Creates a Clerk account for existing POS-only staff member
 *
 * @param memberId - UUID of the member to upgrade
 * @param locationId - UUID of the primary location
 * @param email - Email for the new Clerk account
 * @returns Success response with Clerk user_id and temporary password or error
 */
export async function UpgradePOSStaffToClerk(
  memberId: string,
  locationId: string,
  email: string,
): Promise<StaffActionResponse<UpgradePOSToClerkResult>> {
  const supabase = createServerSupabaseClient();

  try {
    // 1. Get member with staff_profile to verify POS-only status
    const { data: member, error: memberError } = await supabase
      .from("members")
      .select(
        `
                id,
                user_id,
                staff_profile_id,
                organization_id,
                staff_profiles (
                    id,
                    merchant_id,
                    first_name,
                    last_name,
                    phone,
                    account_type
                )
            `,
      )
      .eq("id", memberId)
      .single();

    if (memberError || !member) {
      console.error("[UpgradePOSStaffToClerk] Member not found:", memberError);
      return { error: "Member not found" };
    }

    // 2. Verify member is POS-only
    const staffProfile = member.staff_profiles as any;
    if (!staffProfile) {
      return { error: "Staff profile not found" };
    }

    if (staffProfile.account_type !== "pos_only") {
      return { error: "Staff member is not a POS-only account" };
    }

    if (member.user_id) {
      return { error: "Staff member already has a dashboard account" };
    }

    // 3. Validate email
    if (!email || !email.includes("@")) {
      return { error: "Valid email is required" };
    }

    // 4. Get location assignment to retrieve role
    const { data: locationAssignment, error: locationError } = await supabase
      .from("location_members")
      .select("role_code, pin_plain, pin_hashed, pin_code, hourly_rate, employment_type")
      .eq("staff_profile_id", staffProfile.id)
      .eq("location_id", locationId)
      .single();

    if (locationError || !locationAssignment) {
      console.error(
        "[UpgradePOSStaffToClerk] Location assignment not found:",
        locationError,
      );
      return { error: "Location assignment not found" };
    }

    // 5. Generate temporary password
    const tempPassword = generateSecurePassword(12);

    // 6. Create Clerk user
    const clerk = await clerkClient();
    let clerkUser;
    try {
      clerkUser = await clerk.users.createUser({
        emailAddress: [email],
        password: tempPassword,
        firstName: staffProfile.first_name,
        lastName: staffProfile.last_name,
        phoneNumber: staffProfile.phone ? [staffProfile.phone] : undefined,
        publicMetadata: {
          creationType: "upgrade", // Mark as upgrade from POS
          organizationId: member.organization_id,
          merchantId: staffProfile.merchant_id,
          roleCode: locationAssignment.role_code,
          staffProfileId: staffProfile.id,
          upgradedFromStaffProfileId: staffProfile.id, // backward compat
          phone: staffProfile.phone,
        },
        skipPasswordRequirement: false,
        skipPasswordChecks: false,
      });

      if (!clerkUser || !clerkUser.id) {
        return { error: "Failed to create Clerk user" };
      }
    } catch (clerkError: any) {
      console.error(
        "[UpgradePOSStaffToClerk] Clerk creation failed:",
        clerkError,
      );
      return {
        error: `Failed to create Clerk user: ${
          clerkError.errors?.[0]?.message || clerkError.message
        }`,
      };
    }

    // 7. Add user to organization
    try {
      await clerk.organizations.createOrganizationMembership({
        organizationId: member.organization_id,
        userId: clerkUser.id,
        role: "org:member",
      });
    } catch (orgError: any) {
      console.error(
        "[UpgradePOSStaffToClerk] Failed to add to organization:",
        orgError,
      );
      // Rollback: Delete Clerk user
      await clerk.users.deleteUser(clerkUser.id);
      return { error: "Failed to add user to organization" };
    }

    // 7b. Eagerly create the users row — members.user_id is a FK to users.id and the
    //     user.created webhook hasn't fired yet, so we write it now (upsert = safe on retry).
    //     Must use service role — users table RLS is reserved for the Clerk webhook.
    const { error: userUpsertError } = await createServiceRoleClient()
      .from("users")
      .upsert(
        {
          id: clerkUser.id,
          first_name: staffProfile.first_name,
          last_name: staffProfile.last_name,
          email: email,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id", ignoreDuplicates: true },
      );

    if (userUpsertError) {
      console.error(
        "[UpgradePOSStaffToClerk] Failed to upsert users row:",
        userUpsertError,
      );
      await clerk.users.deleteUser(clerkUser.id);
      return { error: "Failed to create user record" };
    }

    // 8. Update staff_profiles - change account type and add user_id
    const { error: profileUpdateError } = await supabase
      .from("staff_profiles")
      .update({
        account_type: "clerk",
        user_id: clerkUser.id,
        email: email,
        updated_at: new Date().toISOString(),
      })
      .eq("id", staffProfile.id);

    if (profileUpdateError) {
      console.error(
        "[UpgradePOSStaffToClerk] Failed to update staff profile:",
        profileUpdateError,
      );
      // Rollback: Delete Clerk user
      await clerk.users.deleteUser(clerkUser.id);
      return { error: "Failed to update staff profile" };
    }

    // 9. Update members - set user_id
    const { error: memberUpdateError } = await supabase
      .from("members")
      .update({
        user_id: clerkUser.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", memberId);

    if (memberUpdateError) {
      console.error(
        "[UpgradePOSStaffToClerk] Failed to update member:",
        memberUpdateError,
      );
      // Rollback: Revert staff_profiles and delete Clerk user
      await supabase
        .from("staff_profiles")
        .update({
          account_type: "pos_only",
          user_id: null,
          email: null,
        })
        .eq("id", staffProfile.id);
      await clerk.users.deleteUser(clerkUser.id);
      return { error: "Failed to update member record" };
    }

    // 10. Update location_members - CRITICAL: set user_id and clear staff_profile_id
    // Database constraint requires EITHER user_id OR staff_profile_id, not both
    // PIN PERSISTENCE: Explicitly preserve existing PIN columns by reading current values first
    const { data: existingLocationMembers } = await supabase
      .from("location_members")
      .select("id, pin_plain, pin_hashed, pin_code")
      .eq("staff_profile_id", staffProfile.id);

    // Update each location_member row, explicitly re-setting PIN columns to prevent nullification
    const locationUpdatePromises = (existingLocationMembers || []).map((lm) =>
      supabase
        .from("location_members")
        .update({
          user_id: clerkUser.id,
          staff_profile_id: null, // MUST clear this due to constraint
          pin_plain: lm.pin_plain,
          pin_hashed: lm.pin_hashed,
          pin_code: lm.pin_code,
          updated_at: new Date().toISOString(),
        })
        .eq("id", lm.id)
    );

    const locationUpdateResults = await Promise.all(locationUpdatePromises);
    const locationUpdateError = locationUpdateResults.find((r) => r.error)?.error;

    if (locationUpdateError) {
      console.error(
        "[UpgradePOSStaffToClerk] Failed to update location_members:",
        locationUpdateError,
      );
      // Rollback all changes
      await supabase
        .from("members")
        .update({ user_id: null })
        .eq("id", memberId);
      await supabase
        .from("staff_profiles")
        .update({
          account_type: "pos_only",
          user_id: null,
          email: null,
        })
        .eq("id", staffProfile.id);
      await clerk.users.deleteUser(clerkUser.id);
      return { error: "Failed to update location assignments" };
    }

    // 11. Success - revalidate and return credentials
    revalidatePath("/dashboard/staff");

    // Log audit event
    await LogAuditEvent({
      merchantId: staffProfile.merchant_id,
      action: `Upgraded POS Staff to Clerk: ${staffProfile.first_name} ${staffProfile.last_name}`,
      actionCategory: "staff",
      resourceType: "staff_profile",
      resourceId: staffProfile.id,
      resourceName: `${staffProfile.first_name} ${staffProfile.last_name}`,
      metadata: {
        new_user_id: clerkUser.id,
        email: email,
        role_code: locationAssignment.role_code,
      },
    });

    return {
      data: {
        user_id: clerkUser.id,
        temp_password: tempPassword,
        email: email,
      },
    };
  } catch (error) {
    console.error("[UpgradePOSStaffToClerk] Unexpected error:", error);
    console.error(
      "[UpgradePOSStaffToClerk] Clerk error details:",
      (error as any)?.errors,
    );
    const clerkErrors = (error as any)?.errors;
    if (clerkErrors?.length) {
      const msg = clerkErrors
        .map((e: any) => e.longMessage || e.message)
        .join("; ");
      return { error: msg };
    }
    return { error: "An unexpected error occurred during upgrade" };
  }
}

// ============================================================================
// DEMOTE OPERATIONS
// ============================================================================

/**
 * Demote a Clerk dashboard user back to POS-only.
 *
 * Steps:
 *  1. Verify member is currently a Clerk user.
 *  2. Remove org membership in Clerk (revoke dashboard access).
 *  3. Update staff_profiles: account_type → 'pos_only', user_id → null.
 *  4. Nullify user_id on members row.
 *  5. Update location_members: move from user_id → staff_profile_id, preserve PIN.
 *  6. Audit log.
 */
export async function DemoteClerkToPOSOnly(
  memberId: string,
): Promise<StaffActionResponse<{ success: boolean }>> {
  const supabase = createServerSupabaseClient();

  try {
    // 1. Fetch member with staff profile
    const { data: member, error: memberError } = await supabase
      .from("members")
      .select(
        `id, user_id, staff_profile_id, organization_id,
         staff_profiles ( id, merchant_id, first_name, last_name, account_type )`
      )
      .eq("id", memberId)
      .single();

    if (memberError || !member) {
      return { error: "Member not found" };
    }

    const staffProfile = member.staff_profiles as any;
    if (!staffProfile) {
      return { error: "Staff profile not found" };
    }

    if (!member.user_id) {
      return { error: "Staff member does not have a dashboard account" };
    }

    if (staffProfile.account_type !== "clerk") {
      return { error: "Staff member is already POS-only" };
    }

    const clerkUserId = member.user_id;
    const staffName = `${staffProfile.first_name} ${staffProfile.last_name}`;

    // 2. Remove Clerk org membership (revokes dashboard access)
    const clerk = await clerkClient();
    try {
      await clerk.organizations.deleteOrganizationMembership({
        organizationId: member.organization_id,
        userId: clerkUserId,
      });
    } catch (clerkErr: any) {
      // "Not found" / 404 means membership is already removed — safe to continue
      const isNotFound =
        clerkErr?.status === 404 ||
        clerkErr?.errors?.[0]?.code === "resource_not_found";

      if (!isNotFound) {
        console.error(
          "[DemoteClerkToPOSOnly] Failed to remove org membership:",
          clerkErr,
        );
        return {
          error:
            clerkErr?.errors?.[0]?.longMessage ||
            "Failed to remove dashboard access — demotion aborted",
        };
      }
      // Already removed — continue with DB demotion
      console.warn(
        "[DemoteClerkToPOSOnly] Org membership already removed, continuing with DB demotion",
      );
    }

    // 3. Update location_members: switch from user_id to staff_profile_id, preserve PIN
    const { data: existingLocationMembers } = await supabase
      .from("location_members")
      .select("id, pin_plain, pin_hashed, pin_code")
      .eq("user_id", clerkUserId);

    const locationUpdatePromises = (existingLocationMembers || []).map((lm) =>
      supabase
        .from("location_members")
        .update({
          user_id: null,
          staff_profile_id: staffProfile.id,
          pin_plain: lm.pin_plain,
          pin_hashed: lm.pin_hashed,
          pin_code: lm.pin_code,
          updated_at: new Date().toISOString(),
        })
        .eq("id", lm.id)
    );
    const locationResults = await Promise.all(locationUpdatePromises);
    const locationFailure = locationResults.find((r) => r.error);
    if (locationFailure) {
      console.error(
        "[DemoteClerkToPOSOnly] Failed to update location_members:",
        locationFailure.error,
      );
      return { error: "Failed to update location assignments during demotion" };
    }

    // 4. Update staff_profiles: revert to pos_only
    const { error: spUpdateError } = await supabase
      .from("staff_profiles")
      .update({
        account_type: "pos_only",
        user_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", staffProfile.id);

    if (spUpdateError) {
      console.error(
        "[DemoteClerkToPOSOnly] Failed to update staff_profiles:",
        spUpdateError,
      );
      return { error: "Failed to update staff profile during demotion" };
    }

    // 5. Nullify user_id on members row
    const { error: memberUpdateError } = await supabase
      .from("members")
      .update({
        user_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", memberId);

    if (memberUpdateError) {
      console.error(
        "[DemoteClerkToPOSOnly] Failed to update members:",
        memberUpdateError,
      );
      return { error: "Failed to update member record during demotion" };
    }

    // 6. Audit log
    await LogAuditEvent({
      merchantId: staffProfile.merchant_id,
      action: `Demoted Clerk to POS-Only: ${staffName}`,
      actionCategory: "staff",
      resourceType: "staff_profile",
      resourceId: staffProfile.id,
      resourceName: staffName,
      metadata: {
        previous_user_id: clerkUserId,
      },
    });

    revalidatePath("/dashboard/staff");

    return { data: { success: true } };
  } catch (error) {
    console.error("[DemoteClerkToPOSOnly] Unexpected error:", error);
    return { error: "An unexpected error occurred during demotion" };
  }
}

// ============================================================================
// PIN STATUS
// ============================================================================

/**
 * Check whether the current Clerk user has a POS PIN set on any active
 * location assignment.  Used to drive the dashboard PIN-setup banner.
 *
 * @param clerkOrgId  - Clerk organization ID (to scope to the right merchant)
 * @param clerkUserId - Clerk user ID to look up in location_members
 */
export async function GetCurrentUserPinStatus(
  clerkOrgId: string,
  clerkUserId: string,
): Promise<{ hasPinSet: boolean; locationCount: number } | null> {
  if (!clerkOrgId || !clerkUserId) return null;

  const supabase = createServerSupabaseClient();

  try {
    const { data, error } = await supabase
      .from("location_members")
      .select("pin_plain, pin_hashed, pin_code, location_id")
      .eq("user_id", clerkUserId)
      .eq("is_active", true);

    if (error) {
      console.error("[GetCurrentUserPinStatus] Error:", error);
      return null;
    }

    const locationCount = data?.length ?? 0;
    const hasPinSet =
      locationCount > 0 &&
      data.some(
        (row) =>
          row.pin_plain !== null ||
          row.pin_hashed !== null ||
          row.pin_code !== null,
      );

    return { hasPinSet, locationCount };
  } catch (error) {
    console.error("[GetCurrentUserPinStatus] Unexpected error:", error);
    return null;
  }
}

// ============================================================================
// PROFILE UPDATE OPERATIONS (with Clerk sync)
// ============================================================================

export interface UpdateStaffProfileData {
  first_name?: string;
  last_name?: string;
  email?: string | null;
  phone?: string | null;
}

/**
 * Update staff profile (name, email, phone) with Clerk sync.
 *
 * For Clerk users, this also calls `clerk.users.updateUser` so the auth
 * provider stays in sync with the DB.
 *
 * @param memberId  - UUID of the member record
 * @param updates   - Fields to update
 */
export async function UpdateStaffProfile(
  memberId: string,
  updates: UpdateStaffProfileData,
): Promise<StaffActionResponse<{ success: boolean }>> {
  const supabase = createServerSupabaseClient();

  try {
    // 1. Fetch member + staff profile
    const { data: member, error: memberError } = await supabase
      .from("members")
      .select("id, user_id, staff_profile_id, organization_id")
      .eq("id", memberId)
      .single();

    if (memberError || !member) {
      return { error: "Member not found" };
    }

    if (!member.staff_profile_id) {
      return { error: "No staff profile linked to this member" };
    }

    // 2. Build the profile update payload (only changed fields)
    const profilePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    if (updates.first_name !== undefined)
      profilePayload.first_name = updates.first_name;
    if (updates.last_name !== undefined)
      profilePayload.last_name = updates.last_name;
    if (updates.email !== undefined) profilePayload.email = updates.email;
    if (updates.phone !== undefined) profilePayload.phone = updates.phone;

    // NOTE: display_name is a GENERATED ALWAYS column computed from
    // first_name || ' ' || last_name — do NOT include it in the update
    // payload or PostgreSQL will reject the query.

    // 3. Update staff_profiles
    const { error: profileError } = await supabase
      .from("staff_profiles")
      .update(profilePayload)
      .eq("id", member.staff_profile_id);

    if (profileError) {
      console.error("[UpdateStaffProfile] profile update error:", profileError);
      return { error: "Failed to update staff profile" };
    }

    // 4. Also update the `users` row if the member has a Clerk user_id
    if (member.user_id) {
      const usersPayload: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };
      if (updates.first_name !== undefined)
        usersPayload.first_name = updates.first_name;
      if (updates.last_name !== undefined)
        usersPayload.last_name = updates.last_name;
      if (updates.email !== undefined) usersPayload.email = updates.email;

      const { error: usersUpdateError } = await supabase
        .from("users")
        .update(usersPayload)
        .eq("id", member.user_id);

      if (usersUpdateError) {
        console.error(
          "[UpdateStaffProfile] Failed to sync users table (non-fatal):",
          usersUpdateError,
        );
      }

      // 5. Clerk sync — keep the auth provider in sync
      try {
        const clerk = await clerkClient();
        const clerkPayload: Record<string, any> = {};

        if (updates.first_name !== undefined)
          clerkPayload.firstName = updates.first_name;
        if (updates.last_name !== undefined)
          clerkPayload.lastName = updates.last_name;

        if (Object.keys(clerkPayload).length > 0) {
          await clerk.users.updateUser(member.user_id, clerkPayload);
        }

        // Clerk email update is more complex (requires verification flow),
        // so we only update the DB email and leave Clerk email unchanged.
        // A full email change would require clerk.emailAddresses.createEmailAddress().
      } catch (clerkErr) {
        console.error(
          "[UpdateStaffProfile] Clerk sync failed (non-fatal):",
          clerkErr,
        );
        // Non-fatal — DB is source of truth for the dashboard
      }
    }

    revalidatePath("/dashboard/staff");

    // Audit
    const staffName =
      `${updates.first_name ?? ""} ${updates.last_name ?? ""}`.trim() ||
      "Staff";
    if (member.organization_id) {
      await LogAuditEvent({
        clerkOrgId: member.organization_id,
        action: `Updated Staff Profile: ${staffName}`,
        actionCategory: "staff",
        resourceType: "staff_profile",
        resourceId: member.staff_profile_id,
        resourceName: staffName,
        metadata: { updated_fields: Object.keys(updates) },
      });
    }

    return { data: { success: true } };
  } catch (error) {
    console.error("[UpdateStaffProfile] Unexpected error:", error);
    return { error: "An unexpected error occurred" };
  }
}

// ============================================================================
// LOCATION MANAGEMENT — Add / Remove staff from locations
// ============================================================================

/**
 * Add a staff member to a new location (creates a `location_members` row).
 */
export async function AddStaffToLocation(
  memberId: string,
  locationId: string,
  roleCode: string,
  isPrimary?: boolean,
): Promise<StaffActionResponse<{ success: boolean }>> {
  const supabase = createServerSupabaseClient();

  try {
    const { data: member } = await supabase
      .from("members")
      .select("user_id, staff_profile_id, organization_id")
      .eq("id", memberId)
      .single();

    if (!member) return { error: "Member not found" };

    // Determine merchant_id from location
    const { data: location } = await supabase
      .from("locations")
      .select("merchant_id")
      .eq("id", locationId)
      .single();

    if (!location) return { error: "Location not found" };

    // Check for existing (even inactive) assignment
    const matchCol = member.user_id ? "user_id" : "staff_profile_id";
    const matchVal = member.user_id || member.staff_profile_id;

    const { data: existing } = await supabase
      .from("location_members")
      .select("id, is_active")
      .eq("location_id", locationId)
      .eq(matchCol, matchVal)
      .maybeSingle();

    if (existing) {
      if (existing.is_active) {
        return { error: "Staff is already assigned to this location" };
      }
      // Re-activate the existing soft-deleted row
      const { error } = await supabase
        .from("location_members")
        .update({
          is_active: true,
          role_code: roleCode,
          is_primary_location: isPrimary ?? false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);

      if (error) return { error: error.message };
    } else {
      // Create a fresh row
      const insertRow: Record<string, any> = {
        location_id: locationId,
        merchant_id: location.merchant_id,
        role_code: roleCode,
        is_primary_location: isPrimary ?? false,
        is_active: true,
      };

      if (member.user_id) {
        insertRow.user_id = member.user_id;
      }
      if (member.staff_profile_id) {
        insertRow.staff_profile_id = member.staff_profile_id;
      }

      const { error } = await supabase
        .from("location_members")
        .insert(insertRow);

      if (error) return { error: error.message };
    }

    revalidatePath("/dashboard/staff");

    // Audit
    if (member.organization_id) {
      let staffName = "Staff Member";
      if (member.staff_profile_id) {
        const { data: sp } = await supabase
          .from("staff_profiles")
          .select("first_name, last_name")
          .eq("id", member.staff_profile_id)
          .single();
        if (sp) staffName = `${sp.first_name} ${sp.last_name}`;
      }
      const { data: loc } = await supabase
        .from("locations")
        .select("name")
        .eq("id", locationId)
        .single();

      await LogAuditEvent({
        clerkOrgId: member.organization_id,
        locationId,
        action: `Added ${staffName} to ${loc?.name ?? "location"}`,
        actionCategory: "staff",
        resourceType: "staff_member",
        resourceId: member.staff_profile_id || member.user_id || memberId,
        resourceName: staffName,
      });
    }

    return { data: { success: true } };
  } catch (error) {
    console.error("[AddStaffToLocation] Unexpected error:", error);
    return { error: "An unexpected error occurred" };
  }
}

/**
 * Remove (soft-delete) a staff member from a location by setting `is_active = false`.
 *
 * Guard: Prevents removing the staff member's LAST active location assignment.
 */
export async function RemoveStaffFromLocation(
  memberId: string,
  locationId: string,
): Promise<StaffActionResponse<{ success: boolean }>> {
  const supabase = createServerSupabaseClient();

  // Look up the member to find their identifier for location_members
  const { data: member } = await supabase
    .from("members")
    .select("user_id, staff_profile_id")
    .eq("id", memberId)
    .single();

  if (!member) {
    return { error: "Member not found" };
  }

  // Count active location assignments for this staff member
  const matchCol = member.user_id ? "user_id" : "staff_profile_id";
  const matchVal = member.user_id || member.staff_profile_id;

  if (!matchVal) {
    return { error: "Invalid member record: no identifier found" };
  }

  const { count, error: countError } = await supabase
    .from("location_members")
    .select("id", { count: "exact", head: true })
    .eq(matchCol, matchVal)
    .eq("is_active", true);

  if (countError) {
    return { error: "Failed to check location assignments" };
  }

  if ((count ?? 0) <= 1) {
    return {
      error:
        "Cannot remove — this is the staff member's only active location. Deactivate the member instead.",
    };
  }

  return DeactivateStaffMember(memberId, locationId);
}

// ============================================================================
// BULK OPERATIONS
// ============================================================================

/**
 * Bulk deactivate multiple staff members.
 *
 * @param memberIds  - Array of member UUIDs to deactivate
 * @returns count of successfully deactivated members
 */
export async function BulkDeactivateStaff(
  memberIds: string[],
): Promise<StaffActionResponse<{ deactivated: number; errors: string[] }>> {
  if (!memberIds.length) return { error: "No members provided" };

  const errors: string[] = [];
  let deactivated = 0;

  for (const memberId of memberIds) {
    const result = await DeactivateStaffMember(memberId);
    if (result.error) {
      errors.push(`${memberId}: ${result.error}`);
    } else {
      deactivated++;
    }
  }

  revalidatePath("/dashboard/staff");

  return { data: { deactivated, errors } };
}

/**
 * Bulk PIN reset — generates a new random PIN for each member and
 * returns the list of { staff name, new PIN } so the caller can
 * present / export them.
 *
 * @param memberIds - Array of member UUIDs
 * @returns Array of BulkPinResetResult (name + unhashed new PIN)
 */
export async function BulkResetPINs(
  memberIds: string[],
): Promise<
  StaffActionResponse<{ results: BulkPinResetResult[]; errors: string[] }>
> {
  if (!memberIds.length) return { error: "No members provided" };

  const supabase = createServerSupabaseClient();
  const results: BulkPinResetResult[] = [];
  const errors: string[] = [];

  for (const memberId of memberIds) {
    try {
      // Look up member
      const { data: member } = await supabase
        .from("members")
        .select("user_id, staff_profile_id, organization_id")
        .eq("id", memberId)
        .single();

      if (!member) {
        errors.push(`${memberId}: Member not found`);
        continue;
      }

      // Determine the staff name
      let staffName = "Unknown";
      let staffProfileId = member.staff_profile_id;
      if (staffProfileId) {
        const { data: sp } = await supabase
          .from("staff_profiles")
          .select("first_name, last_name")
          .eq("id", staffProfileId)
          .single();
        if (sp) staffName = `${sp.first_name} ${sp.last_name}`;
      }

      // Determine the lookup column
      const matchCol = member.user_id ? "user_id" : "staff_profile_id";
      const matchVal = member.user_id || member.staff_profile_id;
      if (!matchVal) {
        errors.push(`${memberId}: No identifier found`);
        continue;
      }

      // Get all active location assignments
      const { data: assignments } = await supabase
        .from("location_members")
        .select("id, location_id")
        .eq(matchCol, matchVal)
        .eq("is_active", true);

      if (!assignments || assignments.length === 0) {
        errors.push(`${memberId}: No active location assignments`);
        continue;
      }

      // Generate one PIN, apply to all locations
      const newPin = Math.floor(1000 + Math.random() * 9000).toString();
      const { error: updateError } = await supabase
        .from("location_members")
        .update({
          pin_plain: newPin,
          pin_hashed: null,
          pin_code: newPin,
          updated_at: new Date().toISOString(),
        })
        .eq(matchCol, matchVal)
        .eq("is_active", true);

      if (updateError) {
        errors.push(`${memberId}: ${updateError.message}`);
        continue;
      }

      results.push({
        staff_profile_id: staffProfileId || memberId,
        staff_name: staffName,
        new_pin: newPin,
      });
    } catch (err) {
      errors.push(`${memberId}: Unexpected error`);
    }
  }

  revalidatePath("/dashboard/staff");

  return { data: { results, errors } };
}

/**
 * Bulk assign a role to multiple staff members across all their active locations.
 *
 * @param memberIds - Array of member UUIDs
 * @param roleCode  - The role to assign
 * @returns count of successfully updated members
 */
export async function BulkAssignRole(
  memberIds: string[],
  roleCode: string,
): Promise<StaffActionResponse<{ updated: number; errors: string[] }>> {
  if (!memberIds.length) return { error: "No members provided" };
  if (!roleCode) return { error: "Role code is required" };

  const supabase = createServerSupabaseClient();
  const errors: string[] = [];
  let updated = 0;

  for (const memberId of memberIds) {
    try {
      const { data: member } = await supabase
        .from("members")
        .select("user_id, staff_profile_id, organization_id")
        .eq("id", memberId)
        .single();

      if (!member) {
        errors.push(`${memberId}: Member not found`);
        continue;
      }

      const matchCol = member.user_id ? "user_id" : "staff_profile_id";
      const matchVal = member.user_id || member.staff_profile_id;
      if (!matchVal) {
        errors.push(`${memberId}: No identifier found`);
        continue;
      }

      const { error: updateError } = await supabase
        .from("location_members")
        .update({
          role_code: roleCode,
          updated_at: new Date().toISOString(),
        })
        .eq(matchCol, matchVal)
        .eq("is_active", true);

      if (updateError) {
        errors.push(`${memberId}: ${updateError.message}`);
        continue;
      }

      updated++;
    } catch (err) {
      errors.push(`${memberId}: Unexpected error`);
    }
  }

  revalidatePath("/dashboard/staff");

  // Audit the bulk operation
  const { userId } = await auth();
  if (userId) {
    // We need an org id — grab from first successful member
    const { data: anyMember } = await supabase
      .from("members")
      .select("organization_id")
      .in("id", memberIds)
      .limit(1)
      .single();

    if (anyMember?.organization_id) {
      await LogAuditEvent({
        clerkOrgId: anyMember.organization_id,
        action: `Bulk Role Assignment: ${roleCode} (${updated} staff)`,
        actionCategory: "staff",
        resourceType: "bulk_operation",
        resourceId: "bulk",
        resourceName: `${updated} staff members`,
        metadata: { role_code: roleCode, member_count: memberIds.length },
      });
    }
  }

  return { data: { updated, errors } };
}
