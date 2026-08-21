import { Skeleton } from '@/components/ui/skeleton'

/** Mirrors the converted list page: header, stat panel, then filters + table. */
export default function DiscountsLoading() {
    return (
        <div className="min-w-0 space-y-6">
            <div>
                <Skeleton className="h-9 w-48" />
                <Skeleton className="mt-2 h-4 w-72" />
            </div>

            <div className="rounded-3xl border bg-card px-6 py-6">
                <div className="grid grid-cols-1 gap-y-6 sm:grid-cols-2 sm:gap-x-10 lg:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, idx) => (
                        <div key={idx}>
                            <Skeleton className="h-4 w-24" />
                            <Skeleton className="mt-2 h-8 w-16" />
                            <Skeleton className="mt-1.5 h-3 w-28" />
                        </div>
                    ))}
                </div>
            </div>

            <div className="rounded-3xl border bg-card px-6 py-6">
                <div className="flex flex-wrap items-center gap-2">
                    <Skeleton className="h-9 min-w-[220px] flex-1 rounded-full" />
                    <Skeleton className="h-9 w-32 rounded-full" />
                    <Skeleton className="h-9 w-36 rounded-full" />
                    <Skeleton className="h-9 w-32 rounded-full" />
                </div>

                <div className="mt-6 space-y-2">
                    {Array.from({ length: 5 }).map((_, idx) => (
                        <Skeleton key={idx} className="h-14 w-full" />
                    ))}
                </div>
            </div>
        </div>
    )
}
