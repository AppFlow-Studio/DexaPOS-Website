import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader, PageShell, Panel } from '@/components/dashboard/shell'

export function OnlineOrderingSkeleton() {
  return (
    <PageShell>
      <div role="status" aria-live="polite" aria-busy="true" className="min-w-0">
        <span className="sr-only">Loading online ordering settings</span>

        <PageHeader
          title="Online Ordering"
          subtitle="Manage storefront setup, fulfillment, integrations, and customer notifications."
          indicator={<Skeleton className="h-8 w-36 max-w-full rounded-full motion-reduce:animate-none" />}
        />

        <div className="mt-6 flex min-w-0 gap-2 overflow-hidden">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton
              key={index}
              className="h-9 w-28 max-w-[30%] shrink-0 rounded-full motion-reduce:animate-none"
            />
          ))}
        </div>

        <div className="mt-6 grid min-w-0 gap-6 lg:grid-cols-2 [&>*]:min-w-0">
          {Array.from({ length: 2 }).map((_, panelIndex) => (
            <Panel key={panelIndex} padded className="min-w-0 overflow-hidden">
              <div className="min-w-0 space-y-6">
                <div className="flex min-w-0 items-center gap-3">
                  <Skeleton className="h-10 w-10 shrink-0 rounded-xl motion-reduce:animate-none" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-4 w-44 max-w-full rounded-full motion-reduce:animate-none" />
                    <Skeleton className="h-3 w-64 max-w-full rounded-full motion-reduce:animate-none" />
                  </div>
                </div>

                {Array.from({ length: 3 }).map((_, rowIndex) => (
                  <div key={rowIndex} className="min-w-0 space-y-2">
                    <Skeleton className="h-3 w-28 max-w-full rounded-full motion-reduce:animate-none" />
                    <Skeleton className="h-10 w-full max-w-full rounded-xl motion-reduce:animate-none" />
                  </div>
                ))}
              </div>
            </Panel>
          ))}
        </div>
      </div>
    </PageShell>
  )
}
