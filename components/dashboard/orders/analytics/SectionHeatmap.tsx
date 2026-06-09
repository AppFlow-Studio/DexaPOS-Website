'use client'

import { ChartCard } from './ChartCard'
import { DataTable } from '@/components/ui/data-table'
import { Map } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import type { SectionStatsRow } from '@/types/analytics'

interface SectionHeatmapProps {
  sections?: SectionStatsRow[] | null
  isLoading?: boolean
}

export function SectionHeatmap({ sections, isLoading }: SectionHeatmapProps) {
  const isEmpty = !sections || sections.length === 0

  const formatTime = (minutes: number) => {
    const mins = Math.floor(minutes)
    const secs = Math.round((minutes - mins) * 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Find max revenue for color scaling
  const maxRevenue = sections && sections.length > 0
    ? Math.max(...sections.map((s) => s.total_revenue))
    : 0

  // Get color intensity based on revenue (red heat map)
  const getIntensity = (revenue: number) => {
    if (maxRevenue === 0) return 'rgba(226, 232, 240, 0.5)'
    const intensity = (revenue / maxRevenue) * 100
    if (intensity >= 75) return 'rgba(239, 68, 68, 0.7)' // Dark red
    if (intensity >= 50) return 'rgba(249, 115, 22, 0.6)' // Orange
    if (intensity >= 25) return 'rgba(251, 191, 36, 0.5)' // Yellow
    return 'rgba(241, 245, 249, 0.4)' // Light
  }

  const columns: ColumnDef<SectionStatsRow>[] = [
    {
      accessorKey: 'section_name',
      header: 'Section',
      cell: ({ row, table }) => {
        const section = row.original
        const sortedSections = table.getSortedRowModel().rows.map((r) => r.original)
        const maxRevForRow = Math.max(...sortedSections.map((s) => s.total_revenue))

        return (
          <div
            className="px-3 py-2 rounded font-medium transition-colors"
            style={{
              backgroundColor: getIntensity(section.total_revenue),
            }}
          >
            {row.getValue('section_name') || 'Unassigned'}
          </div>
        )
      },
    },
    {
      accessorKey: 'total_sessions',
      header: 'Sessions',
      cell: ({ row }) => row.getValue('total_sessions'),
    },
    {
      accessorKey: 'total_revenue',
      header: 'Revenue',
      cell: ({ row }) => {
        const value = (row.getValue('total_revenue') as number) ?? 0
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
        }).format(value)
      },
    },
    {
      accessorKey: 'avg_turn_time_minutes',
      header: 'Avg Turn Time',
      cell: ({ row }) => formatTime((row.getValue('avg_turn_time_minutes') as number) ?? 0),
    },
  ]

  return (
    <ChartCard
      title="Section Performance"
      subtitle="Revenue and turn time by section"
      icon={Map}
      isLoading={isLoading}
      isEmpty={isEmpty}
    >
      {!isEmpty && sections && (
        <div className="space-y-4">
          <DataTable columns={columns} data={sections} tableClassName="min-w-[560px]" />
          <div className="text-xs text-muted-foreground flex items-center gap-4 px-3">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgba(239, 68, 68, 0.7)' }} />
              <span>High Revenue</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgba(251, 191, 36, 0.5)' }} />
              <span>Medium</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgba(241, 245, 249, 0.4)' }} />
              <span>Low Revenue</span>
            </div>
          </div>
        </div>
      )}
    </ChartCard>
  )
}
