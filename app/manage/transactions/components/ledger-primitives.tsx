'use client'

import Link from 'next/link'
import { DatePopover } from '@/components/ui/date-popover'
import { Button } from '@/components/ui/button'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { TableCell, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

/*
 * The pieces every table on /manage/transactions repeats: the phone record
 * card (UI-DESIGN-SYSTEM §5.3), the worded empty and error states (§4.9) and
 * the muted filter controls (§4.2, §5.2). Written once here so the five tabs
 * cannot drift apart.
 *
 * ⚠️ Classes are literal strings in this .tsx on purpose (C7).
 */

/** A table row re-laid-out as a card, below the table's fit breakpoint (§5.3). */
export function RecordCard({
    children,
    selected = false,
    className,
}: {
    children: React.ReactNode
    selected?: boolean
    className?: string
}) {
    return (
        <div
            className={cn(
                'min-w-0 rounded-2xl border-0 bg-muted/45 p-4',
                // A ring, not a border: the selected card is a state, not a new box.
                selected && 'bg-muted ring-1 ring-border',
                className
            )}
        >
            {children}
        </div>
    )
}

/**
 * A phone record card that opens the record's detail page (or, with
 * `onSelect`, toggles it open in place). The whole card is one control, so it
 * holds no other links or buttons, and it carries only the few facts needed to
 * pick the record out; the rest lives on the detail page.
 */
export function RecordLinkCard({
    href,
    onSelect,
    selected = false,
    title,
    figure,
    subtitle,
    status,
}: {
    /** Where the card goes. Pass this or `onSelect`. */
    href?: string
    /** Makes the card a toggle button instead, for a host that expands in place. */
    onSelect?: () => void
    selected?: boolean
    /** Identity line, e.g. merchant or action. */
    title: React.ReactNode
    /** Right-aligned key figure, e.g. an amount. */
    figure?: React.ReactNode
    /** One muted line beneath: who / when. */
    subtitle?: React.ReactNode
    /** Right-aligned beneath the figure: status in words, or an alarm. */
    status?: React.ReactNode
}) {
    const className = cn(
        'block w-full min-w-0 rounded-2xl bg-muted/45 p-4 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected && 'bg-muted ring-1 ring-border'
    )
    // Spans only: a <button> may hold phrasing content alone.
    const body = (
        <>
            <span className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate font-medium">{title}</span>
                {figure !== undefined && (
                    <span className="shrink-0 font-medium tabular-nums">{figure}</span>
                )}
            </span>
            {(subtitle !== undefined || status !== undefined) && (
                <span className="mt-1 flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
                    <span className="min-w-0 truncate tabular-nums">{subtitle}</span>
                    {status !== undefined && <span className="shrink-0 text-right">{status}</span>}
                </span>
            )}
        </>
    )

    if (href) {
        return (
            <Link href={href} className={className}>
                {body}
            </Link>
        )
    }
    return (
        <button type="button" aria-pressed={selected} onClick={onSelect} className={className}>
            {body}
        </button>
    )
}

/**
 * The keyboard-reachable link in a clickable table row's first cell. The row
 * itself navigates on click; this gives it a focus stop and a real href, and
 * stops the click so the row does not push the same route a second time.
 */
export function RowLink({
    href,
    children,
    className,
    title,
}: {
    href: string
    children: React.ReactNode
    className?: string
    title?: string
}) {
    return (
        <Link
            href={href}
            title={title}
            onClick={(event) => event.stopPropagation()}
            className={cn('underline-offset-2 hover:underline focus-visible:underline', className)}
        >
            {children}
        </Link>
    )
}

/** The label/value block under a card's identity line. */
export function CardFields({ children }: { children: React.ReactNode }) {
    return (
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {children}
        </div>
    )
}

/** One label/value pair. Values are plain text, never pills (§3.5). */
export function CardField({
    label,
    value,
    mono = false,
    className,
}: {
    label: string
    value: React.ReactNode
    mono?: boolean
    className?: string
}) {
    return (
        <div className={cn('min-w-0', className)}>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={cn('truncate font-medium tabular-nums', mono && 'font-mono text-xs')}>
                {value}
            </p>
        </div>
    )
}

/** Loading shape for a card grid: the card's own shell, so nothing jumps (§5.4). */
export function RecordCardSkeletons({ count = 4 }: { count?: number }) {
    return (
        <>
            {Array.from({ length: count }).map((_, index) => (
                <div key={index} className="min-w-0 rounded-2xl bg-muted/45 p-4">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="mt-2 h-3 w-1/3" />
                    <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
                        <Skeleton className="h-8 w-full" />
                        <Skeleton className="h-8 w-full" />
                        <Skeleton className="h-8 w-full" />
                        <Skeleton className="h-8 w-full" />
                    </div>
                </div>
            ))}
        </>
    )
}

/** Empty sentence filling a card grid (§4.9). Never hidden on phones. */
export function CardGridEmpty({ title, hint }: { title: string; hint?: string }) {
    return (
        <div className="col-span-full flex min-h-40 flex-col items-center justify-center gap-1 rounded-2xl bg-muted/30 px-4 text-center">
            <p className="text-sm font-medium">{title}</p>
            {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
    )
}

/** Empty sentence inside a table body (§4.9, §5.4). */
export function TableEmptyRow({
    colSpan,
    title,
    hint,
}: {
    colSpan: number
    title: string
    hint?: string
}) {
    return (
        <TableRow>
            <TableCell colSpan={colSpan} className="h-24 whitespace-normal text-center">
                <p className="text-sm font-medium">{title}</p>
                {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
            </TableCell>
        </TableRow>
    )
}

/**
 * A failure said in words, on a neutral well — never red text (§4.9). The
 * technical code goes in the detail line, where an operator can quote it.
 */
export function LoadError({
    title,
    detail,
    onRetry,
    className,
}: {
    title: string
    detail?: string
    onRetry?: () => void
    className?: string
}) {
    return (
        <div
            role="status"
            className={cn(
                'flex flex-col items-start gap-3 rounded-2xl bg-muted/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between',
                className
            )}
        >
            <div className="min-w-0">
                <p className="text-sm font-medium">{title}</p>
                {detail && <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>}
            </div>
            {onRetry && (
                <Button variant="outline" size="sm" className="h-9 shrink-0 px-4" onClick={onRetry}>
                    Retry
                </Button>
            )}
        </div>
    )
}

/** A tab's toolbar: the filters wrap across the full width. */
export function LedgerToolbar({ children }: { children: React.ReactNode }) {
    return <div className="flex min-w-0 flex-wrap items-center gap-2">{children}</div>
}

export interface FilterOption {
    value: string
    label: string
}

/**
 * A toolbar filter (§5.2): a borderless muted pill. The placeholder names the
 * filter, so it takes no leading icon and no label above it; `ariaLabel`
 * gives it an accessible name instead.
 *
 * Radix `Select` cannot hold an empty value, so "no filter" is the `all`
 * sentinel the callers already use.
 */
export function FilterSelect({
    value,
    onValueChange,
    options,
    allLabel,
    ariaLabel,
    disabled,
    className,
}: {
    value: string
    onValueChange: (value: string) => void
    options: FilterOption[]
    allLabel: string
    ariaLabel: string
    disabled?: boolean
    className?: string
}) {
    return (
        <Select value={value} onValueChange={onValueChange} disabled={disabled}>
            <SelectTrigger
                aria-label={ariaLabel}
                className={cn(
                    'h-9 w-full min-w-0 border-0 bg-muted/60 px-3 text-[0.8125rem] shadow-none dark:bg-muted/60 sm:w-44',
                    className
                )}
            >
                <SelectValue placeholder={allLabel} />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="all">{allLabel}</SelectItem>
                {options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                        {option.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    )
}

/**
 * A single-date filter on the same muted material as the selects. Value is a
 * `yyyy-MM-dd` string, empty when unset — what the section queries expect.
 */
export function FilterDate({
    value,
    onChange,
    placeholder,
    className,
}: {
    value: string
    onChange: (value: string) => void
    /** Names the field while it is empty, e.g. "From date". */
    placeholder: string
    className?: string
}) {
    return (
        <div className={cn('w-full min-w-0 sm:w-40', className)}>
            <DatePopover
                value={value}
                onChange={(next) => onChange(next ?? '')}
                placeholder={placeholder}
                className="h-9 border-0 bg-muted/60 px-3 text-[0.8125rem] shadow-none hover:bg-muted"
            />
        </div>
    )
}
