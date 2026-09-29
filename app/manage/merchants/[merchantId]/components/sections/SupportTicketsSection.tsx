'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import {
    LifeBuoy,
    MessageSquare,
    Users,
    Clock,
    TrendingUp,
    ChevronRight,
    RefreshCw,
    Search,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Panel, PanelSection } from '@/components/dashboard/shell'
import { PaginationBar } from '@/components/dashboard/PaginationBar'
import { useClientPagination } from '@/lib/hooks/useClientPagination'
import { GetAllTickets } from '@/app/manage/actions/support'
import {
    TicketFilters,
    TicketStatus,
    TicketPriority,
    TicketCategory,
    TICKET_CATEGORY_LABELS,
    TICKET_STATUS_LABELS,
    TICKET_PRIORITY_LABELS,
} from '@/types/support-ticket'
import { EmptySection } from './EmptySection'
import { KpiStrip, type KpiCell } from './KpiStrip'

const STATUS_TABS = [
    { key: 'open', label: 'Open' },
    { key: 'in_progress', label: 'In Progress' },
    { key: 'waiting_on_merchant', label: 'Waiting' },
    { key: 'resolved', label: 'Resolved' },
    { key: 'all', label: 'All' },
] as const

const CELL_BADGE = 'w-fit rounded-full border-0 px-2.5 text-xs font-medium'

interface TicketListRow {
    id: string
    ticket_number: string
    subject: string
    status: string
    priority: string
    category: string
    last_message_at: string
    location?: { id: string; name: string } | null
    assigned_to?: string | null
    assigned_to_name?: string | null
}

function statusLabel(t: TicketListRow) {
    return TICKET_STATUS_LABELS[t.status as keyof typeof TICKET_STATUS_LABELS] ?? t.status
}

function priorityLabel(t: TicketListRow) {
    return TICKET_PRIORITY_LABELS[t.priority as keyof typeof TICKET_PRIORITY_LABELS] ?? t.priority
}

function categoryLine(t: TicketListRow) {
    const category =
        TICKET_CATEGORY_LABELS[t.category as keyof typeof TICKET_CATEGORY_LABELS] ?? t.category
    return t.location?.name ? `${t.location.name} · ${category}` : category
}

function assigneeLabel(t: TicketListRow) {
    return t.assigned_to ? t.assigned_to_name ?? 'Assigned' : 'Unassigned'
}

/**
 * Needs attention: urgent/high and still open. Marked by weight, not colour
 * (§3.5) — this page is not on the HQ-2 alarm list.
 */
function needsAttention(t: TicketListRow) {
    return (
        (t.priority === 'urgent' || t.priority === 'high') &&
        !['resolved', 'closed'].includes(t.status)
    )
}

export function SupportTicketsSection({ merchantId }: { merchantId: string }) {
    const router = useRouter()
    const queryClient = useQueryClient()

    const [activeStatus, setActiveStatus] = useState<string>('open')

    // Keep the active status pill centred in the scrollable rail, same as the
    // settlements tabs. Scroll the rail itself rather than `scrollIntoView`,
    // which would also scroll the page vertically.
    const railRef = useRef<HTMLDivElement>(null)
    const railPositioned = useRef(false)
    useEffect(() => {
        const rail = railRef.current
        const active = rail?.querySelector<HTMLElement>('[aria-pressed="true"]')
        if (!rail || !active) return
        const max = rail.scrollWidth - rail.clientWidth
        if (max <= 0) return
        const railBox = rail.getBoundingClientRect()
        const tabBox = active.getBoundingClientRect()
        const left = rail.scrollLeft + tabBox.left - railBox.left - (railBox.width - tabBox.width) / 2
        const smooth = railPositioned.current && !matchMedia('(prefers-reduced-motion: reduce)').matches
        rail.scrollTo({ left: Math.max(0, Math.min(left, max)), behavior: smooth ? 'smooth' : 'auto' })
        railPositioned.current = true
    }, [activeStatus])

    const [category, setCategory] = useState<string>('all')
    const [priority, setPriority] = useState<string>('all')
    const [search, setSearch] = useState('')

    const filters: TicketFilters = useMemo(
        () => ({
            merchant_id: merchantId,
            status: activeStatus as TicketStatus | 'all',
            category: category === 'all' ? undefined : (category as TicketCategory),
            priority: priority === 'all' ? undefined : (priority as TicketPriority),
            search: search || undefined,
        }),
        [merchantId, activeStatus, category, priority, search]
    )

    const { data: ticketsResult, isLoading } = useQuery({
        queryKey: ['merchant-support-tickets', merchantId, filters],
        queryFn: () => GetAllTickets(filters, 50, 0),
        enabled: !!merchantId,
    })

    const { data: statsResult } = useQuery({
        queryKey: ['merchant-support-stats', merchantId],
        queryFn: () =>
            GetAllTickets({ merchant_id: merchantId, status: 'all' }, 1000, 0),
        enabled: !!merchantId,
        staleTime: 30_000,
    })

    const tickets: TicketListRow[] = useMemo(() => ticketsResult?.data ?? [], [ticketsResult])
    const total = ticketsResult?.total ?? 0
    const { pageRows, pagination, setPage } = useClientPagination(tickets, 10)

    const stats = useMemo(() => {
        const all = statsResult?.data ?? []
        const open = all.filter((t) =>
            ['new', 'open', 'in_progress', 'waiting_on_merchant'].includes(t.status as string)
        ).length
        const unassigned = all.filter(
            (t) => !t.assigned_to && !['resolved', 'closed'].includes(t.status as string)
        ).length
        const urgent = all.filter(
            (t) =>
                ['urgent', 'high'].includes(t.priority as string) &&
                !['resolved', 'closed'].includes(t.status as string)
        ).length
        return { total: all.length, open, unassigned, urgent }
    }, [statsResult])

    // Unknown is not zero (§4.9): "—" until the stats query has answered.
    const known = !!statsResult
    const figure = (n: number) => (known ? n.toLocaleString() : '—')
    const cells: KpiCell[] = [
        {
            icon: MessageSquare,
            label: 'Open',
            value: figure(stats.open),
            meta: known ? (stats.total > 0 ? `${stats.total} lifetime` : 'No tickets yet') : undefined,
        },
        {
            icon: Users,
            label: 'Unassigned',
            value: figure(stats.unassigned),
            meta: known ? (stats.unassigned > 0 ? 'Action required' : 'All assigned') : undefined,
        },
        {
            icon: Clock,
            label: 'Urgent / high',
            value: figure(stats.urgent),
            meta: 'Among open tickets',
        },
        {
            icon: TrendingUp,
            label: 'Lifetime cases',
            value: figure(stats.total),
            meta: 'All statuses',
        },
    ]

    const openTicket = (id: string) => router.push(`/manage/support/${id}`)

    return (
        <Panel>
            <PanelSection
                label="Support tickets"
                caption="All tickets opened by or against this merchant."
                action={
                    <Button
                        variant="outline"
                        className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
                        onClick={() => {
                            queryClient.invalidateQueries({
                                queryKey: ['merchant-support-tickets', merchantId],
                            })
                            queryClient.invalidateQueries({
                                queryKey: ['merchant-support-stats', merchantId],
                            })
                        }}
                    >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Refresh
                    </Button>
                }
            >
                <div className="space-y-6">
                    <KpiStrip cells={cells} loading={isLoading} />

                    <div className="space-y-3">
                        {/* §4.5 pill rail — TAB_PILL_BUTTON + active/inactive literals (C7). */}
                        <div ref={railRef} className="w-full min-w-0 no-scrollbar overflow-x-auto pb-1">
                            <div className="inline-flex h-auto w-max flex-nowrap gap-0.5 rounded-full bg-muted/70 p-1">
                                {STATUS_TABS.map((tab) => (
                                    <button
                                        key={tab.key}
                                        type="button"
                                        onClick={() => setActiveStatus(tab.key)}
                                        aria-pressed={activeStatus === tab.key}
                                        className={cn(
                                            'shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-medium transition-colors',
                                            activeStatus === tab.key
                                                ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                                                : 'text-muted-foreground hover:text-foreground'
                                        )}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <div className="relative min-w-[200px] max-w-sm flex-1">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
                                <Input
                                    placeholder="Subject, ticket #, submitter..."
                                    aria-label="Search tickets"
                                    className="h-9 pl-9 text-[0.8125rem]"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                />
                            </div>

                            <Select value={category} onValueChange={setCategory}>
                                <SelectTrigger aria-label="Category" className="h-9 w-40 min-w-0 text-[0.8125rem]">
                                    <SelectValue placeholder="Category" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All categories</SelectItem>
                                    {Object.entries(TICKET_CATEGORY_LABELS).map(([k, label]) => (
                                        <SelectItem key={k} value={k}>
                                            {label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            <Select value={priority} onValueChange={setPriority}>
                                <SelectTrigger aria-label="Priority" className="h-9 w-36 min-w-0 text-[0.8125rem]">
                                    <SelectValue placeholder="Priority" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All priorities</SelectItem>
                                    <SelectItem value="urgent">Urgent</SelectItem>
                                    <SelectItem value="high">High</SelectItem>
                                    <SelectItem value="normal">Normal</SelectItem>
                                    <SelectItem value="low">Low</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {isLoading ? (
                        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
                            {Array.from({ length: 4 }).map((_, i) => (
                                <div key={i} className="space-y-2 rounded-2xl border-0 bg-muted/45 p-4">
                                    <Skeleton className="h-3.5 w-32" />
                                    <Skeleton className="h-3.5 w-64 max-w-full" />
                                </div>
                            ))}
                        </div>
                    ) : tickets.length === 0 ? (
                        <EmptySection
                            icon={LifeBuoy}
                            title="No tickets match these filters"
                            body="Tickets opened by this merchant or by internal staff appear here."
                        />
                    ) : (
                        <div>
                            <Table variant="data" containerClassName="hidden lg:block" className="min-w-[720px]">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Ticket</TableHead>
                                        <TableHead>Subject</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Priority</TableHead>
                                        <TableHead>Last activity</TableHead>
                                        <TableHead>Assignee</TableHead>
                                        <TableHead className="w-8" />
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {pageRows.map((t) => {
                                        const attention = needsAttention(t)
                                        return (
                                            <TableRow
                                                key={t.id}
                                                className="cursor-pointer"
                                                onClick={() => openTicket(t.id)}
                                            >
                                                <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                                                    {t.ticket_number}
                                                </TableCell>
                                                <TableCell className="max-w-[320px]">
                                                    <p
                                                        className={cn(
                                                            'truncate',
                                                            attention ? 'font-semibold text-foreground' : 'font-medium'
                                                        )}
                                                    >
                                                        {t.subject}
                                                    </p>
                                                    <p className="truncate text-xs text-muted-foreground">{categoryLine(t)}</p>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="secondary" className={CELL_BADGE}>
                                                        {statusLabel(t)}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="secondary" className={CELL_BADGE}>
                                                        {priorityLabel(t)}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="whitespace-nowrap text-muted-foreground">
                                                    {formatDistanceToNow(new Date(t.last_message_at), { addSuffix: true })}
                                                </TableCell>
                                                <TableCell
                                                    className={cn(
                                                        'whitespace-nowrap',
                                                        t.assigned_to ? 'text-muted-foreground' : 'font-medium text-foreground'
                                                    )}
                                                >
                                                    {assigneeLabel(t)}
                                                </TableCell>
                                                <TableCell>
                                                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })}
                                </TableBody>
                            </Table>

                            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
                                {pageRows.map((t) => {
                                    const attention = needsAttention(t)
                                    return (
                                        <button
                                            key={t.id}
                                            type="button"
                                            onClick={() => openTicket(t.id)}
                                            className="min-w-0 rounded-2xl border-0 bg-muted/45 p-4 text-left transition-colors hover:bg-muted/70"
                                        >
                                            {/* Lean phone card (§13.4): status is already the
                                                active tab, so it only shows under "All"; category
                                                and normal/low priority live on the ticket page. */}
                                            <div className="flex items-center justify-between gap-3">
                                                <p className="min-w-0 truncate font-mono text-xs text-muted-foreground">
                                                    {t.ticket_number}
                                                </p>
                                                {activeStatus === 'all' && (
                                                    <span className="shrink-0 text-xs text-muted-foreground">{statusLabel(t)}</span>
                                                )}
                                            </div>
                                            <p
                                                className={cn(
                                                    'mt-0.5 truncate',
                                                    attention ? 'font-semibold text-foreground' : 'font-medium'
                                                )}
                                            >
                                                {t.subject}
                                            </p>
                                            <p className="mt-1.5 truncate text-sm text-muted-foreground">
                                                {attention && (
                                                    <span className="font-medium text-foreground">{priorityLabel(t)} · </span>
                                                )}
                                                <span className={cn(!t.assigned_to && 'font-medium text-foreground')}>
                                                    {assigneeLabel(t)}
                                                </span>
                                                {' · '}
                                                {formatDistanceToNow(new Date(t.last_message_at), { addSuffix: true })}
                                            </p>
                                        </button>
                                    )
                                })}
                            </div>

                            <PaginationBar pagination={pagination} onPageChange={setPage} itemLabel="tickets" />
                            {tickets.length <= pagination.pageSize && (
                                <p className="mt-3 text-xs text-muted-foreground tabular-nums sm:text-sm">
                                    {total} ticket{total !== 1 ? 's' : ''}
                                </p>
                            )}
                            {total > tickets.length && (
                                <p className="mt-3 text-xs text-muted-foreground tabular-nums sm:text-sm">
                                    Showing the latest {tickets.length} of {total} tickets. Open Support to see the rest.
                                </p>
                            )}
                        </div>
                    )}
                </div>
            </PanelSection>
        </Panel>
    )
}
