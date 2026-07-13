'use client'

import { useMemo, useState } from 'react'
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
import { GetAllTickets, GetSupportStats } from '@/app/manage/actions/support'
import {
    TicketFilters,
    TicketStatus,
    TicketPriority,
    TicketCategory,
    TICKET_CATEGORY_LABELS,
    TICKET_STATUS_LABELS,
    TICKET_STATUS_COLORS,
    TICKET_PRIORITY_LABELS,
    TICKET_PRIORITY_COLORS,
} from '@/types/support-ticket'
import { SectionHead } from './SectionHead'
import { EmptySection } from './EmptySection'
import { KpiStrip, type KpiCell } from './KpiStrip'

const STATUS_TABS = [
    { key: 'open', label: 'Open' },
    { key: 'in_progress', label: 'In Progress' },
    { key: 'waiting_on_merchant', label: 'Waiting' },
    { key: 'resolved', label: 'Resolved' },
    { key: 'all', label: 'All' },
] as const

export function SupportTicketsSection({ merchantId }: { merchantId: string }) {
    const router = useRouter()
    const queryClient = useQueryClient()

    const [activeStatus, setActiveStatus] = useState<string>('open')
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

    const tickets = ticketsResult?.data ?? []
    const total = ticketsResult?.total ?? 0

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

    const cells: KpiCell[] = [
        {
            icon: MessageSquare,
            label: 'Open',
            value: stats.open.toLocaleString(),
            meta: stats.total > 0 ? `${stats.total} lifetime` : 'No tickets yet',
        },
        {
            icon: Users,
            label: 'Unassigned',
            value: stats.unassigned.toLocaleString(),
            meta: stats.unassigned > 0 ? 'Action required' : 'All assigned',
            tone: stats.unassigned > 0 ? 'warn' : 'good',
        },
        {
            icon: Clock,
            label: 'Urgent / high',
            value: stats.urgent.toLocaleString(),
            meta: 'Among open tickets',
            tone: stats.urgent > 0 ? 'danger' : 'good',
        },
        {
            icon: TrendingUp,
            label: 'Lifetime cases',
            value: stats.total.toLocaleString(),
            meta: 'All statuses',
        },
    ]

    return (
        <div className="space-y-5">
            <SectionHead
                title="Support tickets"
                sub="All tickets opened by or against this merchant."
                actions={
                    <Button
                        variant="outline"
                        size="sm"
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
            />

            <KpiStrip cells={cells} loading={isLoading} />

            {/* Status tabs */}
            <div className="flex gap-0 border-b overflow-x-auto">
                {STATUS_TABS.map((tab) => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveStatus(tab.key)}
                        className={cn(
                            'px-4 py-2 -mb-px text-[12.5px] font-medium border-b-2 transition-colors whitespace-nowrap',
                            activeStatus === tab.key
                                ? 'border-foreground text-foreground'
                                : 'border-transparent text-muted-foreground hover:text-foreground'
                        )}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Secondary filters */}
            <div className="flex flex-wrap items-center gap-2">
                <div className="relative max-w-sm flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                        placeholder="Subject, ticket #, submitter..."
                        className="pl-9 h-9"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>

                <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger className="h-9 w-40">
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
                    <SelectTrigger className="h-9 w-36">
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

            {/* Ticket list */}
            <div className="overflow-hidden rounded-lg border bg-card">
                {isLoading ? (
                    <div className="divide-y">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="flex items-center gap-3 px-4 py-3">
                                <div className="flex-1 space-y-2">
                                    <Skeleton className="h-3.5 w-32" />
                                    <Skeleton className="h-3.5 w-64" />
                                </div>
                                <Skeleton className="h-6 w-16" />
                            </div>
                        ))}
                    </div>
                ) : tickets.length === 0 ? (
                    <EmptySection
                        icon={LifeBuoy}
                        title="No tickets in this filter"
                        body="Tickets opened by this merchant or by internal staff appear here."
                    />
                ) : (
                    <>
                        <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2 text-[11.5px] text-muted-foreground">
                            <span>
                                {total} ticket{total !== 1 ? 's' : ''}
                            </span>
                        </div>
                        <div className="divide-y divide-border/50">
                            {tickets.map((t) => (
                                <TicketRow
                                    key={t.id}
                                    ticket={t}
                                    onOpen={() => router.push(`/manage/support/${t.id}`)}
                                />
                            ))}
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}

function TicketRow({
    ticket,
    onOpen,
}: {
    ticket: {
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
    onOpen: () => void
}) {
    const isUrgent = ticket.priority === 'urgent' || ticket.priority === 'high'
    const isUnassigned = !ticket.assigned_to
    const isClosed = ['resolved', 'closed'].includes(ticket.status)

    return (
        <div
            onClick={onOpen}
            className={cn(
                'flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40',
                isUrgent && !isClosed
                    ? 'border-l-4 border-l-red-400'
                    : 'border-l-4 border-l-transparent'
            )}
        >
            <div className="min-w-0 flex-1">
                <div className="mb-0.5 flex items-center gap-2">
                    <span className="font-mono text-[11px] text-muted-foreground">
                        {ticket.ticket_number}
                    </span>
                    <Badge
                        className={cn(
                            'rounded-full border text-[10.5px] font-medium',
                            TICKET_STATUS_COLORS[ticket.status as keyof typeof TICKET_STATUS_COLORS]
                        )}
                    >
                        {TICKET_STATUS_LABELS[ticket.status as keyof typeof TICKET_STATUS_LABELS] ??
                            ticket.status}
                    </Badge>
                    <Badge
                        className={cn(
                            'rounded-full border text-[10.5px] font-medium',
                            TICKET_PRIORITY_COLORS[
                                ticket.priority as keyof typeof TICKET_PRIORITY_COLORS
                            ]
                        )}
                    >
                        {TICKET_PRIORITY_LABELS[
                            ticket.priority as keyof typeof TICKET_PRIORITY_LABELS
                        ] ?? ticket.priority}
                    </Badge>
                </div>
                <p className="truncate text-[12.5px] font-medium">{ticket.subject}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {ticket.location?.name && `${ticket.location.name} · `}
                    {TICKET_CATEGORY_LABELS[
                        ticket.category as keyof typeof TICKET_CATEGORY_LABELS
                    ] ?? ticket.category}
                </p>
            </div>

            <div className="shrink-0 space-y-0.5 text-right">
                <p className="text-[11px] text-muted-foreground">
                    {formatDistanceToNow(new Date(ticket.last_message_at), { addSuffix: true })}
                </p>
                <p
                    className={cn(
                        'text-[11px]',
                        isUnassigned ? 'font-semibold text-amber-600' : 'text-muted-foreground'
                    )}
                >
                    {isUnassigned ? 'Unassigned' : ticket.assigned_to_name ?? 'Assigned'}
                </p>
            </div>

            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </div>
    )
}
