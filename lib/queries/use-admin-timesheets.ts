'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { adminKeys } from './admin-keys'
import {
  getAdminTimesheets,
  getAdminTimesheetResources,
  updateAdminShiftStatus,
  adjustAdminShiftTimes,
  deleteAdminShift,
  bulkApproveAdminShifts,
} from '@/app/manage/actions/admin-merchant/timesheets'
import { StaffShift } from '@/types/staff'

export function useAdminTimesheets(
  merchantId: string,
  filters: {
    dateFrom: string
    dateTo: string
    locationIds?: string[]
    employeeIds?: string[]
  }
) {
  return useQuery({
    queryKey: adminKeys.merchantTimesheets(merchantId, filters),
    queryFn: async () => {
      const result = await getAdminTimesheets(merchantId, filters)
      if (!result.success) throw new Error(result.error)
      return result.data
    },
    enabled: !!merchantId && !!filters.dateFrom,
  })
}

export function useAdminTimesheetResources(merchantId: string) {
  return useQuery({
    queryKey: adminKeys.merchantTimesheetResources(merchantId),
    queryFn: async () => {
      const result = await getAdminTimesheetResources(merchantId)
      if (!result.success) throw new Error(result.error)
      return result.data
    },
    enabled: !!merchantId,
  })
}

export function useAdminUpdateShiftStatus(merchantId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      shiftId,
      status,
    }: {
      shiftId: string
      status: 'active' | 'completed' | 'approved' | 'rejected'
    }) => {
      const result = await updateAdminShiftStatus(merchantId, shiftId, status)
      if (!result.success) throw new Error(result.error)
      return result.data
    },
    onSuccess: (data) => {
      toast.success(`Shift status updated to ${data.status}`)
      queryClient.invalidateQueries({
        queryKey: adminKeys.merchantTimesheets(merchantId, {} as any).slice(0, 3),
      })
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update shift status')
    },
  })
}

export function useAdminAdjustShiftTimes(merchantId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      shiftId,
      clockInTime,
      clockOutTime,
    }: {
      shiftId: string
      clockInTime: string
      clockOutTime: string | null
    }) => {
      const result = await adjustAdminShiftTimes(
        merchantId,
        shiftId,
        clockInTime,
        clockOutTime
      )
      if (!result.success) throw new Error(result.error)
      return result.data
    },
    onSuccess: () => {
      toast.success('Shift times updated')
      queryClient.invalidateQueries({
        queryKey: adminKeys.merchantTimesheets(merchantId, {} as any).slice(0, 3),
      })
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to adjust shift times')
    },
  })
}

export function useAdminDeleteShift(merchantId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (shiftId: string) => {
      const result = await deleteAdminShift(merchantId, shiftId)
      if (!result.success) throw new Error(result.error)
      return result.data
    },
    onSuccess: () => {
      toast.success('Shift deleted')
      queryClient.invalidateQueries({
        queryKey: adminKeys.merchantTimesheets(merchantId, {} as any).slice(0, 3),
      })
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to delete shift')
    },
  })
}

export function useAdminBulkApproveShifts(merchantId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (shiftIds: string[]) => {
      const result = await bulkApproveAdminShifts(merchantId, shiftIds)
      if (!result.success) throw new Error(result.error)
      return result.data
    },
    onSuccess: (count) => {
      toast.success(`Approved ${count} shifts`)
      queryClient.invalidateQueries({
        queryKey: adminKeys.merchantTimesheets(merchantId, {} as any).slice(0, 3),
      })
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to bulk approve shifts')
    },
  })
}
