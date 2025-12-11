'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Power, Settings, Info, AlertTriangle, Save, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MenuWithCategories } from '@/types/menu'

interface MenuSettingsTabProps {
    menu: MenuWithCategories
    categoriesCount: number
    totalItems: number
    editedName: string
    editedDescription: string
    hasSettingsChanges: boolean
    isTogglingActive: boolean
    isSavingSettings: boolean
    selectedLocationId: string | null
    onNameChange: (name: string) => void
    onDescriptionChange: (description: string) => void
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
    hasSettingsChanges,
    isTogglingActive,
    isSavingSettings,
    selectedLocationId,
    onNameChange,
    onDescriptionChange,
    onToggleActive,
    onSaveSettings,
    onCancelSettings,
    onDeleteMenu,
}: MenuSettingsTabProps) {
    return (
        <div className="space-y-4">
            {/* Status Card */}
            <Card className={cn(
                "transition-all",
                menu.is_active
                    ? "border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20"
                    : "border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20"
            )}>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className={cn(
                                "h-10 w-10 rounded-lg flex items-center justify-center",
                                menu.is_active
                                    ? "bg-green-500/20 text-green-600"
                                    : "bg-amber-500/20 text-amber-600"
                            )}>
                                <Power className="h-5 w-5" />
                            </div>
                            <div>
                                <CardTitle className="text-base">Menu Status</CardTitle>
                                <CardDescription>
                                    {menu.is_active
                                        ? 'This menu is currently active and visible to customers'
                                        : 'This menu is currently inactive and hidden from customers'
                                    }
                                </CardDescription>
                            </div>
                        </div>
                        <Badge
                            variant={menu.is_active ? "default" : "secondary"}
                            className={cn(
                                "text-sm px-3 py-1",
                                menu.is_active
                                    ? "bg-green-500 hover:bg-green-600"
                                    : "bg-amber-500 hover:bg-amber-600 text-white"
                            )}
                        >
                            {menu.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                    </div>
                </CardHeader>
                <CardContent>
                    <Button
                        onClick={onToggleActive}
                        disabled={isTogglingActive}
                        variant={menu.is_active ? "outline" : "default"}
                        className={cn(
                            menu.is_active
                                ? "border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-400"
                                : "bg-green-600 hover:bg-green-700"
                        )}
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
                </CardContent>
            </Card>

            {/* General Settings */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Settings className="h-5 w-5" />
                        General Settings
                    </CardTitle>
                    <CardDescription>Update menu name and description</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
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
                </CardContent>
            </Card>

            {/* Info Card */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Info className="h-4 w-4" />
                        Menu Information
                    </CardTitle>
                </CardHeader>
                <CardContent>
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
                </CardContent>
            </Card>

            {/* Danger Zone */}
            <Card className="border-destructive/50">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-destructive">
                        <AlertTriangle className="h-5 w-5" />
                        Danger Zone
                    </CardTitle>
                    <CardDescription>
                        Irreversible actions for this menu
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-between p-4 rounded-lg bg-destructive/5 border border-destructive/20">
                        <div>
                            <h4 className="font-medium text-destructive">Delete Menu</h4>
                            <p className="text-sm text-muted-foreground">
                                Permanently delete this menu and all its associations
                            </p>
                        </div>
                        <Button
                            variant="destructive"
                            disabled={selectedLocationId !== 'all'}
                            onClick={onDeleteMenu}
                        >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete Menu
                        </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-3">
                        * Deletion is only available when viewing all locations.
                    </p>
                </CardContent>
            </Card>
        </div>
    )
}

