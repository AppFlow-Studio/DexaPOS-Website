import type { LucideIcon } from 'lucide-react'
import { StatRow, StatTile } from '@/components/dashboard/shell'

export interface KpiCell {
    icon: LucideIcon
    label: string
    /** `—` when the figure cannot be computed, never `0` (§4.9). */
    value: string
    meta?: string
}

/**
 * The KPI figures at the top of a merchant-detail tab, rendered as `StatRow` /
 * `StatTile` inside the tab's own `PanelSection`. Neutral by design: none of
 * these figures is an HQ-2 alarm (§14.3), so no tone colouring.
 *
 * `StatRow` only takes 2|3|4 columns (§14.7 trap 6), so five or more figures
 * stack into two rows. On phones those two rows would each wrap on their own
 * (orphaning a tile, and a 2-tile row stacks to one column), so below `sm` the
 * rows dissolve (`contents`) into one shared two-column grid.
 */
export function KpiStrip({ cells, loading = false }: { cells: KpiCell[]; loading?: boolean }) {
    const split = Math.ceil(cells.length / 2)
    const rows = cells.length <= 4 ? [cells] : [cells.slice(0, split), cells.slice(split)]
    const merged = rows.length > 1

    return (
        <div className={merged ? 'grid grid-cols-2 gap-x-4 gap-y-6 sm:block sm:space-y-6' : 'space-y-6'}>
            {rows.map((row, i) => (
                <StatRow
                    key={i}
                    columns={Math.min(4, Math.max(2, row.length)) as 2 | 3 | 4}
                    className={merged ? 'max-sm:contents' : undefined}
                >
                    {row.map((c) => {
                        const Icon = c.icon
                        return (
                            <StatTile
                                key={c.label}
                                icon={<Icon />}
                                label={c.label}
                                value={c.value}
                                meta={c.meta}
                                isLoading={loading}
                            />
                        )
                    })}
                </StatRow>
            ))}
        </div>
    )
}
