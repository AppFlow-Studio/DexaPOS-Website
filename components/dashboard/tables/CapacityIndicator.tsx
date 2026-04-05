'use client'

import * as React from 'react'
// Progress component inline
import { TableWithSession } from '@/types/floor-plan'

interface CapacityIndicatorProps {
    tables: TableWithSession[]
}

export function CapacityIndicator({ tables }: CapacityIndicatorProps) {
    const capacity = React.useMemo(() => {
        const seatableTables = tables.filter(
            (t) => (t.category === 'table' || t.category === 'booth') && t.is_active && (t.is_visible !== false)
        )

        const occupiedTables = seatableTables.filter(
            (t) => t.session && t.session.status !== 'available' && t.session.status !== 'cleaning'
        )

        const totalCapacity = seatableTables.reduce((sum, t) => sum + (t.capacity || 0), 0)
        const occupiedCapacity = occupiedTables.reduce((sum, t) => sum + (t.capacity || 0), 0)

        return {
            occupied: occupiedTables.length,
            total: seatableTables.length,
            capacityPercent: totalCapacity > 0 ? Math.round((occupiedCapacity / totalCapacity) * 100) : 0,
        }
    }, [tables])

    return (
        <div className="space-y-1.5 px-2 py-2 border-b">
            <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">
                    {capacity.occupied}/{capacity.total} tables
                </span>
                <span className="font-medium">{capacity.capacityPercent}% capacity</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                    className="h-full bg-primary transition-all duration-300 rounded-full"
                    style={{ width: `${capacity.capacityPercent}%` }}
                />
            </div>
        </div>
    )
}

