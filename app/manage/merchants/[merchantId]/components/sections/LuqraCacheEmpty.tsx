'use client'

import { Button } from '@/components/ui/button'

/**
 * Empty state for the Luqra cache tables. The tables open on the last 30 days,
 * but the cache only holds what the last sync pulled — often older — so an
 * empty date window offers to drop the dates before suggesting a sync.
 */
export function LuqraCacheEmpty({
    hasRange,
    onShowAllDates,
    emptyText,
}: {
    /** Whether a date window is narrowing the read. */
    hasRange: boolean
    onShowAllDates: () => void
    /** Shown when nothing is cached at all (no date window to blame). */
    emptyText: string
}) {
    if (!hasRange) return <>{emptyText}</>
    return (
        <span className="flex flex-col items-center gap-2">
            <span>Nothing cached between these dates.</span>
            <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-full px-4 text-[0.8125rem] font-medium"
                onClick={onShowAllDates}
            >
                Show all dates
            </Button>
        </span>
    )
}
