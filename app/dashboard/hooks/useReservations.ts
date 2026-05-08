'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  LoadReservationsAction,
  CreateReservationAction,
  UpdateReservationStatusAction,
  UpdateReservationAction,
  CancelReservationAction,
  AssignReservationTablesAction
} from '@/app/dashboard/actions/floor-plan-actions'
import { useClerkOrgId } from '@/app/dashboard/hooks/useLocationScoped'
import { useSelectedLocation } from '@/stores/location-store'
import type { Reservation } from '@/types/floor-plan'

export const reservationKeys = {
  all: (clerkOrgId: string, locationId: string) =>
    ['reservations', clerkOrgId, locationId] as const,
  byDate: (clerkOrgId: string, locationId: string, date: string) =>
    ['reservations', clerkOrgId, locationId, date] as const
}

export function useReservations (date: string, _includeHistory = false) {
  const clerkOrgId = useClerkOrgId()
  const selectedLocation = useSelectedLocation()
  const locationId = selectedLocation?.id ?? ''
  return useQuery({
    queryKey: reservationKeys.byDate(clerkOrgId ?? '', locationId, date),
    queryFn: async () => {
      if (!locationId) return [] as Reservation[]
      return LoadReservationsAction(locationId, date, true)
    },
    enabled: !!clerkOrgId && !!locationId,
    staleTime: 30_000
  })
}

export function useCreateReservation (date: string) {
  const queryClient = useQueryClient()
  const clerkOrgId = useClerkOrgId()
  const selectedLocation = useSelectedLocation()
  const locationId = selectedLocation?.id ?? ''
  return useMutation({
    mutationFn: (params: Parameters<typeof CreateReservationAction>[2]) =>
      CreateReservationAction(clerkOrgId!, locationId, params),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: reservationKeys.byDate(clerkOrgId ?? '', locationId, date),
        refetchType: 'active'
      })
      toast.success('Reservation created')
    },
    onError: (err: Error) =>
      toast.error(`Failed to create reservation: ${err.message}`)
  })
}

export function useUpdateReservationStatus (date: string) {
  const queryClient = useQueryClient()
  const clerkOrgId = useClerkOrgId()
  const selectedLocation = useSelectedLocation()
  const locationId = selectedLocation?.id ?? ''
  return useMutation({
    mutationFn: ({
      reservationId,
      status
    }: {
      reservationId: string
      status: Reservation['status']
    }) =>
      UpdateReservationStatusAction(
        clerkOrgId!,
        locationId,
        reservationId,
        status
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: reservationKeys.byDate(clerkOrgId ?? '', locationId, date),
        refetchType: 'active'
      })
      toast.success('Status updated')
    },
    onError: (err: Error) =>
      toast.error(`Failed to update status: ${err.message}`)
  })
}

export function useUpdateReservation (_date: string) {
  const queryClient = useQueryClient()
  const clerkOrgId = useClerkOrgId()
  const selectedLocation = useSelectedLocation()
  const locationId = selectedLocation?.id ?? ''
  return useMutation({
    mutationFn: ({
      reservationId,
      params
    }: {
      reservationId: string
      params: Parameters<typeof UpdateReservationAction>[3]
    }) =>
      UpdateReservationAction(clerkOrgId!, locationId, reservationId, params),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: reservationKeys.all(clerkOrgId ?? '', locationId),
        refetchType: 'active'
      })
      toast.success('Reservation updated')
    },
    onError: (err: Error) => toast.error(`Failed to update: ${err.message}`)
  })
}

export function useCancelReservation (date: string) {
  const queryClient = useQueryClient()
  const clerkOrgId = useClerkOrgId()
  const selectedLocation = useSelectedLocation()
  const locationId = selectedLocation?.id ?? ''
  return useMutation({
    mutationFn: ({
      reservationId,
      reason
    }: {
      reservationId: string
      reason?: string
    }) =>
      CancelReservationAction(clerkOrgId!, locationId, reservationId, reason),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: reservationKeys.byDate(clerkOrgId ?? '', locationId, date),
        refetchType: 'active'
      })
      toast.success('Reservation cancelled')
    },
    onError: (err: Error) => toast.error(`Failed to cancel: ${err.message}`)
  })
}

export function useAssignReservationTables (date: string) {
  const queryClient = useQueryClient()
  const clerkOrgId = useClerkOrgId()
  const selectedLocation = useSelectedLocation()
  const locationId = selectedLocation?.id ?? ''
  return useMutation({
    mutationFn: ({
      reservationId,
      tableIds
    }: {
      reservationId: string
      tableIds: string[]
    }) =>
      AssignReservationTablesAction(
        clerkOrgId!,
        locationId,
        reservationId,
        tableIds
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: reservationKeys.byDate(clerkOrgId ?? '', locationId, date),
        refetchType: 'active'
      })
      toast.success('Tables assigned')
    },
    onError: (err: Error) =>
      toast.error(`Failed to assign tables: ${err.message}`)
  })
}
