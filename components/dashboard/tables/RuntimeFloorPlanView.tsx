'use client'

import * as React from 'react'
import { useRef, useLayoutEffect, useState, useImperativeHandle, forwardRef } from 'react'
import { FloorPlan, FloorPlanObject } from '@/types/floor-plan'
import { cn } from '@/lib/utils'
import { useGesture } from '@use-gesture/react'
import { TableNode } from './TableNode'
import { Button } from '@/components/ui/button'
import { AlignCenter, Maximize2, Target, ZoomIn, ZoomOut } from 'lucide-react'
import { TABLE_SHAPES } from '@/utils/tables/table-shapes'
import { IconTargetArrow } from '@tabler/icons-react'

interface RuntimeFloorPlanViewProps {
    floorPlan: FloorPlan | null
    tables: FloorPlanObject[]
    selectedTableId?: string  // deprecated, use selectedTableIds
    selectedTableIds?: string[]  // new: support multi-select
    isDesignMode?: boolean
    onTableClick?: (tableId: string, e?: React.MouseEvent<HTMLDivElement>) => void
    onClearSelection?: () => void
    onUpdateTablePosition?: (id: string, x: number, y: number) => void
    onBatchUpdateTablePositions?: (updates: Array<{ id: string; x: number; y: number }>) => void
    onUpdateTableName?: (id: string, name: string) => void
    onUpdateTableSize?: (id: string, width: number, height: number) => void
    onUpdateTableRotation?: (id: string, rotation: number) => void
    onRotateEnd?: (id: string, rotation: number) => void
    onRemoveTable?: (id: string) => void
    onCanvasDrop?: (shapeId: string, x: number, y: number) => void
    onTableDragStart?: () => void
    onTableDragEnd?: () => void
}

export interface RuntimeFloorPlanViewRef {
    fitToView: () => void
}

// Helper for Colors
const getTableStatusColor = (status: string | undefined): string | undefined => {
    switch (status) {
        case 'available': return '#22c55e'
        case 'seated': return '#3b82f6'
        case 'ordered': return '#8b5cf6'
        case 'served': return '#f97316'
        case 'paid': return '#eab308'
        case 'cleaning': return '#ef4444'
        default: return undefined
    }
}

export const RuntimeFloorPlanView = forwardRef<RuntimeFloorPlanViewRef, RuntimeFloorPlanViewProps>(({
    floorPlan,
    tables: initialTables,
    selectedTableId,
    selectedTableIds: propSelectedTableIds,
    onTableClick,
    onClearSelection,
    isDesignMode = false,
    onUpdateTablePosition,
    onBatchUpdateTablePositions,
    onUpdateTableName,
    onUpdateTableSize,
    onUpdateTableRotation,
    onRotateEnd,
    onRemoveTable,
    onCanvasDrop,
    onTableDragStart,
    onTableDragEnd
}, ref) => {
    // Support both single and multi-select
    const selectedTableIds = propSelectedTableIds || (selectedTableId ? [selectedTableId] : [])
    const containerRef = useRef<HTMLDivElement>(null)
    const contentRef = useRef<HTMLDivElement>(null)
    const transformRef = useRef({ x: 0, y: 0, scale: 1 })
    const scaleRef = useRef(1)
    const [interactionMode, setInteractionMode] = useState<'select' | 'pan'>('select')
    // Track whether a table node is actively being dragged so the canvas pan gesture is suppressed
    const isDraggingTableRef = useRef(false)

    // Ensure design mode always uses select mode
    React.useEffect(() => {
        if (isDesignMode && interactionMode !== 'select') {
            setInteractionMode('select')
        }
    }, [isDesignMode, interactionMode])
    const initialTransformRef = useRef<{ x: number; y: number; scale: number } | null>(null)

    // --- 1. DOM Transform ---
    const updateTransform = () => {
        if (contentRef.current) {
            const { x, y, scale } = transformRef.current
            contentRef.current.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`
            scaleRef.current = scale
        }
    }

    // --- 2. Canvas Gestures (Pan/Zoom) ---
    useGesture(
        {
            onDrag: ({ offset: [dx, dy], event }) => {
                // Suppress canvas panning while a table node drag is in progress
                if (isDraggingTableRef.current) return
                const isTable = (event.target as HTMLElement).closest('[data-table-node]')
                if (isDesignMode && interactionMode === 'select' && isTable) return

                transformRef.current.x = dx
                transformRef.current.y = dy
                updateTransform()
            },
            onPinch: ({ offset: [d] }) => {
                transformRef.current.scale = d
                updateTransform()
            },
            onWheel: ({ delta: [dx, dy], ctrlKey, metaKey }) => {
                if (ctrlKey || metaKey) {
                    const sensitivity = 0.001
                    const newScale = Math.max(0.1, Math.min(8, transformRef.current.scale - dy * sensitivity))
                    transformRef.current.scale = newScale
                    updateTransform()
                } else {
                    transformRef.current.x -= dx
                    transformRef.current.y -= dy
                    updateTransform()
                }
            }
        },
        {
            target: containerRef,
            drag: { from: () => [transformRef.current.x, transformRef.current.y], filterTaps: true },
            pinch: { scaleBounds: { min: 0.1, max: 8 }, modifierKey: null },
            wheel: { eventOptions: { passive: false } }
        }
    )

    // Fit to view function - calculates bounds and centers/zooms to show all tables
    const fitToView = React.useCallback(() => {
        if (!containerRef.current || initialTables.length === 0) return

        // Filter visible and active tables
        const visibleTables = initialTables.filter((t) => t.is_visible !== false && t.is_active)
        if (visibleTables.length === 0) return

        // Calculate bounds of all tables
        let minX = Infinity
        let minY = Infinity
        let maxX = -Infinity
        let maxY = -Infinity

        visibleTables.forEach((table) => {
            const shape = TABLE_SHAPES[table.shape_id as keyof typeof TABLE_SHAPES]
            const width = table.width || shape?.width || 100
            const height = table.height || shape?.height || 100
            minX = Math.min(minX, table.x)
            minY = Math.min(minY, table.y)
            maxX = Math.max(maxX, table.x + width)
            maxY = Math.max(maxY, table.y + height)
        })

        const padding = 100
        const boundsWidth = maxX - minX + padding * 2
        const boundsHeight = maxY - minY + padding * 2

        // Get container dimensions
        const rect = containerRef.current.getBoundingClientRect()
        const containerWidth = rect.width
        const containerHeight = rect.height

        // Calculate zoom to fit
        const zoomX = containerWidth / boundsWidth
        const zoomY = containerHeight / boundsHeight
        const zoom = Math.min(zoomX, zoomY, 1) // Don't zoom in beyond 1x

        // Calculate center position
        const centerX = (minX + maxX) / 2
        const centerY = (minY + maxY) / 2

        // Set transform to center and zoom
        transformRef.current = {
            x: containerWidth / 2 - centerX * zoom,
            y: containerHeight / 2 - centerY * zoom,
            scale: zoom,
        }

        // Store as initial transform if not set
        if (!initialTransformRef.current) {
            initialTransformRef.current = { ...transformRef.current }
        }

        updateTransform()
    }, [initialTables])

    // Zoom functions
    const handleZoomIn = React.useCallback(() => {
        const newScale = Math.min(8, transformRef.current.scale * 1.2)
        transformRef.current.scale = newScale
        updateTransform()
    }, [])

    const handleZoomOut = React.useCallback(() => {
        const newScale = Math.max(0.1, transformRef.current.scale / 1.2)
        transformRef.current.scale = newScale
        updateTransform()
    }, [])

    // Expose fitToView via ref
    useImperativeHandle(ref, () => ({
        fitToView,
    }), [fitToView])

    // Auto fit on mount or when floor plan/tables change
    useLayoutEffect(() => {
        if (initialTables.length > 0) {
            // Reset transform when floor plan changes (detected by floorPlan.id)
            if (floorPlan?.id) {
                initialTransformRef.current = null
            }

            // Small delay to ensure container is rendered
            const timer = setTimeout(() => {
                fitToView()
            }, 100)
            return () => clearTimeout(timer)
        }
    }, [initialTables.length, floorPlan?.id, fitToView])

    // --- 3. TABLE DRAG TRACKING ---
    // These wrappers set/unset isDraggingTableRef so the canvas pan gesture
    // is suppressed while a table is being moved, preventing the whole canvas
    // from shifting alongside the dragged table.
    const handleTableDragStart = React.useCallback(() => {
        isDraggingTableRef.current = true
        onTableDragStart?.()
    }, [onTableDragStart])

    const handleTableDragEnd = React.useCallback(() => {
        isDraggingTableRef.current = false
        onTableDragEnd?.()
    }, [onTableDragEnd])

    // --- 4. DROP HANDLERS (CRITICAL) ---
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault() // REQUIRED to allow dropping
        e.dataTransfer.dropEffect = 'copy'
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()

        if (!isDesignMode || !onCanvasDrop || !containerRef.current) return

        const shapeId = e.dataTransfer.getData('shapeId')
        if (!shapeId) return

        // Calculate Coords
        const rect = containerRef.current.getBoundingClientRect()
        const mouseX = e.clientX - rect.left
        const mouseY = e.clientY - rect.top

        // Adjust for Pan/Zoom
        const { x: panX, y: panY, scale } = transformRef.current
        const canvasX = (mouseX - panX) / scale
        const canvasY = (mouseY - panY) / scale

        // Center item (offset -50)
        onCanvasDrop(shapeId, canvasX - 50, canvasY - 50)
    }

    return (
        <div className="relative bg-[#e5e5e5] h-full w-full overflow-hidden select-none animate-in fade-in duration-300">
            {/* Zoom Controls */}
            <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
                <Button
                    variant="outline"
                    size="icon"
                    onClick={handleZoomOut}
                    className="bg-background/90 backdrop-blur-sm shadow-lg"
                    title="Zoom out"
                >
                    <ZoomOut className="h-4 w-4" />
                </Button>
                <Button
                    variant="outline"
                    size="icon"
                    onClick={handleZoomIn}
                    className="bg-background/90 backdrop-blur-sm shadow-lg"
                    title="Zoom in"
                >
                    <ZoomIn className="h-4 w-4" />
                </Button>
                <Button
                    variant="outline"
                    size="icon"
                    onClick={fitToView}
                    className="bg-background/90 backdrop-blur-sm shadow-lg"
                    title="Center and zoom to fit all tables"
                >
                    <IconTargetArrow className="h-4 w-4" />
                </Button>
            </div>

            {/* Background Grid - POINTER EVENTS NONE ensures drops pass through to container */}
            <div
                style={{
                    backgroundImage: `
                        linear-gradient(0deg, rgba(107, 114, 128, 0.15) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(107, 114, 128, 0.15) 1px, transparent 1px)
                    `,
                    backgroundSize: `${floorPlan?.grid_size || 20}px ${floorPlan?.grid_size || 20}px`
                }}
                className={cn(
                    "absolute inset-0 pointer-events-none",
                    "dark:bg-slate-700/10",
                    "bg-slate-400/5"
                )}
            />

            {/* Viewport Container */}
            <div
                ref={containerRef}
                className={cn("w-full h-full touch-none", interactionMode === 'pan' ? "cursor-grab active:cursor-grabbing" : "cursor-default")}
                onDragOver={handleDragOver} // Must be present
                onDrop={handleDrop}         // Must be present
                onClick={(e) => {
                    // Deselect if clicking on empty canvas (not on a table)
                    if (e.target === containerRef.current) {
                        onClearSelection?.()
                    }
                }}
            >
                <div ref={contentRef} className="absolute top-0 left-0 w-0 h-0 origin-top-left will-change-transform">
                    {/* Canvas Boundary */}
                    {(floorPlan?.canvas_width || floorPlan?.canvas_height) && (
                        <div
                            style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: floorPlan.canvas_width || 1200,
                                height: floorPlan.canvas_height || 800,
                                border: '2px dashed rgba(99,102,241,0.45)',
                                borderRadius: 4,
                                backgroundColor: 'rgba(255,255,255,0.35)',
                                pointerEvents: 'none',
                            }}
                        />
                    )}
                    {initialTables.map(table => {
                        const session = (table as any).session
                        if (!table.shape_id) {
                            console.warn(`[RuntimeFloorPlanView] Table ${table.id} has no shape_id`)
                        }
                        return (
                            <div key={table.id} data-table-node>
                                <TableNode
                                    table={table}
                                    allTables={initialTables}
                                    scaleRef={scaleRef}
                                    isSelected={selectedTableIds.includes(table.id)}
                                    selectedTableIds={selectedTableIds}
                                    isDesignMode={isDesignMode}
                                    onSelect={(e) => onTableClick?.(table.id, e)}

                                    onUpdatePosition={onUpdateTablePosition || (() => { })}
                                    onBatchUpdatePositions={onBatchUpdateTablePositions}
                                    onUpdateName={onUpdateTableName || (() => { })}
                                    onUpdateSize={onUpdateTableSize}
                                    onUpdateRotation={onUpdateTableRotation}
                                    onRotateEnd={onRotateEnd}

                                    onDelete={() => onRemoveTable?.(table.id)}
                                    onDragStart={handleTableDragStart}
                                    onDragEnd={handleTableDragEnd}

                                    statusColor={getTableStatusColor(session?.status)}
                                    billAmount={session?.total_amount}
                                />
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
})

RuntimeFloorPlanView.displayName = 'RuntimeFloorPlanView'