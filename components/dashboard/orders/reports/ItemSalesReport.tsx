'use client'

import { useMemo, useState } from 'react'
import { useSalesByItemReport } from '@/app/dashboard/hooks/useOrderAnalytics'
import { ReportDataTable } from './ReportDataTable'
import { ReportToolbar } from './ReportToolbar'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty } from '@/components/ui/empty'
import { formatReportDateRange } from '@/utils/export'
import type { SalesByItemReportItem } from '@/app/dashboard/actions/order-analytics'
import type { ColumnDef } from '@tanstack/react-table'

interface ItemSalesReportProps {
  dateFrom: Date
  dateTo: Date
}

export function ItemSalesReport({ dateFrom, dateTo }: ItemSalesReportProps) {
  const { data, isLoading } = useSalesByItemReport(dateFrom, dateTo)
  const [searchQuery, setSearchQuery] = useState('')

  const filteredData = useMemo(() => {
    if (!data) return []
    return data.filter((row) =>
      String(row.item_name).toLowerCase().includes(searchQuery.toLowerCase()) ||
      String(row.category).toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [data, searchQuery])

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount)

  const columns: ColumnDef<SalesByItemReportItem>[] = [
    {
      accessorKey: 'item_name',
      header: 'Item Name',
    },
    {
      accessorKey: 'category',
      header: 'Category',
    },
    {
      accessorKey: 'quantity_sold',
      header: 'Quantity Sold',
      cell: ({ row }) => row.getValue('quantity_sold'),
    },
    {
      accessorKey: 'gross_sales',
      header: 'Gross Sales',
      cell: ({ row }) => formatCurrency(row.getValue('gross_sales') as number),
    },
    {
      accessorKey: 'net_sales',
      header: 'Net Sales',
      cell: ({ row }) => formatCurrency(row.getValue('net_sales') as number),
    },
  ]

  const exportColumns = [
    { key: 'item_name' as const, header: 'Item Name' },
    { key: 'category' as const, header: 'Category' },
    { key: 'quantity_sold' as const, header: 'Quantity Sold' },
    {
      key: 'gross_sales' as const,
      header: 'Gross Sales',
      format: (v: number) => v.toFixed(2),
    },
    {
      key: 'net_sales' as const,
      header: 'Net Sales',
      format: (v: number) => v.toFixed(2),
    },
  ]

  if (isLoading) {
    return <Skeleton className="h-[400px] w-full" />
  }

  if (!data || data.length === 0) {
    return <Empty description="No item sales data for selected period" />
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
        filename={`Item Sales - ${formatReportDateRange(dateFrom, dateTo)}`}
        searchPlaceholder="Search by item or category..."
      />
      <ReportDataTable columns={columns} data={filteredData} />
    </div>
  )
}
