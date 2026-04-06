'use client'

import { useMemo, useState } from 'react'
import {
  CalendarDays,
  CreditCard,
  Globe,
  MapPin,
  RefreshCcwDot,
} from 'lucide-react'
import { useAdminPayments } from '@/lib/queries/use-admin-financial'
import { PaymentCharts } from '@/app/dashboard/payments/components/PaymentCharts'
import { PaymentStats } from '@/app/dashboard/payments/components/PaymentStats'
import { PaymentsTable } from '@/app/dashboard/payments/components/PaymentsTable'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Empty } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { PaymentFilters, PaymentRecord, PaymentSummary } from '@/types/payment'
import type { PaymentMethod, PaymentStatus } from '@/types/order-management'
import type { LocationSummary } from '@/types/merchant'

function computePaymentSummary(payments: PaymentRecord[]): PaymentSummary {
  if (!payments.length) {
    return {
      totalCount: 0,
      totalAmount: 0,
      totalTips: 0,
      totalRefunded: 0,
      refundCount: 0,
      byMethod: [],
      byCardType: [],
      byStatus: [],
      dailyVolume: [],
      byEntryMode: [],
    }
  }

  let totalAmount = 0
  let totalTips = 0
  let totalRefunded = 0
  let refundCount = 0

  const methodMap = new Map<string, { count: number; amount: number }>()
  const cardTypeMap = new Map<string, { count: number; amount: number }>()
  const statusMap = new Map<string, { count: number; amount: number }>()
  const dailyMap = new Map<string, { count: number; amount: number }>()
  const entryModeMap = new Map<string, { count: number; amount: number }>()

  for (const payment of payments) {
    const paymentTotal = Number(payment.total_amount) || 0
    const paymentTip = Number(payment.tip_amount) || 0
    const paymentRefunded = Number(payment.refunded_amount) || 0

    totalAmount += paymentTotal
    totalTips += paymentTip
    totalRefunded += paymentRefunded

    if (
      payment.status === 'refunded' ||
      payment.status === 'partially_refunded' ||
      payment.status === 'void'
    ) {
      refundCount++
    }

    const methodEntry = methodMap.get(payment.payment_method) || {
      count: 0,
      amount: 0,
    }
    methodEntry.count++
    methodEntry.amount += paymentTotal
    methodMap.set(payment.payment_method, methodEntry)

    const cardType =
      payment.card_type || payment.processor_response?.castles_transaction?.cardType
    if (cardType) {
      const cardEntry = cardTypeMap.get(cardType) || { count: 0, amount: 0 }
      cardEntry.count++
      cardEntry.amount += paymentTotal
      cardTypeMap.set(cardType, cardEntry)
    }

    const statusEntry = statusMap.get(payment.status) || { count: 0, amount: 0 }
    statusEntry.count++
    statusEntry.amount += paymentTotal
    statusMap.set(payment.status, statusEntry)

    const day = (payment.initiated_at || payment.created_at || '').slice(0, 10)
    if (day) {
      const dayEntry = dailyMap.get(day) || { count: 0, amount: 0 }
      dayEntry.count++
      dayEntry.amount += paymentTotal
      dailyMap.set(day, dayEntry)
    }

    const entryMode =
      payment.card_entry_mode ||
      payment.processor_response?.entry_type ||
      payment.processor_response?.castles_transaction?.entryMode ||
      'unknown'

    const entryEntry = entryModeMap.get(entryMode) || { count: 0, amount: 0 }
    entryEntry.count++
    entryEntry.amount += paymentTotal
    entryModeMap.set(entryMode, entryEntry)
  }

  return {
    totalCount: payments.length,
    totalAmount,
    totalTips,
    totalRefunded,
    refundCount,
    byMethod: Array.from(methodMap.entries()).map(([method, value]) => ({
      method: method as PaymentMethod,
      ...value,
    })),
    byCardType: Array.from(cardTypeMap.entries()).map(([cardType, value]) => ({
      cardType,
      ...value,
    })),
    byStatus: Array.from(statusMap.entries()).map(([status, value]) => ({
      status: status as PaymentStatus,
      ...value,
    })),
    dailyVolume: Array.from(dailyMap.entries())
      .map(([date, value]) => ({ date, ...value }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    byEntryMode: Array.from(entryModeMap.entries()).map(([entryMode, value]) => ({
      entryMode,
      ...value,
    })),
  }
}

interface PaymentsTabProps {
  merchantId: string
  locations: LocationSummary[]
}

export function PaymentsTab({ merchantId, locations }: PaymentsTabProps) {
  const [selectedLocationId, setSelectedLocationId] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState<Date>(() => {
    const date = new Date()
    date.setDate(date.getDate() - 30)
    date.setHours(0, 0, 0, 0)
    return date
  })
  const [dateTo, setDateTo] = useState<Date>(() => {
    const date = new Date()
    date.setHours(23, 59, 59, 999)
    return date
  })

  const filters: PaymentFilters = useMemo(
    () => ({
      dateRange: { from: dateFrom, to: dateTo },
    }),
    [dateFrom, dateTo]
  )

  const { data: payments, isLoading, refetch } = useAdminPayments(
    merchantId,
    selectedLocationId === 'all' ? null : selectedLocationId,
    filters
  )

  const paymentList = Array.isArray(payments) ? payments : []
  const summary = useMemo(() => computePaymentSummary(paymentList), [paymentList])
  const selectedLocation =
    selectedLocationId === 'all'
      ? null
      : locations.find((location) => location.id === selectedLocationId) || null

  if (locations.length === 0) {
    return (
      <Card>
        <CardContent className="py-12">
          <Empty
            icon={MapPin}
            title="No locations found"
            description="This merchant does not have locations yet, so there are no payments to display."
          />
        </CardContent>
      </Card>
    )
  }

  return (
    <main className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold tracking-tight">Payments</h2>
            {selectedLocation ? (
              <Badge variant="outline" className="gap-1">
                <MapPin className="h-3 w-3" />
                {selectedLocation.name}
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1">
                <Globe className="h-3 w-3" />
                All Locations
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            View and manage payment activity for this merchant across locations.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue placeholder="Select location" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All locations</SelectItem>
              {locations.map((location) => (
                <SelectItem key={location.id} value={location.id}>
                  {location.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1.5 text-sm">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <input
              type="date"
              value={dateFrom.toISOString().slice(0, 10)}
              onChange={(event) => {
                const nextDate = new Date(`${event.target.value}T00:00:00`)
                if (!Number.isNaN(nextDate.getTime())) {
                  setDateFrom(nextDate)
                }
              }}
              className="rounded-md border bg-background px-2 py-1 text-sm"
            />
            <span className="text-muted-foreground">to</span>
            <input
              type="date"
              value={dateTo.toISOString().slice(0, 10)}
              onChange={(event) => {
                const nextDate = new Date(`${event.target.value}T23:59:59.999`)
                if (!Number.isNaN(nextDate.getTime())) {
                  setDateTo(nextDate)
                }
              }}
              className="rounded-md border bg-background px-2 py-1 text-sm"
            />
          </div>
        </div>
      </div>

      <PaymentStats summary={summary} isLoading={isLoading} />
      <PaymentCharts summary={summary} isLoading={isLoading} />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>All Payments</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await refetch()
              }}
            >
              <RefreshCcwDot className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading && paymentList.length === 0 ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : paymentList.length === 0 ? (
            <Empty
              icon={CreditCard}
              title="No payments found"
              description="Try another date range or location filter."
            />
          ) : (
            <PaymentsTable data={paymentList} isLoading={isLoading} />
          )}
        </CardContent>
      </Card>
    </main>
  )
}
