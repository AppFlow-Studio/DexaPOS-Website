'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty } from '@/components/ui/empty'
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
    <Card className={`bg-white border-gray-200 transition-all hover:shadow-md ${className ?? ''}`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="space-y-0.5">
          <CardTitle className="text-sm font-medium text-gray-900">{title}</CardTitle>
          {subtitle && (
            <p className="text-xs text-gray-500">{subtitle}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {action}
          {Icon && <Icon className="h-4 w-4 text-gray-400" />}
        </div>
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