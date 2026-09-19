'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageShell } from '@/components/dashboard/shell/PageShell'
import { PageHeader } from '@/components/dashboard/shell/PageHeader'
import { Panel } from '@/components/dashboard/shell/Panel'
import { PanelSection } from '@/components/dashboard/shell/PanelSection'
import { StatRow, StatTile } from '@/components/dashboard/shell/StatTile'
import { AnalyticsTooltip, CHART_MARGIN, VALUE_AXIS_WIDTH_MOBILE } from '@/app/manage/components/analytics-primitives'
import {
    BarChart3,
    TrendingDown,
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
    AlertTriangle,
    Building2,
    Siren,
    ExternalLink,
    Clock,
    Mail,
    BarChart2,
    MapPin,
    Utensils,
    Cpu,
    Globe,
    BellRing,
    CheckCircle2,
    Loader2,
    XCircle,
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
import {
    MobileColumnsButton,
    initialHiddenColumns,
    type ReportColumn,
} from '@/components/dashboard/reports/MobileColumnsButton'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { ChartContainer, ChartTooltip } from '@/components/ui/chart'
import {
    useGPVConcentration,
    useChurnWarnings,
    usePlatformKPIs,
    usePlatformSalesTrend,
} from '@/lib/queries/use-platform-analytics'
import { sendChurnSlackAlert } from '../actions/hq-platform/analytics'
import type { ConcentrationRisk, ChurnSeverity } from '../actions/hq-platform/analytics'
import DeviceStabilityIndex from './components/DeviceStabilityIndex'
import TerminalUtilizationHeatmap from './components/TerminalUtilizationHeatmap'
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
            {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
        </div>
    )
}

/**
 * Mobile column meta for the churn risk alert table.
 *
 * Merchant is locked (it is the row's identity) and Drop % is the reason the
 * row is on the list, so those two are the mobile default. The GPV pair, the
 * recency column and the action buttons are opt-in.
 */
const CHURN_RISK_COLUMNS: ReportColumn[] = [
    { id: 'merchant', label: 'Merchant', locked: true },
    { id: 'severity', label: 'Severity', defaultHidden: true },
    { id: 'prevGpv', label: 'Prev 7d GPV', defaultHidden: true },
    { id: 'lastGpv', label: 'Last 7d GPV', defaultHidden: true },
    { id: 'drop', label: 'Drop %' },
    { id: 'daysSince', label: 'Days Since Last Txn', defaultHidden: true },
    { id: 'actions', label: 'Actions', defaultHidden: true },
]

// ============================================================================
// PAGE
// ============================================================================

export default function AnalyticsPage() {
    const [whaleWatchDays, setWhaleWatchDays] = useState<number>(30)
    const [whaleSortKey, setWhaleSortKey] = useState<'monthlyGPV' | 'percentOfTotal' | 'trend'>('monthlyGPV')
    const [whaleSortDir, setWhaleSortDir] = useState<'asc' | 'desc'>('desc')
    const [chartMetric, setChartMetric] = useState<'revenue' | 'orders'>('revenue')

    const [activeTab, setActiveTab] = useState('overview')
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

    const isMobile = useIsMobile()
    const [churnHiddenCols, setChurnHiddenCols] = useState<Set<string>>(() =>
        initialHiddenColumns(CHURN_RISK_COLUMNS)
    )
    // Hiding is mobile-only: the picker itself is `md:hidden`, so desktop must
    // ignore the set rather than keep columns hidden with no way to restore them.
    const showChurnCol = (id: string) => !isMobile || !churnHiddenCols.has(id)

    type SlackState = { status: 'idle' | 'sending' | 'sent' | 'error' | 'no_webhook' | 'no_critical'; message?: string }
    const [slackAlert, setSlackAlert] = useState<SlackState>({ status: 'idle' })

    async function handleSlackAlert() {
        if (!churnData || slackAlert.status === 'sending') return
        setSlackAlert({ status: 'sending' })
        try {
            const result = await sendChurnSlackAlert(churnData.atRiskMerchants, {
                totalAtRisk: churnData.totalAtRisk,
                highCount: churnData.highCount,
                mediumCount: churnData.mediumCount,
                totalGPVAtRisk: churnData.totalGPVAtRisk,
            })
            setSlackAlert({ status: result.status, message: result.message })
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Unknown error'
            setSlackAlert({ status: 'error', message: msg })
        }
    }

    function handleExportPDF() {
        const title = document.title
        document.title = `DexaPOS Analytics Report — ${new Date().toLocaleDateString()}`
        window.print()
        document.title = title
    }

    const { data: gpvData, isLoading: gpvLoading } = useGPVConcentration(whaleWatchDays)
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
        const isPos = change >= 0
        return (
            <>
                <span className={isPos ? 'text-green-600' : 'text-red-600'}>
                    {isPos ? '+' : ''}{change.toFixed(1)}%
                </span>{' '}from prior period
            </>
        )
    }

    // Label + icon only: §14.3 HQ-2 keeps severity colour to `/manage/health`
    // and the DLQ, so the tier is carried by the words and the shield glyph.
    const riskConfig: Record<ConcentrationRisk, { label: string; icon: typeof ShieldCheck }> = {
        low: { label: 'Low Risk', icon: ShieldCheck },
        medium: { label: 'Medium Risk', icon: ShieldMinus },
        high: { label: 'High Risk', icon: ShieldAlert },
    }

    const currentRisk = gpvData ? riskConfig[gpvData.riskLevel] : null

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

    const churnSeverityConfig: Record<ChurnSeverity, { label: string }> = {
        critical: { label: 'Critical' },
        high: { label: 'High' },
        medium: { label: 'Medium' },
    }

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
                    <div className="space-y-6">
                        <StatRow columns={3}>
                            <StatTile
                                label="Total GPV (30d)"
                                icon={<DollarSign />}
                                isLoading={kpiLoading}
                                value={kpiData ? fmtGPV(kpiData.totalGPV30d) : '—'}
                                meta={fmtTrend(kpiData?.gpvChange)}
                            />
                            <StatTile
                                label="Active Merchants (7d)"
                                icon={<Users />}
                                isLoading={kpiLoading}
                                value={kpiData?.activeMerchants7d.toLocaleString() ?? '—'}
                                meta={kpiData ? `${kpiData.totalMerchants.toLocaleString()} total` : undefined}
                            />
                            <StatTile
                                label="Total Orders (30d)"
                                icon={<CreditCard />}
                                isLoading={kpiLoading}
                                value={kpiData?.totalOrders30d.toLocaleString() ?? '—'}
                                meta={fmtTrend(kpiData?.ordersChange)}
                            />
                        </StatRow>

                        <StatRow columns={3}>
                            <StatTile
                                label="Avg Order Value"
                                icon={<Activity />}
                                isLoading={kpiLoading}
                                value={kpiData?.avgOrderValue ? `$${kpiData.avgOrderValue.toFixed(2)}` : '—'}
                                meta={`${kpiData?.cashPercent ?? 0}% cash · ${kpiData?.cardPercent ?? 0}% card`}
                            />
                            <StatTile
                                label="Active Devices"
                                icon={<Cpu />}
                                isLoading={kpiLoading}
                                value={kpiData?.activeDevices?.toLocaleString() ?? '—'}
                                meta="Online now"
                            />
                            <StatTile
                                label="Total Locations"
                                icon={<MapPin />}
                                isLoading={kpiLoading}
                                value={kpiData?.totalLocations?.toLocaleString() ?? '—'}
                                meta="Active locations"
                            />
                        </StatRow>
                    </div>
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
                                    { label: 'Void Rate', value: kpiData?.voidRate, suffix: '%' },
                                    { label: 'New Merchants', value: kpiData?.newMerchantsThisMonth, suffix: ' this mo.' },
                                    { label: 'Onboarding', value: kpiData?.merchantsOnboarding, suffix: '' },
                                    { label: 'Card Split', value: kpiData?.cardPercent, suffix: '%' },
                                ].map(({ label, value, suffix }) => (
                                    <StatTile
                                        key={label}
                                        label={label}
                                        isLoading={kpiLoading}
                                        value={value !== undefined ? `${value}${suffix}` : '—'}
                                    />
                                ))}
                            </StatRow>
                        </PanelSection>
                    </Panel>

                    <Panel>
                        <PanelSection
                            label="GPV trend (last 30 days)"
                            caption="Daily Gross Payment Volume with prior period overlay"
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
                                            width={isMobile ? VALUE_AXIS_WIDTH_MOBILE : undefined}
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
            T001: Whale Watch  →  T002: Churn Warning  →  T007: Payment Mix  →  T018: Multi-Location
        ══════════════════════════════════════════════════════════════════ */}
                <TabsContent value="revenue" className="space-y-6">

                    {/* ── T001: Whale Watch ─────────────────────────────────────────── */}
                    <SectionHeader
                        title="GPV Concentration Risk — Whale Watch"
                        description="Lorenz curve analysis across all merchants — identify concentration risk and high-value accounts"
                    />

                    <Panel>
                        <PanelSection
                            icon={Crown}
                            label="Whale Watch"
                            caption={
                                !gpvLoading && currentRisk
                                    ? `GPV concentration risk analysis · ${currentRisk.label}`
                                    : 'GPV concentration risk analysis'
                            }
                            action={
                                <Select value={String(whaleWatchDays)} onValueChange={v => setWhaleWatchDays(Number(v))}>
                                    <SelectTrigger className="h-9 w-36 shrink-0 rounded-full border-0 bg-muted/60 px-3 shadow-none">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="7">Last 7 Days</SelectItem>
                                        <SelectItem value="30">Last 30 Days</SelectItem>
                                        <SelectItem value="90">Last 90 Days</SelectItem>
                                    </SelectContent>
                                </Select>
                            }
                        >
                            <StatRow columns={4}>
                                <StatTile
                                    label="Total GPV"
                                    icon={<DollarSign />}
                                    isLoading={gpvLoading}
                                    value={`$${gpvData ? gpvData.totalGPV.toLocaleString() : '0'}`}
                                    meta={`Last ${whaleWatchDays} days`}
                                />
                                <StatTile
                                    label="Merchants Analyzed"
                                    icon={<Building2 />}
                                    isLoading={gpvLoading}
                                    value={gpvData?.totalMerchants.toLocaleString() || '0'}
                                    meta="With transaction activity"
                                />
                                <StatTile
                                    label="Top 10% GPV Share"
                                    icon={<BarChart3 />}
                                    isLoading={gpvLoading}
                                    value={`${gpvData?.topTenPercentGPVShare || 0}%`}
                                    meta={`${Math.max(1, Math.ceil((gpvData?.totalMerchants || 0) * 0.1))} merchant${Math.ceil((gpvData?.totalMerchants || 0) * 0.1) !== 1 ? 's' : ''} in top decile`}
                                />
                                <StatTile
                                    label="Concentration Risk"
                                    icon={currentRisk ? <currentRisk.icon /> : <ShieldCheck />}
                                    isLoading={gpvLoading}
                                    value={currentRisk ? currentRisk.label.replace(' Risk', '') : '—'}
                                    meta={
                                        gpvData?.riskLevel === 'high'
                                            ? 'Diversification needed'
                                            : gpvData?.riskLevel === 'medium'
                                                ? 'Monitor closely'
                                                : 'Healthy distribution'
                                    }
                                />
                            </StatRow>
                        </PanelSection>
                    </Panel>

                    {/* Lorenz Curve + Whale List */}
                    <div className="grid gap-4 lg:grid-cols-7">
                        <Panel className="lg:col-span-4">
                            <PanelSection
                                label="GPV distribution"
                                caption="Lorenz curve — gap from diagonal indicates concentration"
                            >
                                {gpvLoading ? (
                                    <Skeleton className="h-80 w-full" />
                                ) : gpvData && gpvData.totalMerchants >= 2 ? (
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
                                                <Area type="monotone" dataKey="gpvPercentile" stroke="var(--chart-3)" fill="url(#concentrationGap)" strokeWidth={2.5} />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    </ChartContainer>
                                ) : (
                                    <div className="h-80 flex flex-col items-center justify-center text-muted-foreground gap-3">
                                        <AlertTriangle className="h-10 w-10 opacity-30" />
                                        <div className="text-center">
                                            <p className="text-sm font-medium">Insufficient data for concentration analysis</p>
                                            <p className="text-xs mt-1">Requires at least 20 merchants. Current: <span className="font-bold text-foreground">{gpvData?.totalMerchants || 0}</span></p>
                                        </div>
                                    </div>
                                )}
                            </PanelSection>
                        </Panel>

                        <Panel className="lg:col-span-3">
                            <PanelSection
                                label="Whale merchants (>$100k GPV)"
                                caption={`Last ${whaleWatchDays} days — assign dedicated Account Managers`}
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
                                ) : (
                                    <div className="h-72 flex flex-col items-center justify-center text-muted-foreground gap-3">
                                        <Crown className="h-10 w-10 opacity-30" />
                                        <div className="text-center">
                                            <p className="text-sm font-medium">No whale merchants detected</p>
                                            <p className="text-xs mt-1">No merchants above $100k GPV in the last {whaleWatchDays} days.</p>
                                        </div>
                                    </div>
                                )}
                                {sortedWhaleList.length > 0 && (
                                    <div className="mt-3 flex items-center justify-between pt-3 text-xs text-muted-foreground">
                                        <span>{sortedWhaleList.length} whale{sortedWhaleList.length !== 1 ? 's' : ''} identified</span>
                                        <span className="tabular-nums">Total GPV: ${gpvData?.totalGPV.toLocaleString()}</span>
                                    </div>
                                )}
                            </PanelSection>
                        </Panel>
                    </div>

                    {/* Context summary */}
                    {!gpvLoading && gpvData && gpvData.totalMerchants > 0 && (
                        <Panel>
                            <PanelSection label="Distribution summary">
                                <StatRow columns={4}>
                                    <StatTile label="Total Merchants" value={gpvData.totalMerchants.toLocaleString()} />
                                    <StatTile label="Total GPV" value={`$${gpvData.totalGPV.toLocaleString()}`} />
                                    <StatTile label="Avg Merchant GPV" value={`$${gpvData.averageGPV.toLocaleString()}`} />
                                    <StatTile label="Median Merchant GPV" value={`$${gpvData.medianGPV.toLocaleString()}`} />
                                </StatRow>
                            </PanelSection>
                        </Panel>
                    )}

                    {/* ── T002: Churn Warning ───────────────────────────────────────── */}
                    <SectionHeader
                        title="Churn Warning Radar"
                        description="Merchants with >30% week-over-week GPV drop — sorted by severity"
                    />

                    {churnLoading && <Skeleton className="h-64 w-full rounded-3xl" />}

                    {!churnLoading && churnData && churnData.totalAtRisk === 0 && (
                        <Panel>
                            <PanelSection icon={ShieldCheck} label="All clear">
                                <p className="text-sm text-muted-foreground">
                                    No merchants showing significant GPV decline. Churn risk is minimal.
                                </p>
                            </PanelSection>
                        </Panel>
                    )}

                    {!churnLoading && churnData && churnData.totalAtRisk > 0 && (
                        <Panel>
                            <PanelSection
                                icon={Siren}
                                label={`Churn risk alert (${churnData.totalAtRisk} at risk)`}
                                caption="Merchants with significant GPV drop (Week-over-Week comparison)"
                                action={
                                    <div className="text-right">
                                        <p className="text-sm text-muted-foreground">Total GPV at Risk</p>
                                        <p className="text-2xl font-semibold tabular-nums">
                                            ${churnData.totalGPVAtRisk.toLocaleString()}
                                        </p>
                                    </div>
                                }
                            >
                                <div className="mb-6 flex flex-col gap-1">
                                    <Button
                                        size="sm"
                                        variant={slackAlert.status === 'sent' || slackAlert.status === 'no_webhook' ? 'outline' : 'default'}
                                        className="no-print h-8 w-fit gap-1.5 rounded-full text-xs"
                                        disabled={slackAlert.status === 'sending' || slackAlert.status === 'sent'}
                                        onClick={handleSlackAlert}
                                        title={slackAlert.message}
                                    >
                                        {slackAlert.status === 'sending' && <><Loader2 className="h-3.5 w-3.5 animate-spin" />Sending…</>}
                                        {slackAlert.status === 'sent' && <><CheckCircle2 className="h-3.5 w-3.5" />Alert Sent</>}
                                        {slackAlert.status === 'error' && <><XCircle className="h-3.5 w-3.5" />Retry Alert</>}
                                        {slackAlert.status === 'no_webhook' && <><BellRing className="h-3.5 w-3.5" />No Webhook Configured</>}
                                        {(slackAlert.status === 'idle' || slackAlert.status === 'no_critical') && <><BellRing className="h-3.5 w-3.5" />Notify #merchant-health</>}
                                    </Button>
                                    {slackAlert.message && slackAlert.status !== 'idle' && (
                                        <p className="max-w-48 text-[10px] leading-tight text-muted-foreground">{slackAlert.message}</p>
                                    )}
                                </div>

                                <div className="mb-6">
                                    <StatRow columns={3}>
                                        <StatTile label="Critical (>80% drop)" icon={<AlertTriangle />} value={churnData.criticalCount} />
                                        <StatTile label="High (50-80% drop)" icon={<TrendingDown />} value={churnData.highCount} />
                                        <StatTile label="Medium (30-50% drop)" icon={<ArrowDownRight />} value={churnData.mediumCount} />
                                    </StatRow>
                                </div>

                                <div>
                                    <div className="mb-2 flex justify-start">
                                        <MobileColumnsButton
                                            columns={CHURN_RISK_COLUMNS}
                                            hidden={churnHiddenCols}
                                            onChange={setChurnHiddenCols}
                                        />
                                    </div>
                                    {/* The min-width is what forces the sideways scroll, so it
                                        has to lift on mobile or hiding columns changes nothing. */}
                                    <Table variant="data" className={cn(!isMobile && 'min-w-[900px]')}>
                                        <TableHeader className="[&_tr]:border-0">
                                            <TableRow>
                                                <TableHead>Merchant</TableHead>
                                                {showChurnCol('severity') && <TableHead>Severity</TableHead>}
                                                {showChurnCol('prevGpv') && <TableHead className="text-right">Prev 7d GPV</TableHead>}
                                                {showChurnCol('lastGpv') && <TableHead className="text-right">Last 7d GPV</TableHead>}
                                                {showChurnCol('drop') && <TableHead className="text-right">Drop %</TableHead>}
                                                {showChurnCol('daysSince') && <TableHead className="text-right">Days Since Last Txn</TableHead>}
                                                {showChurnCol('actions') && <TableHead className="text-right">Actions</TableHead>}
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {churnData.atRiskMerchants.slice(0, 10).map((merchant) => {
                                                const config = churnSeverityConfig[merchant.severity]
                                                const daysSinceLastOrder = Math.floor(
                                                    (Date.now() - new Date(merchant.lastOrderDate).getTime()) / (1000 * 60 * 60 * 24)
                                                )
                                                return (
                                                    <TableRow key={merchant.id}>
                                                        <TableCell>
                                                            <Link href={`/manage/merchants/${merchant.id}`} className="flex items-center gap-2 font-medium hover:underline">
                                                                {merchant.name}
                                                                <ExternalLink className="h-3 w-3 opacity-50" />
                                                            </Link>
                                                            <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                                                                {merchant.transactionsLast7Days} txns (was {merchant.transactionsPrev7Days})
                                                            </p>
                                                        </TableCell>
                                                        {showChurnCol('severity') && (
                                                            <TableCell>
                                                                <span className="flex w-fit items-center gap-1 text-sm text-muted-foreground">
                                                                    <AlertTriangle className="h-3 w-3" />
                                                                    {config.label}
                                                                </span>
                                                            </TableCell>
                                                        )}
                                                        {showChurnCol('prevGpv') && (
                                                            <TableCell className="text-right font-medium tabular-nums">${merchant.prevSevenDaysGPV.toLocaleString()}</TableCell>
                                                        )}
                                                        {showChurnCol('lastGpv') && (
                                                            <TableCell className="text-right font-medium tabular-nums">${merchant.lastSevenDaysGPV.toLocaleString()}</TableCell>
                                                        )}
                                                        {showChurnCol('drop') && (
                                                            <TableCell className="text-right font-semibold tabular-nums">
                                                                -{merchant.dropPercentage}%
                                                            </TableCell>
                                                        )}
                                                        {showChurnCol('daysSince') && (
                                                            <TableCell className="text-right">
                                                                <div className="flex items-center justify-end gap-1 whitespace-nowrap text-xs text-muted-foreground">
                                                                    <Clock className="h-3 w-3" />
                                                                    {daysSinceLastOrder === 0 ? 'Today' : `${daysSinceLastOrder}d ago`}
                                                                </div>
                                                            </TableCell>
                                                        )}
                                                        {showChurnCol('actions') && (
                                                        <TableCell className="text-right">
                                                            <div className="flex flex-wrap items-center justify-end gap-1">
                                                                <a href={`mailto:?subject=At-Risk%20Merchant%3A%20${encodeURIComponent(merchant.name)}&body=Hi%2C%0A%0AThis%20merchant%20has%20shown%20a%20${merchant.dropPercentage}%25%20GPV%20drop%20in%20the%20last%207%20days.%0A%0AMerchant%3A%20${encodeURIComponent(merchant.name)}%0ASeverity%3A%20${merchant.severity}%0APrev%207d%20GPV%3A%20%24${merchant.prevSevenDaysGPV.toLocaleString()}%0ALast%207d%20GPV%3A%20%24${merchant.lastSevenDaysGPV.toLocaleString()}%0A%0APlease%20follow%20up%20with%20this%20account.`}>
                                                                    <Button size="sm" variant="outline" className="h-7 gap-1 rounded-full px-2 text-xs">
                                                                        <Mail className="h-3 w-3" />Email AM
                                                                    </Button>
                                                                </a>
                                                                <Button size="sm" variant="outline" className="h-7 gap-1 rounded-full px-2 text-xs">
                                                                    <User className="h-3 w-3" />Log Call
                                                                </Button>
                                                                <Link href={`/manage/merchants/${merchant.id}`}>
                                                                    <Button size="sm" variant="outline" className="h-7 rounded-full px-2 text-xs">
                                                                        <ExternalLink className="mr-1 h-3 w-3" />View
                                                                    </Button>
                                                                </Link>
                                                            </div>
                                                        </TableCell>
                                                        )}
                                                    </TableRow>
                                                )
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>

                                {churnData.atRiskMerchants.length > 10 && (
                                    <div className="mt-3 text-center">
                                        <Button variant="outline" size="sm" className="rounded-full">
                                            View All {churnData.totalAtRisk} At-Risk Merchants
                                        </Button>
                                    </div>
                                )}
                            </PanelSection>
                        </Panel>
                    )}

                    {/* ── T007: Payment Method Mix ──────────────────────────────────── */}
                    <SectionHeader title="Payment Method Mix & Fee Analysis" description="Cash vs card split, estimated processing fee exposure, and dual-pricing analysis" />
                    <PaymentMethodMix />

                    {/* ── T018: Multi-Location Comparison ──────────────────────────── */}
                    <SectionHeader
                        title="Multi-Location Merchant Comparison"
                        description="GPV, order volume, and performance ranked across all locations — identify top and underperforming sites"
                    />
                    <MultiLocationComparison />

                </TabsContent>

                {/* ══════════════════════════════════════════════════════════════════
            TAB 3 — MERCHANT HEALTH
            T006: Onboarding Funnel  →  T016: Activation Timeline  →  T008: Void & Refund
        ══════════════════════════════════════════════════════════════════ */}
                <TabsContent value="merchants" className="space-y-6">
                    <SectionHeader title="Merchant Onboarding Funnel" description="Conversion through lifecycle stages and stuck merchant alerts" />
                    <MerchantOnboardingFunnel />

                    <SectionHeader title="Merchant Activation Timeline" description="Days to first transaction histogram and never-activated merchant list" />
                    <MerchantActivationTimeline />

                    {/* ── T008: Void & Refund Intelligence ─────────────────────────── */}
                    <SectionHeader title="Void & Refund Intelligence" description="Platform benchmarks, outlier detection, reason breakdown, and staff void leaderboard" />
                    <VoidRefundIntelligence />
                </TabsContent>

                {/* ══════════════════════════════════════════════════════════════════
            TAB 4 — OPERATIONS
            T013: Order Type  →  T009: Discounts  →  T012: Staff  →  T014: KDS  →  T015: Audit
        ══════════════════════════════════════════════════════════════════ */}
                <TabsContent value="operations" className="space-y-6">
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
                        title="Audit Log Activity Monitor"
                        description="Platform-wide admin activity, severity distribution, top actors, and failed action feed"
                    />
                    <AuditLogActivityMonitor />
                </TabsContent>

                {/* ══════════════════════════════════════════════════════════════════
            TAB 5 — DEVICE FLEET
            Device Stability Index + Terminal Utilization + Fleet Health
        ══════════════════════════════════════════════════════════════════ */}
                <TabsContent value="fleet" className="space-y-6">
                    <SectionHeader
                        title="LANDI Device Stability Index"
                        description="App version stability rates, hardware model breakdown, and rollout safety signals"
                    />
                    <DeviceStabilityIndex />

                    <SectionHeader
                        title="Terminal Utilization Heatmap"
                        description="Active vs zombie stations, under-utilized merchants, and reclaimable hardware"
                    />
                    <TerminalUtilizationHeatmap />

                    <SectionHeader
                        title="Fleet Health Dashboard"
                        description="Real-time device health across all active POS terminals — merchant → location → device"
                    />
                    <FleetHealthDashboard />

                    <SectionHeader
                        title="Payment Terminal Health Monitor"
                        description="Dejavoo terminal connectivity, settlement status, and station pairing across the fleet"
                    />
                    <PaymentTerminalHealthMonitor />
                </TabsContent>

                {/* ══════════════════════════════════════════════════════════════════
            TAB 6 — GROWTH
            T017: Location Density & Geographic Insights
        ══════════════════════════════════════════════════════════════════ */}
                <TabsContent value="growth" className="space-y-6">
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
