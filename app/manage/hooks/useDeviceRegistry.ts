import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  assignDeviceStatus,
  getAdminDeviceActivity,
  getAdminDeviceDetail,
  getAdminDeviceInventory,
  getAdminDeviceOverview,
  getAdminDeviceSummary,
  getDeviceTransitionTargets,
  searchAdminDeviceRegistry,
} from '../actions/device-registry'
import type { AdminDeviceInventoryFilters, AssignDevicePayload } from '@/types/device-registry'

export const REGISTRY_QUERY_KEY = ['admin-device-registry'] as const

export function useAdminDeviceInventory(filters?: AdminDeviceInventoryFilters) {
  return useQuery({
    queryKey: [...REGISTRY_QUERY_KEY, 'inventory', filters],
    queryFn: async () => {
      const result = await getAdminDeviceInventory(filters)
      if (!result.success) {
        throw new Error(result.error ?? 'Failed to load device inventory')
      }
      return result.data ?? []
    },
    staleTime: 60_000,
  })
}

export function useAdminDeviceSummary() {
  return useQuery({
    queryKey: [...REGISTRY_QUERY_KEY, 'summary'],
    queryFn: async () => {
      const result = await getAdminDeviceSummary()
      if (!result.success) {
        throw new Error(result.error ?? 'Failed to load device summary')
      }
      return result.data ?? []
    },
    staleTime: 60_000,
  })
}

export function useAdminDeviceOverview() {
  return useQuery({
    queryKey: [...REGISTRY_QUERY_KEY, 'overview'],
    queryFn: async () => {
      const result = await getAdminDeviceOverview()
      if (!result.success || !result.data) {
        throw new Error(result.error ?? 'Failed to load device overview')
      }
      return result.data
    },
    staleTime: 60_000,
  })
}

export function useDeviceRegistryCommandSearch(query: string, enabled: boolean = true) {
  return useQuery({
    queryKey: [...REGISTRY_QUERY_KEY, 'command-search', query],
    queryFn: async () => {
      const result = await searchAdminDeviceRegistry(query)
      if (!result.success) {
        throw new Error(result.error ?? 'Failed to search device registry')
      }
      return result.data ?? []
    },
    enabled: enabled && Boolean(query.trim()),
    staleTime: 30_000,
  })
}

export function useAdminDeviceDetail(deviceId: string) {
  return useQuery({
    queryKey: [...REGISTRY_QUERY_KEY, 'detail', deviceId],
    queryFn: async () => {
      const result = await getAdminDeviceDetail(deviceId)
      if (!result.success) {
        throw new Error(result.error ?? 'Failed to load device detail')
      }
      return result.data
    },
    enabled: Boolean(deviceId),
    staleTime: 60_000,
  })
}

export function useAdminDeviceActivity(deviceId: string) {
  return useQuery({
    queryKey: [...REGISTRY_QUERY_KEY, 'activity', deviceId],
    queryFn: async () => {
      const result = await getAdminDeviceActivity(deviceId)
      if (!result.success) {
        throw new Error(result.error ?? 'Failed to load device activity')
      }
      return result.data ?? []
    },
    enabled: Boolean(deviceId),
    staleTime: 30_000,
  })
}

export function useDeviceTransitionTargets(enabled: boolean = true) {
  return useQuery({
    queryKey: [...REGISTRY_QUERY_KEY, 'transition-targets'],
    queryFn: async () => {
      const result = await getDeviceTransitionTargets()
      if (!result.success || !result.data) {
        throw new Error(result.error ?? 'Failed to load transition targets')
      }
      return result.data
    },
    enabled,
    staleTime: 5 * 60_000,
  })
}

export function useAssignDeviceStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: AssignDevicePayload) => {
      const result = await assignDeviceStatus(payload)
      if (!result.success || !result.data?.success) {
        throw new Error(result.error ?? 'Failed to update device status')
      }
      return result.data
    },
    onSuccess: async (data) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: REGISTRY_QUERY_KEY }),
        data.device_id
          ? queryClient.invalidateQueries({
              queryKey: [...REGISTRY_QUERY_KEY, 'detail', data.device_id],
            })
          : Promise.resolve(),
        data.device_id
          ? queryClient.invalidateQueries({
              queryKey: [...REGISTRY_QUERY_KEY, 'activity', data.device_id],
            })
          : Promise.resolve(),
      ])
    },
  })
}
