'use client'

import type { ReactNode } from 'react'

import { DeviceRegistrySectionNav } from '@/app/manage/devices/components/DeviceRegistrySectionNav'
import { PageHeader } from '@/components/dashboard/shell'

interface DeviceRegistryPageHeaderProps {
  title: string
  description?: string
  actions?: ReactNode
  backHref?: string
  backLabel?: string
  /** Rendered on the title's row — e.g. the device's status pill. */
  titleBadge?: ReactNode
  /** An identity row under the title — model, category, record ids. */
  meta?: ReactNode
  /** The section rail under the header. Only the catalog page still shows it. */
  showSectionNav?: boolean
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
  titleBadge,
  meta,
  showSectionNav = true,
}: DeviceRegistryPageHeaderProps) {
  return (
    <div className="min-w-0 space-y-4">
      <PageHeader
        title={title}
        subtitle={description}
        backHref={backHref}
        backLabel={backLabel}
        titleBadge={titleBadge}
        actions={actions}
      />
      {meta}
      {showSectionNav ? <DeviceRegistrySectionNav /> : null}
    </div>
  )
}
