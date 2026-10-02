'use client'

import { PageShell, Panel, StatRow, StatTile } from '@/components/dashboard/shell'
import { Skeleton } from '@/components/ui/skeleton'

/*
 * Loading states for /manage/device-catalog, drawn in the shape of what
 * replaces them at each width (UI-DESIGN-SYSTEM §4.10). `CatalogListSkeleton`
 * is the page's in-page list state and the body of `CatalogPageSkeleton`,
 * which the route's `loading.tsx` renders, so the shape never jumps between
 * them. Pulsing blocks only, never a spinner.
 */

/**
 * The catalog list: a table well from `md` whose columns join at the same
 * tiers as the real table, then record cards below `md` (§5.3). Below `lg` a
 * row carries the category and monthly fee as a second line (HQ-6); from `lg`
 * those are columns (Category, Monthly fee), the image plate joins at `xl` and
 * Specs at `2xl`.
 */
export function CatalogListSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <div className="min-w-0" aria-hidden>
      <div className="hidden overflow-hidden rounded-2xl bg-muted/20 md:block">
        <div className="flex items-center gap-6 bg-muted/50 px-3 py-3">
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="hidden h-3.5 w-16 lg:block" />
          <Skeleton className="hidden h-3.5 w-12 2xl:block" />
          <Skeleton className="ml-auto h-3.5 w-16" />
          <Skeleton className="hidden h-3.5 w-20 lg:block" />
          <Skeleton className="h-3.5 w-14" />
          <div className="w-8" />
        </div>
        <div className="space-y-px">
          {Array.from({ length: rows }).map((_, row) => (
            <div key={row} className="flex items-center gap-6 bg-card/70 px-3 py-3">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <Skeleton className="hidden size-8 shrink-0 rounded-full xl:block" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-48 max-w-full" />
                  <Skeleton className="h-3 w-24 lg:hidden" />
                </div>
              </div>
              <Skeleton className="hidden h-4 w-24 lg:block" />
              <Skeleton className="hidden h-4 w-40 2xl:block" />
              <div className="flex flex-col items-end space-y-1.5">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-3 w-14 lg:hidden" />
              </div>
              <Skeleton className="hidden h-4 w-16 lg:block" />
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-8 w-8 rounded-full" />
            </div>
          ))}
        </div>
      </div>

      {/* The phone card: model and status, a muted manufacturer line, three
          pairs, then the Edit pill and the actions menu. */}
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 md:hidden">
        {Array.from({ length: 4 }).map((_, card) => (
          <div key={card} className="min-w-0 rounded-2xl bg-muted/45 p-4">
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-14" />
            </div>
            <Skeleton className="mt-2 h-3 w-1/3" />
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
              {Array.from({ length: 3 }).map((__, pair) => (
                <div key={pair} className="space-y-1.5">
                  <Skeleton className="h-3 w-14" />
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
            <div className="mt-3 flex justify-end gap-1">
              <Skeleton className="h-11 w-20 rounded-full sm:h-8" />
              <Skeleton className="h-8 w-8 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * /manage/device-catalog: the registry header (title, subtitle, four actions,
 * the three-pill rail), four stat tiles, the callout, then the list panel.
 */
export function CatalogPageSkeleton() {
  return (
    <PageShell as="div">
      <p role="status" className="sr-only">Loading the device catalog</p>

      <div className="min-w-0 space-y-4" aria-hidden>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <Skeleton className="h-8 w-44" />
            <Skeleton className="h-4 w-96 max-w-full max-sm:hidden" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-9 w-28 rounded-full" />
            ))}
          </div>
        </div>
        <div className="inline-flex w-max gap-0.5 rounded-full bg-muted/70 p-1">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-9 w-24 rounded-full" />
          ))}
        </div>
      </div>

      <Panel padded>
        <StatRow columns={4}>
          {Array.from({ length: 4 }).map((_, index) => (
            <StatTile key={index} label={<Skeleton className="h-4 w-24" />} value="" isLoading />
          ))}
        </StatRow>
      </Panel>

      <Skeleton className="h-16 w-full rounded-2xl md:h-14" aria-hidden />

      <Panel>
        <div className="px-4 py-8 sm:px-6" aria-hidden>
          <Skeleton className="h-5 w-36" />
          <Skeleton className="mt-2 h-4 w-96 max-w-full max-sm:hidden" />
          <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center">
            <Skeleton className="h-10 w-full rounded-full md:flex-1" />
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-9 w-full rounded-full sm:w-[190px]" />
              <Skeleton className="h-9 w-full rounded-full sm:w-[150px]" />
            </div>
          </div>
          <div className="mt-5">
            <CatalogListSkeleton />
          </div>
        </div>
      </Panel>
    </PageShell>
  )
}
