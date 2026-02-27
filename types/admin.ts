// types/admin.ts
// Admin Authentication & Role Types for DexaPOS HQ Admin Portal

// ============================================================================
// HQ ROLE CODES - Simplified to 3 core roles
// ============================================================================

export type HQRoleCode =
  | 'hq.super_admin'    // Level 10 - Full system access
  | 'hq.platform_admin' // Level 8 - Platform management
  | 'hq.manager'        // Level 5 - Operational management

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
// HQ ROLES CONFIGURATION - Static role definitions with permissions
// ============================================================================

export interface HQRoleConfig {
  code: HQRoleCode
  level: number
  name: string
  description: string
  permissions: HQPermission[]
}

export const HQ_ROLES: Record<HQRoleCode, HQRoleConfig> = {
  'hq.super_admin': {
    code: 'hq.super_admin',
    level: 10,
    name: 'Super Admin',
    description: 'Full system access - can manage all aspects of the platform including billing, system config, and all merchants',
    permissions: [
      // All merchant permissions
      'hq.merchant.view',
      'hq.merchant.create',
      'hq.merchant.update',
      'hq.merchant.delete',
      'hq.merchant.analytics',
      'hq.merchant.transactions',
      'hq.merchant.manage_team',
      // All support permissions
      'hq.support.view',
      'hq.support.manage',
      'hq.support.access_data',
      // All team permissions
      'hq.team.view',
      'hq.team.manage',
      'hq.team.assign',
      // All org permissions
      'hq.org.view',
      'hq.org.manage',
      // All system permissions
      'system.analytics.view',
      'system.audit.view',
      'system.config.manage',
      'system.billing.manage',
      // All merchant-level access
      'merchant.team.view',
      'merchant.team.manage',
      'merchant.transactions.view',
      'merchant.analytics.view',
      'merchant.reports.view',
      'merchant.reports.export',
    ],
  },
  'hq.platform_admin': {
    code: 'hq.platform_admin',
    level: 8,
    name: 'Platform Admin',
    description: 'Platform management - can manage merchants, teams, and view system analytics',
    permissions: [
      // Merchant permissions (no delete)
      'hq.merchant.view',
      'hq.merchant.create',
      'hq.merchant.update',
      'hq.merchant.analytics',
      'hq.merchant.transactions',
      'hq.merchant.manage_team',
      // Support permissions
      'hq.support.view',
      'hq.support.manage',
      // Team permissions
      'hq.team.view',
      'hq.team.manage',
      // Org permissions (view only)
      'hq.org.view',
      // System permissions (view only)
      'system.analytics.view',
      'system.audit.view',
      // Merchant-level access
      'merchant.team.view',
      'merchant.team.manage',
      'merchant.transactions.view',
      'merchant.analytics.view',
      'merchant.reports.view',
      'merchant.reports.export',
    ],
  },
  'hq.manager': {
    code: 'hq.manager',
    level: 5,
    name: 'Manager',
    description: 'Operational management - can view and edit assigned merchants, view team info',
    permissions: [
      // Merchant permissions (view and update only)
      'hq.merchant.view',
      'hq.merchant.update',
      'hq.merchant.analytics',
      'hq.merchant.transactions',
      // Support permissions (view only)
      'hq.support.view',
      // Team permissions (view only)
      'hq.team.view',
      // Merchant-level access (view mostly)
      'merchant.team.view',
      'merchant.transactions.view',
      'merchant.analytics.view',
      'merchant.reports.view',
    ],
  },
}

// Helper to get roles that a user can invite based on their level
export function getInvitableRoles(currentUserLevel: number): HQRoleConfig[] {
  return Object.values(HQ_ROLES).filter(role => role.level <= currentUserLevel)
}

// Helper to check if user can invite a specific role
export function canInviteRole(currentUserLevel: number, targetRoleCode: HQRoleCode): boolean {
  const targetRole = HQ_ROLES[targetRoleCode]
  return targetRole && targetRole.level <= currentUserLevel
}

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
  isSuperAdmin: boolean

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

// ============================================================================
// MERCHANT ACCESS TYPES - Simplified (no access levels, role determines permissions)
// ============================================================================

export interface MerchantAccessAssignment {
  merchantId: string
  merchantName?: string
}

export interface AdminMerchantAccess {
  id: string
  adminUserId: string
  merchantId: string
  merchantName?: string
  grantedBy?: string
  grantedByName?: string
  grantedAt: string
  revokedAt?: string
  isActive: boolean
  locationCount?: number
  notes?: string
  createdAt: string
  updatedAt: string
}

// ============================================================================
// ADMIN INVITE TYPES
// ============================================================================

export interface CreateAdminInviteParams {
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

export interface PendingAdminInvite {
  id: string
  organizationId: string
  clerkInviteId: string
  email: string
  firstName?: string
  lastName?: string
  status: 'pending' | 'accepted' | 'revoked' | 'expired' | 'cancelled' | 'failed'
  role: string
  merchantAccess: MerchantAccessAssignment[]
  clerkUserId?: string
  invitedBy?: string
  acceptedAt?: string
  createdAt: string
  updatedAt: string
}
