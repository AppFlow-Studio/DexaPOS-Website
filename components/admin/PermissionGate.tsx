'use client'

import { useAdminAuth } from '@/lib/hooks/useAdminAuth'
import type { HQPermission } from '@/types/admin'

interface PermissionGateProps {
  /**
   * Single permission or array of permissions to check.
   * By default, requires ANY of the permissions (OR logic).
   * Set requireAll=true to require ALL permissions (AND logic).
   */
  permission: HQPermission | HQPermission[]
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
  fallback = null,
  children,
  requireAll = false,
}: PermissionGateProps) {
  const { hasPermission, isLoading } = useAdminAuth()

  // Don't render anything while loading to prevent flash
  if (isLoading) return null

  const permissions = Array.isArray(permission) ? permission : [permission]

  const hasAccess = requireAll
    ? permissions.every(hasPermission)
    : permissions.some(hasPermission)

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
export function useCanAccess(permission: HQPermission | HQPermission[], requireAll = false): boolean {
  const { hasPermission, isLoading } = useAdminAuth()

  if (isLoading) return false

  const permissions = Array.isArray(permission) ? permission : [permission]

  return requireAll
    ? permissions.every(hasPermission)
    : permissions.some(hasPermission)
}
