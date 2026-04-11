import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js'
import { verifyWebhook } from 'npm:@clerk/backend/webhooks'
import { createClerkClient, ClerkClient } from 'npm:@clerk/backend'

// ============================================================================
// CONSTANTS & CONFIGURATION
// ============================================================================

const DEXA_HQ_ORG_ID = Deno.env.get('DEXA_HQ_ORG_ID')!
const LEGACY_ORG_LOGO_BUCKET = 'Organizations-Logos'
const BUNNY_STORAGE_ZONE = Deno.env.get('BUNNY_STORAGE_ZONE_NAME') || ''
const BUNNY_STORAGE_API_KEY = Deno.env.get('BUNNY_STORAGE_API_KEY') || ''
const BUNNY_STORAGE_REGION = Deno.env.get('BUNNY_STORAGE_REGION') || ''
const BUNNY_STORAGE_BASE = `https://${BUNNY_STORAGE_REGION ? `${BUNNY_STORAGE_REGION}.` : ''}storage.bunnycdn.com/${BUNNY_STORAGE_ZONE}`

// ============================================================================
// TYPES
// ============================================================================

interface WebhookContext {
  supabase: SupabaseClient
  clerkClient: ClerkClient
  event: any
}

interface MerchantAccessAssignment {
  merchantId: string
  merchantName?: string
  // Note: accessLevel is deprecated - role determines permissions
}

// ============================================================================
// RESPONSE HELPERS
// ============================================================================

function successResponse(data: any, message?: string): Response {
  return new Response(
    JSON.stringify({ success: true, data, message }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
}

function errorResponse(error: string, status: number = 500, details?: any): Response {
  console.error(`[ERROR] ${error}`, details || '')
  return new Response(
    JSON.stringify({ success: false, error, details }),
    { status, headers: { 'Content-Type': 'application/json' } }
  )
}

// ============================================================================
// LOGGING HELPERS
// ============================================================================

function logEvent(eventType: string, message: string, data?: any): void {
  const timestamp = new Date().toISOString()
  console.log(`[${timestamp}] [${eventType}] ${message}`, data ? JSON.stringify(data, null, 2) : '')
}

function logError(eventType: string, message: string, error: any): void {
  const timestamp = new Date().toISOString()
  console.error(`[${timestamp}] [${eventType}] ERROR: ${message}`, error)
}

/**
 * Safely fetches a Clerk user with optional retries and exponential backoff.
 * Returns null instead of throwing when the user is not found (race condition).
 */
async function safeGetUser(
  clerkClient: ClerkClient,
  userId: string,
  options?: { retries?: number; baseDelayMs?: number }
): Promise<any | null> {
  const maxRetries = options?.retries ?? 0
  const baseDelay = options?.baseDelayMs ?? 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await clerkClient.users.getUser(userId)
    } catch (error: any) {
      const isNotFound = error?.status === 404 || error?.clerkError
      if (!isNotFound || attempt === maxRetries) return null
      const delay = baseDelay * Math.pow(2, attempt)
      logEvent('safeGetUser', `User not found, retrying in ${delay}ms (${attempt + 1}/${maxRetries + 1})`, { userId })
      await new Promise(r => setTimeout(r, delay))
    }
  }
  return null
}

function extractStoragePathFromUrl(url: string): string {
  const parsedUrl = new URL(url)
  return parsedUrl.pathname.replace(/^\/+/, '')
}

function extractLegacyOrganizationLogoPath(url: string): string | null {
  const urlParts = url.split(`${LEGACY_ORG_LOGO_BUCKET}/`)
  return urlParts.length < 2 ? null : urlParts[1]
}

async function deleteOrganizationLogoAsset(
  supabase: SupabaseClient,
  organizationId: string,
  imageUrl?: string | null,
): Promise<void> {
  if (imageUrl) {
    const storagePath = extractStoragePathFromUrl(imageUrl)

    if (
      storagePath.startsWith(`organizations/${organizationId}/`) &&
      BUNNY_STORAGE_ZONE &&
      BUNNY_STORAGE_API_KEY
    ) {
      const deleteRes = await fetch(`${BUNNY_STORAGE_BASE}/${storagePath}`, {
        method: 'DELETE',
        headers: {
          AccessKey: BUNNY_STORAGE_API_KEY,
        },
      })

      if (!deleteRes.ok) {
        const errorText = await deleteRes.text()
        logError(
          'organization.deleted',
          'Failed to delete Bunny organization logo',
          { organizationId, status: deleteRes.status, errorText },
        )
      }

      return
    }

    const legacyPath = extractLegacyOrganizationLogoPath(imageUrl)
    if (legacyPath) {
      const { error } = await supabase.storage
        .from(LEGACY_ORG_LOGO_BUCKET)
        .remove([legacyPath])

      if (error) {
        logError(
          'organization.deleted',
          'Failed to delete legacy organization logo from Supabase Storage',
          { organizationId, error: error.message },
        )
      }

      return
    }
  }

  const { error } = await supabase.storage
    .from(LEGACY_ORG_LOGO_BUCKET)
    .remove([`${organizationId}.png`])

  if (error) {
    logError(
      'organization.deleted',
      'Failed to delete default legacy organization logo from Supabase Storage',
      { organizationId, error: error.message },
    )
  }
}

// ============================================================================
// MERCHANT RESOLUTION HELPERS
// ============================================================================

/**
 * Resolve a Supabase merchants.id from a Clerk organization_id.
 * Returns null if the merchant row hasn't been created yet (race with
 * organization.created webhook) or if the org isn't actually a merchant.
 */
async function resolveMerchantIdByClerkOrgId(
  supabase: SupabaseClient,
  organizationId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('merchants')
    .select('id')
    .eq('clerk_org_id', organizationId)
    .maybeSingle()

  if (error) {
    console.error('[resolveMerchantIdByClerkOrgId] lookup failed', error)
    return null
  }

  return data?.id ?? null
}

// ============================================================================
// USER OPERATIONS
// ============================================================================

async function ensureUserExists(
  supabase: SupabaseClient,
  userId: string,
  userData: {
    firstName?: string
    lastName?: string
    email?: string
    avatarUrl?: string
  },
  updatedAt: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('users')
    .upsert({
      id: userId,
      first_name: userData.firstName || '',
      last_name: userData.lastName || '',
      email: userData.email || '',
      avatar_url: userData.avatarUrl || null,
      updated_at: updatedAt
    }, { onConflict: 'id' })

  if (error) {
    return { success: false, error: error.message }
  }
  return { success: true }
}

async function createOrUpdateMember(
  supabase: SupabaseClient,
  memberData: {
    id: string
    userId: string
    organizationId: string
    role?: string
    staffProfileId?: string
    createdAt: string
    updatedAt: string
  }
): Promise<{ success: boolean; data?: any; error?: string }> {
  const { data, error } = await supabase
    .from('members')
    .upsert({
      id: memberData.id,
      user_id: memberData.userId,
      organization_id: memberData.organizationId,
      role: memberData.role,
      staff_profile_id: memberData.staffProfileId,
      created_at: memberData.createdAt,
      updated_at: memberData.updatedAt,
    })
    .select()
    .single()

  if (error) {
    return { success: false, error: error.message }
  }
  return { success: true, data }
}

// ============================================================================
// HQ ADMIN OPERATIONS
// ============================================================================

async function createAdminMerchantAccessRecords(
  supabase: SupabaseClient,
  adminUserId: string,
  merchantAccess: MerchantAccessAssignment[],
  grantedBy?: string
): Promise<{ success: boolean; count: number; error?: string }> {
  if (!merchantAccess || merchantAccess.length === 0) {
    return { success: true, count: 0 }
  }

  // Note: access_level is deprecated - role determines actual permissions
  // We default to 'full' since granular access is controlled by role
  const accessRecords = merchantAccess.map(access => ({
    admin_user_id: adminUserId,
    merchant_id: access.merchantId,
    granted_by: grantedBy,
    granted_at: new Date().toISOString(),
    is_active: true,
  }))

  logEvent('createAdminMerchantAccess', 'Inserting merchant access records', {
    adminUserId,
    count: accessRecords.length,
    merchantIds: accessRecords.map(r => r.merchant_id),
  })

  const { error } = await supabase
    .from('admin_merchant_access')
    .upsert(accessRecords, { onConflict: 'admin_user_id,merchant_id' })

  if (error) {
    logEvent('createAdminMerchantAccess', 'Insert failed', { error: error.message })
    return { success: false, count: 0, error: error.message }
  }
  return { success: true, count: accessRecords.length }
}

async function getPendingAdminInvite(
  supabase: SupabaseClient,
  organizationId: string,
  email: string,
  requirePending: boolean = false
): Promise<{ data: any | null; error?: string }> {
  let query = supabase
    .from('pending_org_admin_invites')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('email', email)
  
  if (requirePending) {
    query = query.eq('status', 'pending')
  }
  
  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
    return { data: null, error: error.message }
  }
  return { data }
}

async function updatePendingInviteStatus(
  supabase: SupabaseClient,
  inviteId: string,
  status: string,
  clerkUserId: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('pending_org_admin_invites')
    .update({
      status,
      accepted_at: new Date().toISOString(),
      clerk_user_id: clerkUserId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', inviteId)

  if (error) {
    return { success: false, error: error.message }
  }
  return { success: true }
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

async function handleUserCreated(ctx: WebhookContext): Promise<Response> {
  const { supabase, clerkClient, event } = ctx
  const eventType = 'user.created'

  logEvent(eventType, 'Processing user creation', { userId: event.data.id })

  // Create user record
  const { data: user, error } = await supabase
    .from('users')
    .upsert([{
      id: event.data.id,
      first_name: event.data.first_name || '',
      last_name: event.data.last_name || '',
      avatar_url: event.data.image_url,
      email: event.data.email_addresses?.[0]?.email_address || '',
      public_metadata: event.data.public_metadata || {},
      created_at: new Date(event.data.created_at).toISOString(),
      updated_at: new Date(event.data.updated_at).toISOString(),
    }], { onConflict: 'id' })

  if (error) {
    logError(eventType, 'Failed to create user', error)
    return errorResponse(error.message, 500)
  }

  logEvent(eventType, 'User created successfully', { userId: event.data.id })

  // For direct/upgrade flows the server action handles everything —
  // skip the pending-invite logic to avoid redundant work or errors.
  const creationType = event.data.public_metadata?.creationType
  if (creationType === 'direct' || creationType === 'upgrade') {
    logEvent(eventType, 'Direct/upgrade creation — skipping pending invite flow', { userId: event.data.id, creationType })
    return successResponse({ user }, 'User created (server action handles membership)')
  }

  // Check if this user was invited to an organization
  const organizationId = event.data.public_metadata?.organizationId
  if (!organizationId) {
    return successResponse({ user }, 'User created without organization')
  }

  // Look for pending admin invite
  const email = event.data.email_addresses?.[0]?.email_address
  const { data: pendingInvite, error: inviteError } = await getPendingAdminInvite(
    supabase,
    organizationId,
    email
  )

  if (inviteError) {
    logError(eventType, 'Error checking pending invite', inviteError)
  }

  if (pendingInvite) {
    logEvent(eventType, 'Found pending admin invite, creating org membership', { inviteId: pendingInvite.id })

    try {
      // Create Clerk organization membership
      await clerkClient.organizations.createOrganizationMembership({
        organizationId: organizationId,
        userId: event.data.id,
        role: `org:${event.data.public_metadata?.level_type || 'member'}`
      })

      // Update invite status
      await updatePendingInviteStatus(supabase, pendingInvite.id, 'accepted', event.data.id)

      logEvent(eventType, 'Org membership created and invite updated', { userId: event.data.id })
    } catch (err: any) {
      // Non-fatal: the users row is already written. Returning 500 would cause Clerk
      // to retry the entire webhook, re-upserting the users row each time while the
      // membership creation keeps failing — leaving an orphaned user that never
      // gets cleaned up if the Clerk user is later deleted during rollback.
      logError(eventType, 'Failed to create org membership (non-fatal, users row saved)', err)
    }
  }

  return successResponse({ user }, 'User created successfully')
}

async function handleUserUpdated(ctx: WebhookContext): Promise<Response> {
  const { supabase, event } = ctx
  const eventType = 'user.updated'

  logEvent(eventType, 'Processing user update', { userId: event.data.id })

  const firstName = event.data.first_name || ''
  const lastName = event.data.last_name || ''
  const email = event.data.email_addresses?.[0]?.email_address || ''
  const displayName = `${firstName} ${lastName}`.trim()

  const { data: user, error } = await supabase
    .from('users')
    .update({
      first_name: firstName,
      last_name: lastName,
      email,
      avatar_url: event.data.image_url,
      public_metadata: event.data.public_metadata || {},
      updated_at: new Date(event.data.updated_at).toISOString(),
    })
    .eq('id', event.data.id)
    .select()
    .single()

  if (error) {
    logError(eventType, 'Failed to update user', error)
    return errorResponse(error.message, 500)
  }

  // Also sync changes to staff_profiles if one is linked to this user
  const { error: spError } = await supabase
    .from('staff_profiles')
    .update({
      first_name: firstName,
      last_name: lastName,
      email,
      display_name: displayName,
      updated_at: new Date(event.data.updated_at).toISOString(),
    })
    .eq('user_id', event.data.id)

  if (spError) {
    logError(eventType, 'Failed to sync staff_profiles (non-fatal)', spError)
    // Non-fatal — users table is already updated
  }

  logEvent(eventType, 'User updated successfully', { userId: event.data.id })
  return successResponse({ user }, 'User updated successfully')
}

async function handleUserDeleted(ctx: WebhookContext): Promise<Response> {
  const { supabase, event } = ctx
  const eventType = 'user.deleted'

  logEvent(eventType, 'Processing user deletion', { userId: event.data.id })

  const { data, error } = await supabase
    .from('users')
    .delete()
    .eq('id', event.data.id)
    .select()
    .maybeSingle()

  if (error) {
    logError(eventType, 'Failed to delete user', error)
    return errorResponse(error.message, 500)
  }

  if (!data) {
    logEvent(eventType, 'User row not found (already deleted or never created), no-op', { userId: event.data.id })
    return successResponse({ data: null }, 'User already removed')
  }

  logEvent(eventType, 'User deleted successfully', { userId: event.data.id })
  return successResponse({ data }, 'User deleted successfully')
}

async function handleOrganizationCreated(ctx: WebhookContext): Promise<Response> {
  const { supabase, event } = ctx
  const eventType = 'organization.created'

  logEvent(eventType, 'Processing organization creation', { orgId: event.data.id })

  // Create organization record
  const { data, error } = await supabase
    .from('organizations')
    .insert([{
      id: event.data.id,
      name: event.data.name,
      created_at: new Date(event.data.created_at).toISOString(),
      updated_at: new Date(event.data.updated_at).toISOString(),
      public_metadata: event.data.public_metadata || {},
    }])
    .select()
    .single()

  if (error) {
    logError(eventType, 'Failed to create organization', error)
    return errorResponse(error.message, 500)
  }

  // Create carrier if org_type is 'carrier'
  if (event.data.public_metadata?.org_type === 'carrier') {
    const { error: carrierError } = await supabase
      .from('carriers')
      .insert([{
        name: event.data.name,
        clerk_org_id: event.data.id,
        public_metadata: event.data.public_metadata,
        created_at: new Date(event.data.created_at).toISOString(),
        updated_at: new Date(event.data.updated_at).toISOString(),
      }])

    if (carrierError) {
      logError(eventType, 'Failed to create carrier record', carrierError)
    } else {
      logEvent(eventType, 'Carrier record created', { orgId: event.data.id })
    }
  }

  // Create merchant if org_type is 'merchant'
  if (event.data.public_metadata?.org_type === 'merchant') {
    const meta = event.data.public_metadata
    const { error: merchantError } = await supabase
      .from('merchants')
      .insert([{
        name: event.data.name,
        clerk_org_id: event.data.id,
        carrier_id: meta.carrierId || null,
        public_metadata: meta,
        type: meta.merchant_type,
        business_legal_name: meta.business_legal_name || event.data.name,
        dba_name: meta.dba_name || null,
        business_type: meta.merchant_type || null,
        ein_last_four: meta.ein_last_four || null,
        owner_first_name: meta.owner_first_name || null,
        owner_last_name: meta.owner_last_name || null,
        owner_email: meta.owner_email || null,
        owner_phone: meta.owner_phone || null,
        business_address_line1: meta.business_address_line1 || null,
        business_address_line2: meta.business_address_line2 || null,
        business_city: meta.business_city || null,
        business_state: meta.business_state || null,
        business_postal_code: meta.business_postal_code || null,
        business_country: meta.business_country || 'US',
        onboarding_status: meta.onboarding_status || 'onboarding',
        created_at: new Date(event.data.created_at).toISOString(),
        updated_at: new Date(event.data.updated_at).toISOString(),
      }])

    if (merchantError) {
      logError(eventType, 'Failed to create merchant record', merchantError)
    } else {
      logEvent(eventType, 'Merchant record created', { orgId: event.data.id })
    }
  }

  logEvent(eventType, 'Organization created successfully', { orgId: event.data.id })
  return successResponse({ data }, 'Organization created successfully')
}

async function handleOrganizationUpdated(ctx: WebhookContext): Promise<Response> {
  const { supabase, event } = ctx
  const eventType = 'organization.updated'

  logEvent(eventType, 'Processing organization update', { orgId: event.data.id })

  const { data, error } = await supabase
    .from('organizations')
    .update({
      name: event.data.name,
      imageURL: event.data.public_metadata?.imageURL,
      public_metadata: event.data.public_metadata || {},
      updated_at: new Date(event.data.updated_at).toISOString(),
    })
    .eq('id', event.data.id)
    .select()
    .single()

  if (error) {
    logError(eventType, 'Failed to update organization', error)
    return errorResponse(error.message, 500)
  }

  // Update carrier if org_type is 'carrier'
  if (event.data.public_metadata?.org_type === 'carrier') {
    const { error: carrierError } = await supabase
      .from('carriers')
      .update({
        name: event.data.name,
        updated_at: new Date(event.data.updated_at).toISOString(),
      })
      .eq('clerk_org_id', event.data.id)

    if (carrierError) {
      logError(eventType, 'Failed to update carrier record (non-fatal)', carrierError)
    }
  }

  // Update merchant if org_type is 'merchant'
  if (event.data.public_metadata?.org_type === 'merchant') {
    const { error: merchantError } = await supabase
      .from('merchants')
      .update({
        name: event.data.name,
        public_metadata: event.data.public_metadata,
        updated_at: new Date(event.data.updated_at).toISOString(),
      })
      .eq('clerk_org_id', event.data.id)

    if (merchantError) {
      logError(eventType, 'Failed to update merchant record (non-fatal)', merchantError)
    }
  }

  logEvent(eventType, 'Organization updated successfully', { orgId: event.data.id })
  return successResponse({ data }, 'Organization updated successfully')
}

async function handleOrganizationDeleted(ctx: WebhookContext): Promise<Response> {
  const { supabase, event } = ctx
  const eventType = 'organization.deleted'

  logEvent(eventType, 'Processing organization deletion', { orgId: event.data.id })

  const { data, error } = await supabase
    .from('organizations')
    .delete()
    .eq('id', event.data.id)

  if (error) {
    logError(eventType, 'Failed to delete organization', error)
    return errorResponse(error.message, 500)
  }

  await deleteOrganizationLogoAsset(
    supabase,
    event.data.id,
    event.data.public_metadata?.imageURL,
  )

  logEvent(eventType, 'Organization deleted successfully', { orgId: event.data.id })
  return successResponse({ data }, 'Organization deleted successfully')
}

async function handleHQAdminMembershipCreated(
  ctx: WebhookContext,
  userId: string,
  organizationId: string,
  userMetadata: any,
  createdAt: string,
  updatedAt: string
): Promise<Response> {
  const { supabase, event } = ctx
  const eventType = 'organizationMembership.created:HQ'

  const roleCode = userMetadata?.role || 'hq.manager'

  logEvent(eventType, 'Processing HQ admin membership', { userId, organizationId, roleCode })

  // Create member record - role is stored here, get_my_hq_role() reads from members table
  const memberResult = await createOrUpdateMember(supabase, {
    id: event.data.id,
    userId,
    organizationId,
    role: roleCode,
    createdAt,
    updatedAt,
  })

  if (!memberResult.success) {
    logError(eventType, 'Failed to create member record', memberResult.error)
    return errorResponse(memberResult.error || 'Failed to create member', 500)
  }

  logEvent(eventType, 'Member record created', { memberId: memberResult.data?.id, roleCode })

  // Look for pending invite to get merchant access assignments
  const email = event.data.public_user_data?.identifier
  if (email) {
    const { data: pendingInvite } = await getPendingAdminInvite(supabase, organizationId, email)

    if (pendingInvite?.merchant_access && Array.isArray(pendingInvite.merchant_access)) {
      logEvent(eventType, 'Found merchant access assignments', { 
        count: pendingInvite.merchant_access.length 
      })

      const accessResult = await createAdminMerchantAccessRecords(
        supabase,
        userId,
        pendingInvite.merchant_access,
        pendingInvite.invited_by
      )

      if (!accessResult.success) {
        logError(eventType, 'Failed to create merchant access records', accessResult.error)
      } else {
        logEvent(eventType, 'Created merchant access records', { count: accessResult.count })
      }

      // Update invite status
      await updatePendingInviteStatus(supabase, pendingInvite.id, 'accepted', userId)
    }
  }

  return successResponse({ member_id: memberResult.data?.id }, 'HQ admin membership created')
}

async function handleMerchantMembershipCreated(
  ctx: WebhookContext,
  userId: string,
  organizationId: string,
  merchantId: string,
  userMetadata: any,
  createdAt: string,
  updatedAt: string,
  clerkUser?: any
): Promise<Response> {
  const { supabase, clerkClient, event } = ctx
  const eventType = 'organizationMembership.created:Merchant'

  logEvent(eventType, 'Processing merchant membership', { userId, merchantId })

  // ──────────────────────────────────────────────────────────────────────────
  // EARLY-EXIT: If records already exist (server action wrote them eagerly),
  // return 200 immediately. This check is unconditional — it doesn't depend
  // on metadata which may be empty due to race conditions.
  // ──────────────────────────────────────────────────────────────────────────
  const { data: existingMember } = await supabase
    .from('members')
    .select('id, staff_profile_id, role')
    .eq('user_id', userId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (existingMember) {
    // Verify location_members were also created — if member row exists but
    // location assignments are missing, we should NOT early-exit.
    const { count: locMemberCount } = await supabase
      .from('location_members')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('merchant_id', merchantId)

    if (locMemberCount) {
      logEvent(eventType, 'Records already exist (eagerly provisioned by server action), no-op', {
        userId, memberId: existingMember.id, staffProfileId: existingMember.staff_profile_id,
        locationMemberCount: locMemberCount,
      })
      return successResponse(
        { member_id: existingMember.id, early_exit: true },
        'Membership already provisioned'
      )
    }

    logEvent(eventType, 'Member exists but location_members missing — continuing to provision', {
      userId, memberId: existingMember.id,
    })
  }

  // Determine role and creation type up-front (used in both paths)
  const roleCode =
    event.data?.public_metadata?.roleCode ||
    userMetadata?.roleCode ||
    'staff'

  const creationType =
    event.data?.public_metadata?.creationType ||
    userMetadata?.creationType ||
    'invitation'
  const isDirectCreation = creationType === 'direct' || creationType === 'upgrade'

  // ──────────────────────────────────────────────────────────────────────────
  // INSUFFICIENT DATA GUARD: If metadata is empty (both getUser() and
  // membership metadata failed) AND no early-exit triggered, we can't
  // determine the correct role. Return 500 so Clerk retries — by then
  // the user will be available in Clerk's API.
  // ──────────────────────────────────────────────────────────────────────────
  const hasMetadata = !!(
    event.data?.public_metadata?.roleCode ||
    userMetadata?.roleCode ||
    event.data?.public_metadata?.locationAssignments ||
    userMetadata?.locationAssignments
  )

  if (!hasMetadata && !clerkUser) {
    logEvent(eventType, 'Insufficient metadata and user unavailable — returning 500 for retry', {
      userId, merchantId,
      membershipMetadata: event.data?.public_metadata,
    })
    return errorResponse(
      'User data not yet available (Clerk eventual consistency) — retry expected',
      500
    )
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PROMOTION PATH: POS-only staff being upgraded to a Clerk account.
  // The invite/direct-creation call embeds the existing staffProfileId in
  // publicMetadata so we know to UPDATE existing rows rather than INSERT new.
  // ──────────────────────────────────────────────────────────────────────────
  const promotionStaffProfileId: string | undefined =
    event.data?.public_metadata?.staffProfileId ||
    event.data?.public_metadata?.upgradedFromStaffProfileId ||
    userMetadata?.staffProfileId ||
    userMetadata?.upgradedFromStaffProfileId

  if (promotionStaffProfileId) {
    logEvent(eventType, 'PROMOTION PATH — updating existing POS staff to Clerk user', {
      staffProfileId: promotionStaffProfileId,
      userId,
      roleCode,
    })

    // 0. Snapshot original location_members role codes for rollback
    const { data: originalLocMembers } = await supabase
      .from('location_members')
      .select('id, role_code')
      .eq('staff_profile_id', promotionStaffProfileId)

    // 1. Update staff_profiles: link to Clerk user and flip account_type
    const { error: profileUpdateError } = await supabase
      .from('staff_profiles')
      .update({
        user_id: userId,
        account_type: 'clerk',
        updated_at: updatedAt,
      })
      .eq('id', promotionStaffProfileId)
      .eq('merchant_id', merchantId)

    if (profileUpdateError) {
      logError(eventType, 'Promotion: failed to update staff_profile', profileUpdateError)
      return errorResponse(profileUpdateError.message, 500)
    }

    // 2. Update location_members: link user_id and set new role
    const { error: locMembersUpdateError } = await supabase
      .from('location_members')
      .update({
        user_id: userId,
        role_code: roleCode,
        updated_at: updatedAt,
      })
      .eq('staff_profile_id', promotionStaffProfileId)

    if (locMembersUpdateError) {
      logError(eventType, 'Promotion: failed to update location_members, rolling back staff_profile', locMembersUpdateError)
      // Rollback step 1: revert staff_profiles to POS-only state
      await supabase
        .from('staff_profiles')
        .update({ user_id: null, account_type: 'pos_only', updated_at: updatedAt })
        .eq('id', promotionStaffProfileId)
        .eq('merchant_id', merchantId)
      return errorResponse(locMembersUpdateError.message, 500)
    }

    // 3. Update the existing POS members row to link the Clerk user_id.
    //    Uses .eq('staff_profile_id') so it is idempotent on webhook retries.
    const { error: memberUpdateError } = await supabase
      .from('members')
      .update({
        user_id: userId,
        role: roleCode,
        updated_at: updatedAt,
      })
      .eq('staff_profile_id', promotionStaffProfileId)
      .eq('organization_id', organizationId)

    if (memberUpdateError) {
      logError(eventType, 'Promotion: failed to update members, rolling back', memberUpdateError)
      // Rollback steps 1+2: revert staff_profiles and location_members
      await supabase
        .from('staff_profiles')
        .update({ user_id: null, account_type: 'pos_only', updated_at: updatedAt })
        .eq('id', promotionStaffProfileId)
        .eq('merchant_id', merchantId)
      // Restore each location_member's original role_code
      if (originalLocMembers?.length) {
        await Promise.all(originalLocMembers.map((lm: any) =>
          supabase
            .from('location_members')
            .update({ user_id: null, role_code: lm.role_code, updated_at: updatedAt })
            .eq('id', lm.id)
        ))
      }
      return errorResponse(memberUpdateError.message, 500)
    }

    logEvent(eventType, 'Promotion complete', { staffProfileId: promotionStaffProfileId, userId })
    return successResponse({ promoted: true, staff_profile_id: promotionStaffProfileId }, 'POS staff promoted to Clerk user')
  }

  // ──────────────────────────────────────────────────────────────────────────
  // NEW USER PATH (invitation or direct creation — no existing POS profile)
  // ──────────────────────────────────────────────────────────────────────────

  // Use pre-fetched user, or try again with retries
  let user = clerkUser
  if (!user) {
    user = await safeGetUser(clerkClient, userId, {
      retries: isDirectCreation ? 1 : 3,
      baseDelayMs: 500,
    })
  }

  // Build fallback from event data (always available)
  const publicUserData = event.data?.public_user_data
  const firstName = user?.firstName || publicUserData?.first_name || userMetadata?.firstName || ''
  const lastName = user?.lastName || publicUserData?.last_name || userMetadata?.lastName || ''
  const userEmail = user?.emailAddresses?.[0]?.emailAddress || publicUserData?.identifier || userMetadata?.email || ''
  const phone = userMetadata?.phone || null

  // Get location assignments
  const rawLocationAssignments: any[] =
    event.data?.public_metadata?.locationAssignments ||
    userMetadata?.locationAssignments ||
    []

  // For owner / admin roles, expand to ALL merchant locations so that
  // every existing and future location is covered — even if the server
  // action already wrote them eagerly, any gaps are filled here.
  const ADMIN_ROLE_CODES = ['merchant.owner', 'merchant.admin']
  let locationAssignments = rawLocationAssignments
  if (ADMIN_ROLE_CODES.includes(roleCode) && merchantId) {
    const { data: allLocs } = await supabase
      .from('locations')
      .select('id')
      .eq('merchant_id', merchantId)

    if (allLocs && allLocs.length > 0) {
      const existingLocIds = new Set(rawLocationAssignments.map((a: any) => a.locationId))
      const additionalLocs = allLocs
        .filter((l: any) => !existingLocIds.has(l.id))
        .map((l: any) => ({ locationId: l.id, roleCode, isPrimaryLocation: false }))
      locationAssignments = [...rawLocationAssignments, ...additionalLocs]
      logEvent(eventType, 'Admin role — expanded location assignments', {
        roleCode,
        original: rawLocationAssignments.length,
        expanded: locationAssignments.length,
      })
    }
  }

  // Get or create staff profile
  let staffProfile
  const { data: existingProfile } = await supabase
    .from('staff_profiles')
    .select('id')
    .eq('user_id', userId)
    .eq('merchant_id', merchantId)
    .maybeSingle()

  if (existingProfile) {
    staffProfile = existingProfile
    logEvent(eventType, 'Using existing staff profile', { profileId: staffProfile.id })
  } else {
    const { data: newProfile, error: profileError } = await supabase
      .from('staff_profiles')
      .insert({
        merchant_id: merchantId,
        user_id: userId,
        first_name: firstName,
        last_name: lastName,
        email: userEmail,
        phone: phone,
        public_metadata: userMetadata,
        account_type: 'clerk',
        is_active: true,
      })
      .select()
      .single()

    if (profileError) {
      // Handle race condition: another webhook may have inserted the same profile concurrently
      if (profileError.code === '23505') {
        logEvent(eventType, 'Staff profile already created (concurrent webhook), fetching existing', { userId, merchantId })
        const { data: reFetched } = await supabase
          .from('staff_profiles')
          .select('id')
          .eq('user_id', userId)
          .eq('merchant_id', merchantId)
          .maybeSingle()

        if (reFetched) {
          staffProfile = reFetched
        } else {
          logError(eventType, 'Failed to create staff profile and re-fetch failed', profileError)
          return errorResponse(profileError.message, 500)
        }
      } else {
        logError(eventType, 'Failed to create staff profile', profileError)
        return errorResponse(profileError.message, 500)
      }
    } else {
      staffProfile = newProfile
      logEvent(eventType, 'Created new staff profile', { profileId: staffProfile.id })
    }
  }

  // Create member record
  const memberResult = await createOrUpdateMember(supabase, {
    id: event.data.id,
    userId,
    organizationId,
    staffProfileId: staffProfile.id,
    role: roleCode,
    createdAt,
    updatedAt,
  })

  if (!memberResult.success) {
    logError(eventType, 'Failed to create member record', memberResult.error)
    return errorResponse(memberResult.error || 'Failed to create member', 500)
  }

  // Create location_members records — skip any that already exist (server action may have
  // written them eagerly before this webhook fired)
  if (locationAssignments && locationAssignments.length > 0) {
    const locationMembersData = locationAssignments.map((assignment: any) => ({
      location_id: assignment.locationId,
      merchant_id: merchantId,
      user_id: userId,
      staff_profile_id: staffProfile.id,
      role_code: assignment.roleCode || roleCode,
      is_primary_location: assignment.isPrimaryLocation || false,
      is_active: true,
      hourly_rate: assignment.hourlyRate || null,
      employment_type: assignment.employmentType || null,
      pin_plain: assignment.pinCode || null,
      pin_hashed: null,
      pin_code: assignment.pinCode || null,
      assigned_at: createdAt,
      updated_at: updatedAt,
    }))

    // Fetch which location assignments already exist to avoid duplicate-key errors
    const { data: existingAssignments } = await supabase
      .from('location_members')
      .select('location_id')
      .eq('user_id', userId)

    const existingLocationIds = new Set(
      (existingAssignments || []).map((row: any) => row.location_id)
    )

    const newAssignments = locationMembersData.filter(
      (row: any) => !existingLocationIds.has(row.location_id)
    )

    if (newAssignments.length > 0) {
      const { error: locationMembersError } = await supabase
        .from('location_members')
        .insert(newAssignments)

      if (locationMembersError) {
        // Handle race condition: another webhook may have inserted the same rows concurrently
        if (locationMembersError.code === '23505') {
          logEvent(eventType, 'Location members already exist (concurrent insert), treating as success', {
            count: newAssignments.length,
          })
        } else {
          logError(eventType, 'Failed to create location members', locationMembersError)
          return errorResponse(locationMembersError.message, 500)
        }
      } else {
        logEvent(eventType, 'Created location members', { count: newAssignments.length })
      }
    } else {
      logEvent(eventType, 'Location members already exist, skipping insert (idempotent)', {
        skipped: locationMembersData.length,
      })
    }
  }

  // Update location_invites if this was from an invitation
  if (!isDirectCreation) {
    await supabase
      .from('location_invites')
      .update({
        status: 'accepted',
        accepted_at: createdAt,
        accepted_by_user_id: userId,
      })
      .eq('email', userEmail)
      .eq('status', 'pending')
      .eq('merchant_id', merchantId)

    logEvent(eventType, 'Updated location invites for invitation flow')
  }

  return successResponse({ member_id: memberResult.data?.id }, 'Merchant membership created')
}

async function handleOrganizationMembershipCreated(ctx: WebhookContext): Promise<Response> {
  const { supabase, clerkClient, event } = ctx
  const eventType = 'organizationMembership.created'

  const userId = event.data.public_user_data?.user_id
  const organizationId = event.data.organization?.id
  const createdAt = new Date(event.data.created_at).toISOString()
  const updatedAt = new Date(event.data.updated_at).toISOString()

  logEvent(eventType, 'Processing membership creation', { userId, organizationId })

  try {
    // Ensure user exists first (prevents FK errors)
    // Use data from the event itself - this handles race conditions where user.created fires later
    const userData = event.data.public_user_data
    const userEnsureResult = await ensureUserExists(supabase, userId, {
      firstName: userData?.first_name,
      lastName: userData?.last_name,
      email: userData?.identifier,
      avatarUrl: userData?.image_url,
    }, updatedAt)

    if (!userEnsureResult.success) {
      logError(eventType, 'Failed to ensure user exists', userEnsureResult.error)
    }

    // RACE-CONDITION SAFE: Use membership's public_metadata directly
    // For invited users, the role/metadata is on the membership event, NOT the user
    // For manually added users, we fall back to user's publicMetadata
    const membershipMetadata = event.data.public_metadata || {}
    
    // Only fetch user metadata as fallback (may be empty for invited users)
    let userMetadata: any = {}
    let fetchedUser: any = null
    const clerkUser = await safeGetUser(clerkClient, userId)
    if (clerkUser) {
      fetchedUser = clerkUser
      userMetadata = clerkUser.publicMetadata || {}
    } else {
      logEvent(eventType, 'Could not fetch user (race condition), will use event data', { userId })
    }

    // Merge metadata: membership metadata takes priority (contains invite data)
    const effectiveMetadata = {
      ...userMetadata,
      ...membershipMetadata,
    }

    logEvent(eventType, 'Effective metadata', { 
      membershipMetadata, 
      userMetadata, 
      effectiveMetadata,
      role: effectiveMetadata?.role 
    })

    // Determine merchant ID — prefer metadata, fall back to clerk_org_id lookup.
    // The fallback covers owner-invite flows (createMerchantOnboarding doesn't
    // embed merchantId because the Supabase UUID doesn't exist at invite time)
    // and any other path that forgets to pass merchantId.
    let merchantId: string | undefined = effectiveMetadata?.merchantId

    if (!merchantId) {
      // Try resolving from the merchants table via clerk_org_id.
      const resolved = await resolveMerchantIdByClerkOrgId(supabase, organizationId)
      if (resolved) {
        merchantId = resolved
        logEvent(eventType, 'Resolved merchantId via clerk_org_id fallback', {
          organizationId,
          merchantId,
        })
      }
    }

    // Still no merchantId — check if this is an HQ admin membership
    if (!merchantId) {
      const isHQOrg = organizationId === DEXA_HQ_ORG_ID

      if (isHQOrg) {
        return await handleHQAdminMembershipCreated(
          ctx, userId, organizationId, effectiveMetadata, createdAt, updatedAt
        )
      }

      // Neither metadata, DB lookup, nor HQ match. Most likely cause: the
      // organization.created webhook for this org hasn't finished writing the
      // merchants row yet. Return 500 so Clerk retries (exponential backoff ~24h).
      logError(eventType, 'Could not resolve merchantId — merchant row may not exist yet', {
        organizationId,
        effectiveMetadata,
      })
      return errorResponse(
        'merchantId not resolvable (retry expected)',
        500
      )
    }

    // Handle merchant membership
    return await handleMerchantMembershipCreated(
      ctx, userId, organizationId, merchantId, effectiveMetadata, createdAt, updatedAt, fetchedUser
    )

  } catch (error: any) {
    logError(eventType, 'Unexpected error', error)
    return errorResponse(error.message || 'Unexpected error', 500)
  }
}

async function handleOrganizationMembershipUpdated(ctx: WebhookContext): Promise<Response> {
  const { supabase, event } = ctx
  const eventType = 'organizationMembership.updated'

  const userId = event.data.public_user_data?.user_id
  const organizationId = event.data.organization?.id

  logEvent(eventType, 'Processing membership update', { membershipId: event.data.id, userId, organizationId })

  // Only use our explicit roleCode from public_metadata — Clerk's org:admin/org:member
  // is too coarse to map reliably (e.g. both merchant.owner and merchant.admin are org:admin)
  const roleCode: string | null = event.data.public_metadata?.roleCode || null

  logEvent(eventType, 'Role resolved', {
    clerkRole: event.data.role,
    metadataRoleCode: roleCode,
  })

  const updatePayload: Record<string, any> = {
    user_id: userId,
    organization_id: organizationId,
    updated_at: new Date(event.data.updated_at).toISOString(),
  }

  if (roleCode) {
    updatePayload.role = roleCode
  }

  const { data, error } = await supabase
    .from('members')
    .update(updatePayload)
    .eq('id', event.data.id)
    .select()
    .single()

  if (error) {
    logError(eventType, 'Failed to update membership', error)
    return errorResponse(error.message, 500)
  }

  // Sync role to location_members if role changed
  if (roleCode && userId && organizationId) {
    // Resolve merchant to scope location_members update
    const merchantId = await resolveMerchantIdByClerkOrgId(supabase, organizationId)

    if (merchantId) {
      const { error: locError } = await supabase
        .from('location_members')
        .update({
          role_code: roleCode,
          updated_at: new Date(event.data.updated_at).toISOString(),
        })
        .eq('user_id', userId)
        .eq('merchant_id', merchantId)

      if (locError) {
        logError(eventType, 'Failed to sync role to location_members (non-fatal)', locError)
      } else {
        logEvent(eventType, 'Synced role to location_members', { userId, merchantId, roleCode })
      }
    }
  }

  logEvent(eventType, 'Membership updated successfully', { membershipId: event.data.id, roleCode })
  return successResponse({ data }, 'Membership updated successfully')
}

async function handleOrganizationMembershipDeleted(ctx: WebhookContext): Promise<Response> {
  const { supabase, event } = ctx
  const eventType = 'organizationMembership.deleted'

  const userId = event.data.public_user_data?.user_id
  const organizationId = event.data.organization?.id

  logEvent(eventType, 'Processing membership deletion', { userId, organizationId })

  if (!userId || !organizationId) {
    logError(eventType, 'Missing userId or organizationId', { userId, organizationId })
    return errorResponse('Missing userId or organizationId in event data', 400)
  }

  // 1. Find the member row for this user + org
  const { data: member, error: memberFetchError } = await supabase
    .from('members')
    .select('id, staff_profile_id')
    .eq('user_id', userId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (memberFetchError) {
    logError(eventType, 'Failed to fetch member record', memberFetchError)
    return errorResponse(memberFetchError.message, 500)
  }

  if (!member) {
    logEvent(eventType, 'No member row found (already deleted or never created), no-op', { userId, organizationId })
    return successResponse({ userId, organizationId }, 'No member found — already cleaned up')
  }

  // 2. Resolve merchant to scope location_members deactivation
  const merchantId = await resolveMerchantIdByClerkOrgId(supabase, organizationId)

  // 3+4. Deactivate location_members and staff_profiles in parallel (independent ops)
  const now = new Date().toISOString()
  const deactivations: Promise<any>[] = []

  if (merchantId) {
    deactivations.push(
      supabase
        .from('location_members')
        .update({ is_active: false, updated_at: now })
        .eq('user_id', userId)
        .eq('merchant_id', merchantId)
        .then(({ error }) => {
          if (error) logError(eventType, 'Failed to deactivate location_members (non-fatal)', error)
          else logEvent(eventType, 'Deactivated location_members', { userId, merchantId })
        })
    )
  }

  if (member.staff_profile_id) {
    deactivations.push(
      supabase
        .from('staff_profiles')
        .update({ is_active: false, updated_at: now })
        .eq('id', member.staff_profile_id)
        .then(({ error }) => {
          if (error) logError(eventType, 'Failed to deactivate staff_profile (non-fatal)', error)
          else logEvent(eventType, 'Deactivated staff_profile', { staffProfileId: member.staff_profile_id })
        })
    )
  }

  await Promise.all(deactivations)

  // 5. Delete the member row (hard delete — Clerk membership is gone)
  const { error: memberDeleteError } = await supabase
    .from('members')
    .delete()
    .eq('id', member.id)

  if (memberDeleteError) {
    logError(eventType, 'Failed to delete member record', memberDeleteError)
    return errorResponse(memberDeleteError.message, 500)
  }

  logEvent(eventType, 'Membership deletion processed', { userId, organizationId, memberId: member.id })
  return successResponse({ memberId: member.id }, 'Membership deleted and related records deactivated')
}

async function handleOrganizationInvitationAccepted(ctx: WebhookContext): Promise<Response> {
  const { supabase, event } = ctx
  const eventType = 'organizationInvitation.accepted'

  const inviteId = event.data.id
  const organizationId = event.data.organization?.id
  const publicMetadata = event.data.public_metadata || {}

  logEvent(eventType, 'Processing invitation acceptance', { 
    inviteId, 
    organizationId,
    publicMetadata 
  })

  // Update location invites (for merchant staff)
  const { error: locationError } = await supabase
    .from('location_invites')
    .update({
      status: 'accepted',
      accepted_at: new Date().toISOString(),
    })
    .eq('clerk_invite_id', inviteId)

  if (locationError) {
    logError(eventType, 'Failed to update location invites', locationError)
  }

  // Handle admin invites - look up by clerk_invite_id
  const { data: pendingInvite, error: inviteError } = await supabase
    .from('pending_org_admin_invites')
    .select('*')
    .eq('clerk_invite_id', inviteId)
    .single()

  if (inviteError && inviteError.code !== 'PGRST116') {
    logError(eventType, 'Error fetching pending admin invite', inviteError)
  }

  if (pendingInvite) {
    logEvent(eventType, 'Found pending admin invite', { 
      inviteId: pendingInvite.id,
      email: pendingInvite.email,
      merchantAccessCount: pendingInvite.merchant_access?.length || 0
    })

    // Get user_id from the event - Clerk provides this when invite is accepted
    const userId = publicMetadata.userId || event.data.user_id
    
    if (!userId) {
      // Try to find user by email in our users table
      const { data: user } = await supabase
        .from('users')
        .select('id')
        .eq('email', pendingInvite.email)
        .single()
      
      if (user) {
        logEvent(eventType, 'Found user by email', { userId: user.id })
        
        // Create merchant access records
        if (pendingInvite.merchant_access && Array.isArray(pendingInvite.merchant_access)) {
          const accessResult = await createAdminMerchantAccessRecords(
            supabase,
            user.id,
            pendingInvite.merchant_access,
            pendingInvite.invited_by
          )

          if (!accessResult.success) {
            logError(eventType, 'Failed to create merchant access records', accessResult.error)
          } else {
            logEvent(eventType, 'Created merchant access records', { count: accessResult.count })
          }
        }
      } else {
        logEvent(eventType, 'User not found by email yet - will be handled by membership event')
      }
    } else {
      // Create merchant access records with user_id from event
      if (pendingInvite.merchant_access && Array.isArray(pendingInvite.merchant_access)) {
        const accessResult = await createAdminMerchantAccessRecords(
          supabase,
          userId,
          pendingInvite.merchant_access,
          pendingInvite.invited_by
        )

        if (!accessResult.success) {
          logError(eventType, 'Failed to create merchant access records', accessResult.error)
        } else {
          logEvent(eventType, 'Created merchant access records', { count: accessResult.count })
        }
      }
    }

    // Update invite status to accepted
    const { error: updateError } = await supabase
      .from('pending_org_admin_invites')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString(),
        clerk_user_id: userId || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', pendingInvite.id)

    if (updateError) {
      logError(eventType, 'Failed to update pending invite status', updateError)
    }
  }

  logEvent(eventType, 'Invitation acceptance processed', { inviteId })
  return successResponse({ inviteId }, 'Invitation acceptance processed')
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req) => {
  // Verify webhook signature
  const webhookSecret = Deno.env.get('CLERK_WEBHOOK_SECRET')
  if (!webhookSecret) {
    return errorResponse('Webhook secret not configured', 500)
  }

  let event: any
  try {
    event = await verifyWebhook(req, { signingSecret: webhookSecret })
  } catch (err: any) {
    logError('webhook', 'Signature verification failed', err)
    return errorResponse('Webhook signature verification failed', 401)
  }

  // Initialize clients
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const clerkSecretKey = Deno.env.get('CLERK_SECRET_KEY')

  if (!supabaseUrl || !supabaseServiceKey) {
    return errorResponse('Supabase credentials not configured', 500)
  }

  if (!clerkSecretKey) {
    return errorResponse('Clerk secret key not configured', 500)
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  const clerkClient = createClerkClient({ secretKey: clerkSecretKey })

  const ctx: WebhookContext = { supabase, clerkClient, event }

  logEvent('webhook', `Received event: ${event.type}`, { eventId: event.data?.id })

  // Route to appropriate handler
  switch (event.type) {
    case 'user.created':
      return await handleUserCreated(ctx)

    case 'user.updated':
      return await handleUserUpdated(ctx)

    case 'user.deleted':
      return await handleUserDeleted(ctx)

    case 'organization.created':
      return await handleOrganizationCreated(ctx)

    case 'organization.updated':
      return await handleOrganizationUpdated(ctx)

    case 'organization.deleted':
      return await handleOrganizationDeleted(ctx)

    case 'organizationMembership.created':
      return await handleOrganizationMembershipCreated(ctx)

    case 'organizationMembership.updated':
      return await handleOrganizationMembershipUpdated(ctx)

    case 'organizationMembership.deleted':
      return await handleOrganizationMembershipDeleted(ctx)

    case 'organizationInvitation.accepted':
      return await handleOrganizationInvitationAccepted(ctx)

    default:
      logEvent('webhook', `Unhandled event type: ${event.type}`)
      return successResponse({ eventType: event.type }, 'Event acknowledged but not processed')
  }
})
