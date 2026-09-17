'use client'

import { useFleetHealth } from '@/lib/queries/use-platform-analytics'
import { Panel } from '@/components/dashboard/shell/Panel'
import { PanelSection } from '@/components/dashboard/shell/PanelSection'
import { StatRow, StatTile } from '@/components/dashboard/shell/StatTile'
import { AnalyticsTooltip } from '@/app/manage/components/analytics-primitives'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  MobileColumnsButton,
  initialHiddenColumns,
  type ReportColumn,
} from '@/components/dashboard/reports/MobileColumnsButton'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Wifi, WifiOff, AlertTriangle, ChevronRight, Building2, MapPin } from 'lucide-react'
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

// ── Mobile card view ─────────────────────────────────────────────────────────

/**
 * One device as a card.
 *
 * The table's eight columns become a name + status line and a 2-up grid of
 * labelled metrics. Each value carries its own label, so nothing depends on a
 * column header that has scrolled off — which is what made the table version
 * unreadable on a phone.
 */
function DeviceCard({ device }: { device: FleetDevice }) {
  const metrics: Array<{ label: string; value: string }> = [
    { label: 'Battery', value: device.batteryLevel !== null ? `${device.batteryLevel}%` : '—' },
    { label: 'RAM free', value: fmtMb(device.ramFreeMb) },
    { label: 'Storage free', value: fmtMb(device.storageFreeMb) },
    { label: 'Last seen', value: fmtLastSeen(device.minutesSinceHeartbeat) },
  ]

  return (
    <div className="rounded-2xl bg-card/70 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{device.stationName}</p>
          <p className="truncate text-xs text-muted-foreground">
            {device.deviceModel || '—'}
            {device.appVersion ? ` · ${device.appVersion}` : ''}
          </p>
        </div>
        <StatusBadge status={device.healthStatus} />
      </div>
      <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5">
        {metrics.map(m => (
          <div key={m.label} className="flex items-baseline justify-between gap-2">
            <dt className="text-xs text-muted-foreground">{m.label}</dt>
            <dd className="text-xs font-medium tabular-nums">{m.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/** A merchant and its locations, as collapsible card sections. */
function MerchantCardSection({ group }: { group: MerchantGroup }) {
  const [expanded, setExpanded] = useState(
    group.offlineCount > 0 || group.degradedCount > 0
  )

  return (
    <div className="rounded-2xl bg-muted/30">
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        <ChevronRight className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expanded ? 'rotate-90' : ''}`} />
        <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{group.merchantName}</span>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {group.totalDevices}
        </span>
      </button>

      {/* Counts sit under the name rather than beside it: at 400px a single row
          of name + three counts wraps into an unreadable tangle. */}
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 px-3 pb-2 pl-10 text-xs tabular-nums text-muted-foreground">
        {group.onlineCount > 0 && <span>{group.onlineCount} online</span>}
        {group.degradedCount > 0 && <span className="font-medium">{group.degradedCount} degraded</span>}
        {group.offlineCount > 0 && <span className="font-medium">{group.offlineCount} offline</span>}
      </div>

      {expanded && (
        <div className="space-y-2 px-2 pb-2">
          {group.locations.map(loc => (
            <LocationCardSection key={loc.locationId ?? '__no_location__'} loc={loc} />
          ))}
        </div>
      )}
    </div>
  )
}

/** A location and its devices. Only two levels of indent, never three. */
function LocationCardSection({ loc }: { loc: LocationGroup }) {
  const [expanded, setExpanded] = useState(
    loc.offlineCount > 0 || loc.degradedCount > 0
  )

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-1.5 px-1 py-1.5 text-left"
      >
        <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${expanded ? 'rotate-90' : ''}`} />
        <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">
          {loc.locationName ?? 'No Location'}
        </span>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {loc.devices.length}
        </span>
      </button>

      {expanded && (
        <div className="space-y-2 pt-1">
          {loc.devices.map(device => (
            <DeviceCard key={device.stationId} device={device} />
          ))}
        </div>
      )}
    </div>
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

/**
 * Mobile column meta for the active alerts table. Issue is the alert itself —
 * without it a row is just a device name — so it stays beside the device.
 */
const ACTIVE_ALERT_COLUMNS: ReportColumn[] = [
  { id: 'device', label: 'Device', locked: true },
  { id: 'merchant', label: 'Merchant', defaultHidden: true },
  { id: 'issue', label: 'Issue' },
  { id: 'severity', label: 'Severity', defaultHidden: true },
]

export function FleetHealthDashboard() {
  const { data, isLoading, dataUpdatedAt } = useFleetHealth()
  const isMobile = useIsMobile()
  const [alertHiddenCols, setAlertHiddenCols] = useState<Set<string>>(() =>
    initialHiddenColumns(ACTIVE_ALERT_COLUMNS)
  )
  const showAlertCol = (id: string) => !isMobile || !alertHiddenCols.has(id)

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
          <PanelSection
            label={`Active alerts (${data.alertFeed.length})`}
            icon={AlertTriangle}
            action={
              <MobileColumnsButton
                columns={ACTIVE_ALERT_COLUMNS}
                hidden={alertHiddenCols}
                onChange={setAlertHiddenCols}
              />
            }
          >
            {/* Min-width lifted on mobile so hidden columns actually narrow the
                table instead of leaving it scrolling sideways. */}
            <Table variant="data" className={cn(!isMobile && 'min-w-[620px]')}>
              <TableHeader className="[&_tr]:border-0">
                <TableRow>
                  <TableHead>Device</TableHead>
                  {showAlertCol('merchant') && <TableHead>Merchant</TableHead>}
                  {showAlertCol('issue') && <TableHead>Issue</TableHead>}
                  {showAlertCol('severity') && <TableHead>Severity</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.alertFeed.map((alert: FleetAlertItem, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{alert.stationName}</TableCell>
                    {showAlertCol('merchant') && (
                      <TableCell className="text-muted-foreground">{alert.merchantName}</TableCell>
                    )}
                    {showAlertCol('issue') && <TableCell>{alert.message}</TableCell>}
                    {showAlertCol('severity') && (
                      <TableCell className="capitalize text-muted-foreground">{alert.severity}</TableCell>
                    )}
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
          caption={
            isMobile
              ? 'Tap a merchant or location to expand. Groups with issues start open.'
              : 'Click a merchant or location row to expand/collapse. Rows with issues are auto-expanded.'
          }
        >
          {/* A 3-level tree needs 900px to stay legible, so at phone width it
              becomes cards instead: hiding columns would not help, because the
              problem is the indent depth and the eight unlabelled values, not
              the column count. Both views share `hierarchy`. */}
          {isMobile ? (
            hierarchy.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">No devices found</div>
            ) : (
              <div className="space-y-2">
                {hierarchy.map(group => (
                  <MerchantCardSection key={group.merchantId} group={group} />
                ))}
              </div>
            )
          ) : (
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
          )}
        </PanelSection>
      </Panel>
    </div>
  )
}
