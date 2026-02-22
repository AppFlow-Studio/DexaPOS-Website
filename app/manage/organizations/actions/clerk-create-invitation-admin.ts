'use server'

import { createClerkClient } from '@clerk/backend'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { CreateAdminInviteParams, MerchantAccessAssignment } from '@/types/admin'
import { logAdminAction } from '@/lib/admin/log-admin-action'


// Legacy interface for backwards compatibility
interface LegacyAdminInviteParams {
  organizationId: string
  email: string
  role: string
  level_type: string
  org_type: string
}

// Type guard to check if params are the new format
function isNewFormat(params: CreateAdminInviteParams | LegacyAdminInviteParams): params is CreateAdminInviteParams {
  return 'roleCode' in params
}

export async function createInvitationAdmin(
  params: CreateAdminInviteParams | LegacyAdminInviteParams
) {
  try {
    const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! })
    const supabase = createServerSupabaseClient()

    // Normalize params based on format
    let normalizedParams: {
      organizationId: string
      firstName: string
      lastName: string
      email: string
      roleCode: string
      levelType: string
      orgType: string
      merchantAccess: MerchantAccessAssignment[]
      invitedBy?: string
    }

    if (isNewFormat(params)) {
      normalizedParams = {
        organizationId: params.organizationId,
        firstName: params.firstName || '',
        lastName: params.lastName || '',
        email: params.email,
        roleCode: params.roleCode,
        levelType: params.levelType,
        orgType: params.orgType,
        merchantAccess: params.merchantAccess || [],
        invitedBy: params.invitedBy,
      }
    } else {
      // Legacy format - convert to new format
      normalizedParams = {
        organizationId: params.organizationId,
        firstName: '',
        lastName: '',
        email: params.email,
        roleCode: params.role,
        levelType: params.level_type,
        orgType: params.org_type,
        merchantAccess: [],
        invitedBy: undefined,
      }
    }

    // Validate required fields
    if (!normalizedParams.email || !normalizedParams.email.trim()) {
      return {
        success: false,
        message: 'Email address is required',
      }
    }

    if (!normalizedParams.roleCode) {
      return {
        success: false,
        message: 'Role is required',
      }
    }

    if (normalizedParams.roleCode !== 'hq.super_admin' && normalizedParams.merchantAccess.length === 0) {
      return {
        success: false,
        message: 'At least one merchant assignment is required for this role',
      }
    }

    // Get the redirect URL from environment or use default
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

    // Create Clerk ORGANIZATION invitation (not user invitation)
    // This ensures the user is automatically added to the organization when they accept
    const invitation = await clerkClient.organizations.createOrganizationInvitation({
      organizationId: normalizedParams.organizationId,
      emailAddress: normalizedParams.email.trim(),
      role: 'org:admin', // Clerk organization role
      publicMetadata: {
        role: normalizedParams.roleCode, // Our custom role (hq.super_admin, etc.)
        level_type: normalizedParams.levelType,
        org_type: normalizedParams.orgType,
        firstName: normalizedParams.firstName,
        lastName: normalizedParams.lastName,
      }
    })

    if (!invitation.id) {
      return {
        success: false,
        message: 'Failed to create Clerk organization invitation',
      }
    }

    // Insert into pending_org_admin_invites table with enhanced data
    const { data, error } = await supabase
      .from('pending_org_admin_invites')
      .insert({
        organization_id: normalizedParams.organizationId,
        clerk_invite_id: invitation.id,
        email: normalizedParams.email.trim(),
        first_name: normalizedParams.firstName || null,
        last_name: normalizedParams.lastName || null,
        status: invitation.status || 'pending',
        role: normalizedParams.roleCode,
        merchant_access: normalizedParams.merchantAccess.length > 0 
          ? normalizedParams.merchantAccess 
          : null,
        invited_by: normalizedParams.invitedBy || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (!data?.id) {
      console.error('Error creating pending invite record:', error)
      // Try to revoke the Clerk organization invitation since we failed to store it
      try {
        await clerkClient.organizations.revokeOrganizationInvitation({
          organizationId: normalizedParams.organizationId,
          invitationId: invitation.id,
          requestingUserId: normalizedParams.invitedBy || '',
        })
      } catch (revokeError) {
        console.error('Failed to revoke invitation after DB error:', revokeError)
      }
      return {
        success: false,
        message: 'Error creating invitation record: ' + (error?.message || 'Unknown error'),
      }
    }

    // Log audit event
    // Find the merchant ID for this organization to log correctly
    const { data: merchant } = await supabase
      .from('merchants')
      .select('id')
      .eq('clerk_org_id', normalizedParams.organizationId)
      .single()

    await logAdminAction('ADMIN_INVITED', {
      merchantId: merchant?.id,
      clerkOrgId: normalizedParams.organizationId,
      resourceType: 'invitation',
      resourceId: data.id,
      resourceName: normalizedParams.email,
      changes: {
        after: {
          email: normalizedParams.email,
          role: normalizedParams.roleCode,
          status: invitation.status || 'pending',
        },
      },
      metadata: {
        level: normalizedParams.levelType,
        org_type: normalizedParams.orgType,
        merchant_access_count: normalizedParams.merchantAccess.length,
        invited_by: normalizedParams.invitedBy || null,
      },
    })

    return {
      success: true,
      message: 'Admin invitation sent successfully',
      data: {
        inviteId: data?.id,
        clerkInviteId: invitation.id,
        email: normalizedParams.email,
        merchantAccessCount: normalizedParams.merchantAccess.length,
      },
    }


  } catch (error: any) {
    console.error('Error in createInvitationAdmin:', error)
    
    // Extract meaningful error message from Clerk errors
    let errorMessage = 'Unknown error occurred'
    if (error?.errors && Array.isArray(error.errors) && error.errors.length > 0) {
      errorMessage = error.errors[0].longMessage || error.errors[0].message || errorMessage
    } else if (error?.message) {
      errorMessage = error.message
    }

    return {
      success: false,
      message: 'Error creating invitation: ' + errorMessage,
    }
  }
}

// Helper function to check if an email already has a pending invite
export async function checkExistingInvite(organizationId: string, email: string) {
  try {
    const supabase = createServerSupabaseClient()
    
    const { data, error } = await supabase
      .from('pending_org_admin_invites')
      .select('id, status, created_at')
      .eq('organization_id', organizationId)
      .eq('email', email.trim())
      .eq('status', 'pending')
      .maybeSingle()

    if (error) {
      console.error('Error checking existing invite:', error)
      return { exists: false, error: error.message }
    }

    return {
      exists: !!data,
      invite: data,
    }
  } catch (error: any) {
    console.error('Error in checkExistingInvite:', error)
    return { exists: false, error: error?.message }
  }
}
