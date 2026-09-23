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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useIsMobile } from '@/hooks/use-mobile'
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
    /**
     * Not a severity — the absence of one. A merchant with nothing
     * provisioned gets muted foreground, no alarm colour and no bar, because
     * claiming any position on a green-to-red scale would be a claim we
     * cannot support. See `MerchantHealthTier`.
     */
    unscored: {
        text: 'text-muted-foreground',
        bar: 'bg-muted-foreground/30',
        label: 'Not set up',
    },
} as const

const SCORE_LEGEND = [
    { range: '80+', label: 'Healthy', caption: 'All systems running smoothly', tone: HEALTH_TONE.green },
    { range: '60-79', label: 'Needs Attention', caption: 'Some issues detected', tone: HEALTH_TONE.yellow },
    { range: '<60', label: 'Critical', caption: 'Urgent action required', tone: HEALTH_TONE.red },
    { range: '—', label: 'Not set up', caption: 'No locations, devices or staff yet', tone: HEALTH_TONE.unscored },
]

/**
 * What the score is actually made of, with the real weights.
 *
 * The previous list named six factors — including "Staff Management" and
 * "Location Coverage" — that the scoring function never reads, and omitted
 * that a fifth of the score is a pair of constants awaiting real data. An
 * explainer that describes a model the code does not implement is worse than
 * no explainer: it invites admins to act on factors that cannot move.
 *
 * Keep this in sync with `getMerchantHealthGrid`. If a weight changes there
 * and not here, this panel starts lying again.
 */
const SCORE_FACTORS = [
    {
        title: 'Order activity',
        weight: '25%',
        caption: "Today's volume against this merchant's own 28-day median, so a quiet day is judged by their normal, not a platform average.",
    },
    {
        title: 'Device connectivity',
        weight: '20%',
        caption: 'Share of stations online with a heartbeat in the last 5 minutes.',
    },
    {
        title: 'Setup completeness',
        weight: '15%',
        caption: 'Staff and stations registered. Menu and payment terminal are assumed complete pending real signals.',
    },
    {
        title: 'Payment success rate',
        weight: '15%',
        caption: "Share of today's payment attempts that captured successfully.",
    },
    {
        title: 'App version currency',
        weight: '5%',
        caption: 'Share of stations running the current POS build.',
    },
    {
        title: 'Not yet measured',
        weight: '20%',
        caption: 'Reserved for issue volume and support load. Currently a fixed value for every merchant, so it cannot separate one merchant from another.',
    },
]

/** Declared once and shared with `HealthGrid`; these unions were previously
 *  spelled out in both places and had already drifted apart. */
type HealthFilter = 'all' | 'needs-attention' | 'critical' | 'unscored'
type HealthSort = 'score' | 'revenue' | 'orders' | 'activity' | 'name'

/**
 * The view this page opens on.
 *
 * "Critical" rather than "All": abandoned signups dominate the raw list — on
 * the current platform 11 of 20 merchants have no locations, staff or devices,
 * mostly duplicate orgs from retried registrations — so opening on everything
 * buries the merchants that actually need action. Every other chip carries its
 * count, so what is filtered out is advertised rather than concealed, and one
 * tap reaches it.
 */
const DEFAULT_HEALTH_FILTER: HealthFilter = 'critical'

/**
 * Mobile order is fixed to worst-first.
 *
 * The sort control is desktop-only, so without pinning this a user who picked
 * "Alphabetical" on a laptop and then narrowed the window would be stuck with
 * it and no way back. Phones resolve the sort here instead of reading state
 * they cannot change.
 */
const MOBILE_HEALTH_SORT: HealthSort = 'score'

/**
 * The single definition of which merchants a filter selects.
 *
 * Both the filter chips' counts and the list itself run through this, because
 * a count derived separately from the filter is a count that will eventually
 * disagree with the list under it — and a severity chip reading "Critical 12"
 * above eleven rows destroys exactly the trust this screen needs.
 */
function matchesHealthFilter(
    merchant: MerchantHealthSummary,
    filter: HealthFilter
): boolean {
    const score = merchant.healthScore
    if (filter === 'unscored') return score === null
    // Unscored merchants are excluded from every filter but "All". Relying on
    // `null < 60` being false would not be enough: an admin asking which
    // merchants need intervention is not asking about one that was never set
    // up.
    if (score === null) return filter === 'all'
    if (filter === 'critical') return score < 60
    // Deliberately a band, not a superset. Without the lower bound this filter
    // also returned every critical merchant, so the two options overlapped and
    // neither count meant what it said.
    if (filter === 'needs-attention') return score >= 60 && score < 80
    return true
}

const FILTER_CHIPS: { value: HealthFilter; label: string; tone?: typeof HEALTH_TONE[keyof typeof HEALTH_TONE] }[] = [
    { value: 'critical', label: 'Critical', tone: HEALTH_TONE.red },
    { value: 'needs-attention', label: 'Needs attention', tone: HEALTH_TONE.yellow },
    { value: 'unscored', label: 'Not set up', tone: HEALTH_TONE.unscored },
    { value: 'all', label: 'All' },
]

export function HealthDashboard() {
    const router = useRouter()
    const { userId } = useAuth()
    const { isSuperAdmin, isLoading: authLoading } = useAdminAuth()
    const [search, setSearch] = useState('')
    const [healthFilter, setHealthFilter] = useState<HealthFilter>(DEFAULT_HEALTH_FILTER)
    const [healthSort, setHealthSort] = useState<HealthSort>('score')
    // Matches the `md:` breakpoint the sort trigger is shown at, so the order
    // and the control that governs it appear and disappear together.
    const isMobile = useIsMobile()

    const debouncedSearch = useDebounce(search, 300)

    // Fetch accessible merchant IDs for non-super-admins
    const { data: merchantAccess, isLoading: accessLoading } = useAdminMerchantAccess(userId || '')

    const accessibleMerchantIds = isSuperAdmin
        ? undefined
        : merchantAccess?.map(access => access.merchantId)

    // `useAdminMerchantAccess` is disabled without a userId/session, and a
    // DISABLED TanStack query reports `isLoading: true` forever — it sits in
    // `pending` because it never fetches. Gating the skeleton on `accessLoading`
    // alone therefore left the page in a permanent loading state for any admin
    // whose access query never runs. Only trust the flag while the query is
    // actually enabled and its result is genuinely needed.
    const needsMerchantAccess = !authLoading && !isSuperAdmin && !!userId
    const isResolvingAccess = needsMerchantAccess && accessLoading

    const { data: healthData, isLoading: healthLoading, refetch } = useMerchantHealthGrid(
        accessibleMerchantIds
    )

    // The search-filtered set, shared by the chip counts and the list, so the
    // two can never disagree about how many merchants a severity contains.
    const searchMatched = (healthData ?? []).filter((m) =>
        m.name.toLowerCase().includes(debouncedSearch.toLowerCase())
    )

    return (
        <div className="min-w-0 space-y-6">
            <Panel>
                <PanelSection
                    icon={Activity}
                    label="Health Monitor"
                    caption="Monitor merchant performance and operational health across your platform"
                    // Desktop-only: on a phone this wrapped to two lines of
                    // chrome that restate the heading, above the controls and
                    // the list that the screen actually exists for.
                    captionClassName="hidden sm:block"
                    action={
                        <div className="flex shrink-0 items-center gap-2">
                            {/* The factor list was a permanent panel section
                                costing ~150px above the fold on every visit —
                                onboarding content in the space where the
                                merchant list should be. It is reference
                                material, read once, so it moves behind a
                                trigger. */}
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-9 rounded-full px-3 text-[0.8125rem] font-medium text-muted-foreground"
                                    >
                                        <Info className="mr-1.5 h-4 w-4" />
                                        How scoring works
                                    </Button>
                                </PopoverTrigger>
                                {/* Centred on the trigger rather than
                                    end-aligned: at phone width the sheet is
                                    nearly as wide as the viewport, so anchoring
                                    it to one edge pushed it off-centre against
                                    the screen with an uneven gutter. `center`
                                    plus `collisionPadding` keeps an even margin
                                    on both sides at every width.

                                    `rounded-2xl` over the base `rounded-md`:
                                    this is a full sheet of content, and the
                                    tighter default radius read as a square
                                    panel next to the card and chip radii
                                    elsewhere on the page. */}
                                <PopoverContent
                                    align="center"
                                    collisionPadding={16}
                                    className="max-h-[70vh] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl"
                                >
                                    {/* The bands, phone-only: they are hidden
                                        from the panel below `sm`, so without
                                        this they would be unreachable there. */}
                                    <div className="mb-4 sm:hidden">
                                        <p className="mb-2 text-sm font-medium">What the score means</p>
                                        <ul className="space-y-1.5">
                                            {SCORE_LEGEND.map(({ range, label, tone }) => (
                                                <li key={label} className="flex items-center gap-2 text-sm">
                                                    <span className={`w-12 shrink-0 font-semibold tabular-nums ${tone.text}`}>
                                                        {range}
                                                    </span>
                                                    <span className="min-w-0">{label}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                    <p className="mb-3 text-sm font-medium">How the health score is calculated</p>
                                    <ul className="space-y-2.5">
                                        {SCORE_FACTORS.map(({ title, weight, caption }) => (
                                            <li key={title} className="min-w-0">
                                                <div className="flex min-w-0 items-baseline justify-between gap-2">
                                                    <p className="min-w-0 text-sm font-medium">{title}</p>
                                                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                                                        {weight}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-muted-foreground">{caption}</p>
                                            </li>
                                        ))}
                                    </ul>
                                </PopoverContent>
                            </Popover>

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
                        </div>
                    }
                >
                    {/* The score legend is reference material, not status.
                        On a phone its four rows cost ~220px — the entire first
                        screen — to teach bands an admin learns once and then
                        reads off the coloured badges anyway. It stays from
                        `sm` up, where it costs one row and genuinely helps
                        scanning, and on a phone it folds into the same
                        "How scoring works" sheet as the factor list. */}
                    <div className="hidden min-w-0 grid-cols-1 gap-4 sm:grid sm:grid-cols-2 lg:grid-cols-4">
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

                {/* Filters sit in the same panel as the list they filter, rather
                    than in a card of their own. */}
                <PanelRow className="pb-6">
                    {/* The sort control is desktop-only. On a phone the list is
                        a short exception feed — two or three rows once the
                        chips have filtered it — where re-ordering is a rare
                        need that was costing a permanent control in the
                        tightest layout. Phones always get the fixed worst-first
                        order (`DEFAULT_HEALTH_SORT`), which is the ordering
                        that matters when the question is "what needs me now". */}
                    <div className="flex min-w-0 flex-row items-center gap-2 md:gap-3">
                        <div className="relative min-w-0 flex-1 md:max-w-sm">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
                            <Input
                                placeholder="Search merchants..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="h-9 pl-9 text-[0.8125rem]"
                            />
                        </div>

                        {/* Desktop filter dropdown, paired with the sort beside
                            it. The chip row below carries the same options on a
                            phone, where laying them flat costs nothing and
                            shows every count at once; on a desktop the row
                            competed with the sort control for the same band of
                            the panel, so here the options collapse into a
                            matching Select. The counts ride along in the item
                            labels, so choosing a filter still never means
                            guessing how many rows it holds. */}
                        <Select value={healthFilter} onValueChange={(value) => setHealthFilter(value as HealthFilter)}>
                            <SelectTrigger
                                className="hidden h-9 w-48 shrink-0 text-[0.8125rem] md:flex"
                                aria-label="Filter by health severity"
                            >
                                <SelectValue placeholder="Filter" />
                            </SelectTrigger>
                            <SelectContent>
                                {FILTER_CHIPS.map(({ value, label }) => (
                                    <SelectItem key={value} value={value}>
                                        {label} ({searchMatched.filter((m) => matchesHealthFilter(m, value)).length})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Select value={healthSort} onValueChange={(value) => setHealthSort(value as typeof healthSort)}>
                            <SelectTrigger
                                className="hidden h-9 w-44 shrink-0 text-[0.8125rem] md:flex"
                                aria-label="Sort merchants"
                            >
                                <SelectValue placeholder="Sort by" />
                            </SelectTrigger>
                            <SelectContent>
                                {/* Names the direction: the sort is ascending,
                                    and "Health Score" alone left an admin
                                    guessing which end of the list was urgent. */}
                                <SelectItem value="score">Lowest health score</SelectItem>
                                <SelectItem value="revenue">Revenue</SelectItem>
                                <SelectItem value="orders">Orders</SelectItem>
                                <SelectItem value="activity">Last Activity</SelectItem>
                                <SelectItem value="name">Alphabetical</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Severity chips — phone only; the desktop equivalent is
                        the Select above. On a phone the chips are the fastest
                        read on the page: "how bad is it right now" answered
                        before the list is scanned at all, with every count
                        visible at once and no tap required.

                        Counts come from `matchesHealthFilter`, the same
                        predicate the list uses, so a chip can never disagree
                        with the rows beneath it. They count the search-filtered
                        set, so narrowing the search narrows the counts too
                        rather than promising rows the search has excluded. */}
                    <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2 md:hidden" role="group" aria-label="Filter by health severity">
                        {FILTER_CHIPS.map(({ value, label, tone }) => {
                            const count = searchMatched.filter((m) => matchesHealthFilter(m, value)).length
                            const isActive = healthFilter === value
                            return (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => setHealthFilter(value)}
                                    aria-pressed={isActive}
                                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-[0.8125rem] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                                        isActive
                                            ? 'border-foreground/20 bg-muted'
                                            : 'border-transparent bg-muted/40 hover:bg-muted/70'
                                    }`}
                                >
                                    <span className={tone ? tone.text : undefined}>{label}</span>
                                    <span className="tabular-nums text-muted-foreground">{count}</span>
                                </button>
                            )
                        })}
                    </div>
                </PanelRow>
            </Panel>

            {/* Content */}
            {authLoading || isResolvingAccess || healthLoading ? (
                <HealthGridSkeleton />
            ) : healthData && healthData.length > 0 ? (
                <HealthGrid
                    merchants={healthData}
                    filter={healthFilter}
                    sortBy={isMobile ? MOBILE_HEALTH_SORT : healthSort}
                    search={debouncedSearch}
                    onMerchantClick={(clerkOrgId) =>
                        router.push(`/manage/merchants/${clerkOrgId}`)
                    }
                />
            ) : (
                <div className="py-12 text-center">
                    <p className="text-muted-foreground">No merchants found.</p>
                </div>
            )}
        </div>
    )
}

/**
 * Loading state for the health grid.
 *
 * Shaped per breakpoint, because `HealthRow` is: the 64px score disc, the
 * score bar, the second alert line and the 4-up stats grid are all `sm:`-only.
 * A single desktop-shaped skeleton therefore promised a phone a tall card with
 * a big avatar circle and four stat blocks, then collapsed to a short one —
 * the layout shift the skeleton exists to prevent. Each breakpoint's blocks
 * are rendered and hidden by CSS rather than picked in JS, so there is no
 * hydration mismatch and no resize listener.
 */
function HealthGridSkeleton() {
    return (
        <div className="flex min-w-0 flex-col gap-3">
            {[...Array(5)].map((_, i) => (
                <Panel key={i} padded>
                    <div className="flex min-w-0 flex-col gap-3">
                        <div className="flex min-w-0 items-start gap-4">
                            {/* Mirrors the disc's `hidden sm:flex`. */}
                            <Skeleton className="hidden h-16 w-16 shrink-0 rounded-full sm:block" />
                            <div className="min-w-0 flex-1 space-y-2">
                                {/* Name + the phone-only score pill. The word
                                    badge that used to sit between them is gone
                                    from the real card, so it is gone here. */}
                                <div className="flex min-w-0 items-center gap-2">
                                    <Skeleton className="h-5 w-40 max-w-[60%]" />
                                    <Skeleton className="h-5 w-8 shrink-0 rounded-full sm:hidden" />
                                </div>
                                <Skeleton className="h-4 w-24 max-w-[40%]" />
                                <Skeleton className="mt-2 hidden h-2 w-full rounded-full sm:block" />
                            </div>
                        </div>

                        {/* Alerts: one line on a phone, two from `sm` up. */}
                        <div className="flex min-w-0 flex-col gap-1 sm:pl-20">
                            <Skeleton className="h-4 w-52 max-w-[80%]" />
                            <Skeleton className="hidden h-4 w-44 max-w-[70%] sm:block" />
                        </div>

                        {/* Phone: the single wrapping `label value` line. */}
                        <div className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1 sm:hidden">
                            <Skeleton className="h-4 w-24" />
                            <Skeleton className="h-3 w-28 basis-full" />
                        </div>

                        {/* sm+: the 2-up / 3-up stats grid, sharing the real
                            card's `sm:pl-20` indent so the loading state does
                            not shift left when the data arrives. */}
                        <div className="hidden min-w-0 grid-cols-2 gap-3 sm:grid sm:pl-20 md:grid-cols-3">
                            {[...Array(3)].map((_, j) => (
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
    filter: HealthFilter
    sortBy: HealthSort
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

    // Apply health filter via the shared predicate — see `matchesHealthFilter`,
    // which the severity chips' counts also use.
    filtered = filtered.filter((m) => matchesHealthFilter(m, filter))

    // Apply sort
    filtered = [...filtered].sort((a, b) => {
        switch (sortBy) {
            case 'score':
                // Unscored last. `null - null` is NaN, and an inconsistent
                // comparator corrupts the order of the whole list, not just
                // the null rows.
                if (a.healthScore === null && b.healthScore === null) return 0
                if (a.healthScore === null) return 1
                if (b.healthScore === null) return -1
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
        // The page opens on "Critical", so the commonest empty state is the
        // good one: nothing is wrong right now. Reporting that as "no results"
        // reads like a broken filter and invites an admin to go hunting for a
        // problem that does not exist, so the all-clear is stated plainly and
        // only when it is actually true (no search narrowing it).
        const isAllClear = filter === 'critical' && search.trim() === ''

        return (
            <div className="py-12 text-center">
                <p className="text-muted-foreground">
                    {isAllClear
                        ? 'No merchants need attention right now.'
                        : 'No merchants match the selected filters.'}
                </p>
                {isAllClear && (
                    <p className="mt-1 text-sm text-muted-foreground">
                        Use the filters above to see every merchant.
                    </p>
                )}
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
    // Narrowed into a local rather than cast at each use site: a cast would
    // keep compiling if this ever became nullable again, which is exactly the
    // class of bug the null tier exists to prevent.
    const score = merchant.healthScore
    // An em dash, not a 0: zero is a score, and this merchant has none.
    const scoreDisplay = score === null ? '—' : score
    const scoreLabel =
        score === null
            ? `${merchant.name} is not set up yet — no health score`
            : `Health score ${score} of 100 — ${tone.label}`

    // Today's trading figures are only worth their line on a phone if the
    // merchant actually traded today. For the long tail of idle merchants
    // "Revenue $0 · Orders 0" is two stats that say the same nothing the
    // "No orders" timestamp already says, so the phone layout drops them and
    // keeps Locations, which describes the estate either way.
    const tradedToday = merchant.revenue_today > 0 || merchant.orders_today > 0

    /**
     * The shared left indent for every row below the header, from `sm` up.
     *
     * 80px clears the 64px score disc plus its 16px gap, putting the alerts,
     * stats and action row in one column under the merchant name. An unscored
     * merchant has no disc, so indenting its rows would push them past empty
     * space — they align to the card edge instead, like their name does.
     */
    const contentIndent = score === null ? '' : 'sm:pl-20'

    return (
        // `group/row` + a stretched overlay button, rather than wrapping the
        // whole card in a <button>.
        //
        // The card needed real actions inside it ("View devices"), and a
        // <button> cannot legally contain another button — browsers hoist the
        // inner one out, which breaks both the layout and the click target.
        // The overlay keeps one big primary hit area and one tab stop for
        // "open this merchant", while the action buttons sit above it in the
        // stacking order with their own tab stops.
        <div className="group/row relative min-w-0 rounded-3xl border bg-card p-5 transition-colors focus-within:ring-2 focus-within:ring-ring hover:bg-muted/40">
            {/* The primary target, layered *above* the content (`z-10`) so it
                catches clicks on the card body without the content needing
                `pointer-events-none` — which would have killed text selection
                across the whole card. The action buttons then sit above this
                again at `z-20`. */}
            <button
                type="button"
                onClick={onClick}
                className="absolute inset-0 z-10 h-full w-full rounded-3xl focus:outline-none"
            >
                <span className="sr-only">Open {merchant.name}</span>
            </button>

            <div className="relative flex min-w-0 flex-col gap-3">
                {/* Top Row: Score, Name, Type */}
                <div className="flex min-w-0 items-start gap-4">
                    {/* The 64px score disc is a phone's whole left quarter, and
                        it indents every line beside it. Below `sm` the score
                        rides inline next to the status instead (see the name
                        row); from `sm` up there is room for the disc. */}
                    {score !== null && (
                        <div
                            className={`hidden h-16 w-16 shrink-0 items-center justify-center rounded-full bg-muted/60 text-2xl font-bold tabular-nums sm:flex ${tone.text}`}
                            role="img"
                            aria-label={scoreLabel}
                        >
                            <span aria-hidden="true">{scoreDisplay}</span>
                        </div>
                    )}

                    <div className="min-w-0 flex-1">
                        {/* The status group is one flex item, so a long
                            merchant name cannot wrap the score pill onto a
                            line by itself.

                            The name wraps to a second line rather than
                            truncating: "Appflow Studio C…" and "Appflow Studio
                            Cafe 2" are different merchants that an ellipsis
                            renders identical, which on a screen whose job is
                            telling merchants apart is a real failure. Capped
                            at two lines so one pathological name cannot push
                            the alerts off the card. */}
                        <div className="mb-1 flex min-w-0 items-start gap-2">
                            <h3 className="line-clamp-2 min-w-0 flex-1 font-semibold sm:line-clamp-none sm:truncate">
                                {merchant.name}
                            </h3>
                            {/* The number alone carries the severity — the word
                                badge beside it ("Critical 48") said the same
                                thing twice, and the colour already encodes the
                                band. Phone-only: from `sm` up the 64px disc
                                shows the score, and this would be a second copy
                                of it on the same row.

                                Omitted entirely when there is no score. An
                                unscored merchant has no number to show, and an
                                em-dash pill would be a status chip asserting
                                the absence of status — the "nothing to
                                monitor" line already says it in words. */}
                            {score !== null && (
                                <span
                                    className={`inline-flex shrink-0 items-center rounded-full bg-muted/60 px-2 py-0.5 text-xs font-bold tabular-nums sm:hidden ${tone.text}`}
                                    role="img"
                                    aria-label={scoreLabel}
                                >
                                    <span aria-hidden="true">{scoreDisplay}</span>
                                </span>
                            )}
                        </div>

                        {/* Merchant type is hidden on phones. "Llc", "Cafe",
                            "Restaurant" never change what an admin does about
                            an offline station, and the line cost every card a
                            row in the screen's tightest layout. It stays from
                            `sm` up, where the space is free. */}
                        {merchant.type && (
                            <p className="hidden text-sm capitalize text-muted-foreground sm:block">
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
                        {/* An unscored merchant gets no bar at all rather than
                            a zero-width red one, which would read as the worst
                            possible score instead of the absence of one. */}
                        {score !== null && (
                            <div
                                className="mt-2 hidden h-2 overflow-hidden rounded-full bg-muted sm:block"
                                aria-hidden="true"
                            >
                                <div
                                    className={`h-full rounded-full transition-all duration-300 motion-reduce:transition-none ${tone.bar}`}
                                    /* Clamped both ways: an out-of-range score
                                       would otherwise render a bar wider than
                                       its track, or a negative width. */
                                    style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
                                />
                            </div>
                        )}
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
                    <div className={`flex min-w-0 flex-col gap-1 ${contentIndent}`}>
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
                        {/* The overflow count earns its line at `sm`+, where
                            there is room for it. On a phone it does not: the
                            whole card is a button that opens the full alert
                            list, so a line saying "there is more" spends a row
                            of a crowded card to duplicate the affordance.
                            Hiding it visually would also hide it from a screen
                            reader, so the count moves into the sr-only summary
                            below, which is breakpoint-independent. */}
                        {merchant.alerts.length > 2 && (
                            <p className="hidden text-xs text-muted-foreground sm:block">
                                +{merchant.alerts.length - 2} more issue{merchant.alerts.length - 2 !== 1 ? 's' : ''}
                            </p>
                        )}
                        {/* Announces the true total regardless of which
                            breakpoint's visible cutoff is in effect. */}
                        {merchant.alerts.length > 1 && (
                            <span className="sr-only">
                                {merchant.alerts.length} issues in total. Activate to see all.
                            </span>
                        )}
                    </div>
                ) : score === null ? (
                    /* The other half of the contradiction this dashboard
                       shipped with. A merchant with nothing provisioned has
                       no systems to be optimal, so claiming they are is the
                       single fastest way to teach an admin that the monitor
                       is not worth reading. Say what is actually true. */
                    <div className={`flex items-center gap-2 text-sm text-muted-foreground ${contentIndent}`}>
                        <Info className="h-4 w-4 shrink-0" />
                        <span>No locations, devices or staff yet — nothing to monitor</span>
                    </div>
                ) : (
                    <div className={`flex items-center gap-2 text-sm text-muted-foreground ${contentIndent}`}>
                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                        <span>All systems optimal</span>
                    </div>
                )}

                {/* Bottom Row: Stats.
                    Two structures, one per breakpoint. The stacked
                    label-over-value grid below reads fine in a wide 4-up row,
                    but at `grid-cols-2` on a phone it became four tall blocks
                    of mostly empty space — the desktop layout squeezed, not a
                    mobile one. Phones get a single wrapping line of
                    `label value` pairs instead, so the same four numbers cost
                    one or two lines rather than four blocks. */}
                {/* Suppressed entirely for an unscored merchant on a phone:
                    "Locations 0 · No orders" restates the "nothing to monitor"
                    line directly above it. Dropping it halves the height of
                    every setup-backlog card without losing a fact the card has
                    not already stated. */}
                <div
                    className={`min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1 text-sm sm:hidden ${
                        score === null ? 'hidden' : 'flex'
                    }`}
                >
                    <span className="text-muted-foreground">
                        Locations{' '}
                        <span className="font-semibold tabular-nums text-foreground">
                            {merchant.total_locations}
                        </span>
                    </span>
                    {tradedToday && (
                        <>
                            <span className="text-muted-foreground">
                                Revenue{' '}
                                <span className="font-semibold tabular-nums text-foreground">
                                    {formatCurrency(merchant.revenue_today)}
                                </span>
                            </span>
                            <span className="text-muted-foreground">
                                Orders{' '}
                                <span className="font-semibold tabular-nums text-foreground">
                                    {merchant.orders_today}
                                </span>
                            </span>
                        </>
                    )}
                    <span className="basis-full text-xs text-muted-foreground">
                        {merchant.last_order_at
                            ? formatDistanceToNow(new Date(merchant.last_order_at), {
                                addSuffix: true,
                            })
                            : 'No orders'}
                    </span>
                </div>

                {/* Three columns, not four: the device count is gone from both
                    layouts. It restated what the "N stations offline" alert
                    above already says — and says more usefully, because the
                    alert names the ones that need attention rather than the
                    total.

                    `sm:pl-20` matches the alerts, the score bar and the action
                    row, all of which clear the 64px score disc plus its 16px
                    gap. Without it the stats alone started at the card's left
                    edge, breaking the single text column every other row in
                    the card lines up to and leaving the numbers floating under
                    the disc. */}
                <div className={`hidden min-w-0 grid-cols-2 gap-3 sm:grid md:grid-cols-3 ${contentIndent}`}>
                    <div className="min-w-0 text-sm">
                        <p className="mb-0.5 text-xs text-muted-foreground">Locations</p>
                        <p className="font-semibold tabular-nums">{merchant.total_locations}</p>
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

                {/* Row action — desktop only, and centred.
                    "Open merchant" is the card's own tap target, so on a phone
                    it is a button duplicating the surface it sits on: pure
                    redundancy in the tightest layout. From `sm` up a pointer
                    user benefits from an explicit affordance.

                    The devices shortcut that used to sit beside it is gone.
                    Besides crowding the card, it disagreed with the alert
                    above it — the alert counts stations without a recent
                    heartbeat while the button counted stations flagged
                    offline, so the same card read "5 stations offline" next to
                    "View 3 offline devices". One number per fact; the alert
                    keeps it.

                    `z-20` lifts this above the stretched overlay button
                    (`z-10`) so it receives the click instead of it. */}
                <div className="relative z-20 hidden min-w-0 items-center justify-center gap-2 pt-1 sm:flex">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 rounded-full px-3 text-xs font-medium text-muted-foreground"
                        onClick={onClick}
                    >
                        Open merchant
                    </Button>
                </div>
            </div>
        </div>
    )
}
