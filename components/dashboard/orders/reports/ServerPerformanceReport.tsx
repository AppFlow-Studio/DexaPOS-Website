'use client'

import { useMemo, useState } from 'react'
import { useStaffPerformance } from '@/app/dashboard/hooks/useOrderAnalytics'
import { ReportDataTable } from './ReportDataTable'
import { ReportToolbar } from './ReportToolbar'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty } from '@/components/ui/empty'
import { formatReportDateRange } from '@/utils/export'
import type { ServerLeaderboardRow } from '@/types/analytics'
import type { ColumnDef } from '@tanstack/react-table'

interface ServerPerformanceReportProps {
  dateFrom: Date
  dateTo: Date
}

export function ServerPerformanceReport({ dateFrom, dateTo }: ServerPerformanceReportProps) {
  const { data, isLoading } = useStaffPerformance(dateFrom, dateTo)
  const [searchQuery, setSearchQuery] = useState('')

  const filteredData = useMemo(() => {
    if (!data?.leaderboard) return []
    return data.leaderboard.filter((row) =>
      String(row.staff_name).toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [data, searchQuery])

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount)

  const formatPercent = (value: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'percent',
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(value / 100)

  const columns: ColumnDef<ServerLeaderboardRow>[] = [
    {
      accessorKey: 'staff_name',
      header: 'Server Name',
    },
    {
      accessorKey: 'order_count',
      header: 'Orders',
      cell: ({ row }) => row.getValue('order_count'),
    },
    {
      accessorKey: 'total_sales',
      header: 'Total Sales',
      cell: ({ row }) => formatCurrency(row.getValue('total_sales') as number),
    },
    {
      accessorKey: 'avg_check_size',
      header: 'Avg Check',
      cell: ({ row }) => formatCurrency(row.getValue('avg_check_size') as number),
    },
    {
      accessorKey: 'total_tips',
      header: 'Total Tips',
      cell: ({ row }) => formatCurrency(row.getValue('total_tips') as number),
    },
    {
      accessorKey: 'avg_tip_pct',
      header: 'Tip %',
      cell: ({ row }) => formatPercent(row.getValue('avg_tip_pct') as number),
    },
    {
      accessorKey: 'tables_turned',
      header: 'Tables Turned',
      cell: ({ row }) => row.getValue('tables_turned'),
    },
    {
      accessorKey: 'avg_table_turn_minutes',
      header: 'Avg Turn Time (min)',
      cell: ({ row }) => Math.round(row.getValue('avg_table_turn_minutes') as number),
    },
  ]

  const exportColumns = [
    { key: 'staff_name' as const, header: 'Server Name' },
    { key: 'order_count' as const, header: 'Orders' },
    {
      key: 'total_sales' as const,
      header: 'Total Sales',
      format: (v: number) => v.toFixed(2),
    },
    {
      key: 'avg_check_size' as const,
      header: 'Avg Check',
      format: (v: number) => v.toFixed(2),
    },
    {
      key: 'total_tips' as const,
      header: 'Total Tips',
      format: (v: number) => v.toFixed(2),
    },
    {
      key: 'avg_tip_pct' as const,
      header: 'Tip %',
      format: (v: number) => v.toFixed(1),
    },
    { key: 'tables_turned' as const, header: 'Tables Turned' },
    {
      key: 'avg_table_turn_minutes' as const,
      header: 'Avg Turn Time (min)',
      format: (v: number) => Math.round(v).toString(),
    },
  ]

  if (isLoading) {
    return <Skeleton className="h-[400px] w-full" />
  }

  if (!data || !data.leaderboard || data.leaderboard.length === 0) {
    return <Empty description="No server performance data for selected period" />
  }

  return (
    <div className="space-y-4">
      <ReportToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        filteredCount={filteredData.length}
        totalCount={data.leaderboard.length}
        data={filteredData}
        exportColumns={exportColumns}
        filename={`Server Performance - ${formatReportDateRange(dateFrom, dateTo)}`}
        searchPlaceholder="Search by server..."
      />
      <ReportDataTable columns={columns} data={filteredData} />
    </div>
  )
}
