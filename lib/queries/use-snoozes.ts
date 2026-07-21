'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { invalidateOrderOutSync } from '@/app/dashboard/hooks/useOrderOutMenuSync'
import {
  getActiveSnoozes,
  getItemSnooze,
  snoozeItem,
  snoozeItemUntilEndOfDay,
  snoozeItemForHours,
  snoozeItemUntilManual,
  snoozeModifier,
  snoozeModifierGroup,
  unsnoozeItem,
  unsnoozeModifier,
  unsnoozeModifierGroup,
  type ActiveSnoozes,
} from '@/app/dashboard/actions/item-snooze'

export type { ActiveSnoozes }

// Per-item snooze state at a location (drives the item editor's 86 control).
export function useItemSnooze(
  menuItemId: string | undefined,
  locationId: string | null,
) {
  return useQuery<{ snoozed_until: string | null; snooze_reason: string | null }>({
    queryKey: ['item-snooze', menuItemId ?? null, locationId ?? null],
    queryFn: async () => {
      if (!menuItemId || !locationId) {
        return { snoozed_until: null, snooze_reason: null }
      }
      return getItemSnooze(menuItemId, locationId)
    },
    enabled: !!menuItemId && !!locationId,
    staleTime: 30 * 1000,
  })
}

// ============================================================================
// 86'd items / modifiers (out-of-stock snooze), per location.
// ============================================================================

export function useActiveSnoozes(
  clerkOrgId: string | null | undefined,
  locationId: string | 'all',
) {
  return useQuery<ActiveSnoozes>({
    queryKey: ['snoozed-items', clerkOrgId ?? null, locationId, 'scoped'],
    queryFn: async () => {
      const result = await getActiveSnoozes(locationId)
      if (!result.success) throw new Error(result.error)
      return result.data ?? { items: [], modifiers: [] }
    },
    enabled: !!clerkOrgId && !!locationId && locationId !== 'all',
    staleTime: 30 * 1000,
  })
}

function invalidate(
  queryClient: ReturnType<typeof useQueryClient>,
  clerkOrgId: string,
) {
  queryClient.invalidateQueries({ queryKey: ['snoozed-items', clerkOrgId] })
  // Per-item control state + every menu view that surfaces effective_availability.
  queryClient.invalidateQueries({ queryKey: ['item-snooze'] })
  queryClient.invalidateQueries({ queryKey: ['menu-items'] })
  queryClient.invalidateQueries({ queryKey: ['menu-item'] })
  queryClient.invalidateQueries({ queryKey: ['menu-items-flat'] })
  queryClient.invalidateQueries({ queryKey: ['categories-with-items'] })
  // Menu builder (/dashboard/menu/[menuId]) reads effective_availability from here;
  // without this the 86'd item stays "green" until a manual refresh.
  queryClient.invalidateQueries({ queryKey: ['menu-with-categories'] })
  // A 86 changes suspension_info in the OrderOut payload — refresh the sync/diff
  // so the "out of sync" badge reflects the re-pushed state instead of a stale diff.
  invalidateOrderOutSync(queryClient)
}

export type SnoozeDuration =
  | { kind: 'end_of_day' }
  | { kind: 'hours'; hours: number }
  | { kind: 'until_manual' }
  | { kind: 'until'; iso: string }

export function useSnoozeItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      clerkOrgId,
      menuItemId,
      locationId,
      duration,
      reason,
    }: {
      clerkOrgId: string
      menuItemId: string
      locationId: string
      duration: SnoozeDuration
      reason?: string
    }) => {
      switch (duration.kind) {
        case 'end_of_day':
          return snoozeItemUntilEndOfDay(clerkOrgId, menuItemId, locationId, reason)
        case 'hours':
          return snoozeItemForHours(clerkOrgId, menuItemId, locationId, duration.hours, reason)
        case 'until_manual':
          return snoozeItemUntilManual(clerkOrgId, menuItemId, locationId, reason)
        case 'until':
          return snoozeItem(clerkOrgId, menuItemId, locationId, duration.iso, reason)
      }
    },
    onSuccess: (result, { clerkOrgId }) => {
      if (result.success) {
        invalidate(queryClient, clerkOrgId)
        toast.success('Item marked out of stock')
      } else {
        toast.error(result.error || 'Failed to 86 item')
      }
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to 86 item'),
  })
}

export function useRestoreItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      clerkOrgId,
      menuItemId,
      locationId,
    }: {
      clerkOrgId: string
      menuItemId: string
      locationId: string
    }) => unsnoozeItem(clerkOrgId, menuItemId, locationId),
    onSuccess: (result, { clerkOrgId }) => {
      if (result.success) {
        invalidate(queryClient, clerkOrgId)
        toast.success('Item restored')
      } else {
        toast.error(result.error || 'Failed to restore item')
      }
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to restore item'),
  })
}

export function useSnoozeModifier() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      clerkOrgId,
      modifierGroupItemId,
      locationId,
      snoozedUntil,
      reason,
    }: {
      clerkOrgId: string
      modifierGroupItemId: string
      locationId: string
      // ISO instant | 'infinity' (until manually restored). Mirrors the item
      // snooze contract; the modifier toggle uses 'infinity' for a simple
      // out-of-stock switch.
      snoozedUntil: string
      reason?: string
    }) =>
      snoozeModifier(clerkOrgId, modifierGroupItemId, locationId, snoozedUntil, reason),
    onSuccess: (result, { clerkOrgId }) => {
      if (result.success) {
        invalidate(queryClient, clerkOrgId)
        toast.success('Modifier marked out of stock')
      } else {
        toast.error(result.error || 'Failed to 86 modifier')
      }
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to 86 modifier'),
  })
}

export function useRestoreModifier() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      clerkOrgId,
      modifierGroupItemId,
      locationId,
    }: {
      clerkOrgId: string
      modifierGroupItemId: string
      locationId: string
    }) => unsnoozeModifier(clerkOrgId, modifierGroupItemId, locationId),
    onSuccess: (result, { clerkOrgId }) => {
      if (result.success) {
        invalidate(queryClient, clerkOrgId)
        toast.success('Modifier restored')
      } else {
        toast.error(result.error || 'Failed to restore modifier')
      }
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to restore modifier'),
  })
}

// ============================================================================
// Modifier GROUP 86 — snoozes/restores every option in the group at once.
// ============================================================================

export function useSnoozeModifierGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      clerkOrgId,
      modifierGroupId,
      locationId,
      snoozedUntil,
      reason,
    }: {
      clerkOrgId: string
      modifierGroupId: string
      locationId: string
      // ISO instant | 'infinity' (until manually restored).
      snoozedUntil: string
      reason?: string
    }) =>
      snoozeModifierGroup(clerkOrgId, modifierGroupId, locationId, snoozedUntil, reason),
    onSuccess: (result, { clerkOrgId }) => {
      if (result.success) {
        invalidate(queryClient, clerkOrgId)
        toast.success('Modifier group marked out of stock')
      } else {
        toast.error(result.error || 'Failed to 86 modifier group')
      }
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to 86 modifier group'),
  })
}

export function useRestoreModifierGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      clerkOrgId,
      modifierGroupId,
      locationId,
    }: {
      clerkOrgId: string
      modifierGroupId: string
      locationId: string
    }) => unsnoozeModifierGroup(clerkOrgId, modifierGroupId, locationId),
    onSuccess: (result, { clerkOrgId }) => {
      if (result.success) {
        invalidate(queryClient, clerkOrgId)
        toast.success('Modifier group restored')
      } else {
        toast.error(result.error || 'Failed to restore modifier group')
      }
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to restore modifier group'),
  })
}

// Re-export the raw action for callers that build their own snooze flows.
export { snoozeItem }
