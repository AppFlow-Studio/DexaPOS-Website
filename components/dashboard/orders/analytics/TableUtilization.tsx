'use client'

import { ChartCard } from './ChartCard'
import { DataTable } from '@/components/ui/data-table'
import { Badge } from '@/components/ui/badge'
import { LayoutGrid } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import type { TableUtilizationRow } from '@/types/analytics'

interface TableUtilizationProps {
  tables?: TableUtilizationRow[] | null
  isLoading?: boolean
}

export function TableUtilization({ tables, isLoading }: TableUtilizationProps) {
  const isEmpty = !tables || tables.length === 0

  const formatTime = (minutes: number) => {
    const mins = Math.floor(minutes)
    const secs = Math.round((minutes - mins) * 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Determine RevPASH badge color based on threshold
  const getRevPASHColor = (revpash: number): 'default' | 'secondary' | 'destructive' | 'outline' => {
    if (revpash >= 75) return 'default' // Green-ish
    if (revpash >= 50) return 'secondary' // Yellow-ish
    return 'destructive' // Red
  }

  const columns: ColumnDef<TableUtilizationRow>[] = [
    {
      accessorKey: 'table_name',
      header: 'Table',
      cell: ({ row }) => (
        <div className="font-medium">{row.getValue('table_name')}</div>
      ),
    },
    {
      accessorKey: 'section_name',
      header: 'Section',
      cell: ({ row }) => (
        <span className="text-sm text-slate-600 dark:text-slate-400">
          {row.getValue('section_name') || 'Unassigned'}
        </span>
      ),
    },
    {
      accessorKey: 'capacity',
      header: 'Capacity',
      cell: ({ row }) => row.getValue('capacity'),
    },
    {
      accessorKey: 'total_sessions',
      header: 'Sessions',
      cell: ({ row }) => row.getValue('total_sessions'),
    },
    {
      accessorKey: 'avg_turn_time_minutes',
      header: 'Avg Turn',
      cell: ({ row }) => formatTime((row.getValue('avg_turn_time_minutes') as number) ?? 0),
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
      accessorKey: 'revpash',
      header: 'RevPASH',
      cell: ({ row }) => {
        const value = (row.getValue('revpash') as number) ?? 0
        return (
          <Badge variant={getRevPASHColor(value)}>
            ${value.toFixed(2)}
          </Badge>
        )
      },
    },
    {
      accessorKey: 'total_covers',
      header: 'Covers',
      cell: ({ row }) => row.getValue('total_covers'),
    },
  ]

  return (
    <ChartCard
      title="Table Utilization"
      subtitle="Per-table performance breakdown"
      icon={LayoutGrid}
      isLoading={isLoading}
      isEmpty={isEmpty}
      className="lg:col-span-2"
    >
      {!isEmpty && tables && (
        <div className="space-y-4">
          <DataTable columns={columns} data={tables} />
        </div>
      )}
    </ChartCard>
  )
}
