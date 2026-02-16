'use client'

import { useMemo, useState } from 'react'
import { useTablePerformance } from '@/app/dashboard/hooks/useOrderAnalytics'
import { ReportDataTable } from './ReportDataTable'
import { ReportToolbar } from './ReportToolbar'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty } from '@/components/ui/empty'
import { formatReportDateRange } from '@/utils/export'
import type { TableUtilizationRow } from '@/types/analytics'
import type { ColumnDef } from '@tanstack/react-table'

interface TableTurnsReportProps {
  dateFrom: Date
  dateTo: Date
}

export function TableTurnsReport({ dateFrom, dateTo }: TableTurnsReportProps) {
  const { data, isLoading } = useTablePerformance(dateFrom, dateTo)
  const [searchQuery, setSearchQuery] = useState('')

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

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-lg border p-4">
          <p className="text-sm font-medium text-muted-foreground">Avg Turn Time</p>
          <p className="text-2xl font-bold">{formatMinutes(data.avg_turn_time_minutes)} min</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm font-medium text-muted-foreground">Total Sessions</p>
          <p className="text-2xl font-bold">{data.total_sessions.toLocaleString()}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm font-medium text-muted-foreground">Total Covers</p>
          <p className="text-2xl font-bold">{data.total_covers.toLocaleString()}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm font-medium text-muted-foreground">RevPASH Avg</p>
          <p className="text-2xl font-bold">
            {formatCurrency(
              data.table_utilization.reduce((sum, t) => sum + t.revpash, 0) /
                data.table_utilization.length
            )}
          </p>
        </div>
      </div>

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
      />
      <ReportDataTable columns={columns} data={filteredData} />
    </div>
  )
}
