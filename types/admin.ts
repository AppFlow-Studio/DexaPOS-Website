// types/admin.ts
// Admin Authentication & Role Types for DexaPOS HQ Admin Portal

// ============================================================================
// HQ ROLE CODES
// ============================================================================

export type HQRoleCode =
  | 'hq.super_admin'
  | 'hq.platform_admin'
  | 'hq.operations_manager'
  | 'hq.finance_manager'
  | 'hq.support_manager'
  | 'hq.account_manager'
  | 'hq.analyst'
  | 'hq.support_agent'

// ============================================================================
// HQ PERMISSIONS
// ============================================================================

export type HQPermission =
  // Merchant permissions
  | 'hq.merchant.view'
  | 'hq.merchant.create'
  | 'hq.merchant.update'
  | 'hq.merchant.delete'
  | 'hq.merchant.analytics'
  | 'hq.merchant.transactions'
  | 'hq.merchant.manage_team'
  // Support permissions
  | 'hq.support.view'
  | 'hq.support.manage'
  | 'hq.support.access_data'
  // Team permissions
  | 'hq.team.view'
  | 'hq.team.manage'
  | 'hq.team.assign'
  // Organization permissions
  | 'hq.org.view'
  | 'hq.org.manage'
  // Carrier permissions (for future use)
  | 'hq.carrier.view'
  | 'hq.carrier.create'
  | 'hq.carrier.update'
  | 'hq.carrier.delete'
  | 'hq.carrier.analytics'
  | 'hq.carrier.manage_team'
  // System permissions
  | 'system.analytics.view'
  | 'system.audit.view'
  | 'system.config.manage'
  | 'system.billing.manage'
  // Merchant-level access (for viewing merchant data)
  | 'merchant.team.view'
  | 'merchant.team.manage'
  | 'merchant.transactions.view'
  | 'merchant.analytics.view'
  | 'merchant.reports.view'
  | 'merchant.reports.export'

// ============================================================================
// HQ ROLE INTERFACE
// ============================================================================

export interface HQRole {
  role_code: HQRoleCode
  role_name: string
  level: number
}

// ============================================================================
// ADMIN AUTH CONTEXT
// ============================================================================

export interface AdminAuthContext {
  // Auth state
  isAuthenticated: boolean
  isLoading: boolean
  isHQAdmin: boolean

  // Role and permissions
  role: HQRole | null
  permissions: HQPermission[]
  hasPermission: (permission: HQPermission) => boolean

  // Convenience booleans - mapped to existing permission codes
  // Merchants
  canViewMerchants: boolean
  canCreateMerchants: boolean
  canEditMerchants: boolean
  canDeleteMerchants: boolean
  canViewMerchantAnalytics: boolean
  canViewMerchantTransactions: boolean
  canManageMerchantTeam: boolean
  // Support
  canViewSupport: boolean
  canManageSupport: boolean
  // System
  canViewSystemAnalytics: boolean
  canViewAuditLogs: boolean
  canManageSystemConfig: boolean
  canManageBilling: boolean
  // Team
  canViewTeam: boolean
  canManageTeam: boolean
  // Organizations
  canViewOrganizations: boolean
  canManageOrganizations: boolean
}

// ============================================================================
// SERVER-SIDE AUTH TYPES
// ============================================================================

export interface ServerAdminAuth {
  userId: string
  orgId: string
  role: HQRole
  permissions: HQPermission[]
  hasPermission: (permission: HQPermission) => boolean
}
