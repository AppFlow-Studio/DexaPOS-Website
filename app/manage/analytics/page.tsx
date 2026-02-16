'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
    BarChart3,
    TrendingUp,
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
} from 'lucide-react'
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    BarChart,
    Bar,
    PieChart,
    Pie,
    Cell,
    LineChart,
    Line
} from 'recharts'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { ChartContainer, ChartTooltip } from '@/components/ui/chart'
import { useGPVConcentration } from '@/lib/queries/use-platform-analytics'
import type { ConcentrationRisk } from '../actions/hq-platform/analytics'
import Link from 'next/link'

const revenueData = [
    { month: 'Jan', revenue: 12000, transactions: 450 },
    { month: 'Feb', revenue: 15000, transactions: 520 },
    { month: 'Mar', revenue: 18000, transactions: 680 },
    { month: 'Apr', revenue: 22000, transactions: 750 },
    { month: 'May', revenue: 25000, transactions: 820 },
    { month: 'Jun', revenue: 28000, transactions: 950 },
]

const merchantTypeData = [
    { name: 'Restaurants', value: 35, color: '#8884d8' },
    { name: 'Retail', value: 25, color: '#82ca9d' },
    { name: 'Services', value: 20, color: '#ffc658' },
    { name: 'Healthcare', value: 12, color: '#ff7300' },
    { name: 'Other', value: 8, color: '#00ff00' },
]

const dailyTransactions = [
    { day: 'Mon', transactions: 1200, revenue: 8000 },
    { day: 'Tue', transactions: 1900, revenue: 12000 },
    { day: 'Wed', transactions: 3000, revenue: 18000 },
    { day: 'Thu', transactions: 2800, revenue: 16000 },
    { day: 'Fri', transactions: 1890, revenue: 11000 },
    { day: 'Sat', transactions: 2390, revenue: 14000 },
    { day: 'Sun', transactions: 1490, revenue: 9000 },
]

const topMerchants = [
    { name: 'Coffee Corner', revenue: 12500, growth: 12.5 },
    { name: 'Tech Store Pro', revenue: 9800, growth: 8.2 },
    { name: 'Fresh Market', revenue: 7200, growth: -2.1 },
    { name: 'Beauty Salon', revenue: 5600, growth: 15.3 },
    { name: 'Pharmacy Plus', revenue: 4200, growth: 5.7 },
]

const whaleChartConfig = {
    gpvConcentration: {
        label: 'GPV Concentration',
        color: 'hsl(var(--chart-3))',
    },
    equalLine: {
        label: 'Perfect Equality',
        color: 'hsl(var(--muted-foreground))',
    },
}

export default function AnalyticsPage() {
    const [whaleWatchDays, setWhaleWatchDays] = useState<number>(30)
    const [whaleSortKey, setWhaleSortKey] = useState<'monthlyGPV' | 'percentOfTotal' | 'trend'>('monthlyGPV')
    const [whaleSortDir, setWhaleSortDir] = useState<'asc' | 'desc'>('desc')

    const { data: gpvData, isLoading: gpvLoading } = useGPVConcentration(whaleWatchDays)

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
        if (whaleSortKey === key) {
            setWhaleSortDir(prev => prev === 'desc' ? 'asc' : 'desc')
        } else {
            setWhaleSortKey(key)
            setWhaleSortDir('desc')
        }
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
                    <p className="text-muted-foreground">
                        Comprehensive insights into your POS system performance
                    </p>
                </div>
                <div className="flex items-center space-x-2">
                    <Button variant="outline">Export Report</Button>
                    <Button>Generate Insights</Button>
                </div>
            </div>

            {/* Key Metrics */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">$28,000</div>
                        <p className="text-xs text-muted-foreground">
                            <span className="text-green-600">+12.5%</span> from last month
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active Merchants</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">1,156</div>
                        <p className="text-xs text-muted-foreground">
                            <span className="text-green-600">+8.2%</span> from last month
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Transactions</CardTitle>
                        <CreditCard className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">4,270</div>
                        <p className="text-xs text-muted-foreground">
                            <span className="text-green-600">+15.3%</span> from last month
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Avg. Transaction</CardTitle>
                        <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">$6.56</div>
                        <p className="text-xs text-muted-foreground">
                            <span className="text-red-600">-2.1%</span> from last month
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Analytics Tabs */}
            <Tabs defaultValue="overview" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="revenue">Revenue</TabsTrigger>
                    <TabsTrigger value="merchants">Merchants</TabsTrigger>
                    <TabsTrigger value="transactions">Transactions</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                        <Card>
                            <CardHeader>
                                <CardTitle>Revenue Trend</CardTitle>
                                <CardDescription>Monthly revenue over the last 6 months</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <ResponsiveContainer width="100%" height={300}>
                                    <AreaChart data={revenueData}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="month" />
                                        <YAxis />
                                        <Tooltip />
                                        <Area
                                            type="monotone"
                                            dataKey="revenue"
                                            stroke="hsl(var(--primary))"
                                            fill="hsl(var(--primary))"
                                            fillOpacity={0.3}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Merchant Types</CardTitle>
                                <CardDescription>Distribution of merchants by type</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <ResponsiveContainer width="100%" height={300}>
                                    <PieChart>
                                        <Pie
                                            data={merchantTypeData}
                                            cx="50%"
                                            cy="50%"
                                            labelLine={false}
                                            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                            outerRadius={80}
                                            fill="#8884d8"
                                            dataKey="value"
                                        >
                                            {merchantTypeData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} />
                                            ))}
                                        </Pie>
                                        <Tooltip />
                                    </PieChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                <TabsContent value="revenue" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Revenue Analytics</CardTitle>
                            <CardDescription>Detailed revenue breakdown and trends</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <ResponsiveContainer width="100%" height={400}>
                                <LineChart data={revenueData}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="month" />
                                    <YAxis />
                                    <Tooltip />
                                    <Line
                                        type="monotone"
                                        dataKey="revenue"
                                        stroke="hsl(var(--primary))"
                                        strokeWidth={2}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="merchants" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Top Performing Merchants</CardTitle>
                            <CardDescription>Revenue by merchant this month</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <ResponsiveContainer width="100%" height={400}>
                                <BarChart data={topMerchants}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="name" />
                                    <YAxis />
                                    <Tooltip />
                                    <Bar dataKey="revenue" fill="hsl(var(--primary))" />
                                </BarChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="transactions" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Daily Transaction Volume</CardTitle>
                            <CardDescription>Transaction patterns throughout the week</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <ResponsiveContainer width="100%" height={400}>
                                <BarChart data={dailyTransactions}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="day" />
                                    <YAxis />
                                    <Tooltip />
                                    <Bar dataKey="transactions" fill="hsl(var(--primary))" />
                                </BarChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* ================================================================ */}
            {/* Whale Watch — GPV Concentration Risk Intelligence Module        */}
            {/* ================================================================ */}

            {/* Section Header with Date Range Selector */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Crown className="h-5 w-5 text-primary" />
                    <div>
                        <h2 className="text-lg font-semibold">Whale Watch</h2>
                        <p className="text-sm text-muted-foreground">GPV concentration risk analysis</p>
                    </div>
                    {!gpvLoading && currentRisk && (
                        <Badge variant={currentRisk.variant} className="flex items-center gap-1 ml-2">
                            <currentRisk.icon className="h-3 w-3" />
                            {currentRisk.label}
                        </Badge>
                    )}
                </div>
                <Select value={String(whaleWatchDays)} onValueChange={(v) => setWhaleWatchDays(Number(v))}>
                    <SelectTrigger className="w-[130px]">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="7">Last 7 Days</SelectItem>
                        <SelectItem value="30">Last 30 Days</SelectItem>
                        <SelectItem value="90">Last 90 Days</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Executive KPI Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Total GPV</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {gpvLoading ? (
                            <Skeleton className="h-8 w-28" />
                        ) : (
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
                        {gpvLoading ? (
                            <Skeleton className="h-8 w-20" />
                        ) : (
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
                        {gpvLoading ? (
                            <Skeleton className="h-8 w-20" />
                        ) : (
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
                        {gpvLoading ? (
                            <Skeleton className="h-8 w-24" />
                        ) : currentRisk ? (
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

            {/* Lorenz Chart + Whale Table */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                {/* Lorenz Curve */}
                <Card className="col-span-4">
                    <CardHeader>
                        <CardTitle>GPV Distribution</CardTitle>
                        <CardDescription>Lorenz curve — gap from diagonal indicates concentration</CardDescription>
                    </CardHeader>
                    <CardContent className="pl-2">
                        {gpvLoading ? (
                            <div className="h-[320px] flex items-center justify-center">
                                <Skeleton className="h-[300px] w-full" />
                            </div>
                        ) : gpvData && gpvData.totalMerchants >= 2 ? (
                            <ChartContainer config={whaleChartConfig} className="h-[320px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={gpvData.lorenzCurve}>
                                        <defs>
                                            <linearGradient id="concentrationGap" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="hsl(var(--chart-3))" stopOpacity={0.3} />
                                                <stop offset="100%" stopColor="hsl(var(--chart-3))" stopOpacity={0.05} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                        <XAxis
                                            dataKey="merchantPercentile"
                                            tickLine={false}
                                            axisLine={false}
                                            tickMargin={8}
                                            tickFormatter={(val) => `${val}%`}
                                            label={{ value: '% of Merchants (ranked by volume)', position: 'insideBottom', offset: -4, style: { fontSize: 11, fill: 'hsl(var(--muted-foreground))' } }}
                                        />
                                        <YAxis
                                            tickLine={false}
                                            axisLine={false}
                                            tickFormatter={(val) => `${val}%`}
                                            label={{ value: '% of Total GPV', angle: -90, position: 'insideLeft', offset: 10, style: { fontSize: 11, fill: 'hsl(var(--muted-foreground))' } }}
                                        />
                                        <ChartTooltip
                                            content={({ active, payload }) => {
                                                if (active && payload && payload.length) {
                                                    const d = payload[0].payload
                                                    return (
                                                        <div className="bg-background border rounded-lg p-3 shadow-sm text-xs space-y-1">
                                                            <p className="font-medium text-foreground">
                                                                {d.merchantCount} of {gpvData.totalMerchants} merchants
                                                            </p>
                                                            <p className="text-muted-foreground">
                                                                Bottom <span className="font-bold text-foreground">{d.merchantPercentile}%</span> of merchants
                                                            </p>
                                                            <p className="text-muted-foreground">
                                                                generate <span className="font-bold text-foreground">{d.gpvPercentile}%</span> of GPV
                                                            </p>
                                                            <p className="text-muted-foreground border-t pt-1 mt-1">
                                                                Equal share would be <span className="font-bold text-foreground">{d.equalityLine}%</span>
                                                            </p>
                                                        </div>
                                                    )
                                                }
                                                return null
                                            }}
                                        />
                                        {/* Equality diagonal */}
                                        <Area
                                            type="linear"
                                            dataKey="equalityLine"
                                            stroke="hsl(var(--muted-foreground))"
                                            strokeDasharray="5 5"
                                            strokeOpacity={0.5}
                                            fill="none"
                                            strokeWidth={1.5}
                                        />
                                        {/* Lorenz curve */}
                                        <Area
                                            type="monotone"
                                            dataKey="gpvPercentile"
                                            stroke="hsl(var(--chart-3))"
                                            fill="url(#concentrationGap)"
                                            strokeWidth={2.5}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </ChartContainer>
                        ) : (
                            <div className="h-[320px] flex flex-col items-center justify-center text-muted-foreground gap-3">
                                <AlertTriangle className="h-10 w-10 opacity-30" />
                                <div className="text-center">
                                    <p className="text-sm font-medium">Insufficient data for concentration analysis</p>
                                    <p className="text-xs mt-1">
                                        Requires at least 20 merchants.
                                        Current merchants detected: <span className="font-bold text-foreground">{gpvData?.totalMerchants || 0}</span>
                                    </p>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Whale List */}
                <Card className="col-span-3">
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
                            <div className="max-h-[380px] overflow-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Merchant</TableHead>
                                            <TableHead
                                                className="text-right cursor-pointer select-none hover:text-foreground"
                                                onClick={() => handleWhaleSort('monthlyGPV')}
                                            >
                                                <span className="flex items-center justify-end gap-1">
                                                    GPV
                                                    <ArrowUpDown className="h-3 w-3" />
                                                </span>
                                            </TableHead>
                                            <TableHead
                                                className="text-right cursor-pointer select-none hover:text-foreground"
                                                onClick={() => handleWhaleSort('percentOfTotal')}
                                            >
                                                <span className="flex items-center justify-end gap-1">
                                                    % Total
                                                    <ArrowUpDown className="h-3 w-3" />
                                                </span>
                                            </TableHead>
                                            <TableHead
                                                className="text-right cursor-pointer select-none hover:text-foreground"
                                                onClick={() => handleWhaleSort('trend')}
                                            >
                                                <span className="flex items-center justify-end gap-1">
                                                    Trend
                                                    <ArrowUpDown className="h-3 w-3" />
                                                </span>
                                            </TableHead>
                                            <TableHead className="text-right">AM</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {sortedWhaleList.map((whale) => (
                                            <TableRow key={whale.id}>
                                                <TableCell>
                                                    <Link href={`/manage/merchants/${whale.id}`} className="hover:underline font-medium text-sm">
                                                        {whale.name}
                                                    </Link>
                                                    <p className="text-xs text-muted-foreground">{whale.transactions.toLocaleString()} txns</p>
                                                </TableCell>
                                                <TableCell className="text-right font-medium text-sm">
                                                    ${whale.monthlyGPV.toLocaleString()}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Badge variant="secondary" className="text-xs">{whale.percentOfTotal}%</Badge>
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
                                                            <User className="h-3 w-3 mr-1" />
                                                            Unassigned
                                                        </Badge>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        ) : (
                            <div className="h-[300px] flex flex-col items-center justify-center text-muted-foreground gap-3">
                                <Crown className="h-10 w-10 opacity-30" />
                                <div className="text-center">
                                    <p className="text-sm font-medium">No whale merchants detected</p>
                                    <p className="text-xs mt-1">
                                        No merchants above $100k GPV in the last {whaleWatchDays} days.
                                    </p>
                                    <p className="text-xs">Whales will appear here as processing volume grows.</p>
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

            {/* Context Summary */}
            {!gpvLoading && gpvData && gpvData.totalMerchants > 0 && (
                <Card>
                    <CardContent className="pt-6">
                        <div className="grid gap-6 md:grid-cols-4">
                            <div className="text-center">
                                <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Merchants</p>
                                <p className="text-xl font-bold mt-1">{gpvData.totalMerchants.toLocaleString()}</p>
                            </div>
                            <div className="text-center">
                                <p className="text-xs text-muted-foreground uppercase tracking-wider">Total GPV</p>
                                <p className="text-xl font-bold mt-1">${gpvData.totalGPV.toLocaleString()}</p>
                            </div>
                            <div className="text-center">
                                <p className="text-xs text-muted-foreground uppercase tracking-wider">Avg Merchant GPV</p>
                                <p className="text-xl font-bold mt-1">${gpvData.averageGPV.toLocaleString()}</p>
                            </div>
                            <div className="text-center">
                                <p className="text-xs text-muted-foreground uppercase tracking-wider">Median Merchant GPV</p>
                                <p className="text-xl font-bold mt-1">${gpvData.medianGPV.toLocaleString()}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
