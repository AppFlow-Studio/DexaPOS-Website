'use client'

import { useMemo, useState } from 'react'
import { useTablePerformance } from '@/app/dashboard/hooks/useOrderAnalytics'
import { ReportDataTable } from './ReportDataTable'
import { ReportToolbar } from './ReportToolbar'
import { SummaryCard, SummaryCardRow } from './SummaryCard'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty } from '@/components/ui/empty'
import { formatReportDateRange } from '@/utils/export'
import { Clock, Table, Users } from 'lucide-react'
import type { TableUtilizationRow } from '@/types/analytics'
import type { ColumnDef } from '@tanstack/react-table'

interface TableTurnsReportProps {
  dateFrom: Date
  dateTo: Date
  merchantName?: string
  locationName?: string
}

export function TableTurnsReport({
  dateFrom,
  dateTo,
  merchantName,
  locationName,
}: TableTurnsReportProps) {
  const { data, isLoading } = useTablePerformance(dateFrom, dateTo)
  const [searchQuery, setSearchQuery] = useState('')
  const [hiddenColumnIds, setHiddenColumnIds] = useState<Set<string>>(() => new Set(['total_sessions', 'total_revenue', 'total_covers']))

  const filteredData = useMemo(() => {
    if (!data?.table_utilization) return []
    return data.table_utilization.filter((row) =>
      String(row.table_name).toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [data, searchQuery])

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount)

  const columns: ColumnDef<TableUtilizationRow>[] = [
    {
      accessorKey: 'table_name',
      header: 'Table Name',
    },
    {
      accessorKey: 'total_sessions',
      header: 'Total Sessions',
      cell: ({ row }) => row.getValue('total_sessions'),
    },
    {
      accessorKey: 'avg_turn_time_minutes',
      header: 'Avg Turn Time (min)',
      cell: ({ row }) => Math.round(row.getValue('avg_turn_time_minutes') as number),
    },
    {
      accessorKey: 'total_revenue',
      header: 'Total Revenue',
      cell: ({ row }) => formatCurrency(row.getValue('total_revenue') as number),
    },
    {
      accessorKey: 'revpash',
      header: 'RevPASH',
      cell: ({ row }) => formatCurrency(row.getValue('revpash') as number),
    },
    {
      accessorKey: 'total_covers',
      header: 'Total Covers',
      cell: ({ row }) => row.getValue('total_covers'),
    },
  ]

  const columnConfig = [
    { id: 'table_name', label: 'Table Name', locked: true },
    { id: 'total_sessions', label: 'Total Sessions' },
    { id: 'avg_turn_time_minutes', label: 'Avg Turn Time (min)', locked: true },
    { id: 'total_revenue', label: 'Total Revenue' },
    { id: 'revpash', label: 'RevPASH', locked: true },
    { id: 'total_covers', label: 'Total Covers' },
  ]

  const exportColumns = [
    { key: 'table_name' as const, header: 'Table Name' },
    { key: 'total_sessions' as const, header: 'Total Sessions' },
    {
      key: 'avg_turn_time_minutes' as const,
      header: 'Avg Turn Time (min)',
      format: (v: number) => Math.round(v).toString(),
    },
    {
      key: 'total_revenue' as const,
      header: 'Total Revenue',
      format: (v: number) => v.toFixed(2),
    },
    {
      key: 'revpash' as const,
      header: 'RevPASH',
      format: (v: number) => v.toFixed(2),
    },
    { key: 'total_covers' as const, header: 'Total Covers' },
  ]

  if (isLoading) {
    return <Skeleton className="h-[400px] w-full" />
  }

  if (!data || !data.table_utilization || data.table_utilization.length === 0) {
    return <Empty description="No table turn data for selected period" />
  }

  const formatMinutes = (minutes: number) => Math.round(minutes).toString()
  const avgRevPASH = data.table_utilization.reduce((sum, t) => sum + t.revpash, 0) / data.table_utilization.length

  const summaryCardsData = [
    { label: 'Avg Turn Time', value: `${formatMinutes(data.avg_turn_time_minutes)} min` },
    { label: 'Total Covers', value: data.total_covers.toLocaleString() },
    { label: 'Avg RevPASH', value: formatCurrency(avgRevPASH) },
  ]

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <SummaryCardRow>
        <SummaryCard
          label="Avg Turn Time"
          value={`${formatMinutes(data.avg_turn_time_minutes)} min`}
          icon={<Clock className="h-5 w-5" />}
        />
        <SummaryCard
          label="Total Covers"
          value={data.total_covers.toLocaleString()}
          icon={<Users className="h-5 w-5" />}
        />
        <SummaryCard
          label="Avg RevPASH"
          value={formatCurrency(avgRevPASH)}
          icon={<Table className="h-5 w-5" />}
        />
      </SummaryCardRow>

      {/* Tables Table */}
      <ReportToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        filteredCount={filteredData.length}
        totalCount={data.table_utilization.length}
        data={filteredData}
        exportColumns={exportColumns}
        filename={`Table Turns - ${formatReportDateRange(dateFrom, dateTo)}`}
        searchPlaceholder="Search by table..."
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
