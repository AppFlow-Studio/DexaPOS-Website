'use client'

import * as React from 'react'
import { FloorPlanObject } from '@/types/floor-plan'
import { TABLE_SHAPES } from '@/utils/tables/table-shapes'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'

interface TableRendererProps {
    table: FloorPlanObject
    isSelected?: boolean
    isDragging?: boolean
    isEditing?: boolean
    editingName?: string
    onEditingNameChange?: (name: string) => void
    onClick?: (e: React.MouseEvent) => void
    onDoubleClick?: (e: React.MouseEvent) => void
    onMouseDown?: (e: React.MouseEvent) => void
    onNameEdit?: () => void
    onNameSave?: () => void
    onNameCancel?: () => void
    onUnmerge?: () => void
    statusColor?: string | null // For runtime mode: status color overlay
    billAmount?: number | null // For runtime mode: bill amount to display
}

export function TableRenderer({
    table,
    isSelected = false,
    isDragging = false,
    isEditing = false,
    editingName = '',
    onEditingNameChange,
    onClick,
    onDoubleClick,
    onMouseDown,
    onNameEdit,
    onNameSave,
    onNameCancel,
    onUnmerge,
    statusColor,
    billAmount,
}: TableRendererProps) {
    const shape = TABLE_SHAPES[table.shape_id]
    const TableComponent = shape?.component

    if (!TableComponent) {
        return null
    }

    const width = table.width || shape?.width || 100
    const height = table.height || shape?.height || 100

    const handleDoubleClick = (e: React.MouseEvent) => {
        e.stopPropagation()
        if (onDoubleClick) {
            onDoubleClick(e)
        } else if (onNameEdit) {
            // If no double-click handler, default to name editing
            onNameEdit()
        }
    }

    const handleNameKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            onNameSave?.()
        } else if (e.key === 'Escape') {
            e.preventDefault()
            onNameCancel?.()
        }
    }

    return (
        <g
            transform={`translate(${table.x}, ${table.y}) rotate(${table.rotation || 0} ${width / 2} ${height / 2})`}
            className={cn('transition-opacity', isDragging && 'opacity-50')}
            onClick={onClick}
            onDoubleClick={handleDoubleClick}
        >
            {/* Selection outline */}
            {isSelected && (
                <rect
                    x={-5}
                    y={-5}
                    width={width + 10}
                    height={height + 10}
                    fill="none"
                    stroke="rgb(59, 130, 246)"
                    strokeWidth={2}
                    strokeDasharray="5,5"
                    pointerEvents="none"
                />
            )}

            {/* Rotation indicator */}
            {isSelected && (
                <g
                    transform={`translate(${width / 2}, ${-20})`}
                    className="cursor-pointer"
                    onClick={(e) => {
                        e.stopPropagation()
                        handleDoubleClick(e as any)
                    }}
                >
                    <circle r={8} fill="rgb(59, 130, 246)" />
                    <text
                        x={0}
                        y={0}
                        textAnchor="middle"
                        dominantBaseline="central"
                        className="text-xs font-bold fill-white pointer-events-none"
                    >
                        ↻
                    </text>
                </g>
            )}

            {/* Merge indicator */}
            {table.mergedWith && table.mergedWith.length > 0 && (
                <g>
                    <circle
                        cx={width - 10}
                        cy={10}
                        r={6}
                        fill="rgb(34, 197, 94)"
                        className="cursor-pointer"
                        onClick={(e) => {
                            e.stopPropagation()
                            onUnmerge?.()
                        }}
                    />
                    <text
                        x={width - 10}
                        y={10}
                        textAnchor="middle"
                        dominantBaseline="central"
                        className="text-xs font-bold fill-white pointer-events-none"
                    >
                        {table.mergedWith.length + 1}
                    </text>
                </g>
            )}

            {/* Status color overlay for runtime mode */}
            {statusColor && (
                <rect
                    x={0}
                    y={0}
                    width={width}
                    height={height}
                    fill={statusColor}
                    fillOpacity={0.3}
                    pointerEvents="none"
                />
            )}

            {/* Invisible hit area for dragging - covers entire table */}
            <rect
                x={0}
                y={0}
                width={width}
                height={height}
                fill="transparent"
                className={onMouseDown ? 'cursor-move' : 'cursor-pointer'}
                onMouseDown={onMouseDown}
            />

            <foreignObject x={0} y={0} width={width} height={height} pointerEvents="none">
                <div className="relative w-full h-full pointer-events-none">
                    <TableComponent
                        color={table.color_override || '#F1F1F1'}
                        width={width}
                        height={height}
                    />
                    {/* Table label */}
                    {isEditing ? (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-auto">
                            <Input
                                value={editingName}
                                onChange={(e) => onEditingNameChange?.(e.target.value)}
                                onKeyDown={handleNameKeyDown}
                                onBlur={onNameSave}
                                className="text-xs font-semibold text-center bg-white border-blue-500"
                                autoFocus
                                onClick={(e) => e.stopPropagation()}
                                onMouseDown={(e) => e.stopPropagation()}
                            />
                        </div>
                    ) : (
                        (table.label_override || table.name) && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <span
                                    className="text-xs font-semibold text-gray-700 bg-white/80 px-1 rounded cursor-text pointer-events-auto"
                                    onDoubleClick={(e) => {
                                        e.stopPropagation()
                                        onNameEdit?.()
                                    }}
                                >
                                    {table.label_override || table.name}
                                </span>
                            </div>
                        )
                    )}
                    {/* Capacity badge */}
                    {table.capacity && (
                        <div className="absolute top-0 right-0 bg-blue-500 text-white text-xs rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center font-semibold pointer-events-none transform translate-x-1/2 -translate-y-1/2 shadow-sm">
                            {table.capacity}
                        </div>
                    )}
                    {/* Bill amount for runtime mode */}
                    {billAmount !== null && billAmount !== undefined && (
                        <div className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 bg-background border rounded px-2 py-0.5 text-xs font-semibold pointer-events-none whitespace-nowrap">
                            ${billAmount.toFixed(2)}
                        </div>
                    )}
                </div>
            </foreignObject>
        </g>
    )
}
