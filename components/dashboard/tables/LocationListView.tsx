'use client'

import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useUserInfo } from '@/app/manage/hooks/useUserInfo.'
import { GetLocationsWithFloorPlanStats } from '@/app/dashboard/actions/floor-plan-server'
import { LocationCard } from './LocationCard'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty } from '@/components/ui/empty'
import { MapPin } from 'lucide-react'

interface LocationListViewProps {
    onLocationSelect: (locationId: string) => void
}

export function LocationListView({ onLocationSelect }: LocationListViewProps) {
    // All hooks must be called unconditionally at the top
    const { data: userInfo } = useUserInfo()
    const clerkOrgId = useMemo(() => userInfo?.members?.[0]?.organizations?.id || '', [userInfo?.members])

    // All hooks must be called before any conditional returns
    const { data: locationsWithStats, isLoading: isLoadingStats, error: statsError } = useQuery({
        queryKey: ['locations-floor-plan-stats', clerkOrgId],
        queryFn: () => GetLocationsWithFloorPlanStats(clerkOrgId),
        enabled: !!clerkOrgId,
    })

    // Get full location data for each location
    const { data: locations, isLoading: isLoadingLocations, error: locationsError } = useQuery({
        queryKey: ['locations', clerkOrgId],
        queryFn: async () => {
            const { GetLocations } = await import('@/app/dashboard/actions/locations')
            return GetLocations(clerkOrgId)
        },
        enabled: !!clerkOrgId,
    })

    const isLoading = isLoadingStats || isLoadingLocations
    const error = statsError || locationsError
    const locationsMap = useMemo(() => {
        return new Map(locations?.map(loc => [loc.id, loc]) || [])
    }, [locations])

    if (isLoading) {
        return (
            <div className="space-y-4">
                <Card>
                    <CardHeader>
                        <Skeleton className="h-6 w-48" />
                        <Skeleton className="h-4 w-96 mt-2" />
                    </CardHeader>
                </Card>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {[1, 2, 3].map((i) => (
                        <Card key={i}>
                            <CardHeader>
                                <Skeleton className="h-5 w-32" />
                                <Skeleton className="h-4 w-24 mt-2" />
                            </CardHeader>
                            <CardContent>
                                <Skeleton className="h-20 w-full" />
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        )
    }

    if (error) {
        return (
            <Card>
                <CardContent className="py-12">
                    <Empty
                        icon={MapPin}
                        title="Error loading locations"
                        description={error instanceof Error ? error.message : 'Failed to load locations'}
                    />
                </CardContent>
            </Card>
        )
    }

    if (!locationsWithStats || locationsWithStats.length === 0) {
        return (
            <Card>
                <CardContent className="py-12">
                    <Empty
                        icon={MapPin}
                        title="No locations found"
                        description="Create a location to start managing floor plans and tables"
                    />
                </CardContent>
            </Card>
        )
    }

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Select a Location</CardTitle>
                    <CardDescription>
                        Choose a location to view and manage its floor plans and tables
                    </CardDescription>
                </CardHeader>
            </Card>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {locationsWithStats.map((stat) => {
                    const location = locationsMap.get(stat.locationId)
                    if (!location) {
                        // Fallback: create a minimal location object from stats
                        return (
                            <LocationCard
                                key={stat.locationId}
                                location={{
                                    id: stat.locationId,
                                    name: stat.locationName,
                                } as any}
                                floorPlanCount={stat.floorPlanCount}
                                tableCount={stat.tableCount}
                                onSelect={onLocationSelect}
                            />
                        )
                    }

                    return (
                        <LocationCard
                            key={stat.locationId}
                            location={location}
                            floorPlanCount={stat.floorPlanCount}
                            tableCount={stat.tableCount}
                            onSelect={onLocationSelect}
                        />
                    )
                })}
            </div>
        </div>
    )
}

