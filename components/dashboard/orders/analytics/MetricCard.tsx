'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface MetricCardProps {
  title: string
  value: string | number
  previousValue?: string | number
  format?: 'currency' | 'number' | 'percent' | 'duration'
  trend?: 'up' | 'down' | 'flat'
  trendIsPositive?: boolean
  icon?: LucideIcon
  isLoading?: boolean
  subtitle?: string
  className?: string
  children?: React.ReactNode
}

function formatValue(value: string | number, format?: string): string {
  if (typeof value === 'string') return value
  switch (format) {
    case 'currency':
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
      }).format(value)
    case 'number':
      return new Intl.NumberFormat('en-US').format(value)
    case 'percent':
      return `${value.toFixed(1)}%`
    case 'duration':
      const mins = Math.floor(value / 60)
      const secs = Math.round(value % 60)
      return `${mins}:${secs.toString().padStart(2, '0')}`
    default:
      return String(value)
  }
}

function getTrendPercent(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0
  return ((current - previous) / previous) * 100
}

export function MetricCard({
  title,
  value,
  previousValue,
  format,
  trend,
  trendIsPositive,
  icon: Icon,
  isLoading,
  subtitle,
  className,
  children,
}: MetricCardProps) {
  const numericCurrent = typeof value === 'number' ? value : 0
  const numericPrevious = typeof previousValue === 'number' ? previousValue : undefined

  const computedTrend =
    trend ??
    (numericPrevious !== undefined
      ? numericCurrent > numericPrevious
        ? 'up'
        : numericCurrent < numericPrevious
          ? 'down'
          : 'flat'
      : undefined)

  const trendPct =
    numericPrevious !== undefined
      ? getTrendPercent(numericCurrent, numericPrevious)
      : undefined

  const isPositive = trendIsPositive ?? (computedTrend === 'up')

  return (
    <Card className={`transition-all hover:shadow-md ${className ?? ''}`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <div className="text-2xl font-bold">{formatValue(value, format)}</div>
        )}

        {!isLoading && computedTrend && trendPct !== undefined && (
          <div className="mt-1 flex items-center gap-1 text-xs">
            {computedTrend === 'up' && (
              <TrendingUp
                className={`h-3 w-3 ${isPositive ? 'text-emerald-500' : 'text-red-500'}`}
              />
            )}
            {computedTrend === 'down' && (
              <TrendingDown
                className={`h-3 w-3 ${isPositive ? 'text-emerald-500' : 'text-red-500'}`}
              />
            )}
            {computedTrend === 'flat' && (
              <Minus className="h-3 w-3 text-muted-foreground" />
            )}
            <span
              className={
                computedTrend === 'flat'
                  ? 'text-muted-foreground'
                  : isPositive
                    ? 'text-emerald-500'
                    : 'text-red-500'
              }
            >
              {Math.abs(trendPct).toFixed(1)}%
            </span>
            <span className="text-muted-foreground">vs previous period</span>
          </div>
        )}

        {subtitle && !isLoading && (
          <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
        )}

        {children}
      </CardContent>
    </Card>
  )
}
