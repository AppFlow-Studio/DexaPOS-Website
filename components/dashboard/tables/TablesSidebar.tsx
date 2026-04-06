'use client'

import * as React from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  TableWithSession,
  TableStatus,
  WaitlistEntry,
  Reservation
} from '@/types/floor-plan'
import { CapacityIndicator } from './CapacityIndicator'
import { WaitlistPanel } from './WaitlistPanel'
import { SeatedPanel } from './SeatedPanel'
import { HistoryPanel } from './HistoryPanel'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface TablesSidebarProps {
  locationId: string
  tables: TableWithSession[]
  waitlistInfo?: {
    waitlist: WaitlistEntry[]
    summary: {
      total_waiting: number
      total_notified: number
      avg_wait_time: number
    }
  }
  reservations: Reservation[]
  searchQuery: string
  selectedTableId?: string
  onTableClick?: (tableId: string) => void
  onWaitlistNotify?: (entryId: string) => void
  onWaitlistSeat?: (entryId: string) => void
  onWaitlistRemove?: (entryId: string) => void
  onSeatedViewOrder?: (tableId: string, orderId?: string) => void
  onSeatedTransfer?: (tableId: string) => void
  onSeatedClose?: (tableId: string) => void
}

const getTableStatusColor = (status: string | null): string => {
  if (!status || status === 'available') return '#2D9E7A'
  if (status === 'seated') return '#3D6FA8'
  if (status === 'ordered') return '#B86A2E'
  if (status === 'served') return '#A07C20'
  if (status === 'check_presented') return '#7C4DA0'
  if (status === 'paid') return '#B04040'
  if (status === 'cleaning') return '#5A6270'
  if (status === 'not_in_service' || status === 'blocked') return '#1F2937'
  if (status === 'overtime') return '#C17D2A'
  if (status === 'seating') return '#4A7FA5'
  if (status === 'ordering') return '#6B5FA0'
  if (status === 'paying') return '#C17D2A'
  if (status === 'closing') return '#A05050'
  return '#2D9E7A'
}

type TableFilter = 'all' | 'available' | 'occupied' | 'attention'

const STATUS_LABELS: Record<string, string> = {
  available: 'Available',
  seated: 'Seated',
  ordered: 'Ordered',
  served: 'Served',
  check_presented: 'Check Presented',
  paid: 'Paid',
  cleaning: 'Cleaning',
  blocked: 'Not in Service',
  not_in_service: 'Not in Service',
  overtime: 'Overtime',
  seating: 'Seating',
  ordering: 'Ordering',
  paying: 'Paying',
  closing: 'Closing',
  reserved: 'Reserved',
  out: 'Out'
}

export function TablesSidebar ({
  locationId,
  tables,
  waitlistInfo,
  reservations,
  searchQuery,
  selectedTableId,
  onTableClick,
  onWaitlistNotify,
  onWaitlistSeat,
  onWaitlistRemove,
  onSeatedViewOrder,
  onSeatedTransfer,
  onSeatedClose
}: TablesSidebarProps) {
  const [activeTab, setActiveTab] = React.useState('tables')
  const [tableFilter, setTableFilter] = React.useState<TableFilter>('all')

  const seatableTables = React.useMemo(
    () =>
      tables.filter(
        t =>
          (t.category === 'table' || t.category === 'booth') &&
          t.is_active &&
          t.is_visible !== false
      ),
    [tables]
  )

  const tableCounts = React.useMemo(() => {
    const byStatus: Partial<Record<TableStatus, number>> = {}
    let available = 0
    let occupied = 0
    let attention = 0

    seatableTables.forEach(t => {
      const status = (t.session?.status || 'available') as TableStatus
      byStatus[status] = (byStatus[status] || 0) + 1

      if (status === 'available') {
        available += 1
      } else {
        occupied += 1
      }

      if (
        status === 'check_presented' ||
        status === 'cleaning' ||
        status === 'blocked'
      ) {
        attention += 1
      }
    })

    return {
      total: seatableTables.length,
      available,
      occupied,
      attention,
      byStatus
    }
  }, [seatableTables])

  const filteredTables = React.useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

    return seatableTables.filter(t => {
      const status = t.session?.status || 'available'
      const matchesQuery =
        !query ||
        t.name.toLowerCase().includes(query) ||
        (t.zone_name || '').toLowerCase().includes(query) ||
        (t.session?.guest_name || '').toLowerCase().includes(query)

      if (!matchesQuery) return false

      if (tableFilter === 'available') return status === 'available'
      if (tableFilter === 'occupied') return status !== 'available'
      if (tableFilter === 'attention') {
        return ['check_presented', 'cleaning', 'blocked'].includes(status)
      }
      return true
    })
  }, [seatableTables, searchQuery, tableFilter])

  // Sort tables: occupied first, then by name
  const sortedTables = React.useMemo(() => {
    return [...filteredTables].sort((a, b) => {
      const aHasSession = a.session && a.session.status !== 'available'
      const bHasSession = b.session && b.session.status !== 'available'

      if (aHasSession && !bHasSession) return -1
      if (!aHasSession && bHasSession) return 1
      return a.name.localeCompare(b.name)
    })
  }, [filteredTables])

  // Get bill amount for a table (would need to fetch order details)
  const getBillAmount = (table: TableWithSession): number | null => {
    if (!table.session?.order_id) return null
    // TODO: Fetch order details to get actual bill amount
    // For now, return null
    return null
  }

  return (
    <div className='w-80 border-r bg-background flex flex-col h-full'>
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className='flex flex-col h-full'
      >
        <TabsList className='m-1 grid w-auto grid-cols-4 rounded-md border bg-muted/40 p-0.5'>
          <TabsTrigger
            value='tables'
            className='h-6 text-[10px] rounded-sm px-1'
          >
            Tables
          </TabsTrigger>
          <TabsTrigger
            value='waitlist'
            className='h-6 text-[10px] rounded-sm px-1'
          >
            Waitlist
          </TabsTrigger>
          <TabsTrigger
            value='seated'
            className='h-6 text-[10px] rounded-sm px-1'
          >
            Seated
          </TabsTrigger>
          <TabsTrigger
            value='history'
            className='h-6 text-[10px] rounded-sm px-1'
          >
            History
          </TabsTrigger>
        </TabsList>

        <div className='flex-1 overflow-hidden'>
          <TabsContent value='tables' className='m-0 h-full flex flex-col'>
            <div className='px-2 pb-1.5 pt-1 space-y-1.5 border-b bg-background'>
              <div className='flex gap-1 overflow-x-auto pb-0.5'>
                <Button
                  size='sm'
                  variant={tableFilter === 'all' ? 'default' : 'outline'}
                  className='h-5 text-[9px] px-1.5'
                  onClick={() => setTableFilter('all')}
                >
                  All
                </Button>
                <Button
                  size='sm'
                  variant={tableFilter === 'available' ? 'default' : 'outline'}
                  className='h-5 text-[9px] px-1.5'
                  onClick={() => setTableFilter('available')}
                >
                  Available
                </Button>
                <Button
                  size='sm'
                  variant={tableFilter === 'occupied' ? 'default' : 'outline'}
                  className='h-5 text-[9px] px-1.5'
                  onClick={() => setTableFilter('occupied')}
                >
                  Occupied
                </Button>
                <Button
                  size='sm'
                  variant={tableFilter === 'attention' ? 'default' : 'outline'}
                  className='h-5 text-[9px] px-1.5'
                  onClick={() => setTableFilter('attention')}
                >
                  Attention
                </Button>
              </div>
            </div>

            <CapacityIndicator tables={tables} />
            <div className='flex-1 overflow-y-auto'>
              <div className='p-1 space-y-1'>
                {sortedTables.length === 0 ? (
                  <div className='text-center text-muted-foreground py-4'>
                    <p className='text-[11px] font-medium'>No tables found</p>
                    <p className='text-[10px] mt-0.5'>
                      Try a different filter or search term.
                    </p>
                  </div>
                ) : (
                  sortedTables.map(table => {
                    const status = table.session?.status || 'available'
                    const statusColor = getTableStatusColor(status)
                    const statusLabel = STATUS_LABELS[status] || status
                    const subtitle =
                      table.session?.guest_name ||
                      (status === 'available' ? 'Available' : statusLabel)
                    const billAmount = getBillAmount(table)
                    const isSelected = selectedTableId === table.id

                    return (
                      <div
                        key={table.id}
                        onClick={() => onTableClick?.(table.id)}
                        className={cn(
                          'group rounded-md border px-2 py-1.5 cursor-pointer transition-all',
                          isSelected
                            ? 'bg-primary/10 border-primary/50 shadow-sm'
                            : 'bg-card border-border hover:border-primary/30'
                        )}
                      >
                        <div className='flex-1 min-w-0 space-y-0.5'>
                          <div className='flex items-center justify-between gap-1.5'>
                            <div className='min-w-0'>
                              <div className='flex items-center gap-1.5'>
                                <span
                                  className={cn(
                                    'w-1.5 h-1.5 rounded-full shrink-0',
                                    (status === 'not_in_service' ||
                                      status === 'blocked') &&
                                      'border border-white/30'
                                  )}
                                  style={{ backgroundColor: statusColor }}
                                />
                                <span className='font-semibold text-[11px] truncate'>
                                  {table.name}
                                </span>
                              </div>
                              {(table.zone_name || '').trim() && (
                                <div className='text-[9px] text-muted-foreground truncate'>
                                  Zone: {table.zone_name}
                                </div>
                              )}
                            </div>

                            <div className='flex items-center gap-1 shrink-0'>
                              <span className='text-[8px] px-1.5 py-0.5 rounded-full border bg-background text-foreground/80 capitalize'>
                                {statusLabel}
                              </span>
                              {billAmount !== null && (
                                <span className='text-[9px] font-semibold'>
                                  ${billAmount.toFixed(2)}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className='flex items-center justify-between text-[10px] text-muted-foreground'>
                            <div className='min-w-0 truncate'>
                              {subtitle}
                              {table.session?.party_size && (
                                <span className='ml-1'>
                                  • {table.session.party_size} guests
                                </span>
                              )}
                            </div>
                            {(table.capacity || 0) > 0 && (
                              <span className='shrink-0 ml-2 text-[9px]'>
                                Seats {table.capacity}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value='waitlist' className='m-0 h-full'>
            <div className='h-full overflow-y-auto'>
              <div className='p-2'>
                <WaitlistPanel
                  locationId={locationId}
                  waitlistInfo={waitlistInfo}
                  onNotify={onWaitlistNotify}
                  onSeat={onWaitlistSeat}
                  onRemove={onWaitlistRemove}
                  onRefresh={() => {
                    // This will be handled by the wizard's query invalidation
                  }}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value='seated' className='m-0 h-full'>
            <div className='h-full overflow-y-auto'>
              <div className='p-2'>
                <SeatedPanel
                  tables={tables}
                  onViewOrder={onSeatedViewOrder}
                  onTransfer={onSeatedTransfer}
                  onClose={onSeatedClose}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value='history' className='m-0 h-full'>
            <div className='h-full overflow-y-auto'>
              <div className='p-2'>
                <HistoryPanel sessions={[]} />
              </div>
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}
