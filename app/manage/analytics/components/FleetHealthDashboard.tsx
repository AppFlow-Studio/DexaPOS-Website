'use client'

import { useFleetHealth } from '@/lib/queries/use-platform-analytics'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Wifi, WifiOff, AlertTriangle, RefreshCw, ChevronRight, Building2, MapPin } from 'lucide-react'
import { useState } from 'react'
import type { FleetDevice, HardwareCensusItem, FleetAlertItem } from '@/app/manage/actions/hq-platform/analytics'

const STATUS_COLORS: Record<string, string> = {
  online: '#22c55e',
  degraded: '#f59e0b',
  offline: '#ef4444',
}

const STATUS_LABELS: Record<string, string> = {
  online: 'Online',
  degraded: 'Degraded',
  offline: 'Offline',
}

function StatusBadge({ status }: { status: FleetDevice['healthStatus'] }) {
  const variants: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
    online: 'default',
    degraded: 'secondary',
    offline: 'destructive',
  }
  return (
    <Badge variant={variants[status]} className="text-xs">
      {STATUS_LABELS[status]}
    </Badge>
  )
}

function fmtLastSeen(mins: number | null): string {
  if (mins === null) return '—'
  if (mins < 60) return `${mins}m ago`
  return `${Math.floor(mins / 60)}h ago`
}

function fmtMb(mb: number | null): string {
  if (mb === null) return '—'
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)}GB`
  return `${mb}MB`
}

// ── Hierarchy Types ──────────────────────────────────────────────────────────

interface LocationGroup {
  locationId: string | null
  locationName: string | null
  devices: FleetDevice[]
  onlineCount: number
  degradedCount: number
  offlineCount: number
}

interface MerchantGroup {
  merchantId: string
  merchantName: string
  locations: LocationGroup[]
  totalDevices: number
  onlineCount: number
  degradedCount: number
  offlineCount: number
}

function buildHierarchy(devices: FleetDevice[]): MerchantGroup[] {
  const merchantMap = new Map<string, MerchantGroup>()

  for (const device of devices) {
    if (!merchantMap.has(device.merchantId)) {
      merchantMap.set(device.merchantId, {
        merchantId: device.merchantId,
        merchantName: device.merchantName,
        locations: [],
        totalDevices: 0,
        onlineCount: 0,
        degradedCount: 0,
        offlineCount: 0,
      })
    }
    const merchant = merchantMap.get(device.merchantId)!

    const locKey = device.locationId ?? '__no_location__'
    let loc = merchant.locations.find(l => (l.locationId ?? '__no_location__') === locKey)
    if (!loc) {
      loc = {
        locationId: device.locationId,
        locationName: device.locationName,
        devices: [],
        onlineCount: 0,
        degradedCount: 0,
        offlineCount: 0,
      }
      merchant.locations.push(loc)
    }

    loc.devices.push(device)
    loc[device.healthStatus === 'online' ? 'onlineCount' : device.healthStatus === 'degraded' ? 'degradedCount' : 'offlineCount']++

    merchant.totalDevices++
    merchant[device.healthStatus === 'online' ? 'onlineCount' : device.healthStatus === 'degraded' ? 'degradedCount' : 'offlineCount']++
  }

  return Array.from(merchantMap.values()).sort((a, b) => {
    // Sort: merchants with offline/degraded first, then alphabetically
    const aProblems = a.offlineCount + a.degradedCount
    const bProblems = b.offlineCount + b.degradedCount
    if (bProblems !== aProblems) return bProblems - aProblems
    return a.merchantName.localeCompare(b.merchantName)
  })
}

// ── Device Row ───────────────────────────────────────────────────────────────

function DeviceRow({ device, indent = false }: { device: FleetDevice; indent?: boolean }) {
  return (
    <TableRow key={device.stationId} className={device.healthStatus === 'offline' ? 'bg-red-50/40' : device.healthStatus === 'degraded' ? 'bg-amber-50/40' : ''}>
      <TableCell className={`text-sm py-2 font-medium ${indent ? 'pl-10' : 'pl-6'}`}>
        {device.stationName}
      </TableCell>
      <TableCell className="text-sm py-2 text-muted-foreground">{device.deviceModel}</TableCell>
      <TableCell className="py-2"><StatusBadge status={device.healthStatus} /></TableCell>
      <TableCell className="text-sm py-2 text-right">
        {device.batteryLevel !== null ? (
          <span className={device.batteryLevel < 20 ? 'text-red-600 font-medium' : ''}>
            {device.batteryLevel}%
          </span>
        ) : '—'}
      </TableCell>
      <TableCell className="text-sm py-2 text-right font-mono">
        <span className={device.ramFreeMb !== null && device.ramFreeMb < 200 ? 'text-red-600 font-medium' : 'text-muted-foreground'}>
          {fmtMb(device.ramFreeMb)}
        </span>
      </TableCell>
      <TableCell className="text-sm py-2 text-right font-mono">
        <span className={device.storageFreeMb !== null && device.storageFreeMb < 500 ? 'text-red-600 font-medium' : 'text-muted-foreground'}>
          {fmtMb(device.storageFreeMb)}
        </span>
      </TableCell>
      <TableCell className="text-sm py-2 text-right text-muted-foreground">
        {fmtLastSeen(device.minutesSinceHeartbeat)}
      </TableCell>
      <TableCell className="text-xs py-2 text-muted-foreground">{device.appVersion || '—'}</TableCell>
    </TableRow>
  )
}

// ── Merchant Section ─────────────────────────────────────────────────────────

function MerchantSection({ group }: { group: MerchantGroup }) {
  const [expanded, setExpanded] = useState(
    group.offlineCount > 0 || group.degradedCount > 0
  )

  const hasProblems = group.offlineCount > 0 || group.degradedCount > 0

  return (
    <>
      {/* Merchant header row */}
      <TableRow
        className={`cursor-pointer select-none ${hasProblems ? 'bg-red-50/20 hover:bg-red-50/40' : 'bg-muted/30 hover:bg-muted/50'}`}
        onClick={() => setExpanded(e => !e)}
      >
        <TableCell colSpan={8} className="py-2">
          <div className="flex items-center gap-2">
            <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${expanded ? 'rotate-90' : ''}`} />
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold text-sm">{group.merchantName}</span>
            <span className="text-xs text-muted-foreground ml-1">({group.totalDevices} device{group.totalDevices !== 1 ? 's' : ''})</span>
            <div className="flex items-center gap-1 ml-2">
              {group.onlineCount > 0 && (
                <Badge variant="default" className="text-xs px-1.5 py-0">{group.onlineCount} online</Badge>
              )}
              {group.degradedCount > 0 && (
                <Badge variant="secondary" className="text-xs px-1.5 py-0 text-amber-700">{group.degradedCount} degraded</Badge>
              )}
              {group.offlineCount > 0 && (
                <Badge variant="destructive" className="text-xs px-1.5 py-0">{group.offlineCount} offline</Badge>
              )}
            </div>
          </div>
        </TableCell>
      </TableRow>

      {expanded && group.locations.map(loc => (
        <LocationSection key={loc.locationId ?? '__no_location__'} loc={loc} />
      ))}
    </>
  )
}

// ── Location Section ─────────────────────────────────────────────────────────

function LocationSection({ loc }: { loc: LocationGroup }) {
  const [expanded, setExpanded] = useState(
    loc.offlineCount > 0 || loc.degradedCount > 0
  )

  return (
    <>
      {/* Location sub-header */}
      <TableRow
        className="cursor-pointer select-none hover:bg-muted/30"
        onClick={() => setExpanded(e => !e)}
      >
        <TableCell colSpan={8} className="py-1.5 pl-8">
          <div className="flex items-center gap-2">
            <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${expanded ? 'rotate-90' : ''}`} />
            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground font-medium">
              {loc.locationName ?? 'No Location'}
            </span>
            <span className="text-xs text-muted-foreground">({loc.devices.length} device{loc.devices.length !== 1 ? 's' : ''})</span>
            <div className="flex items-center gap-1">
              {loc.degradedCount > 0 && (
                <Badge variant="secondary" className="text-xs px-1 py-0 text-amber-700">{loc.degradedCount} degraded</Badge>
              )}
              {loc.offlineCount > 0 && (
                <Badge variant="destructive" className="text-xs px-1 py-0">{loc.offlineCount} offline</Badge>
              )}
            </div>
          </div>
        </TableCell>
      </TableRow>

      {expanded && loc.devices.map(device => (
        <DeviceRow key={device.stationId} device={device} indent />
      ))}
    </>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────

export function FleetHealthDashboard() {
  const { data, isLoading, dataUpdatedAt } = useFleetHealth()

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i}><CardContent className="pt-6"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
        <Skeleton className="h-75 w-full" />
      </div>
    )
  }

  if (!data) return null

  const pieData = [
    { name: 'Online', value: data.onlineCount, color: STATUS_COLORS.online },
    { name: 'Degraded', value: data.degradedCount, color: STATUS_COLORS.degraded },
    { name: 'Offline', value: data.offlineCount, color: STATUS_COLORS.offline },
  ].filter(d => d.value > 0)

  const uptimePct = data.totalDevices > 0
    ? Math.round(((data.onlineCount + data.degradedCount) / data.totalDevices) * 1000) / 10
    : 0

  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : '—'

  const hierarchy = buildHierarchy(data.devices)

  return (
    <div className="space-y-6">
      {/* Summary stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Wifi className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-2xl font-bold text-green-600">{data.onlineCount}</p>
                <p className="text-xs text-muted-foreground">Online</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              <div>
                <p className="text-2xl font-bold text-amber-600">{data.degradedCount}</p>
                <p className="text-xs text-muted-foreground">Degraded</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <WifiOff className="h-5 w-5 text-red-500" />
              <div>
                <p className="text-2xl font-bold text-red-600">{data.offlineCount}</p>
                <p className="text-xs text-muted-foreground">Offline</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold">{uptimePct}%</p>
            <p className="text-xs text-muted-foreground">Fleet Uptime</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Health donut */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Device Health Distribution</CardTitle>
            <CardDescription className="text-xs flex items-center gap-1">
              <RefreshCw className="h-3 w-3" /> Last sync: {lastUpdated}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={3} dataKey="value">
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => [v, 'Devices']} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Hardware Census */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Hardware Census</CardTitle>
            <CardDescription className="text-xs">Device models across fleet</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Model</TableHead>
                  <TableHead className="text-xs text-right">Count</TableHead>
                  <TableHead className="text-xs text-right">% of Fleet</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.hardwareCensus.slice(0, 10).map((item: HardwareCensusItem) => (
                  <TableRow key={item.model}>
                    <TableCell className="text-sm py-2">{item.model}</TableCell>
                    <TableCell className="text-sm py-2 text-right">{item.count}</TableCell>
                    <TableCell className="text-sm py-2 text-right text-muted-foreground">
                      {data.totalDevices > 0 ? Math.round((item.count / data.totalDevices) * 1000) / 10 : 0}%
                    </TableCell>
                  </TableRow>
                ))}
                {data.hardwareCensus.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground text-sm py-4">No device data</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Alert Feed */}
      {data.alertFeed.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Active Alerts ({data.alertFeed.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Device</TableHead>
                  <TableHead className="text-xs">Merchant</TableHead>
                  <TableHead className="text-xs">Issue</TableHead>
                  <TableHead className="text-xs">Severity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.alertFeed.map((alert: FleetAlertItem, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-sm py-2 font-medium">{alert.stationName}</TableCell>
                    <TableCell className="text-sm py-2 text-muted-foreground">{alert.merchantName}</TableCell>
                    <TableCell className="text-sm py-2">{alert.message}</TableCell>
                    <TableCell className="py-2">
                      <Badge variant={alert.severity === 'critical' ? 'destructive' : 'secondary'} className="text-xs">
                        {alert.severity}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Hierarchical Device Grid: Merchant → Location → Device */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            All Devices ({data.totalDevices}) — Merchant → Location → Device
          </CardTitle>
          <CardDescription className="text-xs">
            Click a merchant or location row to expand/collapse. Rows with issues are auto-expanded.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Station / Location / Merchant</TableHead>
                <TableHead className="text-xs">Model</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs text-right">Battery</TableHead>
                <TableHead className="text-xs text-right">RAM Free</TableHead>
                <TableHead className="text-xs text-right">Storage Free</TableHead>
                <TableHead className="text-xs text-right">Last Seen</TableHead>
                <TableHead className="text-xs">App</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {hierarchy.map(group => (
                <MerchantSection key={group.merchantId} group={group} />
              ))}
              {hierarchy.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground text-sm py-6">
                    No devices found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
