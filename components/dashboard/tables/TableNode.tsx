'use client'

import React, { useRef } from 'react'
import { FloorPlanObject } from '@/types/floor-plan'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { useGesture } from '@use-gesture/react'
import { Users } from 'lucide-react'
import { TABLE_SHAPES } from '@/utils/tables/table-shapes'

interface TableNodeProps {
    table: FloorPlanObject
    scaleRef: React.MutableRefObject<number>
    isSelected: boolean
    isDesignMode: boolean
    onSelect: () => void
    onUpdatePosition: (id: string, x: number, y: number) => void
    onUpdateName: (id: string, name: string) => void
    onUpdateRotation?: (id: string, rotation: number) => void
    onRotateEnd?: (id: string, rotation: number) => void
    onDoubleClick?: () => void
    onDelete?: () => void
    onDragStart?: () => void
    onDragEnd?: () => void
    statusColor?: string
    billAmount?: number
}

export function TableNode({
    table,
    scaleRef,
    isSelected,
    isDesignMode,
    onSelect,
    onUpdatePosition,
    onUpdateName,
    onUpdateRotation,
    onRotateEnd,
    onDoubleClick,
    onDragStart,
    onDragEnd,
    statusColor,
    billAmount
}: TableNodeProps) {
    const elementRef = useRef<HTMLDivElement>(null)
    const rotateHandleRef = useRef<HTMLDivElement>(null)

    // --- REFS FOR INSTANT LOCKING (Fixes the "Runaway" issue) ---
    const isRotatingRef = useRef(false)
    const initialPosRef = useRef<{ x: number, y: number } | null>(null)

    // UI State (Visuals only)
    const [isDragging, setIsDragging] = React.useState(false)
    const [isRotating, setIsRotating] = React.useState(false)
    const [isEditing, setIsEditing] = React.useState(false)
    const [tempName, setTempName] = React.useState(table.name || '')

    const shape = TABLE_SHAPES[table.shape_id as keyof typeof TABLE_SHAPES]
    if (!shape) return null

    const TableComponent = shape.component
    const width = table.width || shape.width
    const height = table.height || shape.height

    // --- 1. MOVE GESTURE ---
    useGesture(
        {
            onDragStart: ({ event }) => {
                // 1. INSTANTLY CHECK LOCK
                if (isRotatingRef.current) return

                // 2. CHECK TARGET
                const target = event.target as HTMLElement
                // Explicitly ignore if clicking the handle (redundancy check)
                if (target.closest('[data-rotate-handle]')) return
                if (target.tagName === 'INPUT') return

                event.stopPropagation()
                if (!isDesignMode) return

                onSelect()
                setIsDragging(true)
                onDragStart?.()

                // 3. SET ANCHOR
                initialPosRef.current = { x: table.x, y: table.y }
            },
            onDrag: ({ movement: [mx, my] }) => {
                // CHECK LOCK AGAIN
                if (isRotatingRef.current || !initialPosRef.current || !isDesignMode) return

                const scale = scaleRef.current || 1

                // CALC POSITION
                const newX = initialPosRef.current.x + (mx / scale)
                const newY = initialPosRef.current.y + (my / scale)

                onUpdatePosition(table.id, newX, newY)
            },
            onDragEnd: () => {
                setIsDragging(false)
                initialPosRef.current = null
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
                "absolute touch-none select-none will-change-transform",
                isDesignMode ? (isDragging ? "cursor-grabbing" : "cursor-grab") : "cursor-pointer"
            )}
            style={{
                transform: `translate3d(${table.x}px, ${table.y}px, 0) rotate(${table.rotation || 0}deg)`,
                width: width,
                height: height,
                zIndex: isSelected || isDragging || isRotating ? 50 : 10
            }}
            onClick={(e) => {
                e.stopPropagation()
                onSelect()
            }}
            onDoubleClick={(e) => {
                e.stopPropagation()
                // Set Active Table Off
                if (isDesignMode) setIsEditing(true)
            }}
        >
            {/* SELECTION UI */}
            {isSelected && (
                <>
                    <div className="absolute -inset-[3px] border-[2px] border-[#0d99ff] pointer-events-none z-50 rounded-sm" />

                    {/* ROTATION HANDLE */}
                    {isDesignMode && (
                        <div
                            ref={rotateHandleRef}
                            data-rotate-handle
                            className="absolute -top-8 left-1/2 -translate-x-1/2 flex flex-col items-center cursor-alias z-50 group touch-none"
                            // Stop propagation instantly to help the logic
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className={cn("w-3 h-3 bg-white border-2 border-[#0d99ff] rounded-full shadow-sm hover:scale-125 transition-transform", isRotating && "bg-[#0d99ff]")} />
                            <div className="w-[1.5px] h-5 bg-[#0d99ff]" />
                        </div>
                    )}
                </>
            )}


            {/* {statusColor && !isDesignMode && (
                <div className="absolute inset-0 rounded-[4px] z-20 mix-blend-multiply opacity-40" style={{ backgroundColor: statusColor }} />
            )} */}

            {/* TABLE SHAPE */}
            <div className={cn("w-full h-full relative", (isDragging || isRotating) && "opacity-80")}>
                <TableComponent color={statusColor || '#F1F1F1'} width={width} height={height} />
            </div>

            {/* CAPACITY INDICATOR */}
            {table.capacity && table.capacity > 0 && (
                <div
                    className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 z-40 pointer-events-none"
                    style={{ transform: `translate(-50%, 50%) rotate(-${table.rotation || 0}deg)` }}
                >
                    <div className="bg-white rounded-full px-2 py-1 flex items-center gap-1.5 shadow-md border border-slate-200">
                        <Users className="h-3 w-3 text-blue-700" />
                        <span className="text-xs font-semibold text-blue-700">{table.capacity}</span>
                    </div>
                </div>
            )}

            {/* LABELS */}
            <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
                {isEditing ? (
                    <div className="pointer-events-auto w-[120%] transform -translate-y-6">
                        <Input
                            value={tempName}
                            onChange={(e) => setTempName(e.target.value)}
                            onBlur={handleNameSubmit}
                            onKeyDown={(e) => e.key === 'Enter' && handleNameSubmit()}
                            autoFocus
                            className="h-7 text-xs text-center bg-white shadow-xl border-[#0d99ff]"
                        />
                    </div>
                ) : (
                    (table.label_override || table.name) && (
                        <span
                            className="text-[10px] font-bold text-slate-700 bg-white/60 px-1.5 py-0.5 rounded backdrop-blur-[2px]"
                            style={{ transform: `rotate(-${table.rotation || 0}deg)` }}
                        >
                            {table.label_override || table.name}
                        </span>
                    )
                )}
            </div>
        </div>
    )
}