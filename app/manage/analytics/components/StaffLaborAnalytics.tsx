'use client'

import { useState, useMemo } from 'react'
import { useStaffLaborAnalytics } from '@/lib/queries/use-platform-analytics'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
    MobileColumnsButton,
    initialHiddenColumns,
    type ReportColumn,
} from '@/components/dashboard/reports/MobileColumnsButton'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Cell,
} from 'recharts'
import { ArrowUpDown, Clock, Zap, AlertCircle, CalendarDays, Table2 } from 'lucide-react'
import { Panel } from '@/components/dashboard/shell/Panel'
import { PanelSection } from '@/components/dashboard/shell/PanelSection'
import { StatRow, StatTile } from '@/components/dashboard/shell/StatTile'
import { AnalyticsTooltip, VALUE_AXIS_WIDTH_MOBILE } from '@/app/manage/components/analytics-primitives'
import type { MerchantLaborStat } from '@/app/manage/actions/hq-platform/analytics'

type SortKey = 'totalHours' | 'activeStaff' | 'totalOrders' | 'hoursPerOrder' | 'merchantName'

function fmt(n: number) {
    return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

/** Peak bars are highlighted against the rest — data encoding, not status (§4.6b). */
const PEAK_FILL = '#6366f1'
const BASE_FILL = '#94a3b8'

/**
 * Mobile column meta for the merchant labor breakdown. Hours is both the
 * default sort key and the measure the panel is about, so it stays visible.
 */
const MERCHANT_LABOR_COLUMNS: ReportColumn[] = [
    { id: 'merchant', label: 'Merchant', locked: true },
    { id: 'staff', label: 'Staff', defaultHidden: true },
    { id: 'hours', label: 'Hours' },
    { id: 'orders', label: 'Orders', defaultHidden: true },
    { id: 'hrsPerOrder', label: 'Hrs / Order', defaultHidden: true },
    { id: 'openShifts', label: 'Open Shifts', defaultHidden: true },
]

export function StaffLaborAnalytics() {
    const [days, setDays] = useState(30)
    const [sortKey, setSortKey] = useState<SortKey>('totalHours')
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
    const isMobile = useIsMobile()
    const [hiddenCols, setHiddenCols] = useState<Set<string>>(() =>
        initialHiddenColumns(MERCHANT_LABOR_COLUMNS)
    )
    const showCol = (id: string) => !isMobile || !hiddenCols.has(id)

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

    const periodSelect = (
        <Select value={String(days)} onValueChange={v => setDays(Number(v))}>
            <SelectTrigger className="h-9 w-36 rounded-full border-0 bg-muted/60 px-3 shadow-none">
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
        </Select>
    )

    if (isLoading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-40 w-full rounded-3xl" />
                <Skeleton className="h-40 w-full rounded-3xl" />
                <Skeleton className="h-75 w-full rounded-3xl" />
            </div>
        )
    }

    if (!data) return null

    const { sessionHealth } = data
    const totalOpenShifts = data.openShiftsCount

    const peakHour = data.hourlyPattern.reduce((max, h) => h.shiftCount > max.shiftCount ? h : max, data.hourlyPattern[0])
    const peakDay = data.dayOfWeekPattern.reduce((max, d) => d.shiftCount > max.shiftCount ? d : max, data.dayOfWeekPattern[0])

    /** A sortable column header — ghost pill, never bare text (§5.2). */
    const sortHeader = (key: SortKey, label: string, align: 'left' | 'right' = 'right') => (
        <Button
            variant="ghost"
            onClick={() => handleSort(key)}
            className={`h-8 rounded-full px-2 ${align === 'right' ? '-mr-2 ml-auto flex' : '-ml-2'}`}
        >
            {label}
            <ArrowUpDown className="ml-2 h-3 w-3" />
        </Button>
    )

    return (
        <div className="space-y-6">
            <Panel>
                <PanelSection label="Staff labor" icon={Clock} action={periodSelect}>
                    <div className="space-y-6">
                        {totalOpenShifts > 0 && (
                            // Inset note, not a bordered alert box: §5.5 keeps
                            // separation on fill rather than a drawn edge.
                            <div className="flex items-start gap-3 rounded-2xl bg-muted/60 px-4 py-3 text-sm">
                                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                                <div className="min-w-0">
                                    <span className="font-semibold">
                                        {totalOpenShifts} open shift{totalOpenShifts > 1 ? 's' : ''} detected.
                                    </span>{' '}
                                    Staff clocked in but never clocked out. Their hours are excluded from totals to
                                    prevent inflated data. Hours shown reflect{' '}
                                    <span className="font-semibold">completed shifts only</span>.
                                </div>
                            </div>
                        )}

                        <StatRow columns={3}>
                            <StatTile
                                label="Total Staff Hours"
                                value={`${data.totalStaffHours.toLocaleString()}h`}
                            />
                            <StatTile
                                label="Active Staff Members"
                                value={data.totalActiveStaff.toLocaleString()}
                            />
                            <StatTile
                                label="Avg Hours / Staff / Week"
                                value={`${data.avgHoursPerStaffPerWeek}h`}
                            />
                        </StatRow>
                    </div>
                </PanelSection>
            </Panel>

            <Panel>
                <PanelSection label="Session health" icon={Zap}>
                    <StatRow columns={4}>
                        <StatTile label="Total Sessions" value={sessionHealth.totalSessions.toLocaleString()} />
                        <StatTile
                            label="Avg Session Duration"
                            value={
                                sessionHealth.avgSessionMinutes !== null
                                    ? sessionHealth.avgSessionMinutes >= 60
                                        ? `${Math.floor(sessionHealth.avgSessionMinutes / 60)}h ${sessionHealth.avgSessionMinutes % 60}m`
                                        : `${sessionHealth.avgSessionMinutes}m`
                                    : '—'
                            }
                        />
                        <StatTile
                            label="Kicked"
                            value={`${sessionHealth.kickedPercent}%`}
                            meta={`${sessionHealth.kickedSessions.toLocaleString()} sessions`}
                        />
                        <StatTile
                            label="Crashed"
                            value={`${sessionHealth.crashedPercent}%`}
                            meta={`${sessionHealth.crashedSessions.toLocaleString()} sessions`}
                        />
                    </StatRow>
                </PanelSection>
            </Panel>

            <div className="grid min-w-0 grid-cols-1 gap-6 md:grid-cols-2">
                <Panel>
                    <PanelSection
                        label="Peak hours"
                        icon={Clock}
                        caption={`Shifts started by hour of day — peak at ${peakHour?.label ?? '—'}`}
                    >
                        <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={data.hourlyPattern} barCategoryGap="10%">
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="label" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} interval={2} />
                                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} width={isMobile ? VALUE_AXIS_WIDTH_MOBILE : undefined} />
                                <Tooltip content={<AnalyticsTooltip formatter={(v: number) => `${v} shifts started`} />} />
                                <Bar dataKey="shiftCount" name="Shifts" radius={[3, 3, 0, 0]}>
                                    {data.hourlyPattern.map((entry, i) => (
                                        <Cell key={i} fill={entry.hour === peakHour?.hour ? PEAK_FILL : BASE_FILL} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </PanelSection>
                </Panel>

                <Panel>
                    <PanelSection
                        label="Day of week"
                        icon={CalendarDays}
                        caption={`Shifts started by day — busiest on ${peakDay?.day ?? '—'}`}
                    >
                        <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={data.dayOfWeekPattern} barCategoryGap="20%">
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="day" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} width={isMobile ? VALUE_AXIS_WIDTH_MOBILE : undefined} />
                                <Tooltip content={<AnalyticsTooltip formatter={(v: number) => `${v} shifts started`} />} />
                                <Bar dataKey="shiftCount" name="Shifts" radius={[3, 3, 0, 0]}>
                                    {data.dayOfWeekPattern.map((entry, i) => (
                                        <Cell key={i} fill={entry.dayIndex === peakDay?.dayIndex ? PEAK_FILL : BASE_FILL} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </PanelSection>
                </Panel>
            </div>

            <Panel>
                <PanelSection
                    label="Merchant labor breakdown"
                    icon={Table2}
                    caption="Staff hours, orders, and labor efficiency per merchant"
                    action={
                        <MobileColumnsButton
                            columns={MERCHANT_LABOR_COLUMNS}
                            hidden={hiddenCols}
                            onChange={setHiddenCols}
                        />
                    }
                >
                    {sortedMerchants.length === 0 ? (
                        <div className="py-12 text-center text-sm text-muted-foreground">
                            No shift data in this period
                        </div>
                    ) : (
                        // Min-width lifted on mobile so hidden columns actually
                        // narrow the table rather than leaving it scrolling sideways.
                        <Table variant="data" className={cn(!isMobile && 'min-w-[720px]')}>
                            <TableHeader className="[&_tr]:border-0">
                                <TableRow>
                                    <TableHead>{sortHeader('merchantName', 'Merchant', 'left')}</TableHead>
                                    {showCol('staff') && <TableHead className="text-right">{sortHeader('activeStaff', 'Staff')}</TableHead>}
                                    {showCol('hours') && <TableHead className="text-right">{sortHeader('totalHours', 'Hours')}</TableHead>}
                                    {showCol('orders') && <TableHead className="text-right">{sortHeader('totalOrders', 'Orders')}</TableHead>}
                                    {showCol('hrsPerOrder') && <TableHead className="text-right">{sortHeader('hoursPerOrder', 'Hrs / Order')}</TableHead>}
                                    {showCol('openShifts') && <TableHead className="text-right">Open Shifts</TableHead>}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {sortedMerchants.map((m: MerchantLaborStat) => {
                                    const isHighRatio = m.hoursPerOrder !== null && m.hoursPerOrder > 1
                                    return (
                                        <TableRow key={m.merchantId}>
                                            <TableCell className="font-medium">
                                                {m.merchantName}
                                                {isHighRatio && (
                                                    <span className="ml-2 text-xs text-muted-foreground">High ratio</span>
                                                )}
                                            </TableCell>
                                            {showCol('staff') && (
                                                <TableCell className="text-right tabular-nums">{m.activeStaff}</TableCell>
                                            )}
                                            {showCol('hours') && (
                                                <TableCell className="text-right tabular-nums">{m.totalHours.toLocaleString()}h</TableCell>
                                            )}
                                            {showCol('orders') && (
                                                <TableCell className="text-right tabular-nums text-muted-foreground">{fmt(m.totalOrders)}</TableCell>
                                            )}
                                            {showCol('hrsPerOrder') && (
                                                <TableCell className="text-right tabular-nums">
                                                    {m.hoursPerOrder !== null ? (
                                                        <span className="font-medium">{m.hoursPerOrder}h</span>
                                                    ) : (
                                                        <span className="text-xs italic text-muted-foreground">No orders</span>
                                                    )}
                                                </TableCell>
                                            )}
                                            {showCol('openShifts') && (
                                                <TableCell className="text-right tabular-nums">
                                                    {m.openShiftsCount > 0 ? (
                                                        <span className="inline-flex items-center gap-1 text-xs font-medium">
                                                            <AlertCircle className="h-3 w-3" />
                                                            {m.openShiftsCount}
                                                        </span>
                                                    ) : (
                                                        <span className="text-xs text-muted-foreground">—</span>
                                                    )}
                                                </TableCell>
                                            )}
                                        </TableRow>
                                    )
                                })}
                            </TableBody>
                        </Table>
                    )}
                </PanelSection>
            </Panel>
        </div>
    )
}
