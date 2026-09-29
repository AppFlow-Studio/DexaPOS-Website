'use client'

import { MapPinOff, MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { InfoHint } from './InfoHint'

export interface LocationWithoutSub {
  id: string
  name: string
}

interface LocationsWithoutSubscriptionProps {
  locations: LocationWithoutSub[]
  onSetup: (locationId: string) => void
}

/**
 * Surfaces locations that exist but have no location subscription yet, so HQ can
 * spot gaps at a glance and jump straight into setting one up.
 */
export function LocationsWithoutSubscription({ locations, onSetup }: LocationsWithoutSubscriptionProps) {
  if (locations.length === 0) return null

  return (
    <Card className="rounded-3xl">
      <CardHeader className="pb-3 max-sm:px-4">
        <CardTitle className="flex items-center gap-2 text-base text-[#0C4FD1] dark:text-[#6CA0FF]">
          Locations without a subscription
          <Badge count={locations.length} />
          <InfoHint label="These locations exist but aren't billed yet — no stations, devices, or features are being charged for them." />
        </CardTitle>
      </CardHeader>
      <CardContent className="max-sm:px-4">
        <div className="space-y-2">
          {locations.map((location) => (
            <div
              key={location.id}
              className="flex items-center justify-between gap-3 rounded-2xl bg-muted/45 p-3"
            >
              <div className="flex min-w-0 items-center gap-2">
                <MapPinOff className="h-4 w-4 shrink-0 text-muted-foreground max-sm:hidden" />
                <span className="truncate font-medium">{location.name}</span>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 max-sm:hidden"
                onClick={() => onSetup(location.id)}
              >
                Set up billing
              </Button>
              {/* Phone: the action folds into a menu so the name keeps the row. */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="h-8 w-8 shrink-0 rounded-full p-0 sm:hidden"
                    aria-label={`Actions for ${location.name}`}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onSetup(location.id)}>
                    Set up billing
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function Badge({ count }: { count: number }) {
  return (
    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted/60 px-1.5 text-xs font-semibold tabular-nums text-muted-foreground">
      {count}
    </span>
  )
}
