'use client'

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
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
  snoozeModifierForHours,
  snoozeModifierUntilEndOfDay,
  snoozeModifierUntilManual,
  snoozeModifierGroup,
  snoozeModifierGroupForHours,
  snoozeModifierGroupUntilEndOfDay,
  snoozeModifierGroupUntilManual,
  snoozeItemsBatch,
  unsnoozeItemsBatch,
  unsnoozeItem,
  unsnoozeModifier,
  unsnoozeModifierGroup,
  type ActiveSnoozes,
  type ActiveSnoozeItem,
  type ActiveSnoozeModifier,
} from '@/app/dashboard/actions/item-snooze'
import {
  getCategorySnooze,
  snoozeCategory,
  snoozeCategoryUntilEndOfDay,
  snoozeCategoryForHours,
  snoozeCategoryUntilManual,
  unsnoozeCategory,
} from '@/app/dashboard/actions/category-snooze'

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
      return result.data ?? { items: [], modifiers: [], categories: [] }
    },
    enabled: !!clerkOrgId && !!locationId && locationId !== 'all',
    staleTime: 30 * 1000,
  })
}

function invalidate(
  queryClient: QueryClient,
  clerkOrgId: string,
) {
  queryClient.invalidateQueries({ queryKey: ['snoozed-items', clerkOrgId] })
  // Per-item / per-category control state + every menu view that surfaces
  // effective_availability or category snooze.
  queryClient.invalidateQueries({ queryKey: ['item-snooze'] })
  queryClient.invalidateQueries({ queryKey: ['category-snooze'] })
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

// ============================================================================
// Optimistic-update plumbing.
//
// The out-of-stock badge (menus list + editor toggles) is derived from the
// ['snoozed-items', clerkOrgId, locationId, 'scoped'] cache. Writing to it in
// onMutate flips the badge instantly — the whole point of this file's rewrite:
// previously the badge only appeared after the slow server round-trip + refetch
// (users saw a 2–3 min lag). onSettled always re-syncs from the server, so the
// exact label (e.g. end-of-day in the location's timezone) self-corrects.
// ============================================================================

const SNOOZE_ROOT = 'snoozed-items'

function snoozeKey(clerkOrgId: string, locationId: string) {
  return [SNOOZE_ROOT, clerkOrgId, locationId, 'scoped'] as const
}

/**
 * The instant snooze value used for the optimistic badge. Matches the server for
 * hours/until/until_manual; end_of_day is computed server-side in the location's
 * timezone (unknowable here), so we use a far-future instant — isActivelySnoozed
 * only needs `> now`, and onSettled refetch corrects the displayed label.
 */
function optimisticSnoozedUntil(duration: SnoozeDuration): string {
  switch (duration.kind) {
    case 'until_manual':
      return 'infinity'
    case 'hours':
      return new Date(Date.now() + duration.hours * 3600_000).toISOString()
    case 'until':
      return duration.iso
    case 'end_of_day':
      return new Date(Date.now() + 12 * 3600_000).toISOString()
  }
}

interface SnoozeContext {
  key: readonly [string, string, string, string]
  previous: ActiveSnoozes | undefined
}

/** Cancel in-flight refetches, snapshot for rollback, apply the optimistic edit. */
async function applyOptimistic(
  qc: QueryClient,
  clerkOrgId: string,
  locationId: string,
  mutate: (cur: ActiveSnoozes) => ActiveSnoozes,
): Promise<SnoozeContext> {
  await qc.cancelQueries({ queryKey: [SNOOZE_ROOT, clerkOrgId] })
  const key = snoozeKey(clerkOrgId, locationId)
  const previous = qc.getQueryData<ActiveSnoozes>(key)
  qc.setQueryData<ActiveSnoozes>(key, (old) => mutate(old ?? { items: [], modifiers: [], categories: [] }))
  return { key, previous }
}

function rollback(qc: QueryClient, ctx: SnoozeContext | undefined) {
  if (ctx) qc.setQueryData(ctx.key, ctx.previous)
}

function upsertItem(
  cur: ActiveSnoozes,
  entry: ActiveSnoozeItem,
): ActiveSnoozes {
  return {
    ...cur,
    items: [
      ...cur.items.filter((i) => i.menu_item_id !== entry.menu_item_id),
      entry,
    ],
  }
}

function removeItems(cur: ActiveSnoozes, menuItemIds: string[]): ActiveSnoozes {
  const drop = new Set(menuItemIds)
  return { ...cur, items: cur.items.filter((i) => !drop.has(i.menu_item_id)) }
}

function upsertModifiers(
  cur: ActiveSnoozes,
  entries: ActiveSnoozeModifier[],
): ActiveSnoozes {
  const ids = new Set(entries.map((e) => e.modifier_group_item_id))
  return {
    ...cur,
    modifiers: [
      ...cur.modifiers.filter((m) => !ids.has(m.modifier_group_item_id)),
      ...entries,
    ],
  }
}

function removeModifiers(cur: ActiveSnoozes, ids: string[]): ActiveSnoozes {
  const drop = new Set(ids)
  return {
    ...cur,
    modifiers: cur.modifiers.filter((m) => !drop.has(m.modifier_group_item_id)),
  }
}

// ----------------------------------------------------------------------------
// Item 86
// ----------------------------------------------------------------------------

export interface SnoozeItemVars {
  clerkOrgId: string
  menuItemId: string
  locationId: string
  duration: SnoozeDuration
  reason?: string
  /** Optional row data so the "86'd Items" list renders correctly pre-refetch. */
  itemName?: string
  image?: string | null
}

export function useSnoozeItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ clerkOrgId, menuItemId, locationId, duration, reason }: SnoozeItemVars) => {
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
    onMutate: (vars) => {
      const iso = optimisticSnoozedUntil(vars.duration)
      // The item editor's own per-item control reads a different query key.
      queryClient.setQueryData(['item-snooze', vars.menuItemId, vars.locationId], {
        snoozed_until: iso,
        snooze_reason: vars.reason ?? null,
      })
      return applyOptimistic(queryClient, vars.clerkOrgId, vars.locationId, (cur) => {
        const existing = cur.items.find((i) => i.menu_item_id === vars.menuItemId)
        return upsertItem(cur, {
          kind: 'item',
          menu_item_id: vars.menuItemId,
          name: vars.itemName ?? existing?.name ?? '',
          image: vars.image ?? existing?.image ?? null,
          snoozed_until: iso,
          snooze_reason: vars.reason ?? null,
          updated_at: new Date().toISOString(),
        })
      })
    },
    onError: (e: Error, _vars, ctx) => {
      rollback(queryClient, ctx)
      toast.error(e.message || 'Failed to 86 item')
    },
    onSuccess: (result, _vars, ctx) => {
      if (result.success) {
        toast.success('Item marked out of stock')
      } else {
        rollback(queryClient, ctx)
        toast.error(result.error || 'Failed to 86 item')
      }
    },
    onSettled: (_r, _e, vars) => invalidate(queryClient, vars.clerkOrgId),
  })
}

export interface RestoreItemVars {
  clerkOrgId: string
  menuItemId: string
  locationId: string
}

export function useRestoreItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ clerkOrgId, menuItemId, locationId }: RestoreItemVars) =>
      unsnoozeItem(clerkOrgId, menuItemId, locationId),
    onMutate: (vars) => {
      queryClient.setQueryData(['item-snooze', vars.menuItemId, vars.locationId], {
        snoozed_until: null,
        snooze_reason: null,
      })
      return applyOptimistic(queryClient, vars.clerkOrgId, vars.locationId, (cur) =>
        removeItems(cur, [vars.menuItemId]),
      )
    },
    onError: (e: Error, _vars, ctx) => {
      rollback(queryClient, ctx)
      toast.error(e.message || 'Failed to restore item')
    },
    onSuccess: (result, _vars, ctx) => {
      if (result.success) {
        toast.success('Item restored')
      } else {
        rollback(queryClient, ctx)
        toast.error(result.error || 'Failed to restore item')
      }
    },
    onSettled: (_r, _e, vars) => invalidate(queryClient, vars.clerkOrgId),
  })
}

// ----------------------------------------------------------------------------
// Batch item 86 — one server round-trip + one OrderOut resync for N items.
// ----------------------------------------------------------------------------

export interface SnoozeItemsBatchVars {
  clerkOrgId: string
  menuItemIds: string[]
  locationId: string
  duration: SnoozeDuration
  reason?: string
  /** id -> {name,image} for the selected rows, so optimistic entries render. */
  meta?: Record<string, { name?: string; image?: string | null }>
}

export function useSnoozeItemsBatch() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ clerkOrgId, menuItemIds, locationId, duration, reason }: SnoozeItemsBatchVars) =>
      snoozeItemsBatch(clerkOrgId, menuItemIds, locationId, duration, reason),
    onMutate: (vars) => {
      const iso = optimisticSnoozedUntil(vars.duration)
      const now = new Date().toISOString()
      return applyOptimistic(queryClient, vars.clerkOrgId, vars.locationId, (cur) => {
        let next = cur
        for (const id of vars.menuItemIds) {
          const existing = cur.items.find((i) => i.menu_item_id === id)
          next = upsertItem(next, {
            kind: 'item',
            menu_item_id: id,
            name: vars.meta?.[id]?.name ?? existing?.name ?? '',
            image: vars.meta?.[id]?.image ?? existing?.image ?? null,
            snoozed_until: iso,
            snooze_reason: vars.reason ?? null,
            updated_at: now,
          })
        }
        return next
      })
    },
    onError: (e: Error, _vars, ctx) => {
      rollback(queryClient, ctx)
      toast.error(e.message || 'Failed to mark items out of stock')
    },
    onSuccess: (result, vars, ctx) => {
      if (result.success) {
        toast.success(`${vars.menuItemIds.length} items marked out of stock`)
      } else {
        rollback(queryClient, ctx)
        toast.error(result.error || 'Failed to mark items out of stock')
      }
    },
    onSettled: (_r, _e, vars) => invalidate(queryClient, vars.clerkOrgId),
  })
}

export interface RestoreItemsBatchVars {
  clerkOrgId: string
  menuItemIds: string[]
  locationId: string
}

export function useRestoreItemsBatch() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ clerkOrgId, menuItemIds, locationId }: RestoreItemsBatchVars) =>
      unsnoozeItemsBatch(clerkOrgId, menuItemIds, locationId),
    onMutate: (vars) =>
      applyOptimistic(queryClient, vars.clerkOrgId, vars.locationId, (cur) =>
        removeItems(cur, vars.menuItemIds),
      ),
    onError: (e: Error, _vars, ctx) => {
      rollback(queryClient, ctx)
      toast.error(e.message || 'Failed to restore items')
    },
    onSuccess: (result, vars, ctx) => {
      if (result.success) {
        toast.success(`${vars.menuItemIds.length} items restored`)
      } else {
        rollback(queryClient, ctx)
        toast.error(result.error || 'Failed to restore items')
      }
    },
    onSettled: (_r, _e, vars) => invalidate(queryClient, vars.clerkOrgId),
  })
}

// ----------------------------------------------------------------------------
// Modifier 86 (single option) — now duration-aware (parity with items).
// ----------------------------------------------------------------------------

export interface SnoozeModifierVars {
  clerkOrgId: string
  modifierGroupItemId: string
  locationId: string
  duration: SnoozeDuration
  reason?: string
  /** Optional labels so the "86'd Items" list renders correctly pre-refetch. */
  name?: string
  groupName?: string
  modifierGroupId?: string
}

export function useSnoozeModifier() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ clerkOrgId, modifierGroupItemId, locationId, duration, reason }: SnoozeModifierVars) => {
      switch (duration.kind) {
        case 'end_of_day':
          return snoozeModifierUntilEndOfDay(clerkOrgId, modifierGroupItemId, locationId, reason)
        case 'hours':
          return snoozeModifierForHours(clerkOrgId, modifierGroupItemId, locationId, duration.hours, reason)
        case 'until_manual':
          return snoozeModifierUntilManual(clerkOrgId, modifierGroupItemId, locationId, reason)
        case 'until':
          return snoozeModifier(clerkOrgId, modifierGroupItemId, locationId, duration.iso, reason)
      }
    },
    onMutate: (vars) => {
      const iso = optimisticSnoozedUntil(vars.duration)
      return applyOptimistic(queryClient, vars.clerkOrgId, vars.locationId, (cur) => {
        const existing = cur.modifiers.find(
          (m) => m.modifier_group_item_id === vars.modifierGroupItemId,
        )
        return upsertModifiers(cur, [
          {
            kind: 'modifier',
            modifier_group_item_id: vars.modifierGroupItemId,
            modifier_group_id: vars.modifierGroupId ?? existing?.modifier_group_id ?? '',
            name: vars.name ?? existing?.name ?? '',
            group_name: vars.groupName ?? existing?.group_name ?? '',
            snoozed_until: iso,
            snooze_reason: vars.reason ?? null,
            updated_at: new Date().toISOString(),
          },
        ])
      })
    },
    onError: (e: Error, _vars, ctx) => {
      rollback(queryClient, ctx)
      toast.error(e.message || 'Failed to 86 modifier')
    },
    onSuccess: (result, _vars, ctx) => {
      if (result.success) {
        toast.success('Modifier marked out of stock')
      } else {
        rollback(queryClient, ctx)
        toast.error(result.error || 'Failed to 86 modifier')
      }
    },
    onSettled: (_r, _e, vars) => invalidate(queryClient, vars.clerkOrgId),
  })
}

export interface RestoreModifierVars {
  clerkOrgId: string
  modifierGroupItemId: string
  locationId: string
}

export function useRestoreModifier() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ clerkOrgId, modifierGroupItemId, locationId }: RestoreModifierVars) =>
      unsnoozeModifier(clerkOrgId, modifierGroupItemId, locationId),
    onMutate: (vars) =>
      applyOptimistic(queryClient, vars.clerkOrgId, vars.locationId, (cur) =>
        removeModifiers(cur, [vars.modifierGroupItemId]),
      ),
    onError: (e: Error, _vars, ctx) => {
      rollback(queryClient, ctx)
      toast.error(e.message || 'Failed to restore modifier')
    },
    onSuccess: (result, _vars, ctx) => {
      if (result.success) {
        toast.success('Modifier restored')
      } else {
        rollback(queryClient, ctx)
        toast.error(result.error || 'Failed to restore modifier')
      }
    },
    onSettled: (_r, _e, vars) => invalidate(queryClient, vars.clerkOrgId),
  })
}

// ============================================================================
// Modifier GROUP 86 — snoozes/restores every option in the group at once.
// ============================================================================

export interface SnoozeModifierGroupVars {
  clerkOrgId: string
  modifierGroupId: string
  locationId: string
  duration: SnoozeDuration
  reason?: string
  /** All option ids in the group, for the optimistic fan-out. */
  optionIds?: string[]
}

export function useSnoozeModifierGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ clerkOrgId, modifierGroupId, locationId, duration, reason }: SnoozeModifierGroupVars) => {
      switch (duration.kind) {
        case 'end_of_day':
          return snoozeModifierGroupUntilEndOfDay(clerkOrgId, modifierGroupId, locationId, reason)
        case 'hours':
          return snoozeModifierGroupForHours(clerkOrgId, modifierGroupId, locationId, duration.hours, reason)
        case 'until_manual':
          return snoozeModifierGroupUntilManual(clerkOrgId, modifierGroupId, locationId, reason)
        case 'until':
          return snoozeModifierGroup(clerkOrgId, modifierGroupId, locationId, duration.iso, reason)
      }
    },
    onMutate: (vars) => {
      const iso = optimisticSnoozedUntil(vars.duration)
      const now = new Date().toISOString()
      return applyOptimistic(queryClient, vars.clerkOrgId, vars.locationId, (cur) =>
        upsertModifiers(
          cur,
          (vars.optionIds ?? []).map((id) => {
            const existing = cur.modifiers.find((m) => m.modifier_group_item_id === id)
            return {
              kind: 'modifier' as const,
              modifier_group_item_id: id,
              modifier_group_id: vars.modifierGroupId,
              name: existing?.name ?? '',
              group_name: existing?.group_name ?? '',
              snoozed_until: iso,
              snooze_reason: vars.reason ?? null,
              updated_at: now,
            }
          }),
        ),
      )
    },
    onError: (e: Error, _vars, ctx) => {
      rollback(queryClient, ctx)
      toast.error(e.message || 'Failed to 86 modifier group')
    },
    onSuccess: (result, _vars, ctx) => {
      if (result.success) {
        toast.success('Modifier group marked out of stock')
      } else {
        rollback(queryClient, ctx)
        toast.error(result.error || 'Failed to 86 modifier group')
      }
    },
    onSettled: (_r, _e, vars) => invalidate(queryClient, vars.clerkOrgId),
  })
}

export interface RestoreModifierGroupVars {
  clerkOrgId: string
  modifierGroupId: string
  locationId: string
  optionIds?: string[]
}

export function useRestoreModifierGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ clerkOrgId, modifierGroupId, locationId }: RestoreModifierGroupVars) =>
      unsnoozeModifierGroup(clerkOrgId, modifierGroupId, locationId),
    onMutate: (vars) =>
      applyOptimistic(queryClient, vars.clerkOrgId, vars.locationId, (cur) =>
        removeModifiers(cur, vars.optionIds ?? []),
      ),
    onError: (e: Error, _vars, ctx) => {
      rollback(queryClient, ctx)
      toast.error(e.message || 'Failed to restore modifier group')
    },
    onSuccess: (result, _vars, ctx) => {
      if (result.success) {
        toast.success('Modifier group restored')
      } else {
        rollback(queryClient, ctx)
        toast.error(result.error || 'Failed to restore modifier group')
      }
    },
    onSettled: (_r, _e, vars) => invalidate(queryClient, vars.clerkOrgId),
  })
}

// ============================================================================
// Category 86 — temporary "Sold Out" for a whole category, per location.
// Keeps the category's items on the delivery menu marked Sold Out (does NOT
// hide the category). Mirrors the item snooze hooks.
// ============================================================================

// Per-category snooze state at a location (drives the category 86 control).
export function useCategorySnooze(
  categoryId: string | undefined,
  locationId: string | null,
) {
  return useQuery<{ snoozed_until: string | null; snooze_reason: string | null }>({
    queryKey: ['category-snooze', categoryId ?? null, locationId ?? null],
    queryFn: async () => {
      if (!categoryId || !locationId) {
        return { snoozed_until: null, snooze_reason: null }
      }
      return getCategorySnooze(categoryId, locationId)
    },
    enabled: !!categoryId && !!locationId,
    staleTime: 30 * 1000,
  })
}

export function useSnoozeCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      clerkOrgId,
      categoryId,
      locationId,
      duration,
      reason,
    }: {
      clerkOrgId: string
      categoryId: string
      locationId: string
      duration: SnoozeDuration
      reason?: string
    }) => {
      switch (duration.kind) {
        case 'end_of_day':
          return snoozeCategoryUntilEndOfDay(clerkOrgId, categoryId, locationId, reason)
        case 'hours':
          return snoozeCategoryForHours(clerkOrgId, categoryId, locationId, duration.hours, reason)
        case 'until_manual':
          return snoozeCategoryUntilManual(clerkOrgId, categoryId, locationId, reason)
        case 'until':
          return snoozeCategory(clerkOrgId, categoryId, locationId, duration.iso, reason)
      }
    },
    onSuccess: (result, { clerkOrgId }) => {
      if (result.success) {
        invalidate(queryClient, clerkOrgId)
        toast.success('Category marked out of stock')
      } else {
        toast.error(result.error || 'Failed to 86 category')
      }
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to 86 category'),
  })
}

export function useRestoreCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      clerkOrgId,
      categoryId,
      locationId,
    }: {
      clerkOrgId: string
      categoryId: string
      locationId: string
    }) => unsnoozeCategory(clerkOrgId, categoryId, locationId),
    onSuccess: (result, { clerkOrgId }) => {
      if (result.success) {
        invalidate(queryClient, clerkOrgId)
        toast.success('Category restored')
      } else {
        toast.error(result.error || 'Failed to restore category')
      }
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to restore category'),
  })
}

// Re-export the raw action for callers that build their own snooze flows.
export { snoozeItem }
