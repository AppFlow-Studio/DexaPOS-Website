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
 * Status is text-led, not colour-coded (`UI-DESIGN-SYSTEM.md` §4.6b,
 * `DS-CTL-09` / D-12): one neutral pill per tile, the **word** carrying the
 * meaning.
 *
 * This panel renders on `/manage` only, so HQ exception 2 (§14.3 HQ-2) does
 * not apply — that exception is scoped to `/manage/health` and the DLQ, and
 * ends "everywhere else in HQ, status stays text-led".
 *
 * The coloured dot it replaces was the panel's second mark for one fact: a
 * neutral glyph on the left and a hued dot on the right, so the glyph was
 * decoration and the dot was a colour key the operator had to learn. Naming
 * the state costs a few pixels and removes the legend entirely.
 */
const STATUS: Record<FleetStatus, { Icon: typeof Wifi; label: string }> = {
  green: { Icon: Wifi, label: 'Online' },
  yellow: { Icon: BatteryWarning, label: 'Warning' },
  red: { Icon: WifiOff, label: 'Offline' },
  grey: { Icon: AlertCircle, label: 'Inactive' },
}

/** §4.6b `DS-CTL-09`, minus the horizontal padding a tile this dense can't spare. */
const STATUS_PILL =
  'inline-flex shrink-0 items-center rounded-full border-0 bg-muted/60 px-2 py-0.5 text-[0.6875rem] font-medium text-muted-foreground'

export function DeviceFleetMap() {
  const { data: fleet, isLoading, error } = usePlatformStationFleet()
  const router = useRouter()
  // Undefined = use the default (open when the merchant has an offline station).
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
          <div className="min-w-0 space-y-3">
            {fleet.map((merchant) => {
              const offlineCount = merchant.stations.filter(
                (s) => s.status !== 'green',
              ).length
              const isOpen = expandedMerchants[merchant.merchantId] ?? offlineCount > 0

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
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {offlineCount > 0
                      ? `${offlineCount} of ${merchant.stations.length} offline`
                      : `${merchant.stations.length} online`}
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
                          <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <div
                                className="min-w-0 truncate text-sm font-semibold"
                                title={station.name}
                              >
                                {station.name}
                              </div>
                              <span className={STATUS_PILL}>{tone.label}</span>
                            </div>
                            <div className="truncate text-xs text-muted-foreground">
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
                            {station.lastHeartbeatAt && (
                              <div className="mt-1 text-xs text-muted-foreground">
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
