'use client'

import { CheckCircle2, Calendar, Shield, Activity } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { MerchantDetails } from '@/types/merchant'

interface Cell {
    icon: LucideIcon
    label: string
    value: string
    meta: string
    valueClass?: string
}

export function RiskStrip({ merchant }: { merchant: MerchantDetails }) {
    // Real KPI wiring lands with Luqra integration. For now, derive what we can
    // from MerchantDetails and show neutral placeholders for the rest.
    const liveLocations = merchant.active_locations
    const totalLocations = merchant.total_locations

    const cells: Cell[] = [
        {
            icon: CheckCircle2,
            label: 'Live MIDs',
            value: `${liveLocations} / ${totalLocations}`,
            meta: liveLocations === totalLocations ? 'All boarded' : 'Boarding in progress',
            valueClass: ' text-[22px] tracking-[-0.015em]',
        },
        {
            icon: Calendar,
            label: 'Next funding',
            value: '—',
            meta: 'Awaiting Luqra sync',
            valueClass: ' text-[22px] tracking-[-0.015em] tabular-nums',
        },
        {
            icon: Shield,
            label: 'Chargeback rate',
            value: '—',
            meta: 'No data yet',
            valueClass: ' text-[22px] tracking-[-0.015em] tabular-nums',
        },
        {
            icon: Activity,
            label: 'Risk profile',
            value: 'Low',
            meta: `MCC ${merchant.business_type ?? '—'}`,
            valueClass: ' text-[22px] tracking-[-0.015em]',
        },
    ]

    return (
        <div className="grid grid-cols-1 divide-y rounded-lg border bg-card sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
            {cells.map((c) => {
                const Icon = c.icon
                return (
                    <div key={c.label} className="px-5 py-4">
                        <div className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                            <Icon className="h-3 w-3" />
                            {c.label}
                        </div>
                        <div className={`mt-1.5 text-foreground ${c.valueClass ?? ''}`}>{c.value}</div>
                        <div className="mt-0.5 text-[11.5px] text-muted-foreground">{c.meta}</div>
                    </div>
                )
            })}
        </div>
    )
}
