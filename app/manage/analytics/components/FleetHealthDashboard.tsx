'use client'

import { useFleetHealth } from '@/lib/queries/use-platform-analytics'
import { Panel } from '@/components/dashboard/shell/Panel'
import { PanelSection } from '@/components/dashboard/shell/PanelSection'
import { StatRow, StatTile } from '@/components/dashboard/shell/StatTile'
import { AnalyticsTooltip } from '@/app/manage/components/analytics-primitives'
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

/**
 * Device state as text, not a coloured badge — §14.3 HQ-2 keeps severity colour
 * to `/manage/health` and the DLQ. The status donut above still carries the
 * colours, where they map a slice to its legend entry (§4.6b).
 */
function StatusBadge({ status }: { status: FleetDevice['healthStatus'] }) {
  return (
    <span className={status === 'online' ? 'text-sm text-muted-foreground' : 'text-sm font-medium'}>
      {STATUS_LABELS[status]}
    </span>
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
  // Groups with a degraded or offline device start open, so a problem is
  // visible without hunting for it.
  const [expanded, setExpanded] = useState(
    group.offlineCount > 0 || group.degradedCount > 0
  )

  return (
    <>
      {/* Merchant header row */}
      <TableRow
        className="cursor-pointer select-none bg-muted/30 hover:bg-muted/50"
        onClick={() => setExpanded(e => !e)}
      >
        <TableCell colSpan={8} className="py-2">
          <div className="flex items-center gap-2">
            <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${expanded ? 'rotate-90' : ''}`} />
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold text-sm">{group.merchantName}</span>
            <span className="text-xs text-muted-foreground ml-1">({group.totalDevices} device{group.totalDevices !== 1 ? 's' : ''})</span>
            {/* Counts read as text: a row of tinted pills would colour-code
                status, which §14.3 HQ-2 reserves for health and the DLQ. */}
            <div className="ml-2 flex items-center gap-2 text-xs tabular-nums text-muted-foreground">
              {group.onlineCount > 0 && <span>{group.onlineCount} online</span>}
              {group.degradedCount > 0 && <span className="font-medium">{group.degradedCount} degraded</span>}
              {group.offlineCount > 0 && <span className="font-medium">{group.offlineCount} offline</span>}
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
            <div className="flex items-center gap-2 text-xs tabular-nums text-muted-foreground">
              {loc.degradedCount > 0 && <span className="font-medium">{loc.degradedCount} degraded</span>}
              {loc.offlineCount > 0 && <span className="font-medium">{loc.offlineCount} offline</span>}
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
      <div className="space-y-6">
        <Skeleton className="h-40 w-full rounded-3xl" />
        <Skeleton className="h-75 w-full rounded-3xl" />
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
      <Panel>
        <PanelSection label="Fleet health" icon={Wifi}>
          <StatRow columns={4}>
            <StatTile label="Online" icon={<Wifi />} value={data.onlineCount} />
            <StatTile label="Degraded" icon={<AlertTriangle />} value={data.degradedCount} />
            <StatTile label="Offline" icon={<WifiOff />} value={data.offlineCount} />
            <StatTile label="Fleet Uptime" value={`${uptimePct}%`} />
          </StatRow>
        </PanelSection>
      </Panel>

      <div className="grid min-w-0 grid-cols-1 gap-6 md:grid-cols-2">
        <Panel>
          <PanelSection
            label="Device health distribution"
            caption={`Last sync: ${lastUpdated}`}
          >
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={3} dataKey="value">
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<AnalyticsTooltip formatter={(v: number) => `${v} devices`} />} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </PanelSection>
        </Panel>

        <Panel>
          <PanelSection label="Hardware census" caption="Device models across fleet">
            <Table variant="data" className="min-w-[380px]">
              <TableHeader className="[&_tr]:border-0">
                <TableRow>
                  <TableHead>Model</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                  <TableHead className="text-right">% of Fleet</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.hardwareCensus.slice(0, 10).map((item: HardwareCensusItem) => (
                  <TableRow key={item.model}>
                    <TableCell>{item.model}</TableCell>
                    <TableCell className="text-right tabular-nums">{item.count}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {data.totalDevices > 0 ? Math.round((item.count / data.totalDevices) * 1000) / 10 : 0}%
                    </TableCell>
                  </TableRow>
                ))}
                {data.hardwareCensus.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">No device data</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </PanelSection>
        </Panel>
      </div>

      {data.alertFeed.length > 0 && (
        <Panel>
          <PanelSection label={`Active alerts (${data.alertFeed.length})`} icon={AlertTriangle}>
            <Table variant="data" className="min-w-[620px]">
              <TableHeader className="[&_tr]:border-0">
                <TableRow>
                  <TableHead>Device</TableHead>
                  <TableHead>Merchant</TableHead>
                  <TableHead>Issue</TableHead>
                  <TableHead>Severity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.alertFeed.map((alert: FleetAlertItem, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{alert.stationName}</TableCell>
                    <TableCell className="text-muted-foreground">{alert.merchantName}</TableCell>
                    <TableCell>{alert.message}</TableCell>
                    <TableCell className="capitalize text-muted-foreground">{alert.severity}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </PanelSection>
        </Panel>
      )}

      <Panel>
        <PanelSection
          label={`All devices (${data.totalDevices}) — merchant → location → device`}
          caption="Click a merchant or location row to expand/collapse. Rows with issues are auto-expanded."
        >
          <Table variant="data" className="min-w-[900px]">
            <TableHeader className="[&_tr]:border-0">
              <TableRow>
                <TableHead>Station / Location / Merchant</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Battery</TableHead>
                <TableHead className="text-right">RAM Free</TableHead>
                <TableHead className="text-right">Storage Free</TableHead>
                <TableHead className="text-right">Last Seen</TableHead>
                <TableHead>App</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {hierarchy.map(group => (
                <MerchantSection key={group.merchantId} group={group} />
              ))}
              {hierarchy.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                    No devices found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </PanelSection>
      </Panel>
    </div>
  )
}
