'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty } from '@/components/ui/empty'
import {
    MapPin, Plus, Building2, Edit, Trash2, Search,
    Phone, Mail, Clock, Globe, Layers, CheckCircle,
    Settings, LayoutGrid, List, XCircle,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useLocations } from '../hooks/useLocations'
import { useUserInfo } from '../../manage/hooks/useUserInfo.'
import { toast } from 'sonner'
import { useRouter, useSearchParams } from 'next/navigation'
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

type ViewMode = 'grid' | 'list'

export default function LocationsPage() {
    const { data: userInfo } = useUserInfo()
    const searchParams = useSearchParams()
    const clerkOrgId = userInfo?.members?.[0]?.organizations?.id
    const { data: locations, isLoading, refetch } = useLocations(clerkOrgId || '', userInfo?.id || '')
    const router = useRouter()
    const queryClient = useQueryClient()
    const autoOpenedLocationIdRef = useRef<string | null>(null)

    const userRole = userInfo?.members?.[0]?.role as string | undefined
    const canCreateLocation = userRole === 'merchant.admin' || userRole === 'merchant.owner'

    const { selectedLocationId, setSelectedLocation } = useLocationStore()

    const [searchTerm, setSearchTerm] = useState('')
    const [viewMode, setViewMode] = useState<ViewMode>('grid')
    const [deletingLocation, setDeletingLocation] = useState<Location | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)
    const [editingLocation, setEditingLocation] = useState<Location | null>(null)
    const [isSheetOpen, setIsSheetOpen] = useState(false)

    const locationsList = Array.isArray(locations) ? locations : []
    const autoOpenLocationId = searchParams.get('open')
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
                toast.error('Delete Failed', { description: result.error })
                return
            }
            toast.success('Location Deleted', {
                description: `"${deletingLocation.name}" has been permanently deleted.`
            })
            queryClient.invalidateQueries({ queryKey: ['locations'] })
            refetch()
            if (selectedLocationId === deletingLocation.id) setSelectedLocation('all')
        } catch {
            toast.error('Delete Failed', { description: 'Unable to delete the location. Please try again.' })
        } finally {
            setIsDeleting(false)
            setDeletingLocation(null)
        }
    }

    const getTimezoneLabel = (tz: string) =>
        US_TIMEZONES.find(t => t.value === tz)?.label || tz

    const handleSelectLocation = (location: Location) => {
        setSelectedLocation(location.id)
        toast.success(`Now viewing ${location.name}`)
    }

    const handleEditLocation = (location: Location) => {
        setEditingLocation(location)
        setIsSheetOpen(true)
    }

    const handleSheetClose = () => {
        setIsSheetOpen(false)
        setTimeout(() => setEditingLocation(null), 200)
    }

    useEffect(() => {
        if (!autoOpenLocationId || isLoading) return
        if (autoOpenedLocationIdRef.current === autoOpenLocationId) return

        const locationToOpen = locationsList.find((location) => location.id === autoOpenLocationId)
        if (!locationToOpen) return

        autoOpenedLocationIdRef.current = autoOpenLocationId
        setEditingLocation(locationToOpen)
        setIsSheetOpen(true)
        setSelectedLocation(locationToOpen.id)

        const nextParams = new URLSearchParams(searchParams.toString())
        nextParams.delete('open')
        const nextQuery = nextParams.toString()
        router.replace(nextQuery ? `/dashboard/locations?${nextQuery}` : '/dashboard/locations')
    }, [autoOpenLocationId, isLoading, locationsList, router, searchParams, setSelectedLocation])

    const isSelected = (id: string) => selectedLocationId === id

    // ─── Shared action buttons ────────────────────────────────────────────────
    const ActionButtons = ({ location, compact = false }: { location: Location; compact?: boolean }) => (
        <div className={cn("flex items-center gap-1", compact ? "opacity-0 group-hover:opacity-100 transition-opacity" : "")}>
            <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={(e) => { e.stopPropagation(); handleEditLocation(location) }}
            >
                <Edit className="h-4 w-4" />
            </Button>
            <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={(e) => { e.stopPropagation(); router.push(`/dashboard/locations/${location.id}/settings`) }}
            >
                <Settings className="h-4 w-4" />
            </Button>
            {canCreateLocation && (
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={(e) => { e.stopPropagation(); setDeletingLocation(location) }}
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            )}
        </div>
    )

    return (
        <div className="space-y-6 animate-in fade-in duration-500">

            {/* ── Header ─────────────────────────────────────────────────────── */}
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">Locations</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Manage your business locations and storefronts
                    </p>
                </div>
                {canCreateLocation && (
                    <Button onClick={() => router.push('/dashboard/locations/new')} size="sm" className="gap-2">
                        <Plus className="h-4 w-4" />
                        Add Location
                    </Button>
                )}
            </div>

            {/* ── Stats ──────────────────────────────────────────────────────── */}
            <div className="grid grid-cols-3 gap-4">
                {[
                    { label: 'Total', value: locationsList.length, icon: Building2, color: 'text-muted-foreground' },
                    { label: 'Active', value: activeLocations, icon: CheckCircle, color: 'text-emerald-500' },
                    { label: 'Taking Orders', value: acceptingOrders, icon: MapPin, color: 'text-primary' },
                ].map(stat => (
                    <div key={stat.label} className="rounded-xl border bg-card px-4 py-3 flex items-center gap-3">
                        <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                            <stat.icon className={cn("h-4 w-4", stat.color)} />
                        </div>
                        <div>
                            <p className="text-2xl font-bold leading-none">{isLoading ? '—' : stat.value}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* ── Active location banner ──────────────────────────────────────── */}
            {selectedLocationId !== 'all' && (
                <div className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="flex items-center gap-2 text-sm">
                        <CheckCircle className="h-4 w-4 text-primary" />
                        <span className="text-muted-foreground">Viewing</span>
                        <span className="font-medium text-foreground">
                            {locationsList.find(l => l.id === selectedLocationId)?.name}
                        </span>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => { setSelectedLocation('all'); toast.info('Viewing all locations') }}
                    >
                        <XCircle className="h-3.5 w-3.5 mr-1" />
                        Clear
                    </Button>
                </div>
            )}

            {/* ── Toolbar ────────────────────────────────────────────────────── */}
            <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                        placeholder="Search locations..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9"
                    />
                </div>
                <div className="flex items-center rounded-lg border bg-muted/40 p-0.5 gap-0.5">
                    <Button
                        variant="ghost"
                        size="sm"
                        className={cn(
                            "h-8 w-8 p-0 rounded-md",
                            viewMode === 'grid' && "bg-background shadow-sm text-foreground"
                        )}
                        onClick={() => setViewMode('grid')}
                    >
                        <LayoutGrid className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        className={cn(
                            "h-8 w-8 p-0 rounded-md",
                            viewMode === 'list' && "bg-background shadow-sm text-foreground"
                        )}
                        onClick={() => setViewMode('list')}
                    >
                        <List className="h-4 w-4" />
                    </Button>
                </div>
                <p className="text-sm text-muted-foreground whitespace-nowrap">
                    {isLoading ? '' : `${filteredLocations.length} location${filteredLocations.length !== 1 ? 's' : ''}`}
                </p>
            </div>

            {/* ── Content ────────────────────────────────────────────────────── */}
            {isLoading ? (
                viewMode === 'grid' ? (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {[1, 2, 3].map(i => <Skeleton key={i} className="h-52 w-full rounded-xl" />)}
                    </div>
                ) : (
                    <div className="space-y-2">
                        {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
                    </div>
                )
            ) : filteredLocations.length === 0 ? (
                <div className="rounded-xl border bg-card">
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
                </div>
            ) : viewMode === 'grid' ? (

                /* ── Grid view ─────────────────────────────────────────────── */
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {filteredLocations.map((location, index) => (
                        <div
                            key={location.id}
                            className={cn(
                                "group relative rounded-xl border bg-card p-5 cursor-pointer",
                                "transition-all duration-150 hover:shadow-md hover:border-primary/30",
                                "animate-in fade-in slide-in-from-bottom-3",
                                isSelected(location.id) && "border-primary ring-1 ring-primary bg-primary/[0.02]"
                            )}
                            style={{ animationDelay: `${index * 40}ms` }}
                            onClick={() => handleSelectLocation(location)}
                        >
                            {/* Top row */}
                            <div className="flex items-start justify-between gap-2 mb-4">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className={cn(
                                        "h-10 w-10 rounded-lg flex items-center justify-center shrink-0",
                                        location.is_active ? "bg-primary/10" : "bg-muted"
                                    )}>
                                        <MapPin className={cn("h-5 w-5", location.is_active ? "text-primary" : "text-muted-foreground")} />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="font-semibold leading-tight truncate">{location.name}</p>
                                        {location.code && (
                                            <p className="text-xs text-muted-foreground font-mono mt-0.5">{location.code}</p>
                                        )}
                                    </div>
                                </div>
                                <ActionButtons location={location} compact />
                            </div>

                            {/* Address */}
                            <div className="flex items-start gap-2 mb-3">
                                <Building2 className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                                <div className="text-sm text-muted-foreground leading-snug">
                                    <p>{location.address_line1}</p>
                                    <p>{location.city}, {location.state} {location.postal_code}</p>
                                </div>
                            </div>

                            {/* Contact row */}
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mb-4">
                                {location.phone && (
                                    <span className="flex items-center gap-1">
                                        <Phone className="h-3 w-3" />{location.phone}
                                    </span>
                                )}
                                {location.timezone && (
                                    <span className="flex items-center gap-1">
                                        <Clock className="h-3 w-3" />{getTimezoneLabel(location.timezone)}
                                    </span>
                                )}
                            </div>

                            {/* Badges */}
                            <div className="flex flex-wrap gap-1.5">
                                <Badge
                                    variant={location.is_active ? "default" : "secondary"}
                                    className="text-xs px-2 py-0"
                                >
                                    {location.is_active ? 'Active' : 'Inactive'}
                                </Badge>
                                {location.is_accepting_orders && (
                                    <Badge className="text-xs px-2 py-0 bg-emerald-600 hover:bg-emerald-600">
                                        Taking Orders
                                    </Badge>
                                )}
                                <Badge variant="outline" className="text-xs px-2 py-0 gap-1">
                                    {location.uses_global_menu
                                        ? <><Globe className="h-2.5 w-2.5" />Global Menu</>
                                        : <><Layers className="h-2.5 w-2.5" />Custom Menu</>
                                    }
                                </Badge>
                            </div>

                            {/* Selected indicator */}
                            {isSelected(location.id) && (
                                <div className="absolute top-2.5 right-2.5">
                                    <div className="h-2 w-2 rounded-full bg-primary" />
                                </div>
                            )}
                        </div>
                    ))}
                </div>

            ) : (

                /* ── List view ─────────────────────────────────────────────── */
                <div className="rounded-xl border bg-card divide-y overflow-hidden">
                    {filteredLocations.map((location, index) => (
                        <div
                            key={location.id}
                            className={cn(
                                "group flex items-center gap-4 px-5 py-4 cursor-pointer",
                                "transition-colors hover:bg-muted/40",
                                "animate-in fade-in",
                                isSelected(location.id) && "bg-primary/[0.03] border-l-2 border-l-primary"
                            )}
                            style={{ animationDelay: `${index * 30}ms` }}
                            onClick={() => handleSelectLocation(location)}
                        >
                            {/* Icon */}
                            <div className={cn(
                                "h-10 w-10 rounded-lg flex items-center justify-center shrink-0",
                                location.is_active ? "bg-primary/10" : "bg-muted"
                            )}>
                                <MapPin className={cn("h-5 w-5", location.is_active ? "text-primary" : "text-muted-foreground")} />
                            </div>

                            {/* Name + address */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <p className="font-medium leading-tight truncate">{location.name}</p>
                                    {location.code && (
                                        <span className="text-xs text-muted-foreground font-mono hidden sm:block">{location.code}</span>
                                    )}
                                </div>
                                <p className="text-sm text-muted-foreground truncate mt-0.5">
                                    {location.address_line1}, {location.city}, {location.state}
                                </p>
                            </div>

                            {/* Contact */}
                            <div className="hidden md:flex flex-col gap-1 text-xs text-muted-foreground min-w-0 w-36">
                                {location.phone && (
                                    <span className="flex items-center gap-1.5 truncate">
                                        <Phone className="h-3 w-3 shrink-0" />{location.phone}
                                    </span>
                                )}
                                {location.email && (
                                    <span className="flex items-center gap-1.5 truncate">
                                        <Mail className="h-3 w-3 shrink-0" />{location.email}
                                    </span>
                                )}
                            </div>

                            {/* Badges */}
                            <div className="hidden lg:flex items-center gap-1.5 shrink-0">
                                <Badge
                                    variant={location.is_active ? "default" : "secondary"}
                                    className="text-xs px-2 py-0"
                                >
                                    {location.is_active ? 'Active' : 'Inactive'}
                                </Badge>
                                {location.is_accepting_orders && (
                                    <Badge className="text-xs px-2 py-0 bg-emerald-600 hover:bg-emerald-600">
                                        Taking Orders
                                    </Badge>
                                )}
                            </div>

                            {/* Actions */}
                            <ActionButtons location={location} compact />
                        </div>
                    ))}
                </div>
            )}

            {/* ── Delete dialog ───────────────────────────────────────────────── */}
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
                                <><Trash2 className="h-4 w-4 mr-2" />Delete Location</>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Edit sheet ──────────────────────────────────────────────────── */}
            <LocationDetailSheet
                location={editingLocation}
                open={isSheetOpen}
                onOpenChange={handleSheetClose}
                onUpdate={refetch}
            />
        </div>
    )
}
