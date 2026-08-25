'use client'

import { format } from 'date-fns'
import { Discount } from '@/types/discount'
import { Panel, StatRow, StatTile } from '@/components/dashboard/shell'
import {
    discountStatus,
    discountStatusLabel,
    discountStatusStyle,
} from '@/lib/constants/discount-status'
import { cn } from '@/lib/utils'

interface DiscountCardProps {
    discount: Discount
    locationName?: string | null
    /** Hide the global-vs-location Availability tile for single-location accounts. */
    isSingleLocation?: boolean
}

export function DiscountCard({ discount, locationName, isSingleLocation = false }: DiscountCardProps) {
    const formatDate = (value: string | null) => (value ? format(new Date(value), 'MMM d, yyyy') : 'Not set')
    const formatValue = () =>
        discount.discount_type === 'percentage' ? `${discount.discount_value}%` : `$${discount.discount_value}`

    const status = discountStatus(discount)
    const style = discountStatusStyle(status)

    const dateRange =
        discount.start_date || discount.end_date
            ? `${formatDate(discount.start_date)} – ${formatDate(discount.end_date)}`
            : 'No date range'

    return (
        <Panel>
            <div className="px-6 pt-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-[1.0625rem] font-semibold text-[#0C4FD1] dark:text-[#6CA0FF]">
                            <span className="min-w-0">{discount.name}</span>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {discount.description || 'No description'}
                        </p>
                    </div>

                    {/* DS-CTL-09 — soft tint + dot, colours from the constants module (D-11). */}
                    <span
                        className={cn(
                            'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
                            style.bg,
                            style.text,
                        )}
                    >
                        <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', style.dot)} />
                        {discountStatusLabel(status)}
                    </span>
                </div>
            </div>

            <div className="px-6 py-6">
                <StatRow columns={3}>
                    <StatTile
                        label="Value"
                        value={formatValue()}
                        meta={discount.discount_type === 'percentage' ? 'Percentage off' : 'Fixed amount off'}
                    />
                    {/* A date range is prose, not a figure — at `text-[1.75rem]`
                        it wraps to three lines and reads as broken. */}
                    <StatTile
                        label="Date range"
                        value={<span className="text-base">{dateRange}</span>}
                        meta="When this discount runs"
                    />
                    <StatTile
                        label="Order type"
                        value={
                            <span className="text-base capitalize">
                                {discount.scope.replace('_', ' ')}
                            </span>
                        }
                        meta="Where staff can apply it"
                    />
                </StatRow>

                <div className="mt-6">
                    <StatRow columns={3}>
                        <StatTile
                            label="Stackable"
                            value={discount.stackable ? 'Yes' : 'No'}
                            meta="Combines with other discounts"
                        />
                        <StatTile
                            label="Requires approval"
                            value={discount.requires_manager_approval ? 'Yes' : 'No'}
                            meta="Manager PIN on POS"
                        />
                        {!isSingleLocation && (
                            <StatTile
                                label="Availability"
                                value={discount.location_id ? (locationName ?? 'Location') : 'Global'}
                                meta={discount.location_id ? 'Single location' : 'All locations'}
                            />
                        )}
                    </StatRow>
                </div>
            </div>
        </Panel>
    )
}
