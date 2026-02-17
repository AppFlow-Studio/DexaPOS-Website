'use client'

import { useMemo, useState } from 'react'
import { useSalesSummaryReport } from '@/app/dashboard/hooks/useOrderAnalytics'
import { ReportDataTable } from './ReportDataTable'
import { ReportToolbar } from './ReportToolbar'
import { SummaryCard } from './SummaryCard'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty } from '@/components/ui/empty'
import { formatReportDateRange } from '@/utils/export'
import { DollarSign, ShoppingBag, TrendingUp } from 'lucide-react'
import type { SalesSummaryRow } from '@/types/analytics'
import type { ColumnDef } from '@tanstack/react-table'

interface SalesSummaryReportProps {
  dateFrom: Date
  dateTo: Date
  merchantName?: string
  locationName?: string
}

export function SalesSummaryReport({ dateFrom, dateTo, merchantName, locationName }: SalesSummaryReportProps) {
  const { data, isLoading } = useSalesSummaryReport(dateFrom, dateTo)
  const [searchQuery, setSearchQuery] = useState('')

  const filteredData = useMemo(() => {
    if (!data) return []
    return data.filter((row) =>
      String(row.date).toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [data, searchQuery])

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount)

  const columns: ColumnDef<SalesSummaryRow>[] = [
    {
      accessorKey: 'date',
      header: 'Date',
      cell: ({ row }) =>
        new Date(row.getValue('date') as string).toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        }),
    },
    {
      accessorKey: 'orderCount',
      header: 'Orders',
      cell: ({ row }) => row.getValue('orderCount'),
    },
    {
      accessorKey: 'grossSales',
      header: 'Gross Sales',
      cell: ({ row }) => formatCurrency(row.getValue('grossSales') as number),
    },
    {
      accessorKey: 'discounts',
      header: 'Discounts',
      cell: ({ row }) => formatCurrency(row.getValue('discounts') as number),
    },
    {
      accessorKey: 'netSales',
      header: 'Net Sales',
      cell: ({ row }) => formatCurrency(row.getValue('netSales') as number),
    },
    {
      accessorKey: 'tax',
      header: 'Tax',
      cell: ({ row }) => formatCurrency(row.getValue('tax') as number),
    },
    {
      accessorKey: 'tips',
      header: 'Tips',
      cell: ({ row }) => formatCurrency(row.getValue('tips') as number),
    },
    {
      accessorKey: 'refunds',
      header: 'Refunds',
      cell: ({ row }) => formatCurrency(row.getValue('refunds') as number),
    },
  ]

  const exportColumns = [
    { key: 'date' as const, header: 'Date' },
    { key: 'orderCount' as const, header: 'Orders' },
    {
      key: 'grossSales' as const,
      header: 'Gross Sales',
      format: (v: number) => v.toFixed(2),
    },
    {
      key: 'discounts' as const,
      header: 'Discounts',
      format: (v: number) => v.toFixed(2),
    },
    {
      key: 'netSales' as const,
      header: 'Net Sales',
      format: (v: number) => v.toFixed(2),
    },
    {
      key: 'tax' as const,
      header: 'Tax',
      format: (v: number) => v.toFixed(2),
    },
    {
      key: 'tips' as const,
      header: 'Tips',
      format: (v: number) => v.toFixed(2),
    },
    {
      key: 'refunds' as const,
      header: 'Refunds',
      format: (v: number) => v.toFixed(2),
    },
  ]

  if (isLoading) {
    return <Skeleton className="h-[400px] w-full" />
  }

  if (!data || data.length === 0) {
    return <Empty description="No sales data for selected period" />
  }

  // Calculate summary metrics
  const totalNetSales = data.reduce((sum, row) => sum + (row.netSales || 0), 0)
  const totalOrders = data.reduce((sum, row) => sum + (row.orderCount || 0), 0)
  const avgOrderValue = totalOrders > 0 ? totalNetSales / totalOrders : 0

  const summaryCardsData = [
    { label: 'Total Net Sales', value: formatCurrency(totalNetSales) },
    { label: 'Total Orders', value: totalOrders.toLocaleString() },
    { label: 'Avg Order Value', value: formatCurrency(avgOrderValue) },
  ]

  return (
    <div className="space-y-4">
      <ReportToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        filteredCount={filteredData.length}
        totalCount={data.length}
        data={filteredData}
        exportColumns={exportColumns}
        filename={`Sales Summary - ${formatReportDateRange(dateFrom, dateTo)}`}
        searchPlaceholder="Search by date..."
        merchantName={merchantName}
        locationName={locationName}
        dateFrom={dateFrom}
        dateTo={dateTo}
        summaryCards={summaryCardsData}
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <SummaryCard
          label="Total Net Sales"
          value={formatCurrency(totalNetSales)}
          icon={<DollarSign className="h-5 w-5" />}
        />
        <SummaryCard
          label="Total Orders"
          value={totalOrders.toLocaleString()}
          icon={<ShoppingBag className="h-5 w-5" />}
        />
        <SummaryCard
          label="Avg Order Value"
          value={formatCurrency(avgOrderValue)}
          icon={<TrendingUp className="h-5 w-5" />}
        />
      </div>

      <ReportDataTable columns={columns} data={filteredData} />
    </div>
  )
}
