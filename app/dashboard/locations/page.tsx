'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty } from '@/components/ui/empty'
import {
    MapPin, Plus, Building2, Edit, Search,
    Phone, Mail, Clock, Globe, Layers, CheckCircle,
    Settings, LayoutGrid, List, XCircle,
    Archive, RotateCcw, Loader2,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useLocations } from '../hooks/useLocations'
import { useUserInfo } from '../../manage/hooks/useUserInfo.'
import { toast } from 'sonner'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { ArchiveLocation, RestoreLocation } from '../actions/locations'
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
import { useLocationStore, useIsSingleLocation } from '@/stores/location-store'
import { LocationDetailSheet } from '@/components/dashboard/locations/LocationDetailSheet'
import { formatPhoneForDisplay } from '@/lib/phone'

type ViewMode = 'grid' | 'list'
type StatusFilter = 'active' | 'archived' | 'all'

export default function LocationsPage() {
    const { data: userInfo } = useUserInfo()
    const searchParams = useSearchParams()
    const clerkOrgId = userInfo?.members?.[0]?.organizations?.id
    const { data: locations, isLoading, refetch } = useLocations(clerkOrgId || '', userInfo?.id || '')
    const router = useRouter()
    const queryClient = useQueryClient()
    const autoOpenedLocationIdRef = useRef<string | null>(null)

    const userRole = userInfo?.members?.[0]?.role as string | undefined
    const isOwner = userRole === 'merchant.owner'
    const canCreateLocation = userRole === 'merchant.admin' || isOwner

    const { selectedLocationId, setSelectedLocation } = useLocationStore()
    const isSingleLocation = useIsSingleLocation()

    const [searchTerm, setSearchTerm] = useState('')
    const [viewMode, setViewMode] = useState<ViewMode>('grid')
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')
    const [archivingLocation, setArchivingLocation] = useState<Location | null>(null)
    const [isArchiving, setIsArchiving] = useState(false)
    const [restoringId, setRestoringId] = useState<string | null>(null)
    const [editingLocation, setEditingLocation] = useState<Location | null>(null)
    const [isSheetOpen, setIsSheetOpen] = useState(false)

    const locationsList = Array.isArray(locations) ? locations : []
    const autoOpenLocationId = searchParams.get('open')

    const activeLocations = locationsList.filter(l => l.is_active)
    const archivedLocations = locationsList.filter(l => !l.is_active)

    const statusFiltered = locationsList.filter(l => {
        if (statusFilter === 'active') return l.is_active
        if (statusFilter === 'archived') return !l.is_active
        return true
    })

    const filteredLocations = statusFiltered.filter(location =>
        location.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        location.city?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        location.state?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        location.code?.toLowerCase().includes(searchTerm.toLowerCase())
    )

    const acceptingOrders = locationsList.filter(l => l.is_accepting_orders).length

    const handleArchive = async () => {
        if (!archivingLocation) return
        setIsArchiving(true)
        try {
            const result = await ArchiveLocation(archivingLocation.id)
            if (result.error) {
                toast.error('Archive Failed', { description: result.error })
                return
            }
            toast.success('Location Archived', {
                description: `"${archivingLocation.name}" has been archived. Historical data is preserved.`
            })
            queryClient.invalidateQueries({ queryKey: ['locations'] })
            refetch()
            if (selectedLocationId === archivingLocation.id) setSelectedLocation('all')
        } catch {
            toast.error('Archive Failed', { description: 'Unable to archive the location. Please try again.' })
        } finally {
            setIsArchiving(false)
            setArchivingLocation(null)
        }
    }

    const handleRestore = async (location: Location) => {
        setRestoringId(location.id)
        try {
            const result = await RestoreLocation(location.id)
            if (result.error) {
                toast.error('Restore Failed', { description: result.error })
                return
            }
            toast.success('Location Restored', {
                description: `"${location.name}" is active again.`
            })
            queryClient.invalidateQueries({ queryKey: ['locations'] })
            refetch()
        } catch {
            toast.error('Restore Failed', { description: 'Unable to restore the location. Please try again.' })
        } finally {
            setRestoringId(null)
        }
    }

    const getTimezoneLabel = (tz: string) =>
        US_TIMEZONES.find(t => t.value === tz)?.label || tz

    const handleSelectLocation = (location: Location) => {
        if (!location.is_active) return
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
    const ActionButtons = ({ location, compact = false }: { location: Location; compact?: boolean }) => {
        const isRestoring = restoringId === location.id

        if (!location.is_active) {
            return (
                <div className={cn("flex items-center gap-1", compact ? "opacity-0 group-hover:opacity-100 transition-opacity" : "")}>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-muted-foreground hover:text-foreground gap-1.5"
                        onClick={(e) => { e.stopPropagation(); handleRestore(location) }}
                        disabled={isRestoring}
                    >
                        {isRestoring
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <RotateCcw className="h-3.5 w-3.5" />
                        }
                        <span className="text-xs">Restore</span>
                    </Button>
                </div>
            )
        }

        return (
            <div className={cn("flex items-center gap-1", compact ? "opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity" : "")}>
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
                {isOwner && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-amber-600"
                        title="Archive location"
                        onClick={(e) => { e.stopPropagation(); setArchivingLocation(location) }}
                    >
                        <Archive className="h-4 w-4" />
                    </Button>
                )}
            </div>
        )
    }

    // ─── Single-location detail view ──────────────────────────────────────────
    // A one-active-location account gets a focused view of that store (matching
    // the singular "Location" nav) instead of the list-with-add. No Add Location,
    // no list/search/multi-stats. Multi-location accounts fall through unchanged.
    if (!isLoading && isSingleLocation && activeLocations.length === 1) {
        const store = activeLocations[0]
        return (
            <div className="space-y-6 animate-in fade-in duration-500 w-full min-w-0">
                <div>
                    <h1 className="text-xl font-semibold tracking-tight">Location</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Manage your store&apos;s details and settings
                    </p>
                </div>

                {/* Matches the dashboard Overview container: one rounded-2xl
                    shell holding identity and details, without internal
                    hairlines. */}
                <div className="overflow-hidden rounded-2xl border bg-card max-w-2xl">
                    {/* Identity — name and badges are stacked rows on narrow
                        screens and share a line from sm up. Side by side at
                        320px, the badges left the name almost no width. */}
                    <div className="px-6 py-8 sm:flex sm:items-start sm:justify-between sm:gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="h-11 w-11 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                <MapPin className="h-5 w-5 text-primary" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-[1.25rem] font-medium leading-tight tracking-[-0.01em] truncate">
                                    {store.name}
                                </p>
                                {store.code && (
                                    <p className="text-[0.8125rem] text-muted-foreground font-mono mt-1 truncate">{store.code}</p>
                                )}
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-3 sm:mt-0 sm:justify-end shrink-0">
                            <Badge variant="secondary" className="rounded-full text-xs font-medium px-2.5 py-0.5">
                                Active
                            </Badge>
                            {store.is_accepting_orders && (
                                <Badge className="rounded-full text-xs font-medium px-2.5 py-0.5 bg-emerald-600 hover:bg-emerald-600">
                                    Taking Orders
                                </Badge>
                            )}
                        </div>
                    </div>

                    {/* Details — label/value rows */}
                    <div className="px-6 pb-8">
                        <div className="space-y-0">
                            <div className="flex items-start justify-between gap-4 py-2.5">
                                <span className="flex items-center gap-2 text-[0.9375rem] text-muted-foreground">
                                    <Building2 className="h-4 w-4 shrink-0" />
                                    Address
                                </span>
                                <div className="text-sm text-right leading-snug min-w-0">
                                    <p>{store.address_line1}</p>
                                    <p>{store.city}, {store.state} {store.postal_code}</p>
                                </div>
                            </div>
                            {store.phone && (
                                <div className="flex items-center justify-between gap-4 py-2.5">
                                    <span className="flex items-center gap-2 text-[0.9375rem] text-muted-foreground">
                                        <Phone className="h-4 w-4 shrink-0" />
                                        Phone
                                    </span>
                                    <span className="text-sm tabular-nums">{formatPhoneForDisplay(store.phone)}</span>
                                </div>
                            )}
                            {store.email && (
                                <div className="flex items-center justify-between gap-4 py-2.5">
                                    <span className="flex items-center gap-2 text-[0.9375rem] text-muted-foreground shrink-0">
                                        <Mail className="h-4 w-4 shrink-0" />
                                        Email
                                    </span>
                                    <span className="text-sm text-right min-w-0 truncate">{store.email}</span>
                                </div>
                            )}
                            {store.timezone && (
                                <div className="flex items-center justify-between gap-4 py-2.5">
                                    <span className="flex items-center gap-2 text-[0.9375rem] text-muted-foreground">
                                        <Clock className="h-4 w-4 shrink-0" />
                                        Timezone
                                    </span>
                                    <span className="text-sm">{getTimezoneLabel(store.timezone)}</span>
                                </div>
                            )}
                        </div>

                        {/* Pill actions, matching the dashboard's "View report" style */}
                        <div className="flex flex-wrap gap-2 mt-6">
                            <Button
                                size="sm"
                                className="gap-2 rounded-full px-4"
                                onClick={() => handleEditLocation(store)}
                            >
                                <Edit className="h-4 w-4" />
                                Edit details
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                className="gap-2 rounded-full px-4"
                                onClick={() => router.push(`/dashboard/locations/${store.id}/settings`)}
                            >
                                <Settings className="h-4 w-4" />
                                Tax &amp; banking
                            </Button>
                        </div>
                    </div>
                </div>

                <LocationDetailSheet
                    location={editingLocation}
                    open={isSheetOpen}
                    onOpenChange={handleSheetClose}
                    onUpdate={refetch}
                />
            </div>
        )
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500 w-full min-w-0">

            {/* ── Header ─────────────────────────────────────────────────────── */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <h1 className="text-xl font-semibold tracking-tight">Locations</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Manage your business locations and storefronts
                    </p>
                </div>
                {canCreateLocation && (
                    <Button onClick={() => router.push('/dashboard/locations/new')} size="sm" className="gap-2 rounded-full px-4 self-start sm:self-auto shrink-0">
                        <Plus className="h-4 w-4" />
                        Add Location
                    </Button>
                )}
            </div>

            {/* ── Stats ──────────────────────────────────────────────────────── */}
            {/* One container holding all three stat columns, matching the
                dashboard Overview shell rather than three separate boxes. */}
            <div className="grid grid-cols-2 sm:grid-cols-3 overflow-hidden rounded-2xl border bg-card">
                {[
                    { label: 'Active', value: activeLocations.length, icon: CheckCircle, color: 'text-emerald-500' },
                    { label: 'Archived', value: archivedLocations.length, icon: Archive, color: 'text-muted-foreground' },
                    { label: 'Taking Orders', value: acceptingOrders, icon: MapPin, color: 'text-primary' },
                ].map(stat => (
                    <div key={stat.label} className="px-6 py-5">
                        <div className="flex items-center gap-2 text-[0.9375rem] text-muted-foreground">
                            <stat.icon className={cn("h-4 w-4 shrink-0", stat.color)} />
                            {stat.label}
                        </div>
                        <p className="mt-1 text-[2rem] font-medium leading-tight tracking-[-0.02em] tabular-nums">
                            {isLoading ? '—' : stat.value}
                        </p>
                    </div>
                ))}
            </div>

            {/* ── Active location banner ──────────────────────────────────────── */}
            {selectedLocationId !== 'all' && (
                <div className="flex items-center justify-between rounded-xl bg-primary/5 px-4 py-2.5 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="flex items-center gap-2 text-sm min-w-0">
                        <CheckCircle className="h-4 w-4 text-primary shrink-0" />
                        <span className="text-muted-foreground shrink-0">Viewing</span>
                        <span className="font-medium text-foreground truncate">
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
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full min-w-0">
                {/* Status filter tabs */}
                <div className="overflow-x-auto w-full sm:w-auto shrink-0">
                <div className="flex items-center gap-0.5 rounded-full bg-muted/70 p-1 w-fit">
                    {([
                        { key: 'active', label: `Active (${activeLocations.length})` },
                        { key: 'archived', label: `Archived (${archivedLocations.length})` },
                        { key: 'all', label: 'All' },
                    ] as { key: StatusFilter; label: string }[]).map(tab => (
                        <button
                            key={tab.key}
                            type="button"
                            className={cn(
                                "shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-medium transition-colors",
                                statusFilter === tab.key
                                    ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                            onClick={() => setStatusFilter(tab.key)}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
                </div>

                <div className="relative flex-1 w-full sm:w-auto">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                        placeholder="Search locations..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9 w-full"
                    />
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center gap-0.5 rounded-full bg-muted/70 p-1">
                        <Button
                            variant="ghost"
                            size="sm"
                            className={cn("h-8 w-8 p-0 rounded-full", viewMode === 'grid' && "bg-background shadow-sm ring-1 ring-border text-foreground")}
                            onClick={() => setViewMode('grid')}
                        >
                            <LayoutGrid className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            className={cn("h-8 w-8 p-0 rounded-full", viewMode === 'list' && "bg-background shadow-sm ring-1 ring-border text-foreground")}
                            onClick={() => setViewMode('list')}
                        >
                            <List className="h-4 w-4" />
                        </Button>
                    </div>
                    <p className="text-sm text-muted-foreground whitespace-nowrap hidden lg:block">
                        {isLoading ? '' : `${filteredLocations.length} location${filteredLocations.length !== 1 ? 's' : ''}`}
                    </p>
                </div>
            </div>

            {/* ── Content ────────────────────────────────────────────────────── */}
            {isLoading ? (
                viewMode === 'grid' ? (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {[1, 2, 3].map(i => <Skeleton key={i} className="h-52 w-full rounded-2xl" />)}
                    </div>
                ) : (
                    <div className="space-y-2">
                        {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full rounded-2xl" />)}
                    </div>
                )
            ) : filteredLocations.length === 0 ? (
                <div className="rounded-2xl border bg-card">
                    <Empty
                        icon={MapPin}
                        title={statusFilter === 'archived' ? "No archived locations" : locationsList.length === 0 ? "No locations yet" : "No locations found"}
                        description={
                            statusFilter === 'archived'
                                ? "Archived locations will appear here"
                                : locationsList.length === 0
                                    ? canCreateLocation
                                        ? "Get started by adding your first business location"
                                        : "Contact your admin to add a location"
                                    : "Try adjusting your search or filter"
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
                                "group relative rounded-2xl border bg-card p-6 overflow-hidden",
                                "transition-all duration-150",
                                "animate-in fade-in slide-in-from-bottom-3",
                                location.is_active
                                    ? "cursor-pointer hover:border-primary/30"
                                    : "opacity-60 cursor-default",
                                isSelected(location.id) && "border-primary ring-1 ring-primary bg-primary/2"
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
                                        <p className="text-[1.0625rem] font-medium leading-tight tracking-[-0.01em] truncate">
                                            {location.name}
                                        </p>
                                        {location.code && (
                                            <p className="text-[0.8125rem] text-muted-foreground font-mono mt-1">{location.code}</p>
                                        )}
                                    </div>
                                </div>
                                <ActionButtons location={location} compact />
                            </div>

                            {/* Address */}
                            <div className="flex items-start gap-2 mb-3">
                                <Building2 className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                                <div className="text-sm text-muted-foreground leading-snug min-w-0">
                                    <p className="truncate">{location.address_line1}</p>
                                    <p className="truncate">{location.city}, {location.state} {location.postal_code}</p>
                                </div>
                            </div>

                            {/* Contact row */}
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mb-4">
                                {location.phone && (
                                    <span className="flex items-center gap-1">
                                        <Phone className="h-3 w-3" />{formatPhoneForDisplay(location.phone)}
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
                                {!location.is_active ? (
                                    <Badge variant="secondary" className="text-xs px-2 py-0 gap-1">
                                        <Archive className="h-2.5 w-2.5" />
                                        Archived
                                    </Badge>
                                ) : (
                                    <Badge variant="default" className="text-xs px-2 py-0">Active</Badge>
                                )}
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
                <div className="rounded-2xl border bg-card overflow-hidden">
                    {filteredLocations.map((location, index) => (
                        <div
                            key={location.id}
                            className={cn(
                                "group flex items-center gap-4 px-5 py-4",
                                "transition-colors animate-in fade-in",
                                location.is_active
                                    ? "cursor-pointer hover:bg-muted/40"
                                    : "opacity-60 cursor-default",
                                isSelected(location.id) && "bg-primary/3 border-l-2 border-l-primary"
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
                                {!location.is_active ? (
                                    <Badge variant="secondary" className="text-xs px-2 py-0 gap-1">
                                        <Archive className="h-2.5 w-2.5" />
                                        Archived
                                    </Badge>
                                ) : (
                                    <>
                                        <Badge variant="default" className="text-xs px-2 py-0">Active</Badge>
                                        {location.is_accepting_orders && (
                                            <Badge className="text-xs px-2 py-0 bg-emerald-600 hover:bg-emerald-600">
                                                Taking Orders
                                            </Badge>
                                        )}
                                    </>
                                )}
                            </div>

                            {/* Actions */}
                            <ActionButtons location={location} compact />
                        </div>
                    ))}
                </div>
            )}

            {/* ── Archive confirmation dialog ─────────────────────────────────── */}
            <Dialog open={!!archivingLocation} onOpenChange={(open) => !open && setArchivingLocation(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Archive className="h-5 w-5 text-amber-600" />
                            Archive Location
                        </DialogTitle>
                        <DialogDescription>
                            Archive <strong>{archivingLocation?.name}</strong>? This location will stop accepting orders,
                            staff scoped only here will be deactivated, and any open cash drawer sessions will be flagged for
                            close-out. Historical reports will still include this location&apos;s data.
                            You can restore it at any time.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setArchivingLocation(null)} disabled={isArchiving}>
                            Cancel
                        </Button>
                        <Button
                            variant="default"
                            className="bg-amber-600 hover:bg-amber-700 text-white"
                            onClick={handleArchive}
                            disabled={isArchiving}
                        >
                            {isArchiving
                                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Archiving…</>
                                : <><Archive className="h-4 w-4 mr-2" />Archive Location</>
                            }
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
