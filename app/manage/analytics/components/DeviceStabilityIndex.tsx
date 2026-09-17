'use client'

import { useState } from 'react'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import {
    MobileColumnsButton,
    initialHiddenColumns,
    type ReportColumn,
} from '@/components/dashboard/reports/MobileColumnsButton'
import { Panel } from '@/components/dashboard/shell/Panel'
import { PanelSection } from '@/components/dashboard/shell/PanelSection'
import { StatRow, StatTile } from '@/components/dashboard/shell/StatTile'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
    ResponsiveContainer,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    Cell,
} from 'recharts'
import {
    Smartphone,
    ShieldCheck,
    ShieldAlert,
    AlertTriangle,
    ArrowLeft,
    Monitor,
    Cpu,
    ChevronRight,
} from 'lucide-react'
import { useDeviceStability, useVersionDrillDown } from '@/lib/queries/use-platform-analytics'

/**
 * Mobile column meta for the version summary table. Instability is the rate the
 * whole panel exists to surface, so it stays beside the version number.
 */
const VERSION_DETAIL_COLUMNS: ReportColumn[] = [
    { id: 'version', label: 'Version', locked: true },
    { id: 'signals', label: 'Signals', defaultHidden: true },
    { id: 'degraded', label: 'Degraded', defaultHidden: true },
    { id: 'instability', label: 'Instability' },
    { id: 'status', label: 'Status', defaultHidden: true },
]

export default function DeviceStabilityIndex() {
    const [days, setDays] = useState<number>(30)
    const [selectedVersion, setSelectedVersion] = useState<string | null>(null)
    const isMobile = useIsMobile()
    const [versionHiddenCols, setVersionHiddenCols] = useState<Set<string>>(() =>
        initialHiddenColumns(VERSION_DETAIL_COLUMNS)
    )
    const showVersionCol = (id: string) => !isMobile || !versionHiddenCols.has(id)

    const { data: stabilityData, isLoading } = useDeviceStability(days)
    const { data: drillDownData, isLoading: drillDownLoading } = useVersionDrillDown(selectedVersion, days)

    const INSTABILITY_THRESHOLD = 1 // 1% threshold

    return (
        <>
            {/* ================================================================ */}
            {/* TICKET-003: LANDI Device Stability Index                         */}
            {/* ================================================================ */}

            {/* Section Header */}
            <div className="flex flex-wrap items-center gap-3 justify-between">
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <Smartphone className="h-5 w-5 text-primary shrink-0" />
                    <div className="min-w-0">
                        <h2 className="text-lg font-semibold">Device Stability Index</h2>
                        <p className="text-sm text-muted-foreground">
                            Instability rate per app version — offline heartbeats &amp; kicked sessions
                        </p>
                    </div>
                    {!isLoading && stabilityData && (
                        stabilityData.overallInstabilityRate <= INSTABILITY_THRESHOLD ? (
                            <span className="flex shrink-0 items-center gap-1 text-sm text-muted-foreground">
                                <ShieldCheck className="h-3.5 w-3.5" />
                                Fleet Stable
                            </span>
                        ) : (
                            <span className="flex shrink-0 items-center gap-1 text-sm font-medium">
                                <ShieldAlert className="h-3.5 w-3.5" />
                                {stabilityData.overallInstabilityRate}% Instability
                            </span>
                        )
                    )}
                </div>
                <Select value={String(days)} onValueChange={(v) => { setDays(Number(v)); setSelectedVersion(null) }}>
                    <SelectTrigger className="w-32.5 shrink-0">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="7">Last 7 Days</SelectItem>
                        <SelectItem value="30">Last 30 Days</SelectItem>
                        <SelectItem value="90">Last 90 Days</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Rollout status note. Inset fill rather than a bordered, tinted
                banner — §5.5 carries separation on surface, and §14.3 HQ-2 keeps
                severity colour to `/manage/health` and the DLQ. */}
            {!isLoading && stabilityData?.rolloutWarning && (
                <Panel>
                    <PanelSection icon={AlertTriangle} label="Rollout hold recommended">
                        <div className="flex min-w-0 flex-col gap-2">
                            <p className="text-sm">{stabilityData.rolloutWarning}</p>
                            <p className="text-sm text-muted-foreground">
                                &gt;{INSTABILITY_THRESHOLD}% threshold breached
                            </p>
                        </div>
                    </PanelSection>
                </Panel>
            )}

            {!isLoading && stabilityData && !stabilityData.rolloutWarning && stabilityData.versionBars.length > 0 &&
                stabilityData.versionBars.every(v => v.instabilityRate <= INSTABILITY_THRESHOLD) && (
                <Panel>
                    <PanelSection icon={ShieldCheck} label="Fleet stable — clear to roll out">
                        <p className="text-sm text-muted-foreground">
                            All {stabilityData.versionBars.length} versions are below the {INSTABILITY_THRESHOLD}% instability threshold.
                            Overall rate: {stabilityData.overallInstabilityRate}%.
                        </p>
                    </PanelSection>
                </Panel>
            )}

            {isLoading ? (
                <Skeleton className="h-40 w-full rounded-3xl" />
            ) : stabilityData ? (
                <Panel>
                    <PanelSection label="Fleet stability" icon={Monitor}>
                        <StatRow columns={4}>
                            <StatTile
                                label="Total Devices"
                                icon={<Monitor />}
                                value={stabilityData.totalDevices}
                                meta={`Across ${stabilityData.versionBars.length} version${stabilityData.versionBars.length !== 1 ? 's' : ''}`}
                            />
                            <StatTile
                                label="Total Signals"
                                icon={<Cpu />}
                                value={stabilityData.totalHeartbeats.toLocaleString()}
                                meta="Heartbeats + session events"
                            />
                            <StatTile
                                label="Overall Instability"
                                icon={stabilityData.overallInstabilityRate > INSTABILITY_THRESHOLD ? <ShieldAlert /> : <ShieldCheck />}
                                value={`${stabilityData.overallInstabilityRate}%`}
                                meta={`Target: <${INSTABILITY_THRESHOLD}%`}
                            />
                            <StatTile
                                label="Versions at Risk"
                                icon={<AlertTriangle />}
                                value={stabilityData.versionBars.filter(v => v.instabilityRate > INSTABILITY_THRESHOLD).length}
                                meta={`Above ${INSTABILITY_THRESHOLD}% instability threshold`}
                            />
                        </StatRow>
                    </PanelSection>
                </Panel>
            ) : null}

            {/* Main Chart + Drill-down */}
            <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-7">

                {/* Stacked Bar Chart by Version */}
                <Panel className="lg:col-span-4">
                    <PanelSection
                        label="Stability by app version"
                        caption="Click a version bar to drill down by hardware model"
                    >
                        {isLoading ? (
                            <Skeleton className="h-87.5 w-full" />
                        ) : stabilityData && stabilityData.versionBars.length > 0 ? (
                            <ResponsiveContainer width="100%" height={350}>
                                <BarChart
                                    data={stabilityData.versionBars}
                                    onClick={(e) => {
                                        if (e?.activeLabel) {
                                            setSelectedVersion(
                                                selectedVersion === e.activeLabel ? null : e.activeLabel
                                            )
                                        }
                                    }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis
                                        dataKey="version"
                                        tickLine={false}
                                        axisLine={false}
                                        tickMargin={8}
                                        fontSize={12}
                                    />
                                    <YAxis
                                        tickLine={false}
                                        axisLine={false}
                                        tickFormatter={(val) => val.toLocaleString()}
                                        fontSize={12}
                                    />
                                    <Tooltip
                                        content={({ active, payload, label }) => {
                                            if (active && payload && payload.length) {
                                                const healthy = Number(payload[0]?.value || 0)
                                                const degraded = Number(payload[1]?.value || 0)
                                                const unhealthy = Number(payload[2]?.value || 0)
                                                const total = healthy + degraded + unhealthy
                                                const rate = total > 0 ? ((unhealthy / total) * 100).toFixed(2) : '0'
                                                return (
                                                    <div className="bg-background border rounded-lg p-3 shadow-sm text-xs space-y-1">
                                                        <p className="font-semibold text-foreground">{label}</p>
                                                        <div className="flex items-center gap-2">
                                                            <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />
                                                            <span>Healthy: {healthy.toLocaleString()}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 inline-block" />
                                                            <span>Degraded: {degraded.toLocaleString()}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
                                                            <span>Unhealthy: {unhealthy.toLocaleString()}</span>
                                                        </div>
                                                        <p className="mt-1 pt-1 text-muted-foreground">
                                                            Instability Rate: <span className="font-bold text-foreground">{rate}%</span>
                                                        </p>
                                                        <p className="text-muted-foreground italic">Click to drill down</p>
                                                    </div>
                                                )
                                            }
                                            return null
                                        }}
                                    />
                                    {/* `height` is a fixed box Recharts reserves above the
                                        plot — it does not grow with content. At phone width
                                        these three long labels wrap onto three lines and, at
                                        36px, the overflow painted straight over the bars.
                                        Mobile gets a taller box and shorter labels so the
                                        legend fits the space reserved for it. */}
                                    <Legend
                                        verticalAlign="top"
                                        height={isMobile ? 72 : 36}
                                        formatter={(value) => {
                                            if (value === 'healthy') return <span className="text-xs text-muted-foreground">{isMobile ? 'Healthy' : 'Healthy Heartbeats'}</span>
                                            if (value === 'degraded') return <span className="text-xs text-muted-foreground">{isMobile ? 'Degraded' : 'Degraded (Low Resources)'}</span>
                                            return <span className="text-xs text-muted-foreground">{isMobile ? 'Unhealthy' : 'Unhealthy (Offline + Kicks)'}</span>
                                        }}
                                    />
                                    <Bar
                                        dataKey="healthy"
                                        stackId="stability"
                                        fill="#22c55e"
                                        radius={[0, 0, 0, 0]}
                                        cursor="pointer"
                                    >
                                        {stabilityData.versionBars.map((entry, index) => (
                                            <Cell
                                                key={`healthy-${index}`}
                                                fill={selectedVersion === entry.version ? '#16a34a' : '#22c55e'}
                                                opacity={selectedVersion && selectedVersion !== entry.version ? 0.4 : 1}
                                            />
                                        ))}
                                    </Bar>
                                    <Bar
                                        dataKey="degraded"
                                        stackId="stability"
                                        fill="#eab308"
                                        radius={[0, 0, 0, 0]}
                                        cursor="pointer"
                                    >
                                        {stabilityData.versionBars.map((entry, index) => (
                                            <Cell
                                                key={`degraded-${index}`}
                                                fill={selectedVersion === entry.version ? '#ca8a04' : '#eab308'}
                                                opacity={selectedVersion && selectedVersion !== entry.version ? 0.4 : 1}
                                            />
                                        ))}
                                    </Bar>
                                    <Bar
                                        dataKey="unhealthy"
                                        stackId="stability"
                                        fill="#ef4444"
                                        radius={[4, 4, 0, 0]}
                                        cursor="pointer"
                                    >
                                        {stabilityData.versionBars.map((entry, index) => (
                                            <Cell
                                                key={`unhealthy-${index}`}
                                                fill={selectedVersion === entry.version ? '#dc2626' : '#ef4444'}
                                                opacity={selectedVersion && selectedVersion !== entry.version ? 0.4 : 1}
                                            />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-87.5 flex flex-col items-center justify-center text-muted-foreground gap-3">
                                <Smartphone className="h-10 w-10 opacity-30" />
                                <div className="text-center">
                                    <p className="text-sm font-medium">No device heartbeat data</p>
                                    <p className="text-xs mt-1">
                                        Devices will appear here once they start sending heartbeats.
                                    </p>
                                </div>
                            </div>
                        )}
                    </PanelSection>
                </Panel>

                {/* Drill-down Panel */}
                <Panel className="lg:col-span-3">
                    <PanelSection
                        label={selectedVersion ? `Hardware breakdown — ${selectedVersion}` : 'Version details'}
                        caption={
                            selectedVersion
                                ? 'Which device models are affected?'
                                : 'Click a bar in the chart to see hardware model breakdown'
                        }
                        action={
                            selectedVersion ? (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 gap-1.5 rounded-full px-2"
                                    onClick={() => setSelectedVersion(null)}
                                >
                                    <ArrowLeft className="h-4 w-4" />
                                    Back
                                </Button>
                            ) : (
                                // Only in the summary view — the drill-down below is a
                                // different table that this picker does not govern.
                                <MobileColumnsButton
                                    columns={VERSION_DETAIL_COLUMNS}
                                    hidden={versionHiddenCols}
                                    onChange={setVersionHiddenCols}
                                />
                            )
                        }
                    >
                        {!selectedVersion ? (
                            // Show version summary table when no version selected
                            isLoading ? (
                                <div className="space-y-3">
                                    {Array.from({ length: 5 }).map((_, i) => (
                                        <Skeleton key={i} className="h-10 w-full" />
                                    ))}
                                </div>
                            ) : stabilityData && stabilityData.versionBars.length > 0 ? (
                                <div className="max-h-95 max-w-full overflow-auto">
                                    {/* Min-width lifted on mobile so hidden columns actually
                                        narrow the table instead of scrolling sideways. */}
                                    <Table variant="data" className={cn(!isMobile && 'min-w-[520px]')}>
                                        <TableHeader className="[&_tr]:border-0">
                                            <TableRow>
                                                <TableHead>Version</TableHead>
                                                {showVersionCol('signals') && <TableHead className="text-right">Signals</TableHead>}
                                                {showVersionCol('degraded') && <TableHead className="text-right">Degraded</TableHead>}
                                                {showVersionCol('instability') && <TableHead className="text-right">Instability</TableHead>}
                                                {showVersionCol('status') && <TableHead className="text-right">Status</TableHead>}
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {[...stabilityData.versionBars].reverse().map((bar) => (
                                                <TableRow
                                                    key={bar.version}
                                                    className="cursor-pointer hover:bg-muted/50"
                                                    onClick={() => setSelectedVersion(bar.version)}
                                                >
                                                    <TableCell className="font-medium">
                                                        <span className="flex items-center gap-1">
                                                            {bar.version}
                                                            <ChevronRight className="h-3 w-3 text-muted-foreground" />
                                                        </span>
                                                    </TableCell>
                                                    {showVersionCol('signals') && (
                                                        <TableCell className="text-right tabular-nums">
                                                            {bar.total.toLocaleString()}
                                                        </TableCell>
                                                    )}
                                                    {showVersionCol('degraded') && (
                                                        <TableCell className="text-right tabular-nums">
                                                            {bar.degraded > 0
                                                                ? <span className="font-medium">{bar.degraded.toLocaleString()}</span>
                                                                : <span className="text-muted-foreground">—</span>
                                                            }
                                                        </TableCell>
                                                    )}
                                                    {showVersionCol('instability') && (
                                                        <TableCell className="text-right font-medium tabular-nums">
                                                            {bar.instabilityRate}%
                                                        </TableCell>
                                                    )}
                                                    {showVersionCol('status') && (
                                                        <TableCell className="text-right text-sm text-muted-foreground">
                                                            {bar.instabilityRate > INSTABILITY_THRESHOLD
                                                                ? 'At Risk'
                                                                : bar.degraded > 0
                                                                    ? 'Degraded'
                                                                    : 'Stable'}
                                                        </TableCell>
                                                    )}
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            ) : (
                                <div className="h-75 flex flex-col items-center justify-center text-muted-foreground gap-3">
                                    <Smartphone className="h-10 w-10 opacity-30" />
                                    <p className="text-sm font-medium">No version data available</p>
                                </div>
                            )
                        ) : (
                            // Show hardware model drill-down
                            drillDownLoading ? (
                                <div className="space-y-3">
                                    {Array.from({ length: 4 }).map((_, i) => (
                                        <Skeleton key={i} className="h-12 w-full" />
                                    ))}
                                </div>
                            ) : drillDownData && drillDownData.models.length > 0 ? (
                                <div className="space-y-4">
                                    {/* Drill-down summary */}
                                    <div className="flex items-center justify-between rounded-2xl bg-muted/60 p-3">
                                        <div>
                                            <p className="text-xs text-muted-foreground">Overall Instability</p>
                                            <p className="text-lg font-semibold tabular-nums">
                                                {drillDownData.overallInstabilityRate}%
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xs text-muted-foreground">Devices</p>
                                            <p className="text-lg font-semibold tabular-nums">{drillDownData.totalDevices}</p>
                                        </div>
                                    </div>

                                    {/* Model breakdown table */}
                                    <div className="max-h-75 overflow-auto">
                                        <Table variant="data" className="min-w-[620px]">
                                            <TableHeader className="[&_tr]:border-0">
                                                <TableRow>
                                                    <TableHead>Hardware Model</TableHead>
                                                    <TableHead className="text-right">Devices</TableHead>
                                                    <TableHead className="text-right">Healthy</TableHead>
                                                    <TableHead className="text-right">Degraded</TableHead>
                                                    <TableHead className="text-right">Unhealthy</TableHead>
                                                    <TableHead className="text-right">Rate</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {drillDownData.models.map((model) => (
                                                    <TableRow key={model.model}>
                                                        <TableCell>
                                                            <span className="font-medium">{model.model}</span>
                                                        </TableCell>
                                                        <TableCell className="text-right tabular-nums">
                                                            {model.deviceCount}
                                                        </TableCell>
                                                        <TableCell className="text-right tabular-nums text-muted-foreground">
                                                            {model.healthy.toLocaleString()}
                                                        </TableCell>
                                                        <TableCell className="text-right tabular-nums">
                                                            {model.degraded > 0
                                                                ? <span className="font-medium">{model.degraded.toLocaleString()}</span>
                                                                : <span className="text-muted-foreground">—</span>
                                                            }
                                                        </TableCell>
                                                        <TableCell className="text-right tabular-nums">
                                                            {model.unhealthy.toLocaleString()}
                                                        </TableCell>
                                                        <TableCell className="text-right font-medium tabular-nums">
                                                            {model.instabilityRate}%
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </div>
                            ) : (
                                <div className="h-75 flex flex-col items-center justify-center text-muted-foreground gap-3">
                                    <Smartphone className="h-10 w-10 opacity-30" />
                                    <p className="text-sm font-medium">No hardware data for this version</p>
                                </div>
                            )
                        )}
                    </PanelSection>
                </Panel>
            </div>
        </>
    )
}
