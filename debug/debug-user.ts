// app/dashboard/actions/debug-user.ts

'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { auth } from '@clerk/nextjs/server'

export async function DebugUserRelationships() {
    const { userId } = await auth()
    
    if (!userId) {
        return { error: 'Not authenticated' }
    }
    
    const supabase = createServerSupabaseClient()
    
    // Step 1: Get user
    const { data: user, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single()
    
    console.log('User:', user, 'Error:', userError)
    
    // Step 2: Get members separately
    const { data: members, error: membersError } = await supabase
        .from('members')
        .select('*')
        .eq('user_id', userId)
    
    console.log('Members:', members, 'Error:', membersError)
    
    // Step 3: Get organizations for those members
    if (members && members.length > 0) {
        const orgIds = members.map(m => m.organization_id)
        
        const { data: orgs, error: orgsError } = await supabase
            .from('organizations')
            .select('*')
            .in('id', orgIds)
        
        console.log('Organizations:', orgs, 'Error:', orgsError)
        
        // Step 4: Try to get merchants - check both possible relationships
        if (orgs && orgs.length > 0) {
            // Option A: merchants.clerk_org_id = organizations.id
            const { data: merchantsByOrgId, error: errA } = await supabase
                .from('merchants')
                .select('*')
                .in('clerk_org_id', orgIds)
            
            console.log('Merchants by organization_id:', merchantsByOrgId, 'Error:', errA)
            
            // Option B: merchants.clerk_org_id = organizations.clerk_org_id
            const clerkOrgIds = orgs.map(o => o.clerk_org_id).filter(Boolean)
            const { data: merchantsByClerkId, error: errB } = await supabase
                .from('merchants')
                .select('*')
                .in('clerk_org_id', clerkOrgIds)
            
            console.log('Merchants by clerk_org_id:', merchantsByClerkId, 'Error:', errB)
        }
    }
    
    return { user, members }
}