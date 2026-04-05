'use client'

import { Discount, isDiscountExpired } from '@/types/discount'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'

interface DiscountCardProps {
    discount: Discount
    locationName?: string | null
}

export function DiscountCard({ discount, locationName }: DiscountCardProps) {
    const formatDate = (value: string | null) => (value ? format(new Date(value), 'MMM d, yyyy') : 'Not set')
    const formatValue = () =>
        discount.discount_type === 'percentage' ? `${discount.discount_value}%` : `$${discount.discount_value}`
    const expired = isDiscountExpired(discount)

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <div className="space-y-1">
                    <CardTitle>{discount.name}</CardTitle>
                    <p className="text-sm text-muted-foreground">{discount.description || 'No description'}</p>
                </div>
                <div className="flex items-center gap-2">
                    <Badge variant={discount.is_active ? 'default' : 'secondary'}>
                        {discount.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                    {expired && <Badge variant="destructive">Expired</Badge>}
                </div>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
                <div>
                    <p className="text-xs text-muted-foreground">Type</p>
                    <p className="font-medium capitalize">{discount.discount_type}</p>
                </div>
                <div>
                    <p className="text-xs text-muted-foreground">Value</p>
                    <p className="font-medium">{formatValue()}</p>
                </div>
                <div>
                    <p className="text-xs text-muted-foreground">Date range</p>
                    <p className="font-medium">
                        {discount.start_date || discount.end_date
                            ? `${formatDate(discount.start_date)} - ${formatDate(discount.end_date)}`
                            : 'No date range'}
                    </p>
                </div>
                <div>
                    <p className="text-xs text-muted-foreground">Scope</p>
                    <p className="font-medium capitalize">{discount.scope.replace('_', ' ')}</p>
                </div>
                <div>
                    <p className="text-xs text-muted-foreground">Stackable</p>
                    <p className="font-medium">{discount.stackable ? 'Yes' : 'No'}</p>
                </div>
                <div>
                    <p className="text-xs text-muted-foreground">Requires approval</p>
                    <p className="font-medium">{discount.requires_manager_approval ? 'Yes' : 'No'}</p>
                </div>
                <div>
                    <p className="text-xs text-muted-foreground">Availability</p>
                    <p className="font-medium">
                        {discount.location_id
                            ? (locationName ?? 'Location')
                            : 'Global (all locations)'}
                    </p>
                </div>
            </CardContent>
        </Card>
    )
}

