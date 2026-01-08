import { Skeleton } from '@/components/ui/skeleton'

export default function DiscountsLoading() {
    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <Skeleton className="h-10 w-48" />
                <Skeleton className="h-10 w-32" />
            </div>
            <Skeleton className="h-12 w-full" />
            <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, idx) => (
                    <Skeleton key={idx} className="h-14 w-full" />
                ))}
            </div>
        </div>
    )
}

