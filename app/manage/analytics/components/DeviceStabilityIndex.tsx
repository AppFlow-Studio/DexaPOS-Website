'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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

export default function DeviceStabilityIndex() {
    const [days, setDays] = useState<number>(30)
    const [selectedVersion, setSelectedVersion] = useState<string | null>(null)

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
                            <Badge variant="default" className="flex items-center gap-1 shrink-0 bg-green-600">
                                <ShieldCheck className="h-3 w-3" />
                                Fleet Stable
                            </Badge>
                        ) : (
                            <Badge variant="destructive" className="flex items-center gap-1 shrink-0">
                                <ShieldAlert className="h-3 w-3" />
                                {stabilityData.overallInstabilityRate}% Instability
                            </Badge>
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

            {/* Rollout Warning Banner */}
            {!isLoading && stabilityData?.rolloutWarning && (
                <Card className="border-red-200 bg-linear-to-r from-red-50 to-orange-50">
                    <CardContent className="py-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-red-100">
                                <AlertTriangle className="h-5 w-5 text-red-600" />
                            </div>
                            <div>
                                <p className="font-semibold text-red-900">Rollout Hold Recommended</p>
                                <p className="text-sm text-red-700">{stabilityData.rolloutWarning}</p>
                            </div>
                            <Badge variant="destructive" className="ml-auto">
                                &gt;{INSTABILITY_THRESHOLD}% Threshold Breached
                            </Badge>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* All Clear State — fleet is stable, no versions at risk */}
            {!isLoading && stabilityData && !stabilityData.rolloutWarning && stabilityData.versionBars.length > 0 &&
                stabilityData.versionBars.every(v => v.instabilityRate <= INSTABILITY_THRESHOLD) && (
                <Card className="border-green-200 bg-linear-to-r from-green-50 to-emerald-50">
                    <CardContent className="py-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-green-100">
                                <ShieldCheck className="h-5 w-5 text-green-600" />
                            </div>
                            <div>
                                <p className="font-semibold text-green-900">Fleet Stable — Clear to Roll Out</p>
                                <p className="text-sm text-green-700">
                                    All {stabilityData.versionBars.length} versions are below the {INSTABILITY_THRESHOLD}% instability threshold.
                                    Overall rate: {stabilityData.overallInstabilityRate}%.
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* KPI Summary Cards */}
            {isLoading ? (
                <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <Card key={i}>
                            <CardHeader className="pb-2"><Skeleton className="h-4 w-24" /></CardHeader>
                            <CardContent><Skeleton className="h-8 w-20" /></CardContent>
                        </Card>
                    ))}
                </div>
            ) : stabilityData ? (
                <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">Total Devices</CardTitle>
                            <Monitor className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{stabilityData.totalDevices}</div>
                            <p className="text-xs text-muted-foreground mt-1">
                                Across {stabilityData.versionBars.length} version{stabilityData.versionBars.length !== 1 ? 's' : ''}
                            </p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">Total Signals</CardTitle>
                            <Cpu className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{stabilityData.totalHeartbeats.toLocaleString()}</div>
                            <p className="text-xs text-muted-foreground mt-1">Heartbeats + session events</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">Overall Instability</CardTitle>
                            {stabilityData.overallInstabilityRate > INSTABILITY_THRESHOLD
                                ? <ShieldAlert className="h-4 w-4 text-red-500" />
                                : <ShieldCheck className="h-4 w-4 text-green-500" />
                            }
                        </CardHeader>
                        <CardContent>
                            <div className={`text-2xl font-bold ${stabilityData.overallInstabilityRate > INSTABILITY_THRESHOLD ? 'text-red-600' : 'text-green-600'}`}>
                                {stabilityData.overallInstabilityRate}%
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                                Target: &lt;{INSTABILITY_THRESHOLD}%
                            </p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">Versions at Risk</CardTitle>
                            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">
                                {stabilityData.versionBars.filter(v => v.instabilityRate > INSTABILITY_THRESHOLD).length}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                                Above {INSTABILITY_THRESHOLD}% instability threshold
                            </p>
                        </CardContent>
                    </Card>
                </div>
            ) : null}

            {/* Main Chart + Drill-down */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">

                {/* Stacked Bar Chart by Version */}
                <Card className="col-span-4">
                    <CardHeader>
                        <CardTitle>Stability by App Version</CardTitle>
                        <CardDescription>
                            Click a version bar to drill down by hardware model
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
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
                                                        <p className="border-t pt-1 mt-1 text-muted-foreground">
                                                            Instability Rate: <span className={`font-bold ${Number(rate) > INSTABILITY_THRESHOLD ? 'text-red-600' : 'text-green-600'}`}>{rate}%</span>
                                                        </p>
                                                        <p className="text-muted-foreground italic">Click to drill down</p>
                                                    </div>
                                                )
                                            }
                                            return null
                                        }}
                                    />
                                    <Legend
                                        verticalAlign="top"
                                        height={36}
                                        formatter={(value) => {
                                            if (value === 'healthy') return <span className="text-xs text-muted-foreground">Healthy Heartbeats</span>
                                            if (value === 'degraded') return <span className="text-xs text-muted-foreground">Degraded (Low Resources)</span>
                                            return <span className="text-xs text-muted-foreground">Unhealthy (Offline + Kicks)</span>
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
                    </CardContent>
                </Card>

                {/* Drill-down Panel */}
                <Card className="col-span-3">
                    <CardHeader>
                        {selectedVersion ? (
                            <>
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7"
                                        onClick={() => setSelectedVersion(null)}
                                    >
                                        <ArrowLeft className="h-4 w-4" />
                                    </Button>
                                    <div>
                                        <CardTitle className="text-sm font-medium">
                                            Hardware Breakdown — {selectedVersion}
                                        </CardTitle>
                                        <CardDescription>
                                            Which device models are affected?
                                        </CardDescription>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <>
                                <CardTitle className="text-sm font-medium">Version Details</CardTitle>
                                <CardDescription>
                                    Click a bar in the chart to see hardware model breakdown
                                </CardDescription>
                            </>
                        )}
                    </CardHeader>
                    <CardContent>
                        {!selectedVersion ? (
                            // Show version summary table when no version selected
                            isLoading ? (
                                <div className="space-y-3">
                                    {Array.from({ length: 5 }).map((_, i) => (
                                        <Skeleton key={i} className="h-10 w-full" />
                                    ))}
                                </div>
                            ) : stabilityData && stabilityData.versionBars.length > 0 ? (
                                <div className="max-h-95 overflow-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Version</TableHead>
                                                <TableHead className="text-right">Signals</TableHead>
                                                <TableHead className="text-right text-yellow-600">Degraded</TableHead>
                                                <TableHead className="text-right">Instability</TableHead>
                                                <TableHead className="text-right">Status</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {[...stabilityData.versionBars].reverse().map((bar) => (
                                                <TableRow
                                                    key={bar.version}
                                                    className="cursor-pointer hover:bg-muted/50"
                                                    onClick={() => setSelectedVersion(bar.version)}
                                                >
                                                    <TableCell className="font-medium text-sm">
                                                        <span className="flex items-center gap-1">
                                                            {bar.version}
                                                            <ChevronRight className="h-3 w-3 text-muted-foreground" />
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="text-right text-sm">
                                                        {bar.total.toLocaleString()}
                                                    </TableCell>
                                                    <TableCell className="text-right text-sm">
                                                        {bar.degraded > 0
                                                            ? <span className="font-medium text-yellow-600">{bar.degraded.toLocaleString()}</span>
                                                            : <span className="text-muted-foreground">—</span>
                                                        }
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <span className={`text-sm font-medium ${bar.instabilityRate > INSTABILITY_THRESHOLD ? 'text-red-600' : 'text-green-600'}`}>
                                                            {bar.instabilityRate}%
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        {bar.instabilityRate > INSTABILITY_THRESHOLD ? (
                                                            <Badge variant="destructive" className="text-xs">At Risk</Badge>
                                                        ) : bar.degraded > 0 ? (
                                                            <Badge variant="secondary" className="text-xs text-yellow-700">Degraded</Badge>
                                                        ) : (
                                                            <Badge variant="default" className="text-xs bg-green-600">Stable</Badge>
                                                        )}
                                                    </TableCell>
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
                                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                                        <div>
                                            <p className="text-xs text-muted-foreground">Overall Instability</p>
                                            <p className={`text-lg font-bold ${drillDownData.overallInstabilityRate > INSTABILITY_THRESHOLD ? 'text-red-600' : 'text-green-600'}`}>
                                                {drillDownData.overallInstabilityRate}%
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xs text-muted-foreground">Devices</p>
                                            <p className="text-lg font-bold">{drillDownData.totalDevices}</p>
                                        </div>
                                    </div>

                                    {/* Model breakdown table */}
                                    <div className="max-h-75 overflow-auto">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Hardware Model</TableHead>
                                                    <TableHead className="text-right">Devices</TableHead>
                                                    <TableHead className="text-right">Healthy</TableHead>
                                                    <TableHead className="text-right text-yellow-600">Degraded</TableHead>
                                                    <TableHead className="text-right">Unhealthy</TableHead>
                                                    <TableHead className="text-right">Rate</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {drillDownData.models.map((model) => (
                                                    <TableRow key={model.model}>
                                                        <TableCell>
                                                            <span className="font-medium text-sm">{model.model}</span>
                                                        </TableCell>
                                                        <TableCell className="text-right text-sm">
                                                            {model.deviceCount}
                                                        </TableCell>
                                                        <TableCell className="text-right text-sm text-green-600">
                                                            {model.healthy.toLocaleString()}
                                                        </TableCell>
                                                        <TableCell className="text-right text-sm">
                                                            {model.degraded > 0
                                                                ? <span className="font-medium text-yellow-600">{model.degraded.toLocaleString()}</span>
                                                                : <span className="text-muted-foreground">—</span>
                                                            }
                                                        </TableCell>
                                                        <TableCell className="text-right text-sm text-red-600">
                                                            {model.unhealthy.toLocaleString()}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <Badge
                                                                variant={model.instabilityRate > INSTABILITY_THRESHOLD ? 'destructive' : 'default'}
                                                                className={model.instabilityRate <= INSTABILITY_THRESHOLD ? 'bg-green-600' : ''}
                                                            >
                                                                {model.instabilityRate}%
                                                            </Badge>
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
                    </CardContent>
                </Card>
            </div>
        </>
    )
}
