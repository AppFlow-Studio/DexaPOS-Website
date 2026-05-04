'use server'

import { assertHQPermission } from '@/lib/admin/auth'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { logAdminAction } from '@/lib/admin/log-admin-action'
import { revalidatePath } from 'next/cache'
import { clerkClient } from '@clerk/nextjs/server'
import type {
  AdminStaffMember,
  BulkPinResetResult,
  AdminCreateStaffData,
  AdminPinResetResult,
  AdminToggleStatusResult,
  AdminCreateStaffResult,
  AdminCreateClerkStaffData,
  AdminCreateClerkStaffResult,
  AdminInviteClerkStaffData,
  AdminInviteClerkStaffResult,
} from '@/types/staff'

// ============================================================================
// GET ADMIN MERCHANT STAFF
// ============================================================================
/**
 * Get unified staff view for a merchant (admin access)
 * Returns all staff members including POS-only and Clerk users
 */
export async function getAdminMerchantStaff(
  merchantId: string,
  locationId?: string | null
): Promise<AdminStaffMember[]> {
  await assertHQPermission('hq.merchant.view')

  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase.rpc('admin_get_unified_staff_view', {
    p_merchant_id: merchantId,
    p_location_id: locationId || null,
  })

  if (error) {
    console.error('[getAdminMerchantStaff] Error:', error)
    throw new Error('Failed to fetch staff')
  }

  // Transform data to match AdminStaffMember interface
  return (data || []).map((staff: Record<string, unknown>) => ({
    member_id: staff.member_id as string,
    staff_profile_id: staff.staff_profile_id as string | null,
    user_id: staff.user_id as string | null,
    clerk_user_id: staff.clerk_user_id as string | null,
    email: staff.email as string | null,
    first_name: staff.first_name as string,
    last_name: staff.last_name as string,
    display_name: staff.display_name as string,
    avatar_url: staff.avatar_url as string | null,
    phone: staff.phone as string | null,
    account_type: staff.account_type as 'clerk' | 'pos_only',
    is_clerk_user: staff.is_clerk_user as boolean,
    location_assignments: staff.location_assignments as AdminStaffMember['location_assignments'],
    total_locations: Number(staff.total_locations) || 0,
    primary_location_id: staff.primary_location_id as string | null,
    primary_location_name: staff.primary_location_name as string | null,
    overall_is_active: staff.overall_is_active as boolean,
    member_created_at: staff.member_created_at as string,
    last_updated_at: staff.last_updated_at as string,
  }))
}

// ============================================================================
// RESET STAFF PIN
// ============================================================================
/**
 * Reset PIN for a single staff member at a location
 * Can optionally provide a custom PIN
 */
export async function adminResetStaffPin(
  merchantId: string,
  staffProfileId: string,
  locationId: string,
  customPin?: string
): Promise<AdminPinResetResult> {
  await assertHQPermission('hq.merchant.manage_team')

  const supabase = createServerSupabaseClient()

  // Option 1: Use the RPC function (uses pgcrypto for hashing)
  const { data, error } = await supabase.rpc('admin_reset_staff_pin', {
    p_staff_profile_id: staffProfileId,
    p_location_id: locationId,
    p_custom_pin: customPin || null,
  })

  if (error) {
    console.error('[adminResetStaffPin] Error:', error)
    return { success: false, error: error.message }
  }

  const result = data?.[0]
  if (!result?.success) {
    return { success: false, error: result?.error_message || 'Failed to reset PIN' }
  }

  await logAdminAction('MERCHANT_STAFF_PIN_RESET', {
    merchantId,
    locationId,
    resourceType: 'staff_member',
    resourceId: staffProfileId,
    resourceName: result.staff_name || staffProfileId,
    metadata: {
      custom_pin_used: Boolean(customPin),
      source: 'adminResetStaffPin',
    },
  })

  revalidatePath(`/manage/merchants/${merchantId}`)
  return { success: true, pin: result.new_pin }
}

// ============================================================================
// BULK RESET PINS
// ============================================================================
/**
 * Bulk reset PINs for all active staff at a merchant/location.
 * When customPin is provided, applies that same PIN to every staff member
 * (iterates per-member rather than using the RPC generator).
 */
export async function adminBulkResetPins(
  merchantId: string,
  locationId?: string | null,
  customPin?: string,
): Promise<{ success: boolean; results?: BulkPinResetResult[]; error?: string }> {
  await assertHQPermission('hq.merchant.manage_team')

  if (customPin !== undefined && !/^\d{4,6}$/.test(customPin)) {
    return { success: false, error: 'Custom PIN must be 4–6 digits' }
  }

  // When a custom PIN is requested, iterate per-member (same approach as merchant BulkResetPINs)
  if (customPin) {
    const allStaff = await getAdminMerchantStaff(merchantId, locationId)
    const results: BulkPinResetResult[] = []
    const errors: string[] = []

    for (const member of allStaff) {
      if (!member.overall_is_active) continue
      const primary =
        member.location_assignments.find((a) => a.is_primary) ||
        member.location_assignments[0]
      if (!primary || !member.staff_profile_id) {
        errors.push(`${member.display_name}: missing location or profile ID`)
        continue
      }
      const res = await adminResetStaffPin(
        merchantId,
        member.staff_profile_id,
        primary.location_id,
        customPin,
      )
      if (res.success && res.pin) {
        results.push({
          staff_profile_id: member.staff_profile_id,
          staff_name: member.display_name,
          new_pin: res.pin,
        })
      } else {
        errors.push(`${member.display_name}: ${res.error || 'failed'}`)
      }
    }

    if (errors.length) console.warn('[adminBulkResetPins] partial errors:', errors)
    revalidatePath(`/manage/merchants/${merchantId}`)
    return { success: true, results }
  }

  // Default: use RPC to generate random PINs
  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase.rpc('admin_bulk_reset_pins', {
    p_merchant_id: merchantId,
    p_location_id: locationId || null,
  })

  if (error) {
    console.error('[adminBulkResetPins] Error:', error)
    return { success: false, error: error.message }
  }

  const results: BulkPinResetResult[] = (data || []).map((row: Record<string, unknown>) => ({
    staff_profile_id: row.staff_profile_id as string,
    staff_name: row.staff_name as string,
    new_pin: row.new_pin as string,
  }))

  // Audit log
  if (results.length > 0) {
    await logAdminAction('MERCHANT_STAFF_PIN_RESET', {
      merchantId,
      locationId: locationId || null,
      resourceType: 'staff_member',
      resourceName: `bulk_pin_reset_${new Date().toISOString()}`,
      metadata: {
        bulk_reset: true,
        staff_count: results.length,
        staff_profile_ids: results.map((row) => row.staff_profile_id),
        source: 'adminBulkResetPins',
      },
    })
  }

  revalidatePath(`/manage/merchants/${merchantId}`)

  return { success: true, results }
}


// ============================================================================
// TOGGLE STAFF STATUS
// ============================================================================
/**
 * Toggle active status for a staff member at a location
 */
export async function adminToggleStaffStatus(
  merchantId: string,
  staffProfileId: string,
  locationId: string,
  newStatus: boolean
): Promise<AdminToggleStatusResult> {
  await assertHQPermission('hq.merchant.manage_team')

  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase.rpc('admin_toggle_staff_status', {
    p_staff_profile_id: staffProfileId,
    p_location_id: locationId,
    p_new_status: newStatus,
  })

  if (error) {
    console.error('[adminToggleStaffStatus] Error:', error)
    return { success: false, error: error.message }
  }

  const result = data?.[0]
  if (!result?.success) {
    return { success: false, error: result?.error_message || 'Failed to toggle status' }
  }

  // Audit log
  const actionString = newStatus
    ? `Reactivated Staff Member: ${result.staff_name}`
    : `Deactivated Staff Member: ${result.staff_name}`

  await logAdminAction(newStatus ? 'MERCHANT_STAFF_REACTIVATED' : 'MERCHANT_STAFF_DEACTIVATED', {
    merchantId,
    locationId,
    resourceType: 'staff_member',
    resourceId: staffProfileId,
    resourceName: result.staff_name || actionString,
    changes: {
      is_active: {
        old: !newStatus,
        new: newStatus,
      },
    },
    metadata: {
      source: 'adminToggleStaffStatus',
    },
  })

  revalidatePath(`/manage/merchants/${merchantId}`)

  return { success: true }
}

// ============================================================================
// CREATE STAFF
// ============================================================================
/**
 * Create a new POS-only staff member for a merchant
 */
export async function adminCreateStaff(
  merchantId: string,
  data: AdminCreateStaffData
): Promise<AdminCreateStaffResult> {
  const { userId } = await assertHQPermission('hq.merchant.manage_team')

  // Use Service Role client to bypass RLS, since we already verified permissions via assertHQPermission
  const supabase = createServiceRoleClient()

  // Generate or validate PIN
  let pinCode: string | null = null
  let generatedPin: string | undefined

  if (data.autoGeneratePin) {
    generatedPin = Math.floor(1000 + Math.random() * 9000).toString()
    pinCode = generatedPin
  } else if (data.pin) {
    // Validate PIN format
    if (!/^\d{4,6}$/.test(data.pin)) {
      return { success: false, error: 'PIN must be 4-6 digits' }
    }
    pinCode = data.pin
  }

  // Create staff profile
  const { data: staffProfile, error: profileError } = await supabase
    .from('staff_profiles')
    .insert({
      merchant_id: merchantId,
      user_id: null, // POS-only staff
      first_name: data.firstName,
      last_name: data.lastName,
      email: data.email || null,
      phone: data.phone || null,
      account_type: 'pos_only',
      is_active: true,
    })
    .select()
    .single()

  if (profileError || !staffProfile) {
    console.error('[adminCreateStaff] Profile error:', profileError)
    return { success: false, error: 'Failed to create staff profile' }
  }

  // Create location membership (skip if merchant has no locations yet)
  if (data.locationId) {
    const { error: memberError } = await supabase.from('location_members').insert({
      staff_profile_id: staffProfile.id,
      location_id: data.locationId,
      merchant_id: merchantId,
      role_code: data.roleCode,
      is_primary_location: true,
      is_active: true,
      pin_plain: pinCode,
      pin_hashed: null,
      pin_code: pinCode,
      hourly_rate: data.hourlyRate || 0,
      employment_type: data.employmentType,
      assigned_at: new Date().toISOString(),
    })

    if (memberError) {
      console.error('[adminCreateStaff] Member error:', memberError)
      await supabase.from('staff_profiles').delete().eq('id', staffProfile.id)
      return { success: false, error: 'Failed to assign staff to location' }
    }
  }

  // Get staff name for audit log
  const staffName = `${data.firstName} ${data.lastName}`

  // Audit log
  await logAdminAction('MERCHANT_STAFF_CREATED', {
    merchantId,
    locationId: data.locationId,
    resourceType: 'staff_member',
    resourceId: staffProfile.id,
    resourceName: staffName,
    changes: {
      after: {
        first_name: data.firstName,
        last_name: data.lastName,
        email: data.email,
        phone: data.phone,
        role: data.roleCode,
        employment_type: data.employmentType,
        is_active: true,
      },
    },
    metadata: {
      admin_created: true,
      hq_admin_id: userId,
      role: data.roleCode,
      source: 'adminCreateStaff',
    },
  })

  revalidatePath(`/manage/merchants/${merchantId}`)

  return {
    success: true,
    staffProfileId: staffProfile.id,
    pin: generatedPin,
  }
}

// ============================================================================
// GET MERCHANT LOCATIONS (for dropdowns)
// ============================================================================
/**
 * Get locations for a merchant (for staff assignment dropdowns)
 */
export async function getMerchantLocationsForStaff(
  merchantId: string
): Promise<Array<{ id: string; name: string; is_active: boolean }>> {
  await assertHQPermission('hq.merchant.view')

  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase
    .from('locations')
    .select('id, name, is_active')
    .eq('merchant_id', merchantId)
    .order('name')

  if (error) {
    console.error('[getMerchantLocationsForStaff] Error:', error)
    return []
  }

  return data || []
}

// ============================================================================
// GET STAFF ROLES (for dropdowns)
// ============================================================================
/**
 * Get available roles for staff assignment
 */
export async function getMerchantStaffRoles(): Promise<
  Array<{ code: string; name: string; level: number; level_type: string }>
> {
  await assertHQPermission('hq.merchant.view')

  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase
    .from('roles')
    .select('code, name, level, level_type')
    .eq('organization_type', 'merchant')
    .order('level')

  if (error) {
    console.error('[getMerchantStaffRoles] Error:', error)
    return []
  }

  return data || []
}

// ============================================================================
// GET STAFF STATS
// ============================================================================
// ============================================================================
// BULK DEACTIVATE STAFF
// ============================================================================
/**
 * Bulk deactivate multiple staff members by their staff_profile_ids
 * Deactivates all location_members rows for each staff profile
 */
export async function adminBulkDeactivateStaff(
  merchantId: string,
  staffProfileIds: string[]
): Promise<{ success: boolean; deactivated: number; errors: string[] }> {
  await assertHQPermission('hq.merchant.manage_team')

  const supabase = createServiceRoleClient()

  let deactivated = 0
  const errors: string[] = []

  for (const staffProfileId of staffProfileIds) {
    const { error } = await supabase
      .from('location_members')
      .update({ is_active: false })
      .eq('staff_profile_id', staffProfileId)
      .eq('merchant_id', merchantId)

    if (error) {
      console.error('[adminBulkDeactivateStaff] Error deactivating:', staffProfileId, error)
      errors.push(staffProfileId)
    } else {
      deactivated++
    }
  }

  if (deactivated > 0) {
    await logAdminAction('MERCHANT_STAFF_DEACTIVATED', {
      merchantId,
      resourceType: 'staff_member',
      resourceName: `bulk_deactivate_${new Date().toISOString()}`,
      metadata: {
        deactivated,
        staff_profile_ids: staffProfileIds,
        source: 'adminBulkDeactivateStaff',
      },
    })
  }

  revalidatePath(`/manage/merchants/${merchantId}`)
  return { success: true, deactivated, errors }
}

// ============================================================================
// CREATE CLERK (DASHBOARD) STAFF
// ============================================================================
/**
 * Create a Clerk dashboard user for a merchant, as an HQ admin.
 * Looks up the merchant's clerk_org_id, creates a Clerk user with a temp
 * password, adds them to the org, and provisions the DB records.
 */
export async function adminCreateClerkStaff(
  merchantId: string,
  data: AdminCreateClerkStaffData
): Promise<AdminCreateClerkStaffResult> {
  const { userId: adminUserId } = await assertHQPermission('hq.merchant.manage_team')

  const supabase = createServerSupabaseClient()
  const srClient = createServiceRoleClient()

  // 1. Look up merchant to get clerk_org_id
  const { data: merchant, error: merchantError } = await srClient
    .from('merchants')
    .select('id, clerk_org_id, name')
    .eq('id', merchantId)
    .single()

  if (merchantError || !merchant?.clerk_org_id) {
    console.error('[adminCreateClerkStaff] Merchant lookup failed:', merchantError)
    return { success: false, error: 'Merchant not found or missing Clerk org' }
  }

  const clerkOrgId = merchant.clerk_org_id

  // Ensure the organizations row exists — the Clerk webhook may not have fired for this org
  await srClient.from('organizations').upsert(
    { id: clerkOrgId, name: merchant.name, updated_at: new Date().toISOString() },
    { onConflict: 'id', ignoreDuplicates: true }
  )

  // 2. Generate temp password
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*'
  const tempPassword = Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')

  // 3. Optionally generate PIN
  let pinCode: string | null = null
  let generatedPin: string | undefined

  if (data.autoGeneratePin) {
    generatedPin = Math.floor(1000 + Math.random() * 9000).toString()
    pinCode = generatedPin
  } else if (data.pin) {
    if (!/^\d{4,6}$/.test(data.pin)) {
      return { success: false, error: 'PIN must be 4-6 digits' }
    }
    pinCode = data.pin
  }

  // 4. Create Clerk user
  const clerk = await clerkClient()
  let clerkUser: Awaited<ReturnType<typeof clerk.users.createUser>>
  try {
    clerkUser = await clerk.users.createUser({
      emailAddress: [data.email],
      password: tempPassword,
      firstName: data.firstName,
      lastName: data.lastName,
      phoneNumber: data.phone ? [data.phone] : undefined,
      publicMetadata: {
        creationType: 'admin_direct',
        organizationId: clerkOrgId,
        merchantId,
        roleCode: data.roleCode,
      },
      skipPasswordRequirement: false,
      skipPasswordChecks: false,
    })
  } catch (err: unknown) {
    console.error('[adminCreateClerkStaff] Clerk user creation failed:', err)
    const msg = err instanceof Error ? err.message : 'Failed to create Clerk user'
    return { success: false, error: msg }
  }

  // 5. Add user to merchant's Clerk org
  let membership: Awaited<ReturnType<typeof clerk.organizations.createOrganizationMembership>>
  try {
    membership = await clerk.organizations.createOrganizationMembership({
      organizationId: clerkOrgId,
      userId: clerkUser.id,
      role: 'org:member',
    })
  } catch (err: unknown) {
    console.error('[adminCreateClerkStaff] Org membership failed:', err)
    await clerk.users.deleteUser(clerkUser.id)
    return { success: false, error: 'Failed to add user to merchant organization' }
  }

  // 6. Eagerly create users row (webhook may not have fired yet)
  const { error: userUpsertError } = await srClient.from('users').upsert(
    {
      id: clerkUser.id,
      first_name: data.firstName,
      last_name: data.lastName,
      email: data.email,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id', ignoreDuplicates: true }
  )
  if (userUpsertError) {
    console.error('[adminCreateClerkStaff] Users upsert failed:', userUpsertError)
    await clerk.users.deleteUser(clerkUser.id)
    return { success: false, error: 'Failed to provision user record' }
  }

  // 7. Create staff_profile
  const { data: staffProfile, error: profileError } = await srClient
    .from('staff_profiles')
    .insert({
      merchant_id: merchantId,
      user_id: clerkUser.id,
      first_name: data.firstName,
      last_name: data.lastName,
      email: data.email,
      phone: data.phone || null,
      account_type: 'clerk',
      is_active: true,
    })
    .select()
    .single()

  if (profileError || !staffProfile) {
    console.error('[adminCreateClerkStaff] Staff profile creation failed:', profileError)
    await clerk.users.deleteUser(clerkUser.id)
    return { success: false, error: 'Failed to create staff profile' }
  }

  // 8. Create member record
  const { data: member, error: memberError } = await srClient
    .from('members')
    .insert({
      id: membership.id,
      user_id: clerkUser.id,
      staff_profile_id: staffProfile.id,
      organization_id: clerkOrgId,
      role: data.roleCode,
    })
    .select()
    .single()

  if (memberError || !member) {
    console.error('[adminCreateClerkStaff] Member creation failed:', memberError)
    await srClient.from('staff_profiles').delete().eq('id', staffProfile.id)
    await clerk.users.deleteUser(clerkUser.id)
    return { success: false, error: 'Failed to create member record' }
  }

  // 9. Create location_members record (skip if merchant has no locations yet)
  if (data.locationId) {
    const { error: locationError } = await srClient.from('location_members').insert({
      location_id: data.locationId,
      merchant_id: merchantId,
      user_id: clerkUser.id,
      staff_profile_id: staffProfile.id,
      role_code: data.roleCode,
      is_primary_location: true,
      is_active: true,
      pin_plain: pinCode,
      pin_hashed: null,
      pin_code: pinCode,
      hourly_rate: data.hourlyRate || 0,
      employment_type: data.employmentType,
      assigned_at: new Date().toISOString(),
    })

    if (locationError) {
      console.error('[adminCreateClerkStaff] Location members creation failed:', locationError)
      await srClient.from('members').delete().eq('id', member.id)
      await srClient.from('staff_profiles').delete().eq('id', staffProfile.id)
      await clerk.users.deleteUser(clerkUser.id)
      return { success: false, error: 'Failed to create location assignment' }
    }
  }

  // 10. Audit log
  await logAdminAction('MERCHANT_STAFF_CREATED', {
    merchantId,
    locationId: data.locationId,
    resourceType: 'staff_member',
    resourceId: staffProfile.id,
    resourceName: `${data.firstName} ${data.lastName}`,
    changes: {
      after: {
        first_name: data.firstName,
        last_name: data.lastName,
        email: data.email,
        role: data.roleCode,
        account_type: 'clerk',
        is_active: true,
      },
    },
    metadata: {
      admin_created: true,
      hq_admin_id: adminUserId,
      source: 'adminCreateClerkStaff',
    },
  })

  revalidatePath(`/manage/merchants/${merchantId}`)

  return {
    success: true,
    staffProfileId: staffProfile.id,
    tempPassword,
    generatedPin,
  }
}

// ============================================================================
// ADMIN INVITE CLERK STAFF (email invitation flow)
// ============================================================================
/**
 * Send a Clerk organization invitation for a merchant staff member.
 * The invited user sets their own password via the email link.
 */
export async function adminInviteClerkStaff(
  merchantId: string,
  data: AdminInviteClerkStaffData
): Promise<AdminInviteClerkStaffResult> {
  const { userId: adminUserId } = await assertHQPermission('hq.merchant.manage_team')

  const srClient = createServiceRoleClient()

  // 1. Look up merchant to get clerk_org_id
  const { data: merchant, error: merchantError } = await srClient
    .from('merchants')
    .select('id, clerk_org_id')
    .eq('id', merchantId)
    .single()

  if (merchantError || !merchant?.clerk_org_id) {
    return { success: false, error: 'Merchant not found or missing Clerk org' }
  }

  const clerkOrgId = merchant.clerk_org_id

  // 2. Optionally generate PIN
  let pinCode: string | null = null
  let generatedPin: string | undefined

  if (data.autoGeneratePin) {
    generatedPin = Math.floor(1000 + Math.random() * 9000).toString()
    pinCode = generatedPin
  } else if (data.pin) {
    if (!/^\d{4,6}$/.test(data.pin)) {
      return { success: false, error: 'PIN must be 4–6 digits' }
    }
    pinCode = data.pin
  }

  // 3. Build location assignments metadata (embedded in invitation publicMetadata)
  const locationAssignments = data.locationIds.map((locationId) => ({
    locationId,
    roleCode: data.roleCode,
    isPrimaryLocation: locationId === data.primaryLocationId,
    hourlyRate: data.hourlyRate,
    employmentType: data.employmentType,
    ...(pinCode ? { pinCode } : {}),
  }))

  // 4. Create Clerk org invitation
  //    Clerk requires inviterUserId to be an org:admin of that org.
  //    HQ admins are not org members, so find one who is, or temporarily promote someone.
  const clerk = await clerkClient()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''

  let inviterUserId: string | null = null
  let temporarilyPromoted = false
  let promotedUserId: string | null = null

  try {
    const memberships = await clerk.organizations.getOrganizationMembershipList({
      organizationId: clerkOrgId,
      limit: 50,
    })
    const adminMember = memberships.data.find((m) => m.role === 'org:admin')
    if (adminMember?.publicUserData?.userId) {
      inviterUserId = adminMember.publicUserData.userId
    } else if (memberships.data.length > 0) {
      // No org:admin — temporarily promote the first member
      const firstMember = memberships.data[0]
      if (firstMember?.publicUserData?.userId) {
        promotedUserId = firstMember.publicUserData.userId
        await clerk.organizations.updateOrganizationMembership({
          organizationId: clerkOrgId,
          userId: promotedUserId,
          role: 'org:admin',
        })
        inviterUserId = promotedUserId
        temporarilyPromoted = true
      }
    }
  } catch {
    // Non-fatal — inviterUserId stays null; Clerk may still accept without it
  }

  if (!inviterUserId) {
    return { success: false, error: 'No eligible inviter found in this merchant org' }
  }

  let invitation: Awaited<ReturnType<typeof clerk.organizations.createOrganizationInvitation>> | undefined
  try {
    invitation = await clerk.organizations.createOrganizationInvitation({
      organizationId: clerkOrgId,
      inviterUserId,
      emailAddress: data.email,
      role: 'org:member',
      ...(appUrl && {
        redirectUrl: `${appUrl}/accept-invitation?email=${encodeURIComponent(data.email)}&firstName=${encodeURIComponent(data.firstName)}&lastName=${encodeURIComponent(data.lastName)}`,
      }),
      publicMetadata: {
        creationType: 'invitation',
        roleCode: data.roleCode,
        organizationId: clerkOrgId,
        merchantId,
        locationAssignments,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
      },
    })
  } catch (err: any) {
    console.error('[adminInviteClerkStaff] Clerk createOrganizationInvitation failed:', {
      status: err?.status,
      clerkTraceId: err?.clerkTraceId,
      errors: err?.errors,
    })
    throw err
  } finally {
    if (temporarilyPromoted && promotedUserId) {
      try {
        await clerk.organizations.updateOrganizationMembership({
          organizationId: clerkOrgId,
          userId: promotedUserId,
          role: 'org:member',
        })
      } catch {
        // Non-fatal
      }
    }
  }

  if (!invitation?.id) {
    return { success: false, error: 'Failed to create Clerk invitation' }
  }

  // 5. Store invite in location_invites for tracking
  const { error: inviteError } = await srClient.from('location_invites').insert({
    merchant_id: merchantId,
    location_id: null,
    invited_by_user_id: adminUserId,
    email: data.email,
    first_name: data.firstName,
    last_name: data.lastName,
    phone: data.phone ?? null,
    role_code: data.roleCode,
    invite_type: 'clerk',
    clerk_invite_id: invitation.id,
    hourly_rate: data.hourlyRate ?? null,
    location_assignments: locationAssignments,
    status: 'pending',
  })

  if (inviteError) {
    console.error('[adminInviteClerkStaff] Failed to store invite tracking:', inviteError)
    // Non-fatal — invitation was sent; just warn
  }

  // 6. Audit log
  await logAdminAction('MERCHANT_STAFF_INVITED', {
    merchantId,
    resourceType: 'staff_invite',
    resourceId: invitation.id,
    resourceName: `${data.firstName} ${data.lastName}`,
    changes: {
      after: {
        email: data.email,
        role_code: data.roleCode,
        location_ids: data.locationIds,
      },
    },
    metadata: {
      hq_admin_id: adminUserId,
      source: 'adminInviteClerkStaff',
    },
  })

  revalidatePath(`/manage/merchants/${merchantId}`)

  return {
    success: true,
    inviteId: invitation.id,
    generatedPin,
  }
}

/**
 * Get staff statistics for a merchant
 */
export async function getAdminMerchantStaffStats(merchantId: string): Promise<{
  total: number
  active: number
  clerkUsers: number
  posOnlyUsers: number
}> {
  await assertHQPermission('hq.merchant.view')

  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase.rpc('get_unified_staff_view', {
    p_merchant_id: merchantId,
    p_location_id: null,
  })

  if (error) {
    console.error('[getAdminMerchantStaffStats] Error:', error)
    return { total: 0, active: 0, clerkUsers: 0, posOnlyUsers: 0 }
  }

  const staff = data || []

  return {
    total: staff.length,
    active: staff.filter((s: Record<string, unknown>) => s.overall_is_active).length,
    clerkUsers: staff.filter((s: Record<string, unknown>) => s.account_type === 'clerk').length,
    posOnlyUsers: staff.filter((s: Record<string, unknown>) => s.account_type === 'pos_only').length,
  }
}

// ============================================================================
// RESET STAFF PASSWORD
// ============================================================================

function generateSecurePassword(length = 12): string {
  const charset =
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*'
  let password = ''
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length))
  }
  return password
}

/**
 * Reset the dashboard login password for a single Clerk staff member.
 * Only applies to staff with account_type === 'clerk'.
 */
export async function adminResetStaffPassword(
  merchantId: string,
  clerkUserId: string,
  customPassword?: string,
): Promise<{ success: boolean; password?: string; error?: string }> {
  await assertHQPermission('hq.merchant.manage_team')

  if (customPassword !== undefined && customPassword.length < 8) {
    return { success: false, error: 'Password must be at least 8 characters' }
  }

  const password = customPassword || generateSecurePassword(12)

  try {
    const clerk = await clerkClient()
    await clerk.users.updateUser(clerkUserId, { password })
  } catch (err) {
    console.error('[adminResetStaffPassword] Clerk error:', err)
    return { success: false, error: 'Failed to update password in Clerk' }
  }

  await logAdminAction('MERCHANT_STAFF_PASSWORD_RESET', {
    merchantId,
    resourceType: 'staff_member',
    resourceId: clerkUserId,
    metadata: {
      custom_password_used: Boolean(customPassword),
      source: 'adminResetStaffPassword',
    },
  })

  revalidatePath(`/manage/merchants/${merchantId}`)
  return { success: true, password }
}

// ============================================================================
// BULK RESET STAFF PASSWORDS
// ============================================================================

export type BulkPasswordResetResult = {
  clerk_user_id: string
  staff_name: string
  email: string
  new_password: string
}

/**
 * Bulk reset dashboard passwords for all active Clerk staff at a merchant/location.
 */
export async function adminBulkResetPasswords(
  merchantId: string,
  locationId?: string | null,
): Promise<{
  success: boolean
  results?: BulkPasswordResetResult[]
  errors?: string[]
  error?: string
}> {
  await assertHQPermission('hq.merchant.manage_team')

  const allStaff = await getAdminMerchantStaff(merchantId, locationId)
  const clerkStaff = allStaff.filter(
    (s) => s.account_type === 'clerk' && s.clerk_user_id && s.overall_is_active,
  )

  if (clerkStaff.length === 0) {
    return { success: false, error: 'No active dashboard users found at this location' }
  }

  const results: BulkPasswordResetResult[] = []
  const errors: string[] = []

  const clerk = await clerkClient()

  for (const member of clerkStaff) {
    const newPassword = generateSecurePassword(12)
    try {
      await clerk.users.updateUser(member.clerk_user_id!, { password: newPassword })
      results.push({
        clerk_user_id: member.clerk_user_id!,
        staff_name: member.display_name,
        email: member.email || '',
        new_password: newPassword,
      })
    } catch (err) {
      console.error(`[adminBulkResetPasswords] Failed for ${member.display_name}:`, err)
      errors.push(`${member.display_name}: Failed to reset password`)
    }
  }

  if (results.length > 0) {
    await logAdminAction('MERCHANT_STAFF_PASSWORD_RESET', {
      merchantId,
      locationId: locationId || null,
      resourceType: 'staff_member',
      resourceName: `bulk_password_reset_${new Date().toISOString()}`,
      metadata: {
        bulk_reset: true,
        staff_count: results.length,
        source: 'adminBulkResetPasswords',
      },
    })
  }

  revalidatePath(`/manage/merchants/${merchantId}`)
  return { success: true, results, errors }
}
