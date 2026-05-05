// app/dashboard/actions/staff.ts

"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LogAuditEvent } from "./audit-logs";
import { findEmailConflict } from "@/app/manage/actions/email-duplicates";
import { emailConflictMessage, normalizeEmail, isValidEmail } from "@/lib/utils/email";

// ============================================================================
// TYPES
// ============================================================================

export interface InviteStaffParams {
  merchantId: string;
  email?: string;
  phone?: string;
  firstName: string;
  lastName: string;
  roleCode: string;
  locationAssignments: {
    locationId: string;
    roleCode?: string; // Override role at this location
    isPrimary?: boolean;
    hourlyRate?: number;
    pinCode?: string;
  }[];
  employmentType?: "full_time" | "part_time" | "contractor" | "seasonal";
  hourlyRate?: number;
  employeeId?: string;
  invited_by_user_id: string;
}

export interface QuickAddStaffParams {
  merchantId: string;
  locationId: string;
  firstName: string;
  lastName: string;
  roleCode: string;
  pin: string;
  employmentType?: string;
  hourlyRate?: number;
}

export interface CreateCustomRoleParams {
  merchantId: string;
  name: string;
  description?: string;
  baseRoleCode: string; // System role to inherit from
  color?: string;
  icon?: string;
  permissionOverrides?: {
    permissionCode: string;
    overrideType: "grant" | "revoke";
  }[];
  canAccessDashboard?: boolean;
  canAccessPos?: boolean;
  maxLocations?: number;
}

// ============================================================================
// INVITE STAFF MEMBER
// ============================================================================

export async function inviteStaffMember(
  params: InviteStaffParams,
  clerkOrgId: string,
) {
  const { userId } = await auth();
  if (!userId) {
    return { success: false, error: "Unauthorized" };
  }

  const supabase = await createServerSupabaseClient();

  // Get role details to determine invite type
  const { data: role, error: roleError } = await supabase
    .from("roles")
    .select("*")
    .eq("code", params.roleCode)
    .single();

  if (roleError || !role) {
    return { success: false, error: "Invalid role" };
  }

  const inviteType = role.requires_clerk_account ? "clerk" : "pos_only";

  // Pre-flight: block duplicate emails (case-insensitive) before any Clerk or DB writes.
  if (params.email) {
    const normalized = normalizeEmail(params.email);
    if (!isValidEmail(normalized)) {
      return { success: false, error: "Invalid email address" };
    }
    const conflict = await findEmailConflict(normalized, {
      scope: { merchantId: params.merchantId },
      tables: ["users", "staff_profiles", "location_invites", "pending_org_admin_invites"],
    });
    if (conflict) {
      return { success: false, error: emailConflictMessage(conflict) };
    }
  }

  try {
    if (inviteType === "clerk") {
      // ────────────────────────────────────────────────────────────
      // CLERK INVITE: For dashboard-access roles
      // ────────────────────────────────────────────────────────────
      if (!params.email) {
        return { success: false, error: "Email required for this role" };
      }

      // Create Clerk organization invitation
      const clerk = await clerkClient();
      const invitation = await clerk.organizations.createOrganizationInvitation(
        {
          organizationId: clerkOrgId,
          emailAddress: params.email,
          role: role.level_type === "admin" ? "org:admin" : "org:member",
          publicMetadata: {
            role: params.roleCode,
            merchantId: params.merchantId,
            organizationId: clerkOrgId,
            location_assignments: params.locationAssignments.map(
              (location: any) => ({
                locationId: location.locationId,
                role_code: location.roleCode,
                is_primary_location: location.isPrimary,
                hourly_rate: location.hourlyRate,
                pin_code: location.pinCode,
              }),
            ),
          },
        },
      );
      console.log("Clerk invitation:", invitation);

      if (invitation.id) {
        // Store invite in our DB
        const { error: inviteError } = await supabase
          .from("location_invites")
          .insert({
            merchant_id: params.merchantId,
            email: params.email,
            first_name: params.firstName,
            last_name: params.lastName,
            phone: params.phone,
            role_code: params.roleCode,
            location_assignments: params.locationAssignments,
            invite_type: "clerk",
            clerk_invite_id: invitation.id,
            hourly_rate: params.hourlyRate,
            employee_id: params.employeeId,
            invited_by_user_id: userId,
            status: "pending",
          });

        if (inviteError) {
          // DB insert failed — revoke the Clerk invitation so we don't leave
          // an orphan that the user could still accept.
          try {
            await clerk.organizations.revokeOrganizationInvitation({
              organizationId: clerkOrgId,
              invitationId: invitation.id,
              requestingUserId: userId,
            });
          } catch (revokeErr) {
            console.warn(
              "[inviteStaffMember] Failed to revoke orphan Clerk invite:",
              revokeErr,
            );
          }
          throw inviteError;
        }

        // Log audit event
        await LogAuditEvent({
          merchantId: params.merchantId,
          action: `Invited Staff Member (Clerk): ${params.email}`,
          actionCategory: "staff",
          resourceType: "staff_invite",
          resourceId: invitation.id,
          resourceName: `${params.firstName} ${params.lastName}`,
          metadata: {
            email: params.email,
            role_code: params.roleCode,
            locations: params.locationAssignments.map((l) => l.locationId),
          },
        });

        return {
          success: true,
          inviteType: "clerk",
          invitationId: invitation.id,
        };
      } else {
        return {
          success: false,
          error: "Failed to create Clerk invitation",
        };
      }
    } else {
      // ────────────────────────────────────────────────────────────
      // POS-ONLY INVITE: For POS-only roles
      // ────────────────────────────────────────────────────────────
      const inviteToken = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      const { data: invite, error: inviteError } = await supabase
        .from("location_invites")
        .insert({
          merchant_id: params.merchantId,
          email: params.email,
          phone: params.phone,
          first_name: params.firstName,
          last_name: params.lastName,
          role_code: params.roleCode,
          location_assignments: params.locationAssignments,
          invite_type: "pos_only",
          invite_token: inviteToken,
          invite_token_expires_at: expiresAt.toISOString(),
          hourly_rate: params.hourlyRate,
          employee_id: params.employeeId,
          invited_by_user_id: userId,
          status: "pending",
        })
        .select()
        .single();

      if (inviteError) throw inviteError;

      // Send SMS/Email with setup link
      if (params.phone || params.email) {
        await sendStaffInviteNotification({
          email: params.email,
          phone: params.phone,
          firstName: params.firstName,
          token: inviteToken,
          merchantId: params.merchantId,
        });
      }

      // Log audit event
      await LogAuditEvent({
        merchantId: params.merchantId,
        action: `Invited Staff Member (POS): ${params.firstName} ${params.lastName}`,
        actionCategory: "staff",
        resourceType: "staff_invite",
        resourceId: invite.id,
        resourceName: `${params.firstName} ${params.lastName}`,
        metadata: {
          email: params.email,
          phone: params.phone,
          role_code: params.roleCode,
          locations: params.locationAssignments.map((l: any) => l.locationId),
        },
      });

      return {
        success: true,
        inviteType: "pos_only",
        inviteId: invite.id,
        setupUrl: `${process.env.NEXT_PUBLIC_APP_URL}/setup/${inviteToken}`,
      };
    }
  } catch (error: any) {
    console.error("Invite error:", error);
    return { success: false, error: error.message };
  }
}

// ============================================================================
// QUICK ADD STAFF (POS)
// ============================================================================

export async function quickAddStaff(params: QuickAddStaffParams) {
  const supabase = await createServerSupabaseClient();

  // Store the PIN directly so it can be displayed in staff details
  const storedPin = params.pin;

  // Generate display name
  const displayName = `${params.firstName} ${params.lastName.charAt(0)}.`;

  try {
    // Create staff record
    const { data: staff, error: staffError } = await supabase
      .from("staff")
      .insert({
        merchant_id: params.merchantId,
        first_name: params.firstName,
        last_name: params.lastName,
        display_name: displayName,
        pin_code: storedPin,
        role_code: params.roleCode,
        employment_type: params.employmentType || "part_time",
        hourly_rate: params.hourlyRate,
        is_active: true,
      })
      .select()
      .single();

    if (staffError) throw staffError;

    // Assign to location
    const { error: locationError } = await supabase
      .from("staff_locations")
      .insert({
        staff_id: staff.id,
        location_id: params.locationId,
        is_primary_location: true,
        is_active: true,
      });

    if (locationError) throw locationError;

    // Log audit event
    await LogAuditEvent({
      merchantId: params.merchantId,
      action: `Quick Added Staff: ${displayName}`,
      actionCategory: "staff",
      resourceType: "staff_profile",
      resourceId: staff.id,
      resourceName: displayName,
      locationId: params.locationId,
      metadata: {
        role_code: params.roleCode,
        employment_type: params.employmentType,
      },
      changes: { after: staff as unknown as Record<string, unknown> },
    });

    return {
      success: true,
      staffId: staff.id,
      displayName: staff.display_name,
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// ACCEPT POS-ONLY INVITE (Setup PIN)
// ============================================================================

export async function acceptPosInvite(token: string, pin: string) {
  const supabase = await createServerSupabaseClient();

  // Find invite
  const { data: invite, error: inviteError } = await supabase
    .from("staff_invites")
    .select("*")
    .eq("invite_token", token)
    .eq("status", "pending")
    .gt("invite_token_expires_at", new Date().toISOString())
    .single();

  if (inviteError || !invite) {
    return { success: false, error: "Invalid or expired invite" };
  }

  // Store the PIN directly so it can be displayed in staff details
  const storedPin = pin;
  const displayName = `${invite.first_name} ${
    invite.last_name?.charAt(0) || ""
  }.`;

  try {
    // Create staff record
    const { data: staff, error: staffError } = await supabase
      .from("staff")
      .insert({
        merchant_id: invite.merchant_id,
        first_name: invite.first_name,
        last_name: invite.last_name,
        display_name: displayName,
        email: invite.email,
        phone: invite.phone,
        pin_code: storedPin,
        role_code: invite.role_code,
        employment_type: invite.employment_type,
        hourly_rate: invite.hourly_rate,
        employee_id: invite.employee_id,
        is_active: true,
      })
      .select()
      .single();

    if (staffError) throw staffError;

    // Assign to locations
    const locationAssignments = invite.location_assignments as any[];
    for (const assignment of locationAssignments) {
      await supabase.from("staff_locations").insert({
        staff_id: staff.id,
        location_id: assignment.location_id,
        role_code: assignment.role_code || null,
        is_primary_location: assignment.is_primary || false,
        is_active: true,
      });
    }

    // Update invite status
    await supabase
      .from("staff_invites")
      .update({
        status: "accepted",
        accepted_by_staff_id: staff.id,
        accepted_at: new Date().toISOString(),
      })
      .eq("id", invite.id);

    // Log audit event
    await LogAuditEvent({
      merchantId: invite.merchant_id,
      action: `Staff Accepted Invite: ${displayName}`,
      actionCategory: "staff",
      resourceType: "staff_profile",
      resourceId: staff.id,
      resourceName: displayName,
      metadata: {
        invite_type: "pos_only",
      },
    });

    return { success: true, staffId: staff.id };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// CREATE CUSTOM ROLE
// ============================================================================

export async function createCustomRole(params: CreateCustomRoleParams) {
  const { userId } = await auth();
  if (!userId) {
    return { success: false, error: "Unauthorized" };
  }

  const supabase = await createServerSupabaseClient();

  // Get base role
  const { data: baseRole, error: baseError } = await supabase
    .from("roles")
    .select("*")
    .eq("code", params.baseRoleCode)
    .is("merchant_id", null) // Must be a system role
    .single();

  if (baseError || !baseRole) {
    return { success: false, error: "Invalid base role" };
  }

  // Generate unique code
  const roleCode = `${params.merchantId.substring(0, 8)}.${params.name
    .toLowerCase()
    .replace(/\s+/g, "_")}`;

  try {
    // Create custom role
    const { data: role, error: roleError } = await supabase
      .from("roles")
      .insert({
        code: roleCode,
        name: params.name,
        description: params.description,
        organization_type: "merchant",
        merchant_id: params.merchantId,
        base_role_code: params.baseRoleCode,
        level: baseRole.level, // Inherit level from base
        level_type: baseRole.level_type,
        is_system_role: false,
        requires_clerk_account:
          params.canAccessDashboard ?? baseRole.requires_clerk_account,
        can_access_dashboard:
          params.canAccessDashboard ?? baseRole.can_access_dashboard,
        can_access_pos: params.canAccessPos ?? baseRole.can_access_pos,
        max_locations: params.maxLocations ?? baseRole.max_locations,
        color: params.color,
        icon: params.icon,
      })
      .select()
      .single();

    if (roleError) throw roleError;

    // Copy base role permissions
    const { data: basePermissions } = await supabase
      .from("roles_permissions")
      .select("permission_id")
      .eq("role_code", params.baseRoleCode);

    if (basePermissions && basePermissions.length > 0) {
      await supabase.from("roles_permissions").insert(
        basePermissions.map((p) => ({
          role_code: roleCode,
          permission_id: p.permission_id,
        })),
      );
    }

    // Apply permission overrides
    if (params.permissionOverrides && params.permissionOverrides.length > 0) {
      for (const override of params.permissionOverrides) {
        // Get permission ID
        const { data: permission } = await supabase
          .from("permissions")
          .select("id")
          .eq("code", override.permissionCode)
          .single();

        if (!permission) continue;

        if (override.overrideType === "grant") {
          // Add permission
          await supabase.from("roles_permissions").upsert({
            role_code: roleCode,
            permission_id: permission.id,
          });
        } else {
          // Remove permission
          await supabase
            .from("roles_permissions")
            .delete()
            .eq("role_code", roleCode)
            .eq("permission_id", permission.id);
        }

        // Track in custom_role_permissions for UI
        await supabase.from("custom_role_permissions").insert({
          role_id: role.id,
          permission_id: permission.id,
          override_type: override.overrideType,
        });
      }
    }

    // Log audit event
    await LogAuditEvent({
      merchantId: params.merchantId,
      action: `Created Custom Role: ${params.name}`,
      actionCategory: "staff",
      resourceType: "role",
      resourceId: role.id,
      resourceName: params.name,
      severity: "warning",
      metadata: {
        role_code: roleCode,
        base_role_code: params.baseRoleCode,
        base_role_name: baseRole.name, // Include human readable name
      },
      changes: { after: role as unknown as Record<string, unknown> },
    });

    return { success: true, role };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// VERIFY STAFF PIN (For POS authentication)
// ============================================================================

export async function verifyStaffPin(
  merchantId: string,
  locationId: string,
  pin: string,
) {
  const supabase = await createServerSupabaseClient();

  // Get all active staff at this location
  const { data: staffMembers, error } = await supabase
    .from("staff_locations")
    .select(
      `
            staff_id,
            role_code,
            pin_code,
            staff!inner(
                id,
                merchant_id,
                first_name,
                last_name,
                display_name,
                pin_code,
                role_code,
                is_active,
                avatar_url
            )
        `,
    )
    .eq("location_id", locationId)
    .eq("is_active", true)
    .eq("staff.merchant_id", merchantId)
    .eq("staff.is_active", true);

  if (error || !staffMembers) {
    return { success: false, error: "Authentication failed" };
  }

  // Check PIN against each staff member
  for (const sl of staffMembers) {
    const staff = sl.staff as any;
    // Check location-specific PIN first, then staff PIN
    const pinToCheck = sl.pin_code || staff.pin_code;

    const pinMatches =
      pinToCheck === pin ||
      (typeof pinToCheck === "string" &&
        pinToCheck.startsWith("$2") &&
        (await bcrypt.compare(pin, pinToCheck)));

    if (pinMatches) {
      // Get effective role (location override or default)
      const effectiveRole = sl.role_code || staff.role_code;

      // Get permissions for this role
      const { data: permissions } = await supabase
        .from("roles_permissions")
        .select("permissions(code, name)")
        .eq("role_code", effectiveRole);

      // Log audit event
      await LogAuditEvent({
        merchantId: merchantId,
        action: `Staff Logged In: ${staff.display_name}`,
        actionCategory: "access_control",
        resourceType: "staff_profile",
        resourceId: staff.id,
        resourceName: staff.display_name,
        locationId: locationId,
        metadata: {
          role_code: effectiveRole,
        },
      });

      return {
        success: true,
        staff: {
          id: staff.id,
          firstName: staff.first_name,
          lastName: staff.last_name,
          displayName: staff.display_name,
          avatarUrl: staff.avatar_url,
          roleCode: effectiveRole,
        },
        permissions: permissions?.map((p) => (p.permissions as any).code) || [],
      };
    }
  }

  return { success: false, error: "Invalid PIN" };
}

// ============================================================================
// GET STAFF FOR LOCATION
// ============================================================================

export async function getStaffForLocation(locationId: string) {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("staff_locations")
    .select(
      `
            id,
            role_code,
            is_primary_location,
            is_active,
            staff(
                id,
                first_name,
                last_name,
                display_name,
                email,
                phone,
                employee_id,
                role_code,
                employment_type,
                hourly_rate,
                is_active,
                is_clocked_in,
                last_clock_in,
                avatar_url,
                user_id
            ),
            roles:role_code(
                name,
                level,
                color,
                icon
            )
        `,
    )
    .eq("location_id", locationId)
    .eq("is_active", true)
    .order("staff(last_name)");

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, data };
}

// ============================================================================
// HELPER: Send invite notification
// ============================================================================

async function sendStaffInviteNotification(params: {
  email?: string;
  phone?: string;
  firstName: string;
  token: string;
  merchantId: string;
}) {
  const setupUrl = `${process.env.NEXT_PUBLIC_APP_URL}/setup/${params.token}`;

  // Get merchant name
  const supabase = await createServerSupabaseClient();
  const { data: merchant } = await supabase
    .from("merchants")
    .select("name")
    .eq("id", params.merchantId)
    .single();

  const message = `Hi ${params.firstName}! You've been invited to join ${
    merchant?.name || "the team"
  } on DEXA POS. Set up your PIN here: ${setupUrl}`;

  if (params.phone) {
    // Send SMS via Twilio or similar
    // await sendSMS(params.phone, message)
  }

  if (params.email) {
    // Send email via Resend or similar
    // await sendEmail(params.email, 'You're invited to DEXA POS', message)
  }
}
