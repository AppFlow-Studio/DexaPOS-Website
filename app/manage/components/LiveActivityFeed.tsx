'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import Link from 'next/link'
import { usePlatformActivityFeed } from '@/lib/queries/use-platform-dashboard'
import { formatDistanceToNow } from 'date-fns'

export function LiveActivityFeed() {
  const { data: events, isLoading, error } = usePlatformActivityFeed()

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Live Activity Feed</CardTitle>
        </CardHeader>
        <CardContent className="max-h-[500px] overflow-y-auto">
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Live Activity Feed</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-32 text-destructive">
            <div className="text-sm">
              <p className="font-semibold mb-1">Error loading activity feed</p>
              <p className="text-xs">{(error as Error).message}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Live Activity Feed</CardTitle>
      </CardHeader>
      <CardContent className="max-h-[500px] overflow-y-auto">
        {!events || events.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground">
            Waiting for activity...
          </div>
        ) : (
          <div className="space-y-3">
            {events.map((event) => (
              <div key={event.id} className="flex gap-3 pb-3 border-b last:border-0 text-sm">
                <div className="text-lg">{event.emoji}</div>
                <div className="flex-1 min-w-0">
                  {event.link ? (
                    <Link href={event.link} className="hover:underline text-blue-600">
                      <span dangerouslySetInnerHTML={{ __html: event.message }} />
                    </Link>
                  ) : (
                    <span dangerouslySetInnerHTML={{ __html: event.message }} />
                  )}
                  <div className="text-xs text-muted-foreground mt-1">
                    {formatDistanceToNow(new Date(event.timestamp), { addSuffix: true })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
