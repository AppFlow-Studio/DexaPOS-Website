'use client'

import Link from 'next/link'
import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader, PageShell } from '@/components/dashboard/shell'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/*
 * The pieces every record detail page under /manage/transactions repeats: the
 * label/value list, the worded unavailable state and the loading shape. Laid
 * out like /manage/devices/[deviceId] (the HQ detail-page reference).
 *
 * ⚠️ Classes are literal strings in this .tsx on purpose (C7).
 */

/** A label/value list; pair with `DetailRow`. */
export function DetailList({ children, className }: { children: React.ReactNode; className?: string }) {
    return <dl className={cn('min-w-0 space-y-2', className)}>{children}</dl>
}

/** One fact. Values are plain text or a link, never a pill (§3.5). */
export function DetailRow({
    label,
    value,
    mono = false,
    wrap = false,
    copyable = false,
    emphasis = false,
}: {
    label: string
    value: React.ReactNode
    mono?: boolean
    /** Let a long value (a reason, a path) wrap instead of truncating. */
    wrap?: boolean
    /** Adds a copy button after a string value (an id, a code). */
    copyable?: boolean
    /** The row a list adds up to, such as a total. Weight, not colour (§3.5). */
    emphasis?: boolean
}) {
    const empty = value === null || value === undefined || value === ''
    const copyText = copyable && typeof value === 'string' && value ? value : null
    return (
        <div className="flex min-w-0 items-baseline justify-between gap-4 text-sm">
            <dt className={cn('shrink-0', emphasis ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                {label}
            </dt>
            <dd
                className={cn(
                    'min-w-0 text-right',
                    // The copy button's hit target overhangs the line, so the
                    // truncation moves onto the text inside rather than clipping it.
                    copyText ? 'flex items-center justify-end gap-1' : wrap ? 'break-words' : 'truncate',
                    mono ? 'font-mono text-xs' : 'font-medium tabular-nums',
                    emphasis && 'font-semibold',
                    empty && 'font-normal text-muted-foreground'
                )}
                title={typeof value === 'string' ? value : undefined}
            >
                {empty ? '—' : copyText ? (
                    <>
                        <span className="min-w-0 truncate">{copyText}</span>
                        <CopyButton label={label} value={copyText} />
                    </>
                ) : (
                    value
                )}
            </dd>
        </div>
    )
}

/**
 * Label-over-value cells for a row of headline facts (who, where, when, how).
 * Unlike `DetailRow` the label never competes with the value for width, so
 * long ids fit and a row of them fills the panel instead of leaving gaps.
 */
export function FactGrid({ children, className }: { children: React.ReactNode; className?: string }) {
    return (
        <dl className={cn('grid min-w-0 grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3', className)}>{children}</dl>
    )
}

export function Fact({
    label,
    value,
    mono = false,
    copyable = false,
    className,
}: {
    label: string
    value: React.ReactNode
    mono?: boolean
    /** Adds a copy button after a string value (an id, a code). */
    copyable?: boolean
    /** e.g. `col-span-2 sm:col-span-1` so a long id gets the full phone width. */
    className?: string
}) {
    const empty = value === null || value === undefined || value === ''
    const copyText = copyable && typeof value === 'string' && value ? value : null
    return (
        <div className={cn('min-w-0', className)}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd
                className={cn(
                    'mt-1 flex min-h-5 min-w-0 items-center gap-1',
                    mono ? 'font-mono text-xs' : 'text-sm font-medium tabular-nums',
                    empty && 'font-normal text-muted-foreground'
                )}
            >
                <span className="min-w-0 truncate" title={typeof value === 'string' ? value : undefined}>
                    {empty ? '—' : value}
                </span>
                {copyText && <CopyButton label={label} value={copyText} />}
            </dd>
        </div>
    )
}

function CopyButton({ label, value }: { label: string; value: string }) {
    return (
        <Button
            variant="ghost"
            size="icon"
            // 32px hit target (§13.6); the negative margin keeps the row's height.
            className="-my-2 h-8 w-8 shrink-0 rounded-full text-muted-foreground"
            aria-label={`Copy ${label.toLowerCase()}`}
            onClick={() => {
                navigator.clipboard.writeText(value).then(
                    () => toast.success(`${label} copied`),
                    () => toast.error(`Couldn't copy the ${label.toLowerCase()}`)
                )
            }}
        >
            <Copy className="h-3.5 w-3.5" />
        </Button>
    )
}

/** The not-found / failed state for a detail page, in words, with a way back (§4.9). */
export function DetailUnavailable({
    title,
    heading,
    detail,
    backHref,
    backLabel,
    onRetry,
}: {
    /** Page title, e.g. "Payment unavailable". */
    title: string
    /** The sentence in the well, e.g. "We couldn't find this payment". */
    heading: string
    detail?: string
    backHref: string
    backLabel: string
    onRetry?: () => void
}) {
    return (
        <PageShell as="div">
            <PageHeader title={title} backHref={backHref} backLabel={backLabel} />
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-muted/30 px-4 py-20 text-center">
                <p className="text-sm font-medium">{heading}</p>
                {detail && <p className="max-w-md text-xs text-muted-foreground">{detail}</p>}
                <div className="flex flex-wrap items-center justify-center gap-2">
                    {onRetry && (
                        <Button variant="outline" size="sm" onClick={onRetry}>
                            Retry
                        </Button>
                    )}
                    <Button asChild variant="outline" size="sm">
                        <Link href={backHref}>{backLabel}</Link>
                    </Button>
                </div>
            </div>
        </PageShell>
    )
}

/** Shaped like a loaded detail page so nothing jumps when data lands (§4.9). */
export function DetailPageSkeleton({ withStats = false }: { withStats?: boolean }) {
    return (
        <PageShell as="div">
            <div className="space-y-4">
                <Skeleton className="h-8 w-40 rounded-full" />
                <Skeleton className="h-9 w-64 max-w-full" />
                <Skeleton className="h-5 w-80 max-w-full" />
            </div>
            {withStats && <Skeleton className="h-28 w-full rounded-3xl" />}
            <div className="grid min-w-0 grid-cols-1 items-start gap-6 lg:grid-cols-3">
                <Skeleton className="h-[300px] w-full rounded-2xl lg:col-span-2" />
                <Skeleton className="h-[300px] w-full rounded-2xl" />
            </div>
            <Skeleton className="h-[360px] w-full rounded-3xl" />
        </PageShell>
    )
}
