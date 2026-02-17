'use client'

import { Card, CardContent } from '@/components/ui/card'

interface SummaryCardProps {
  label: string
  value: string | number
  icon?: React.ReactNode
  className?: string
}

export function SummaryCard({ label, value, icon, className }: SummaryCardProps) {
  return (
    <Card className={`bg-gray-50 border border-gray-200 shadow-none ${className}`}>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-gray-500">{label}</p>
            <p className="text-2xl font-bold text-[#0A5C9E]">{value}</p>
          </div>
          {icon && <div className="text-gray-400">{icon}</div>}
        </div>
      </CardContent>
    </Card>
  )
}