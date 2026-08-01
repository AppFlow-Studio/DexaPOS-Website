'use client'

import { useMemo, useState } from 'react'
import { useSalesSummaryReport } from '@/app/dashboard/hooks/useOrderAnalytics'
import { ReportDataTable } from './ReportDataTable'
import { ReportToolbar } from './ReportToolbar'
import { SummaryCard } from './SummaryCard'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty } from '@/components/ui/empty'
import { formatReportDateRange } from '@/utils/export'
import { DollarSign, Globe, Monitor, ShoppingBag, Store, TrendingUp, Truck } from 'lucide-react'
import type { SalesSummaryRow } from '@/types/analytics'
import type { OrderSource } from '@/lib/orderout/platform'
import type { ColumnDef } from '@tanstack/react-table'

interface SalesSummaryReportProps {
  dateFrom: Date
  dateTo: Date
  merchantName?: string
  locationName?: string
  orderSource?: OrderSource | null
}

const channelIcons = {
  pos: Store,
  kiosk: Monitor,
  online_store: Globe,
  orderout: Truck,
} satisfies Record<OrderSource, typeof Store>

export function SalesSummaryReport({
  dateFrom,
  dateTo,
  merchantName,
  locationName,
  orderSource = null,
}: SalesSummaryReportProps) {
  const { data, isLoading, isError } = useSalesSummaryReport(
    dateFrom,
    dateTo,
    orderSource
  )
  const [searchQuery, setSearchQuery] = useState('')
  const rows = useMemo(() => data?.rows ?? [], [data?.rows])
  const channelRows = useMemo(
    () => data?.byChannel ?? [],
    [data?.byChannel]
  )

  // Improved date search – matches the formatted date shown in the table
  const filteredData = useMemo(() => {
    if (!rows.length) return []
    const query = searchQuery.toLowerCase().trim()
    if (!query) return rows

    return rows.filter((row) => {
      const formattedDate = new Date(row.date).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }).toLowerCase()
      return formattedDate.includes(query)
    })
  }, [rows, searchQuery])

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

  if (isError) {
    return <Empty description="Unable to load sales data" />
  }

  // Calculate summary metrics
  const totalNetSales = rows.reduce((sum, row) => sum + (row.netSales || 0), 0)
  const totalOrders = rows.reduce((sum, row) => sum + (row.orderCount || 0), 0)
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
        totalCount={rows.length}
        data={filteredData}
        exportColumns={exportColumns}
        filename={`Sales Summary - ${formatReportDateRange(dateFrom, dateTo)}`}
        searchPlaceholder="Search by date (e.g., Mon, Jan 15)..."
        merchantName={merchantName}
        locationName={locationName}
        dateFrom={dateFrom}
        dateTo={dateTo}
        summaryCards={summaryCardsData}
      />

      <div>
        <h3 className="mb-3 text-sm font-semibold text-foreground">
          Sales by Channel
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {channelRows.map((channel) => {
            const Icon = channelIcons[channel.channel]
            return (
              <SummaryCard
                key={channel.channel}
                label={channel.label}
                value={formatCurrency(channel.net)}
                description={`${channel.orders.toLocaleString()} orders | ${formatCurrency(channel.avgTicket)} avg`}
                icon={<Icon className="h-5 w-5" />}
                className={
                  orderSource === channel.channel
                    ? 'border-[#0C4FD1] bg-blue-50 dark:bg-blue-950/20'
                    : undefined
                }
              />
            )
          })}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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

      {rows.length === 0 ? (
        <Empty description="No sales data for selected period" />
      ) : (
        <ReportDataTable columns={columns} data={filteredData} />
      )}
    </div>
  )
}
