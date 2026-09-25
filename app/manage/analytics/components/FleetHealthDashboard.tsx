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
import { useClientPagination } from '@/lib/hooks/useClientPagination'
import { PaginationBar } from '@/components/dashboard/PaginationBar'
import { Wifi, WifiOff, AlertTriangle, ChevronRight, Building2 } from 'lucide-react'
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
/** Phone-card labels: the card's status slot is narrow, so the short form. */
const SHORT_STATUS_LABELS: Record<string, string> = {
  online: 'On',
  degraded: 'Degraded',
  offline: 'Off',
}

function StatusBadge({ status, short = false }: { status: FleetDevice['healthStatus']; short?: boolean }) {
  return (
    <span className={status === 'online' ? 'text-sm text-muted-foreground' : 'text-sm font-medium'}>
      {(short ? SHORT_STATUS_LABELS : STATUS_LABELS)[status]}
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

// ── Merchant grouping ────────────────────────────────────────────────────────

interface MerchantGroup {
  merchantId: string
  merchantName: string
  devices: FleetDevice[]
  onlineCount: number
  degradedCount: number
  offlineCount: number
}

function groupByMerchant(devices: FleetDevice[]): MerchantGroup[] {
  const merchantMap = new Map<string, MerchantGroup>()

  for (const device of devices) {
    let merchant = merchantMap.get(device.merchantId)
    if (!merchant) {
      merchant = {
        merchantId: device.merchantId,
        merchantName: device.merchantName,
        devices: [],
        onlineCount: 0,
        degradedCount: 0,
        offlineCount: 0,
      }
      merchantMap.set(device.merchantId, merchant)
    }
    merchant.devices.push(device)
    merchant[device.healthStatus === 'online' ? 'onlineCount' : device.healthStatus === 'degraded' ? 'degradedCount' : 'offlineCount']++
  }

  for (const merchant of merchantMap.values()) {
    // Location is a column now, so keep a location's devices next to each other.
    merchant.devices.sort((a, b) =>
      (a.locationName ?? '').localeCompare(b.locationName ?? '') ||
      a.stationName.localeCompare(b.stationName)
    )
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

/**
 * No row tint: the Status cell already says Offline/Degraded in weight, and a
 * tint on top of the table's own surface made the layers unreadable.
 */
function DeviceRow({ device }: { device: FleetDevice }) {
  return (
    <TableRow>
      <TableCell className="text-sm py-2 font-medium">{device.stationName}</TableCell>
      <TableCell className="text-sm py-2 text-muted-foreground">{device.locationName ?? 'No location'}</TableCell>
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
 * The table's columns become a name + status line and a 2-up grid of
 * labelled metrics. Each value carries its own label, so nothing depends on a
 * column header that has scrolled off — which is what made the table version
 * unreadable on a phone.
 */
function DeviceCard({ device }: { device: FleetDevice }) {
  // RAM and storage share one full-width row: two narrow "free" cells
  // squeezed the labels, and the pair reads naturally as one reading.
  const metrics: Array<{ label: string; value: string; wide?: boolean }> = [
    { label: 'Battery', value: device.batteryLevel !== null ? `${device.batteryLevel}%` : '—' },
    { label: 'Last seen', value: fmtLastSeen(device.minutesSinceHeartbeat) },
    {
      label: 'RAM/storage free',
      value: `${fmtMb(device.ramFreeMb)}/${fmtMb(device.storageFreeMb)}`,
      wide: true,
    },
  ]

  return (
    <div className="rounded-2xl bg-muted/30 p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-medium">{device.stationName}</p>
        <StatusBadge status={device.healthStatus} short />
      </div>
      <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5">
        {metrics.map(m => (
          <div key={m.label} className={cn('flex items-baseline justify-between gap-2', m.wide && 'col-span-2')}>
            <dt className="text-xs text-muted-foreground">{m.label}</dt>
            <dd className="text-xs font-medium tabular-nums">{m.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

// ── Merchant Section ─────────────────────────────────────────────────────────

/**
 * A merchant row that expands into its devices — a table on desktop, cards on
 * a phone. Every merchant starts collapsed so the list reads as a merchant
 * index first; the Active alerts panel above is where problems surface.
 */
function MerchantSection({ group, isMobile }: { group: MerchantGroup; isMobile: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const deviceCount = group.devices.length

  return (
    // No fill on the group: the device table carries its own surface, and a
    // second grey behind it made the two indistinguishable.
    <div>
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        aria-expanded={expanded}
        className="flex w-full flex-wrap items-center gap-x-2 gap-y-0.5 rounded-xl px-2 py-2 text-left transition-colors hover:bg-muted/40"
      >
        <ChevronRight className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expanded ? 'rotate-90' : ''}`} />
        <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 truncate text-sm font-semibold">{group.merchantName}</span>
        <span className="text-xs text-muted-foreground">
          {deviceCount} device{deviceCount !== 1 ? 's' : ''}
        </span>
        {/* Counts read as text: a row of tinted pills would colour-code
            status, which §14.3 HQ-2 reserves for health and the DLQ. */}
        <span className="flex items-center gap-2 text-xs tabular-nums text-muted-foreground">
          {group.onlineCount > 0 && <span>{group.onlineCount} online</span>}
          {group.degradedCount > 0 && <span className="font-medium">{group.degradedCount} degraded</span>}
          {group.offlineCount > 0 && <span className="font-medium">{group.offlineCount} offline</span>}
        </span>
      </button>

      {expanded && (
        isMobile ? (
          <div className="space-y-2 pt-1">
            {group.devices.map(device => (
              <DeviceCard key={device.stationId} device={device} />
            ))}
          </div>
        ) : (
          <div className="pt-1">
            <Table variant="data" className="min-w-[900px]">
              <TableHeader className="[&_tr]:border-0">
                <TableRow>
                  <TableHead>Station</TableHead>
                  <TableHead>Location</TableHead>
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
                {group.devices.map(device => (
                  <DeviceRow key={device.stationId} device={device} />
                ))}
              </TableBody>
            </Table>
          </div>
        )
      )}
    </div>
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

const NO_ALERTS: FleetAlertItem[] = []

export function FleetHealthDashboard() {
  const { data, isLoading, dataUpdatedAt } = useFleetHealth()
  const isMobile = useIsMobile()
  const [alertHiddenCols, setAlertHiddenCols] = useState<Set<string>>(() =>
    initialHiddenColumns(ACTIVE_ALERT_COLUMNS)
  )
  const showAlertCol = (id: string) => !isMobile || !alertHiddenCols.has(id)
  // Called before the loading return (hooks can't be conditional); the shared
  // hook clamps the page if the live-refetched feed shrinks.
  const {
    pageRows: pagedAlerts,
    pagination: alertPagination,
    setPage: setAlertPage,
  } = useClientPagination(data?.alertFeed ?? NO_ALERTS)

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

  const merchants = groupByMerchant(data.devices)

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
                {pagedAlerts.map((alert: FleetAlertItem, i) => (
                  <TableRow key={`${alertPagination.page}-${i}`}>
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

            <PaginationBar
              className="border-t-0 pt-0"
              pagination={alertPagination}
              onPageChange={setAlertPage}
              itemLabel="alerts"
            />
          </PanelSection>
        </Panel>
      )}

      <Panel>
        <PanelSection
          label={`All devices (${data.totalDevices})`}
          caption="Click a merchant to see its devices."
        >
          {merchants.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">No devices found</div>
          ) : (
            <div className="space-y-4">
              {merchants.map(group => (
                <MerchantSection key={group.merchantId} group={group} isMobile={isMobile} />
              ))}
            </div>
          )}
        </PanelSection>
      </Panel>
    </div>
  )
}
