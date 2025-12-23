'use client'

import * as React from 'react'
import { TableWithSession } from '@/types/floor-plan'
import { Card, CardContent } from '@/components/ui/card'
import { Users } from 'lucide-react'
import { SeatedCard } from './SeatedCard'

interface SeatedPanelProps {
    tables: TableWithSession[]
    onViewOrder?: (tableId: string, orderId?: string) => void
    onTransfer?: (tableId: string) => void
    onClose?: (tableId: string) => void
}

export function SeatedPanel({ tables, onViewOrder, onTransfer, onClose }: SeatedPanelProps) {
    const seatedTables = tables.filter(
        (t) =>
            t.session &&
            t.session.status !== 'available' &&
            t.session.status !== 'cleaning' &&
            t.session.status !== 'paid'
    )

    if (seatedTables.length === 0) {
        return (
            <Card>
                <CardContent className="py-8">
                    <div className="text-center text-muted-foreground">
                        <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No tables currently seated</p>
                    </div>
                </CardContent>
            </Card>
        )
    }

    return (
        <div className="space-y-2">
            {seatedTables.map((table) => (
                <SeatedCard
                    key={table.id}
                    table={table}
                    onViewOrder={onViewOrder}
                    onTransfer={onTransfer}
                    onClose={onClose}
                />
            ))}
        </div>
    )
}

