'use server'

import { assertHQPermission } from '@/lib/admin/auth'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import bcrypt from 'bcryptjs'
import type {
  AdminStaffMember,
  BulkPinResetResult,
  AdminCreateStaffData,
  AdminPinResetResult,
  AdminToggleStatusResult,
  AdminCreateStaffResult,
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

  const { data, error } = await supabase.rpc('get_unified_staff_view', {
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

  revalidatePath(`/manage/merchants/${merchantId}`)

  return { success: true, pin: result.new_pin }
}

// ============================================================================
// BULK RESET PINS
// ============================================================================
/**
 * Bulk reset PINs for all active staff at a merchant/location
 */
export async function adminBulkResetPins(
  merchantId: string,
  locationId?: string | null
): Promise<{ success: boolean; results?: BulkPinResetResult[]; error?: string }> {
  await assertHQPermission('hq.merchant.manage_team')

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

  const supabase = createServerSupabaseClient()

  // Generate or validate PIN
  let hashedPin: string | null = null
  let generatedPin: string | undefined

  if (data.autoGeneratePin) {
    generatedPin = Math.floor(1000 + Math.random() * 9000).toString()
    hashedPin = await bcrypt.hash(generatedPin, 10)
  } else if (data.pin) {
    // Validate PIN format
    if (!/^\d{4,6}$/.test(data.pin)) {
      return { success: false, error: 'PIN must be 4-6 digits' }
    }
    hashedPin = await bcrypt.hash(data.pin, 10)
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

  // Create location membership
  const { error: memberError } = await supabase.from('location_members').insert({
    staff_profile_id: staffProfile.id,
    location_id: data.locationId,
    merchant_id: merchantId,
    role_code: data.roleCode,
    is_primary_location: true,
    is_active: true,
    pin_code: hashedPin,
    hourly_rate: data.hourlyRate || 0,
    employment_type: data.employmentType,
    assigned_at: new Date().toISOString(),
  })

  if (memberError) {
    console.error('[adminCreateStaff] Member error:', memberError)
    // Rollback staff profile
    await supabase.from('staff_profiles').delete().eq('id', staffProfile.id)
    return { success: false, error: 'Failed to assign staff to location' }
  }

  // Get staff name for audit log
  const staffName = `${data.firstName} ${data.lastName}`

  // Audit log
  await supabase.from('audit_logs').insert({
    actor_user_id: userId,
    actor_role: 'hq.admin',
    action: 'ADMIN_CREATE_STAFF',
    action_category: 'staff_management',
    severity: 'info',
    resource_type: 'staff_profile',
    resource_id: staffProfile.id,
    resource_name: staffName,
    merchant_id: merchantId,
    location_id: data.locationId,
    metadata: {
      admin_created: true,
      role: data.roleCode,
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
