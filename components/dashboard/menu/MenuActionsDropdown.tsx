'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreVertical, Eye, Trash2, Power, Settings, Copy, ExternalLink, Lock, Globe } from 'lucide-react'
import { useLocationStore } from '@/stores/location-store'

interface MenuActionsDropdownProps {
    menuId: string
    menuName: string
    isActive: boolean
    /** The location_id of the menu itself (null = global menu) */
    menuLocationId: string | null
    onToggleActive: (menuId: string) => void
    onDelete: (menuId: string) => void
    /** Duplicate menu - passes menuId and target locationId (null = global) */
    onDuplicate?: (menuId: string, targetLocationId: string | null) => void
    onSettings?: (menuId: string) => void
    align?: 'start' | 'end' | 'center'
    triggerClassName?: string
}

export function MenuActionsDropdown({
    menuId,
    menuName,
    isActive,
    menuLocationId,
    onToggleActive,
    onDelete,
    onDuplicate,
    onSettings,
    align = 'end',
    triggerClassName,
}: MenuActionsDropdownProps) {
    const router = useRouter()
    const { selectedLocationId } = useLocationStore()

    // Determine scope context
    const isViewingAllLocations = selectedLocationId === 'all'
    const isViewingSpecificLocation = !isViewingAllLocations && selectedLocationId
    const isGlobalMenu = menuLocationId === null
    const isMenuOwnedByCurrentLocation = menuLocationId === selectedLocationId

    // Permission logic:
    // - Global menus: Can only be edited/deleted when viewing "All Locations"
    // - Location-specific menus: Can only be edited/deleted by that location's scope
    const canEditOrDelete = isViewingAllLocations || isMenuOwnedByCurrentLocation
    const canDuplicateToLocation = isViewingSpecificLocation && isGlobalMenu && onDuplicate

    const handleViewDetails = (e: React.MouseEvent) => {
        e.stopPropagation()
        router.push(`/dashboard/menu/${menuId}`)
    }

    const handleToggleActive = (e: React.MouseEvent) => {
        e.stopPropagation()
        onToggleActive(menuId)
    }

    const handleDelete = (e: React.MouseEvent) => {
        e.stopPropagation()
        onDelete(menuId)
    }

    const handleDuplicateToLocation = (e: React.MouseEvent) => {
        e.stopPropagation()
        // Duplicate the global menu into the current location
        onDuplicate?.(menuId, selectedLocationId)
    }

    const handleDuplicateGlobal = (e: React.MouseEvent) => {
        e.stopPropagation()
        // Duplicate as a new global menu
        onDuplicate?.(menuId, null)
    }

    const handleSettings = (e: React.MouseEvent) => {
        e.stopPropagation()
        onSettings?.(menuId)
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button
                    variant="ghost"
                    size="icon"
                    className={triggerClassName ?? "h-8 w-8"}
                >
                    <MoreVertical className="h-4 w-4" />
                    <span className="sr-only">Open menu actions for {menuName}</span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={align} className="w-56">
                <DropdownMenuLabel className="flex items-center gap-2">
                    Menu Actions
                    {isGlobalMenu && (
                        <span className="text-xs font-normal text-emerald-600 flex items-center gap-1">
                            <Globe className="h-3 w-3" />
                            Global
                        </span>
                    )}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />

                {/* View Details - Always available */}
                <DropdownMenuItem onClick={handleViewDetails}>
                    <Eye className="mr-2 h-4 w-4" />
                    View Details
                </DropdownMenuItem>

                {/* Open in New Tab - Always available */}
                <DropdownMenuItem onClick={(e) => {
                    e.stopPropagation()
                    window.open(`/dashboard/menu/${menuId}`, '_blank')
                }}>
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Open in New Tab
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                {/* Duplicate to Location - Only for global menus when viewing a specific location */}
                {canDuplicateToLocation && (
                    <DropdownMenuItem onClick={handleDuplicateToLocation}>
                        <Copy className="mr-2 h-4 w-4" />
                        Duplicate to This Location
                    </DropdownMenuItem>
                )}

                {/* Duplicate as Global - Only when viewing all locations and can edit */}
                {onDuplicate && isViewingAllLocations && (
                    <DropdownMenuItem onClick={handleDuplicateGlobal}>
                        <Copy className="mr-2 h-4 w-4" />
                        Duplicate Menu
                    </DropdownMenuItem>
                )}

                {/* Toggle Active Status - Only if can edit */}
                {canEditOrDelete ? (
                    <DropdownMenuItem onClick={handleToggleActive}>
                        <Power className="mr-2 h-4 w-4" />
                        {isActive ? 'Deactivate Menu' : 'Activate Menu'}
                    </DropdownMenuItem>
                ) : (
                    <DropdownMenuItem disabled className="opacity-50">
                        <Lock className="mr-2 h-4 w-4" />
                        {isActive ? 'Deactivate' : 'Activate'}
                        <span className="ml-auto text-xs text-muted-foreground">Global</span>
                    </DropdownMenuItem>
                )}

                {/* Settings - Only if can edit */}
                {onSettings && canEditOrDelete && (
                    <DropdownMenuItem onClick={handleSettings}>
                        <Settings className="mr-2 h-4 w-4" />
                        Menu Settings
                    </DropdownMenuItem>
                )}

                <DropdownMenuSeparator />

                {/* Delete - Only if can edit */}
                {canEditOrDelete ? (
                    <DropdownMenuItem
                        onClick={handleDelete}
                        className="text-destructive focus:text-destructive"
                    >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete Menu
                    </DropdownMenuItem>
                ) : (
                    <DropdownMenuItem disabled className="opacity-50">
                        <Lock className="mr-2 h-4 w-4" />
                        Delete Menu
                        <span className="ml-auto text-xs text-muted-foreground">Global</span>
                    </DropdownMenuItem>
                )}

                {/* Info text for location-scoped users viewing global menus */}
                {!canEditOrDelete && isGlobalMenu && isViewingSpecificLocation && (
                    <>
                        <DropdownMenuSeparator />
                        <div className="px-2 py-1.5 text-xs text-muted-foreground">
                            Global menus can only be modified from "All Locations" view.
                            Duplicate to edit locally.
                        </div>
                    </>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
