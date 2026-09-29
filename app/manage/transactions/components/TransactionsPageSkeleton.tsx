import { PageShell, Panel } from '@/components/dashboard/shell'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * The route's loading shape, drawn from the converted page (UI-DESIGN-SYSTEM
 * §14.4: a skeleton converts with its page). Used by `loading.tsx` and by the
 * page's own Suspense fallback, so both promise the same chrome.
 *
 * Matches the phone trims: no subtitle, no captions, no stat metas below `sm`.
 */
export function TransactionsPageSkeleton() {
    return (
        <PageShell as="div" aria-busy="true" aria-label="Loading transactions">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-2">
                    <Skeleton className="h-8 w-56" />
                    <Skeleton className="hidden h-4 w-80 max-w-full sm:block" />
                </div>
                <div className="flex gap-2">
                    <Skeleton className="h-9 w-24 rounded-full" />
                    <Skeleton className="h-9 w-24 rounded-full" />
                </div>
            </div>

            {/* Connectivity line */}
            <div className="flex flex-wrap gap-2">
                <Skeleton className="h-7 w-56 rounded-full" />
                <Skeleton className="h-7 w-48 rounded-full" />
            </div>

            {/* Summary: six figures, three across from `lg`, two below */}
            <Panel padded>
                <Skeleton className="h-5 w-40" />
                <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-6 sm:gap-x-10 lg:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, index) => (
                        <div key={index} className="min-w-0">
                            <Skeleton className="h-4 w-24 max-w-full" />
                            <Skeleton className="mt-2 h-8 w-28 max-w-full" />
                            <Skeleton className="mt-2 hidden h-3 w-36 max-w-full sm:block" />
                        </div>
                    ))}
                </div>
            </Panel>

            {/* Revenue by channel */}
            <Panel padded>
                <Skeleton className="h-5 w-44" />
                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, index) => (
                        <Skeleton key={index} className="h-28 w-full rounded-2xl" />
                    ))}
                </div>
            </Panel>

            {/* Ledger: toolbar, then the table well */}
            <Panel padded>
                <Skeleton className="h-5 w-36" />
                <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                    <Skeleton className="h-9 w-full rounded-full sm:flex-1" />
                    <Skeleton className="h-9 w-24 rounded-full" />
                </div>
                <div className="mt-4 overflow-hidden rounded-2xl bg-muted/20">
                    <div className="h-10 bg-muted/50" />
                    <div className="space-y-px">
                        {Array.from({ length: 6 }).map((_, index) => (
                            <div key={index} className="flex items-center gap-4 bg-card/70 px-3 py-3">
                                <Skeleton className="h-4 w-20" />
                                <Skeleton className="h-4 flex-1" />
                                <Skeleton className="h-4 w-16" />
                            </div>
                        ))}
                    </div>
                </div>
            </Panel>
        </PageShell>
    )
}
