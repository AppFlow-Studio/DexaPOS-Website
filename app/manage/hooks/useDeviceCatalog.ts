import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getDeviceCatalog,
  createDeviceCatalogItem,
  updateDeviceCatalogItem,
  deleteDeviceCatalogItem,
  toggleDeviceCatalogItemStatus,
  type DeviceCatalogFilters,
  type CreateDeviceCatalogInput,
  type UpdateDeviceCatalogInput,
  type DeviceCatalogItem,
} from '../actions/device-catalog'

const QUERY_KEY = ['admin-device-catalog'] as const

export function useDeviceCatalog(filters?: DeviceCatalogFilters) {
  return useQuery({
    queryKey: [...QUERY_KEY, filters],
    queryFn: async () => {
      const result = await getDeviceCatalog(filters)
      if (!result.success) throw new Error(result.error ?? 'Failed to fetch device catalog')
      return result.data as DeviceCatalogItem[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateDevice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateDeviceCatalogInput) => {
      const result = await createDeviceCatalogItem(input)
      if (!result.success) throw new Error(result.error ?? 'Failed to create device')
      return result.data as DeviceCatalogItem
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}

export function useUpdateDevice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateDeviceCatalogInput }) => {
      const result = await updateDeviceCatalogItem(id, input)
      if (!result.success) throw new Error(result.error ?? 'Failed to update device')
      return result.data as DeviceCatalogItem
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}

export function useToggleDeviceStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await toggleDeviceCatalogItemStatus(id)
      if (!result.success) throw new Error(result.error ?? 'Failed to toggle status')
      return result.data as DeviceCatalogItem
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}

export function useDeleteDevice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteDeviceCatalogItem(id)
      if (!result.success) throw new Error(result.error ?? 'Failed to delete device')
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}
