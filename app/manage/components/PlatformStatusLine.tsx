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
export function PlatformStatusLine({
  onNavigate,
}: {
  /** Switches back to the Dashboard tab — the anchors live inside it, and Radix
   *  unmounts inactive tabs, so a bare `#alerts` would do nothing from Health
   *  or Analytics. */
  onNavigate?: () => void
}) {
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

  // Each count jumps to the panel that can act on it, which is the whole
  // triage value without adding a second control surface to the page.
  const parts: { href: string; text: string }[] = []
  if (totalAlerts > 0) {
    parts.push({
      href: '#alerts',
      text: `${totalAlerts} active alert${totalAlerts === 1 ? '' : 's'}${
        highAlerts > 0 ? ` (${highAlerts} high)` : ''
      }`,
    })
  }
  if (offlineStations > 0) {
    parts.push({
      href: '#fleet',
      text: `${offlineStations} station${offlineStations === 1 ? '' : 's'} offline`,
    })
  }

  return (
    <p className="text-sm text-foreground">
      {parts.map((part, i) => (
        <span key={part.href}>
          {i > 0 && <span className="mx-2 text-muted-foreground">·</span>}
          <a
            href={part.href}
            onClick={(event) => {
              if (!onNavigate) return
              // Switch tabs first, then scroll once the target has mounted.
              event.preventDefault()
              onNavigate()
              requestAnimationFrame(() => {
                document
                  .querySelector(part.href)
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              })
            }}
            className="tabular-nums underline-offset-4 hover:underline"
          >
            {part.text}
          </a>
        </span>
      ))}
    </p>
  )
}
