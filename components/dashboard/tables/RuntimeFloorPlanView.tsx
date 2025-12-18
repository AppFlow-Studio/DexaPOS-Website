'use client'

import * as React from 'react'
import { FloorPlan, TableWithSession } from '@/types/floor-plan'
import { InteractiveCanvas } from './InteractiveCanvas'
import { Button } from '@/components/ui/button'
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'
import { TableStatusBadge } from './TableStatusBadge'
import { cn } from '@/lib/utils'

interface RuntimeFloorPlanViewProps {
    floorPlan: FloorPlan | null
    tables: TableWithSession[]
    selectedTableId?: string
    onTableClick?: (tableId: string) => void
}

const getTableStatusColor = (status: string | null): string => {
    if (!status || status === 'available') return '#22c55e' // green
    if (['seated', 'ordered', 'served', 'check_presented'].includes(status)) return '#3b82f6' // blue
    if (status === 'cleaning') return '#ef4444' // red
    if (status === 'paid') return '#eab308' // yellow
    return '#6b7280' // gray
}

export function RuntimeFloorPlanView({
    floorPlan,
    tables,
    selectedTableId,
    onTableClick,
}: RuntimeFloorPlanViewProps) {
    const [viewport, setViewport] = React.useState({ zoom: 1, panX: 0, panY: 0 })

    // Auto-fit viewport on mount or when floor plan changes
    React.useEffect(() => {
        if (!floorPlan || tables.length === 0) return

        // Calculate bounds of all tables
        const visibleTables = tables.filter((t) => (t.is_visible !== false) && t.is_active)
        if (visibleTables.length === 0) return

        let minX = Infinity
        let minY = Infinity
        let maxX = -Infinity
        let maxY = -Infinity

        visibleTables.forEach((table) => {
            const width = table.width || 100
            const height = table.height || 100
            minX = Math.min(minX, table.x)
            minY = Math.min(minY, table.y)
            maxX = Math.max(maxX, table.x + width)
            maxY = Math.max(maxY, table.y + height)
        })

        const padding = 100
        const boundsWidth = maxX - minX + padding * 2
        const boundsHeight = maxY - minY + padding * 2

        // Get container dimensions (approximate)
        const containerWidth = window.innerWidth - 320 // Account for sidebar
        const containerHeight = window.innerHeight - 200 // Account for top bar

        const zoomX = containerWidth / boundsWidth
        const zoomY = containerHeight / boundsHeight
        const zoom = Math.min(zoomX, zoomY, 1) // Don't zoom in beyond 1x

        const centerX = (minX + maxX) / 2
        const centerY = (minY + maxY) / 2

        setViewport({
            zoom,
            panX: containerWidth / 2 - centerX * zoom,
            panY: containerHeight / 2 - centerY * zoom,
        })
    }, [floorPlan?.id, tables.length])

    const handleZoomIn = () => {
        setViewport((prev) => ({ ...prev, zoom: Math.min(prev.zoom * 1.2, 3) }))
    }

    const handleZoomOut = () => {
        setViewport((prev) => ({ ...prev, zoom: Math.max(prev.zoom / 1.2, 0.3) }))
    }

    const handleZoomReset = () => {
        // Recalculate fit-to-view
        if (!floorPlan || tables.length === 0) return

        const visibleTables = tables.filter((t) => (t.is_visible !== false) && t.is_active)
        if (visibleTables.length === 0) return

        let minX = Infinity
        let minY = Infinity
        let maxX = -Infinity
        let maxY = -Infinity

        visibleTables.forEach((table) => {
            const width = table.width || 100
            const height = table.height || 100
            minX = Math.min(minX, table.x)
            minY = Math.min(minY, table.y)
            maxX = Math.max(maxX, table.x + width)
            maxY = Math.max(maxY, table.y + height)
        })

        const padding = 100
        const boundsWidth = maxX - minX + padding * 2
        const boundsHeight = maxY - minY + padding * 2

        const containerWidth = window.innerWidth - 320
        const containerHeight = window.innerHeight - 200

        const zoomX = containerWidth / boundsWidth
        const zoomY = containerHeight / boundsHeight
        const zoom = Math.min(zoomX, zoomY, 1)

        const centerX = (minX + maxX) / 2
        const centerY = (minY + maxY) / 2

        setViewport({
            zoom,
            panX: containerWidth / 2 - centerX * zoom,
            panY: containerHeight / 2 - centerY * zoom,
        })
    }

    // Create status color and bill amount maps for InteractiveCanvas
    const tableStatusColors = React.useMemo(() => {
        const colorMap = new Map<string, string>()
        tables.forEach((table) => {
            const status = table.session?.status || 'available'
            colorMap.set(table.id, getTableStatusColor(status))
        })
        return colorMap
    }, [tables])

    const tableBillAmounts = React.useMemo(() => {
        const amountMap = new Map<string, number>()
        // TODO: Fetch order details to populate bill amounts
        // For now, we can extract from session.order_id if needed
        return amountMap
    }, [tables])

    return (
        <div className="flex-1 relative bg-muted/30">
            {/* Zoom controls */}
            <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
                <Button
                    variant="outline"
                    size="icon"
                    onClick={handleZoomIn}
                    className="bg-background/90 backdrop-blur-sm"
                >
                    <ZoomIn className="h-4 w-4" />
                </Button>
                <Button
                    variant="outline"
                    size="icon"
                    onClick={handleZoomOut}
                    className="bg-background/90 backdrop-blur-sm"
                >
                    <ZoomOut className="h-4 w-4" />
                </Button>
                <Button
                    variant="outline"
                    size="icon"
                    onClick={handleZoomReset}
                    className="bg-background/90 backdrop-blur-sm"
                >
                    <Maximize2 className="h-4 w-4" />
                </Button>
            </div>

            {/* Floor plan canvas */}
            <div className="w-full h-full overflow-hidden">
                <InteractiveCanvas
                    floorPlan={floorPlan}
                    tables={tables}
                    selectedTableIds={selectedTableId ? [selectedTableId] : []}
                    isDesignMode={false}
                    onTableClick={(tableId) => onTableClick?.(tableId)}
                    tableStatusColors={tableStatusColors}
                    tableBillAmounts={tableBillAmounts}
                />
            </div>

            {/* Legend */}
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-10 bg-background/90 backdrop-blur-sm border rounded-lg p-3 shadow-lg">
                <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-green-500" />
                        <span>Available</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-blue-500" />
                        <span>In Use</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-red-500" />
                        <span>Needs Cleaning</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-yellow-500" />
                        <span>Overtime</span>
                    </div>
                </div>
            </div>
        </div>
    )
}

