'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminKeys } from './admin-keys'
import {
  getAdminMerchantStations,
  getAdminStationById,
  getAdminNextStationNumber,
  getAdminMerchantStationStats,
  adminCreateStation,
  adminUpdateStation,
  adminDeactivateStation,
  adminReactivateStation,
  adminDeleteStation,
  type CreateStationInput,
  type UpdateStationInput,
  type StationType,
} from '@/app/manage/actions/admin-merchant/stations'
import {
  getAdminMerchantTerminals,
  getAdminTerminalById,
  getAdminAvailableTerminals,
  getAdminMerchantTerminalStats,
  getAdminConnectedTerminals,
  adminCreateTerminal,
  adminUpdateTerminal,
  adminLinkTerminalToStation,
  adminUnlinkTerminalFromStation,
  adminDeleteTerminal,
  adminTestTerminalConnection,
  type CreatePaymentTerminalInput,
  type UpdatePaymentTerminalInput,
} from '@/app/manage/actions/admin-merchant/payment-terminals'

// ============================================================================
// STATION QUERY HOOKS
// ============================================================================

/**
 * Get all stations for a merchant (admin)
 */
export function useAdminMerchantStations(merchantId: string, locationId?: string | null) {
  return useQuery({
    queryKey: adminKeys.merchantStations(merchantId, locationId),
    queryFn: () => getAdminMerchantStations(merchantId, locationId),
    enabled: !!merchantId,
    staleTime: 30 * 1000,
  })
}

/**
 * Get a specific station by ID (admin)
 */
export function useAdminStationById(stationId: string) {
  return useQuery({
    queryKey: ['admin', 'station', stationId],
    queryFn: () => getAdminStationById(stationId),
    enabled: !!stationId,
    staleTime: 30 * 1000,
  })
}

/**
 * Get station statistics for a merchant (admin)
 */
export function useAdminMerchantStationStats(merchantId: string, locationId?: string | null) {
  return useQuery({
    queryKey: adminKeys.merchantStationStats(merchantId, locationId),
    queryFn: () => getAdminMerchantStationStats(merchantId, locationId),
    enabled: !!merchantId,
    staleTime: 30 * 1000,
  })
}

/**
 * Get next station number for a location and type (admin)
 */
export function useAdminNextStationNumber(locationId: string, stationType: StationType) {
  return useQuery({
    queryKey: ['admin', 'next-station-number', locationId, stationType],
    queryFn: () => getAdminNextStationNumber(locationId, stationType),
    enabled: !!locationId && !!stationType,
    staleTime: 0, // Always fetch fresh
  })
}

// ============================================================================
// STATION MUTATION HOOKS
// ============================================================================

/**
 * Create a new station (admin)
 */
export function useAdminCreateStation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      merchantId,
      input,
    }: {
      merchantId: string
      input: CreateStationInput
    }) => adminCreateStation(merchantId, input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: [...adminKeys.merchants(), variables.merchantId, 'stations'],
      })
      queryClient.invalidateQueries({
        queryKey: [...adminKeys.merchants(), variables.merchantId, 'station-stats'],
      })
    },
  })
}

/**
 * Update a station (admin)
 */
export function useAdminUpdateStation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      merchantId,
      stationId,
      input,
    }: {
      merchantId: string
      stationId: string
      input: UpdateStationInput
    }) => adminUpdateStation(stationId, input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: [...adminKeys.merchants(), variables.merchantId, 'stations'],
      })
    },
  })
}

/**
 * Deactivate a station (admin)
 */
export function useAdminDeactivateStation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      merchantId,
      stationId,
    }: {
      merchantId: string
      stationId: string
    }) => adminDeactivateStation(stationId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: [...adminKeys.merchants(), variables.merchantId, 'stations'],
      })
      queryClient.invalidateQueries({
        queryKey: [...adminKeys.merchants(), variables.merchantId, 'station-stats'],
      })
    },
  })
}

/**
 * Reactivate a station (admin)
 */
export function useAdminReactivateStation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      merchantId,
      stationId,
    }: {
      merchantId: string
      stationId: string
    }) => adminReactivateStation(stationId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: [...adminKeys.merchants(), variables.merchantId, 'stations'],
      })
      queryClient.invalidateQueries({
        queryKey: [...adminKeys.merchants(), variables.merchantId, 'station-stats'],
      })
    },
  })
}

/**
 * Delete a station (admin)
 */
export function useAdminDeleteStation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      merchantId,
      stationId,
    }: {
      merchantId: string
      stationId: string
    }) => adminDeleteStation(stationId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: [...adminKeys.merchants(), variables.merchantId, 'stations'],
      })
      queryClient.invalidateQueries({
        queryKey: [...adminKeys.merchants(), variables.merchantId, 'station-stats'],
      })
    },
  })
}

// ============================================================================
// PAYMENT TERMINAL QUERY HOOKS
// ============================================================================

/**
 * Get all payment terminals for a merchant (admin)
 */
export function useAdminMerchantTerminals(merchantId: string, locationId?: string | null) {
  return useQuery({
    queryKey: adminKeys.merchantPaymentTerminals(merchantId, locationId),
    queryFn: () => getAdminMerchantTerminals(merchantId, locationId),
    enabled: !!merchantId,
    staleTime: 30 * 1000,
  })
}

/**
 * Get a specific terminal by ID (admin)
 */
export function useAdminTerminalById(terminalId: string) {
  return useQuery({
    queryKey: ['admin', 'terminal', terminalId],
    queryFn: () => getAdminTerminalById(terminalId),
    enabled: !!terminalId,
    staleTime: 30 * 1000,
  })
}

/**
 * Get available (unassigned) terminals for a location (admin)
 */
export function useAdminAvailableTerminals(locationId: string) {
  return useQuery({
    queryKey: ['admin', 'available-terminals', locationId],
    queryFn: () => getAdminAvailableTerminals(locationId),
    enabled: !!locationId,
    staleTime: 30 * 1000,
  })
}

/**
 * Get terminal statistics for a merchant (admin)
 */
export function useAdminMerchantTerminalStats(merchantId: string, locationId?: string | null) {
  return useQuery({
    queryKey: adminKeys.merchantTerminalStats(merchantId, locationId),
    queryFn: () => getAdminMerchantTerminalStats(merchantId, locationId),
    enabled: !!merchantId,
    staleTime: 30 * 1000,
  })
}

/**
 * Get the UNIQUE connected terminals (by serial number) for a merchant (admin).
 * One row per physical terminal with live connection state + auto-settle config.
 */
export function useAdminConnectedTerminals(merchantId: string, locationId?: string | null) {
  return useQuery({
    queryKey: adminKeys.merchantConnectedTerminals(merchantId, locationId),
    queryFn: () => getAdminConnectedTerminals(merchantId, locationId),
    enabled: !!merchantId,
    staleTime: 30 * 1000,
    refetchInterval: 3 * 60 * 1000, // reflect online/offline changes (~connection-test cadence)
  })
}

// ============================================================================
// PAYMENT TERMINAL MUTATION HOOKS
// ============================================================================

/**
 * Create a new payment terminal (admin)
 */
export function useAdminCreateTerminal() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      merchantId,
      input,
    }: {
      merchantId: string
      input: CreatePaymentTerminalInput
    }) => adminCreateTerminal(merchantId, input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: [...adminKeys.merchants(), variables.merchantId, 'payment-terminals'],
      })
      queryClient.invalidateQueries({
        queryKey: [...adminKeys.merchants(), variables.merchantId, 'terminal-stats'],
      })
    },
  })
}

/**
 * Update a payment terminal (admin)
 */
export function useAdminUpdateTerminal() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      merchantId,
      terminalId,
      input,
    }: {
      merchantId: string
      terminalId: string
      input: UpdatePaymentTerminalInput
    }) => adminUpdateTerminal(terminalId, input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: [...adminKeys.merchants(), variables.merchantId, 'payment-terminals'],
      })
      queryClient.invalidateQueries({
        queryKey: [...adminKeys.merchants(), variables.merchantId, 'connected-terminals'],
      })
      queryClient.invalidateQueries({
        queryKey: [...adminKeys.merchants(), variables.merchantId, 'terminal-stats'],
      })
    },
  })
}

/**
 * Link a terminal to a station (admin)
 */
export function useAdminLinkTerminal() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      merchantId,
      terminalId,
      stationId,
    }: {
      merchantId: string
      terminalId: string
      stationId: string
    }) => adminLinkTerminalToStation(terminalId, stationId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: [...adminKeys.merchants(), variables.merchantId, 'payment-terminals'],
      })
      queryClient.invalidateQueries({
        queryKey: [...adminKeys.merchants(), variables.merchantId, 'stations'],
      })
    },
  })
}

/**
 * Unlink a terminal from its station (admin)
 */
export function useAdminUnlinkTerminal() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      merchantId,
      terminalId,
    }: {
      merchantId: string
      terminalId: string
    }) => adminUnlinkTerminalFromStation(terminalId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: [...adminKeys.merchants(), variables.merchantId, 'payment-terminals'],
      })
      queryClient.invalidateQueries({
        queryKey: [...adminKeys.merchants(), variables.merchantId, 'stations'],
      })
    },
  })
}

/**
 * Delete a payment terminal (admin)
 */
export function useAdminDeleteTerminal() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      merchantId,
      terminalId,
    }: {
      merchantId: string
      terminalId: string
    }) => adminDeleteTerminal(terminalId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: [...adminKeys.merchants(), variables.merchantId, 'payment-terminals'],
      })
      queryClient.invalidateQueries({
        queryKey: [...adminKeys.merchants(), variables.merchantId, 'terminal-stats'],
      })
    },
  })
}

/**
 * Test terminal connection (admin)
 */
export function useAdminTestTerminalConnection() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      merchantId,
      terminalId,
    }: {
      merchantId: string
      terminalId: string
    }) => adminTestTerminalConnection(terminalId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: [...adminKeys.merchants(), variables.merchantId, 'payment-terminals'],
      })
      queryClient.invalidateQueries({
        queryKey: [...adminKeys.merchants(), variables.merchantId, 'terminal-stats'],
      })
    },
  })
}
