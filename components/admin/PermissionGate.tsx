'use client'

import { useAdminPermissions } from '@/lib/hooks/useAdminPermissions'
import type { PermissionCode } from '@/lib/admin/permission-codes'

interface PermissionGateProps {
  /**
   * Single permission or array of permissions to check.
   * By default, requires ANY of the permissions (OR logic).
   * Set requireAll=true to require ALL permissions (AND logic).
   */
  permission?: PermissionCode | PermissionCode[]
  /**
   * Optional minimum role level (e.g., 10 = super admin only).
   */
  minLevel?: number
  /**
   * Content to render if the user lacks the required permission(s).
   * Defaults to null (renders nothing).
   */
  fallback?: React.ReactNode
  /**
   * Content to render if the user has the required permission(s).
   */
  children: React.ReactNode
  /**
   * If true, requires ALL permissions instead of ANY.
   * Default is false (OR logic).
   */
  requireAll?: boolean
}

/**
 * PermissionGate - Conditionally renders children based on user permissions.
 *
 * Usage:
 * ```tsx
 * // Single permission
 * <PermissionGate permission="hq.merchant.create">
 *   <CreateMerchantButton />
 * </PermissionGate>
 *
 * // Multiple permissions (OR - user needs ANY of these)
 * <PermissionGate permission={['hq.merchant.view', 'hq.merchant.analytics']}>
 *   <MerchantDashboard />
 * </PermissionGate>
 *
 * // Multiple permissions (AND - user needs ALL of these)
 * <PermissionGate permission={['hq.merchant.create', 'hq.org.manage']} requireAll>
 *   <AdvancedMerchantSetup />
 * </PermissionGate>
 *
 * // With fallback
 * <PermissionGate
 *   permission="hq.merchant.delete"
 *   fallback={<DisabledDeleteButton />}
 * >
 *   <DeleteMerchantButton />
 * </PermissionGate>
 * ```
 */
export function PermissionGate({
  permission,
  minLevel,
  fallback = null,
  children,
  requireAll = false,
}: PermissionGateProps) {
  const { hasPermission, isAtLeast, isLoading } = useAdminPermissions()

  // Don't render anything while loading to prevent flash
  if (isLoading) return null

  const permissions = permission
    ? Array.isArray(permission)
      ? permission
      : [permission]
    : []

  const hasPermissionAccess =
    permissions.length === 0
      ? true
      : requireAll
        ? permissions.every(hasPermission)
        : permissions.some(hasPermission)

  const hasLevelAccess = minLevel == null ? true : isAtLeast(minLevel)

  const hasAccess = hasPermissionAccess && hasLevelAccess

  if (!hasAccess) return <>{fallback}</>

  return <>{children}</>
}

/**
 * useCanAccess - Hook for programmatic permission checks.
 *
 * Usage:
 * ```tsx
 * const canCreate = useCanAccess('hq.merchant.create')
 * if (canCreate) {
 *   // Show create UI
 * }
 * ```
 */
export function useCanAccess(
  permission?: PermissionCode | PermissionCode[],
  requireAll = false,
  minLevel?: number
): boolean {
  const { hasPermission, isAtLeast, isLoading } = useAdminPermissions()

  if (isLoading) return false

  const permissions = permission
    ? Array.isArray(permission)
      ? permission
      : [permission]
    : []

  const hasPermissionAccess =
    permissions.length === 0
      ? true
      : requireAll
        ? permissions.every(hasPermission)
        : permissions.some(hasPermission)

  const hasLevelAccess = minLevel == null ? true : isAtLeast(minLevel)

  return hasPermissionAccess && hasLevelAccess
}
