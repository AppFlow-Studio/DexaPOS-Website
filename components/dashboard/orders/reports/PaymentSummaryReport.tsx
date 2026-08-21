'use client'

import { useMemo, useState } from 'react'
import { useFinancialKPIs } from '@/app/dashboard/hooks/useOrderAnalytics'
import { ReportDataTable } from './ReportDataTable'
import { ReportToolbar } from './ReportToolbar'
import { SummaryCard, SummaryCardRow } from './SummaryCard'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty } from '@/components/ui/empty'
import { formatReportDateRange } from '@/utils/export'
import { DollarSign, CreditCard, TrendingUp } from 'lucide-react'
import type { FinancialKPIs } from '@/app/dashboard/actions/order-analytics'
import type { ColumnDef } from '@tanstack/react-table'

interface PaymentSummaryReportProps {
  dateFrom: Date
  dateTo: Date
  merchantName?: string
  locationName?: string
}

interface PaymentMethodRow {
  method: string
  amount: number
  count: number
}

export function PaymentSummaryReport({
  dateFrom,
  dateTo,
  merchantName,
  locationName,
}: PaymentSummaryReportProps) {
  const { data, isLoading } = useFinancialKPIs(dateFrom, dateTo)
  const [searchQuery, setSearchQuery] = useState('')

  const filteredMethodsData = useMemo(() => {
    if (!data?.payment_methods) return []
    return (data.payment_methods as PaymentMethodRow[]).filter((row) =>
      String(row.method).toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [data, searchQuery])

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount)

  const columns: ColumnDef<PaymentMethodRow>[] = [
    {
      accessorKey: 'method',
      header: 'Payment Method',
    },
    {
      accessorKey: 'count',
      header: 'Transactions',
      cell: ({ row }) => row.getValue('count'),
    },
    {
      accessorKey: 'amount',
      header: 'Total Amount',
      cell: ({ row }) => formatCurrency(row.getValue('amount') as number),
    },
  ]

  const exportColumns = [
    { key: 'method' as const, header: 'Payment Method' },
    { key: 'count' as const, header: 'Transactions' },
    {
      key: 'amount' as const,
      header: 'Total Amount',
      format: (v: number) => v.toFixed(2),
    },
  ]

  if (isLoading) {
    return <Skeleton className="h-[400px] w-full" />
  }

  if (!data) {
    return <Empty description="No payment data for selected period" />
  }

  const { summary, payment_methods } = data
  const paymentMethodsData = (payment_methods || []) as PaymentMethodRow[]

  // Calculate summary metrics
  const totalRevenue = paymentMethodsData.reduce((sum, row) => sum + (row.amount || 0), 0)
  const transactionCount = paymentMethodsData.reduce((sum, row) => sum + (row.count || 0), 0)
  const avgTransaction = transactionCount > 0 ? totalRevenue / transactionCount : 0

  const summaryCardsData = [
    { label: 'Total Revenue', value: formatCurrency(totalRevenue) },
    { label: 'Transaction Count', value: transactionCount.toLocaleString() },
    { label: 'Avg Transaction', value: formatCurrency(avgTransaction) },
  ]

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <SummaryCardRow>
        <SummaryCard
          label="Total Revenue"
          value={formatCurrency(totalRevenue)}
          icon={<DollarSign className="h-5 w-5" />}
        />
        <SummaryCard
          label="Transaction Count"
          value={transactionCount.toLocaleString()}
          icon={<CreditCard className="h-5 w-5" />}
        />
        <SummaryCard
          label="Avg Transaction"
          value={formatCurrency(avgTransaction)}
          icon={<TrendingUp className="h-5 w-5" />}
        />
      </SummaryCardRow>

      {/* Payment Methods Table */}
      {paymentMethodsData.length > 0 ? (
        <>
          <ReportToolbar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            filteredCount={filteredMethodsData.length}
            totalCount={paymentMethodsData.length}
            data={filteredMethodsData}
            exportColumns={exportColumns}
            filename={`Payment Summary - ${formatReportDateRange(dateFrom, dateTo)}`}
            searchPlaceholder="Search by payment method..."
            merchantName={merchantName}
            locationName={locationName}
            dateFrom={dateFrom}
            dateTo={dateTo}
            summaryCards={summaryCardsData}
          />
          <ReportDataTable columns={columns} data={filteredMethodsData} />
        </>
      ) : (
        <Empty description="No payment methods data for selected period" />
      )}
    </div>
  )
}
