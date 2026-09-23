'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import { Radio, Wifi, WifiOff, Battery, BatteryLow, BatteryWarning, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react'

import { Panel } from '@/components/dashboard/shell/Panel'
import { PanelSection } from '@/components/dashboard/shell/PanelSection'
import { Skeleton } from '@/components/ui/skeleton'
import { usePlatformStationFleet } from '@/lib/queries/use-platform-dashboard'

type FleetStatus = 'green' | 'yellow' | 'red' | 'grey'

/**
 * Status is still text-led, not colour-coded (`UI-DESIGN-SYSTEM.md` §4.6b,
 * `DS-CTL-09` / D-12) — but the word is now `sr-only` rather than a visible
 * pill.
 *
 * This panel renders on `/manage` only, so HQ exception 2 (§14.3 HQ-2) does
 * not apply — that exception is scoped to `/manage/health` and the DLQ, and
 * ends "everywhere else in HQ, status stays text-led".
 *
 * The visible pill was dropped because the group header states the same fact
 * ("17 of 17 offline") directly above the rows it labels, so in the common
 * all-offline group it repeated once per device. These glyphs stay neutral —
 * none of them is a colour key — and the label rides along for assistive tech.
 *
 * ⚠️ The trade-off: in a *mixed* group ("3 of 17 offline") a sighted reader now
 * tells the states apart by glyph alone. If that becomes a real complaint,
 * bring the pill back for non-`red` rows rather than for all of them.
 */
const STATUS: Record<FleetStatus, { Icon: typeof Wifi; label: string }> = {
  green: { Icon: Wifi, label: 'Online' },
  yellow: { Icon: BatteryWarning, label: 'Warning' },
  red: { Icon: WifiOff, label: 'Offline' },
  grey: { Icon: AlertCircle, label: 'Inactive' },
}

export function DeviceFleetMap() {
  const { data: fleet, isLoading, error } = usePlatformStationFleet()
  const router = useRouter()
  // Undefined = use the default (collapsed).
  const [expandedMerchants, setExpandedMerchants] = useState<Record<string, boolean>>({})

  return (
    <Panel className="h-full">
      <PanelSection
        icon={Radio}
        label="Device Fleet Health"
      >
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-2xl" />
            ))}
          </div>
        ) : error ? (
          <div className="py-8 text-center">
            <p className="text-sm font-medium text-destructive">
              Error loading fleet data
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{(error as Error).message}</p>
          </div>
        ) : !fleet || fleet.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No active stations found
          </div>
        ) : (
          // Collapsible groups rather than a `max-h` scroll well: a nested
          // scroll region inside the outer page scroll is hard to reach, and
          // every merchant expanded at once buried the ones with problems.
          // Groups with an offline station open by default — those are the ones
          // worth looking at.
          <div className="min-w-0 space-y-1.5">
            {fleet.map((merchant) => {
              const offlineCount = merchant.stations.filter(
                (s) => s.status !== 'green',
              ).length
              // Collapsed by default. Auto-opening every merchant with an
              // offline station re-created the original problem — on a platform
              // where most merchants have one, nearly all of them opened at
              // once. The header's "17 of 17 offline" carries the state, so the
              // closed list is the summary and opening is opt-in.
              const isOpen = expandedMerchants[merchant.merchantId] ?? false

              return (
              <div key={merchant.merchantId} className="min-w-0 space-y-2">
                <button
                  type="button"
                  onClick={() =>
                    setExpandedMerchants((prev) => ({
                      ...prev,
                      [merchant.merchantId]: !isOpen,
                    }))
                  }
                  aria-expanded={isOpen}
                  className="flex w-full min-w-0 items-center justify-between gap-3 rounded-2xl bg-muted/40 px-3 py-2 text-left transition-colors hover:bg-muted/70"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="truncate text-sm font-semibold">
                      {merchant.merchantName}
                    </span>
                  </span>
                  {/* With every group closed this line is the only signal, so
                      a merchant with devices down reads at full strength while
                      a healthy one stays quiet. Weight, not colour (D-03). */}
                  <span
                    className={
                      offlineCount > 0
                        ? 'shrink-0 text-xs font-medium tabular-nums text-foreground'
                        : 'shrink-0 text-xs tabular-nums text-muted-foreground'
                    }
                  >
                    {/* "N offline" on a phone rather than "N of M offline":
                        the denominator competes with the merchant name for a
                        narrow row, and the count of what is broken is the
                        part being scanned for. Full ratio returns at `sm`. */}
                    {offlineCount > 0 ? (
                      <>
                        <span className="sm:hidden">{offlineCount} offline</span>
                        <span className="hidden sm:inline">
                          {offlineCount} of {merchant.stations.length} offline
                        </span>
                      </>
                    ) : (
                      `${merchant.stations.length} online`
                    )}
                  </span>
                </button>
                {/* 2 columns, not 3: at this panel width a third column left
                    ~130px per tile, which truncated almost every device name
                    ("Front ...", "Kitche...") to the point of ambiguity. */}
                {isOpen && (
                <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2">
                  {merchant.stations.map((station) => {
                    const tone = STATUS[station.status as FleetStatus] ?? STATUS.grey
                    const { Icon } = tone
                    return (
                      // A real button: these tiles were click-only `div`s, so
                      // the fleet grid was unreachable by keyboard.
                      <button
                        key={station.id}
                        type="button"
                        onClick={() =>
                          router.push(`/manage/merchants/${station.merchantId}?tab=devices`)
                        }
                        className="min-w-0 rounded-2xl bg-muted/40 p-3 text-left transition-colors hover:bg-muted/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <div className="flex min-w-0 items-start gap-2">
                          {/* `title` on the wrapper, not the icon: with the pill
                              gone this glyph is the only visible status mark,
                              so it names the state on hover. Lucide's prop type
                              takes no children, so a nested <title> would not
                              typecheck. The icon stays `aria-hidden` — the
                              `sr-only` label below is what gets announced. */}
                          <span
                            className="mt-0.5 flex shrink-0"
                            title={tone.label}
                          >
                            <Icon
                              className="h-3.5 w-3.5 text-muted-foreground"
                              aria-hidden="true"
                            />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <div
                                className="min-w-0 truncate text-sm font-semibold"
                                title={station.name}
                              >
                                {station.name}
                              </div>
                              {/* The pill is gone at every width. In a group
                                  headed "N of M offline" it restated the row's
                                  state on every line, and the leading glyph
                                  (Wifi / WifiOff / BatteryWarning / AlertCircle)
                                  already distinguishes the four states.

                                  That glyph was `aria-hidden` while the pill
                                  carried the state for assistive tech, so the
                                  label moves into it rather than disappearing —
                                  removing both would leave a screen reader with
                                  a device name and no status at all. */}
                              <span className="sr-only">{tone.label}</span>
                            </div>
                            {/* Desktop-only: the group this row sits inside is
                                already the merchant, and the row links through
                                to the devices tab where the location is shown
                                in full. */}
                            <div className="hidden truncate text-xs text-muted-foreground sm:block">
                              {station.locationName}
                            </div>
                            <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                              {station.appVersion && <span>v{station.appVersion}</span>}
                              <span className="flex items-center gap-0.5 tabular-nums">
                                {station.batteryLevel !== null ? (
                                  <>
                                    {station.batteryLevel > 50 ? (
                                      <Battery className="h-3 w-3" />
                                    ) : station.batteryLevel > 20 ? (
                                      <BatteryLow className="h-3 w-3" />
                                    ) : (
                                      <BatteryWarning className="h-3 w-3 text-yellow-600 dark:text-yellow-400" />
                                    )}
                                    {station.batteryLevel}%
                                  </>
                                ) : (
                                  <span className="flex items-center gap-0.5">
                                    <Battery className="h-3 w-3" />
                                    plugged
                                  </span>
                                )}
                              </span>
                            </div>
                            {/* Labelled, not a bare relative time: "6 months
                                ago" next to an Offline pill reads as the age of
                                the alert when it is actually the device's last
                                check-in — the difference between a recent
                                outage and a terminal that has been dead since
                                spring. `title` carries the exact timestamp. */}
                            {station.lastHeartbeatAt && (
                              <div
                                className="mt-1 hidden truncate text-xs text-muted-foreground sm:block"
                                title={new Date(station.lastHeartbeatAt).toLocaleString()}
                              >
                                Last seen{' '}
                                {formatDistanceToNow(new Date(station.lastHeartbeatAt), {
                                  addSuffix: true,
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
                )}
              </div>
              )
            })}
          </div>
        )}
      </PanelSection>
    </Panel>
  )
}
