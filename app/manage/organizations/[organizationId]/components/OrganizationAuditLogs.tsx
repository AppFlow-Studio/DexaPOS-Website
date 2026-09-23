'use client'

import { useMemo, useState } from 'react'
import { format, formatDistanceToNow } from 'date-fns'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { usePlatformAuditLogs } from '@/lib/queries/use-platform-analytics'
import type { PlatformAuditLogRow } from '@/app/manage/actions/hq-platform/analytics'
import type { MerchantsModel } from '@/types/db-modles'

/** How many events one page of the table holds. */
const PAGE_SIZE = 25

/**
 * Turns `created_menu_item` into `Created menu item`.
 *
 * The raw `action` is a snake_case verb; the table reads as a log, not a
 * database dump, so it is title-cased for display only.
 */
function formatAction(action?: string): string {
    if (!action) return 'Unknown action'
    const words = action.replace(/[_.]+/g, ' ').trim()
    return words.charAt(0).toUpperCase() + words.slice(1)
}

/** Relative age ("2 hours ago"), guarded against unparseable timestamps. */
function relativeTime(value?: string): string {
    if (!value) return '—'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '—'
    return formatDistanceToNow(date, { addSuffix: true })
}

/** Absolute timestamp for the `title` tooltip and the mobile card. */
function absoluteTime(value?: string): string {
    if (!value) return '—'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '—'
    return format(date, 'MMM d, yyyy h:mm a')
}

/**
 * Severity as a neutral pill.
 *
 * The platform-wide audit page colour-codes these red/amber/blue, but this
 * surface follows D-03: an `info` event is not an alarm, so the word carries
 * the meaning and only a real failure earns emphasis — and it earns it through
 * weight, not hue.
 */
function SeverityBadge({ severity, status }: { severity?: string; status?: string }) {
    const failed = status === 'failed' || status === 'error'
    const label = failed ? 'failed' : (severity || 'info')
    return (
        <Badge
            variant="secondary"
            className={`w-fit shrink-0 rounded-full border-0 px-2.5 text-xs ${failed ? 'font-semibold text-foreground' : 'font-medium'
                }`}
        >
            {label}
        </Badge>
    )
}

/** The actor's display name, falling back through the identity columns. */
function actorLabel(row: PlatformAuditLogRow): string {
    return row.actor_name || row.actor_email || row.actor_user_id || 'System'
}

/**
 * Audit events for every merchant this carrier owns.
 *
 * Rows carry no `carrier_id` — it is NULL on every row in the table — so a
 * carrier's activity can only be reached through its merchants. The parent
 * resolves those, and this component queries `merchant_id IN (...)` via the
 * platform action's existing `merchantIds` filter.
 *
 * An empty `merchantIds` would drop the filter entirely and return the whole
 * platform's audit log, so a carrier with no merchants renders the empty state
 * instead of querying at all.
 */
export function OrganizationAuditLogs({ merchants }: { merchants?: MerchantsModel[] }) {
    const [search, setSearch] = useState('')
    const [page, setPage] = useState(0)

    const merchantIds = useMemo(
        () => (merchants ?? []).map((m) => m.id).filter(Boolean),
        [merchants]
    )

    /** Merchant name by id — the query returns ids, the table shows names. */
    const merchantNameById = useMemo(() => {
        const map = new Map<string, string>()
        for (const m of merchants ?? []) if (m.id) map.set(m.id, m.name)
        return map
    }, [merchants])

    const hasMerchants = merchantIds.length > 0

    const filters = useMemo(
        () => ({
            merchantIds,
            search: search.trim() || undefined,
        }),
        [merchantIds, search]
    )

    const { data, isLoading, error } = usePlatformAuditLogs(
        filters,
        PAGE_SIZE,
        page * PAGE_SIZE
    )

    const rows = hasMerchants ? data?.data ?? [] : []
    const total = hasMerchants ? data?.total ?? 0 : 0
    const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

    /** Resolve a row's merchant name, preferring the id map over the join. */
    const merchantName = (row: PlatformAuditLogRow) =>
        (row.merchant_id && merchantNameById.get(row.merchant_id)) ||
        row.merchant_name ||
        '—'

    if (!hasMerchants) {
        return (
            <p className="text-sm text-muted-foreground">
                This organization has no merchants yet, so there is no activity to show.
            </p>
        )
    }

    if (error) {
        return (
            <p className="text-sm text-muted-foreground">
                We hit a snag loading audit events. Please try again.
            </p>
        )
    }

    return (
        <div className="space-y-4">
            {/* Search sits above the log rather than in the panel header: the
                panel's caption already names the section, and a filter reads as
                part of the list it filters. */}
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Input
                    placeholder="Search events, actors, or resources"
                    className="h-9 min-w-0 border-0 bg-muted/60 text-[0.8125rem] shadow-none focus-visible:bg-background sm:w-72"
                    value={search}
                    onChange={(e) => {
                        setSearch(e.target.value)
                        // A narrowed result set has fewer pages; staying on page 5
                        // of a 2-page result renders an empty table.
                        setPage(0)
                    }}
                />
                {/* The count is context, not a control; on a phone it sat on its
                    own line between the search field and the first event. The
                    page counter at the foot still states the size of the set. */}
                {!isLoading && (
                    <p className="hidden shrink-0 text-sm text-muted-foreground tabular-nums sm:block">
                        {total.toLocaleString()} {total === 1 ? 'event' : 'events'}
                    </p>
                )}
            </div>

            {isLoading ? (
                <div className="space-y-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div
                            key={i}
                            className="h-14 animate-pulse rounded-2xl bg-muted/45"
                        />
                    ))}
                </div>
            ) : rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    {search.trim()
                        ? 'No events match your search.'
                        : 'No events to display.'}
                </p>
            ) : (
                <>
                    {/* §5.3: the data table from `lg`, a card grid below it. */}
                    <Table
                        variant="data"
                        containerClassName="hidden lg:block"
                        className="min-w-[760px]"
                    >
                        <TableHeader className="[&_tr]:border-0">
                            <TableRow>
                                <TableHead>Event</TableHead>
                                <TableHead>Actor</TableHead>
                                <TableHead>Merchant</TableHead>
                                <TableHead>Severity</TableHead>
                                <TableHead>When</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rows.map((row) => (
                                <TableRow key={row.id}>
                                    <TableCell>
                                        <div className="font-medium">{formatAction(row.action)}</div>
                                        {row.resource_name && (
                                            <div className="text-sm text-muted-foreground">
                                                {row.resource_name}
                                            </div>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-sm">{actorLabel(row)}</TableCell>
                                    <TableCell className="text-sm">{merchantName(row)}</TableCell>
                                    <TableCell>
                                        <SeverityBadge severity={row.severity} status={row.status} />
                                    </TableCell>
                                    <TableCell
                                        className="text-sm text-muted-foreground"
                                        title={absoluteTime(row.created_at)}
                                    >
                                        {relativeTime(row.created_at)}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>

                    <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
                        {rows.map((row) => (
                            <div
                                key={row.id}
                                className="min-w-0 rounded-2xl border-0 bg-muted/45 p-4"
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="truncate font-semibold">
                                            {formatAction(row.action)}
                                        </p>
                                        {/* Shown only when it says something the Actor
                                            field below does not. On staff events the two
                                            are the same string (~20% of rows), which made
                                            the card print one name twice; on the rest it
                                            names the branch or store that was touched,
                                            which is the point of the line. */}
                                        {row.resource_name &&
                                            row.resource_name !== actorLabel(row) && (
                                                <p className="truncate text-xs text-muted-foreground">
                                                    {row.resource_name}
                                                </p>
                                            )}
                                    </div>
                                    <SeverityBadge severity={row.severity} status={row.status} />
                                </div>

                                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                    <div className="min-w-0">
                                        <p className="text-xs text-muted-foreground">Actor</p>
                                        <p className="truncate font-medium">{actorLabel(row)}</p>
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-xs text-muted-foreground">Merchant</p>
                                        <p className="truncate font-medium">{merchantName(row)}</p>
                                    </div>
                                </div>

                                <p className="mt-3 text-xs text-muted-foreground">
                                    {absoluteTime(row.created_at)}
                                </p>
                            </div>
                        ))}
                    </div>

                    {pageCount > 1 && (
                        <div className="flex items-center justify-between gap-2">
                            <p className="text-sm text-muted-foreground tabular-nums">
                                Page {page + 1} of {pageCount}
                            </p>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={page === 0}
                                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                                >
                                    Previous
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={page + 1 >= pageCount}
                                    onClick={() => setPage((p) => p + 1)}
                                >
                                    Next
                                </Button>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}
