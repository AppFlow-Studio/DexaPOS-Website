'use client'

import { useEffect, useMemo } from 'react'
import { useAuth, useSession } from '@clerk/nextjs'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { resolvePermissionCode, type PermissionCode } from '@/lib/admin/permission-codes'
import { useAdminPermissionsStore } from '@/stores/admin-permissions-store'
import type { HQPermission, HQRole } from '@/types/admin'

const DEXA_HQ_ORG_ID = process.env.NEXT_PUBLIC_DEXA_POS_INTERNAL_TEAM_ID
const ADMIN_PERMISSIONS_QUERY_KEY = 'hq-admin-permissions'

function normalizePermissionRows(rows: unknown): HQPermission[] {
  if (!Array.isArray(rows)) {
    return []
  }

  return rows
    .map((row) => {
      if (typeof row === 'string') return row
      if (row && typeof row === 'object' && 'permission_code' in row) {
        const value = (row as { permission_code?: unknown }).permission_code
        return typeof value === 'string' ? value : ''
      }
      return ''
    })
    .map((code) => code.trim())
    .filter((code): code is HQPermission => code.length > 0)
}

export interface AdminPermissions {
  role_code: string | null
  role_level: number
  role: HQRole | null
  permissions: Set<HQPermission>
  permissionCodes: HQPermission[]
  hasPermission: (code: PermissionCode) => boolean
  hasAnyPermission: (codes: PermissionCode[]) => boolean
  isAtLeast: (level: number) => boolean
  isAuthenticated: boolean
  isHQAdmin: boolean
  isSuperAdmin: boolean
  isLoading: boolean
}

export function useAdminPermissions(): AdminPermissions {
  const { userId, orgId, isLoaded: clerkLoaded } = useAuth()
  const { session } = useSession()

  const role = useAdminPermissionsStore((state) => state.role)
  const roleCode = useAdminPermissionsStore((state) => state.roleCode)
  const roleLevel = useAdminPermissionsStore((state) => state.roleLevel)
  const permissionCodes = useAdminPermissionsStore((state) => state.permissionCodes)
  const setSnapshot = useAdminPermissionsStore((state) => state.setSnapshot)
  const clearSnapshot = useAdminPermissionsStore((state) => state.clearSnapshot)

  const isHQAdmin = orgId === DEXA_HQ_ORG_ID

  const { isLoading: queryLoading } = useQuery({
    queryKey: [ADMIN_PERMISSIONS_QUERY_KEY, userId, orgId],
    queryFn: async () => {
      if (!userId || !isHQAdmin || !session) {
        clearSnapshot()
        return null
      }

      const token = await session.getToken()
      if (!token) {
        clearSnapshot()
        return null
      }

      const supabase = createBrowserSupabaseClient(token)

      const [{ data: roleData, error: roleError }, { data: permissionRows, error: permissionError }] =
        await Promise.all([
          supabase.rpc('get_my_hq_role').single(),
          supabase.rpc('get_my_hq_permissions'),
        ])

      if (roleError) {
        console.error('[useAdminPermissions] Failed to fetch role:', roleError)
      }

      if (permissionError) {
        console.error('[useAdminPermissions] Failed to fetch permissions:', permissionError)
      }

      const normalizedPermissions = normalizePermissionRows(permissionRows)
      setSnapshot((roleData as HQRole | null) ?? null, normalizedPermissions)

      return null
    },
    enabled: clerkLoaded && isHQAdmin && !!userId && !!session,
    staleTime: 30 * 60 * 1000, // Keep a stable snapshot for the active session.
    gcTime: 60 * 60 * 1000,
  })

  useEffect(() => {
    if (clerkLoaded && (!userId || !isHQAdmin)) {
      clearSnapshot()
    }
  }, [clearSnapshot, clerkLoaded, isHQAdmin, userId])

  const permissionSet = useMemo(() => new Set(permissionCodes), [permissionCodes])

  const hasPermission = (code: PermissionCode): boolean => {
    const resolved = resolvePermissionCode(code)
    if (!resolved) return false
    return permissionSet.has(resolved)
  }

  const hasAnyPermission = (codes: PermissionCode[]): boolean => {
    if (!Array.isArray(codes) || codes.length === 0) return false
    return codes.some((code) => hasPermission(code))
  }

  const isAtLeast = (level: number): boolean => roleLevel >= level

  return {
    role_code: roleCode,
    role_level: roleLevel,
    role,
    permissions: permissionSet,
    permissionCodes,
    hasPermission,
    hasAnyPermission,
    isAtLeast,
    isAuthenticated: !!userId,
    isHQAdmin,
    isSuperAdmin: roleCode === 'hq.super_admin',
    isLoading: !clerkLoaded || (isHQAdmin && queryLoading),
  }
}

export function useInvalidateAdminPermissions() {
  const queryClient = useQueryClient()
  const clearSnapshot = useAdminPermissionsStore((state) => state.clearSnapshot)

  return () => {
    clearSnapshot()
    queryClient.invalidateQueries({ queryKey: [ADMIN_PERMISSIONS_QUERY_KEY] })
  }
}
