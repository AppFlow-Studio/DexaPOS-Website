'use client'

import { useMemo, useState } from 'react'
import { useKitchenPerformance } from '@/app/dashboard/hooks/useOrderAnalytics'
import { ReportDataTable } from './ReportDataTable'
import { ReportToolbar } from './ReportToolbar'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty } from '@/components/ui/empty'
import { formatReportDateRange } from '@/utils/export'
import type { KitchenStationStats } from '@/types/analytics'
import type { ColumnDef } from '@tanstack/react-table'

interface KitchenPerformanceReportProps {
  dateFrom: Date
  dateTo: Date
}

export function KitchenPerformanceReport({ dateFrom, dateTo }: KitchenPerformanceReportProps) {
  const { data, isLoading } = useKitchenPerformance(dateFrom, dateTo)
  const [searchQuery, setSearchQuery] = useState('')

  const filteredData = useMemo(() => {
    if (!data?.by_station) return []
    return data.by_station.filter((row) =>
      String(row.display_name).toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [data, searchQuery])

  const columns: ColumnDef<KitchenStationStats>[] = [
    {
      accessorKey: 'display_name',
      header: 'Station Name',
    },
    {
      accessorKey: 'total_items',
      header: 'Total Items',
      cell: ({ row }) => row.getValue('total_items'),
    },
    {
      accessorKey: 'avg_prep_minutes',
      header: 'Avg Prep Time (min)',
      cell: ({ row }) => Math.round(row.getValue('avg_prep_minutes') as number),
    },
    {
      accessorKey: 'auto_bumped',
      header: 'Auto Bumped',
      cell: ({ row }) => row.getValue('auto_bumped'),
    },
    {
      accessorKey: 'alert_threshold_minutes',
      header: 'Alert Threshold (min)',
      cell: ({ row }) => row.getValue('alert_threshold_minutes'),
    },
  ]

  const exportColumns = [
    { key: 'display_name' as const, header: 'Station Name' },
    { key: 'total_items' as const, header: 'Total Items' },
    {
      key: 'avg_prep_minutes' as const,
      header: 'Avg Prep Time (min)',
      format: (v: number) => Math.round(v).toString(),
    },
    { key: 'auto_bumped' as const, header: 'Auto Bumped' },
    { key: 'alert_threshold_minutes' as const, header: 'Alert Threshold (min)' },
  ]

  if (isLoading) {
    return <Skeleton className="h-[400px] w-full" />
  }

  if (!data || !data.by_station || data.by_station.length === 0) {
    return <Empty description="No kitchen performance data for selected period" />
  }

  const formatMinutes = (minutes: number) => Math.round(minutes).toString()
  const autoBumpRate = data.auto_bump_stats
    ? ((data.auto_bump_stats.auto_bumped / data.auto_bump_stats.total_items) * 100).toFixed(1)
    : '0'

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border p-4">
          <p className="text-sm font-medium text-muted-foreground">Avg Ticket Time</p>
          <p className="text-2xl font-bold">{formatMinutes(data.avg_ticket_time_minutes)} min</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm font-medium text-muted-foreground">Total Items</p>
          <p className="text-2xl font-bold">{data.total_items_processed.toLocaleString()}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm font-medium text-muted-foreground">Auto-Bump Rate</p>
          <p className="text-2xl font-bold">{autoBumpRate}%</p>
        </div>
      </div>

      {/* Stations Table */}
      <ReportToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        filteredCount={filteredData.length}
        totalCount={data.by_station.length}
        data={filteredData}
        exportColumns={exportColumns}
        filename={`Kitchen Performance - ${formatReportDateRange(dateFrom, dateTo)}`}
        searchPlaceholder="Search by station..."
      />
      <ReportDataTable columns={columns} data={filteredData} />
    </div>
  )
}
