'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import Link from 'next/link'
import { usePlatformActivityFeed } from '@/lib/queries/use-platform-dashboard'
import { formatDistanceToNow } from 'date-fns'
import { Activity } from 'lucide-react'

export function LiveActivityFeed() {
  const { data: events, isLoading, error } = usePlatformActivityFeed()

  if (isLoading) {
    return (
      <Card className="border border-blue-100/50 bg-white/80 backdrop-blur-sm shadow-sm rounded-xl overflow-hidden">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold text-slate-900">Live Activity Feed</CardTitle>
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
              </span>
              <span className="text-xs text-blue-600 font-medium">Loading</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="max-h-[500px] overflow-y-auto p-4 pt-0">
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
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
          <CardTitle className="text-base font-semibold text-slate-900">Live Activity Feed</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="flex items-center justify-center h-32 bg-red-50/50 rounded-lg border border-red-100">
            <div className="text-sm text-center">
              <p className="font-semibold text-red-700 mb-1">Error loading activity feed</p>
              <p className="text-xs text-red-600">{(error as Error).message}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border border-blue-100/50 bg-white/80 backdrop-blur-sm shadow-sm rounded-xl overflow-hidden hover:shadow-md transition-all duration-200">
      <CardHeader className="pb-2 border-b border-blue-100/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-blue-600" />
            <CardTitle className="text-base font-semibold text-slate-900">Live Activity Feed</CardTitle>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
            <span className="text-xs text-green-600 font-medium">Live</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="max-h-[500px] overflow-y-auto p-4 pt-3 scrollbar-thin scrollbar-thumb-blue-200 scrollbar-track-transparent">
        {!events || events.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground bg-blue-50/30 rounded-lg border border-dashed border-blue-200">
            <span className="text-sm">Waiting for activity...</span>
          </div>
        ) : (
          <div className="space-y-3">
            {events.map((event) => (
              <div
                key={event.id}
                className="group flex gap-3 p-2 rounded-lg hover:bg-blue-50/50 transition-colors duration-150"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-lg">
                  {event.emoji}
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  {event.link ? (
                    <Link
                      href={event.link}
                      className="text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline transition-colors"
                    >
                      <span dangerouslySetInnerHTML={{ __html: event.message }} />
                    </Link>
                  ) : (
                    <p
                      className="text-sm text-slate-700"
                      dangerouslySetInnerHTML={{ __html: event.message }}
                    />
                  )}
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(event.timestamp), { addSuffix: true })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}