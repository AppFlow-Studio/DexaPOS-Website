'use client'

import { MapPinOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          Locations without a subscription
          <Badge count={locations.length} />
          <InfoHint label="These locations exist but aren't billed yet — no stations, devices, or features are being charged for them." />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {locations.map((location) => (
            <div
              key={location.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-dashed p-3"
            >
              <div className="flex min-w-0 items-center gap-2">
                <MapPinOff className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate font-medium">{location.name}</span>
                <span className="text-xs text-muted-foreground">No subscription</span>
              </div>
              <Button size="sm" variant="outline" onClick={() => onSetup(location.id)}>
                Set up billing
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function Badge({ count }: { count: number }) {
  return (
    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-100 px-1.5 text-xs font-semibold text-amber-700">
      {count}
    </span>
  )
}
