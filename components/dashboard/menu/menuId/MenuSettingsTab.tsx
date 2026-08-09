'use client'

import { Panel, PanelSection } from '@/components/dashboard/shell'
import { Button } from '@/components/ui/button'
import { CdnImageUploadField } from '@/components/ui/cdn-image-upload-field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Power, Settings, Info, AlertTriangle, Save, Trash2, Globe, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MenuWithCategories } from '@/types/menu'
import { LocationsModel } from '@/types/db-modles'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'

interface MenuSettingsTabProps {
    menu: MenuWithCategories
    categoriesCount: number
    totalItems: number
    editedName: string
    editedDescription: string
    editedLocationId: string | null
    hasSettingsChanges: boolean
    imagePreviewUrl: string | null
    isImageUploading: boolean
    isTogglingActive: boolean
    isSavingSettings: boolean
    selectedImageFileName?: string | null
    selectedLocationId: string | null
    locations: LocationsModel[]
    onClearImage: () => void
    onImageSelect: (file: File | null) => void
    onNameChange: (name: string) => void
    onDescriptionChange: (description: string) => void
    onLocationChange: (locationId: string | null) => void
    onToggleActive: () => void
    onSaveSettings: () => void
    onCancelSettings: () => void
    onDeleteMenu: () => void
}

export function MenuSettingsTab({
    menu,
    categoriesCount,
    totalItems,
    editedName,
    editedDescription,
    editedLocationId,
    hasSettingsChanges,
    imagePreviewUrl,
    isImageUploading,
    isTogglingActive,
    isSavingSettings,
    selectedImageFileName,
    selectedLocationId,
    locations,
    onClearImage,
    onImageSelect,
    onNameChange,
    onDescriptionChange,
    onLocationChange,
    onToggleActive,
    onSaveSettings,
    onCancelSettings,
    onDeleteMenu,
}: MenuSettingsTabProps) {
    const currentLocation = editedLocationId
        ? locations.find(l => l.id === editedLocationId)
        : null

    const isGlobal = editedLocationId === null

    return (
        <Panel>
            {/* Status */}
            <PanelSection
                icon={Power}
                label="Menu Status"
                caption={
                    menu.is_active
                        ? 'This menu is currently active and visible to customers'
                        : 'This menu is currently inactive and hidden from customers'
                }
                action={
                    /* Soft tint + dot, not a solid saturated fill (D-11). */
                    <span className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
                        menu.is_active
                            ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
                            : "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400"
                    )}>
                        <span className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            menu.is_active ? "bg-green-500" : "bg-amber-500"
                        )} />
                        {menu.is_active ? 'Active' : 'Inactive'}
                    </span>
                }
            >
                <Button
                    onClick={onToggleActive}
                    disabled={isTogglingActive}
                    variant="outline"
                    className="rounded-full"
                >
                    {isTogglingActive ? (
                        <>
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            Updating...
                        </>
                    ) : (
                        <>
                            <Power className="h-4 w-4 mr-2" />
                            {menu.is_active ? 'Deactivate Menu' : 'Activate Menu'}
                        </>
                    )}
                </Button>
            </PanelSection>

            {/* Menu Scope */}
            <PanelSection
                icon={isGlobal ? Globe : MapPin}
                label="Menu Scope"
                caption="Control which location this menu belongs to. Global menus are available across all locations."
            >
                {/* Rhythm lives on this wrapper, not on the section: PanelSection's
                    own `space-y` would only separate its heading from its body,
                    leaving the fields inside to collide with their labels. */}
                <div className="space-y-6">
                    {/* Current scope indicator — tier-3 inset, borderless tinted fill */}
                    <div className="flex items-center gap-3 rounded-2xl border-0 bg-muted/60 p-4 shadow-none">
                        <div className={cn(
                            "h-9 w-9 rounded-full flex items-center justify-center shrink-0",
                            isGlobal
                                ? "bg-blue-500/15 text-blue-600 dark:text-blue-400"
                                : "bg-orange-500/15 text-orange-600 dark:text-orange-400"
                        )}>
                            {isGlobal ? <Globe className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}
                        </div>
                        <div className="min-w-0">
                            <p className="text-sm font-medium">
                                {isGlobal ? 'Global Menu' : currentLocation?.name ?? 'Unknown Location'}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                                {isGlobal
                                    ? 'Visible at all locations'
                                    : currentLocation
                                        ? `${currentLocation.address_line1}, ${currentLocation.city}`
                                        : 'Location not found'
                                }
                            </p>
                        </div>
                        <span className={cn(
                            "ml-auto shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                            isGlobal
                                ? "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400"
                                : "bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400"
                        )}>
                            {isGlobal ? 'Global' : 'Location-specific'}
                        </span>
                    </div>

                    {/* Location selector */}
                    <div className="space-y-2">
                        <Label>Assign to</Label>
                        <Select
                            value={editedLocationId ?? 'global'}
                            onValueChange={(val) => onLocationChange(val === 'global' ? null : val)}
                            disabled={isSavingSettings}
                        >
                            <SelectTrigger className="h-9 max-w-sm rounded-full border-0 bg-muted/60 px-4 text-[0.8125rem] shadow-none">
                                <SelectValue placeholder="Select location..." />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="global">
                                    <div className="flex items-center gap-2">
                                        <Globe className="h-4 w-4 text-blue-500" />
                                        <span>Global (all locations)</span>
                                    </div>
                                </SelectItem>
                                {locations.map(loc => (
                                    <SelectItem key={loc.id} value={loc.id}>
                                        <div className="flex items-center gap-2">
                                            <MapPin className="h-4 w-4 text-orange-500" />
                                            <span>{loc.name}</span>
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {editedLocationId !== (menu.location_id ?? null) && (
                            <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                {editedLocationId === null
                                    ? 'Changing to global will make this menu available at all locations.'
                                    : 'Changing to a specific location will restrict this menu to that location only.'
                                }
                            </p>
                        )}
                    </div>
                </div>
            </PanelSection>

            {/* General Settings */}
            <PanelSection
                icon={Settings}
                label="General Settings"
                caption="Update menu name and description"
            >
                <div className="space-y-6">
                    <div className="space-y-2">
                        <Label htmlFor="menu-name">Menu Name</Label>
                        <Input
                            id="menu-name"
                            value={editedName}
                            onChange={(e) => onNameChange(e.target.value)}
                            placeholder="Enter menu name"
                            className="max-w-md"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="menu-description">Description</Label>
                        <Input
                            id="menu-description"
                            value={editedDescription}
                            onChange={(e) => onDescriptionChange(e.target.value)}
                            placeholder="Enter menu description (optional)"
                            className="max-w-md"
                        />
                    </div>
                    <div className="space-y-2 max-w-md">
                        <Label>Menu Image</Label>
                        <CdnImageUploadField
                            disabled={isSavingSettings}
                            helperText="Uploads to Bunny CDN when you save the menu."
                            onClear={onClearImage}
                            onFileSelect={onImageSelect}
                            previewUrl={imagePreviewUrl}
                            selectedFileName={selectedImageFileName}
                            uploadLabel="Upload menu image"
                            uploading={isImageUploading}
                        />
                    </div>

                    {hasSettingsChanges && (
                        <div className="flex items-center gap-3 pt-2 animate-in fade-in slide-in-from-bottom-2">
                            <Button
                                onClick={onSaveSettings}
                                disabled={isSavingSettings || !editedName.trim()}
                            >
                                {isSavingSettings ? (
                                    <>
                                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                        </svg>
                                        Saving...
                                    </>
                                ) : (
                                    <>
                                        <Save className="h-4 w-4 mr-2" />
                                        Save Changes
                                    </>
                                )}
                            </Button>
                            <Button
                                variant="ghost"
                                onClick={onCancelSettings}
                                disabled={isSavingSettings}
                            >
                                Cancel
                            </Button>
                        </div>
                    )}
                </div>
            </PanelSection>

            {/* Menu Information */}
            <PanelSection icon={Info} label="Menu Information">
                    <div className="grid gap-4 md:grid-cols-2 text-sm">
                        <div className="space-y-1">
                            <span className="text-muted-foreground">Created</span>
                            <p className="font-medium">{new Date(menu.created_at).toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                            })}</p>
                        </div>
                        <div className="space-y-1">
                            <span className="text-muted-foreground">Last Updated</span>
                            <p className="font-medium">{new Date(menu.updated_at).toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                            })}</p>
                        </div>
                        <div className="space-y-1">
                            <span className="text-muted-foreground">Categories</span>
                            <p className="font-medium">{categoriesCount} categories</p>
                        </div>
                        <div className="space-y-1">
                            <span className="text-muted-foreground">Items</span>
                            <p className="font-medium">{totalItems} items</p>
                        </div>
                    </div>
            </PanelSection>

            {/* Danger Zone */}
            {/* Destructive section: icon lives in `label` rather than the `icon`
                prop so both it and the text override PanelSection's brand blue
                without a selector that depends on its internal DOM shape.
                Classes literal, not from tokens.ts — see C7. */}
            <PanelSection
                label={
                    <span className="flex items-center gap-2 text-destructive">
                        <AlertTriangle className="h-[1.125rem] w-[1.125rem] shrink-0" />
                        Danger Zone
                    </span>
                }
                caption="Irreversible actions for this menu"
            >
                    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border-0 bg-destructive/5 p-4 shadow-none">
                        <div className="min-w-0">
                            <h4 className="font-medium text-destructive">Delete Menu</h4>
                            <p className="text-sm text-muted-foreground">
                                Permanently delete this menu and all its associations
                            </p>
                        </div>
                        <Button
                            variant="destructive"
                            disabled={selectedLocationId !== 'all'}
                            onClick={onDeleteMenu}
                            className="shrink-0 rounded-full"
                        >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete Menu
                        </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-3">
                        * Deletion is only available when viewing all locations.
                    </p>
            </PanelSection>
        </Panel>
    )
}

