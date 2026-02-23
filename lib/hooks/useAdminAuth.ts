'use client'

import type { AdminAuthContext, HQPermission, HQRole } from '@/types/admin'
import { useAdminPermissions } from '@/lib/hooks/useAdminPermissions'

export function useAdminAuth(): AdminAuthContext {
  const adminPermissions = useAdminPermissions()
  const permissions = adminPermissions.permissionCodes
  const role = adminPermissions.role as HQRole | null

  const hasPermission = (permission: HQPermission): boolean => {
    return adminPermissions.hasPermission(permission)
  }

  return {
    // Auth state
    isAuthenticated: adminPermissions.isAuthenticated,
    isLoading: adminPermissions.isLoading,
    isHQAdmin: adminPermissions.isHQAdmin,
    isSuperAdmin: adminPermissions.isSuperAdmin,

    // Role and permissions
    role,
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
