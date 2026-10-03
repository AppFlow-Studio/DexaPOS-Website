'use client'

import { PageShell, Panel, StatRow, StatTile } from '@/components/dashboard/shell'
import { Skeleton } from '@/components/ui/skeleton'
import { RecordLinkCardSkeletons } from '@/app/manage/transactions/components/ledger-primitives'

/*
 * Loading states for the Device Registry, each drawn in the shape of what
 * replaces it at that width (UI-DESIGN-SYSTEM §4.10). One component per page,
 * used by the route's `loading.tsx`, the page's `Suspense` fallback and its
 * in-page loading state. Pulsing blocks only, never a spinner.
 */

/** `DeviceRegistryPageHeader`: back pill, title, subtitle, actions, then the three-pill rail. */
function RegistryHeaderSkeleton({
  back = false,
  subtitle = true,
  meta = false,
  badge = false,
  actions = 2,
  rail = true,
}: {
  back?: boolean
  subtitle?: boolean
  /** The identity line under the title; it drops below `sm`, as the page's does. */
  meta?: boolean
  /** A status pill on the title's row. */
  badge?: boolean
  actions?: number
  rail?: boolean
}) {
  return (
    <div className="min-w-0 space-y-4" aria-hidden>
      <div>
        {back ? <Skeleton className="h-8 w-36 rounded-full" /> : null}
        <div className={back ? 'mt-2 flex flex-wrap items-center justify-between gap-3' : 'flex flex-wrap items-center justify-between gap-3'}>
          <div className="min-w-0 space-y-2">
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-48" />
              {badge ? <Skeleton className="h-6 w-20 rounded-full" /> : null}
            </div>
            {subtitle ? <Skeleton className="h-4 w-80 max-w-full max-sm:hidden" /> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {Array.from({ length: actions }).map((_, index) => (
              <Skeleton key={index} className="h-9 w-28 rounded-full" />
            ))}
          </div>
        </div>
      </div>
      {meta ? <Skeleton className="h-5 w-96 max-w-full max-sm:hidden" /> : null}
      {rail ? (
        <div className="inline-flex w-max gap-0.5 rounded-full bg-muted/70 p-1">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-9 w-24 rounded-full" />
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** The inventory list: a table well from `md` (tiered columns), record cards below (§5.3). */
export function InventoryListSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <div className="min-w-0" aria-hidden>
      <div className="hidden overflow-hidden rounded-2xl bg-muted/20 md:block">
        <div className="flex items-center gap-6 bg-muted/50 px-3 py-3">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-3.5 w-16" />
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="hidden h-3.5 w-20 lg:block" />
          <Skeleton className="hidden h-3.5 w-16 xl:block" />
        </div>
        <div className="space-y-px">
          {Array.from({ length: rows }).map((_, row) => (
            <div key={row} className="flex items-center gap-6 bg-card/70 px-3 py-3.5">
              <Skeleton className="h-4 w-40 max-w-[30%]" />
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="hidden h-4 w-24 lg:block" />
              <Skeleton className="hidden h-4 w-20 xl:block" />
              <Skeleton className="ml-auto h-6 w-6 rounded-full" />
            </div>
          ))}
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 md:hidden">
        <RecordLinkCardSkeletons count={4} />
      </div>
    </div>
  )
}

/** /manage/devices: header (no rail), four stat tiles, then the panel with toolbar and list. */
export function InventoryPageSkeleton() {
  return (
    <PageShell as="div">
      <p role="status" className="sr-only">Loading the device inventory</p>
      <RegistryHeaderSkeleton actions={1} rail={false} />
      <Panel padded>
        <StatRow columns={4}>
          {Array.from({ length: 4 }).map((_, index) => (
            <StatTile key={index} label={<Skeleton className="h-4 w-24" />} value="" isLoading />
          ))}
        </StatRow>
      </Panel>
      <Panel>
        <div className="px-4 py-8 sm:px-6" aria-hidden>
          <Skeleton className="h-5 w-32" />
          <Skeleton className="mt-2 h-4 w-96 max-w-full max-sm:hidden" />
          <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center">
            <Skeleton className="h-10 w-full rounded-full md:flex-1" />
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-9 w-full rounded-full sm:w-[170px]" />
              <Skeleton className="h-9 w-full rounded-full sm:w-[210px]" />
            </div>
          </div>
          <div className="mt-5">
            <InventoryListSkeleton />
          </div>
        </div>
      </Panel>
    </PageShell>
  )
}

/** The overview body: six stat tiles, two paired charts, intake + warranty, merchant chart. */
export function OverviewBodySkeleton() {
  return (
    <>
      <Panel padded>
        <StatRow columns={3}>
          {Array.from({ length: 6 }).map((_, index) => (
            <StatTile key={index} label={<Skeleton className="h-4 w-24" />} value="" isLoading />
          ))}
        </StatRow>
      </Panel>
      <div className="grid min-w-0 items-start gap-6 md:grid-cols-2" aria-hidden>
        <Skeleton className="h-[400px] w-full rounded-3xl" />
        <Skeleton className="h-[400px] w-full rounded-3xl" />
      </div>
      <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]" aria-hidden>
        <Skeleton className="h-[360px] w-full rounded-3xl" />
        <Skeleton className="h-[360px] w-full rounded-3xl" />
      </div>
      <Skeleton className="h-[400px] w-full rounded-3xl" aria-hidden />
    </>
  )
}

/** /manage/devices/overview. */
export function OverviewPageSkeleton() {
  return (
    <PageShell as="div">
      <p role="status" className="sr-only">Loading the fleet overview</p>
      <RegistryHeaderSkeleton back actions={0} rail={false} />
      <OverviewBodySkeleton />
    </PageShell>
  )
}

/** /manage/devices/[deviceId]: skeleton C — back pill, serial, identity row (no rail), two panels, feed. */
export function DeviceDetailSkeleton() {
  return (
    <PageShell as="div">
      <p role="status" className="sr-only">Loading the device</p>
      <RegistryHeaderSkeleton back subtitle={false} badge meta rail={false} />
      <div className="grid min-w-0 items-start gap-6 lg:grid-cols-3" aria-hidden>
        <Skeleton className="h-[300px] w-full rounded-2xl lg:col-span-2" />
        <Skeleton className="h-[300px] w-full rounded-2xl" />
      </div>
      <Panel>
        <div className="px-4 py-8 sm:px-6" aria-hidden>
          <Skeleton className="h-5 w-36" />
          <Skeleton className="mt-2 h-4 w-80 max-w-full max-sm:hidden" />
          <div className="mt-5">
            <ActivityFeedSkeleton />
          </div>
        </div>
      </Panel>
    </PageShell>
  )
}

/** Rows of the activity feed, in the feed row's own shell. */
export function ActivityFeedSkeleton() {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="flex gap-3 rounded-2xl bg-muted/40 px-4 py-3">
          <Skeleton className="mt-0.5 h-4 w-4 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
      ))}
    </div>
  )
}
