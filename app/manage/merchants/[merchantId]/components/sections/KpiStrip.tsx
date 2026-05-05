import type { LucideIcon } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

export type KpiTone = 'default' | 'good' | 'warn' | 'danger'

export interface KpiCell {
    icon: LucideIcon
    label: string
    value: string
    meta?: string
    tone?: KpiTone
}

const TONE_CLASS: Record<KpiTone, string> = {
    default: 'text-foreground',
    good: 'text-emerald-700',
    warn: 'text-amber-700',
    danger: 'text-red-700',
}

export function KpiStrip({ cells, loading = false }: { cells: KpiCell[]; loading?: boolean }) {
    return (
        <div className="grid grid-cols-1 divide-y rounded-lg border bg-card sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
            {cells.map((c) => {
                const Icon = c.icon
                const tone = TONE_CLASS[c.tone ?? 'default']
                return (
                    <div key={c.label} className="px-5 py-4">
                        <div className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                            <Icon className="h-3 w-3" />
                            {c.label}
                        </div>
                        {loading ? (
                            <Skeleton className="mt-2 h-6 w-24" />
                        ) : (
                            <div
                                className={`mt-1.5 text-[22px] tracking-[-0.015em] tabular-nums ${tone}`}
                            >
                                {c.value}
                            </div>
                        )}
                        {c.meta && (
                            <div className="mt-0.5 text-[11.5px] text-muted-foreground">{c.meta}</div>
                        )}
                    </div>
                )
            })}
        </div>
    )
}
