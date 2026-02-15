'use client'

import { useSalesSummaryReport } from '@/app/dashboard/hooks/useOrderAnalytics'
import { DataTable } from '@/components/ui/data-table'
import { ExportButton } from '../analytics/ExportButton'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty } from '@/components/ui/empty'
import type { SalesSummaryRow } from '@/types/analytics'
import type { ColumnDef } from '@tanstack/react-table'

interface SalesSummaryReportProps {
  dateFrom: Date
  dateTo: Date
}

export function SalesSummaryReport({ dateFrom, dateTo }: SalesSummaryReportProps) {
  const { data, isLoading } = useSalesSummaryReport(dateFrom, dateTo)

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

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <ExportButton
          data={data}
          columns={exportColumns}
          filename={`sales-summary-${dateFrom.toISOString().split('T')[0]}`}
        />
      </div>
      <DataTable columns={columns} data={data} />
    </div>
  )
}
