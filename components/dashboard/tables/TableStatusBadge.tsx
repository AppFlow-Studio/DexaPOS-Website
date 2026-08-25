'use client'

import * as React from 'react'
import { TableStatus } from '@/types/floor-plan'
import { cn } from '@/lib/utils'
import { tableStatusLabel, tableStatusStyle } from '@/lib/constants/table-status'

interface TableStatusBadgeProps {
    status: TableStatus | null
    className?: string
}

/**
 * A table's status as a soft-tinted pill with a colour dot.
 *
 * Replaces the previous solid `bg-green-500` / `bg-blue-500` fills: at badge
 * size a saturated block competes with the page's headings and the floor-plan
 * canvas beside it. The dot carries the colour coding, the tint carries the
 * grouping, and the label stays readable in both themes.
 *
 * Colours come from `lib/constants/table-status.ts`, the same `BadgeStyle`
 * shape used by payment-status badges.
 */
export function TableStatusBadge({ status, className }: TableStatusBadgeProps) {
    const style = tableStatusStyle(status)

    return (
        <span
            className={cn(
                'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
                style.bg,
                style.text,
                className
            )}
        >
            <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', style.dot)} />
            {tableStatusLabel(status)}
        </span>
    )
}
