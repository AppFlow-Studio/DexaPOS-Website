'use client'

import { Card, CardContent } from '@/components/ui/card'

interface SummaryCardProps {
  label: string
  value: string | number
  icon?: React.ReactNode
  description?: string
  className?: string
}

export function SummaryCard({ label, value, icon, description, className }: SummaryCardProps) {
  return (
    <Card className={`bg-gray-50 dark:bg-slate-900/50 border border-gray-200 dark:border-gray-700 shadow-none ${className}`}>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</p>
            <p className="text-2xl font-bold text-[#0A5C9E] dark:text-[#0A7AB8]">{value}</p>
            {description && (
              <p className="text-xs text-muted-foreground">{description}</p>
            )}
          </div>
          {icon && <div className="text-gray-400 dark:text-gray-500">{icon}</div>}
        </div>
      </CardContent>
    </Card>
  )
}
