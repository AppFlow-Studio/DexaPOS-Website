'use client'

import { Check, EyeOff, ListChecks, Monitor } from 'lucide-react'
import Link from 'next/link'

import { useLocationStationMenuCoverage } from '@/app/dashboard/settings/stations/hooks/useStationMenuScope'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { MenuChannelVisibility } from '@/lib/menu/menu-channel-visibility'
import {
  computeMenuStationCoverage,
  describeMenuStationCoverage,
  stationMenuChannelLabel,
  type StationMenuCoverageEntry,
} from '@/lib/stations/station-menu-scope'
import { cn } from '@/lib/utils'

interface MenuStationCoverageProps {
  menuId: string
  /** The row's channel flags, already normalized. */
  visibility: Pick<MenuChannelVisibility, 'is_visible_on_pos' | 'is_visible_on_kiosk'>
  /** Null or 'all' renders nothing: coverage is a per-location question. */
  locationId: string | null | undefined
  className?: string
}

/**
 * The menu page's answer to "where does this menu actually show?".
 *
 * The POS / Kiosk switches beside this pill are location-wide. Per-station
 * scope (Settings → Stations → Menus) can narrow them further, and before this
 * pill nothing on the menu page said so: a manager switching Sushi off for
 * Kiosk had no way to see it was hiding it from two kiosks, or that a third
 * kiosk had never selected it in the first place.
 *
 * Read-only on purpose. Editing from here would have to flip an "All menus"
 * station to "Selected" behind the manager's back; the station's own Menus
 * tab is one click away through every row of the popover.
 */
export function MenuStationCoverage({
  menuId,
  visibility,
  locationId,
  className,
}: MenuStationCoverageProps) {
  const query = useLocationStationMenuCoverage(locationId)

  if (!locationId || locationId === 'all') return null
  if (!query.data || query.data.stations.length === 0) return null

  const coverage = computeMenuStationCoverage(
    menuId,
    visibility,
    query.data.stations,
    query.data.stationMenus,
  )
  const label = describeMenuStationCoverage(coverage)
  const partial = coverage.shownCount < coverage.total

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Shown on ${label.toLowerCase()}. Open to see which.`}
          className={cn(
            'inline-flex max-w-full items-center gap-1.5 rounded-full bg-muted/60 px-2.5 py-0.5 text-xs font-medium transition-colors hover:bg-muted',
            partial ? 'text-foreground' : 'text-muted-foreground',
            className,
          )}
        >
          <Monitor className="h-3 w-3 shrink-0" />
          <span className="truncate">{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 rounded-2xl p-2">
        <p className="px-2 pb-2 pt-1 text-xs font-medium text-muted-foreground">
          Stations at this location
        </p>
        <ul className="max-h-72 space-y-0.5 overflow-y-auto">
          {coverage.entries.map((entry) => (
            <li key={entry.stationId}>
              <Link
                href={`/dashboard/settings/stations/${entry.stationId}`}
                className="flex min-w-0 items-center justify-between gap-3 rounded-xl px-2 py-1.5 text-sm hover:bg-muted/60"
              >
                <span className="min-w-0 truncate">{entry.stationName}</span>
                <CoverageReason entry={entry} />
              </Link>
            </li>
          ))}
        </ul>
        <p className="px-2 pb-1 pt-2 text-xs text-muted-foreground">
          The {stationMenuChannelLabel('pos')} and{' '}
          {stationMenuChannelLabel('kiosk')} switches apply to every station of
          that type. Open a station to change its own selection.
        </p>
      </PopoverContent>
    </Popover>
  )
}

function CoverageReason({ entry }: { entry: StationMenuCoverageEntry }) {
  if (entry.reason === 'shown') {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
        <Check className="h-3 w-3" />
        Shown
      </span>
    )
  }
  if (entry.reason === 'channel') {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
        <EyeOff className="h-3 w-3" />
        Hidden on {stationMenuChannelLabel(entry.channel)}
      </span>
    )
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
      <ListChecks className="h-3 w-3" />
      Not selected
    </span>
  )
}
