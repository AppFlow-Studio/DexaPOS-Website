'use client'

import { useHourlySalesReport } from '@/app/dashboard/hooks/useOrderAnalytics'
import { DataTable } from '@/components/ui/data-table'
import { ExportButton } from '../analytics/ExportButton'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty } from '@/components/ui/empty'
import type { HourlySalesRow } from '@/types/analytics'
import type { ColumnDef } from '@tanstack/react-table'

interface HourlySalesReportProps {
  dateFrom: Date
  dateTo: Date
}

export function HourlySalesReport({ dateFrom, dateTo }: HourlySalesReportProps) {
  const { data, isLoading } = useHourlySalesReport(dateFrom, dateTo)

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
      <div className="flex justify-end">
        <ExportButton
          data={data}
          columns={exportColumns}
          filename={`hourly-sales-${dateFrom.toISOString().split('T')[0]}`}
        />
      </div>
      <DataTable columns={columns} data={data} />
    </div>
  )
}
