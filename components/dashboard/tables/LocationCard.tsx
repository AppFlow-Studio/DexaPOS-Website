'use client'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { MapPin, Layout, Table2, ArrowRight } from 'lucide-react'
import { Location } from '@/types/merchant_locations'

interface LocationCardProps {
    location: Location
    floorPlanCount: number
    tableCount: number
    onSelect: (locationId: string) => void
}

/**
 * One selectable location in the floor-plan picker.
 *
 * Matches the grid card on Dashboard → Locations: a `rounded-2xl` tier-2
 * surface that responds on hover with a brand-tinted border rather than a
 * shadow lift, so the grid stays flat.
 */
export function LocationCard({ location, floorPlanCount, tableCount, onSelect }: LocationCardProps) {
    const hasAddress = Boolean(location.address_line1 || location.city)

    return (
        <button
            type="button"
            onClick={() => onSelect(location.id)}
            className={cn(
                'group relative min-w-0 overflow-hidden rounded-2xl border bg-card p-6 text-left',
                'transition-colors duration-150 hover:border-primary/30 hover:bg-muted/30',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            )}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <p className="truncate text-[1.0625rem] font-medium leading-tight tracking-[-0.01em]">
                        {location.name}
                    </p>
                    {location.code && (
                        <p className="mt-1 truncate font-mono text-[0.8125rem] text-muted-foreground">
                            {location.code}
                        </p>
                    )}
                </div>

                <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </div>

            {hasAddress && (
                <div className="mt-4 flex items-start gap-2 text-sm text-muted-foreground">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="min-w-0">
                        {location.address_line1 && <div className="truncate">{location.address_line1}</div>}
                        {location.city && location.state && (
                            <div className="truncate">
                                {location.city}, {location.state} {location.postal_code}
                            </div>
                        )}
                    </div>
                </div>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Layout className="h-3.5 w-3.5" />
                    <span className="tabular-nums">{floorPlanCount}</span>
                    {floorPlanCount === 1 ? 'floor plan' : 'floor plans'}
                </span>
                <span className="text-muted-foreground/40">·</span>
                <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Table2 className="h-3.5 w-3.5" />
                    <span className="tabular-nums">{tableCount}</span>
                    {tableCount === 1 ? 'table' : 'tables'}
                </span>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
                <Badge variant={location.is_active ? 'default' : 'outline'} className="text-xs">
                    {location.is_active ? 'Active' : 'Inactive'}
                </Badge>
                {location.is_accepting_orders && (
                    <Badge variant="outline" className="text-xs">
                        Accepting Orders
                    </Badge>
                )}
            </div>
        </button>
    )
}
