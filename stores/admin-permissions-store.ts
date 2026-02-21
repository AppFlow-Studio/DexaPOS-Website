import { create } from 'zustand'
import type { HQPermission, HQRole, HQRoleCode } from '@/types/admin'

interface AdminPermissionsSnapshotState {
  role: HQRole | null
  roleCode: HQRoleCode | null
  roleLevel: number
  permissionCodes: HQPermission[]
  lastSyncedAt: number | null
  setSnapshot: (role: HQRole | null, permissionCodes: HQPermission[]) => void
  clearSnapshot: () => void
}

function uniquePermissions(permissionCodes: HQPermission[]): HQPermission[] {
  return Array.from(new Set(permissionCodes))
}

export const useAdminPermissionsStore = create<AdminPermissionsSnapshotState>((set) => ({
  role: null,
  roleCode: null,
  roleLevel: 0,
  permissionCodes: [],
  lastSyncedAt: null,
  setSnapshot: (role, permissionCodes) =>
    set({
      role,
      roleCode: role?.role_code ?? null,
      roleLevel: role?.level ?? 0,
      permissionCodes: uniquePermissions(permissionCodes),
      lastSyncedAt: Date.now(),
    }),
  clearSnapshot: () =>
    set({
      role: null,
      roleCode: null,
      roleLevel: 0,
      permissionCodes: [],
      lastSyncedAt: null,
    }),
}))
