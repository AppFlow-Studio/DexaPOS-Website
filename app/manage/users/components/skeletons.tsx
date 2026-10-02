'use client'

import { Skeleton } from '@/components/ui/skeleton'
import { PageShell, Panel } from '@/components/dashboard/shell'

/*
 * Loading states for /manage/users, each drawn in the shape of what replaces
 * it at that width (UI-DESIGN-SYSTEM §4.10): a table well from `md` up, record
 * cards below. Pulsing blocks only, never a spinner.
 */

/** A `variant="data"` table from `md`, record cards below — matching §5.3. */
export function RecordListSkeleton({
    rows = 10,
    columns = 4,
    cardPairs = 1,
}: {
    rows?: number
    columns?: number
    /** Label/value pairs under the card's lead line. */
    cardPairs?: number
}) {
    return (
        <div className="min-w-0" aria-hidden>
            <div className="hidden overflow-hidden rounded-2xl bg-muted/20 md:block">
                <div className="flex items-center gap-6 bg-muted/50 px-3 py-3">
                    {Array.from({ length: columns }).map((_, index) => (
                        <Skeleton key={index} className={index === 0 ? 'h-3.5 w-24' : 'h-3.5 w-16'} />
                    ))}
                </div>
                <div className="space-y-px">
                    {Array.from({ length: rows }).map((_, row) => (
                        <div key={row} className="flex items-center gap-6 bg-card/70 px-3 py-3.5">
                            <Skeleton className="h-4 w-40 max-w-[30%]" />
                            {Array.from({ length: columns - 2 }).map((__, column) => (
                                <Skeleton key={column} className="h-5 w-20 rounded-full" />
                            ))}
                            <Skeleton className="ml-auto h-6 w-6 rounded-full" />
                        </div>
                    ))}
                </div>
            </div>

            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 md:hidden">
                {Array.from({ length: Math.min(rows, 4) }).map((_, card) => (
                    <div key={card} className="min-w-0 rounded-2xl bg-muted/45 p-4">
                        <div className="flex items-center justify-between gap-3">
                            <Skeleton className="h-5 w-36" />
                            <Skeleton className="h-6 w-6 rounded-full" />
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
                            {Array.from({ length: cardPairs }).map((__, pair) => (
                                <div key={pair} className="space-y-1.5">
                                    <Skeleton className="h-3 w-12" />
                                    <Skeleton className="h-4 w-20" />
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

/** The page header: optional back pill, title (with badge), subtitle, one action. */
function HeaderSkeleton({ back = false, badge = false }: { back?: boolean; badge?: boolean }) {
    return (
        <div>
            {back && <Skeleton className="h-8 w-32 rounded-full" />}
            <div className={back ? 'mt-2 flex flex-wrap items-center justify-between gap-3' : 'flex flex-wrap items-center justify-between gap-3'}>
                <div className="min-w-0 space-y-2">
                    <div className="flex items-center gap-3">
                        <Skeleton className="h-8 w-44" />
                        {badge && <Skeleton className="h-6 w-16 rounded-full" />}
                    </div>
                    <Skeleton className="h-4 w-56 max-w-full" />
                </div>
                <Skeleton className="h-9 w-32 rounded-full" />
            </div>
        </div>
    )
}

/** The pill tab rail; on a phone the extra pills run off the edge as the real rail does. */
function RailSkeleton({ tabs }: { tabs: number }) {
    return (
        <div className="w-full min-w-0 overflow-hidden">
            <div className="inline-flex w-max gap-0.5 rounded-full bg-muted/70 p-1">
                {Array.from({ length: tabs }).map((_, index) => (
                    <Skeleton key={index} className="h-9 w-24 rounded-full" />
                ))}
            </div>
        </div>
    )
}

/** /manage/users: header, three stat tiles, the two-tab rail, toolbar and list. */
export function UsersDirectorySkeleton() {
    return (
        <PageShell as="div">
            <p role="status" className="sr-only">Loading the HQ user directory</p>
            <HeaderSkeleton />
            <Panel padded>
                <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
                    {Array.from({ length: 3 }).map((_, index) => (
                        <div key={index} className="space-y-2">
                            <Skeleton className="h-4 w-24" />
                            <Skeleton className="h-8 w-12" />
                            <Skeleton className="h-3.5 w-32 max-sm:hidden" />
                        </div>
                    ))}
                </div>
            </Panel>
            <RailSkeleton tabs={2} />
            <Panel padded>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <Skeleton className="h-9 w-full rounded-full lg:w-72" />
                    <div className="grid grid-cols-2 gap-2 sm:flex">
                        <Skeleton className="h-9 rounded-full sm:w-44" />
                        <Skeleton className="h-9 rounded-full sm:w-44" />
                    </div>
                </div>
                <div className="mt-5">
                    <RecordListSkeleton rows={10} columns={5} cardPairs={1} />
                </div>
            </Panel>
        </PageShell>
    )
}

/** /manage/users/[userId]: header with badge, the four-tab rail, the Details tab. */
export function UserProfileSkeleton() {
    return (
        <PageShell as="div">
            <p role="status" className="sr-only">Loading the user profile</p>
            <HeaderSkeleton back badge />
            <RailSkeleton tabs={4} />
            <Panel>
                <div className="px-4 py-8 sm:px-6">
                    <Skeleton className="h-5 w-20" />
                    <div className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2">
                        {Array.from({ length: 7 }).map((_, index) => (
                            <div key={index} className="space-y-1.5">
                                <Skeleton className="h-3 w-16" />
                                <Skeleton className="h-4 w-40 max-w-full" />
                            </div>
                        ))}
                    </div>
                </div>
                <div className="px-4 pb-8 sm:px-6">
                    <Skeleton className="h-5 w-52 max-w-full" />
                    <div className="mt-5 space-y-2">
                        {Array.from({ length: 2 }).map((_, index) => (
                            <div key={index} className="flex items-center justify-between gap-3 rounded-2xl bg-muted/45 px-4 py-3">
                                <div className="space-y-1.5">
                                    <Skeleton className="h-4 w-36" />
                                    <Skeleton className="h-3 w-48 max-w-full" />
                                </div>
                                <Skeleton className="h-6 w-6 shrink-0 rounded-full" />
                            </div>
                        ))}
                    </div>
                </div>
            </Panel>
        </PageShell>
    )
}
