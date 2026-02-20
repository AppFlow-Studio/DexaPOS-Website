'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { usePlatformAlerts } from '@/lib/queries/use-platform-dashboard'
import Link from 'next/link'
import { PlatformAlert } from '@/app/manage/actions/hq-platform/dashboard'
import { X, CheckCircle } from 'lucide-react'

export function AlertsPanel() {
  const { data: allAlerts, isLoading, error } = usePlatformAlerts()
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set())
  const [alerts, setAlerts] = useState<PlatformAlert[]>([])

  // Load dismissed alerts from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('dismissedAlerts')
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as Record<string, number>
        const now = Date.now()
        const notExpired = Object.entries(parsed)
          .filter(([_, time]) => now - time < 24 * 60 * 60 * 1000) // 24 hour expiry
          .map(([id]) => id)

        setDismissedAlerts(new Set(notExpired))
      } catch {
        // Ignore parsing errors
      }
    }
  }, [])

  // Filter and sort alerts
  useEffect(() => {
    if (!allAlerts) {
      setAlerts([])
      return
    }

    const filtered = allAlerts
      .filter((alert) => !dismissedAlerts.has(alert.id))
      .sort((a, b) => {
        const severityOrder = { high: 0, medium: 1, low: 2 }
        return severityOrder[a.severity] - severityOrder[b.severity]
      })

    setAlerts(filtered)
  }, [allAlerts, dismissedAlerts])

  const dismissAlert = (alertId: string) => {
    const newDismissed = new Set(dismissedAlerts)
    newDismissed.add(alertId)
    setDismissedAlerts(newDismissed)

    // Persist to localStorage
    const stored = localStorage.getItem('dismissedAlerts') || '{}'
    const parsed = JSON.parse(stored) as Record<string, number>
    parsed[alertId] = Date.now()
    localStorage.setItem('dismissedAlerts', JSON.stringify(parsed))
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Alerts & Actions</CardTitle>
        </CardHeader>
        <CardContent>
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
          <CardTitle className="text-base">Alerts & Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-32 text-destructive">
            <div className="text-sm">
              <p className="font-semibold mb-1">Error loading alerts</p>
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
        <CardTitle className="text-base">Alerts & Actions</CardTitle>
      </CardHeader>
      <CardContent className="max-h-[500px] overflow-y-auto">
        {alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
            <CheckCircle className="h-8 w-8 text-green-600 mb-2" />
            <p>No active alerts</p>
          </div>
        ) : (
          <div className="space-y-3">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className="flex gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge
                      variant={
                        alert.severity === 'high'
                          ? 'destructive'
                          : alert.severity === 'medium'
                            ? 'secondary'
                            : 'outline'
                      }
                      className="text-xs"
                    >
                      {alert.severity.toUpperCase()}
                    </Badge>
                  </div>
                  {alert.link ? (
                    <Link href={alert.link} className="hover:underline text-blue-600 text-sm">
                      {alert.message}
                    </Link>
                  ) : (
                    <p className="text-sm">{alert.message}</p>
                  )}
                </div>
                <button
                  onClick={() => dismissAlert(alert.id)}
                  className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Dismiss alert"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
