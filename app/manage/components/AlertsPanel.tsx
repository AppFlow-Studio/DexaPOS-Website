'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { usePlatformAlerts } from '@/lib/queries/use-platform-dashboard'
import Link from 'next/link'
import { PlatformAlert } from '@/app/manage/actions/hq-platform/dashboard'
import { X, CheckCircle, AlertCircle, AlertTriangle, Info, ChevronDown, ChevronRight } from 'lucide-react'

export function AlertsPanel() {
  const { data: allAlerts, isLoading, error } = usePlatformAlerts()
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set())
  const [alerts, setAlerts] = useState<PlatformAlert[]>([])
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

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

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'high':
        return <AlertCircle className="h-4 w-4 text-red-500" />
      case 'medium':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />
      case 'low':
        return <Info className="h-4 w-4 text-blue-500" />
      default:
        return <Info className="h-4 w-4 text-gray-500" />
    }
  }

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'high':
        return <Badge variant="destructive" className="bg-red-100 text-red-700 hover:bg-red-200 border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-900 dark:hover:bg-red-950/70">High</Badge>
      case 'medium':
        return <Badge variant="secondary" className="bg-yellow-100 text-yellow-700 hover:bg-yellow-200 border-yellow-200 dark:bg-yellow-950/50 dark:text-yellow-400 dark:border-yellow-900 dark:hover:bg-yellow-950/70">Medium</Badge>
      case 'low':
        return <Badge variant="outline" className="bg-blue-100 text-blue-700 hover:bg-blue-200 border-blue-200 dark:bg-blue-950/50 dark:text-blue-400 dark:border-blue-900 dark:hover:bg-blue-950/70">Low</Badge>
      default:
        return <Badge variant="outline">{severity}</Badge>
    }
  }

  if (isLoading) {
    return (
      <Card className="border border-blue-100/50 dark:border-border bg-white/80 dark:bg-card/80 backdrop-blur-sm shadow-sm rounded-xl overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold text-slate-900 dark:text-slate-100">Alerts & Actions</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
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
      <Card className="border border-blue-100/50 dark:border-border bg-white/80 dark:bg-card/80 backdrop-blur-sm shadow-sm rounded-xl overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold text-slate-900 dark:text-slate-100">Alerts & Actions</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="flex items-center justify-center h-32 bg-red-50/50 rounded-lg border border-red-100">
            <div className="text-sm text-center">
              <p className="font-semibold text-red-700 mb-1">Error loading alerts</p>
              <p className="text-xs text-red-600">{(error as Error).message}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border border-blue-100/50 dark:border-border bg-white/80 dark:bg-card/80 backdrop-blur-sm shadow-sm rounded-xl overflow-hidden hover:shadow-md transition-all duration-200">
      <CardHeader className="pb-2 border-b border-blue-100/50 dark:border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <CardTitle className="text-base font-semibold text-slate-900 dark:text-slate-100">Alerts & Actions</CardTitle>
          </div>
          {alerts.length > 0 && (
            <Badge variant="outline" className="bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-400 dark:border-blue-900">
              {alerts.length} active
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="max-h-[500px] overflow-y-auto p-4 pt-3 scrollbar-thin scrollbar-thumb-blue-200 scrollbar-track-transparent">
        {alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 bg-green-50/50 dark:bg-green-950/20 rounded-lg border border-green-100 dark:border-green-900">
            <CheckCircle className="h-8 w-8 text-green-500 dark:text-green-400 mb-2" />
            <p className="text-sm text-green-700 dark:text-green-400 font-medium">All clear! No active alerts</p>
            <p className="text-xs text-green-600 dark:text-green-500 mt-1">You're up to date</p>
          </div>
        ) : (
          <div className="space-y-2">
            {alerts.map((alert) => {
              const isGrouped = (alert.groupedDevices?.length ?? 0) > 0
              const isExpanded = expandedGroups.has(alert.id)
              return (
                <div
                  key={alert.id}
                  className="group flex flex-col gap-2 p-3 rounded-lg border border-blue-100/50 dark:border-border bg-white/50 dark:bg-card/40 hover:bg-white/80 dark:hover:bg-card/70 transition-all duration-200 hover:shadow-sm"
                >
                  <div className="flex gap-3">
                    <div className="shrink-0 mt-0.5">{getSeverityIcon(alert.severity)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        {getSeverityBadge(alert.severity)}
                        {isGrouped && (
                          <Badge variant="outline" className="bg-slate-100 text-slate-700 border-slate-200 dark:bg-muted dark:text-muted-foreground dark:border-border">
                            {alert.groupedDevices!.length} devices
                          </Badge>
                        )}
                      </div>
                      {alert.link ? (
                        <Link
                          href={alert.link}
                          className="text-sm text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 hover:underline transition-colors"
                        >
                          {alert.message}
                        </Link>
                      ) : (
                        <p className="text-sm text-slate-700 dark:text-slate-300">{alert.message}</p>
                      )}
                      {isGrouped && (
                        <button
                          onClick={() =>
                            setExpandedGroups((prev) => {
                              const next = new Set(prev)
                              if (next.has(alert.id)) next.delete(alert.id)
                              else next.add(alert.id)
                              return next
                            })
                          }
                          className="mt-1 inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                        >
                          {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                          {isExpanded ? 'Hide devices' : 'Show devices'}
                        </button>
                      )}
                    </div>
                    <button
                      onClick={() => dismissAlert(alert.id)}
                      className="shrink-0 text-muted-foreground hover:text-foreground transition-colors hover:bg-blue-100/50 p-1 rounded-md self-start"
                      aria-label="Dismiss alert"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  {isGrouped && isExpanded && (
                    <ul className="ml-7 border-l border-slate-200 dark:border-border pl-3 text-xs text-slate-600 dark:text-slate-400 space-y-1">
                      {alert.groupedDevices!.map((d) => (
                        <li key={d.stationId} className="flex flex-wrap justify-between gap-x-3 gap-y-0.5">
                          <span className="font-medium text-slate-700 dark:text-slate-300 min-w-0 truncate">{d.stationName}</span>
                          <span className="text-slate-500 shrink-0">
                            {d.lastHeartbeatAt
                              ? `last seen ${new Date(d.lastHeartbeatAt).toLocaleTimeString()}`
                              : 'no heartbeat'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}