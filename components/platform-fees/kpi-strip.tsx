import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export interface KpiCell {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  tone?: 'default' | 'positive' | 'negative'
}

export function KpiStrip({
  cells,
  loading = false,
  className,
}: {
  cells: KpiCell[]
  loading?: boolean
  className?: string
}) {
  return (
    <Card
      className={cn(
        'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-border overflow-hidden p-0',
        className
      )}
    >
      {loading
        ? Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="p-4 space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-7 w-28" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))
        : cells.map((c, i) => (
            <div key={i} className="p-4 flex flex-col gap-1">
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                {c.label}
              </span>
              <span
                className={cn(
                  'text-2xl font-semibold leading-tight tracking-tight',
                  c.tone === 'positive' && 'text-foreground',
                  c.tone === 'negative' && 'text-destructive'
                )}
              >
                {c.value}
              </span>
              {c.hint != null && (
                <span className="text-xs text-muted-foreground">{c.hint}</span>
              )}
            </div>
          ))}
    </Card>
  )
}
