'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
    ShoppingBag,
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
    gpvConcentration: { label: 'GPV Concentration', color: 'hsl(var(--chart-3))' },
    equalLine: { label: 'Perfect Equality', color: 'hsl(var(--muted-foreground))' },
}

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtGPV(n: number) {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`
    return `$${n.toFixed(2)}`
}

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

function SectionHeader({ title, description }: { title: string; description?: string }) {
    return (
        <div className="border-b pb-3 mb-5">
            <h2 className="text-base font-semibold">{title}</h2>
            {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
        </div>
    )
}

// ============================================================================
// PAGE
// ============================================================================

export default function AnalyticsPage() {
    const [whaleWatchDays, setWhaleWatchDays] = useState<number>(30)
    const [whaleSortKey, setWhaleSortKey] = useState<'monthlyGPV' | 'percentOfTotal' | 'trend'>('monthlyGPV')
    const [whaleSortDir, setWhaleSortDir] = useState<'asc' | 'desc'>('desc')
    const [chartMetric, setChartMetric] = useState<'revenue' | 'orders'>('revenue')

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

    function fmtTrend(change: number | undefined) {
        if (change === undefined || change === null) return null
        const isPos = change >= 0
        return (
            <p className="text-xs text-muted-foreground">
                <span className={isPos ? 'text-green-600' : 'text-red-600'}>
                    {isPos ? '+' : ''}{change.toFixed(1)}%
                </span>{' '}from prior period
            </p>
        )
    }

    const riskConfig: Record<ConcentrationRisk, { label: string; variant: 'default' | 'secondary' | 'destructive'; icon: typeof ShieldCheck; colorClass: string }> = {
        low: { label: 'Low Risk', variant: 'default', icon: ShieldCheck, colorClass: 'text-green-600' },
        medium: { label: 'Medium Risk', variant: 'secondary', icon: ShieldMinus, colorClass: 'text-yellow-600' },
        high: { label: 'High Risk', variant: 'destructive', icon: ShieldAlert, colorClass: 'text-red-600' },
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

    const churnSeverityConfig: Record<ChurnSeverity, { label: string; variant: 'default' | 'secondary' | 'destructive'; colorClass: string; bgClass: string }> = {
        critical: { label: 'Critical', variant: 'destructive', colorClass: 'text-red-600', bgClass: 'bg-red-50 border-red-200' },
        high: { label: 'High', variant: 'destructive', colorClass: 'text-orange-600', bgClass: 'bg-orange-50 border-orange-200' },
        medium: { label: 'Medium', variant: 'secondary', colorClass: 'text-yellow-600', bgClass: 'bg-yellow-50 border-yellow-200' },
    }

    return (
        <div className="space-y-6 min-w-0 overflow-x-hidden">
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

            {/* ══════════════════════════════════════════════════════════════════════
          PAGE HEADER
      ══════════════════════════════════════════════════════════════════════ */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
                    <p className="text-muted-foreground">
                        Platform-wide intelligence across all merchants, devices, and channels
                    </p>
                </div>
                <div className="flex items-center space-x-2 no-print flex-shrink-0">
                    <Button variant="outline" onClick={handleExportPDF}>Export Report</Button>
                </div>
            </div>

            {/* ══════════════════════════════════════════════════════════════════════
          PERSISTENT KPI HEADER — always visible above tabs
      ══════════════════════════════════════════════════════════════════════ */}
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-6">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total GPV (30d)</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {kpiLoading ? <Skeleton className="h-8 w-28" /> : (
                            <>
                                <div className="text-2xl font-bold">{kpiData ? fmtGPV(kpiData.totalGPV30d) : '—'}</div>
                                {fmtTrend(kpiData?.gpvChange)}
                            </>
                        )}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active Merchants (7d)</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {kpiLoading ? <Skeleton className="h-8 w-28" /> : (
                            <>
                                <div className="text-2xl font-bold">{kpiData?.activeMerchants7d.toLocaleString() ?? '—'}</div>
                                <p className="text-xs text-muted-foreground">{kpiData?.totalMerchants.toLocaleString()} total</p>
                            </>
                        )}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Orders (30d)</CardTitle>
                        <CreditCard className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {kpiLoading ? <Skeleton className="h-8 w-28" /> : (
                            <>
                                <div className="text-2xl font-bold">{kpiData?.totalOrders30d.toLocaleString() ?? '—'}</div>
                                {fmtTrend(kpiData?.ordersChange)}
                            </>
                        )}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Avg Order Value</CardTitle>
                        <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {kpiLoading ? <Skeleton className="h-8 w-28" /> : (
                            <>
                                <div className="text-2xl font-bold">{kpiData?.avgOrderValue ? `$${kpiData.avgOrderValue.toFixed(2)}` : '—'}</div>
                                <p className="text-xs text-muted-foreground">
                                    <span className="text-green-600">{kpiData?.cashPercent ?? 0}%</span> cash ·{' '}
                                    <span className="text-blue-600">{kpiData?.cardPercent ?? 0}%</span> card
                                </p>
                            </>
                        )}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active Devices</CardTitle>
                        <Cpu className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {kpiLoading ? <Skeleton className="h-8 w-28" /> : (
                            <>
                                <div className="text-2xl font-bold">{kpiData?.activeDevices?.toLocaleString() ?? '—'}</div>
                                <p className="text-xs text-muted-foreground">Online now</p>
                            </>
                        )}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Locations</CardTitle>
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {kpiLoading ? <Skeleton className="h-8 w-28" /> : (
                            <>
                                <div className="text-2xl font-bold">{kpiData?.totalLocations?.toLocaleString() ?? '—'}</div>
                                <p className="text-xs text-muted-foreground">Active locations</p>
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* ══════════════════════════════════════════════════════════════════════
          6-TAB ANALYTICS SUITE
      ══════════════════════════════════════════════════════════════════════ */}
            <Tabs defaultValue="overview" className="space-y-4">

                {/* Tab bar */}
                <TabsList className="flex-wrap h-auto gap-1 p-1">
                    <TabsTrigger value="overview" className="gap-1.5">
                        <TabLabel icon={BarChart3} label="Overview" />
                    </TabsTrigger>
                    <TabsTrigger value="revenue" className="gap-1.5">
                        <TabLabel icon={DollarSign} label="Revenue & Risk" badge={churnData?.totalAtRisk || undefined} />
                    </TabsTrigger>
                    <TabsTrigger value="merchants" className="gap-1.5">
                        <TabLabel icon={Building2} label="Merchant Health" />
                    </TabsTrigger>
                    <TabsTrigger value="operations" className="gap-1.5">
                        <TabLabel icon={Utensils} label="Operations" />
                    </TabsTrigger>
                    <TabsTrigger value="fleet" className="gap-1.5">
                        <TabLabel icon={Cpu} label="Device Fleet" />
                    </TabsTrigger>
                    <TabsTrigger value="growth" className="gap-1.5">
                        <TabLabel icon={Globe} label="Growth" />
                    </TabsTrigger>
                </TabsList>

                {/* ══════════════════════════════════════════════════════════════════
            TAB 1 — OVERVIEW
            Extended KPIs + Sales Trend + Whale Watch (GPV Concentration)
        ══════════════════════════════════════════════════════════════════ */}
                <TabsContent value="overview" className="space-y-6">

                    {/* Extended KPI mini-tiles */}
                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                        {[
                            { label: 'Void Rate', value: kpiData?.voidRate, suffix: '%' },
                            { label: 'New Merchants', value: kpiData?.newMerchantsThisMonth, suffix: ' this mo.' },
                            { label: 'Onboarding', value: kpiData?.merchantsOnboarding, suffix: '' },
                            { label: 'Card Split', value: kpiData?.cardPercent, suffix: '%' },
                        ].map(({ label, value, suffix }) => (
                            <Card key={label} className="bg-muted/30">
                                <CardContent className="pt-4 pb-3">
                                    {kpiLoading ? <Skeleton className="h-6 w-16" /> : (
                                        <div className="text-xl font-bold">
                                            {value !== undefined ? `${value}${suffix}` : '—'}
                                        </div>
                                    )}
                                    <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                                </CardContent>
                            </Card>
                        ))}
                    </div>

                    {/* GPV Sales Trend */}
                    <Card>
                        <CardHeader>
                            <div className="flex flex-wrap items-start gap-3 justify-between">
                                <div className="min-w-0">
                                    <CardTitle>GPV Trend (Last 30 Days)</CardTitle>
                                    <CardDescription>Daily Gross Payment Volume with prior period overlay</CardDescription>
                                </div>
                                <div className="flex gap-1 border rounded-md p-0.5 shrink-0">
                                    <Button size="sm" variant={chartMetric === 'revenue' ? 'default' : 'ghost'} className="h-7 px-3 text-xs" onClick={() => setChartMetric('revenue')}>GPV</Button>
                                    <Button size="sm" variant={chartMetric === 'orders' ? 'default' : 'ghost'} className="h-7 px-3 text-xs" onClick={() => setChartMetric('orders')}>Order Count</Button>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {salesTrendLoading ? (
                                <Skeleton className="h-72 w-full" />
                            ) : salesTrend && salesTrend.length > 0 ? (
                                <ResponsiveContainer width="100%" height={300}>
                                    <AreaChart data={salesTrend}>
                                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                        <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={d => d.slice(5)} />
                                        <YAxis tick={{ fontSize: 11 }} tickFormatter={v => chartMetric === 'revenue' ? `$${(v / 1000).toFixed(0)}k` : String(v)} />
                                        <Tooltip formatter={(v: number) => chartMetric === 'revenue' ? [`$${v.toLocaleString()}`, 'GPV'] : [v.toLocaleString(), 'Orders']} />
                                        <Area type="monotone" dataKey={chartMetric === 'revenue' ? 'revenue' : 'orderCount'} name="Current" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.25} strokeWidth={2} />
                                        <Area type="monotone" dataKey={chartMetric === 'revenue' ? 'prevRevenue' : 'prevOrderCount'} name="Prior Period" stroke="hsl(var(--muted-foreground))" fill="transparent" strokeWidth={1.5} strokeDasharray="4 2" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-72 flex items-center justify-center text-muted-foreground text-sm">No sales data available</div>
                            )}
                        </CardContent>
                    </Card>

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

                    <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                            <Crown className="h-5 w-5 text-primary shrink-0" />
                            <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <h2 className="text-lg font-semibold">Whale Watch</h2>
                                    {!gpvLoading && currentRisk && (
                                        <Badge variant={currentRisk.variant} className="flex items-center gap-1 shrink-0">
                                            <currentRisk.icon className="h-3 w-3" />
                                            {currentRisk.label}
                                        </Badge>
                                    )}
                                </div>
                                <p className="text-sm text-muted-foreground">GPV concentration risk analysis</p>
                            </div>
                        </div>
                        <Select value={String(whaleWatchDays)} onValueChange={v => setWhaleWatchDays(Number(v))}>
                            <SelectTrigger className="w-32 shrink-0">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="7">Last 7 Days</SelectItem>
                                <SelectItem value="30">Last 30 Days</SelectItem>
                                <SelectItem value="90">Last 90 Days</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Whale KPI cards */}
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium text-muted-foreground">Total GPV</CardTitle>
                                <DollarSign className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                {gpvLoading ? <Skeleton className="h-8 w-28" /> : (
                                    <>
                                        <div className="text-2xl font-bold">${gpvData ? gpvData.totalGPV.toLocaleString() : '0'}</div>
                                        <p className="text-xs text-muted-foreground mt-1">Last {whaleWatchDays} days</p>
                                    </>
                                )}
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium text-muted-foreground">Merchants Analyzed</CardTitle>
                                <Building2 className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                {gpvLoading ? <Skeleton className="h-8 w-20" /> : (
                                    <>
                                        <div className="text-2xl font-bold">{gpvData?.totalMerchants.toLocaleString() || '0'}</div>
                                        <p className="text-xs text-muted-foreground mt-1">With transaction activity</p>
                                    </>
                                )}
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium text-muted-foreground">Top 10% GPV Share</CardTitle>
                                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                {gpvLoading ? <Skeleton className="h-8 w-20" /> : (
                                    <>
                                        <div className={`text-2xl font-bold ${currentRisk?.colorClass || ''}`}>
                                            {gpvData?.topTenPercentGPVShare || 0}%
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            {Math.max(1, Math.ceil((gpvData?.totalMerchants || 0) * 0.1))} merchant{Math.ceil((gpvData?.totalMerchants || 0) * 0.1) !== 1 ? 's' : ''} in top decile
                                        </p>
                                    </>
                                )}
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium text-muted-foreground">Concentration Risk</CardTitle>
                                {currentRisk ? <currentRisk.icon className={`h-4 w-4 ${currentRisk.colorClass}`} /> : <ShieldCheck className="h-4 w-4 text-muted-foreground" />}
                            </CardHeader>
                            <CardContent>
                                {gpvLoading ? <Skeleton className="h-8 w-24" /> : currentRisk ? (
                                    <>
                                        <div className={`text-2xl font-bold ${currentRisk.colorClass}`}>{currentRisk.label.replace(' Risk', '')}</div>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            {gpvData?.riskLevel === 'high' ? 'Diversification needed' : gpvData?.riskLevel === 'medium' ? 'Monitor closely' : 'Healthy distribution'}
                                        </p>
                                    </>
                                ) : (
                                    <div className="text-2xl font-bold text-muted-foreground">—</div>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    {/* Lorenz Curve + Whale List */}
                    <div className="grid gap-4 lg:grid-cols-7">
                        <Card className="lg:col-span-4 min-w-0 overflow-hidden">
                            <CardHeader>
                                <CardTitle>GPV Distribution</CardTitle>
                                <CardDescription>Lorenz curve — gap from diagonal indicates concentration</CardDescription>
                            </CardHeader>
                            <CardContent className="pl-2">
                                {gpvLoading ? (
                                    <Skeleton className="h-80 w-full" />
                                ) : gpvData && gpvData.totalMerchants >= 2 ? (
                                    <ChartContainer config={whaleChartConfig} className="h-80 w-full">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart data={gpvData.lorenzCurve}>
                                                <defs>
                                                    <linearGradient id="concentrationGap" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="0%" stopColor="hsl(var(--chart-3))" stopOpacity={0.3} />
                                                        <stop offset="100%" stopColor="hsl(var(--chart-3))" stopOpacity={0.05} />
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                                <XAxis dataKey="merchantPercentile" tickLine={false} axisLine={false} tickMargin={8} tickFormatter={val => `${val}%`} label={{ value: '% of Merchants (ranked by volume)', position: 'insideBottom', offset: -4, style: { fontSize: 11, fill: 'hsl(var(--muted-foreground))' } }} />
                                                <YAxis tickLine={false} axisLine={false} tickFormatter={val => `${val}%`} label={{ value: '% of Total GPV', angle: -90, position: 'insideLeft', offset: 10, style: { fontSize: 11, fill: 'hsl(var(--muted-foreground))' } }} />
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
                                                <Area type="linear" dataKey="equalityLine" stroke="hsl(var(--muted-foreground))" strokeDasharray="5 5" strokeOpacity={0.5} fill="none" strokeWidth={1.5} />
                                                <Area type="monotone" dataKey="gpvPercentile" stroke="hsl(var(--chart-3))" fill="url(#concentrationGap)" strokeWidth={2.5} />
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
                            </CardContent>
                        </Card>

                        <Card className="lg:col-span-3 min-w-0 overflow-hidden">
                            <CardHeader>
                                <CardTitle className="text-sm font-medium">Whale Merchants (&gt;$100k GPV)</CardTitle>
                                <CardDescription>Last {whaleWatchDays} days — assign dedicated Account Managers</CardDescription>
                            </CardHeader>
                            <CardContent>
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
                                    <div className="max-h-96 overflow-auto overflow-x-auto">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Merchant</TableHead>
                                                    <TableHead className="text-right cursor-pointer select-none hover:text-foreground" onClick={() => handleWhaleSort('monthlyGPV')}>
                                                        <span className="flex items-center justify-end gap-1">GPV <ArrowUpDown className="h-3 w-3" /></span>
                                                    </TableHead>
                                                    <TableHead className="text-right cursor-pointer select-none hover:text-foreground" onClick={() => handleWhaleSort('percentOfTotal')}>
                                                        <span className="flex items-center justify-end gap-1">% Total <ArrowUpDown className="h-3 w-3" /></span>
                                                    </TableHead>
                                                    <TableHead className="text-right">Locs</TableHead>
                                                    <TableHead className="text-right cursor-pointer select-none hover:text-foreground" onClick={() => handleWhaleSort('trend')}>
                                                        <span className="flex items-center justify-end gap-1">Trend <ArrowUpDown className="h-3 w-3" /></span>
                                                    </TableHead>
                                                    <TableHead className="text-right">AM</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {sortedWhaleList.map(whale => (
                                                    <TableRow key={whale.id}>
                                                        <TableCell>
                                                            <Link href={`/manage/merchants/${whale.id}`} className="hover:underline font-medium text-sm">{whale.name}</Link>
                                                            <p className="text-xs text-muted-foreground">{whale.transactions.toLocaleString()} txns</p>
                                                        </TableCell>
                                                        <TableCell className="text-right font-medium text-sm">${whale.monthlyGPV.toLocaleString()}</TableCell>
                                                        <TableCell className="text-right">
                                                            <Badge variant="secondary" className="text-xs">{whale.percentOfTotal}%</Badge>
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <span className="text-sm text-muted-foreground">{whale.locationCount}</span>
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            {whale.trend !== null ? (
                                                                <span className={`flex items-center justify-end gap-0.5 text-xs font-medium ${whale.trend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                                    {whale.trend >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                                                                    {whale.trend > 0 ? '+' : ''}{whale.trend}%
                                                                </span>
                                                            ) : (
                                                                <span className="text-xs text-muted-foreground flex items-center justify-end gap-0.5">
                                                                    <Minus className="h-3 w-3" /> New
                                                                </span>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            {whale.accountManager ? (
                                                                <span className="text-xs text-muted-foreground">{whale.accountManager}</span>
                                                            ) : (
                                                                <Badge variant="outline" className="text-xs text-yellow-600 border-yellow-300">
                                                                    <User className="h-3 w-3 mr-1" />Unassigned
                                                                </Badge>
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
                                    <div className="mt-3 pt-3 border-t flex items-center justify-between text-xs text-muted-foreground">
                                        <span>{sortedWhaleList.length} whale{sortedWhaleList.length !== 1 ? 's' : ''} identified</span>
                                        <span>Total GPV: ${gpvData?.totalGPV.toLocaleString()}</span>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    {/* Context summary */}
                    {!gpvLoading && gpvData && gpvData.totalMerchants > 0 && (
                        <Card>
                            <CardContent className="pt-6">
                                <div className="grid gap-6 md:grid-cols-4">
                                    {[
                                        { label: 'Total Merchants', value: gpvData.totalMerchants.toLocaleString() },
                                        { label: 'Total GPV', value: `$${gpvData.totalGPV.toLocaleString()}` },
                                        { label: 'Avg Merchant GPV', value: `$${gpvData.averageGPV.toLocaleString()}` },
                                        { label: 'Median Merchant GPV', value: `$${gpvData.medianGPV.toLocaleString()}` },
                                    ].map(({ label, value }) => (
                                        <div key={label} className="text-center">
                                            <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
                                            <p className="text-xl font-bold mt-1">{value}</p>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* ── T002: Churn Warning ───────────────────────────────────────── */}
                    <SectionHeader
                        title="Churn Warning Radar"
                        description="Merchants with >30% week-over-week GPV drop — sorted by severity"
                    />

                    {churnLoading && (
                        <Card>
                            <CardHeader>
                                <div className="flex items-center gap-3">
                                    <Skeleton className="h-10 w-10 rounded-lg" />
                                    <div className="space-y-2">
                                        <Skeleton className="h-5 w-48" />
                                        <Skeleton className="h-4 w-64" />
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-3">
                                    {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {!churnLoading && churnData && churnData.totalAtRisk === 0 && (
                        <Card className="border-green-200 bg-linear-to-r from-green-50 to-emerald-50">
                            <CardContent className="py-8">
                                <div className="flex flex-col items-center justify-center text-center gap-3">
                                    <div className="p-3 rounded-full bg-green-100">
                                        <ShieldCheck className="h-8 w-8 text-green-600" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-semibold text-green-900">All Clear</h3>
                                        <p className="text-sm text-green-700 mt-1">No merchants showing significant GPV decline. Churn risk is minimal.</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {!churnLoading && churnData && churnData.totalAtRisk > 0 && (
                        <Card className="border-red-200 bg-linear-to-r from-red-50 to-orange-50">
                            <CardHeader className="pb-4">
                                <div className="space-y-3">
                                    {/* Title row */}
                                    <div className="flex items-start gap-3">
                                        <div className="p-2 rounded-lg bg-red-100 shrink-0 mt-0.5">
                                            <Siren className="h-5 w-5 text-red-600" />
                                        </div>
                                        <div className="min-w-0">
                                            <CardTitle className="flex items-center gap-2 flex-wrap">
                                                Churn Risk Alert
                                                <Badge variant="destructive" className="text-xs shrink-0">{churnData.totalAtRisk} At Risk</Badge>
                                            </CardTitle>
                                            <CardDescription className="mt-1">Merchants with significant GPV drop (Week-over-Week comparison)</CardDescription>
                                        </div>
                                    </div>
                                    {/* Actions row — button left, GPV right */}
                                    <div className="flex items-center justify-between gap-3 flex-wrap">
                                        <div className="flex flex-col gap-1">
                                            <Button
                                                size="sm"
                                                variant={slackAlert.status === 'sent' ? 'outline' : slackAlert.status === 'no_webhook' ? 'outline' : 'default'}
                                                className={`h-8 text-xs gap-1.5 no-print${slackAlert.status === 'sent' ? ' border-green-400 text-green-700 hover:bg-green-50' :
                                                        slackAlert.status === 'no_webhook' ? ' border-amber-400 text-amber-700 hover:bg-amber-50' :
                                                            slackAlert.status === 'error' ? ' bg-destructive hover:bg-destructive/90' : ''
                                                    }`}
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
                                                <p className="text-[10px] text-muted-foreground max-w-48 leading-tight">{slackAlert.message}</p>
                                            )}
                                        </div>
                                        <div className="text-right shrink-0">
                                            <p className="text-xs text-muted-foreground">Total GPV at Risk</p>
                                            <p className="text-2xl font-bold text-red-600">${churnData.totalGPVAtRisk.toLocaleString()}</p>
                                        </div>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                                    {[
                                        { label: 'Critical (>80% drop)', count: churnData.criticalCount, color: 'red', icon: AlertTriangle, bg: 'bg-red-100', border: 'border-red-100', text: 'text-red-600' },
                                        { label: 'High (50-80% drop)', count: churnData.highCount, color: 'orange', icon: TrendingDown, bg: 'bg-orange-100', border: 'border-orange-100', text: 'text-orange-600' },
                                        { label: 'Medium (30-50% drop)', count: churnData.mediumCount, color: 'yellow', icon: ArrowDownRight, bg: 'bg-yellow-100', border: 'border-yellow-100', text: 'text-yellow-600' },
                                    ].map(({ label, count, bg, border, text, icon: Icon }) => (
                                        <div key={label} className={`flex items-center gap-3 p-3 rounded-lg bg-white border ${border}`}>
                                            <div className={`p-2 rounded-full ${bg}`}><Icon className={`h-4 w-4 ${text}`} /></div>
                                            <div>
                                                <p className="text-xs text-muted-foreground">{label}</p>
                                                <p className={`text-xl font-bold ${text}`}>{count}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="rounded-lg border bg-white overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="bg-muted/50">
                                                <TableHead>Merchant</TableHead>
                                                <TableHead>Severity</TableHead>
                                                <TableHead className="text-right">Prev 7d GPV</TableHead>
                                                <TableHead className="text-right">Last 7d GPV</TableHead>
                                                <TableHead className="text-right">Drop %</TableHead>
                                                <TableHead className="text-right">Days Since Last Txn</TableHead>
                                                <TableHead className="text-right">Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {churnData.atRiskMerchants.slice(0, 10).map((merchant) => {
                                                const config = churnSeverityConfig[merchant.severity]
                                                const daysSinceLastOrder = Math.floor(
                                                    (Date.now() - new Date(merchant.lastOrderDate).getTime()) / (1000 * 60 * 60 * 24)
                                                )
                                                return (
                                                    <TableRow key={merchant.id} className={config.bgClass}>
                                                        <TableCell>
                                                            <Link href={`/manage/merchants/${merchant.id}`} className="hover:underline font-medium text-sm flex items-center gap-2">
                                                                {merchant.name}
                                                                <ExternalLink className="h-3 w-3 opacity-50" />
                                                            </Link>
                                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                                {merchant.transactionsLast7Days} txns (was {merchant.transactionsPrev7Days})
                                                            </p>
                                                        </TableCell>
                                                        <TableCell>
                                                            <Badge variant={config.variant} className="flex items-center gap-1 w-fit">
                                                                <AlertTriangle className="h-3 w-3" />
                                                                {config.label}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell className="text-right font-medium text-sm">${merchant.prevSevenDaysGPV.toLocaleString()}</TableCell>
                                                        <TableCell className="text-right font-medium text-sm">${merchant.lastSevenDaysGPV.toLocaleString()}</TableCell>
                                                        <TableCell className="text-right">
                                                            <span className={`font-bold text-sm ${config.colorClass}`}>-{merchant.dropPercentage}%</span>
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <div className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
                                                                <Clock className="h-3 w-3" />
                                                                {daysSinceLastOrder === 0 ? 'Today' : `${daysSinceLastOrder}d ago`}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <div className="flex items-center justify-end gap-1 flex-wrap">
                                                                <a href={`mailto:?subject=At-Risk%20Merchant%3A%20${encodeURIComponent(merchant.name)}&body=Hi%2C%0A%0AThis%20merchant%20has%20shown%20a%20${merchant.dropPercentage}%25%20GPV%20drop%20in%20the%20last%207%20days.%0A%0AMerchant%3A%20${encodeURIComponent(merchant.name)}%0ASeverity%3A%20${merchant.severity}%0APrev%207d%20GPV%3A%20%24${merchant.prevSevenDaysGPV.toLocaleString()}%0ALast%207d%20GPV%3A%20%24${merchant.lastSevenDaysGPV.toLocaleString()}%0A%0APlease%20follow%20up%20with%20this%20account.`}>
                                                                    <Button size="sm" variant="outline" className="h-7 text-xs px-2 gap-1">
                                                                        <Mail className="h-3 w-3" />Email AM
                                                                    </Button>
                                                                </a>
                                                                <Button size="sm" variant="outline" className="h-7 text-xs px-2 gap-1">
                                                                    <User className="h-3 w-3" />Log Call
                                                                </Button>
                                                                <Link href={`/manage/merchants/${merchant.id}`}>
                                                                    <Button size="sm" variant="outline" className="h-7 text-xs">
                                                                        <ExternalLink className="h-3 w-3 mr-1" />View
                                                                    </Button>
                                                                </Link>
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                )
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>

                                {churnData.atRiskMerchants.length > 10 && (
                                    <div className="mt-3 text-center">
                                        <Button variant="outline" size="sm">View All {churnData.totalAtRisk} At-Risk Merchants</Button>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
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
        </div>
    )
}