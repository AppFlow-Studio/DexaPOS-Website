'use client'

import { useMemo, useState } from 'react'
import { useSalesByItemReport } from '@/app/dashboard/hooks/useOrderAnalytics'
import { ReportDataTable } from './ReportDataTable'
import { ReportToolbar } from './ReportToolbar'
import { SummaryCard, SummaryCardRow } from './SummaryCard'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty } from '@/components/ui/empty'
import { formatReportDateRange } from '@/utils/export'
import { DollarSign, ShoppingBag, TrendingUp } from 'lucide-react'
import type { SalesByItemReportItem } from '@/app/dashboard/actions/order-analytics'
import type { OrderSource } from '@/lib/orderout/platform'
import type { ColumnDef } from '@tanstack/react-table'

interface ItemSalesReportProps {
  dateFrom: Date
  dateTo: Date
  merchantName?: string
  locationName?: string
  orderSource?: OrderSource | null
}

export function ItemSalesReport({
  dateFrom,
  dateTo,
  merchantName,
  locationName,
  orderSource = null,
}: ItemSalesReportProps) {
  const { data, isLoading, isError } = useSalesByItemReport(
    dateFrom,
    dateTo,
    orderSource
  )
  const [searchQuery, setSearchQuery] = useState('')
  const [hiddenColumnIds, setHiddenColumnIds] = useState<Set<string>>(() => new Set(['category', 'quantity_sold', 'gross_sales']))

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

  const columnConfig = [
    { id: 'item_name', label: 'Item Name', locked: true },
    { id: 'category', label: 'Category' },
    { id: 'quantity_sold', label: 'Quantity Sold' },
    { id: 'gross_sales', label: 'Gross Sales' },
    { id: 'net_sales', label: 'Net Sales', locked: true },
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

  if (isError) {
    return <Empty description="Unable to load item sales data" />
  }

  if (!data || data.length === 0) {
    return <Empty description="No item sales data for selected period" />
  }

  // Calculate summary metrics
  const topItemRow = data.reduce((max, row) => (row.gross_sales || 0) > (max.gross_sales || 0) ? row : max)
  const topItemName = topItemRow?.item_name || 'N/A'
  const totalItemsSold = data.reduce((sum, row) => sum + (row.quantity_sold || 0), 0)
  const totalRevenue = data.reduce((sum, row) => sum + (row.gross_sales || 0), 0)
  const avgItemPrice = totalItemsSold > 0 ? totalRevenue / totalItemsSold : 0

  const summaryCardsData = [
    { label: 'Top Item', value: topItemName },
    { label: 'Total Items Sold', value: totalItemsSold.toLocaleString() },
    { label: 'Avg Item Price', value: formatCurrency(avgItemPrice) },
  ]

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <SummaryCardRow>
        <SummaryCard
          label="Top Item"
          value={topItemName}
          icon={<TrendingUp className="h-5 w-5" />}
        />
        <SummaryCard
          label="Total Items Sold"
          value={totalItemsSold.toLocaleString()}
          icon={<ShoppingBag className="h-5 w-5" />}
        />
        <SummaryCard
          label="Avg Item Price"
          value={formatCurrency(avgItemPrice)}
          icon={<DollarSign className="h-5 w-5" />}
        />
      </SummaryCardRow>

      <ReportToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        filteredCount={filteredData.length}
        totalCount={data.length}
        data={filteredData}
        exportColumns={exportColumns}
        filename={`Item Sales - ${formatReportDateRange(dateFrom, dateTo)}`}
        searchPlaceholder="Search by item or category..."
        merchantName={merchantName}
        locationName={locationName}
        dateFrom={dateFrom}
        dateTo={dateTo}
        summaryCards={summaryCardsData}
        columnConfig={columnConfig}
        hiddenColumns={hiddenColumnIds}
        onColumnVisibilityChange={setHiddenColumnIds}
      />

      <ReportDataTable columns={columns} data={filteredData} hiddenColumnIds={hiddenColumnIds} />
    </div>
  )
}
