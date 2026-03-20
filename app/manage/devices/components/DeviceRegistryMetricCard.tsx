'use client'

import type { LucideIcon } from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

interface DeviceRegistryMetricCardProps {
  label: string
  value: number | string
  detail: string
  icon: LucideIcon
  loading?: boolean
}

export function DeviceRegistryMetricCard({
  label,
  value,
  detail,
  icon: Icon,
  loading = false,
}: DeviceRegistryMetricCardProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader className="space-y-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-16" />
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card className="gap-4">
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div className="space-y-1">
          <CardDescription>{label}</CardDescription>
          <CardTitle className="text-3xl">{value}</CardTitle>
        </div>
        <div className="rounded-xl border bg-muted/40 p-2 text-muted-foreground">
          <Icon className="h-5 w-5" />
        </div>
      </CardHeader>
      <CardContent className="pt-0 text-sm text-muted-foreground">{detail}</CardContent>
    </Card>
  )
}
