'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MapPin, Layout, Table2, ArrowRight } from 'lucide-react'
import { Location } from '@/types/merchant_locations'

interface LocationCardProps {
    location: Location
    floorPlanCount: number
    tableCount: number
    onSelect: (locationId: string) => void
}

export function LocationCard({ location, floorPlanCount, tableCount, onSelect }: LocationCardProps) {
    return (
        <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => onSelect(location.id)}>
            <CardHeader>
                <div className="flex items-start justify-between">
                    <div className="flex-1">
                        <CardTitle className="text-lg">{location.name}</CardTitle>
                        {location.code && (
                            <CardDescription className="mt-1">Code: {location.code}</CardDescription>
                        )}
                    </div>
                    <Button variant="ghost" size="sm" onClick={(e) => {
                        e.stopPropagation()
                        onSelect(location.id)
                    }}>
                        <ArrowRight className="h-4 w-4" />
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                <div className="space-y-3">
                    {/* Address */}
                    {(location.address_line1 || location.city) && (
                        <div className="flex items-start gap-2 text-sm text-muted-foreground">
                            <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                            <div>
                                {location.address_line1 && <div>{location.address_line1}</div>}
                                {location.city && location.state && (
                                    <div>
                                        {location.city}, {location.state} {location.postal_code}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Stats */}
                    <div className="flex items-center gap-3 pt-2">
                        <Badge variant="secondary" className="gap-1.5">
                            <Layout className="h-3 w-3" />
                            {floorPlanCount} {floorPlanCount === 1 ? 'Floor Plan' : 'Floor Plans'}
                        </Badge>
                        <Badge variant="secondary" className="gap-1.5">
                            <Table2 className="h-3 w-3" />
                            {tableCount} {tableCount === 1 ? 'Table' : 'Tables'}
                        </Badge>
                    </div>

                    {/* Status */}
                    <div className="flex items-center gap-2 pt-1">
                        {location.is_active ? (
                            <Badge variant="default" className="text-xs">Active</Badge>
                        ) : (
                            <Badge variant="outline" className="text-xs">Inactive</Badge>
                        )}
                        {location.is_accepting_orders && (
                            <Badge variant="outline" className="text-xs">Accepting Orders</Badge>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}

