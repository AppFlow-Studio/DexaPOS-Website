'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import {
  getLocationStationMenuCoverage,
  getStationMenuOptions,
  getStationMenuScope,
  setStationMenuScope,
} from '@/app/dashboard/actions/station-menus'
import type { StationMenuScope } from '@/lib/stations/station-menu-scope'

export const stationMenuScopeKeys = {
  scope: (stationId: string | undefined) =>
    ['station-menu-scope', stationId] as const,
  options: (locationId: string | undefined) =>
    ['station-menu-options', locationId] as const,
  coverage: (locationId: string | null | undefined) =>
    ['station-menu-coverage', locationId] as const,
}

/**
 * Which stations at the location show which menus — one query for the whole
 * menu list. Read by `MenuStationCoverage` on the menu page; the join per menu
 * happens on the client.
 */
export function useLocationStationMenuCoverage(
  locationId: string | null | undefined,
) {
  return useQuery({
    queryKey: stationMenuScopeKeys.coverage(locationId),
    queryFn: async () => {
      const result = await getLocationStationMenuCoverage(locationId!)
      if (result.error || !result.data) {
        throw new Error(result.error ?? 'Failed to load station coverage')
      }
      return result.data
    },
    enabled: !!locationId && locationId !== 'all',
    staleTime: 30 * 1000,
  })
}

/** The station's saved scope + selected menu ids. */
export function useStationMenuScope(stationId: string | undefined) {
  return useQuery({
    queryKey: stationMenuScopeKeys.scope(stationId),
    queryFn: async () => {
      const result = await getStationMenuScope(stationId!)
      if (result.error || !result.data) {
        throw new Error(result.error ?? 'Failed to load station menus')
      }
      return result.data
    },
    enabled: !!stationId,
    staleTime: 30 * 1000,
  })
}

/** Every menu a station at this location could render, with channel flags. */
export function useStationMenuOptions(locationId: string | undefined) {
  return useQuery({
    queryKey: stationMenuScopeKeys.options(locationId),
    queryFn: async () => {
      const result = await getStationMenuOptions(locationId!)
      if (result.error) throw new Error(result.error)
      return result.data
    },
    enabled: !!locationId && locationId !== 'all',
    staleTime: 30 * 1000,
  })
}

export function useSetStationMenuScope() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      stationId,
      scope,
      menuIds,
    }: {
      stationId: string
      scope: StationMenuScope
      menuIds: string[]
    }) => {
      const result = await setStationMenuScope(stationId, scope, menuIds)
      if (!result.success || !result.data) {
        throw new Error(result.error ?? 'Failed to update station menus')
      }
      return result.data
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: stationMenuScopeKeys.scope(variables.stationId),
      })
      // The menu page's "N of M stations" pill reads the same rows.
      queryClient.invalidateQueries({ queryKey: ['station-menu-coverage'] })
      // The station detail query reads `menu_scope` off the row.
      queryClient.invalidateQueries({ queryKey: ['stations'] })
      toast.success('Station menus updated')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update station menus')
    },
  })
}
