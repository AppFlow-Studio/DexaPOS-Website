'use client'

import { AlertTriangle, Clock, DollarSign, ShieldAlert } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ChargebacksSection } from '../transactions/components/ChargebacksSection'
import { usePlatformChargebacks } from '@/lib/queries/use-platform-analytics'

function formatCurrency(amount: number) {
  return `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function HQDisputesPage() {
  // pendingCount and urgentCount come from server-side COUNT queries — accurate regardless of page size
  const { data: aggregate, isLoading: aggregateLoading } = usePlatformChargebacks(undefined, 1, 0)
  // Separate query scoped to under_review for accurate count
  const { data: underReviewData, isLoading: underReviewLoading } = usePlatformChargebacks(
    { statuses: ['under_review'] },
    1,
    0
  )
  // Separate query to get total disputed amount across all records
  const { data: amountData, isLoading: amountLoading } = usePlatformChargebacks(
    { statuses: ['notified', 'under_review', 'defended'] },
    200,
    0
  )

  const isLoading = aggregateLoading || underReviewLoading || amountLoading

  const totalOpen = aggregate?.pendingCount ?? 0
  const urgent = aggregate?.urgentCount ?? 0
  const underReviewCount = underReviewData?.total ?? 0
  const totalDisputedAmount = amountData
    ? amountData.data.reduce((sum, r) => sum + r.amount, 0)
    : 0

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">TSYS Disputes</h1>
        <p className="text-muted-foreground">
          Platform-wide dispute management across all merchants
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Open</CardTitle>
            <ShieldAlert className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-16" /> : (
              <div className="text-2xl font-bold">{totalOpen.toLocaleString()}</div>
            )}
            <p className="text-xs text-muted-foreground">Notified or under review</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Urgent</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-16" /> : (
              <div className="text-2xl font-bold text-red-600">{urgent.toLocaleString()}</div>
            )}
            <p className="text-xs text-muted-foreground">Deadline within 7 days</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Under Review</CardTitle>
            <Clock className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-16" /> : (
              <div className="text-2xl font-bold">{underReviewCount.toLocaleString()}</div>
            )}
            <p className="text-xs text-muted-foreground">Currently being reviewed</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total in Dispute</CardTitle>
            <DollarSign className="h-4 w-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-24" /> : (
              <div className="text-2xl font-bold">{formatCurrency(totalDisputedAmount)}</div>
            )}
            <p className="text-xs text-muted-foreground">Open + defended disputes</p>
          </CardContent>
        </Card>
      </div>

      <ChargebacksSection defaultOpen />
    </div>
  )
}
