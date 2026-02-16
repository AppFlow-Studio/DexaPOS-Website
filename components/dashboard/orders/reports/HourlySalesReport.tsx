'use client'

import { useMemo, useState } from 'react'
import { useHourlySalesReport } from '@/app/dashboard/hooks/useOrderAnalytics'
import { ReportDataTable } from './ReportDataTable'
import { ReportToolbar } from './ReportToolbar'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty } from '@/components/ui/empty'
import { formatReportDateRange } from '@/utils/export'
import type { HourlySalesRow } from '@/types/analytics'
import type { ColumnDef } from '@tanstack/react-table'

interface HourlySalesReportProps {
  dateFrom: Date
  dateTo: Date
}

export function HourlySalesReport({ dateFrom, dateTo }: HourlySalesReportProps) {
  const { data, isLoading } = useHourlySalesReport(dateFrom, dateTo)
  const [searchQuery, setSearchQuery] = useState('')

  const filteredData = useMemo(() => {
    if (!data) return []
    return data.filter((row) =>
      String(row.hourLabel).toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [data, searchQuery])

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount)

  const columns: ColumnDef<HourlySalesRow>[] = [
    {
      accessorKey: 'hourLabel',
      header: 'Hour',
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
      accessorKey: 'avgOrderValue',
      header: 'Avg Order Value',
      cell: ({ row }) => formatCurrency(row.getValue('avgOrderValue') as number),
    },
  ]

  const exportColumns = [
    { key: 'hourLabel' as const, header: 'Hour' },
    { key: 'orderCount' as const, header: 'Orders' },
    {
      key: 'grossSales' as const,
      header: 'Gross Sales',
      format: (v: number) => v.toFixed(2),
    },
    {
      key: 'avgOrderValue' as const,
      header: 'Avg Order Value',
      format: (v: number) => v.toFixed(2),
    },
  ]

  if (isLoading) {
    return <Skeleton className="h-[400px] w-full" />
  }

  if (!data || data.length === 0) {
    return <Empty description="No sales data for selected period" />
  }

  return (
    <div className="space-y-4">
      <ReportToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        filteredCount={filteredData.length}
        totalCount={data.length}
        data={filteredData}
        exportColumns={exportColumns}
        filename={`Hourly Sales - ${formatReportDateRange(dateFrom, dateTo)}`}
        searchPlaceholder="Search by hour..."
      />
      <ReportDataTable columns={columns} data={filteredData} />
    </div>
  )
}
