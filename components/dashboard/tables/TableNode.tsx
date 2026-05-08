'use client'

import React, { useRef, useEffect, useState } from 'react'
import { FloorPlanObject } from '@/types/floor-plan'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { useGesture } from '@use-gesture/react'
import { Trash2 } from 'lucide-react'
import { TABLE_SHAPES } from '@/utils/tables/table-shapes'
import { Button } from '@/components/ui/button'

interface TableNodeProps {
  table: FloorPlanObject
  allTables?: FloorPlanObject[]
  scaleRef: React.MutableRefObject<number>
  isSelected: boolean
  selectedTableIds?: string[]
  isDesignMode: boolean
  onSelect: (e?: React.MouseEvent<HTMLDivElement>) => void
  onUpdatePosition: (id: string, x: number, y: number) => void
  onUpdateName: (id: string, name: string) => void
  onUpdateSize?: (id: string, width: number, height: number) => void
  onUpdateRotation?: (id: string, rotation: number) => void
  onRotateEnd?: (id: string, rotation: number) => void
  onDoubleClick?: () => void
  onDelete?: () => void
  onDragStart?: () => void
  onDragEnd?: () => void
  onBatchUpdatePositions?: (
    updates: Array<{ id: string; x: number; y: number }>
  ) => void
  statusColor?: string
  billAmount?: number
}

export function TableNode ({
  table,
  allTables = [],
  scaleRef,
  isSelected,
  selectedTableIds = [],
  isDesignMode,
  onSelect,
  onUpdatePosition,
  onUpdateName,
  onUpdateSize,
  onUpdateRotation,
  onRotateEnd,
  onDelete,
  onDoubleClick,
  onDragStart,
  onDragEnd,
  onBatchUpdatePositions,
  statusColor,
  billAmount
}: TableNodeProps) {
  const [isDarkMode, setIsDarkMode] = useState(() =>
    document.documentElement.classList.contains('dark')
  )
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDarkMode(document.documentElement.classList.contains('dark'))
    })
    observer.observe(document.documentElement, { attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])
  const elementRef = useRef<HTMLDivElement>(null)
  const rotateHandleRef = useRef<HTMLDivElement>(null)
  const resizeHandleRef = useRef<HTMLDivElement>(null)

  // --- REFS FOR INSTANT LOCKING (Fixes the "Runaway" issue) ---
  const isRotatingRef = useRef(false)
  const isResizingRef = useRef(false)
  const initialPosRef = useRef<{ x: number; y: number } | null>(null)
  const initialSizeRef = useRef<{ width: number; height: number } | null>(null)
  const initialSelectedPositionsRef = useRef<Map<
    string,
    { x: number; y: number }
  > | null>(null)
  const batchInitialPositionsRef = useRef<Map<
    string,
    { x: number; y: number }
  > | null>(null)

  // UI State (Visuals only)
  const [isDragging, setIsDragging] = React.useState(false)
  const [isRotating, setIsRotating] = React.useState(false)
  const [isResizing, setIsResizing] = React.useState(false)
  const [isEditing, setIsEditing] = React.useState(false)
  const [tempName, setTempName] = React.useState(table.name || '')

  const shape = TABLE_SHAPES[table.shape_id as keyof typeof TABLE_SHAPES]
  if (!shape) {
    console.warn(
      `[TableNode] Shape not found for shape_id="${table.shape_id}" on table "${table.name}"`
    )
    return null
  }

  console.log(
    `[TableNode] Rendering ${table.name} (${table.shape_id}) at (${table.x}, ${table.y})`
  )
  const TableComponent = shape.component
  const width = table.width || shape.width
  const height = table.height || shape.height
  const shouldShowLabel =
    table.category === 'table' || table.category === 'booth'
  const capacityValue = Number(table.capacity ?? 0)
  const shouldShowCapacity =
    shouldShowLabel && Number.isFinite(capacityValue) && capacityValue > 0

  // --- 1. MOVE GESTURE ---
  useGesture(
    {
      onDragStart: ({ event }) => {
        // 1. INSTANTLY CHECK LOCK
        if (isRotatingRef.current || isResizingRef.current) return

        // 2. CHECK TARGET
        const target = event.target as HTMLElement
        // Explicitly ignore if clicking the handle (redundancy check)
        if (target.closest('[data-rotate-handle]')) return
        if (target.closest('[data-resize-handle]')) return
        if (target.tagName === 'INPUT') return

        event.stopPropagation()
        if (!isDesignMode) return

        // Only select if not already selected (preserve batch selection)
        if (!isSelected) {
          onSelect()
        }
        setIsDragging(true)
        onDragStart?.()

        // 3. SET ANCHOR
        initialPosRef.current = { x: table.x, y: table.y }

        // 4. CAPTURE INITIAL POSITIONS FOR BATCH MOVE
        if (selectedTableIds.length > 1) {
          const posMap = new Map<string, { x: number; y: number }>()
          selectedTableIds.forEach(id => {
            const selectedTable = allTables.find(t => t.id === id)
            if (selectedTable) {
              posMap.set(id, { x: selectedTable.x, y: selectedTable.y })
            }
          })
          batchInitialPositionsRef.current = posMap
        }
      },
      onDrag: ({ movement: [mx, my] }) => {
        // CHECK LOCK AGAIN
        if (
          isRotatingRef.current ||
          isResizingRef.current ||
          !initialPosRef.current ||
          !isDesignMode
        )
          return

        const scale = scaleRef.current || 1
        const deltaX = mx / scale
        const deltaY = my / scale

        // If multiple tables are selected, move all of them together with proper offsets
        if (
          selectedTableIds.length > 1 &&
          onBatchUpdatePositions &&
          batchInitialPositionsRef.current
        ) {
          const updates = selectedTableIds.map(id => {
            // Use the captured initial position from drag start
            const initialPos = batchInitialPositionsRef.current?.get(id)
            if (!initialPos) return { id, x: 0, y: 0 }

            // Apply the same delta to all selected tables
            return {
              id,
              x: initialPos.x + deltaX,
              y: initialPos.y + deltaY
            }
          })
          onBatchUpdatePositions(updates)
        } else {
          // Single table move
          const newX = initialPosRef.current.x + deltaX
          const newY = initialPosRef.current.y + deltaY
          onUpdatePosition(table.id, newX, newY)
        }
      },
      onDragEnd: () => {
        setIsDragging(false)
        initialPosRef.current = null
        batchInitialPositionsRef.current = null
        onDragEnd?.()
      }
    },
    {
      target: elementRef,
      // Only enable if we are NOT rotating (React state check for rendering, Refs for logic)
      enabled: isDesignMode,
      drag: { filterTaps: true, threshold: 5 }
    }
  )

  // --- 2. ROTATE GESTURE ---
  useGesture(
    {
      onDragStart: ({ event }) => {
        event.stopPropagation() // Stop move gesture
        if (!isDesignMode) return

        // LOCK MOVEMENT INSTANTLY
        isRotatingRef.current = true

        setIsRotating(true) // Visual update
        onSelect()
        onDragStart?.()
      },
      onDrag: ({ xy: [mouseX, mouseY], shiftKey }) => {
        if (!isDesignMode || !elementRef.current) return

        const rect = elementRef.current.getBoundingClientRect()
        const centerX = rect.left + rect.width / 2
        const centerY = rect.top + rect.height / 2

        const radians = Math.atan2(mouseY - centerY, mouseX - centerX)
        let degrees = radians * (180 / Math.PI) + 90

        if (shiftKey) degrees = Math.round(degrees / 15) * 15

        onUpdateRotation?.(table.id, degrees)
      },
      onDragEnd: () => {
        // UNLOCK
        isRotatingRef.current = false
        setIsRotating(false)

        onRotateEnd?.(table.id, table.rotation || 0)
        onDragEnd?.()
      }
    },
    {
      target: rotateHandleRef,
      enabled: isDesignMode,
      drag: { pointer: { capture: false } }
    }
  )

  // --- 3. RESIZE GESTURE ---
  useGesture(
    {
      onDragStart: ({ event }) => {
        event.stopPropagation()
        if (!isDesignMode) return

        isResizingRef.current = true
        setIsResizing(true)
        onSelect()
        onDragStart?.()

        initialSizeRef.current = { width: width || 100, height: height || 100 }
      },
      onDrag: ({ movement: [mx, my] }) => {
        if (!isDesignMode || !initialSizeRef.current || !isResizing) return

        const newWidth = Math.max(50, initialSizeRef.current.width + mx)
        const newHeight = Math.max(50, initialSizeRef.current.height + my)

        onUpdateSize?.(table.id, newWidth, newHeight)
      },
      onDragEnd: () => {
        isResizingRef.current = false
        setIsResizing(false)
        initialSizeRef.current = null
        onDragEnd?.()
      }
    },
    {
      target: resizeHandleRef,
      enabled: isDesignMode,
      drag: { filterTaps: true }
    }
  )

  const handleNameSubmit = () => {
    setIsEditing(false)
    if (tempName !== table.name) {
      onUpdateName(table.id, tempName)
    }
  }

  return (
    <div
      ref={elementRef}
      className={cn(
        'absolute touch-none select-none will-change-transform',
        isDesignMode
          ? isDragging
            ? 'cursor-grabbing'
            : 'cursor-grab'
          : 'cursor-pointer'
      )}
      style={{
        transform: `translate3d(${table.x}px, ${table.y}px, 0) rotate(${
          table.rotation || 0
        }deg)`,
        width: width,
        height: height,
        zIndex: isSelected || isDragging || isRotating ? 50 : 10
      }}
      onClick={(e: React.MouseEvent<HTMLDivElement>) => {
        e.stopPropagation()
        // Pass event so parent can check shift/ctrl keys
        onSelect(e)
      }}
      onDoubleClick={e => {
        e.stopPropagation()
        // Set Active Table Off
        if (isDesignMode && shouldShowLabel) setIsEditing(true)
      }}
    >
      {/* SELECTION UI - Border wrapper to ensure visibility */}
      {isSelected && (
        <>
          <div
            className='absolute pointer-events-none z-100'
            style={{
              top: '-4px',
              left: '-4px',
              right: '-4px',
              bottom: '-4px',
              border: '3px solid #0d99ff',
              borderRadius: '4px',
              boxShadow:
                '0 0 0 2px rgba(13, 153, 255, 0.3), 0 0 8px rgba(13, 153, 255, 0.2)'
            }}
          />

          {/* ROTATION HANDLE */}
          {isDesignMode && (
            <div
              ref={rotateHandleRef}
              data-rotate-handle
              className='absolute -top-8 left-1/2 -translate-x-1/2 flex flex-col items-center cursor-alias z-50 group touch-none'
              // Stop propagation instantly to help the logic
              onPointerDown={e => e.stopPropagation()}
              onClick={e => e.stopPropagation()}
            >
              <div
                className={cn(
                  'w-3 h-3 bg-white border-2 border-[#0d99ff] rounded-full shadow-sm hover:scale-125 transition-transform',
                  isRotating && 'bg-[#0d99ff]'
                )}
              />
              <div className='w-[1.5px] h-5 bg-[#0d99ff]' />
            </div>
          )}

          {/* RESIZE HANDLE */}
          {isDesignMode && (
            <div
              ref={resizeHandleRef}
              data-resize-handle
              className='absolute -bottom-3 -right-3 w-6 h-6 bg-white border-2 border-[#0d99ff] rounded-full shadow-lg cursor-se-resize z-50 touch-none hover:scale-125 transition-transform'
              onPointerDown={e => e.stopPropagation()}
              onClick={e => e.stopPropagation()}
              title='Drag to resize'
            />
          )}

          {/* DELETE BUTTON */}
          {isDesignMode && onDelete && (
            <div
              className='absolute -top-8 right-0 z-50 touch-none'
              onClick={e => {
                e.stopPropagation()
                onDelete()
              }}
            >
              <Button
                variant='destructive'
                size='icon'
                className='h-6 w-6 rounded-full shadow-lg'
                title='Delete table (Delete key)'
              >
                <Trash2 className='h-3 w-3' />
              </Button>
            </div>
          )}
        </>
      )}

      {/* {statusColor && !isDesignMode && (
                <div className="absolute inset-0 rounded-[4px] z-20 mix-blend-multiply opacity-40" style={{ backgroundColor: statusColor }} />
            )} */}

      {/* TABLE SHAPE */}
      <div
        className={cn(
          'w-full h-full relative',
          (isDragging || isRotating) && 'opacity-80'
        )}
      >
        <TableComponent
          color={statusColor || table.color_override || '#F1F1F1'}
          width={width}
          height={height}
          darkMode={isDarkMode}
        />
      </div>

      {/* LABELS */}
      {shouldShowLabel && (
        <div className='absolute inset-0 flex items-center justify-center z-30 pointer-events-none'>
          {isEditing ? (
            <div className='pointer-events-auto w-[120%] transform -translate-y-6'>
              <Input
                value={tempName}
                onChange={e => setTempName(e.target.value)}
                onBlur={handleNameSubmit}
                onKeyDown={e => e.key === 'Enter' && handleNameSubmit()}
                autoFocus
                className='h-7 text-xs text-center bg-white shadow-xl border-[#0d99ff]'
              />
            </div>
          ) : (
            (table.label_override || table.name || shouldShowCapacity) && (
              <div
                className={cn(
                  'text-[10px] font-bold text-center leading-tight',
                  isDarkMode ? 'text-white' : 'text-slate-900'
                )}
                style={{ transform: `rotate(-${table.rotation || 0}deg)` }}
              >
                {(table.label_override || table.name) && (
                  <div>{table.label_override || table.name}</div>
                )}
                {shouldShowCapacity && (
                  <div
                    className={cn(
                      'text-[9px] font-semibold',
                      isDarkMode ? 'text-white/90' : 'text-slate-700'
                    )}
                  >
                    Seats: {capacityValue}
                  </div>
                )}
              </div>
            )
          )}
        </div>
      )}
    </div>
  )
}
