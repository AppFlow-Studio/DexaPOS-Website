import type { HQPermission } from '@/types/admin'

export type PermissionCode = HQPermission | string

/**
 * Shorthand aliases used in ticket definitions and UI config.
 * These map to the existing canonical HQ permission codes in the codebase.
 */
export const PERMISSION_ALIASES: Record<string, HQPermission> = {
  view: 'hq.org.view',
  'merchants.view': 'hq.merchant.view',
  'merchants.create': 'hq.merchant.create',
  'transactions.view': 'hq.merchant.transactions',
  'analytics.view': 'system.analytics.view',
  'users.manage': 'hq.team.manage',
  'roles.manage': 'hq.team.manage',
  'audit.view': 'system.audit.view',
}

export function resolvePermissionCode(code: PermissionCode): HQPermission | null {
  if (!code) return null
  const normalized = code.trim()
  if (!normalized) return null

  if (normalized in PERMISSION_ALIASES) {
    return PERMISSION_ALIASES[normalized]
  }

  return normalized as HQPermission
}
