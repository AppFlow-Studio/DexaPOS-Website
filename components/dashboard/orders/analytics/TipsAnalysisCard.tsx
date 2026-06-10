'use client'

import { useMemo } from 'react'
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { ChartCard } from './ChartCard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DataTable } from '@/components/ui/data-table'
import { ColumnDef } from '@tanstack/react-table'
import { CreditCard, DollarSign, Percent } from 'lucide-react'
import type { StaffPerformanceStats } from '@/types/analytics'

interface TipsAnalysisCardProps {
  data?: StaffPerformanceStats | null
  isLoading?: boolean
}

const chartConfig = {
  tips: {
    label: 'Tips',
    color: '#3b82f6',
  },
  cash: {
    label: 'Cash Tips',
    color: '#10b981',
  },
  card: {
    label: 'Card Tips',
    color: '#f59e0b',
  },
} satisfies ChartConfig

const PIE_COLORS = ['#10b981', '#f59e0b']

interface TipsByStaff {
  staff_id: string
  staff_name: string
  total_tips: number
  avg_tip_pct: number
}

export function TipsAnalysisCard({ data, isLoading }: TipsAnalysisCardProps) {
  const isEmpty = !data || (data.tips_analysis?.total_tips ?? 0) === 0

  const pieData = useMemo(() => {
    if (!data?.tips_analysis) return []
    return [
      { name: 'Cash Tips', value: data.tips_analysis.cash_tips || 0 },
      { name: 'Card Tips', value: data.tips_analysis.card_tips || 0 },
    ].filter((item) => item.value > 0)
  }, [data?.tips_analysis])

  const distributionData = useMemo(() => {
    if (!data?.tips_analysis?.tip_distribution) return []
    return data.tips_analysis.tip_distribution.map((item) => ({
      bucket: item.bucket,
      count: item.count,
    }))
  }, [data?.tips_analysis?.tip_distribution])

  const staffTipsData: TipsByStaff[] = useMemo(() => {
    return data?.tips_analysis?.by_staff || []
  }, [data?.tips_analysis?.by_staff])

  const columns: ColumnDef<TipsByStaff>[] = [
    {
      accessorKey: 'staff_name',
      header: 'Staff Member',
      cell: ({ row }) => (
        <div className="font-medium">{row.getValue('staff_name')}</div>
      ),
    },
    {
      accessorKey: 'total_tips',
      header: 'Total Tips',
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
  ]

  return (
    <ChartCard
      title="Tips Analysis"
      subtitle="Tip collection and distribution"
      icon={DollarSign}
      isLoading={isLoading}
      isEmpty={isEmpty}
      emptyMessage="No tips data available"
    >
      <div className="space-y-6">
        {/* Stat Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Tips</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ${(data?.tips_analysis?.total_tips ?? 0).toFixed(2)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Tip %</CardTitle>
              <Percent className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {(data?.tips_analysis?.avg_tip_pct ?? 0).toFixed(1)}%
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Cash vs Card</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="space-y-1 text-sm">
                <div>
                  Cash: ${(data?.tips_analysis?.cash_tips ?? 0).toFixed(2)}
                </div>
                <div>
                  Card: ${(data?.tips_analysis?.card_tips ?? 0).toFixed(2)}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Pie Chart */}
          {pieData.length > 0 && (
            <ChartContainer config={chartConfig} className="aspect-auto h-[300px] w-full">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    outerRadius="80%"
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    wrapperStyle={{ fontSize: 12 }}
                    formatter={(value, entry) => {
                      const v = (entry?.payload as { value?: number } | undefined)?.value
                      return `${value}${v != null ? `: $${v.toFixed(2)}` : ''}`
                    }}
                  />
                </PieChart>
            </ChartContainer>
          )}

          {/* Distribution Bar Chart */}
          {distributionData.length > 0 && (
            <ChartContainer config={chartConfig} className="aspect-auto h-[300px] w-full">
                <BarChart data={distributionData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="bucket" />
                  <YAxis />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" fill="#3b82f6" radius={[8, 8, 0, 0]} />
                </BarChart>
            </ChartContainer>
          )}
        </div>

        {/* Staff Tips Table */}
        {staffTipsData.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold mb-4">Tips by Staff Member</h3>
            <DataTable columns={columns} data={staffTipsData} tableClassName="min-w-[560px]" />
          </div>
        )}
      </div>
    </ChartCard>
  )
}
