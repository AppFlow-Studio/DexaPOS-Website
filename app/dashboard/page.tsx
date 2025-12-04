'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    DollarSign,
    ShoppingCart,
    Users,
    TrendingUp,
    MapPin,
    Building2,
    Utensils,
    ArrowRight,
    Clock,
    CheckCircle,
    AlertCircle
} from 'lucide-react'
import { useLocationStore, useSelectedLocation, useIsAllLocations } from '@/stores/location-store'
import { useLocationScopedMenus, useLocationScopedMenuItems, useLocationScopedSchedules } from './hooks/useLocationScoped'
import { Skeleton } from '@/components/ui/skeleton'
import Link from 'next/link'
import { cn } from '@/lib/utils'

export default function MerchantDashboardPage() {
    const { selectedLocationId, locations } = useLocationStore()
    const selectedLocation = useSelectedLocation()
    const isAllLocations = useIsAllLocations()

    const { data: menus, isLoading: menusLoading } = useLocationScopedMenus()
    const { data: menuItems, isLoading: itemsLoading } = useLocationScopedMenuItems()
    const { data: schedules, isLoading: schedulesLoading } = useLocationScopedSchedules()

    const menusList = Array.isArray(menus) ? menus : []
    const itemsList = Array.isArray(menuItems) ? menuItems : []
    const schedulesList = Array.isArray(schedules) ? schedules : []

    const activeMenus = menusList.filter(m => m.is_active).length
    const activeLocations = locations.filter(l => l.is_active).length
    const acceptingOrdersCount = locations.filter(l => l.is_accepting_orders).length

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header with Location Context */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
                    <p className="text-muted-foreground flex items-center gap-2">
                        {isAllLocations ? (
                            <>
                                <Building2 className="h-4 w-4" />
                                Viewing all {locations.length} location{locations.length !== 1 ? 's' : ''}
                            </>
                        ) : (
                            <>
                                <MapPin className="h-4 w-4" />
                                Viewing {selectedLocation?.name || 'Unknown Location'}
                            </>
                        )}
                    </p>
                </div>
                {selectedLocation && (
                    <div className="flex items-center gap-2">
                        <Badge variant={selectedLocation.is_active ? "default" : "secondary"}>
                            {selectedLocation.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                        <Badge
                            variant={selectedLocation.is_accepting_orders ? "default" : "outline"}
                            className={selectedLocation.is_accepting_orders ? "bg-green-600" : ""}
                        >
                            {selectedLocation.is_accepting_orders ? 'Accepting Orders' : 'Not Accepting'}
                        </Badge>
                    </div>
                )}
            </div>

            {/* Location Quick Info (when viewing specific location) */}
            {selectedLocation && (
                <Card className="border-primary/30 bg-gradient-to-r from-primary/5 to-transparent animate-in fade-in slide-in-from-top-2 duration-300">
                    <CardContent className="py-4">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="flex items-center gap-4">
                                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                                    <MapPin className="h-6 w-6 text-primary" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-lg">{selectedLocation.name}</h3>
                                    <p className="text-sm text-muted-foreground">
                                        {selectedLocation.city}, {selectedLocation.state}
                                    </p>
                                </div>
                            </div>
                            <Button variant="outline" asChild>
                                <Link href="/dashboard/locations">
                                    Manage Location
                                    <ArrowRight className="h-4 w-4 ml-2" />
                                </Link>
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Stats Overview */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card className="transition-all hover:shadow-md animate-in fade-in slide-in-from-bottom-4 duration-300" style={{ animationDelay: '0ms' }}>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">$0.00</div>
                        <p className="text-xs text-muted-foreground">
                            {isAllLocations ? 'All locations' : selectedLocation?.name}
                        </p>
                    </CardContent>
                </Card>
                <Card className="transition-all hover:shadow-md animate-in fade-in slide-in-from-bottom-4 duration-300" style={{ animationDelay: '50ms' }}>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Orders Today</CardTitle>
                        <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">0</div>
                        <p className="text-xs text-muted-foreground">
                            {isAllLocations ? 'Across all locations' : 'This location'}
                        </p>
                    </CardContent>
                </Card>
                <Card className="transition-all hover:shadow-md animate-in fade-in slide-in-from-bottom-4 duration-300" style={{ animationDelay: '100ms' }}>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            {isAllLocations ? 'Active Locations' : 'Team Members'}
                        </CardTitle>
                        {isAllLocations ? (
                            <MapPin className="h-4 w-4 text-muted-foreground" />
                        ) : (
                            <Users className="h-4 w-4 text-muted-foreground" />
                        )}
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {isAllLocations ? activeLocations : 0}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {isAllLocations ? `${acceptingOrdersCount} accepting orders` : 'At this location'}
                        </p>
                    </CardContent>
                </Card>
                <Card className="transition-all hover:shadow-md animate-in fade-in slide-in-from-bottom-4 duration-300" style={{ animationDelay: '150ms' }}>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Growth</CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600">+0%</div>
                        <p className="text-xs text-muted-foreground">
                            From last month
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Quick Actions / Summaries */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {/* Menus Summary */}
                <Card className="transition-all hover:shadow-md">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                            <CardTitle className="text-base flex items-center gap-2">
                                <Utensils className="h-4 w-4" />
                                Menus
                            </CardTitle>
                            <CardDescription>Your active menus</CardDescription>
                        </div>
                        <Button variant="ghost" size="sm" asChild>
                            <Link href="/dashboard/menu">
                                View All
                                <ArrowRight className="h-4 w-4 ml-1" />
                            </Link>
                        </Button>
                    </CardHeader>
                    <CardContent>
                        {menusLoading ? (
                            <div className="space-y-2">
                                <Skeleton className="h-4 w-24" />
                                <Skeleton className="h-3 w-32" />
                            </div>
                        ) : menusList.length === 0 ? (
                            <div className="text-sm text-muted-foreground">
                                <p>No menus created yet</p>
                                <Button variant="link" className="p-0 h-auto" asChild>
                                    <Link href="/dashboard/menu">Create your first menu</Link>
                                </Button>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <span className="text-2xl font-bold">{activeMenus}</span>
                                    <span className="text-sm text-muted-foreground">active menus</span>
                                </div>
                                <div className="flex items-center gap-2 text-sm">
                                    <Badge variant="outline">{menusList.length} total</Badge>
                                    <Badge variant="outline">{itemsList.length} items</Badge>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Schedules Summary */}
                <Card className="transition-all hover:shadow-md">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                            <CardTitle className="text-base flex items-center gap-2">
                                <Clock className="h-4 w-4" />
                                Schedules
                            </CardTitle>
                            <CardDescription>Menu availability schedules</CardDescription>
                        </div>
                        <Button variant="ghost" size="sm" asChild>
                            <Link href="/dashboard/menu/schedules">
                                View All
                                <ArrowRight className="h-4 w-4 ml-1" />
                            </Link>
                        </Button>
                    </CardHeader>
                    <CardContent>
                        {schedulesLoading ? (
                            <div className="space-y-2">
                                <Skeleton className="h-4 w-24" />
                                <Skeleton className="h-3 w-32" />
                            </div>
                        ) : schedulesList.length === 0 ? (
                            <div className="text-sm text-muted-foreground">
                                <p>No schedules created yet</p>
                                <Button variant="link" className="p-0 h-auto" asChild>
                                    <Link href="/dashboard/menu/schedules">Create a schedule</Link>
                                </Button>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <span className="text-2xl font-bold">{schedulesList.length}</span>
                                    <span className="text-sm text-muted-foreground">schedules</span>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    Controlling menu availability
                                </p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Locations Summary (only in all-locations view) */}
                {isAllLocations ? (
                    <Card className="transition-all hover:shadow-md">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <div>
                                <CardTitle className="text-base flex items-center gap-2">
                                    <MapPin className="h-4 w-4" />
                                    Locations
                                </CardTitle>
                                <CardDescription>Your business locations</CardDescription>
                            </div>
                            <Button variant="ghost" size="sm" asChild>
                                <Link href="/dashboard/locations">
                                    Manage
                                    <ArrowRight className="h-4 w-4 ml-1" />
                                </Link>
                            </Button>
                        </CardHeader>
                        <CardContent>
                            {locations.length === 0 ? (
                                <div className="text-sm text-muted-foreground">
                                    <p>No locations added yet</p>
                                    <Button variant="link" className="p-0 h-auto" asChild>
                                        <Link href="/dashboard/locations/new">Add your first location</Link>
                                    </Button>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2">
                                        <span className="text-2xl font-bold">{locations.length}</span>
                                        <span className="text-sm text-muted-foreground">locations</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="flex items-center gap-1 text-sm">
                                            <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                                            <span>{activeLocations} active</span>
                                        </div>
                                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                            <AlertCircle className="h-3.5 w-3.5" />
                                            <span>{locations.length - activeLocations} inactive</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                ) : (
                    /* Staff Summary (when viewing specific location) */
                    <Card className="transition-all hover:shadow-md">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <div>
                                <CardTitle className="text-base flex items-center gap-2">
                                    <Users className="h-4 w-4" />
                                    Team
                                </CardTitle>
                                <CardDescription>Staff at this location</CardDescription>
                            </div>
                            <Button variant="ghost" size="sm" asChild>
                                <Link href="/dashboard/staff">
                                    Manage
                                    <ArrowRight className="h-4 w-4 ml-1" />
                                </Link>
                            </Button>
                        </CardHeader>
                        <CardContent>
                            <div className="text-sm text-muted-foreground">
                                <p>Team management coming soon</p>
                                <p className="text-xs mt-1">View team from location details</p>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>

            {/* Recent Activity */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Recent Activity</CardTitle>
                    <CardDescription>
                        {isAllLocations
                            ? 'Latest activity across all locations'
                            : `Latest activity at ${selectedLocation?.name}`
                        }
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                        <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
                            <Clock className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <p className="text-sm text-muted-foreground">No recent activity</p>
                        <p className="text-xs text-muted-foreground mt-1">
                            Activity will appear here as you process orders
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
