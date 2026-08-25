'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty } from '@/components/ui/empty'
import { cn } from '@/lib/utils'
import { ANALYTICS_ACCENT } from './AnalyticsPrimitives'
import type { LucideIcon } from 'lucide-react'

interface ChartCardProps {
  title: string
  subtitle?: string
  icon?: LucideIcon
  isLoading?: boolean
  isEmpty?: boolean
  emptyMessage?: string
  action?: React.ReactNode
  className?: string
  children: React.ReactNode
}

/**
 * Section wrapper for every analytics chart.
 *
 * Inside an `AnalyticsPanel` the card's own border/shadow/background are
 * stripped by the panel's `.analytics-flat` rules so it reads as a flat section
 * rather than a nested box — the same treatment the dashboard Overview gives
 * its report cards. The title takes the brand blue and the subtitle sits
 * beneath it as a quiet caption.
 */
export function ChartCard({
  title,
  subtitle,
  icon: Icon,
  isLoading,
  isEmpty,
  emptyMessage = 'No data available',
  action,
  className,
  children,
}: ChartCardProps) {
  return (
    <Card
      className={cn(
        'min-w-0 overflow-hidden gap-4 border-border bg-card shadow-none',
        className
      )}
    >
      <CardHeader className="flex flex-col gap-2 space-y-0 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-0.5">
          <CardTitle
            className={cn(
              'flex items-center gap-2 text-[1.0625rem] font-semibold',
              ANALYTICS_ACCENT
            )}
          >
            {Icon && <Icon className="h-[1.125rem] w-[1.125rem] shrink-0" />}
            <span className="truncate">{title}</span>
          </CardTitle>
          {subtitle && (
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-[180px] w-full" />
          </div>
        ) : isEmpty ? (
          <Empty description={emptyMessage} className="py-8" />
        ) : (
          children
        )}
      </CardContent>
    </Card>
  )
}
