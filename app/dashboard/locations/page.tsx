'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MapPin, Plus, Building2, Edit, Trash2, Search, Phone, Mail, Clock, Globe, Layers, CheckCircle, XCircle, Settings } from 'lucide-react'
import { useState } from 'react'
import { useLocations } from '../hooks/useLocations'
import { useUserInfo } from '../../manage/hooks/useUserInfo.'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Empty } from '@/components/ui/empty'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { DeleteLocation } from '../actions/locations'
import { cn } from '@/lib/utils'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { US_TIMEZONES, Location } from '@/types/merchant_locations'
import { useLocationStore } from '@/stores/location-store'
import { LocationDetailSheet } from '@/components/dashboard/locations/LocationDetailSheet'

export default function LocationsPage() {
    const { data: userInfo } = useUserInfo()
    const clerkOrgId = userInfo?.members?.[0]?.organizations?.id
    const { data: locations, isLoading, refetch } = useLocations(clerkOrgId || '', userInfo?.id || '')
    const router = useRouter()
    const queryClient = useQueryClient()

    // Check if user can create locations (only merchant.admin or merchant.owner)
    const userRole = userInfo?.members?.[0]?.role as string | undefined
    const canCreateLocation = userRole === 'merchant.admin' || userRole === 'merchant.owner'

    // Zustand store
    const { selectedLocationId, setSelectedLocation } = useLocationStore()

    const [searchTerm, setSearchTerm] = useState('')
    const [deletingLocation, setDeletingLocation] = useState<Location | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)

    // Location detail sheet state
    const [editingLocation, setEditingLocation] = useState<Location | null>(null)
    const [isSheetOpen, setIsSheetOpen] = useState(false)

    const locationsList = Array.isArray(locations) ? locations : []
    const filteredLocations = locationsList.filter(location =>
        location.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        location.city?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        location.state?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        location.code?.toLowerCase().includes(searchTerm.toLowerCase())
    )

    const activeLocations = locationsList.filter(l => l.is_active).length
    const acceptingOrders = locationsList.filter(l => l.is_accepting_orders).length

    const handleDelete = async () => {
        if (!deletingLocation) return

        setIsDeleting(true)
        try {
            const result = await DeleteLocation(deletingLocation.id)
            if (result.error) {
                toast.error('Delete Failed', {
                    description: result.error
                })
                return
            }
            toast.success('Location Deleted', {
                description: `"${deletingLocation.name}" has been permanently deleted.`
            })
            queryClient.invalidateQueries({ queryKey: ['locations'] })
            refetch()

            // If deleted location was selected, reset selection
            if (selectedLocationId === deletingLocation.id) {
                setSelectedLocation('all')
            }
        } catch (error) {
            toast.error('Delete Failed', {
                description: 'Unable to delete the location. Please try again.'
            })
        } finally {
            setIsDeleting(false)
            setDeletingLocation(null)
        }
    }

    const getTimezoneLabel = (tz: string) => {
        return US_TIMEZONES.find(t => t.value === tz)?.label || tz
    }

    const handleSelectLocation = (location: Location) => {
        setSelectedLocation(location.id)
        toast.success('Location Selected', {
            description: `Now viewing ${location.name}`,
            icon: <MapPin className="h-4 w-4" />,
        })
    }

    const handleEditLocation = (location: Location) => {
        setEditingLocation(location)
        setIsSheetOpen(true)
    }

    const handleSheetClose = () => {
        setIsSheetOpen(false)
        // Small delay before clearing editing location to prevent UI flash
        setTimeout(() => setEditingLocation(null), 200)
    }

    const handleLocationUpdate = () => {
        refetch()
    }

    const isLocationSelected = (locationId: string) => {
        return selectedLocationId === locationId
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Locations</h2>
                    <p className="text-muted-foreground">
                        Manage all your business locations and franchises
                    </p>
                </div>
                {canCreateLocation && (
                    <Button onClick={() => router.push('/dashboard/locations/new')} className="gap-2">
                        <Plus className="h-4 w-4" />
                        Add Location
                    </Button>
                )}
            </div>

            {/* Stats Overview */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card className="transition-all hover:shadow-md">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Locations</CardTitle>
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{locationsList.length}</div>
                        <p className="text-xs text-muted-foreground">
                            All locations
                        </p>
                    </CardContent>
                </Card>
                <Card className="transition-all hover:shadow-md">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active</CardTitle>
                        <CheckCircle className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600">{activeLocations}</div>
                        <p className="text-xs text-muted-foreground">
                            Currently active
                        </p>
                    </CardContent>
                </Card>
                <Card className="transition-all hover:shadow-md">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Accepting Orders</CardTitle>
                        <MapPin className="h-4 w-4 text-primary" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-primary">{acceptingOrders}</div>
                        <p className="text-xs text-muted-foreground">
                            Taking orders now
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Currently Viewing Indicator */}
            {selectedLocationId !== 'all' && (
                <Card className="border-primary/50 bg-primary/5 animate-in fade-in slide-in-from-top-2 duration-300">
                    <CardContent className="py-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                                    <MapPin className="h-5 w-5 text-primary" />
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Currently viewing</p>
                                    <p className="font-semibold">
                                        {locationsList.find(l => l.id === selectedLocationId)?.name || 'Unknown Location'}
                                    </p>
                                </div>
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    setSelectedLocation('all')
                                    toast.info('Viewing all locations')
                                }}
                            >
                                View All Locations
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Locations List */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>All Locations</CardTitle>
                            <CardDescription>Click a location to select it, or use the edit button to manage settings</CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="relative">
                                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search locations..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-8 w-64"
                                />
                            </div>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                            {[1, 2, 3].map((i) => (
                                <Skeleton key={i} className="h-48 w-full" />
                            ))}
                        </div>
                    ) : filteredLocations.length === 0 ? (
                        <Empty
                            icon={MapPin}
                            title={locationsList.length === 0 ? "No locations yet" : "No locations found"}
                            description={
                                locationsList.length === 0
                                    ? canCreateLocation 
                                        ? "Get started by adding your first business location"
                                        : "Contact your admin to add a location"
                                    : "Try adjusting your search terms"
                            }
                            action={
                                locationsList.length === 0 && canCreateLocation ? (
                                    <Button onClick={() => router.push('/dashboard/locations/new')}>
                                        <Plus className="h-4 w-4 mr-2" />
                                        Add Location
                                    </Button>
                                ) : null
                            }
                        />
                    ) : (
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                            {filteredLocations.map((location, index) => (
                                <Card
                                    key={location.id}
                                    className={cn(
                                        "group transition-all cursor-pointer animate-in fade-in slide-in-from-bottom-4 overflow-hidden",
                                        "hover:shadow-lg hover:border-primary/30",
                                        isLocationSelected(location.id) && "ring-2 ring-primary border-primary"
                                    )}
                                    style={{ animationDelay: `${index * 50}ms` }}
                                    onClick={() => handleSelectLocation(location)}
                                >
                                    <CardContent className="p-0">
                                        {/* Header */}
                                        <div className="p-4 border-b bg-muted/30">
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <div className={cn(
                                                        "h-10 w-10 rounded-lg flex items-center justify-center shrink-0",
                                                        location.is_active ? "bg-primary/10" : "bg-muted"
                                                    )}>
                                                        <MapPin className={cn(
                                                            "h-5 w-5",
                                                            location.is_active ? "text-primary" : "text-muted-foreground"
                                                        )} />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <h3 className="font-semibold truncate">{location.name}</h3>
                                                        {location.code && (
                                                            <p className="text-xs text-muted-foreground font-mono">
                                                                {location.code}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8"
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            handleEditLocation(location)
                                                        }}
                                                    >
                                                        <Edit className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8"
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            router.push(`/dashboard/locations/${location.id}/settings`)
                                                        }}
                                                    >
                                                        <Settings className="h-4 w-4" />
                                                    </Button>
                                                    {canCreateLocation && (
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8 text-destructive hover:text-destructive"
                                                            onClick={(e) => {
                                                                e.stopPropagation()
                                                                setDeletingLocation(location)
                                                            }}
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Content */}
                                        <div className="p-4 space-y-3">
                                            {/* Address */}
                                            <div className="flex items-start gap-2">
                                                <Building2 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                                                <div className="text-sm">
                                                    <p>{location.address_line1}</p>
                                                    {location.address_line2 && <p>{location.address_line2}</p>}
                                                    <p className="text-muted-foreground">
                                                        {location.city}, {location.state} {location.postal_code}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Contact */}
                                            <div className="flex flex-wrap gap-3 text-sm">
                                                {location.phone && (
                                                    <div className="flex items-center gap-1.5 text-muted-foreground">
                                                        <Phone className="h-3.5 w-3.5" />
                                                        <span>{location.phone}</span>
                                                    </div>
                                                )}
                                                {location.email && (
                                                    <div className="flex items-center gap-1.5 text-muted-foreground">
                                                        <Mail className="h-3.5 w-3.5" />
                                                        <span className="truncate max-w-[150px]">{location.email}</span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Timezone */}
                                            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                                <Clock className="h-3.5 w-3.5" />
                                                <span>{getTimezoneLabel(location.timezone)}</span>
                                            </div>

                                            {/* Status Badges */}
                                            <div className="flex flex-wrap gap-2 pt-2">
                                                <Badge variant={location.is_active ? "default" : "secondary"}>
                                                    {location.is_active ? 'Active' : 'Inactive'}
                                                </Badge>
                                                <Badge variant={location.is_accepting_orders ? "default" : "outline"} className={
                                                    location.is_accepting_orders ? "bg-green-600" : ""
                                                }>
                                                    {location.is_accepting_orders ? 'Accepting Orders' : 'Not Accepting'}
                                                </Badge>
                                                <Badge variant="outline" className="gap-1">
                                                    {location.uses_global_menu ? (
                                                        <>
                                                            <Globe className="h-3 w-3" />
                                                            Global Menu
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Layers className="h-3 w-3" />
                                                            Custom Menu
                                                        </>
                                                    )}
                                                </Badge>
                                            </div>
                                        </div>

                                        {/* Selected Indicator */}
                                        {isLocationSelected(location.id) && (
                                            <div className="px-4 py-2 bg-primary/10 border-t border-primary/20">
                                                <p className="text-xs text-primary font-medium flex items-center gap-1">
                                                    <CheckCircle className="h-3.5 w-3.5" />
                                                    Currently viewing this location
                                                </p>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Delete Confirmation Dialog */}
            <Dialog open={!!deletingLocation} onOpenChange={(open) => !open && setDeletingLocation(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-destructive">
                            <Trash2 className="h-5 w-5" />
                            Delete Location
                        </DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete "{deletingLocation?.name}"? This will remove all associated data including staff assignments, menu customizations, and historical data. This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeletingLocation(null)} disabled={isDeleting}>
                            Cancel
                        </Button>
                        <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
                            {isDeleting ? (
                                <>
                                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                    Deleting...
                                </>
                            ) : (
                                <>
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete Location
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Location Detail Sheet */}
            <LocationDetailSheet
                location={editingLocation}
                open={isSheetOpen}
                onOpenChange={handleSheetClose}
                onUpdate={handleLocationUpdate}
            />
        </div>
    )
}
