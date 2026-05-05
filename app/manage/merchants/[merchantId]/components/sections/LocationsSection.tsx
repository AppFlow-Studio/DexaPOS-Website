'use client'

import { MapPin } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { LocationSummary } from '@/types/merchant'
import { SectionHead } from './SectionHead'
import { EmptySection } from './EmptySection'

function formatAddress(loc: LocationSummary) {
    const parts = [loc.address_line1, loc.city, loc.state, loc.postal_code].filter(Boolean)
    return parts.length ? parts.join(', ') : '—'
}

function formatMoney(n: number) {
    return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

export function LocationsSection({ locations }: { locations: LocationSummary[] }) {
    if (!locations.length) {
        return (
            <div>
                <SectionHead title="Locations" sub="All physical locations under this merchant." />
                <EmptySection
                    icon={MapPin}
                    title="No locations yet"
                    body="Locations the merchant adds will appear here."
                />
            </div>
        )
    }

    return (
        <div>
            <SectionHead title="Locations" sub={`${locations.length} total`} />
            <div className="overflow-hidden rounded-lg border bg-card">
                <table className="w-full text-[12.5px]">
                    <thead className="bg-muted/40 text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
                        <tr className="border-b">
                            <th className="px-4 py-2 text-left font-medium">Name</th>
                            <th className="px-4 py-2 text-left font-medium">Address</th>
                            <th className="px-4 py-2 text-left font-medium">Status</th>
                            <th className="px-4 py-2 text-right font-medium">Today</th>
                        </tr>
                    </thead>
                    <tbody className="[&>tr]:border-b last:[&>tr]:border-b-0">
                        {locations.map((loc) => (
                            <tr key={loc.id} className="hover:bg-muted/30">
                                <td className="px-4 py-2.5">
                                    <div className="flex items-center gap-2 font-medium text-foreground">
                                        <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                                        {loc.name}
                                    </div>
                                </td>
                                <td className="px-4 py-2.5 text-muted-foreground">{formatAddress(loc)}</td>
                                <td className="px-4 py-2.5">
                                    {loc.is_active ? (
                                        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">
                                            Live
                                        </Badge>
                                    ) : (
                                        <Badge className="bg-zinc-200 text-zinc-700 border-zinc-300">
                                            Offline
                                        </Badge>
                                    )}
                                </td>
                                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-foreground">
                                    {formatMoney(loc.revenue_today ?? 0)}
                                    <span className="ml-1 text-muted-foreground">
                                        ({loc.orders_today ?? 0})
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
