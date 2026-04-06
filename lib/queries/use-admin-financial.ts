'use client'

import { toast } from 'sonner'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { adminKeys } from './admin-keys'
import {
  adminApproveTipDistribution,
  adminCalculateTipDistribution,
  adminDeleteInvoice,
  adminUpdateInvoiceStatus,
  adminUpdateTipManualAdjustment,
  getAdminInvoices,
  getAdminPayments,
  getAdminTipDistributionHistory,
  getAdminTipDistributionSession,
} from '@/app/manage/actions/admin-merchant/financial'
import type { InvoiceStatus } from '@/app/dashboard/actions/invoices'
import type { PaymentFilters } from '@/types/payment'

export function useAdminPayments(
  merchantId: string,
  locationId?: string | null,
  filters?: PaymentFilters
) {
  return useQuery({
    queryKey: adminKeys.merchantPayments(
      merchantId,
      locationId,
      (filters ?? {}) as Record<string, unknown>
    ),
    queryFn: () => getAdminPayments(merchantId, locationId, filters),
    enabled: !!merchantId,
    staleTime: 5_000,
  })
}

export function useAdminInvoices(
  merchantId: string,
  locationId?: string | null,
  status?: InvoiceStatus | null
) {
  return useQuery({
    queryKey: adminKeys.merchantInvoices(merchantId, locationId, status),
    queryFn: () => getAdminInvoices(merchantId, locationId, status),
    enabled: !!merchantId,
    staleTime: 10_000,
  })
}

export function useAdminUpdateInvoiceStatus(merchantId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      invoiceId,
      status,
    }: {
      invoiceId: string
      status: InvoiceStatus
    }) => adminUpdateInvoiceStatus(merchantId, invoiceId, status),
    onSuccess: (result, variables) => {
      if (!result.success) {
        toast.error('Failed to update invoice status', {
          description: result.error,
        })
        return
      }

      toast.success(`Invoice marked as ${variables.status}`)
      queryClient.invalidateQueries({
        queryKey: [...adminKeys.merchants(), merchantId, 'invoices'],
      })
    },
    onError: () => {
      toast.error('Failed to update invoice status')
    },
  })
}

export function useAdminDeleteInvoice(merchantId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (invoiceId: string) => adminDeleteInvoice(merchantId, invoiceId),
    onSuccess: (result) => {
      if (!result.success) {
        toast.error('Failed to delete invoice', {
          description: result.error,
        })
        return
      }

      toast.success('Invoice deleted')
      queryClient.invalidateQueries({
        queryKey: [...adminKeys.merchants(), merchantId, 'invoices'],
      })
    },
    onError: () => {
      toast.error('Failed to delete invoice')
    },
  })
}

export function useAdminTipDistributionSession(
  merchantId: string,
  locationId: string | undefined,
  sessionDate: string | undefined,
  shiftPeriod: string = 'full_day'
) {
  return useQuery({
    queryKey: locationId && sessionDate
      ? adminKeys.merchantTipSession(merchantId, locationId, sessionDate, shiftPeriod)
      : [...adminKeys.merchants(), merchantId, 'tips', 'session', 'idle'],
    queryFn: async () => {
      if (!merchantId || !locationId || !sessionDate) {
        return null
      }

      const result = await getAdminTipDistributionSession(
        merchantId,
        locationId,
        sessionDate,
        shiftPeriod
      )

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch tip distribution session')
      }

      return result.data
    },
    enabled: !!merchantId && !!locationId && !!sessionDate,
    staleTime: 10_000,
  })
}

export function useAdminTipDistributionHistory(
  merchantId: string,
  locationId: string | undefined
) {
  return useQuery({
    queryKey: locationId
      ? adminKeys.merchantTipHistory(merchantId, locationId)
      : [...adminKeys.merchants(), merchantId, 'tips', 'history', 'idle'],
    queryFn: async () => {
      if (!merchantId || !locationId) {
        return []
      }

      const result = await getAdminTipDistributionHistory(merchantId, locationId)
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch tip distribution history')
      }

      return result.data || []
    },
    enabled: !!merchantId && !!locationId,
    staleTime: 30_000,
  })
}

export function useAdminCalculateTipDistribution() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      merchantId,
      locationId,
      sessionDate,
      shiftPeriod,
    }: {
      merchantId: string
      locationId: string
      sessionDate: string
      shiftPeriod: string
    }) =>
      adminCalculateTipDistribution(
        merchantId,
        locationId,
        sessionDate,
        shiftPeriod,
        null
      ),
    onSuccess: async (result, variables) => {
      if (!result.success) {
        toast.error(result.error || 'Failed to calculate tips')
        return
      }

      await queryClient.invalidateQueries({
        queryKey: adminKeys.merchantTipSession(
          variables.merchantId,
          variables.locationId,
          variables.sessionDate,
          variables.shiftPeriod
        ),
      })
      await queryClient.invalidateQueries({
        queryKey: adminKeys.merchantTipHistory(
          variables.merchantId,
          variables.locationId
        ),
      })
      toast.success('Tips calculated successfully')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to calculate tips')
    },
  })
}

export function useAdminApproveTipDistribution() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      merchantId,
      sessionId,
    }: {
      merchantId: string
      sessionId: string
    }) => adminApproveTipDistribution(merchantId, sessionId, null),
    onSuccess: async (result, variables) => {
      if (!result.success) {
        toast.error(result.error || 'Failed to approve distribution')
        return
      }

      await queryClient.invalidateQueries({
        queryKey: [...adminKeys.merchants(), variables.merchantId, 'tips'],
      })
      toast.success('Distribution approved successfully')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to approve distribution')
    },
  })
}

export function useAdminTipManualAdjustment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      merchantId,
      detailId,
      amount,
      reason,
    }: {
      merchantId: string
      detailId: string
      amount: number
      reason?: string
    }) => adminUpdateTipManualAdjustment(merchantId, detailId, amount, reason),
    onSuccess: async (result, variables) => {
      if (!result.success) {
        toast.error(result.error || 'Failed to save adjustment')
        return
      }

      await queryClient.invalidateQueries({
        queryKey: [...adminKeys.merchants(), variables.merchantId, 'tips'],
      })
      toast.success('Adjustment saved')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to save adjustment')
    },
  })
}
