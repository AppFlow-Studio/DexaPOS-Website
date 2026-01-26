'use client'

import { useAuth, useSession } from '@clerk/nextjs'
import { useQuery } from '@tanstack/react-query'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import type { AdminAuthContext, HQPermission, HQRole } from '@/types/admin'

const DEXA_HQ_ORG_ID = process.env.NEXT_PUBLIC_DEXA_POS_INTERNAL_TEAM_ID 

export function useAdminAuth(): AdminAuthContext {
  const { userId, orgId, isLoaded: clerkLoaded } = useAuth()
  const { session } = useSession()
  console.log(session)

  const isHQAdmin = orgId === DEXA_HQ_ORG_ID
  
  // Fetch role and permissions from Supabase
  const { data: adminData, isLoading: roleLoading } = useQuery({
    queryKey: ['hq-auth', userId],
    queryFn: async () => {
      if (!userId || !isHQAdmin || !session) return null

      // Get Clerk token for Supabase auth
      const token = await session?.getToken()
      if (!token) return null

      const supabase = createBrowserSupabaseClient(token)


      // Get role
      const { data: roleData, error: roleError } = await supabase
        .rpc('get_my_hq_role')
        .single()

      if (roleError) {
        console.error('Error fetching HQ role:', roleError)
      }

      // Get permissions
      const { data: permissions, error: permError } = await supabase
        .rpc('get_my_hq_permissions')
      console.log(permissions)
      if (permError) {
        console.error('Error fetching HQ permissions:', permError)
      }

      return {
        role: roleData as HQRole | null,
        permissions: (permissions as HQPermission[]) || []
      }
    },
    enabled: clerkLoaded && isHQAdmin && !!userId && !!session,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
  })

  const isLoading = !clerkLoaded || (isHQAdmin && roleLoading)
  const permissions = adminData?.permissions || []
  const isSuperAdmin = adminData?.role?.role_code === 'hq.super_admin'

  const hasPermission = (permission: HQPermission): boolean => {
    return permissions.includes(permission)
  }

  return {
    // Auth state
    isAuthenticated: !!userId,
    isLoading,
    isHQAdmin,
    isSuperAdmin,

    // Role and permissions
    role: adminData?.role || null,
    permissions,
    hasPermission,

    // Convenience booleans - mapped to existing permission codes
    // Merchants
    canViewMerchants: hasPermission('hq.merchant.view'),
    canCreateMerchants: hasPermission('hq.merchant.create'),
    canEditMerchants: hasPermission('hq.merchant.update'),
    canDeleteMerchants: hasPermission('hq.merchant.delete'),
    canViewMerchantAnalytics: hasPermission('hq.merchant.analytics'),
    canViewMerchantTransactions: hasPermission('hq.merchant.transactions'),
    canManageMerchantTeam: hasPermission('hq.merchant.manage_team'),
    // Support
    canViewSupport: hasPermission('hq.support.view'),
    canManageSupport: hasPermission('hq.support.manage'),
    // System
    canViewSystemAnalytics: hasPermission('system.analytics.view'),
    canViewAuditLogs: hasPermission('system.audit.view'),
    canManageSystemConfig: hasPermission('system.config.manage'),
    canManageBilling: hasPermission('system.billing.manage'),
    // Team
    canViewTeam: hasPermission('hq.team.view'),
    canManageTeam: hasPermission('hq.team.manage'),
    // Organizations
    canViewOrganizations: hasPermission('hq.org.view'),
    canManageOrganizations: hasPermission('hq.org.manage'),
  }
}
