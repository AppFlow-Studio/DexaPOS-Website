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
    <Card className={`min-w-0 overflow-hidden bg-white dark:bg-slate-900 border-gray-200 dark:border-gray-700 transition-all hover:shadow-md dark:hover:shadow-lg dark:hover:shadow-slate-900/50 ${className ?? ''}`}>
      <CardHeader className="flex flex-col gap-2 space-y-0 pb-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-0.5">
          <CardTitle className="text-sm font-medium text-gray-900 dark:text-white">{title}</CardTitle>
          {subtitle && (
            <p className="text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>
          )}
        </div>
        {(action || Icon) && (
          <div className="flex shrink-0 items-center gap-2">
            {action}
            {Icon && <Icon className="h-4 w-4 text-gray-400 dark:text-gray-500" />}
          </div>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-4 w-24 dark:bg-slate-800" />
            <Skeleton className="h-[180px] w-full dark:bg-slate-800" />
          </div>
        ) : isEmpty ? (
          <Empty 
            description={emptyMessage} 
            className="py-8 dark:text-gray-400" 
          />
        ) : (
          <div className="dark:text-gray-100">
            {children}
          </div>
        )}
      </CardContent>
    </Card>
  )
}