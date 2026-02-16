'use client'

import { useMemo, useState } from 'react'
import { useFinancialKPIs } from '@/app/dashboard/hooks/useOrderAnalytics'
import { ReportDataTable } from './ReportDataTable'
import { ReportToolbar } from './ReportToolbar'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty } from '@/components/ui/empty'
import { formatReportDateRange } from '@/utils/export'
import type { FinancialKPIs } from '@/app/dashboard/actions/order-analytics'
import type { ColumnDef } from '@tanstack/react-table'

interface PaymentSummaryReportProps {
  dateFrom: Date
  dateTo: Date
}

interface PaymentMethodRow {
  method: string
  amount: number
  count: number
}

export function PaymentSummaryReport({ dateFrom, dateTo }: PaymentSummaryReportProps) {
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

  return (
    <div className="space-y-6">
      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <div className="rounded-lg border p-4">
          <p className="text-sm font-medium text-muted-foreground">Gross Sales</p>
          <p className="text-xl font-bold">{formatCurrency(summary.gross_sales)}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm font-medium text-muted-foreground">Net Sales</p>
          <p className="text-xl font-bold">{formatCurrency(summary.net_sales)}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm font-medium text-muted-foreground">Tax</p>
          <p className="text-xl font-bold">{formatCurrency(summary.tax_total)}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm font-medium text-muted-foreground">Tips</p>
          <p className="text-xl font-bold">{formatCurrency(summary.tip_total)}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm font-medium text-muted-foreground">Refunds</p>
          <p className="text-xl font-bold">{formatCurrency(summary.refunds_total)}</p>
        </div>
      </div>

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
          />
          <ReportDataTable columns={columns} data={filteredMethodsData} />
        </>
      ) : (
        <Empty description="No payment methods data for selected period" />
      )}
    </div>
  )
}
