'use client'

import { usePlatformAlerts, usePlatformStationFleet } from '@/lib/queries/use-platform-dashboard'

/**
 * The one-line answer to "is anything on fire?", directly under the page title.
 *
 * Mission Control previously opened with eight equal-weight KPIs and put the
 * alerts panel three screens down, so a platform with 29 active alerts and two
 * merchants at a critical health score looked calm above the fold.
 *
 * It reads from the same two hooks the panels below already use, so React Query
 * serves both from cache — this adds no request.
 */
export function PlatformStatusLine() {
  const { data: alerts, isLoading: alertsLoading } = usePlatformAlerts()
  const { data: fleet, isLoading: fleetLoading } = usePlatformStationFleet()

  if (alertsLoading || fleetLoading) return null

  const highAlerts = alerts?.filter((a) => a.severity === 'high').length ?? 0
  const totalAlerts = alerts?.length ?? 0
  const offlineStations =
    fleet?.reduce(
      (sum, merchant) =>
        sum + merchant.stations.filter((s) => s.status !== 'green').length,
      0,
    ) ?? 0

  // Nothing worth saying is better than a row of zeroes.
  if (totalAlerts === 0 && offlineStations === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No active alerts — all stations reporting.
      </p>
    )
  }

  const parts = [
    totalAlerts > 0
      ? `${totalAlerts} active alert${totalAlerts === 1 ? '' : 's'}${
          highAlerts > 0 ? ` (${highAlerts} high)` : ''
        }`
      : null,
    offlineStations > 0
      ? `${offlineStations} station${offlineStations === 1 ? '' : 's'} offline`
      : null,
  ].filter(Boolean)

  return (
    <p className="text-sm text-foreground">
      {parts.map((part, i) => (
        <span key={part as string}>
          {i > 0 && <span className="mx-2 text-muted-foreground">·</span>}
          <span className="tabular-nums">{part}</span>
        </span>
      ))}
    </p>
  )
}
