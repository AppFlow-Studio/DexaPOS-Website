'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { usePlatformStationFleet } from '@/lib/queries/use-platform-dashboard'
import { useRouter } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import { Radio, Wifi, WifiOff, Battery, BatteryLow, BatteryWarning, AlertCircle } from 'lucide-react'

function getStatusColor(status: 'green' | 'yellow' | 'red' | 'grey'): string {
  switch (status) {
    case 'green':
      return 'bg-green-50 border-green-200 hover:border-green-300'
    case 'yellow':
      return 'bg-yellow-50 border-yellow-200 hover:border-yellow-300'
    case 'red':
      return 'bg-red-50 border-red-200 hover:border-red-300'
    case 'grey':
      return 'bg-gray-50 border-gray-200 hover:border-gray-300'
  }
}

function getStatusDot(status: 'green' | 'yellow' | 'red' | 'grey'): string {
  switch (status) {
    case 'green':
      return 'bg-green-500'
    case 'yellow':
      return 'bg-yellow-500'
    case 'red':
      return 'bg-red-500'
    case 'grey':
      return 'bg-gray-400'
  }
}

function getStatusIcon(status: 'green' | 'yellow' | 'red' | 'grey') {
  switch (status) {
    case 'green':
      return <Wifi className="h-3.5 w-3.5 text-green-600" />
    case 'yellow':
      return <BatteryWarning className="h-3.5 w-3.5 text-yellow-600" />
    case 'red':
      return <WifiOff className="h-3.5 w-3.5 text-red-600" />
    case 'grey':
      return <AlertCircle className="h-3.5 w-3.5 text-gray-500" />
  }
}

export function DeviceFleetMap() {
  const { data: fleet, isLoading, error } = usePlatformStationFleet()
  const router = useRouter()

  if (isLoading) {
    return (
      <Card className="border border-blue-100/50 bg-white/80 backdrop-blur-sm shadow-sm rounded-xl overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold text-slate-900">Device Fleet Health</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="border border-blue-100/50 bg-white/80 backdrop-blur-sm shadow-sm rounded-xl overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold text-slate-900">Device Fleet Health</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="flex items-center justify-center h-32 bg-red-50/50 rounded-lg border border-red-100">
            <div className="text-sm text-center">
              <p className="font-semibold text-red-700 mb-1">Error loading fleet data</p>
              <p className="text-xs text-red-600">{(error as Error).message}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!fleet || fleet.length === 0) {
    return (
      <Card className="border border-blue-100/50 bg-white/80 backdrop-blur-sm shadow-sm rounded-xl overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold text-slate-900">Device Fleet Health</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="flex items-center justify-center h-32 bg-blue-50/30 rounded-lg border border-dashed border-blue-200">
            <span className="text-sm text-muted-foreground">No active stations found</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border border-blue-100/50 bg-white/80 backdrop-blur-sm shadow-sm rounded-xl overflow-hidden hover:shadow-md transition-all duration-200">
      <CardHeader className="pb-2 border-b border-blue-100/50">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-blue-600" />
            <CardTitle className="text-base font-semibold text-slate-900">Device Fleet Health</CardTitle>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-500 shrink-0"></span>
              <span>Online</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-yellow-500 shrink-0"></span>
              <span>Warning</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-500 shrink-0"></span>
              <span>Offline</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-gray-400 shrink-0"></span>
              <span>Inactive</span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="max-h-[500px] overflow-y-auto p-4 pt-3 scrollbar-thin scrollbar-thumb-blue-200 scrollbar-track-transparent">
        <div className="space-y-5">
          {fleet.map((merchant) => (
            <div key={merchant.merchantId} className="space-y-2">
              <h4 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                {merchant.merchantName}
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {merchant.stations.map((station) => (
                  <div
                    key={station.id}
                    className={`p-3 rounded-xl border cursor-pointer transition-all duration-200 hover:scale-[1.02] hover:shadow-md ${getStatusColor(station.status)}`}
                    onClick={() =>
                      router.push(`/manage/merchants/${station.merchantId}?tab=devices`)
                    }
                  >
                    <div className="flex items-start gap-2">
                      <div className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center bg-white/80`}>
                        {getStatusIcon(station.status)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-semibold truncate text-slate-800">{station.name}</div>
                          <span className={`w-2 h-2 rounded-full ${getStatusDot(station.status)}`}></span>
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {station.locationName}
                        </div>
                        <div className="flex items-center justify-between mt-1 text-xs text-muted-foreground">
                          {station.appVersion && (
                            <span>v{station.appVersion}</span>
                          )}
                          <span className="flex items-center gap-0.5">
                            {station.batteryLevel !== null ? (
                              <>
                                {station.batteryLevel > 50 ? (
                                  <Battery className="h-3 w-3" />
                                ) : station.batteryLevel > 20 ? (
                                  <BatteryLow className="h-3 w-3" />
                                ) : (
                                  <BatteryWarning className="h-3 w-3 text-yellow-600" />
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
                          <div className="text-xs text-muted-foreground mt-1">
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