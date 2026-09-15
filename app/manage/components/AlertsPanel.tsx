'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { X, AlertCircle, AlertTriangle, Info, ChevronDown, ChevronRight } from 'lucide-react'

import { Panel } from '@/components/dashboard/shell/Panel'
import { PanelSection } from '@/components/dashboard/shell/PanelSection'
import { Skeleton } from '@/components/ui/skeleton'
import { usePlatformAlerts } from '@/lib/queries/use-platform-dashboard'
import { PlatformAlert } from '@/app/manage/actions/hq-platform/dashboard'

/**
 * Alert severity keeps its colour — one of the two documented HQ exceptions
 * (`UI-DESIGN-SYSTEM.md` §14.3 HQ-2). A platform alert IS an operational alarm,
 * which is exactly the case the no-status-colour rule carves out.
 *
 * It is applied to the icon only, not as a filled badge: the glyph reads as a
 * signal, while five filled pills per row read as noise and drown the one
 * `high` row that matters.
 */
const SEVERITY_ICON = {
  high: { Icon: AlertCircle, className: 'text-red-600 dark:text-red-400' },
  medium: { Icon: AlertTriangle, className: 'text-amber-600 dark:text-amber-400' },
  low: { Icon: Info, className: 'text-muted-foreground' },
} as const

const SEVERITY_LABEL: Record<string, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

/** `DS-CTL-09` — one neutral pill; the word carries the meaning. */
const BADGE_SHELL =
  'inline-flex shrink-0 items-center gap-1.5 rounded-full border-0 bg-muted/60 px-2.5 py-0.5 text-xs font-medium'

function SeverityIcon({ severity }: { severity: string }) {
  const { Icon, className } =
    SEVERITY_ICON[severity as keyof typeof SEVERITY_ICON] ?? SEVERITY_ICON.low

  return (
    <>
      <Icon className={`h-4 w-4 shrink-0 ${className}`} aria-hidden="true" />
      <span className="sr-only">{SEVERITY_LABEL[severity] ?? severity} severity</span>
    </>
  )
}

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

  return (
    <Panel className="h-full">
      <PanelSection
        icon={AlertCircle}
        label="Alerts & Actions"
        action={
          !isLoading && !error && alerts.length > 0 ? (
            <span className={BADGE_SHELL}>{alerts.length} active</span>
          ) : undefined
        }
      >
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-2xl" />
            ))}
          </div>
        ) : error ? (
          <div className="py-8 text-center">
            <p className="text-sm font-medium text-red-600 dark:text-red-400">
              Error loading alerts
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {(error as Error).message}
            </p>
          </div>
        ) : alerts.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm font-medium">All clear — no active alerts</p>
            <p className="mt-1 text-xs text-muted-foreground">You&apos;re up to date</p>
          </div>
        ) : (
          <div className="max-h-[500px] min-w-0 space-y-2 overflow-y-auto">
            {alerts.map((alert) => {
              const isGrouped = (alert.groupedDevices?.length ?? 0) > 0
              const isExpanded = expandedGroups.has(alert.id)
              return (
                <div
                  key={alert.id}
                  className="flex min-w-0 flex-col gap-2 rounded-2xl bg-muted/40 p-3 transition-colors hover:bg-muted/60"
                >
                  <div className="flex min-w-0 gap-3">
                    <div className="mt-0.5 shrink-0">
                      <SeverityIcon severity={alert.severity} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <span className={BADGE_SHELL}>
                          {SEVERITY_LABEL[alert.severity] ?? alert.severity}
                        </span>
                        {isGrouped && (
                          <span className={BADGE_SHELL}>
                            {alert.groupedDevices!.length} devices
                          </span>
                        )}
                      </div>
                      {alert.link ? (
                        <Link
                          href={alert.link}
                          className="text-sm hover:underline"
                        >
                          {alert.message}
                        </Link>
                      ) : (
                        <p className="text-sm">{alert.message}</p>
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
                          className="mt-1 inline-flex items-center gap-1 text-xs text-[#0C4FD1] hover:underline dark:text-[#6CA0FF]"
                        >
                          {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                          {isExpanded ? 'Hide devices' : 'Show devices'}
                        </button>
                      )}
                    </div>
                    <button
                      onClick={() => dismissAlert(alert.id)}
                      className="inline-flex size-8 shrink-0 items-center justify-center self-start rounded-full border-0 bg-transparent text-muted-foreground shadow-none transition-colors hover:bg-muted hover:text-foreground"
                      aria-label="Dismiss alert"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  {isGrouped && isExpanded && (
                    <ul className="ml-7 space-y-1 border-l border-border/60 pl-3 text-xs text-muted-foreground">
                      {alert.groupedDevices!.map((d) => (
                        <li key={d.stationId} className="flex flex-wrap justify-between gap-x-3 gap-y-0.5">
                          <span className="min-w-0 truncate font-medium text-foreground">
                            {d.stationName}
                          </span>
                          <span className="shrink-0">
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
      </PanelSection>
    </Panel>
  )
}
