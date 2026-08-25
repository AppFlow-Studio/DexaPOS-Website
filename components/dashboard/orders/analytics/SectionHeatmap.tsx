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

  const columns: ColumnDef<SectionStatsRow>[] = [
    {
      accessorKey: 'section_name',
      header: 'Section',
      cell: ({ row }) => (
        <div className="font-medium">
          {row.getValue('section_name') || 'Unassigned'}
        </div>
      ),
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
        <DataTable columns={columns} data={sections} tableClassName="min-w-[560px]" />
      )}
    </ChartCard>
  )
}
