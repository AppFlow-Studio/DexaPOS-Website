'use client'

import type { QueryClient } from '@tanstack/react-query'
import { useLocationStore } from '@/stores/location-store'
import { useAdminPermissionsStore } from '@/stores/admin-permissions-store'
import { useScheduleStore } from '@/stores/useScheduleStore'
import { useScheduleTemplateStore } from '@/stores/useScheduleTemplateStore'
import { useFloorPlanStore } from '@/stores/floor-plan-store'
import { useImpersonationStore } from '@/stores/impersonation-store'

// App-owned localStorage keys. Never include Clerk's keys here.
const APP_STORAGE_KEYS = [
  'location-storage',
  'schedule-storage',
  'schedule-template-storage',
  'floor-plan-storage',
]

/**
 * Clears all client-side session state on auth transitions (sign-out or user switch).
 * Call this BEFORE Clerk's signOut() so the redirect lands on a clean slate.
 *
 * Does NOT touch Clerk's own localStorage keys — only app-owned keys.
 */
export async function resetClientSession(queryClient: QueryClient): Promise<void> {
  // Cancel any in-flight queries so they don't write stale data after reset
  await queryClient.cancelQueries()

  // Remove all cached query data (not just mark stale — actually remove)
  queryClient.clear()

  // Reset every Zustand store
  useLocationStore.getState().reset()
  useAdminPermissionsStore.getState().clearSnapshot()
  useScheduleStore.getState().reset()
  useScheduleTemplateStore.getState().reset()
  useFloorPlanStore.getState().reset()
  useImpersonationStore.getState().clearImpersonation()

  // Purge app-owned persisted localStorage keys
  if (typeof localStorage !== 'undefined') {
    APP_STORAGE_KEYS.forEach((key) => {
      try { localStorage.removeItem(key) } catch {}
    })
  }

  // Clear impersonation sessionStorage (separate from localStorage above)
  if (typeof sessionStorage !== 'undefined') {
    try { sessionStorage.removeItem('impersonation-storage') } catch {}
  }

  // Clear the location cookie so SSR doesn't read a stale location
  if (typeof document !== 'undefined') {
    document.cookie = 'x-location-id=; path=/; max-age=0; SameSite=Lax'
  }
}
