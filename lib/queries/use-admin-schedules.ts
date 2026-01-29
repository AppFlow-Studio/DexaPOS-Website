'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { adminKeys } from './admin-keys'
import {
  getAdminSchedules,
  createAdminSchedule,
  updateAdminSchedule,
  deleteAdminSchedule,
  type AdminSchedule,
} from '@/app/manage/actions/admin-merchant/schedules'

export function useAdminSchedules(
  merchantId: string,
  locationId: string | null = 'all'
) {
  return useQuery<AdminSchedule[]>({
    queryKey: adminKeys.merchantSchedules(merchantId, locationId),
    queryFn: () => getAdminSchedules(merchantId, locationId),
    enabled: !!merchantId,
  })
}

export function useAdminCreateSchedule(merchantId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: any) => createAdminSchedule(merchantId, data),
    onSuccess: (result) => {
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success('Schedule created successfully')
        queryClient.invalidateQueries({
          queryKey: adminKeys.merchantSchedules(merchantId, 'all'),
        })
      }
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to create schedule')
    },
  })
}

export function useAdminUpdateSchedule(merchantId: string, scheduleId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: any) => updateAdminSchedule(merchantId, scheduleId, data),
    onSuccess: (result) => {
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success('Schedule updated successfully')
        queryClient.invalidateQueries({
          queryKey: adminKeys.merchantSchedules(merchantId, 'all'),
        })
      }
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update schedule')
    },
  })
}

export function useAdminDeleteSchedule(merchantId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (scheduleId: string) => deleteAdminSchedule(merchantId, scheduleId),
    onSuccess: (result) => {
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success('Schedule deleted successfully')
        queryClient.invalidateQueries({
          queryKey: adminKeys.merchantSchedules(merchantId, 'all'),
        })
      }
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to delete schedule')
    },
  })
}

export function useAdminToggleScheduleStatus(merchantId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ scheduleId, isActive }: { scheduleId: string; isActive: boolean }) =>
      updateAdminSchedule(merchantId, scheduleId, { is_active: isActive }),
    onSuccess: (result) => {
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(result.data?.is_active ? 'Schedule activated' : 'Schedule deactivated')
        queryClient.invalidateQueries({
          queryKey: adminKeys.merchantSchedules(merchantId, 'all'),
        })
      }
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to toggle schedule status')
    },
  })
}
