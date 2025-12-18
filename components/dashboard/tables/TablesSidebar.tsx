'use client'

import * as React from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TableWithSession, WaitlistEntry, Reservation } from '@/types/floor-plan'
import { CapacityIndicator } from './CapacityIndicator'
import { WaitlistPanel } from './WaitlistPanel'
import { SeatedPanel } from './SeatedPanel'
import { HistoryPanel } from './HistoryPanel'
import { TableStatusBadge } from './TableStatusBadge'
import { cn } from '@/lib/utils'

interface TablesSidebarProps {
    tables: TableWithSession[]
    waitlist: WaitlistEntry[]
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

const getTableStatusColor = (status: string | null): 'green' | 'blue' | 'red' | 'yellow' => {
    if (!status || status === 'available') return 'green'
    if (['seated', 'ordered', 'served', 'check_presented'].includes(status)) return 'blue'
    if (status === 'cleaning') return 'red'
    if (status === 'paid') return 'yellow'
    return 'green'
}

export function TablesSidebar({
    tables,
    waitlist,
    reservations,
    searchQuery,
    selectedTableId,
    onTableClick,
    onWaitlistNotify,
    onWaitlistSeat,
    onWaitlistRemove,
    onSeatedViewOrder,
    onSeatedTransfer,
    onSeatedClose,
}: TablesSidebarProps) {
    const [activeTab, setActiveTab] = React.useState('tables')

    console.log('[TablesSidebar] tables', tables)
    // Filter tables by search query
    const filteredTables = React.useMemo(() => {
        const seatableTables = tables.filter(
            (t) => (t.category === 'table' || t.category === 'booth') && t.is_active && (t.is_visible !== false)
        )

        if (!searchQuery.trim()) {
            return seatableTables
        }

        const query = searchQuery.toLowerCase()
        return seatableTables.filter((t) => t.name.toLowerCase().includes(query))
    }, [tables, searchQuery])

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
    console.log('[TablesSidebar] sortedTables', sortedTables)

    // Get bill amount for a table (would need to fetch order details)
    const getBillAmount = (table: TableWithSession): number | null => {
        if (!table.session?.order_id) return null
        // TODO: Fetch order details to get actual bill amount
        // For now, return null
        return null
    }

    return (
        <div className="w-80 border-r bg-background flex flex-col h-full">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
                <TabsList className="grid w-full grid-cols-4 rounded-none border-b">
                    <TabsTrigger value="tables" className="text-xs">
                        Tables
                    </TabsTrigger>
                    <TabsTrigger value="waitlist" className="text-xs">
                        Waitlist
                    </TabsTrigger>
                    <TabsTrigger value="seated" className="text-xs">
                        Seated
                    </TabsTrigger>
                    <TabsTrigger value="history" className="text-xs">
                        History
                    </TabsTrigger>
                </TabsList>

                <div className="flex-1 overflow-hidden">
                    <TabsContent value="tables" className="m-0 h-full flex flex-col">
                        <CapacityIndicator tables={tables} />
                        <div className="flex-1 overflow-y-auto">
                            <div className="p-2 space-y-1">
                                {sortedTables.length === 0 ? (
                                    <div className="text-center text-muted-foreground py-8">
                                        <p>No tables found</p>
                                    </div>
                                ) : (
                                    sortedTables.map((table) => {
                                        const status = table.session?.status || 'available'
                                        const statusColor = getTableStatusColor(status)
                                        const billAmount = getBillAmount(table)
                                        const isSelected = selectedTableId === table.id

                                        return (
                                            <div
                                                key={table.id}
                                                onClick={() => onTableClick?.(table.id)}
                                                className={cn(
                                                    'flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors',
                                                    isSelected
                                                        ? 'bg-primary text-primary-foreground'
                                                        : 'hover:bg-accent'
                                                )}
                                            >
                                                <div
                                                    className={cn(
                                                        'w-3 h-3 rounded-full shrink-0',
                                                        statusColor === 'green' && 'bg-green-500',
                                                        statusColor === 'blue' && 'bg-blue-500',
                                                        statusColor === 'red' && 'bg-red-500',
                                                        statusColor === 'yellow' && 'bg-yellow-500'
                                                    )}
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className="font-medium text-sm truncate">
                                                            {table.name}
                                                        </span>
                                                        {billAmount !== null && (
                                                            <span className="text-xs font-semibold shrink-0">
                                                                ${billAmount.toFixed(2)}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground mt-0.5">
                                                        {table.session?.guest_name || 'Available'}
                                                        {table.session?.party_size && (
                                                            <span className="ml-1">
                                                                • {table.session.party_size} guests
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

                    <TabsContent value="waitlist" className="m-0 h-full">
                        <div className="h-full overflow-y-auto">
                            <div className="p-4">
                                <WaitlistPanel
                                    waitlist={waitlist}
                                    onNotify={onWaitlistNotify}
                                    onSeat={onWaitlistSeat}
                                    onRemove={onWaitlistRemove}
                                />
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="seated" className="m-0 h-full">
                        <div className="h-full overflow-y-auto">
                            <div className="p-4">
                                <SeatedPanel
                                    tables={tables}
                                    onViewOrder={onSeatedViewOrder}
                                    onTransfer={onSeatedTransfer}
                                    onClose={onSeatedClose}
                                />
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="history" className="m-0 h-full">
                        <div className="h-full overflow-y-auto">
                            <div className="p-4">
                                <HistoryPanel sessions={[]} />
                            </div>
                        </div>
                    </TabsContent>
                </div>
            </Tabs>
        </div>
    )
}

