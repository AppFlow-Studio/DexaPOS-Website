'use client'

import type { ReactNode } from 'react'

import { DeviceRegistryCommandPaletteTrigger } from '@/app/manage/devices/components/DeviceRegistryCommandPalette'
import { DeviceRegistrySectionNav } from '@/app/manage/devices/components/DeviceRegistrySectionNav'
import { PageHeader } from '@/components/dashboard/shell'

interface DeviceRegistryPageHeaderProps {
  title: string
  description?: string
  actions?: ReactNode
  backHref?: string
  backLabel?: string
  /**
   * An identity row under the title — status, model, record ids. Unlike the
   * description it stays on phones: it is scope, not decoration (§13.4).
   */
  meta?: ReactNode
}

/**
 * The standard `PageHeader` (D-01, D-04, D-05) followed by the registry's
 * section rail, the way a tabbed page puts its rail under the header (§2 B).
 */
export function DeviceRegistryPageHeader({
  title,
  description,
  actions,
  backHref,
  backLabel,
  meta,
}: DeviceRegistryPageHeaderProps) {
  return (
    <div className="min-w-0 space-y-4">
      <PageHeader
        title={title}
        subtitle={description}
        backHref={backHref}
        backLabel={backLabel}
        actions={
          <>
            <DeviceRegistryCommandPaletteTrigger />
            {actions}
          </>
        }
      />
      {meta}
      <DeviceRegistrySectionNav />
    </div>
  )
}
