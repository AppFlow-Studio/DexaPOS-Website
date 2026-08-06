'use client'

import * as React from 'react'
import { FloorPlanObject, FloorPlan } from '@/types/floor-plan'
import { TableRenderer } from './TableRenderer'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'
import { TABLE_SHAPES } from '@/utils/tables/table-shapes'

interface InteractiveCanvasProps {
    floorPlan: FloorPlan | null
    tables: FloorPlanObject[]
    selectedTableIds: string[]
    isDesignMode: boolean
    onTableClick?: (tableId: string) => void
    onTableDoubleClick?: (tableId: string) => void
    onTableDrag?: (tableId: string, x: number, y: number) => void
    onTableDragStart?: () => void
    onTableDragEnd?: () => void
    onCanvasDrop?: (x: number, y: number, shapeId?: string) => void
    onUpdateTableName?: (tableId: string, name: string) => void
    onUnmergeTable?: (tableId: string) => void
    // For runtime mode
    tableStatusColors?: Map<string, string> // tableId -> status color
    tableBillAmounts?: Map<string, number> // tableId -> bill amount
}

interface ViewportState {
    zoom: number
    panX: number
    panY: number
}

export function InteractiveCanvas({
    floorPlan,
    tables,
    selectedTableIds,
    isDesignMode,
    onTableClick,
    onTableDoubleClick,
    onTableDrag,
    onTableDragStart,
    onTableDragEnd,
    onCanvasDrop,
    onUpdateTableName,
    onUnmergeTable,
    tableStatusColors,
    tableBillAmounts,
}: InteractiveCanvasProps) {
    const canvasRef = React.useRef<SVGSVGElement>(null)
    const containerRef = React.useRef<HTMLDivElement>(null)
    const [draggedTableId, setDraggedTableId] = React.useState<string | null>(null)
    const [dragStart, setDragStart] = React.useState<{ x: number; y: number; tableX: number; tableY: number } | null>(null)
    const [isPanning, setIsPanning] = React.useState(false)
    const [panStart, setPanStart] = React.useState<{ x: number; y: number } | null>(null)
    const [viewport, setViewport] = React.useState<ViewportState>({ zoom: 1, panX: 0, panY: 0 })
    const [editingTableId, setEditingTableId] = React.useState<string | null>(null)
    const [editingName, setEditingName] = React.useState('')

    const canvasWidth = floorPlan?.canvas_width || 2000
    const canvasHeight = floorPlan?.canvas_height || 1500
    const gridSize = floorPlan?.grid_size || 20

    // Calculate bounding box of all visible tables
    const calculateBounds = React.useCallback(() => {
        const visibleTables = tables.filter((t) => (t.is_visible !== false) && t.is_active)
        if (visibleTables.length === 0) {
            return {
                minX: 0,
                minY: 0,
                maxX: canvasWidth,
                maxY: canvasHeight,
                centerX: canvasWidth / 2,
                centerY: canvasHeight / 2,
            }
        }

        let minX = Infinity
        let minY = Infinity
        let maxX = -Infinity
        let maxY = -Infinity

        visibleTables.forEach((table) => {
            // Import TABLE_SHAPES at the top level instead
            const shape = TABLE_SHAPES[table.shape_id]
            const width = table.width || shape?.width || 100
            const height = table.height || shape?.height || 100

            minX = Math.min(minX, table.x)
            minY = Math.min(minY, table.y)
            maxX = Math.max(maxX, table.x + width)
            maxY = Math.max(maxY, table.y + height)
        })

        const padding = 100
        return {
            minX: Math.max(0, minX - padding),
            minY: Math.max(0, minY - padding),
            maxX: Math.min(canvasWidth, maxX + padding),
            maxY: Math.min(canvasHeight, maxY + padding),
            centerX: (minX + maxX) / 2,
            centerY: (minY + maxY) / 2,
        }
    }, [tables, canvasWidth, canvasHeight])

    // Fit viewport to show all tables
    const fitToView = React.useCallback(() => {
        if (!containerRef.current) return

        const bounds = calculateBounds()
        const containerRect = containerRef.current.getBoundingClientRect()
        const contentWidth = bounds.maxX - bounds.minX
        const contentHeight = bounds.maxY - bounds.minY

        const scaleX = containerRect.width / contentWidth
        const scaleY = containerRect.height / contentHeight
        const zoom = Math.min(scaleX, scaleY, 2) // Max zoom of 2x

        const centerX = bounds.centerX
        const centerY = bounds.centerY

        // Calculate pan to center the content
        const panX = containerRect.width / 2 / zoom - centerX
        const panY = containerRect.height / 2 / zoom - centerY

        setViewport({ zoom, panX, panY })
    }, [calculateBounds])

    // Auto-fit on mount and when tables change
    React.useEffect(() => {
        if (tables.length > 0) {
            // Delay to ensure container is rendered
            setTimeout(fitToView, 100)
        }
    }, [tables.length, fitToView])

    // Global mouse move listener for dragging
    React.useEffect(() => {
        if (!isDesignMode) return

        const handleGlobalMouseMove = (e: MouseEvent) => {
            if (draggedTableId && dragStart && canvasRef.current && onTableDrag) {
                const rect = canvasRef.current.getBoundingClientRect()
                const currentSvgPoint = getSVGPoint(e.clientX, e.clientY, rect)
                const startSvgPoint = getSVGPoint(dragStart.x, dragStart.y, rect)

                // Calculate new position relative to drag start
                const deltaX = currentSvgPoint.x - startSvgPoint.x
                const deltaY = currentSvgPoint.y - startSvgPoint.y

                const newX = dragStart.tableX + deltaX
                const newY = dragStart.tableY + deltaY

                // Snap to grid
                const snappedX = Math.round(newX / gridSize) * gridSize
                const snappedY = Math.round(newY / gridSize) * gridSize

                onTableDrag(draggedTableId, snappedX, snappedY)
            }

            if (isPanning && panStart) {
                setViewport((prev) => ({
                    ...prev,
                    panX: e.clientX - panStart.x,
                    panY: e.clientY - panStart.y,
                }))
            }
        }

        const handleGlobalMouseUp = () => {
            if (draggedTableId) {
                setDraggedTableId(null)
                setDragStart(null)
                onTableDragEnd?.()
            }
            if (isPanning) {
                setIsPanning(false)
                setPanStart(null)
            }
        }

        window.addEventListener('mousemove', handleGlobalMouseMove)
        window.addEventListener('mouseup', handleGlobalMouseUp)

        return () => {
            window.removeEventListener('mousemove', handleGlobalMouseMove)
            window.removeEventListener('mouseup', handleGlobalMouseUp)
        }
    }, [isDesignMode, draggedTableId, dragStart, isPanning, panStart, onTableDrag, onTableDragEnd, gridSize])

    // Calculate viewBox with zoom and pan
    const viewBox = React.useMemo(() => {
        const { zoom, panX, panY } = viewport
        const viewWidth = canvasWidth / zoom
        const viewHeight = canvasHeight / zoom
        const viewX = -panX / zoom
        const viewY = -panY / zoom

        return `${viewX} ${viewY} ${viewWidth} ${viewHeight}`
    }, [viewport, canvasWidth, canvasHeight])

    const handleZoomIn = () => {
        setViewport((prev) => ({
            ...prev,
            zoom: Math.min(prev.zoom * 1.2, 5),
        }))
    }

    const handleZoomOut = () => {
        setViewport((prev) => ({
            ...prev,
            zoom: Math.max(prev.zoom / 1.2, 0.1),
        }))
    }

    const handleZoomReset = () => {
        fitToView()
    }

    const handleWheel = (e: React.WheelEvent) => {
        // Always prevent default to stop browser zoom
        e.preventDefault()
        e.stopPropagation()

        if (!isDesignMode) return

        const delta = e.deltaY > 0 ? 0.9 : 1.1
        setViewport((prev) => ({
            ...prev,
            zoom: Math.max(0.1, Math.min(5, prev.zoom * delta)),
        }))
    }

    const handleCanvasMouseDown = (e: React.MouseEvent) => {
        // Only handle panning if middle mouse button or space key is held
        if (!isDesignMode || (e.button !== 1 && e.button !== 0)) return

        // If left click on canvas (not on a table), allow panning with space key
        if (e.button === 0) {
            // Check if space key is held (we'll track this separately)
            return
        }

        // Middle mouse button for panning
        e.preventDefault()
        setIsPanning(true)
        setPanStart({ x: e.clientX - viewport.panX, y: e.clientY - viewport.panY })
    }

    const handleTableMouseDown = React.useCallback((e: React.MouseEvent, tableId: string) => {
        if (!isDesignMode || e.button !== 0) return // Only left mouse button

        e.stopPropagation()
        e.preventDefault()
        onTableDragStart?.()

        const rect = canvasRef.current?.getBoundingClientRect()
        if (!rect) return

        const table = tables.find((t) => t.id === tableId)
        if (!table) return

        setDraggedTableId(tableId)
        setDragStart({
            x: e.clientX,
            y: e.clientY,
            tableX: table.x,
            tableY: table.y,
        })
    }, [isDesignMode, tables, onTableDragStart])

    const handleMouseMove = React.useCallback((e: React.MouseEvent) => {
        if (isPanning && panStart) {
            setViewport((prev) => ({
                ...prev,
                panX: e.clientX - panStart.x,
                panY: e.clientY - panStart.y,
            }))
            return
        }

        if (draggedTableId && dragStart && canvasRef.current && onTableDrag) {
            const rect = canvasRef.current.getBoundingClientRect()
            const currentSvgPoint = getSVGPoint(e.clientX, e.clientY, rect)
            const startSvgPoint = getSVGPoint(dragStart.x, dragStart.y, rect)

            // Calculate new position relative to drag start
            const deltaX = currentSvgPoint.x - startSvgPoint.x
            const deltaY = currentSvgPoint.y - startSvgPoint.y

            const newX = dragStart.tableX + deltaX
            const newY = dragStart.tableY + deltaY

            // Snap to grid
            const snappedX = Math.round(newX / gridSize) * gridSize
            const snappedY = Math.round(newY / gridSize) * gridSize

            onTableDrag(draggedTableId, snappedX, snappedY)
        }
    }, [isPanning, panStart, draggedTableId, dragStart, onTableDrag, gridSize])

    const handleMouseUp = React.useCallback(() => {
        if (draggedTableId) {
            setDraggedTableId(null)
            setDragStart(null)
            onTableDragEnd?.()
        }
        if (isPanning) {
            setIsPanning(false)
            setPanStart(null)
        }
    }, [draggedTableId, isPanning, onTableDragEnd])

    const handleCanvasDrop = (e: React.DragEvent) => {
        e.preventDefault()
        if (!canvasRef.current || !onCanvasDrop) return

        const rect = canvasRef.current.getBoundingClientRect()
        const svgPoint = getSVGPoint(e.clientX, e.clientY, rect)

        const shapeId = e.dataTransfer.getData('shapeId')
        if (shapeId) {
            // Snap to grid
            const snappedX = Math.round(svgPoint.x / gridSize) * gridSize
            const snappedY = Math.round(svgPoint.y / gridSize) * gridSize
            onCanvasDrop(snappedX, snappedY, shapeId)
        }
    }

    const handleCanvasDragOver = (e: React.DragEvent) => {
        e.preventDefault()
    }

    const getSVGPoint = (clientX: number, clientY: number, rect: DOMRect) => {
        if (!canvasRef.current) return { x: 0, y: 0 }

        const svg = canvasRef.current
        const point = svg.createSVGPoint()
        point.x = clientX - rect.left
        point.y = clientY - rect.top

        const svgMatrix = svg.getScreenCTM()?.inverse()
        if (svgMatrix) {
            return point.matrixTransform(svgMatrix)
        }

        // Fallback calculation
        const { zoom } = viewport
        const scaleX = (canvasWidth / zoom) / rect.width
        const scaleY = (canvasHeight / zoom) / rect.height

        return {
            x: point.x * scaleX + viewport.panX / zoom,
            y: point.y * scaleY + viewport.panY / zoom,
        }
    }

    // Render grid
    const renderGrid = () => {
        const lines = []
        const strokeColor = '#e5e7eb'
        const strokeWidth = 0.5 / viewport.zoom

        // Vertical lines
        for (let x = 0; x <= canvasWidth; x += gridSize) {
            lines.push(
                <line
                    key={`v-${x}`}
                    x1={x}
                    y1={0}
                    x2={x}
                    y2={canvasHeight}
                    stroke={strokeColor}
                    strokeWidth={strokeWidth}
                />
            )
        }

        // Horizontal lines
        for (let y = 0; y <= canvasHeight; y += gridSize) {
            lines.push(
                <line
                    key={`h-${y}`}
                    x1={0}
                    y1={y}
                    x2={canvasWidth}
                    y2={y}
                    stroke={strokeColor}
                    strokeWidth={strokeWidth}
                />
            )
        }

        return <g className="grid">{lines}</g>
    }

    const handleTableNameEdit = (tableId: string, currentName: string) => {
        setEditingTableId(tableId)
        setEditingName(currentName)
    }

    const handleNameSave = () => {
        if (editingTableId && editingName.trim()) {
            onUpdateTableName?.(editingTableId, editingName.trim())
        }
        setEditingTableId(null)
        setEditingName('')
    }

    const handleNameCancel = () => {
        setEditingTableId(null)
        setEditingName('')
    }

    return (
        <div
            ref={containerRef}
            // `bg-muted/40`, not a hardcoded grey: the canvas backdrop has to
            // follow the theme or the floor plan stays a light slab in dark mode.
            className="relative h-full w-full overflow-hidden bg-muted/40"
            onWheel={handleWheel}
            onWheelCapture={(e) => {
                // Always prevent browser zoom on canvas
                e.preventDefault()
                e.stopPropagation()
            }}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{ userSelect: draggedTableId ? 'none' : 'auto' }}
        >
            {/* Zoom Controls */}
            {isDesignMode && (
                <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
                    <Button variant="outline" size="icon" onClick={handleZoomIn} title="Zoom In">
                        <ZoomIn className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" onClick={handleZoomOut} title="Zoom Out">
                        <ZoomOut className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" onClick={handleZoomReset} title="Fit to View">
                        <Maximize2 className="h-4 w-4" />
                    </Button>
                </div>
            )}

            <svg
                ref={canvasRef}
                viewBox={viewBox}
                className="w-full h-full"
                onDrop={handleCanvasDrop}
                onDragOver={handleCanvasDragOver}
                style={{ background: floorPlan?.background_color || '#ffffff', cursor: isPanning ? 'grabbing' : 'default' }}
            >
                {/* Grid background */}
                {isDesignMode && renderGrid()}

                {/* Tables */}
                <g className="tables">
                    {tables
                        .filter((table) => (table.is_visible !== false) && table.is_active)
                        .map((table) => (
                            <TableRenderer
                                key={table.id}
                                table={table}
                                isSelected={selectedTableIds.includes(table.id)}
                                isDragging={draggedTableId === table.id}
                                isEditing={editingTableId === table.id}
                                editingName={editingName}
                                onEditingNameChange={setEditingName}
                                onClick={() => onTableClick?.(table.id)}
                                onDoubleClick={() => onTableDoubleClick?.(table.id)}
                                onMouseDown={(e) => handleTableMouseDown(e, table.id)}
                                onNameEdit={() => handleTableNameEdit(table.id, table.name)}
                                onNameSave={handleNameSave}
                                onNameCancel={handleNameCancel}
                                onUnmerge={() => onUnmergeTable?.(table.id)}
                                statusColor={tableStatusColors?.get(table.id) || null}
                                billAmount={tableBillAmounts?.get(table.id) || null}
                            />
                        ))}
                </g>
            </svg>
        </div>
    )
}
