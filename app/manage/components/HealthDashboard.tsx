'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Search, RefreshCw, AlertTriangle, CheckCircle2, Activity, Info } from 'lucide-react'
import { Panel } from '@/components/dashboard/shell/Panel'
import { PanelSection, PanelRow } from '@/components/dashboard/shell/PanelSection'
import { useMerchantHealthGrid } from '@/lib/queries/use-merchants'
import { useDebounce } from '@/lib/hooks/useDebounce'
import { useAdminAuth } from '@/lib/hooks/useAdminAuth'
import { useAdminMerchantAccess } from '@/app/manage/hooks/useAdminMerchantAccess'
import { useAuth } from '@clerk/nextjs'
import { formatDistanceToNow } from 'date-fns'
import type { MerchantHealthSummary } from '@/types/merchant'

/**
 * Health tier colour — HQ exception 2 (`UI-DESIGN-SYSTEM.md` §14.3 HQ-2).
 * A health score IS the operational alarm this dashboard exists to surface, so
 * the green/amber/red encoding is kept.
 *
 * What changed is the redundancy: the tier previously drove the card border,
 * the card fill, the score circle, a corner badge AND the progress bar — five
 * signals for one fact, which turned a list of 20 merchants into a wall of
 * colour where nothing stood out. The score circle and severity badge now
 * carry the tier, on a neutral card.
 *
 * The progress bar is kept from `sm` up, where it adds an at-a-glance scan of
 * relative health across a list. It stays hidden on phones: there it only
 * restated the score numeral while pushing the alerts — the part worth acting
 * on — below the fold.
 */
const HEALTH_TONE = {
    green: {
        text: 'text-green-600 dark:text-green-400',
        bar: 'bg-green-600 dark:bg-green-400',
        label: 'Optimal',
    },
    yellow: {
        text: 'text-yellow-600 dark:text-yellow-400',
        bar: 'bg-yellow-600 dark:bg-yellow-400',
        label: 'Monitor',
    },
    red: {
        text: 'text-red-600 dark:text-red-400',
        bar: 'bg-red-600 dark:bg-red-400',
        label: 'Critical',
    },
} as const

/** `DS-CTL-09` — one neutral pill; the word carries the meaning. */
const BADGE_SHELL =
    'inline-flex shrink-0 items-center gap-1.5 rounded-full border-0 bg-muted/60 px-2.5 py-0.5 text-xs font-medium'

const SCORE_LEGEND = [
    { range: '80+', label: 'Healthy', caption: 'All systems running smoothly', tone: HEALTH_TONE.green },
    { range: '60-79', label: 'Needs Attention', caption: 'Some issues detected', tone: HEALTH_TONE.yellow },
    { range: '<60', label: 'Critical', caption: 'Urgent action required', tone: HEALTH_TONE.red },
]

const SCORE_FACTORS = [
    { title: 'Device Connectivity', caption: 'POS systems offline or stale heartbeat' },
    { title: 'Transaction Success Rate', caption: 'Failed or declined payment processing' },
    { title: 'Activity Level', caption: 'Low order volume or extended inactivity' },
    { title: 'System Health', caption: 'Battery issues, app version outdated, or errors' },
    { title: 'Staff Management', caption: 'Insufficient staff or high turnover' },
    { title: 'Location Coverage', caption: 'Inactive or underperforming locations' },
]

export function HealthDashboard() {
    const router = useRouter()
    const { userId } = useAuth()
    const { isSuperAdmin, isLoading: authLoading } = useAdminAuth()
    const [search, setSearch] = useState('')
    const [healthFilter, setHealthFilter] = useState<'all' | 'needs-attention' | 'critical'>('all')
    const [healthSort, setHealthSort] = useState<'score' | 'revenue' | 'orders' | 'activity' | 'name'>('score')

    const debouncedSearch = useDebounce(search, 300)

    // Fetch accessible merchant IDs for non-super-admins
    const { data: merchantAccess, isLoading: accessLoading } = useAdminMerchantAccess(userId || '')

    const accessibleMerchantIds = isSuperAdmin
        ? undefined
        : merchantAccess?.map(access => access.merchantId)

    const { data: healthData, isLoading: healthLoading, refetch } = useMerchantHealthGrid(
        accessibleMerchantIds
    )

    return (
        <div className="min-w-0 space-y-6">
            <Panel>
                <PanelSection
                    icon={Activity}
                    label="Health Monitor"
                    caption="Monitor merchant performance and operational health across your platform"
                    action={
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-9 rounded-full px-4 text-[0.8125rem] font-medium"
                            onClick={() => refetch()}
                            disabled={healthLoading}
                        >
                            <RefreshCw className={`mr-2 h-4 w-4 ${healthLoading ? 'animate-spin motion-reduce:animate-none' : ''}`} />
                            Refresh
                        </Button>
                    }
                >
                    <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-3">
                        {SCORE_LEGEND.map(({ range, label, caption, tone }) => (
                            <div key={label} className="flex min-w-0 items-center gap-3">
                                <span
                                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted/60 text-sm font-semibold tabular-nums ${tone.text}`}
                                >
                                    {range}
                                </span>
                                <div className="min-w-0 text-sm">
                                    <p className="font-medium">{label}</p>
                                    <p className="text-xs text-muted-foreground">{caption}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </PanelSection>

                <PanelSection icon={Info} label="Health Score Factors">
                    <div className="grid min-w-0 grid-cols-1 gap-3 text-sm md:grid-cols-2">
                        {SCORE_FACTORS.map(({ title, caption }) => (
                            <div key={title} className="min-w-0">
                                <p className="font-medium">{title}</p>
                                <p className="text-xs text-muted-foreground">{caption}</p>
                            </div>
                        ))}
                    </div>
                </PanelSection>

                {/* Filters sit in the same panel as the list they filter, rather
                    than in a card of their own. */}
                <PanelRow className="pb-6">
                    <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-center">
                        <div className="relative min-w-0 max-w-sm flex-1">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
                            <Input
                                placeholder="Search merchants..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="h-9 pl-9 text-[0.8125rem]"
                            />
                        </div>

                        <Select value={healthFilter} onValueChange={(value) => setHealthFilter(value as typeof healthFilter)}>
                            <SelectTrigger className="h-9 w-full text-[0.8125rem] md:w-44">
                                <SelectValue placeholder="Health Filter" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Merchants</SelectItem>
                                <SelectItem value="needs-attention">Needs Attention (&lt;80)</SelectItem>
                                <SelectItem value="critical">Critical (&lt;60)</SelectItem>
                            </SelectContent>
                        </Select>

                        <Select value={healthSort} onValueChange={(value) => setHealthSort(value as typeof healthSort)}>
                            <SelectTrigger className="h-9 w-full text-[0.8125rem] md:w-44">
                                <SelectValue placeholder="Sort by" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="score">Health Score</SelectItem>
                                <SelectItem value="revenue">Revenue</SelectItem>
                                <SelectItem value="orders">Orders</SelectItem>
                                <SelectItem value="activity">Last Activity</SelectItem>
                                <SelectItem value="name">Alphabetical</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </PanelRow>
            </Panel>

            {/* Content */}
            {authLoading || (!isSuperAdmin && accessLoading) ? (
                <HealthGridSkeleton />
            ) : healthLoading ? (
                <HealthGridSkeleton />
            ) : healthData && healthData.length > 0 ? (
                <HealthGrid
                    merchants={healthData}
                    filter={healthFilter}
                    sortBy={healthSort}
                    search={debouncedSearch}
                    onMerchantClick={(clerkOrgId) => router.push(`/manage/merchants/${clerkOrgId}`)}
                />
            ) : (
                <div className="py-12 text-center">
                    <p className="text-muted-foreground">No merchants found.</p>
                </div>
            )}
        </div>
    )
}

function HealthGridSkeleton() {
    return (
        <div className="flex min-w-0 flex-col gap-3">
            {[...Array(5)].map((_, i) => (
                <Panel key={i} padded>
                    <div className="flex min-w-0 flex-col gap-4">
                        <div className="flex min-w-0 items-start gap-4">
                            <Skeleton className="h-16 w-16 shrink-0 rounded-full" />
                            <div className="min-w-0 flex-1 space-y-2">
                                <Skeleton className="h-5 w-40 max-w-[60%]" />
                                <Skeleton className="h-4 w-32 max-w-[50%]" />
                                {/* Mirrors the score bar's sm+ visibility so the
                                    card does not change height on load. */}
                                <Skeleton className="hidden h-2 w-full rounded-full sm:block" />
                                <Skeleton className="h-4 w-52 max-w-[80%]" />
                                <Skeleton className="h-3 w-48 max-w-[70%]" />
                            </div>
                        </div>
                        <div className="grid min-w-0 grid-cols-2 gap-3 md:grid-cols-4">
                            {[...Array(4)].map((_, j) => (
                                <div key={j} className="space-y-1">
                                    <Skeleton className="h-3 w-16 max-w-full" />
                                    <Skeleton className="h-4 w-12 max-w-full" />
                                </div>
                            ))}
                        </div>
                    </div>
                </Panel>
            ))}
        </div>
    )
}

interface HealthGridProps {
    merchants: MerchantHealthSummary[]
    filter: 'all' | 'needs-attention' | 'critical'
    sortBy: 'score' | 'revenue' | 'orders' | 'activity' | 'name'
    search: string
    onMerchantClick: (clerkOrgId: string) => void
}

function HealthGrid({
    merchants,
    filter,
    sortBy,
    search,
    onMerchantClick,
}: HealthGridProps) {
    // Apply search filter
    let filtered = merchants.filter((m) =>
        m.name.toLowerCase().includes(search.toLowerCase())
    )

    // Apply health filter
    filtered = filtered.filter((m) => {
        if (filter === 'critical') return m.healthScore < 60
        if (filter === 'needs-attention') return m.healthScore < 80
        return true
    })

    // Apply sort
    filtered = [...filtered].sort((a, b) => {
        switch (sortBy) {
            case 'score':
                return a.healthScore - b.healthScore
            case 'revenue':
                return b.revenue_today - a.revenue_today
            case 'orders':
                return b.orders_today - a.orders_today
            case 'activity':
                if (!a.last_order_at && !b.last_order_at) return 0
                if (!a.last_order_at) return 1
                if (!b.last_order_at) return -1
                return (
                    new Date(b.last_order_at).getTime() -
                    new Date(a.last_order_at).getTime()
                )
            case 'name':
                return a.name.localeCompare(b.name)
            default:
                return 0
        }
    })

    if (filtered.length === 0) {
        return (
            <div className="py-12 text-center">
                <p className="text-muted-foreground">No merchants match the selected filters.</p>
            </div>
        )
    }

    return (
        <div className="flex min-w-0 flex-col gap-3">
            {filtered.map((merchant) => (
                <HealthRow
                    key={merchant.id}
                    merchant={merchant}
                    onClick={() => onMerchantClick(merchant.clerk_org_id)}
                />
            ))}
        </div>
    )
}

function HealthRow({
    merchant,
    onClick,
}: {
    merchant: MerchantHealthSummary
    onClick: () => void
}) {
    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 0,
        }).format(amount)
    }

    const tone = HEALTH_TONE[merchant.healthTier] ?? HEALTH_TONE.red
    // Clamped both ways: an out-of-range score would otherwise render a bar
    // wider than its track or a negative width.
    const healthPercentage = Math.max(0, Math.min(100, merchant.healthScore))

    return (
        // A real button: the row was a click-only Card, so the whole health
        // grid was unreachable by keyboard.
        <button
            type="button"
            onClick={onClick}
            className="block w-full min-w-0 rounded-3xl border bg-card p-5 text-left transition-colors hover:bg-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
            <div className="flex min-w-0 flex-col gap-3">
                {/* Top Row: Score, Name, Type */}
                <div className="flex min-w-0 items-start gap-4">
                    {/* The 64px score disc is a phone's whole left quarter, and
                        it indents every line beside it. Below `sm` the score
                        rides inline next to the status instead (see the name
                        row); from `sm` up there is room for the disc. */}
                    <div
                        className={`hidden h-16 w-16 shrink-0 items-center justify-center rounded-full bg-muted/60 text-2xl font-bold tabular-nums sm:flex ${tone.text}`}
                        role="img"
                        aria-label={`Health score ${merchant.healthScore} of 100 — ${tone.label}`}
                    >
                        <span aria-hidden="true">{merchant.healthScore}</span>
                    </div>

                    <div className="min-w-0 flex-1">
                        <div className="mb-1 flex min-w-0 flex-wrap items-center gap-2">
                            <h3 className="min-w-0 truncate font-semibold">{merchant.name}</h3>
                            {/* Phone-only stand-in for the hidden disc. The
                                `sm:hidden` pair mirrors the disc's `hidden sm:flex`,
                                so exactly one of them is ever on screen — the
                                disc carries the aria-label at sm+, this one
                                below it. */}
                            <span
                                className={`text-sm font-bold tabular-nums sm:hidden ${tone.text}`}
                                role="img"
                                aria-label={`Health score ${merchant.healthScore} of 100 — ${tone.label}`}
                            >
                                <span aria-hidden="true">{merchant.healthScore}</span>
                            </span>
                            <span className={BADGE_SHELL}>{tone.label}</span>
                        </div>

                        {merchant.type && (
                            <p className="text-sm capitalize text-muted-foreground">
                                {merchant.type}
                            </p>
                        )}

                        {/* Score bar: tablet and up only. On a phone it pushed
                            the alerts — the actionable part — below the fold,
                            which is why it was dropped; at sm+ there is room
                            for it beside the stats. aria-hidden because the
                            score numeral above already announces the same
                            value and tier, and a second meter would just
                            double-announce it. */}
                        <div
                            className="mt-2 hidden h-2 overflow-hidden rounded-full bg-muted sm:block"
                            aria-hidden="true"
                        >
                            <div
                                className={`h-full rounded-full transition-all duration-300 motion-reduce:transition-none ${tone.bar}`}
                                style={{ width: `${healthPercentage}%` }}
                            />
                        </div>
                    </div>
                </div>

                {/* Alerts or All Systems Go.
                    Deliberately a sibling of the score row, not a child of its
                    text column: nested there, every issue started 80px in —
                    past the score circle and its gap — which on a phone reads
                    as centred text and wraps the messages early. At the row's
                    own level they start at the card's left edge and get the
                    full width. From `sm` up they re-indent to line up under the
                    merchant name — and under the score bar, which shares that
                    same 80px column offset. */}
                {merchant.alerts.length > 0 ? (
                    <div className="flex min-w-0 flex-col gap-1 sm:pl-20">
                        {/* One alert on a phone, two from `sm` up. The second is
                            rendered but `hidden` rather than sliced away, so the
                            cutoff is a CSS breakpoint and not a JS guess at the
                            viewport — no hydration mismatch, no resize listener. */}
                        {merchant.alerts.slice(0, 2).map((alert, idx) => (
                            <div
                                key={idx}
                                className={`flex items-start gap-2 text-sm ${idx === 1 ? 'hidden sm:flex' : ''}`}
                            >
                                <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${tone.text}`} />
                                <span className="min-w-0 text-muted-foreground">{alert}</span>
                            </div>
                        ))}
                        {/* Two counts for the two cutoffs; CSS picks one. */}
                        {merchant.alerts.length > 1 && (
                            <p className="text-xs text-muted-foreground sm:hidden">
                                +{merchant.alerts.length - 1} more issue{merchant.alerts.length - 1 !== 1 ? 's' : ''}
                            </p>
                        )}
                        {merchant.alerts.length > 2 && (
                            <p className="hidden text-xs text-muted-foreground sm:block">
                                +{merchant.alerts.length - 2} more issue{merchant.alerts.length - 2 !== 1 ? 's' : ''}
                            </p>
                        )}
                    </div>
                ) : (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground sm:pl-20">
                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                        <span>All systems optimal</span>
                    </div>
                )}

                {/* Bottom Row: Stats Grid */}
                <div className="grid min-w-0 grid-cols-2 gap-3 md:grid-cols-4">
                    <div className="min-w-0 text-sm">
                        <p className="mb-0.5 text-xs text-muted-foreground">Locations</p>
                        <p className="font-semibold tabular-nums">{merchant.total_locations}</p>
                    </div>

                    <div className="min-w-0 text-sm">
                        <p className="mb-0.5 text-xs text-muted-foreground">Devices</p>
                        <p className="font-semibold tabular-nums">{merchant.totalStations}</p>
                    </div>

                    <div className="min-w-0 text-sm">
                        <p className="mb-0.5 text-xs text-muted-foreground">Revenue Today</p>
                        <p className="font-semibold tabular-nums">
                            {formatCurrency(merchant.revenue_today)}
                        </p>
                    </div>

                    <div className="min-w-0 text-sm">
                        <p className="mb-0.5 text-xs text-muted-foreground">Orders Today</p>
                        <p className="mb-1 font-semibold tabular-nums">{merchant.orders_today}</p>
                        <p className="text-xs text-muted-foreground">
                            {merchant.last_order_at
                                ? formatDistanceToNow(new Date(merchant.last_order_at), {
                                    addSuffix: true,
                                })
                                : 'No orders'}
                        </p>
                    </div>
                </div>
            </div>
        </button>
    )
}
