'use client'

import { useRouter } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import { Radio, Wifi, WifiOff, Battery, BatteryLow, BatteryWarning, AlertCircle } from 'lucide-react'

import { Panel } from '@/components/dashboard/shell/Panel'
import { PanelSection } from '@/components/dashboard/shell/PanelSection'
import { Skeleton } from '@/components/ui/skeleton'
import { usePlatformStationFleet } from '@/lib/queries/use-platform-dashboard'

type FleetStatus = 'green' | 'yellow' | 'red' | 'grey'

/**
 * Device status keeps its colour — HQ exception 2 (`UI-DESIGN-SYSTEM.md`
 * §14.3 HQ-2): an offline terminal or a dying battery is an operational alarm
 * an HQ operator must spot in a dense grid, not decorative state tinting.
 *
 * The colour now rides on the dot and glyph only. The tinted card fills are
 * gone: 60 pastel-filled tiles made the whole panel read as a colour field, so
 * the handful of red ones stopped standing out — the opposite of the intent.
 */
const STATUS: Record<FleetStatus, { dot: string; icon: string; Icon: typeof Wifi; label: string }> = {
  green: { dot: 'bg-green-500', icon: 'text-green-600 dark:text-green-400', Icon: Wifi, label: 'Online' },
  yellow: { dot: 'bg-yellow-500', icon: 'text-yellow-600 dark:text-yellow-400', Icon: BatteryWarning, label: 'Warning' },
  red: { dot: 'bg-red-500', icon: 'text-red-600 dark:text-red-400', Icon: WifiOff, label: 'Offline' },
  grey: { dot: 'bg-muted-foreground/50', icon: 'text-muted-foreground', Icon: AlertCircle, label: 'Inactive' },
}

const LEGEND = (Object.keys(STATUS) as FleetStatus[]).map((k) => ({
  dot: STATUS[k].dot,
  label: STATUS[k].label,
}))

export function DeviceFleetMap() {
  const { data: fleet, isLoading, error } = usePlatformStationFleet()
  const router = useRouter()

  return (
    <Panel className="h-full">
      <PanelSection
        icon={Radio}
        label="Device Fleet Health"
        action={
          !isLoading && !error && fleet && fleet.length > 0 ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {LEGEND.map(({ dot, label }) => (
                <div key={label} className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
                  <span>{label}</span>
                </div>
              ))}
            </div>
          ) : undefined
        }
      >
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-2xl" />
            ))}
          </div>
        ) : error ? (
          <div className="py-8 text-center">
            <p className="text-sm font-medium text-red-600 dark:text-red-400">
              Error loading fleet data
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{(error as Error).message}</p>
          </div>
        ) : !fleet || fleet.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No active stations found
          </div>
        ) : (
          <div className="max-h-[500px] min-w-0 space-y-5 overflow-y-auto">
            {fleet.map((merchant) => (
              <div key={merchant.merchantId} className="min-w-0 space-y-2">
                <h4 className="text-sm font-semibold">{merchant.merchantName}</h4>
                <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
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
                          <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${tone.icon}`} aria-hidden="true" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0 truncate text-sm font-semibold">
                                {station.name}
                              </div>
                              <span className={`h-2 w-2 shrink-0 rounded-full ${tone.dot}`} />
                              <span className="sr-only">{tone.label}</span>
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
              </div>
            ))}
          </div>
        )}
      </PanelSection>
    </Panel>
  )
}
