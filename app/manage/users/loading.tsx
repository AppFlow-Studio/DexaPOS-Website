import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export default function RouteLoading() {
  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-9 w-32 max-w-[50%]" />
          <Skeleton className="h-4 w-64 max-w-[70%]" />
        </div>
        <Skeleton className="h-9 w-32 self-start sm:self-auto" />
      </div>

      {/* Stats Cards - 3 cards matching the actual page */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-4 w-24 max-w-[60%]" />
              <Skeleton className="h-4 w-4 rounded-full" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16 max-w-[40%]" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters Card */}
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-36 max-w-[40%] mb-2" />
          <Skeleton className="h-4 w-56 max-w-[60%]" />
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <Skeleton className="h-9 w-full max-w-sm" />
            <div className="flex gap-2">
              <Skeleton className="h-9 w-32" />
              <Skeleton className="h-9 w-32" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table Rows */}
      <Card>
        <CardContent className="p-0">
          <div className="min-w-0 space-y-2 p-4">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="flex min-w-0 items-center gap-4 rounded-lg bg-muted/25 px-4 py-3"
              >
                <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-32 max-w-[40%]" />
                  <Skeleton className="h-3 w-48 max-w-[60%]" />
                </div>
                <Skeleton className="hidden h-5 w-16 shrink-0 rounded-full sm:block" />
                <Skeleton className="h-6 w-6 shrink-0 rounded-full" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
