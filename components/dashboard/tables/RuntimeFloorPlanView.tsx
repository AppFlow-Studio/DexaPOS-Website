'use client'

import * as React from 'react'
import {
  useRef,
  useLayoutEffect,
  useState,
  useImperativeHandle,
  forwardRef
} from 'react'
import { FloorPlan, FloorPlanObject } from '@/types/floor-plan'
import { cn } from '@/lib/utils'
import { useGesture } from '@use-gesture/react'
import { TableNode } from './TableNode'
import { Button } from '@/components/ui/button'
import { ZoomIn, ZoomOut } from 'lucide-react'
import { TABLE_SHAPES } from '@/utils/tables/table-shapes'
import { IconTargetArrow } from '@tabler/icons-react'

interface RuntimeFloorPlanViewProps {
  floorPlan: FloorPlan | null
  tables: FloorPlanObject[]
  selectedTableId?: string // deprecated, use selectedTableIds
  selectedTableIds?: string[] // new: support multi-select
  isDesignMode?: boolean
  onTableClick?: (tableId: string, e?: React.MouseEvent<HTMLDivElement>) => void
  onClearSelection?: () => void
  onUpdateTablePosition?: (id: string, x: number, y: number) => void
  onBatchUpdateTablePositions?: (
    updates: Array<{ id: string; x: number; y: number }>
  ) => void
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

// Helper for status colors used on the runtime canvas and legend.
const getTableStatusColor = (status: string | undefined): string => {
  switch (status) {
    case 'available':
      return '#2D9E7A'
    case 'seated':
      return '#3D6FA8'
    case 'ordered':
      return '#B86A2E'
    case 'served':
      return '#A07C20'
    case 'check_presented':
      return '#7C4DA0'
    case 'paid':
      return '#B04040'
    case 'cleaning':
      return '#5A6270'
    case 'not_in_service':
      return '#1F2937'
    case 'blocked': // legacy alias
      return '#1F2937'
    case 'overtime':
      return '#C17D2A'
    case 'seating':
      return '#4A7FA5'
    case 'ordering':
      return '#6B5FA0'
    case 'paying':
      return '#C17D2A'
    case 'closing':
      return '#A05050'
    default:
      return '#2D9E7A'
  }
}

const STATUS_LEGEND_ITEMS = [
  { status: 'available', label: 'Available' },
  { status: 'seated', label: 'Seated' },
  { status: 'ordered', label: 'Ordered' },
  { status: 'served', label: 'Served' },
  { status: 'check_presented', label: 'Check' },
  { status: 'paid', label: 'Paid' },
  { status: 'cleaning', label: 'Cleaning' },
  { status: 'blocked', label: 'Blocked' }
] as const

export const RuntimeFloorPlanView = forwardRef<
  RuntimeFloorPlanViewRef,
  RuntimeFloorPlanViewProps
>(
  (
    {
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
    },
    ref
  ) => {
    const MAX_SCALE = 4
    const WHEEL_ZOOM_DELTA_PER_PIXEL = 0.000002
    const MAX_WHEEL_ZOOM_DELTA = 0.0008
    const BUTTON_ZOOM_STEP_FACTOR = 1.2

    // Support both single and multi-select
    const selectedTableIds =
      propSelectedTableIds || (selectedTableId ? [selectedTableId] : [])
    const containerRef = useRef<HTMLDivElement>(null)
    const contentRef = useRef<HTMLDivElement>(null)
    const transformRef = useRef({ x: 0, y: 0, scale: 1 })
    const scaleRef = useRef(1)
    const [interactionMode, setInteractionMode] = useState<'select' | 'pan'>(
      'select'
    )
    // Track whether a table node is actively being dragged so the canvas pan gesture is suppressed
    const isDraggingTableRef = useRef(false)

    // Ensure design mode always uses select mode
    React.useEffect(() => {
      if (isDesignMode && interactionMode !== 'select') {
        setInteractionMode('select')
      }
    }, [isDesignMode, interactionMode])
    const initialTransformRef = useRef<{
      x: number
      y: number
      scale: number
    } | null>(null)
    const lastAutoFitFloorPlanIdRef = useRef<string | null>(null)
    const fitToViewLatestRef = useRef<() => void>(() => {})

    // --- 1. DOM Transform ---
    const getMinScale = React.useCallback(() => {
      if (!containerRef.current) return 0.25

      const rect = containerRef.current.getBoundingClientRect()
      const canvasWidth = floorPlan?.canvas_width || 1200
      const canvasHeight = floorPlan?.canvas_height || 800
      const padding = 80

      return Math.min(
        1,
        rect.width / (canvasWidth + padding),
        rect.height / (canvasHeight + padding)
      )
    }, [floorPlan?.canvas_width, floorPlan?.canvas_height])

    const updateTransform = () => {
      if (contentRef.current) {
        const { x, y, scale } = transformRef.current
        contentRef.current.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`
        scaleRef.current = scale
      }
    }

    const clampPanToBounds = React.useCallback(() => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const containerWidth = rect.width
      const containerHeight = rect.height
      const canvasWidth = floorPlan?.canvas_width || 1200
      const canvasHeight = floorPlan?.canvas_height || 800
      const scaledWidth = canvasWidth * transformRef.current.scale
      const scaledHeight = canvasHeight * transformRef.current.scale

      const scale = transformRef.current.scale
      const overscroll =
        Math.max(240, Math.min(containerWidth, containerHeight) * 0.35) * scale

      let minX = containerWidth - scaledWidth - overscroll
      let maxX = overscroll
      let minY = containerHeight - scaledHeight - overscroll
      let maxY = overscroll

      if (scaledWidth <= containerWidth) {
        const centeredX = (containerWidth - scaledWidth) / 2
        minX = centeredX - overscroll / 2
        maxX = centeredX + overscroll / 2
      }

      if (scaledHeight <= containerHeight) {
        const centeredY = (containerHeight - scaledHeight) / 2
        minY = centeredY - overscroll / 2
        maxY = centeredY + overscroll / 2
      }

      transformRef.current.x = Math.min(
        maxX,
        Math.max(minX, transformRef.current.x)
      )
      transformRef.current.y = Math.min(
        maxY,
        Math.max(minY, transformRef.current.y)
      )
    }, [floorPlan?.canvas_width, floorPlan?.canvas_height])

    const zoomAroundPoint = React.useCallback(
      (nextScale: number, pointX: number, pointY: number) => {
        const clampedScale = Math.max(
          getMinScale(),
          Math.min(MAX_SCALE, nextScale)
        )
        const currentScale = transformRef.current.scale
        if (clampedScale === currentScale) return

        const ratio = clampedScale / currentScale
        transformRef.current.x =
          pointX - (pointX - transformRef.current.x) * ratio
        transformRef.current.y =
          pointY - (pointY - transformRef.current.y) * ratio
        transformRef.current.scale = clampedScale

        clampPanToBounds()
        updateTransform()
      },
      [clampPanToBounds, getMinScale]
    )

    const zoomAroundViewportCenter = React.useCallback(
      (nextScale: number) => {
        if (!containerRef.current) return

        const rect = containerRef.current.getBoundingClientRect()
        const centerX = rect.width / 2
        const centerY = rect.height / 2
        zoomAroundPoint(nextScale, centerX, centerY)
      },
      [zoomAroundPoint]
    )

    // --- 2. Canvas Gestures (Pan/Zoom) ---
    useGesture(
      {
        onDrag: ({ offset: [dx, dy], event }) => {
          // Suppress canvas panning while a table node drag is in progress
          if (isDraggingTableRef.current) return
          const isTable = (event.target as HTMLElement).closest(
            '[data-table-node]'
          )
          if (isDesignMode && interactionMode === 'select' && isTable) return

          transformRef.current.x = dx
          transformRef.current.y = dy
          clampPanToBounds()
          updateTransform()
        },
        onPinch: ({ offset: [d] }) => {
          // Keep all zoom interactions center-based (same behavior as +/- controls).
          zoomAroundViewportCenter(d)
        },
        onWheel: ({ delta: [, dy], event }) => {
          const wheelEvent = event as WheelEvent
          wheelEvent.preventDefault()

          const normalizedDy =
            wheelEvent.deltaMode === 1
              ? dy * 33
              : wheelEvent.deltaMode === 2
              ? dy * 800
              : dy

          // Use a tiny capped scale delta so high-resolution wheels and trackpads
          // cannot jump across the whole zoom range in a few scrolls.
          if (Math.abs(normalizedDy) < 1) return

          const zoomDelta = Math.max(
            -MAX_WHEEL_ZOOM_DELTA,
            Math.min(
              MAX_WHEEL_ZOOM_DELTA,
              -normalizedDy * WHEEL_ZOOM_DELTA_PER_PIXEL
            )
          )

          zoomAroundViewportCenter(transformRef.current.scale * (1 + zoomDelta))
        }
      },
      {
        target: containerRef,
        drag: {
          from: () => [transformRef.current.x, transformRef.current.y],
          filterTaps: true
        },
        pinch: {
          scaleBounds: () => ({ min: getMinScale(), max: MAX_SCALE }),
          modifierKey: null
        },
        wheel: { eventOptions: { passive: false } }
      }
    )

    // Fit to view function - calculates bounds and centers/zooms to show all tables
    const fitToView = React.useCallback(() => {
      if (!containerRef.current) return

      // Filter visible and active tables
      const visibleTables = initialTables.filter(
        t => t.is_visible !== false && t.is_active
      )
      const canvasWidth = floorPlan?.canvas_width || 1200
      const canvasHeight = floorPlan?.canvas_height || 800

      if (visibleTables.length === 0) {
        const rect = containerRef.current.getBoundingClientRect()
        const containerWidth = rect.width
        const containerHeight = rect.height
        const zoom = Math.max(
          getMinScale(),
          Math.min(
            containerWidth / (canvasWidth + 200),
            containerHeight / (canvasHeight + 200),
            1
          )
        )

        transformRef.current = {
          x: containerWidth / 2 - (canvasWidth / 2) * zoom,
          y: containerHeight / 2 - (canvasHeight / 2) * zoom,
          scale: zoom
        }

        updateTransform()
        return
      }

      // Calculate bounds of all tables
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity

      visibleTables.forEach(table => {
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
      const zoom = Math.max(getMinScale(), Math.min(zoomX, zoomY, 1)) // Don't zoom out beyond the full canvas.

      // Calculate center position
      const centerX = (minX + maxX) / 2
      const centerY = (minY + maxY) / 2

      // Set transform to center and zoom
      transformRef.current = {
        x: containerWidth / 2 - centerX * zoom,
        y: containerHeight / 2 - centerY * zoom,
        scale: zoom
      }

      // Store as initial transform if not set
      if (!initialTransformRef.current) {
        initialTransformRef.current = { ...transformRef.current }
      }

      updateTransform()
    }, [
      initialTables,
      floorPlan?.canvas_width,
      floorPlan?.canvas_height,
      getMinScale
    ])

    React.useEffect(() => {
      fitToViewLatestRef.current = fitToView
    }, [fitToView])

    // Zoom functions
    const handleZoomIn = React.useCallback(() => {
      zoomAroundViewportCenter(
        transformRef.current.scale * BUTTON_ZOOM_STEP_FACTOR
      )
    }, [zoomAroundViewportCenter])

    const handleZoomOut = React.useCallback(() => {
      zoomAroundViewportCenter(
        transformRef.current.scale / BUTTON_ZOOM_STEP_FACTOR
      )
    }, [zoomAroundViewportCenter])

    // Expose fitToView via ref
    useImperativeHandle(
      ref,
      () => ({
        fitToView: () => fitToViewLatestRef.current()
      }),
      []
    )

    // Auto fit only when a floor plan first appears or the active floor plan changes.
    useLayoutEffect(() => {
      if (!floorPlan?.id) {
        lastAutoFitFloorPlanIdRef.current = null
        return
      }

      const shouldAutoFit =
        lastAutoFitFloorPlanIdRef.current !== floorPlan.id ||
        initialTransformRef.current === null

      if (!shouldAutoFit) {
        return
      }

      initialTransformRef.current = null
      lastAutoFitFloorPlanIdRef.current = floorPlan.id

      // Small delay to ensure container is rendered
      const timer = setTimeout(() => {
        fitToViewLatestRef.current()
      }, 100)

      return () => clearTimeout(timer)
    }, [floorPlan?.id])

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
      <div className='relative h-full w-full overflow-hidden select-none animate-in fade-in duration-300 bg-white dark:bg-[#0C0F1A]'>
        {/* Status Legend */}
        <div className='absolute bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full border border-white/20 bg-black/45 px-3.5 py-2 text-white backdrop-blur-sm'>
          <div className='flex items-center gap-x-3 text-[10px] font-medium whitespace-nowrap'>
            {STATUS_LEGEND_ITEMS.map(item => {
              const dotColor = getTableStatusColor(item.status)
              return (
                <div key={item.status} className='flex items-center gap-1.5'>
                  <span
                    className={cn(
                      'inline-block h-2.5 w-2.5 rounded-full',
                      item.status === 'blocked' && 'border border-white/40'
                    )}
                    style={{ backgroundColor: dotColor }}
                  />
                  <span className='text-white/90'>{item.label}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Zoom Controls */}
        <div className='absolute top-4 right-4 z-50 flex items-center gap-2'>
          <Button
            variant='outline'
            size='icon'
            onClick={handleZoomOut}
            className='rounded-full border bg-background/90 shadow-sm backdrop-blur-sm'
            title='Zoom out'
          >
            <ZoomOut className='h-4 w-4' />
          </Button>
          <Button
            variant='outline'
            size='icon'
            onClick={handleZoomIn}
            className='rounded-full border bg-background/90 shadow-sm backdrop-blur-sm'
            title='Zoom in'
          >
            <ZoomIn className='h-4 w-4' />
          </Button>
          <Button
            variant='outline'
            size='icon'
            onClick={fitToView}
            className='rounded-full border bg-background/90 shadow-sm backdrop-blur-sm'
            title='Center and zoom to fit all tables'
          >
            <IconTargetArrow className='h-4 w-4' />
          </Button>
        </div>

        {/* Keep grid only in design mode. Runtime uses a clean dark background. */}
        {isDesignMode && (
          <div
            style={{
              backgroundImage: `
                            linear-gradient(0deg, rgba(107, 114, 128, 0.15) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(107, 114, 128, 0.15) 1px, transparent 1px)
                        `,
              backgroundSize: `${floorPlan?.grid_size || 20}px ${
                floorPlan?.grid_size || 20
              }px`
            }}
            className={cn(
              'absolute inset-0 pointer-events-none',
              'dark:bg-slate-700/10',
              'bg-slate-400/5'
            )}
          />
        )}

        {/* Viewport Container */}
        <div
          ref={containerRef}
          className={cn(
            'w-full h-full touch-none',
            interactionMode === 'pan'
              ? 'cursor-grab active:cursor-grabbing'
              : 'cursor-default'
          )}
          onDragOver={handleDragOver} // Must be present
          onDrop={handleDrop} // Must be present
          onClick={e => {
            // Deselect if clicking on empty canvas (not on a table)
            if (e.target === containerRef.current) {
              onClearSelection?.()
            }
          }}
        >
          <div
            ref={contentRef}
            className='absolute top-0 left-0 origin-top-left will-change-transform'
            style={{
              width: floorPlan?.canvas_width || 1200,
              height: floorPlan?.canvas_height || 800
            }}
          >
            {/* Canvas Boundary */}
            {(floorPlan?.canvas_width || floorPlan?.canvas_height) && (
              <div
                className={cn(
                  'pointer-events-none absolute rounded',
                  isDesignMode ? 'bg-white/35' : 'bg-transparent'
                )}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: floorPlan.canvas_width || 1200,
                  height: floorPlan.canvas_height || 800,
                  border: isDesignMode
                    ? '2px dashed rgba(99,102,241,0.45)'
                    : 'none'
                }}
              />
            )}
            {initialTables.map(table => {
              const session = (table as any).session
              if (!table.shape_id) {
                console.warn(
                  `[RuntimeFloorPlanView] Table ${table.id} has no shape_id`
                )
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
                    onSelect={e => onTableClick?.(table.id, e)}
                    onUpdatePosition={onUpdateTablePosition || (() => {})}
                    onBatchUpdatePositions={onBatchUpdateTablePositions}
                    onUpdateName={onUpdateTableName || (() => {})}
                    onUpdateSize={onUpdateTableSize}
                    onUpdateRotation={onUpdateTableRotation}
                    onRotateEnd={onRotateEnd}
                    onDelete={() => onRemoveTable?.(table.id)}
                    onDragStart={handleTableDragStart}
                    onDragEnd={handleTableDragEnd}
                    statusColor={
                      table.category === 'table' || table.category === 'booth'
                        ? getTableStatusColor(session?.status || 'available')
                        : undefined
                    }
                    billAmount={session?.total_amount}
                  />
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }
)

RuntimeFloorPlanView.displayName = 'RuntimeFloorPlanView'
