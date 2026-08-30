import { Panel, PageShell } from '@/components/dashboard/shell'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

type DataPageSkeletonProps = {
  variant: 'analytics' | 'catalog'
  label: string
}

function LoadingBlock({ className }: { className?: string }) {
  return (
    <Skeleton
      className={cn(
        'rounded-2xl bg-muted/70 motion-reduce:animate-none',
        className,
      )}
    />
  )
}

function HeaderSkeleton() {
  return (
    <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-2">
        <LoadingBlock className="h-9 w-52 max-w-[72vw]" />
        <LoadingBlock className="h-4 w-72 max-w-[84vw] rounded-full" />
      </div>
      <LoadingBlock className="h-9 w-full rounded-full sm:w-48" />
    </div>
  )
}

function StatSkeletons() {
  return (
    <Panel>
      <div className="grid grid-cols-2 gap-x-5 gap-y-6 px-4 py-6 sm:px-6 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="min-w-0 space-y-3">
            <LoadingBlock className="h-3 w-20 rounded-full" />
            <LoadingBlock className="h-8 w-28 max-w-full" />
            <LoadingBlock className="h-3 w-24 max-w-full rounded-full" />
          </div>
        ))}
      </div>
    </Panel>
  )
}

function AnalyticsSkeleton() {
  return (
    <>
      <Panel padded>
        <div className="flex min-h-[22rem] flex-col gap-5 sm:min-h-[25rem]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-3">
              <LoadingBlock className="h-10 w-44" />
              <LoadingBlock className="h-4 w-28 rounded-full" />
            </div>
            <LoadingBlock className="h-9 w-36 rounded-full" />
          </div>
          <LoadingBlock className="min-h-52 flex-1" />
          <div className="flex justify-center gap-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <LoadingBlock key={index} className="h-8 w-12 rounded-full" />
            ))}
          </div>
        </div>
      </Panel>

      <StatSkeletons />

      <div className="flex gap-2 overflow-hidden rounded-full bg-muted/40 p-1">
        {Array.from({ length: 3 }).map((_, index) => (
          <LoadingBlock key={index} className="h-9 w-32 shrink-0 rounded-full" />
        ))}
      </div>

      <div className="grid min-w-0 gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Panel key={index} padded className="space-y-5">
            <LoadingBlock className="h-5 w-36" />
            {Array.from({ length: 4 }).map((__, rowIndex) => (
              <div
                key={rowIndex}
                className="flex items-center justify-between gap-4"
              >
                <LoadingBlock className="h-4 w-28 rounded-full" />
                <LoadingBlock className="h-5 w-20 rounded-full" />
              </div>
            ))}
          </Panel>
        ))}
      </div>
    </>
  )
}

function CatalogSkeleton() {
  return (
    <>
      <StatSkeletons />

      <Panel padded>
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <LoadingBlock className="h-5 w-28" />
              <LoadingBlock className="h-3 w-20 rounded-full" />
            </div>
            <div className="flex flex-wrap gap-2">
              <LoadingBlock className="h-9 w-full rounded-full sm:w-60" />
              <LoadingBlock className="h-9 w-24 rounded-full" />
              <LoadingBlock className="h-9 w-24 rounded-full" />
              <LoadingBlock className="h-9 w-28 rounded-full" />
            </div>
          </div>

          <div className="grid min-w-0 grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <div
                key={index}
                className="min-h-80 rounded-2xl bg-muted/25 p-4"
              >
                <LoadingBlock className="h-40 w-full" />
                <div className="mt-5 space-y-3">
                  <LoadingBlock className="h-5 w-2/3" />
                  <LoadingBlock className="h-4 w-1/2 rounded-full" />
                  <div className="flex gap-2 pt-3">
                    <LoadingBlock className="h-7 w-20 rounded-full" />
                    <LoadingBlock className="h-7 w-24 rounded-full" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Panel>
    </>
  )
}

export function DataPageSkeleton({ variant, label }: DataPageSkeletonProps) {
  return (
    <PageShell>
      <div
        role="status"
        aria-live="polite"
        aria-busy="true"
        data-page-loader={variant}
        className="space-y-6"
      >
        <span className="sr-only">{label}</span>
        <HeaderSkeleton />
        {variant === 'analytics' ? <AnalyticsSkeleton /> : <CatalogSkeleton />}
      </div>
    </PageShell>
  )
}
