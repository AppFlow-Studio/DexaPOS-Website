'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageShell } from '@/components/dashboard/shell/PageShell'
import { PageHeader } from '@/components/dashboard/shell/PageHeader'
import { Panel } from '@/components/dashboard/shell/Panel'
import { PanelSection } from '@/components/dashboard/shell/PanelSection'
import { StatRow, StatTile } from '@/components/dashboard/shell/StatTile'
import { AnalyticsTooltip, CHART_MARGIN, valueAxisWidthMobile } from '@/app/manage/components/analytics-primitives'
import {
    BarChart3,
    DollarSign,
    Users,
    CreditCard,
    Activity,
    ArrowUpRight,
    ArrowDownRight,
    Crown,
    ShieldAlert,
    ShieldCheck,
    ShieldMinus,
    ArrowUpDown,
    User,
    Minus,
    Building2,
    BarChart2,
    MapPin,
    Utensils,
    Cpu,
    Globe,
} from 'lucide-react'
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from 'recharts'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useIsMobile } from '@/hooks/use-mobile'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { ChartContainer, ChartTooltip } from '@/components/ui/chart'
import {
    useGPVConcentration,
    useChurnWarnings,
    usePlatformKPIs,
    usePlatformSalesTrend,
} from '@/lib/queries/use-platform-analytics'
import type { ConcentrationRisk } from '../actions/hq-platform/analytics'
import { ChurnRadar } from './components/ChurnRadar'
import DeviceStabilityIndex from './components/DeviceStabilityIndex'
import TerminalUtilizationHeatmap, { UtilizationDistribution } from './components/TerminalUtilizationHeatmap'
import { FleetHealthDashboard } from './components/FleetHealthDashboard'
import { PaymentTerminalHealthMonitor } from './components/PaymentTerminalHealthMonitor'
import { MerchantOnboardingFunnel } from './components/MerchantOnboardingFunnel'
import { MerchantActivationTimeline } from './components/MerchantActivationTimeline'
import { PaymentMethodMix } from './components/PaymentMethodMix'
import { VoidRefundIntelligence } from './components/VoidRefundIntelligence'
import { DiscountAbuseDetection } from './components/DiscountAbuseDetection'
import { StaffLaborAnalytics } from './components/StaffLaborAnalytics'
import { KDSPerformance } from './components/KDSPerformance'
import { AuditLogActivityMonitor } from './components/AuditLogActivityMonitor'
import { OrderTypeIntelligence } from './components/OrderTypeIntelligence'
import { MultiLocationComparison } from './components/MultiLocationComparison'
import { LocationDensityInsights } from './components/LocationDensityInsights'
import Link from 'next/link'

// ── Chart config ──────────────────────────────────────────────────────────────

const whaleChartConfig = {
    gpvConcentration: { label: 'GPV Concentration', color: 'var(--chart-3)' },
    equalLine: { label: 'Perfect Equality', color: 'var(--muted-foreground)' },
}

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtGPV(n: number) {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`
    return `$${n.toFixed(2)}`
}

/**
 * Below this many merchants with sales, "top 10% share" and a risk level are
 * artefacts of the sample (at n=2 the top decile is 0.2 of a merchant), so
 * Whale Watch shows "not enough data" instead of a verdict.
 */
const MIN_CONCENTRATION_MERCHANTS = 10

// ── Tab pill ──────────────────────────────────────────────────────────────────

/**
 * `TAB_PILL` (DS-CTL-05), written out as a literal.
 *
 * ⚠️ Deliberately not imported from `components/dashboard/shell/tokens.ts`:
 * Tailwind does not scan `.ts` files, so a class reaching a `.tsx` element only
 * via a `.ts` module gets no CSS rule and renders unstyled (C7).
 */
const TAB_PILL_CLASS =
    'shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border'

// ── Tab label helper ──────────────────────────────────────────────────────────

function TabLabel({
    icon: Icon, label, badge,
}: { icon: React.ElementType; label: string; badge?: number }) {
    return (
        <span className="flex items-center gap-1.5">
            <Icon className="h-3.5 w-3.5" />
            <span>{label}</span>
            {badge !== undefined && badge > 0 && (
                <span className="ml-0.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-1.5 py-0 leading-4 min-w-4.5 text-center">
                    {badge}
                </span>
            )}
        </span>
    )
}

// ── Section divider ───────────────────────────────────────────────────────────

/**
 * A section heading above a group of panels.
 *
 * No rule beneath it: §5.5 bans horizontal lines as dividers — separation is
 * carried by spacing and the panel surfaces below.
 */
function SectionHeader({ title, description }: { title: string; description?: string }) {
    return (
        <div className="mb-5">
            <h2 className="text-base font-semibold">{title}</h2>
            {description && <p className="text-sm text-muted-foreground mt-0.5 max-md:hidden">{description}</p>}
        </div>
    )
}

// ============================================================================
// PAGE
// ============================================================================

export default function AnalyticsPage() {
    const [revenueDays, setRevenueDays] = useState<number>(30)
    const [whaleSortKey, setWhaleSortKey] = useState<'monthlyGPV' | 'percentOfTotal' | 'trend'>('monthlyGPV')
    const [whaleSortDir, setWhaleSortDir] = useState<'asc' | 'desc'>('desc')
    const [chartMetric, setChartMetric] = useState<'revenue' | 'orders'>('revenue')
    // Terminal Utilization's range, lifted here because its distribution chart
    // renders beside the Device Stability chart, outside that component.
    const [terminalDays, setTerminalDays] = useState<number>(30)

    const [activeTab, setActiveTab] = useState('overview')
    const isMobile = useIsMobile()
    const tabRailRef = useRef<HTMLDivElement>(null)

    /**
     * Keeps the selected tab pill within the scrolled rail.
     *
     * Scrolls the rail itself rather than calling `scrollIntoView` on the pill:
     * that walks up to every scrollable ancestor, so on a phone it also drags
     * the page vertically to bring the rail to the top of the viewport — the
     * tab content jumps under your thumb just as you tap. Setting `scrollLeft`
     * moves only this element, on the horizontal axis.
     */
    useEffect(() => {
        const rail = tabRailRef.current
        if (!rail) return
        const pill = rail.querySelector<HTMLElement>(`[data-state="active"]`)
        if (!pill) return

        // Centre the pill when it can be centred; otherwise sit flush at the
        // edge, so the first and last tabs don't leave a dead gap beside them.
        const target = pill.offsetLeft - (rail.clientWidth - pill.offsetWidth) / 2
        const max = rail.scrollWidth - rail.clientWidth
        const left = Math.max(0, Math.min(target, max))
        if (Math.abs(left - rail.scrollLeft) < 1) return

        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        rail.scrollTo({ left, behavior: reduceMotion ? 'auto' : 'smooth' })
    }, [activeTab])

    function handleExportPDF() {
        const title = document.title
        document.title = `DexaPOS Analytics Report — ${new Date().toLocaleDateString()}`
        window.print()
        document.title = title
    }

    const { data: gpvData, isLoading: gpvLoading } = useGPVConcentration(revenueDays)
    const { data: churnData, isLoading: churnLoading } = useChurnWarnings()
    const { data: kpiData, isLoading: kpiLoading } = usePlatformKPIs()
    const { data: salesTrend, isLoading: salesTrendLoading } = usePlatformSalesTrend()

    /**
     * Returns inline content, not a block: `StatTile`'s `meta` already renders a
     * `<p>`, and nesting one inside another is invalid HTML the browser silently
     * unnests — which breaks the tile's layout.
     */
    function fmtTrend(change: number | undefined) {
        if (change === undefined || change === null) return undefined
        return `${change >= 0 ? '+' : ''}${change.toFixed(1)}% from prior period`
    }

    // Label + icon only: §14.3 HQ-2 keeps severity colour to `/manage/health`
    // and the DLQ, so the tier is carried by the words and the shield glyph.
    const riskConfig: Record<ConcentrationRisk, { label: string; icon: typeof ShieldCheck }> = {
        low: { label: 'Low Risk', icon: ShieldCheck },
        medium: { label: 'Medium Risk', icon: ShieldMinus },
        high: { label: 'High Risk', icon: ShieldAlert },
    }

    const currentRisk = gpvData ? riskConfig[gpvData.riskLevel] : null
    const hasConcentrationSample = (gpvData?.totalMerchants ?? 0) >= MIN_CONCENTRATION_MERCHANTS
    const topDecileCount = Math.max(1, Math.ceil((gpvData?.totalMerchants ?? 0) * 0.1))

    const sortedWhaleList = useMemo(() => {
        if (!gpvData?.whaleList) return []
        return [...gpvData.whaleList].sort((a, b) => {
            const aVal = a[whaleSortKey] ?? 0
            const bVal = b[whaleSortKey] ?? 0
            return whaleSortDir === 'desc' ? Number(bVal) - Number(aVal) : Number(aVal) - Number(bVal)
        })
    }, [gpvData?.whaleList, whaleSortKey, whaleSortDir])

    const handleWhaleSort = (key: typeof whaleSortKey) => {
        if (whaleSortKey === key) setWhaleSortDir(prev => prev === 'desc' ? 'asc' : 'desc')
        else { setWhaleSortKey(key); setWhaleSortDir('desc') }
    }

    /** A sortable column header — ghost pill, never bare text (§5.2). */
    const whaleSortHeader = (key: typeof whaleSortKey, label: string) => (
        <Button
            variant="ghost"
            onClick={() => handleWhaleSort(key)}
            className="-mr-2 ml-auto flex h-8 rounded-full px-2"
        >
            {label}
            <ArrowUpDown className="ml-2 h-3 w-3" />
        </Button>
    )


    /** Platform totals, in reading order: GPV, merchants, orders, AOV, devices, locations. */
    const platformTiles = [
        <StatTile
            key="gpv"
            label="Total GPV (30d)"
            icon={<DollarSign />}
            isLoading={kpiLoading}
            value={kpiData ? fmtGPV(kpiData.totalGPV30d) : '—'}
            meta={fmtTrend(kpiData?.gpvChange)}
            metaClassName="max-md:hidden"
        />,
        <StatTile
            key="activeMerchants"
            label="Active Merchants (7d)"
            icon={<Users />}
            isLoading={kpiLoading}
            value={kpiData?.activeMerchants7d.toLocaleString() ?? '—'}
            meta={kpiData ? `${kpiData.totalMerchants.toLocaleString()} total` : undefined}
            metaClassName="max-md:hidden"
        />,
        <StatTile
            key="orders"
            label="Total Orders (30d)"
            icon={<CreditCard />}
            isLoading={kpiLoading}
            value={kpiData?.totalOrders30d.toLocaleString() ?? '—'}
            meta={fmtTrend(kpiData?.ordersChange)}
            metaClassName="max-md:hidden"
        />,
        <StatTile
            key="aov"
            label="Avg Order Value (30d)"
            icon={<Activity />}
            isLoading={kpiLoading}
            value={kpiData?.avgOrderValue ? `$${kpiData.avgOrderValue.toFixed(2)}` : '—'}
            meta={kpiData ? `Across ${kpiData.totalOrders30d.toLocaleString()} orders` : undefined}
            metaClassName="max-md:hidden"
        />,
        <StatTile
            key="devices"
            label="Devices Online"
            icon={<Cpu />}
            isLoading={kpiLoading}
            value={kpiData?.activeDevices?.toLocaleString() ?? '—'}
            meta={kpiData ? `of ${kpiData.totalDevices.toLocaleString()} deployed` : undefined}
            metaClassName="max-md:hidden"
        />,
        <StatTile
            key="locations"
            label="Active Locations"
            icon={<MapPin />}
            isLoading={kpiLoading}
            value={kpiData?.totalLocations?.toLocaleString() ?? '—'}
            meta={kpiData ? `Across ${kpiData.merchantsWithLocations.toLocaleString()} merchants` : undefined}
            metaClassName="max-md:hidden"
        />
    ]

    return (
        <PageShell as="div">
            <style>{`
        @media print {
          /* Hide navigation, sidebar, header, and action buttons */
          nav, aside, header, footer,
          [data-sidebar], [data-nav],
          .no-print { display: none !important; }
          /* Expand main content to full width */
          main, [role="main"] { width: 100% !important; margin: 0 !important; padding: 0 !important; }
          /* Remove shadows and borders that look bad on paper */
          .shadow, .shadow-sm, .shadow-md { box-shadow: none !important; }
          /* Prevent cards from splitting across pages */
          .card, [class*="rounded"] { break-inside: avoid; page-break-inside: avoid; }
          /* Show all tab content, not just active tab */
          [role="tabpanel"][data-state="inactive"] { display: block !important; }
          /* Force white background */
          body, * { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

            <PageHeader
                title="Analytics"
                subtitle="Platform-wide intelligence across all merchants, devices, and channels"
                subtitleClassName="max-md:hidden"
                actions={
                    <div className="no-print">
                        <Button variant="outline" size="sm" onClick={handleExportPDF}>
                            Export Report
                        </Button>
                    </div>
                }
            />

            {/* ══════════════════════════════════════════════════════════════════════
          PERSISTENT KPI HEADER — always visible above tabs
      ══════════════════════════════════════════════════════════════════════ */}
            {/* Six figures, so two 3-up `StatRow`s rather than one row: `StatRow`
                tops out at four columns, and six tiles on one line are unreadably
                narrow on anything short of a wide desktop. */}
            <Panel>
                <PanelSection label="Platform totals" icon={BarChart3}>
                    {isMobile ? (
                        // Phones lay the six out two-up, so Devices Online is
                        // pulled up beside Total Orders instead of leaving
                        // Orders alone on its row.
                        <StatRow columns={3}>
                            {[0, 1, 2, 4, 3, 5].map(i => platformTiles[i])}
                        </StatRow>
                    ) : (
                        <div className="space-y-6">
                            <StatRow columns={3}>{platformTiles.slice(0, 3)}</StatRow>
                            <StatRow columns={3}>{platformTiles.slice(3)}</StatRow>
                        </div>
                    )}
                </PanelSection>
            </Panel>

            {/* ══════════════════════════════════════════════════════════════════════
          6-TAB ANALYTICS SUITE
      ══════════════════════════════════════════════════════════════════════ */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">

                {/* Tab bar — DS-CTL-05. Scrolls rather than wraps: six labelled
                    triggers do not fit a phone, and a wrapped rail reads as two
                    rows of unrelated controls. The rail keeps the active pill in
                    view itself (see `tabRailRef`), so the scrollbar is hidden —
                    it would otherwise sit under the pills as a stray grey line. */}
                <div ref={tabRailRef} className="no-scrollbar w-full min-w-0 overflow-x-auto pb-1">
                    <TabsList className="inline-flex h-auto w-max flex-nowrap gap-0.5 rounded-full bg-muted/70 p-1">
                        <TabsTrigger value="overview" className={TAB_PILL_CLASS}>
                            <TabLabel icon={BarChart3} label="Overview" />
                        </TabsTrigger>
                        <TabsTrigger value="revenue" className={TAB_PILL_CLASS}>
                            <TabLabel icon={DollarSign} label="Revenue & Risk" badge={churnData?.totalAtRisk || undefined} />
                        </TabsTrigger>
                        <TabsTrigger value="merchants" className={TAB_PILL_CLASS}>
                            <TabLabel icon={Building2} label="Merchant Health" />
                        </TabsTrigger>
                        <TabsTrigger value="operations" className={TAB_PILL_CLASS}>
                            <TabLabel icon={Utensils} label="Operations" />
                        </TabsTrigger>
                        <TabsTrigger value="fleet" className={TAB_PILL_CLASS}>
                            <TabLabel icon={Cpu} label="Device Fleet" />
                        </TabsTrigger>
                        <TabsTrigger value="growth" className={TAB_PILL_CLASS}>
                            <TabLabel icon={Globe} label="Growth" />
                        </TabsTrigger>
                    </TabsList>
                </div>

                {/* ══════════════════════════════════════════════════════════════════
            TAB 1 — OVERVIEW
            Extended KPIs + Sales Trend + Whale Watch (GPV Concentration)
        ══════════════════════════════════════════════════════════════════ */}
                <TabsContent value="overview" className="space-y-6">

                    <Panel>
                        <PanelSection label="Platform ratios" icon={BarChart2}>
                            <StatRow columns={4}>
                                {[
                                    { label: 'Void Rate', value: kpiData?.voidRate, suffix: '%', meta: 'Of orders, last 30 days' },
                                    { label: 'New Merchants', value: kpiData?.newMerchantsThisMonth, suffix: '', meta: 'This month' },
                                    { label: 'Onboarding', value: kpiData?.merchantsOnboarding, suffix: '', meta: 'Merchants in progress' },
                                    {
                                        label: 'Card Split',
                                        value: kpiData?.cardPercent,
                                        suffix: '%',
                                        meta: kpiData ? `${kpiData.cashPercent}% cash · 30d volume` : undefined,
                                    },
                                ].map(({ label, value, suffix, meta }) => (
                                    <StatTile
                                        key={label}
                                        label={label}
                                        isLoading={kpiLoading}
                                        value={value !== undefined ? `${value}${suffix}` : '—'}
                                        meta={meta}
                                        metaClassName="max-md:hidden"
                                    />
                                ))}
                            </StatRow>
                        </PanelSection>
                    </Panel>

                    <Panel>
                        <PanelSection
                            label="GPV trend (last 30 days)"
                            caption="Daily Gross Payment Volume with prior period overlay"
                            captionClassName="max-md:hidden"
                            action={
                                <div className="flex shrink-0 gap-1 p-0.5">
                                    <Button size="sm" variant={chartMetric === 'revenue' ? 'default' : 'ghost'} className="h-7 rounded-full px-3 text-xs" onClick={() => setChartMetric('revenue')}>GPV</Button>
                                    <Button size="sm" variant={chartMetric === 'orders' ? 'default' : 'ghost'} className="h-7 rounded-full px-3 text-xs" onClick={() => setChartMetric('orders')}>Order Count</Button>
                                </div>
                            }
                        >
                            {salesTrendLoading ? (
                                <Skeleton className="h-72 w-full" />
                            ) : salesTrend && salesTrend.length > 0 ? (
                                <ResponsiveContainer width="100%" height={300}>
                                    <AreaChart data={salesTrend} margin={CHART_MARGIN}>
                                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                        <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={d => d.slice(5)} />
                                        <YAxis
                                            tick={{ fontSize: 11 }}
                                            width={isMobile ? valueAxisWidthMobile(4) : undefined}
                                            tickFormatter={v => chartMetric === 'revenue' ? `$${(v / 1000).toFixed(0)}k` : String(v)}
                                        />
                                        <Tooltip
                                            content={
                                                <AnalyticsTooltip
                                                    formatter={(v: number) =>
                                                        chartMetric === 'revenue' ? `$${v.toLocaleString()}` : v.toLocaleString()
                                                    }
                                                />
                                            }
                                        />
                                        <Area type="monotone" dataKey={chartMetric === 'revenue' ? 'revenue' : 'orderCount'} name="Current" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.25} strokeWidth={2} />
                                        <Area type="monotone" dataKey={chartMetric === 'revenue' ? 'prevRevenue' : 'prevOrderCount'} name="Prior Period" stroke="var(--muted-foreground)" fill="transparent" strokeWidth={1.5} strokeDasharray="4 2" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">No sales data available</div>
                            )}
                        </PanelSection>
                    </Panel>

                    {/* Whale Watch lives in Revenue & Risk tab (T001) */}
                </TabsContent>

                {/* ══════════════════════════════════════════════════════════════════
            TAB 2 — REVENUE & RISK
            T001: Whale Watch  →  T002: Churn Warning  →  T008: Void & Refund  →  T007: Payment Mix  →  T018: Multi-Location
        ══════════════════════════════════════════════════════════════════ */}
                {/* On phones every panel caption and stat meta line on this tab
                    is dropped (via the shell's `data-slot` hooks) — the tab is
                    long, and the titles and figures carry it on their own. */}
                <TabsContent
                    value="revenue"
                    className="space-y-6 max-md:[&_[data-slot=panel-caption]]:hidden max-md:[&_[data-slot=stat-meta]]:hidden"
                >

                    {/* One period for every section on this tab — three pickers
                        that could disagree made the sections incomparable.
                        Churn is the exception: it is always 7 days vs 7 days. */}
                    <div className="flex items-center justify-start gap-2 md:justify-end">
                        <Select value={String(revenueDays)} onValueChange={v => setRevenueDays(Number(v))}>
                            <SelectTrigger aria-label="Period" className="h-9 w-36 shrink-0 rounded-full border-0 bg-muted/60 px-3 shadow-none">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="7">Last 7 days</SelectItem>
                                <SelectItem value="30">Last 30 days</SelectItem>
                                <SelectItem value="90">Last 90 days</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* ── T001: Whale Watch ─────────────────────────────────────────── */}
                    {/* No SectionHeaders on this tab: each panel's own title names
                        its section, and the pair read as a double heading. */}
                    <Panel>
                        <PanelSection
                            icon={Crown}
                            label="Whale Watch"
                            caption={`How concentrated GPV is across merchants · last ${revenueDays} days`}
                        >
                            <StatRow columns={4}>
                                <StatTile
                                    label="Total GPV"
                                    icon={<DollarSign />}
                                    isLoading={gpvLoading}
                                    value={`$${gpvData ? gpvData.totalGPV.toLocaleString() : '0'}`}
                                    meta={`Last ${revenueDays} days`}
                                />
                                <StatTile
                                    label="Merchants With Sales"
                                    icon={<Building2 />}
                                    isLoading={gpvLoading}
                                    value={gpvData?.totalMerchants.toLocaleString() || '0'}
                                    meta={gpvData && gpvData.totalMerchants > 0 ? `Median $${gpvData.medianGPV.toLocaleString()} each` : undefined}
                                />
                                <StatTile
                                    label="Top 10% GPV Share"
                                    icon={<BarChart3 />}
                                    isLoading={gpvLoading}
                                    value={hasConcentrationSample ? `${gpvData?.topTenPercentGPVShare}%` : '—'}
                                    meta={
                                        hasConcentrationSample
                                            ? `${topDecileCount} merchant${topDecileCount !== 1 ? 's' : ''} in top decile`
                                            : `Needs ${MIN_CONCENTRATION_MERCHANTS}+ merchants with sales`
                                    }
                                />
                                <StatTile
                                    label="Concentration Risk"
                                    icon={hasConcentrationSample && currentRisk ? <currentRisk.icon /> : <ShieldCheck />}
                                    isLoading={gpvLoading}
                                    value={hasConcentrationSample && currentRisk ? currentRisk.label.replace(' Risk', '') : '—'}
                                    meta={
                                        !hasConcentrationSample
                                            ? 'Not enough data yet'
                                            : gpvData?.riskLevel === 'high'
                                                ? 'Diversification needed'
                                                : gpvData?.riskLevel === 'medium'
                                                    ? 'Monitor closely'
                                                    : 'Healthy distribution'
                                    }
                                />
                            </StatRow>
                            {/* An empty whale list used to take half a row. At current
                                volume it's always empty, so it's one line here instead. */}
                            {!gpvLoading && gpvData && sortedWhaleList.length === 0 && (
                                <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground max-md:hidden">
                                    <Crown className="h-3.5 w-3.5 shrink-0" />
                                    No whale merchants (≥ {fmtGPV(gpvData.whaleThreshold)} GPV) in the last {revenueDays} days.
                                </p>
                            )}
                        </PanelSection>
                    </Panel>

                    {/* Lorenz Curve + Whale List — each only when it has something to show */}
                    {(gpvLoading || hasConcentrationSample || sortedWhaleList.length > 0) && (
                    <div className="grid gap-4 lg:grid-cols-7">
                        {(gpvLoading || hasConcentrationSample) && (
                        <Panel className={sortedWhaleList.length > 0 ? 'lg:col-span-4' : 'lg:col-span-7'}>
                            <PanelSection
                                label="GPV distribution"
                                caption="Lorenz curve — gap from diagonal indicates concentration"
                            >
                                {gpvLoading ? (
                                    <Skeleton className="h-80 w-full" />
                                ) : gpvData && hasConcentrationSample ? (
                                    <ChartContainer config={whaleChartConfig} className="h-80 w-full">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart data={gpvData.lorenzCurve}>
                                                <defs>
                                                    <linearGradient id="concentrationGap" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="0%" stopColor="var(--chart-3)" stopOpacity={0.3} />
                                                        <stop offset="100%" stopColor="var(--chart-3)" stopOpacity={0.05} />
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                                <XAxis dataKey="merchantPercentile" tickLine={false} axisLine={false} tickMargin={8} tickFormatter={val => `${val}%`} label={{ value: '% of Merchants (ranked by volume)', position: 'insideBottom', offset: -4, style: { fontSize: 11, fill: 'var(--muted-foreground)' } }} />
                                                <YAxis tickLine={false} axisLine={false} tickFormatter={val => `${val}%`} label={{ value: '% of Total GPV', angle: -90, position: 'insideLeft', offset: 10, style: { fontSize: 11, fill: 'var(--muted-foreground)' } }} />
                                                <ChartTooltip content={({ active, payload }) => {
                                                    if (active && payload && payload.length) {
                                                        const d = payload[0].payload
                                                        return (
                                                            <div className="bg-background border rounded-lg p-3 shadow-sm text-xs space-y-1">
                                                                <p className="font-medium">{d.merchantCount} of {gpvData.totalMerchants} merchants</p>
                                                                <p className="text-muted-foreground">Bottom <span className="font-bold text-foreground">{d.merchantPercentile}%</span> generate <span className="font-bold text-foreground">{d.gpvPercentile}%</span> of GPV</p>
                                                            </div>
                                                        )
                                                    }
                                                    return null
                                                }} />
                                                <Area type="linear" dataKey="equalityLine" stroke="var(--muted-foreground)" strokeDasharray="5 5" strokeOpacity={0.5} fill="none" strokeWidth={1.5} />
                                                {/* Linear: a Lorenz curve is piecewise-linear between
                                                    merchants; smoothing invented points between them. */}
                                                <Area type="linear" dataKey="gpvPercentile" stroke="var(--chart-3)" fill="url(#concentrationGap)" strokeWidth={2.5} />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    </ChartContainer>
                                ) : null}
                            </PanelSection>
                        </Panel>
                        )}

                        {(gpvLoading || sortedWhaleList.length > 0) && (
                        <Panel className={hasConcentrationSample || gpvLoading ? 'lg:col-span-3' : 'lg:col-span-7'}>
                            <PanelSection
                                label={`Whale merchants (≥ ${fmtGPV(gpvData?.whaleThreshold ?? 100_000)} GPV)`}
                                caption={`Last ${revenueDays} days — assign dedicated Account Managers`}
                            >
                                {gpvLoading ? (
                                    <div className="space-y-3">
                                        {Array.from({ length: 5 }).map((_, i) => (
                                            <div key={i} className="flex items-center justify-between">
                                                <Skeleton className="h-4 w-32" />
                                                <Skeleton className="h-4 w-20" />
                                            </div>
                                        ))}
                                    </div>
                                ) : sortedWhaleList.length > 0 ? (
                                    <div className="max-h-96 overflow-auto">
                                        <Table variant="data" className="min-w-[620px]">
                                            <TableHeader className="[&_tr]:border-0">
                                                <TableRow>
                                                    <TableHead>Merchant</TableHead>
                                                    <TableHead className="text-right">{whaleSortHeader('monthlyGPV', 'GPV')}</TableHead>
                                                    <TableHead className="text-right">{whaleSortHeader('percentOfTotal', '% Total')}</TableHead>
                                                    <TableHead className="text-right">Locs</TableHead>
                                                    <TableHead className="text-right">{whaleSortHeader('trend', 'Trend')}</TableHead>
                                                    <TableHead className="text-right">AM</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {sortedWhaleList.map(whale => (
                                                    <TableRow key={whale.id}>
                                                        <TableCell>
                                                            <Link href={`/manage/merchants/${whale.id}`} className="font-medium hover:underline">{whale.name}</Link>
                                                            <p className="text-xs tabular-nums text-muted-foreground">{whale.transactions.toLocaleString()} txns</p>
                                                        </TableCell>
                                                        <TableCell className="text-right font-medium tabular-nums">${whale.monthlyGPV.toLocaleString()}</TableCell>
                                                        <TableCell className="text-right tabular-nums text-muted-foreground">{whale.percentOfTotal}%</TableCell>
                                                        <TableCell className="text-right tabular-nums text-muted-foreground">{whale.locationCount}</TableCell>
                                                        <TableCell className="text-right">
                                                            {whale.trend !== null ? (
                                                                <span className={`flex items-center justify-end gap-0.5 text-xs font-medium tabular-nums ${whale.trend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                                    {whale.trend >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                                                                    {whale.trend > 0 ? '+' : ''}{whale.trend}%
                                                                </span>
                                                            ) : (
                                                                <span className="flex items-center justify-end gap-0.5 text-xs text-muted-foreground">
                                                                    <Minus className="h-3 w-3" /> New
                                                                </span>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            {whale.accountManager ? (
                                                                <span className="text-xs text-muted-foreground">{whale.accountManager}</span>
                                                            ) : (
                                                                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                                                    <User className="h-3 w-3" />Unassigned
                                                                </span>
                                                            )}
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                ) : null}
                                {sortedWhaleList.length > 0 && (
                                    <div className="mt-3 flex items-center justify-between pt-3 text-xs text-muted-foreground">
                                        <span>{sortedWhaleList.length} whale{sortedWhaleList.length !== 1 ? 's' : ''} identified</span>
                                        <span className="tabular-nums">Total GPV: ${gpvData?.totalGPV.toLocaleString()}</span>
                                    </div>
                                )}
                            </PanelSection>
                        </Panel>
                        )}
                    </div>
                    )}

                    {/* The old "Distribution summary" panel repeated Total GPV and the
                        merchant count from Whale Watch; its median now sits in the
                        Merchants tile's meta line. */}

                    {/* ── T002: Churn Radar ───────────────────────────────────────────── */}
                    <ChurnRadar data={churnData} isLoading={churnLoading} />

                    {/* ── T008: Void & Refund Intelligence ─────────────────────────── */}
                    <VoidRefundIntelligence days={revenueDays} />

                    {/* ── T007: Payment Method Mix ──────────────────────────────────── */}
                    <PaymentMethodMix days={revenueDays} />

                    {/* ── T018: Multi-Location Comparison ──────────────────────────── */}
                    <MultiLocationComparison days={revenueDays} />

                </TabsContent>

                {/* ══════════════════════════════════════════════════════════════════
            TAB 3 — MERCHANT HEALTH
            T006: Onboarding Funnel  →  T016: Activation Timeline
        ══════════════════════════════════════════════════════════════════ */}
                {/* Same phone treatment as Revenue & Risk: captions and stat
                    meta lines dropped. */}
                <TabsContent
                    value="merchants"
                    className="space-y-6 max-md:[&_[data-slot=panel-caption]]:hidden max-md:[&_[data-slot=stat-meta]]:hidden"
                >
                    {/* No SectionHeaders here: each panel's own title already
                        names its section, and the pair read as a double heading. */}
                    <MerchantOnboardingFunnel />
                    <MerchantActivationTimeline />
                </TabsContent>

                {/* ══════════════════════════════════════════════════════════════════
            TAB 4 — OPERATIONS
            T013: Order Type  →  T009: Discounts  →  T012: Staff  →  T014: KDS  →  T015: Audit
        ══════════════════════════════════════════════════════════════════ */}
                <TabsContent
                    value="operations"
                    className="space-y-6 max-md:[&_[data-slot=panel-caption]]:hidden max-md:[&_[data-slot=stat-meta]]:hidden"
                >
                    <SectionHeader
                        title="Order Type Intelligence"
                        description="Dine-in vs takeout vs delivery vs online — service channel breakdown and merchant mix"
                    />
                    <OrderTypeIntelligence />

                    <SectionHeader title="Discount Usage & Abuse Detection" description="Discount rates by merchant, staff leaderboard, and flagged accounts" />
                    <DiscountAbuseDetection />

                    <SectionHeader title="Staff & Session Analytics" description="Labor hours, efficiency ratios, peak staffing patterns, and session health across all merchants" />
                    <StaffLaborAnalytics />

                    <SectionHeader
                        title="KDS Performance & Kitchen Throughput"
                        description="Prep time distribution, slowest kitchens, and per-display throughput across all merchants"
                    />
                    <KDSPerformance />

                    {/* ── T015: Audit Log Activity Monitor ─────────────────────────── */}
                    <SectionHeader
                        title="Audit Log Activity"
                        description="Admin actions across all merchants and HQ in the last 30 days: severity, most active admins, and failed actions"
                    />
                    <AuditLogActivityMonitor />
                </TabsContent>

                {/* ══════════════════════════════════════════════════════════════════
            TAB 5 — DEVICE FLEET
            Device Stability Index + Terminal Utilization + Fleet Health
        ══════════════════════════════════════════════════════════════════ */}
                <TabsContent
                    value="fleet"
                    className="space-y-6 max-md:[&_[data-slot=panel-caption]]:hidden max-md:[&_[data-slot=stat-meta]]:hidden"
                >
                    <SectionHeader
                        title="Device Stability"
                        description="Offline heartbeats and kicked sessions, by app version"
                    />
                    <DeviceStabilityIndex besideChart={<UtilizationDistribution days={terminalDays} />} />

                    <SectionHeader
                        title="Terminal Utilization"
                        description="Underused tablets to reclaim or rebill"
                    />
                    <TerminalUtilizationHeatmap days={terminalDays} onDaysChange={setTerminalDays} />

                    <SectionHeader
                        title="Fleet Health"
                        description="Live status of every POS terminal, by merchant and location"
                    />
                    <FleetHealthDashboard />

                    <SectionHeader
                        title="Payment Terminals"
                        description="Dejavoo connectivity, settlement, and pairing"
                    />
                    <PaymentTerminalHealthMonitor />
                </TabsContent>

                {/* ══════════════════════════════════════════════════════════════════
            TAB 6 — GROWTH
            T017: Location Density & Geographic Insights
        ══════════════════════════════════════════════════════════════════ */}
                <TabsContent
                    value="growth"
                    className="space-y-6 max-md:[&_[data-slot=panel-caption]]:hidden max-md:[&_[data-slot=stat-meta]]:hidden"
                >
                    <SectionHeader
                        title="Location Density & Geographic Insights"
                        description="Where our merchants are concentrated — state and city breakdown, whitespace markets for sales expansion"
                    />
                    <LocationDensityInsights />
                </TabsContent>

            </Tabs>
        </PageShell>
    )
}
