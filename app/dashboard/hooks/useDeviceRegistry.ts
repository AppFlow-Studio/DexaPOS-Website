import { useQuery } from '@tanstack/react-query'

import {
  getMerchantDeviceActivity,
  getMerchantDeviceInventory,
} from '../actions/device-registry'

export const MERCHANT_DEVICE_REGISTRY_QUERY_KEY = ['merchant-device-registry'] as const

export function useMerchantDeviceInventory() {
  return useQuery({
    queryKey: [...MERCHANT_DEVICE_REGISTRY_QUERY_KEY, 'inventory'],
    queryFn: async () => {
      const result = await getMerchantDeviceInventory()
      if (!result.success) {
        throw new Error(result.error ?? 'Failed to load devices')
      }
      return result.data ?? []
    },
    staleTime: 60_000,
  })
}

export function useMerchantDeviceActivity(deviceId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: [...MERCHANT_DEVICE_REGISTRY_QUERY_KEY, 'activity', deviceId],
    queryFn: async () => {
      const result = await getMerchantDeviceActivity(deviceId)
      if (!result.success) {
        throw new Error(result.error ?? 'Failed to load device activity')
      }
      return result.data ?? []
    },
    enabled: enabled && Boolean(deviceId),
    staleTime: 30_000,
  })
}
