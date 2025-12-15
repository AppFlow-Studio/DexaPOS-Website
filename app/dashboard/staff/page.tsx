'use client'
import { useMemo, useState } from 'react'

import { useIsAllLocations, useSelectedLocation } from '@/stores/location-store'
import { useUnifiedStaff } from '../hooks/useStaff'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
    UserPlus, Users, MapPin, Globe, Lock, Mail
} from 'lucide-react'
import { InviteUserWizard } from '@/components/dashboard/staff/InviteUserWizard'
import { StaffDataTable } from '@/components/dashboard/staff/StaffDataTable'

export default function MerchantStaffPage() {
    const selectedLocation = useSelectedLocation()
    const isAllLocations = useIsAllLocations()

    // Fetch unified staff data with automatic location scoping
    const { data: staffMembers, isLoading, refetch } = useUnifiedStaff()
    const staff = staffMembers || []

    const [isWizardOpen, setIsWizardOpen] = useState(false)

    // Calculate stats
    const stats = useMemo(() => {
        const activeCount = staff.filter(s => s.overall_is_active).length
        const clerkUsers = staff.filter(s => s.is_clerk_user).length
        const posOnly = staff.filter(s => !s.is_clerk_user).length
        const uniqueLocations = new Set(
            staff.flatMap(s => s.location_assignments.map(a => a.location_id))
        ).size

        return {
            active: activeCount,
            clerk: clerkUsers,
            posOnly: posOnly,
            locations: uniqueLocations
        }
    }, [staff])

    return (
        <main className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <h1 className="text-2xl font-bold tracking-tight">Staff & Access</h1>
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
                        Manage dashboard users and POS staff with location-specific access
                    </p>
                </div>
                <InviteUserWizard
                    open={isWizardOpen}
                    onOpenChange={setIsWizardOpen}
                    onSuccess={refetch}
                >
                    <Button className="gap-2">
                        <UserPlus className="h-4 w-4" />
                        Add Staff
                    </Button>
                </InviteUserWizard>
            </div>

            {/* Stats */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card className="transition-all hover:shadow-md">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Staff</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {isLoading ? <Skeleton className="h-8 w-16" /> : (
                            <div className="text-2xl font-bold">{staff.length}</div>
                        )}
                        <p className="text-xs text-muted-foreground">All staff members</p>
                    </CardContent>
                </Card>

                <Card className="transition-all hover:shadow-md">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active Staff</CardTitle>
                        <Users className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        {isLoading ? <Skeleton className="h-8 w-16" /> : (
                            <div className="text-2xl font-bold text-green-600">{stats.active}</div>
                        )}
                        <p className="text-xs text-muted-foreground">Currently active</p>
                    </CardContent>
                </Card>

                <Card className="transition-all hover:shadow-md">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Dashboard Users</CardTitle>
                        <Mail className="h-4 w-4 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                        {isLoading ? <Skeleton className="h-8 w-16" /> : (
                            <div className="text-2xl font-bold text-blue-600">{stats.clerk}</div>
                        )}
                        <p className="text-xs text-muted-foreground">Clerk accounts</p>
                    </CardContent>
                </Card>

                <Card className="transition-all hover:shadow-md">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">POS Only</CardTitle>
                        <Lock className="h-4 w-4 text-purple-500" />
                    </CardHeader>
                    <CardContent>
                        {isLoading ? <Skeleton className="h-8 w-16" /> : (
                            <div className="text-2xl font-bold text-purple-600">{stats.posOnly}</div>
                        )}
                        <p className="text-xs text-muted-foreground">PIN-based accounts</p>
                    </CardContent>
                </Card>
            </div>

            {/* Staff Data Table */}
            <Card>
                <CardHeader>
                    <CardTitle>Staff Directory</CardTitle>
                    <CardDescription>
                        Manage all staff members across your locations. Toggle status, reset PINs, and more.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <StaffDataTable data={staff} isLoading={isLoading} />
                </CardContent>
            </Card>
        </main>
    )
}