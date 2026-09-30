'use client'

import { useEffect, useRef } from 'react'
import { ChevronRight, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * The selected batch/deposit, opened in place beneath its list — the same
 * shape as "Our batches" (BatchReconciliationSection). Its transaction list is
 * too large to expand inside a table row, so it gets its own card, and the
 * list above keeps its page, filters and highlighted row.
 */
export function LuqraDetailCard({
    id,
    title,
    reference,
    facts,
    onClose,
    children,
}: {
    /** DOM id, referenced by the opening controls' `aria-controls`. */
    id: string
    title: string
    reference: string
    /** Short facts beside the reference: date, location, totals. */
    facts: React.ReactNode
    onClose: () => void
    children: React.ReactNode
}) {
    const ref = useRef<HTMLDivElement>(null)

    // The card opens below a paged list, often off-screen: bring it into view
    // each time a different record opens.
    useEffect(() => {
        const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
        ref.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' })
    }, [reference])

    return (
        <div ref={ref} id={id} className="min-w-0 scroll-mt-4 space-y-4 rounded-2xl border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    <span className="font-medium">{title}</span>
                    <span className="min-w-0 truncate font-mono text-xs">{reference}</span>
                    {facts}
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    className="-mr-1 -mt-1 h-8 w-8 shrink-0 rounded-full text-muted-foreground"
                    onClick={onClose}
                    aria-label={`Close ${title.toLowerCase()}`}
                >
                    <X className="h-4 w-4" />
                </Button>
            </div>
            {children}
        </div>
    )
}

/** Row-end control that opens/closes the detail card; rotates when open. */
export function DetailToggle({
    open,
    controls,
    label,
    onToggle,
}: {
    open: boolean
    controls: string
    label: string
    onToggle: () => void
}) {
    return (
        <button
            type="button"
            aria-expanded={open}
            aria-controls={open ? controls : undefined}
            aria-label={label}
            onClick={(e) => {
                // The row itself also toggles on click.
                e.stopPropagation()
                onToggle()
            }}
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
            <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-90')} />
        </button>
    )
}
