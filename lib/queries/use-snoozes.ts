'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  getActiveSnoozes,
  snoozeItem,
  snoozeItemUntilEndOfDay,
  snoozeItemForHours,
  snoozeItemUntilManual,
  unsnoozeItem,
  unsnoozeModifier,
  type ActiveSnoozes,
} from '@/app/dashboard/actions/item-snooze'

export type { ActiveSnoozes }

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
  // Item availability shows up in menu views too.
  queryClient.invalidateQueries({ queryKey: ['menu-items'] })
}

export type SnoozeDuration =
  | { kind: 'end_of_day' }
  | { kind: 'hours'; hours: number }
  | { kind: 'until_manual' }

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

// Re-export the raw action for callers that build their own snooze flows.
export { snoozeItem }
