'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
    InitializeFloorPlan,
    LoadFloorPlanStatus,
    CreateFloorPlanAction,
    AddTableAction,
    UpdateTablePositionAction,
    UpdateTablePositionsBatchAction,
    RemoveTableAction,
    UpdateTableRotationAction,
    UpdateTableNameAction,
    MergeTablesAction,
    UnmergeTablesAction,
    LoadWaitlistAction,
    LoadReservationsAction,
} from '../actions/floor-plan-actions'
import { FloorPlan, FloorPlanObject, WaitlistEntry, Reservation } from '@/types/floor-plan'

/**
 * Get all floor plans for a location (includes objects/tables)
 */
export function useFloorPlans(locationId: string | null) {
    return useQuery<FloorPlan[]>({
        queryKey: ['floor-plans', locationId],
        queryFn: () => InitializeFloorPlan(locationId!),
        enabled: !!locationId,
    })
}

/**
 * Get floor plan status with table sessions (for runtime mode)
 */
export function useFloorPlanStatus(floorPlanId: string | null) {
    return useQuery({
        queryKey: ['floor-plan-status', floorPlanId],
        queryFn: () => LoadFloorPlanStatus(floorPlanId!),
        enabled: !!floorPlanId,
    })
}

/**
 * Get waitlist for a location
 */
export function useWaitlist(locationId: string | null) {
    return useQuery<{
        waitlist: WaitlistEntry[]
        summary: {
            total_waiting: number
            total_notified: number
            avg_wait_time: number
        }
    }>({
        queryKey: ['waitlist', locationId],
        queryFn: () => LoadWaitlistAction(locationId!),
        enabled: !!locationId,
    })
}

/**
 * Get reservations for a location
 */
export function useReservations(locationId: string | null, date?: string) {
    return useQuery<Reservation[]>({
        queryKey: ['reservations', locationId, date],
        queryFn: () => LoadReservationsAction(locationId!, date),
        enabled: !!locationId,
    })
}

/**
 * Mutation: Create a new floor plan
 */
export function useCreateFloorPlanMutation(locationId: string | null) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: ({ name, description }: { name: string; description?: string }) =>
            CreateFloorPlanAction(locationId!, name, description),
        onSuccess: (data) => {
            // Invalidate and refetch floor plans
            queryClient.invalidateQueries({ queryKey: ['floor-plans', locationId] })
            return data
        },
    })
}

/**
 * Mutation: Add a table to a floor plan
 */
export function useAddTableMutation(locationId: string | null) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: ({
            floorPlanId,
            tableData,
        }: {
            floorPlanId: string
            tableData: {
                name?: string
                shape_id: string
                category?: string
                x: number
                y: number
                rotation?: number
                capacity?: number
                width?: number
                height?: number
            }
        }) => AddTableAction(floorPlanId, tableData),
        onSuccess: () => {
            // Invalidate floor plans to refetch with new table
            queryClient.invalidateQueries({ queryKey: ['floor-plans', locationId] })
        },
    })
}

/**
 * Mutation: Update table position
 */
export function useUpdateTablePositionMutation(locationId: string | null) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: ({
            tableId,
            x,
            y,
            rotation,
        }: {
            tableId: string
            x: number
            y: number
            rotation?: number
        }) => UpdateTablePositionAction(tableId, x, y, rotation),
        onSuccess: () => {
            // Invalidate floor plans to refetch updated positions
            queryClient.invalidateQueries({ queryKey: ['floor-plans', locationId] })
        },
    })
}

/**
 * Mutation: Batch update table positions
 */
export function useUpdateTablePositionsBatchMutation(locationId: string | null) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (updates: Array<{ id: string; x: number; y: number; rotation?: number }>) =>
            UpdateTablePositionsBatchAction(updates),
        onSuccess: () => {
            // Invalidate floor plans to refetch updated positions
            queryClient.invalidateQueries({ queryKey: ['floor-plans', locationId] })
        },
    })
}

/**
 * Mutation: Remove a table from a floor plan
 */
export function useRemoveTableMutation(locationId: string | null) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (tableId: string) => RemoveTableAction(tableId),
        onSuccess: () => {
            // Invalidate floor plans to refetch without removed table
            queryClient.invalidateQueries({ queryKey: ['floor-plans', locationId] })
        },
    })
}

/**
 * Mutation: Update table rotation
 */
export function useUpdateTableRotationMutation(locationId: string | null) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: ({ tableId, rotation }: { tableId: string; rotation: number }) =>
            UpdateTableRotationAction(tableId, rotation),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['floor-plans', locationId] })
        },
    })
}

/**
 * Mutation: Update table name
 */
export function useUpdateTableNameMutation(locationId: string | null) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: ({ tableId, name }: { tableId: string; name: string }) =>
            UpdateTableNameAction(tableId, name),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['floor-plans', locationId] })
        },
    })
}

/**
 * Mutation: Merge tables
 */
export function useMergeTablesMutation(locationId: string | null) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: ({ tableIds, primaryTableId }: { tableIds: string[]; primaryTableId: string }) =>
            MergeTablesAction(tableIds, primaryTableId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['floor-plans', locationId] })
        },
    })
}

/**
 * Mutation: Unmerge tables
 */
export function useUnmergeTablesMutation(locationId: string | null) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (tableId: string) => UnmergeTablesAction(tableId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['floor-plans', locationId] })
        },
    })
}

