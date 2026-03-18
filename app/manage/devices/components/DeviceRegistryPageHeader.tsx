'use client'

import type { ReactNode } from 'react'

import { DeviceRegistryCommandPaletteTrigger } from '@/app/manage/devices/components/DeviceRegistryCommandPalette'
import { DeviceRegistrySectionNav } from '@/app/manage/devices/components/DeviceRegistrySectionNav'

interface DeviceRegistryPageHeaderProps {
  title: string
  description: string
  actions?: ReactNode
  eyebrow?: string
}

export function DeviceRegistryPageHeader({
  title,
  description,
  actions,
  eyebrow = 'Device Registry',
}: DeviceRegistryPageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-[0.16em] text-muted-foreground">
          {eyebrow}
        </p>
        <DeviceRegistrySectionNav />
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <DeviceRegistryCommandPaletteTrigger />
        {actions}
      </div>
    </div>
  )
}
