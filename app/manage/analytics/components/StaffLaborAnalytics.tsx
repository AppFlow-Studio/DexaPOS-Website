'use client'

import { useState, useMemo } from 'react'
import { useStaffLaborAnalytics } from '@/lib/queries/use-platform-analytics'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Cell,
} from 'recharts'
import { ArrowUpDown, Clock, Users, TrendingUp, AlertTriangle, Zap, AlertCircle } from 'lucide-react'
import type { MerchantLaborStat } from '@/app/manage/actions/hq-platform/analytics'

type SortKey = 'totalHours' | 'activeStaff' | 'totalOrders' | 'hoursPerOrder' | 'merchantName'

function fmt(n: number) {
    return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

export function StaffLaborAnalytics() {
    const [days, setDays] = useState(30)
    const [sortKey, setSortKey] = useState<SortKey>('totalHours')
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

    const { data, isLoading } = useStaffLaborAnalytics(days)

    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDir(d => d === 'desc' ? 'asc' : 'desc')
        } else {
            setSortKey(key)
            setSortDir(key === 'merchantName' ? 'asc' : 'desc')
        }
    }

    const sortedMerchants = useMemo(() => {
        if (!data?.merchantStats) return []
        return [...data.merchantStats].sort((a, b) => {
            const aVal = sortKey === 'merchantName' ? a.merchantName : (a[sortKey] ?? -1)
            const bVal = sortKey === 'merchantName' ? b.merchantName : (b[sortKey] ?? -1)
            if (typeof aVal === 'string' && typeof bVal === 'string') {
                return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
            }
            return sortDir === 'asc' ? Number(aVal) - Number(bVal) : Number(bVal) - Number(aVal)
        })
    }, [data?.merchantStats, sortKey, sortDir])

    if (isLoading) {
        return (
            <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                    {[...Array(3)].map((_, i) => (
                        <Card key={i}><CardContent className="pt-6"><Skeleton className="h-12 w-full" /></CardContent></Card>
                    ))}
                </div>
                <div className="grid grid-cols-4 gap-4">
                    {[...Array(4)].map((_, i) => (
                        <Card key={i}><CardContent className="pt-6"><Skeleton className="h-10 w-full" /></CardContent></Card>
                    ))}
                </div>
                <Skeleton className="h-75 w-full" />
            </div>
        )
    }

    if (!data) return null

    const { sessionHealth } = data
    const totalOpenShifts = data.openShiftsCount

    const peakHour = data.hourlyPattern.reduce((max, h) => h.shiftCount > max.shiftCount ? h : max, data.hourlyPattern[0])
    const peakDay = data.dayOfWeekPattern.reduce((max, d) => d.shiftCount > max.shiftCount ? d : max, data.dayOfWeekPattern[0])

    return (
        <div className="space-y-6">
            {/* Period selector */}
            <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Period:</span>
                <Select value={String(days)} onValueChange={v => setDays(Number(v))}>
                    <SelectTrigger className="w-32 h-8 text-xs">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="7">Last 7 days</SelectItem>
                        <SelectItem value="30">Last 30 days</SelectItem>
                        <SelectItem value="90">Last 90 days</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Open shifts warning */}
            {totalOpenShifts > 0 && (
                <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
                    <div>
                        <span className="font-semibold">{totalOpenShifts} open shift{totalOpenShifts > 1 ? 's' : ''} detected.</span>
                        {' '}Staff clocked in but never clocked out. Their hours are excluded from totals to prevent inflated data.
                        Hours shown reflect <span className="font-semibold">completed shifts only</span>.
                    </div>
                </div>
            )}

            {/* Labor KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-2">
                            <Clock className="h-5 w-5 text-blue-500" />
                            <div>
                                <p className="text-2xl font-bold">{data.totalStaffHours.toLocaleString()}h</p>
                                <p className="text-xs text-muted-foreground">Total Staff Hours</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-2">
                            <Users className="h-5 w-5 text-green-500" />
                            <div>
                                <p className="text-2xl font-bold">{data.totalActiveStaff.toLocaleString()}</p>
                                <p className="text-xs text-muted-foreground">Active Staff Members</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-2">
                            <TrendingUp className="h-5 w-5 text-purple-500" />
                            <div>
                                <p className="text-2xl font-bold">{data.avgHoursPerStaffPerWeek}h</p>
                                <p className="text-xs text-muted-foreground">Avg Hours / Staff / Week</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Session Health */}
            <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <Zap className="h-4 w-4 text-primary" />
                    Session Health
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Card>
                        <CardContent className="pt-6">
                            <p className="text-2xl font-bold">{sessionHealth.totalSessions.toLocaleString()}</p>
                            <p className="text-xs text-muted-foreground">Total Sessions</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-6">
                            <p className="text-2xl font-bold">
                                {sessionHealth.avgSessionMinutes !== null
                                    ? sessionHealth.avgSessionMinutes >= 60
                                        ? `${Math.floor(sessionHealth.avgSessionMinutes / 60)}h ${sessionHealth.avgSessionMinutes % 60}m`
                                        : `${sessionHealth.avgSessionMinutes}m`
                                    : '—'}
                            </p>
                            <p className="text-xs text-muted-foreground">Avg Session Duration</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-6">
                            <p className={`text-2xl font-bold ${sessionHealth.kickedPercent > 5 ? 'text-amber-600' : 'text-foreground'}`}>
                                {sessionHealth.kickedPercent}%
                            </p>
                            <p className="text-xs text-muted-foreground">
                                Kicked ({sessionHealth.kickedSessions.toLocaleString()} sessions)
                            </p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-6">
                            <p className={`text-2xl font-bold ${sessionHealth.crashedPercent > 2 ? 'text-red-600' : 'text-foreground'}`}>
                                {sessionHealth.crashedPercent}%
                            </p>
                            <p className="text-xs text-muted-foreground">
                                Crashed ({sessionHealth.crashedSessions.toLocaleString()} sessions)
                            </p>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Peak Staffing Charts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Hourly pattern */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm font-medium">Peak Hours</CardTitle>
                        <CardDescription className="text-xs">
                            Shifts started by hour of day — peak at <span className="font-medium">{peakHour?.label}</span>
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={data.hourlyPattern} barCategoryGap="10%">
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis
                                    dataKey="label"
                                    tick={{ fontSize: 9 }}
                                    tickLine={false}
                                    axisLine={false}
                                    interval={2}
                                />
                                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                                <Tooltip
                                    content={({ active, payload }) => {
                                        if (active && payload && payload.length) {
                                            const d = payload[0].payload
                                            return (
                                                <div className="bg-background border rounded-lg p-2 shadow-sm text-xs">
                                                    <p className="font-medium">{d.label}</p>
                                                    <p className="text-muted-foreground">{d.shiftCount} shifts started</p>
                                                </div>
                                            )
                                        }
                                        return null
                                    }}
                                />
                                <Bar dataKey="shiftCount" name="Shifts" radius={[3, 3, 0, 0]}>
                                    {data.hourlyPattern.map((entry, i) => (
                                        <Cell
                                            key={i}
                                            fill={entry.hour === peakHour?.hour ? '#6366f1' : '#94a3b8'}
                                        />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                {/* Day of week pattern */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm font-medium">Day of Week</CardTitle>
                        <CardDescription className="text-xs">
                            Shifts started by day — busiest on <span className="font-medium">{peakDay?.day}</span>
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={data.dayOfWeekPattern} barCategoryGap="20%">
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="day" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                                <Tooltip
                                    content={({ active, payload }) => {
                                        if (active && payload && payload.length) {
                                            const d = payload[0].payload
                                            return (
                                                <div className="bg-background border rounded-lg p-2 shadow-sm text-xs">
                                                    <p className="font-medium">{d.day}</p>
                                                    <p className="text-muted-foreground">{d.shiftCount} shifts started</p>
                                                </div>
                                            )
                                        }
                                        return null
                                    }}
                                />
                                <Bar dataKey="shiftCount" name="Shifts" radius={[3, 3, 0, 0]}>
                                    {data.dayOfWeekPattern.map((entry, i) => (
                                        <Cell
                                            key={i}
                                            fill={entry.dayIndex === peakDay?.dayIndex ? '#6366f1' : '#94a3b8'}
                                        />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>

            {/* Merchant Labor Table */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-sm font-medium">Merchant Labor Breakdown</CardTitle>
                            <CardDescription className="text-xs">
                                Staff hours, orders, and labor efficiency per merchant
                            </CardDescription>
                        </div>
                        {sortedMerchants.some(m => m.hoursPerOrder !== null && m.hoursPerOrder > 1) && (
                            <Badge variant="secondary" className="text-xs flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3 text-amber-500" />
                                High labor ratio detected
                            </Badge>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    {sortedMerchants.length === 0 ? (
                        <div className="py-12 text-center text-muted-foreground text-sm">
                            No shift data in this period
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/50">
                                    <TableHead
                                        className="cursor-pointer select-none hover:text-foreground"
                                        onClick={() => handleSort('merchantName')}
                                    >
                                        <span className="flex items-center gap-1">
                                            Merchant <ArrowUpDown className="h-3 w-3" />
                                        </span>
                                    </TableHead>
                                    <TableHead
                                        className="text-right cursor-pointer select-none hover:text-foreground"
                                        onClick={() => handleSort('activeStaff')}
                                    >
                                        <span className="flex items-center justify-end gap-1">
                                            Staff <ArrowUpDown className="h-3 w-3" />
                                        </span>
                                    </TableHead>
                                    <TableHead
                                        className="text-right cursor-pointer select-none hover:text-foreground"
                                        onClick={() => handleSort('totalHours')}
                                    >
                                        <span className="flex items-center justify-end gap-1">
                                            Hours <ArrowUpDown className="h-3 w-3" />
                                        </span>
                                    </TableHead>
                                    <TableHead
                                        className="text-right cursor-pointer select-none hover:text-foreground"
                                        onClick={() => handleSort('totalOrders')}
                                    >
                                        <span className="flex items-center justify-end gap-1">
                                            Orders <ArrowUpDown className="h-3 w-3" />
                                        </span>
                                    </TableHead>
                                    <TableHead
                                        className="text-right cursor-pointer select-none hover:text-foreground"
                                        onClick={() => handleSort('hoursPerOrder')}
                                    >
                                        <span className="flex items-center justify-end gap-1">
                                            Hrs / Order <ArrowUpDown className="h-3 w-3" />
                                        </span>
                                    </TableHead>
                                    <TableHead className="text-right">Open Shifts</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {sortedMerchants.map((m: MerchantLaborStat) => {
                                    const isHighRatio = m.hoursPerOrder !== null && m.hoursPerOrder > 1
                                    return (
                                        <TableRow key={m.merchantId} className={isHighRatio ? 'bg-amber-50/50' : ''}>
                                            <TableCell className="text-sm font-medium py-2">
                                                {m.merchantName}
                                                {isHighRatio && (
                                                    <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 py-0 text-amber-700">
                                                        High ratio
                                                    </Badge>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-sm text-right py-2">{m.activeStaff}</TableCell>
                                            <TableCell className="text-sm text-right py-2 font-mono">{m.totalHours.toLocaleString()}h</TableCell>
                                            <TableCell className="text-sm text-right py-2 text-muted-foreground">{fmt(m.totalOrders)}</TableCell>
                                            <TableCell className="text-right py-2">
                                                {m.hoursPerOrder !== null ? (
                                                    <span className={`text-sm font-mono font-medium ${isHighRatio ? 'text-amber-600' : 'text-foreground'}`}>
                                                        {m.hoursPerOrder}h
                                                    </span>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground italic">No orders</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right py-2">
                                                {m.openShiftsCount > 0 ? (
                                                    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
                                                        <AlertCircle className="h-3 w-3" />
                                                        {m.openShiftsCount}
                                                    </span>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground">—</span>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    )
                                })}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
