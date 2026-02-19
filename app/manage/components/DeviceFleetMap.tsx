'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { usePlatformStationFleet } from '@/lib/queries/use-platform-dashboard'
import { useRouter } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'

function getStatusColor(status: 'green' | 'yellow' | 'red' | 'grey'): string {
  switch (status) {
    case 'green':
      return 'border-l-4 border-l-green-500 bg-green-50 dark:bg-green-950'
    case 'yellow':
      return 'border-l-4 border-l-yellow-500 bg-yellow-50 dark:bg-yellow-950'
    case 'red':
      return 'border-l-4 border-l-red-500 bg-red-50 dark:bg-red-950'
    case 'grey':
      return 'border-l-4 border-l-gray-300 bg-gray-50 dark:bg-gray-900'
  }
}

function getStatusEmoji(status: 'green' | 'yellow' | 'red' | 'grey'): string {
  switch (status) {
    case 'green':
      return '🟢'
    case 'yellow':
      return '🟡'
    case 'red':
      return '🔴'
    case 'grey':
      return '⚫'
  }
}

export function DeviceFleetMap() {
  const { data: fleet, isLoading } = usePlatformStationFleet()
  const router = useRouter()

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Device Fleet Health</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!fleet || fleet.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Device Fleet Health</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-32 text-muted-foreground">
            No active stations found
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Device Fleet Health</CardTitle>
      </CardHeader>
      <CardContent className="max-h-[500px] overflow-y-auto">
        <div className="space-y-4">
          {fleet.map((merchant) => (
            <div key={merchant.merchantId}>
              <h4 className="text-sm font-semibold mb-2">{merchant.merchantName}</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {merchant.stations.map((station) => (
                  <div
                    key={station.id}
                    className={`p-3 rounded-lg cursor-pointer transition-opacity hover:opacity-80 ${getStatusColor(station.status)}`}
                    onClick={() =>
                      router.push(`/manage/merchants/${station.merchantId}?tab=devices`)
                    }
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-lg mt-0.5">{getStatusEmoji(station.status)}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold truncate">{station.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {station.locationName}
                        </div>
                        {station.appVersion && (
                          <div className="text-xs text-muted-foreground">
                            v{station.appVersion}
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground mt-1">
                          {station.batteryLevel !== null
                            ? `🔋 ${station.batteryLevel}%`
                            : '🔋 plugged'}
                        </div>
                        {station.lastHeartbeatAt && (
                          <div className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(station.lastHeartbeatAt), {
                              addSuffix: true,
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
