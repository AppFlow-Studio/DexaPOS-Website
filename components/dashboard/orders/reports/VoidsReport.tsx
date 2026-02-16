'use client'

import { useMemo, useState } from 'react'
import { useVoidsReport } from '@/app/dashboard/hooks/useOrderAnalytics'
import { ReportDataTable } from './ReportDataTable'
import { ReportToolbar } from './ReportToolbar'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty } from '@/components/ui/empty'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatReportDateRange } from '@/utils/export'
import type { VoidItem, RefundItem } from '@/app/dashboard/actions/order-analytics'
import type { ColumnDef } from '@tanstack/react-table'

interface VoidsReportProps {
  dateFrom: Date
  dateTo: Date
}

export function VoidsReport({ dateFrom, dateTo }: VoidsReportProps) {
  const { data, isLoading } = useVoidsReport(dateFrom, dateTo)
  const [activeTab, setActiveTab] = useState('voids')
  const [voidsSearchQuery, setVoidsSearchQuery] = useState('')
  const [refundsSearchQuery, setRefundsSearchQuery] = useState('')

  const filteredVoids = useMemo(() => {
    if (!data?.voids) return []
    return data.voids.filter((row) =>
      String(row.order_number).toLowerCase().includes(voidsSearchQuery.toLowerCase()) ||
      String(row.item_name).toLowerCase().includes(voidsSearchQuery.toLowerCase()) ||
      String(row.reason).toLowerCase().includes(voidsSearchQuery.toLowerCase()) ||
      String(row.voided_by).toLowerCase().includes(voidsSearchQuery.toLowerCase())
    )
  }, [data, voidsSearchQuery])

  const filteredRefunds = useMemo(() => {
    if (!data?.refunds) return []
    return data.refunds.filter((row) =>
      String(row.order_number).toLowerCase().includes(refundsSearchQuery.toLowerCase()) ||
      String(row.reason).toLowerCase().includes(refundsSearchQuery.toLowerCase()) ||
      String(row.refunded_by).toLowerCase().includes(refundsSearchQuery.toLowerCase())
    )
  }, [data, refundsSearchQuery])

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount)

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

  const voidColumns: ColumnDef<VoidItem>[] = [
    {
      accessorKey: 'order_number',
      header: 'Order #',
    },
    {
      accessorKey: 'item_name',
      header: 'Item',
    },
    {
      accessorKey: 'quantity',
      header: 'Qty',
      cell: ({ row }) => row.getValue('quantity'),
    },
    {
      accessorKey: 'reason',
      header: 'Reason',
    },
    {
      accessorKey: 'amount',
      header: 'Amount',
      cell: ({ row }) => formatCurrency(row.getValue('amount') as number),
    },
    {
      accessorKey: 'voided_by',
      header: 'Voided By',
    },
    {
      accessorKey: 'voided_at',
      header: 'Date/Time',
      cell: ({ row }) => formatDate(row.getValue('voided_at') as string),
    },
  ]

  const voidExportColumns = [
    { key: 'order_number' as const, header: 'Order #' },
    { key: 'item_name' as const, header: 'Item' },
    { key: 'quantity' as const, header: 'Qty' },
    { key: 'reason' as const, header: 'Reason' },
    {
      key: 'amount' as const,
      header: 'Amount',
      format: (v: number) => v.toFixed(2),
    },
    { key: 'voided_by' as const, header: 'Voided By' },
    {
      key: 'voided_at' as const,
      header: 'Date/Time',
      format: (v: string) =>
        new Date(v).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
    },
  ]

  const refundColumns: ColumnDef<RefundItem>[] = [
    {
      accessorKey: 'order_number',
      header: 'Order #',
    },
    {
      accessorKey: 'amount',
      header: 'Amount',
      cell: ({ row }) => formatCurrency(row.getValue('amount') as number),
    },
    {
      accessorKey: 'reason',
      header: 'Reason',
    },
    {
      accessorKey: 'refunded_by',
      header: 'Refunded By',
    },
    {
      accessorKey: 'refunded_at',
      header: 'Date/Time',
      cell: ({ row }) => formatDate(row.getValue('refunded_at') as string),
    },
  ]

  const refundExportColumns = [
    { key: 'order_number' as const, header: 'Order #' },
    {
      key: 'amount' as const,
      header: 'Amount',
      format: (v: number) => v.toFixed(2),
    },
    { key: 'reason' as const, header: 'Reason' },
    { key: 'refunded_by' as const, header: 'Refunded By' },
    {
      key: 'refunded_at' as const,
      header: 'Date/Time',
      format: (v: string) =>
        new Date(v).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
    },
  ]

  if (isLoading) {
    return <Skeleton className="h-[400px] w-full" />
  }

  if (!data || (!data.voids?.length && !data.refunds?.length)) {
    return <Empty description="No void or refund data for selected period" />
  }

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
      <TabsList>
        <TabsTrigger value="voids">Voids ({data.voids?.length || 0})</TabsTrigger>
        <TabsTrigger value="refunds">Refunds ({data.refunds?.length || 0})</TabsTrigger>
      </TabsList>

      <TabsContent value="voids">
        {data.voids && data.voids.length > 0 ? (
          <div className="space-y-4">
            <ReportToolbar
              searchQuery={voidsSearchQuery}
              onSearchChange={setVoidsSearchQuery}
              filteredCount={filteredVoids.length}
              totalCount={data.voids.length}
              data={filteredVoids}
              exportColumns={voidExportColumns}
              filename={`Voids - ${formatReportDateRange(dateFrom, dateTo)}`}
              searchPlaceholder="Search by order, item, reason, or staff..."
            />
            <ReportDataTable columns={voidColumns} data={filteredVoids} />
          </div>
        ) : (
          <Empty description="No voids for selected period" />
        )}
      </TabsContent>

      <TabsContent value="refunds">
        {data.refunds && data.refunds.length > 0 ? (
          <div className="space-y-4">
            <ReportToolbar
              searchQuery={refundsSearchQuery}
              onSearchChange={setRefundsSearchQuery}
              filteredCount={filteredRefunds.length}
              totalCount={data.refunds.length}
              data={filteredRefunds}
              exportColumns={refundExportColumns}
              filename={`Refunds - ${formatReportDateRange(dateFrom, dateTo)}`}
              searchPlaceholder="Search by order, reason, or staff..."
            />
            <ReportDataTable columns={refundColumns} data={filteredRefunds} />
          </div>
        ) : (
          <Empty description="No refunds for selected period" />
        )}
      </TabsContent>
    </Tabs>
  )
}
