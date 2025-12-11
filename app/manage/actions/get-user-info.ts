'use server'

import { auth } from '@clerk/nextjs/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { DebugUserRelationships } from '@/debug/debug-user'
import type { UserWithAllMemberships } from '@/types/user'

export async function GetUserInfo() {
    const { userId } = await auth()
    // await DebugUserRelationships()
    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase.from('users').select(`
        *,
        members(
            *,
            organizations(
            *,
            merchants(id,clerk_org_id, name)
            )
        )
        `).eq('id', userId).single()

    if (error) {
        console.error('Error getting user info:', error)
        return new Error(error.message)
    }

    return data
}

// app/dashboard/actions/user.ts



export async function GetFullUserInfo(): Promise<{
    success: boolean
    data?: UserWithAllMemberships
    error?: string
}> {
    const { userId } = await auth()

    if (!userId) {
        return { success: false, error: 'Not authenticated' }
    }

    const supabase = createServerSupabaseClient()

    // Get user with all membership types
    const { data: user, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single()

    if (userError || !user) {
        return { success: false, error: userError?.message || 'User not found' }
    }

    // Get merchant memberships with a working query
    // The issue is likely the merchants relationship - let's do it in steps
    const { data: members, error: membersError } = await supabase
        .from('members')
        .select(`
            *,
            organizations(*),
            location_members(
                *,
                locations(*)
            )
        `)
        .eq('user_id', userId)
        .eq('is_active', true)

    // Now get merchants separately based on organization clerk_org_ids
    let membersWithMerchants = members || []

    if (members && members.length > 0) {
        const clerkOrgIds = members
            .map(m => m.organizations?.clerk_org_id)
            .filter(Boolean) as string[]

        if (clerkOrgIds.length > 0) {
            const { data: merchants } = await supabase
                .from('merchants')
                .select('*')
                .in('clerk_org_id', clerkOrgIds)

            // Attach merchants to their organizations
            if (merchants) {
                membersWithMerchants = members.map(member => {
                    const merchant = merchants.find(
                        m => m.clerk_org_id === member.organizations?.clerk_org_id
                    )
                    return {
                        ...member,
                        organizations: {
                            ...member.organizations,
                            merchants: merchant || null
                        }
                    }
                })
            }
        }
    }

    // Get carrier memberships (if you have this table)
    const { data: carrierMembers } = await supabase
        .from('carrier_members')
        .select(`
            *,
            carriers(*)
        `)
        .eq('user_id', userId)
        .eq('is_active', true)

    // Get DEXA HQ membership (if you have this table)
    const { data: dexaHQMembers } = await supabase
        .from('dexa_hq_members')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)

    const result: UserWithAllMemberships = {
        ...user,
        members: membersWithMerchants,
        carrier_members: carrierMembers || [],
        dexa_hq_members: dexaHQMembers || [],
    }

    return { success: true, data: result }
}

// Alternative: Use a database function for complex joins
export async function GetFullUserInfoViaRPC(): Promise<{
    success: boolean
    data?: UserWithAllMemberships
    error?: string
}> {
    const { userId } = await auth()

    if (!userId) {
        return { success: false, error: 'Not authenticated' }
    }

    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase.rpc('get_user_with_all_memberships', {
        p_user_id: userId
    })

    if (error) {
        return { success: false, error: error.message }
    }

    return { success: true, data }
}