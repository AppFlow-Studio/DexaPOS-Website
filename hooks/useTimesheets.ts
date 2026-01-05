'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
    GetTimesheets,
    GetTimesheetResources,
    GetShiftById,
    UpdateShiftStatus,
    AdjustShiftTimes,
    DeleteShift,
    BulkApproveShifts,
} from '@/app/dashboard/actions/timesheets'
import { StaffShift } from '@/types/staff'
import { DateRange } from 'react-day-picker'
import { toast } from 'sonner'

// ============================================================================
// TYPES
// ============================================================================

interface TimesheetFilters {
    dateRange: DateRange | undefined
    locationIds: string[]
    employeeIds: string[]
}

// ============================================================================
// GET TIMESHEETS
// ============================================================================

export function useTimesheets(filters: TimesheetFilters) {
    const hasDateRange = !!filters.dateRange?.from

    return useQuery({
        queryKey: ['timesheets', filters],
        queryFn: async () => {
            if (!filters.dateRange?.from) return []

            const dateFrom = filters.dateRange.from.toISOString()
            const dateTo = filters.dateRange.to?.toISOString() || filters.dateRange.from.toISOString()

            const result = await GetTimesheets({
                dateFrom,
                dateTo,
                locationIds: filters.locationIds.length > 0 ? filters.locationIds : undefined,
                employeeIds: filters.employeeIds.length > 0 ? filters.employeeIds : undefined,
            })

            if (!result.success) {
                throw new Error(result.error)
            }

            return result.data
        },
        enabled: hasDateRange,
    })
}

// ============================================================================
// GET TIMESHEET RESOURCES (for filters)
// ============================================================================

export function useTimesheetResources() {
    return useQuery({
        queryKey: ['timesheet-resources'],
        queryFn: async () => {
            const result = await GetTimesheetResources()

            if (!result.success) {
                throw new Error(result.error)
            }

            return result.data
        },
    })
}

// ============================================================================
// GET SINGLE SHIFT
// ============================================================================

export function useShift(shiftId: string | null) {
    return useQuery({
        queryKey: ['shift', shiftId],
        queryFn: async () => {
            if (!shiftId) return null

            const result = await GetShiftById(shiftId)

            if (!result.success) {
                throw new Error(result.error)
            }

            return result.data
        },
        enabled: !!shiftId,
    })
}

// ============================================================================
// UPDATE SHIFT STATUS
// ============================================================================

export function useUpdateShiftStatus() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ 
            shiftId, 
            status 
        }: { 
            shiftId: string
            status: 'active' | 'completed' | 'approved' | 'rejected' 
        }) => {
            return UpdateShiftStatus(shiftId, status)
        },
        onSuccess: (result) => {
            if (result.success) {
                toast.success('Shift status updated')
                queryClient.invalidateQueries({ queryKey: ['timesheets'] })
                queryClient.invalidateQueries({ queryKey: ['shift', result.data.id] })
            } else {
                toast.error(result.error || 'Failed to update shift status')
            }
        },
        onError: () => {
            toast.error('Failed to update shift status')
        },
    })
}

// ============================================================================
// ADJUST SHIFT TIMES
// ============================================================================

export function useAdjustShiftTimes() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ 
            shiftId, 
            clockInTime, 
            clockOutTime 
        }: { 
            shiftId: string
            clockInTime: string
            clockOutTime: string | null 
        }) => {
            return AdjustShiftTimes(shiftId, clockInTime, clockOutTime)
        },
        onSuccess: (result) => {
            if (result.success) {
                toast.success('Shift times adjusted')
                queryClient.invalidateQueries({ queryKey: ['timesheets'] })
                queryClient.invalidateQueries({ queryKey: ['shift', result.data.id] })
            } else {
                toast.error(result.error || 'Failed to adjust shift times')
            }
        },
        onError: () => {
            toast.error('Failed to adjust shift times')
        },
    })
}

// ============================================================================
// DELETE SHIFT
// ============================================================================

export function useDeleteShift() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (shiftId: string) => {
            return DeleteShift(shiftId)
        },
        onSuccess: (result) => {
            if (result.success) {
                toast.success('Shift deleted')
                queryClient.invalidateQueries({ queryKey: ['timesheets'] })
            } else {
                toast.error(result.error || 'Failed to delete shift')
            }
        },
        onError: () => {
            toast.error('Failed to delete shift')
        },
    })
}

// ============================================================================
// BULK APPROVE SHIFTS
// ============================================================================

export function useBulkApproveShifts() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (shiftIds: string[]) => {
            return BulkApproveShifts(shiftIds)
        },
        onSuccess: (result) => {
            if (result.success) {
                toast.success(`${result.data} shift(s) approved`)
                queryClient.invalidateQueries({ queryKey: ['timesheets'] })
            } else {
                toast.error(result.error || 'Failed to approve shifts')
            }
        },
        onError: () => {
            toast.error('Failed to approve shifts')
        },
    })
}
