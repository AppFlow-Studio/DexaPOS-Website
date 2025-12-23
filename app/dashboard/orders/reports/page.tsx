'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useIsAllLocations, useSelectedLocation } from '@/stores/location-store'
import { Globe, MapPin, FileText } from 'lucide-react'

export default function ReportsPage() {
    const selectedLocation = useSelectedLocation()
    const isAllLocations = useIsAllLocations()

    return (
        <main className="space-y-6 animate-in fade-in duration-500">
            <div className="flex items-center justify-between">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
                        {isAllLocations ? (
                            <Badge variant="outline" className="gap-1">
                                <Globe className="h-3 w-3" />
                                All Locations
                            </Badge>
                        ) : (
                            <Badge variant="outline" className="gap-1">
                                <MapPin className="h-3 w-3" />
                                {selectedLocation?.name}
                            </Badge>
                        )}
                    </div>
                    <p className="text-muted-foreground">
                        Generate and view detailed reports for your orders
                    </p>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Reports</CardTitle>
                    <CardDescription>
                        This section is coming soon. You'll be able to generate detailed reports here.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-center py-12">
                        <div className="text-center space-y-2">
                            <FileText className="h-12 w-12 text-muted-foreground mx-auto" />
                            <p className="text-muted-foreground">Reports feature coming soon</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </main>
    )
}

