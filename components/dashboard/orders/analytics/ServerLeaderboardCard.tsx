'use client'

import { useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { ChartCard } from './ChartCard'
import { CHART_TICK } from './AnalyticsPrimitives'
import { DataTable } from '@/components/ui/data-table'
import { ColumnDef } from '@tanstack/react-table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Users } from 'lucide-react'
import type { StaffPerformanceStats, ServerLeaderboardRow } from '@/types/analytics'

type MetricKey = 'total_sales' | 'avg_check_size' | 'total_tips' | 'avg_tip_pct' | 'tables_turned' | 'avg_table_turn_minutes'

interface ServerLeaderboardCardProps {
  data?: StaffPerformanceStats | null
  isLoading?: boolean
  metric?: MetricKey
  onMetricChange?: (metric: MetricKey) => void
}

const METRIC_LABELS: Record<MetricKey, string> = {
  total_sales: 'Total Sales',
  avg_check_size: 'Avg Check Size',
  total_tips: 'Total Tips',
  avg_tip_pct: 'Avg Tip %',
  tables_turned: 'Tables Turned',
  avg_table_turn_minutes: 'Avg Turn Time (min)',
}

const chartConfig = {
  value: {
    label: 'Value',
    color: '#3b82f6',
  },
} satisfies ChartConfig

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1']

export function ServerLeaderboardCard({
  data,
  isLoading,
  metric = 'total_sales',
  onMetricChange,
}: ServerLeaderboardCardProps) {
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>(metric)

  const handleMetricChange = (newMetric: MetricKey) => {
    setSelectedMetric(newMetric)
    onMetricChange?.(newMetric)
  }

  const chartData = useMemo(() => {
    if (!data?.leaderboard) return []

    return data.leaderboard.slice(0, 10).map((row, index) => ({
      name: row.staff_name,
      value: row[selectedMetric] as number,
      color: COLORS[index % COLORS.length],
    }))
  }, [data?.leaderboard, selectedMetric])

  const columns: ColumnDef<ServerLeaderboardRow>[] = [
    {
      accessorKey: 'staff_name',
      header: 'Name',
      cell: ({ row }) => (
        <div className="font-medium">{row.getValue('staff_name')}</div>
      ),
    },
    {
      accessorKey: 'role',
      header: 'Role',
      cell: ({ row }) => (
        <span className="text-muted-foreground">{row.getValue('role') as string}</span>
      ),
    },
    {
      accessorKey: 'order_count',
      header: 'Orders',
      cell: ({ row }) => row.getValue('order_count'),
    },
    {
      accessorKey: 'total_sales',
      header: 'Total Sales',
      cell: ({ row }) => (
        <div className="font-medium">
          ${(row.getValue('total_sales') as number).toFixed(2)}
        </div>
      ),
    },
    {
      accessorKey: 'avg_check_size',
      header: 'Avg Check',
      cell: ({ row }) => (
        <div>${(row.getValue('avg_check_size') as number).toFixed(2)}</div>
      ),
    },
    {
      accessorKey: 'total_tips',
      header: 'Tips',
      cell: ({ row }) => (
        <div className="font-medium">
          ${(row.getValue('total_tips') as number).toFixed(2)}
        </div>
      ),
    },
    {
      accessorKey: 'avg_tip_pct',
      header: 'Avg Tip %',
      cell: ({ row }) => (
        <div>{(row.getValue('avg_tip_pct') as number).toFixed(1)}%</div>
      ),
    },
    {
      accessorKey: 'tables_turned',
      header: 'Tables',
      cell: ({ row }) => row.getValue('tables_turned'),
    },
    {
      accessorKey: 'avg_table_turn_minutes',
      header: 'Avg Turn (min)',
      cell: ({ row }) => (
        <div>{(row.getValue('avg_table_turn_minutes') as number).toFixed(1)}</div>
      ),
    },
  ]

  return (
    <ChartCard
      title="Server Leaderboard"
      subtitle="Ranked by selected metric"
      icon={Users}
      isLoading={isLoading}
      isEmpty={!data || data.leaderboard.length === 0}
      emptyMessage="No staff data available"
      action={
        <Select value={selectedMetric} onValueChange={(v) => handleMetricChange(v as MetricKey)}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="total_sales">{METRIC_LABELS.total_sales}</SelectItem>
            <SelectItem value="avg_check_size">{METRIC_LABELS.avg_check_size}</SelectItem>
            <SelectItem value="total_tips">{METRIC_LABELS.total_tips}</SelectItem>
            <SelectItem value="avg_tip_pct">{METRIC_LABELS.avg_tip_pct}</SelectItem>
            <SelectItem value="tables_turned">{METRIC_LABELS.tables_turned}</SelectItem>
            <SelectItem value="avg_table_turn_minutes">{METRIC_LABELS.avg_table_turn_minutes}</SelectItem>
          </SelectContent>
        </Select>
      }
    >
      <div className="space-y-6">
        {/* Bar Chart */}
        {chartData.length > 0 && (
          <ChartContainer config={chartConfig} className="aspect-auto h-[300px] w-full">
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 5, right: 16, left: 0, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={90} tick={CHART_TICK} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="value" fill="#3b82f6" radius={[0, 8, 8, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
          </ChartContainer>
        )}

        {/* Data Table */}
        {data?.leaderboard && (
          <DataTable columns={columns} data={data.leaderboard} tableClassName="min-w-[560px]" />
        )}
      </div>
    </ChartCard>
  )
}
