'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Layers, Plus, Search, Edit3, Trash2, Settings2, Utensils, Eye, EyeOff, MapPin } from 'lucide-react'
import { useState } from 'react'
import {
    useLocationScopedModifierGroups,
    useIsAllLocations,
    useSelectedLocation,
    useDeleteModifierGroupMutation,
    useModifierGroupVisibilityMutation
} from '../../hooks/useLocationScopedModifiers'
import { useUserInfo } from '../../../manage/hooks/useUserInfo.'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Empty } from '@/components/ui/empty'
import { ModifierGroupFormSheet } from '@/components/dashboard/menu/ModifierGroupFormSheet'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ChevronDown } from 'lucide-react'
import { updateModifierGroup, updateModifierItem } from '../../actions/menu-items-rpc'
import { toast } from 'sonner'
import { Loader2, Sparkles } from 'lucide-react'

export default function ModifiersPage() {
    const { data: userInfo } = useUserInfo()
    const clerkOrgId = userInfo?.members?.[0]?.organizations?.id
    const isAllLocations = useIsAllLocations()
    const selectedLocation = useSelectedLocation()

    const { data: modifierGroups, isLoading, refetch } = useLocationScopedModifierGroups()
    const deleteGroupMutation = useDeleteModifierGroupMutation()
    const visibilityMutation = useModifierGroupVisibilityMutation()

    const [searchTerm, setSearchTerm] = useState('')
    const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false)
    const [editingGroup, setEditingGroup] = useState<any>(null)
    const [deletingGroup, setDeletingGroup] = useState<any>(null)
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})
    const [modifierDrafts, setModifierDrafts] = useState<Record<string, { price?: number | null; isActive?: boolean; isSaving?: boolean }>>({})
    const [groupDrafts, setGroupDrafts] = useState<Record<string, { isActive?: boolean; isSaving?: boolean }>>({})

    const groupsList = Array.isArray(modifierGroups) ? modifierGroups : []
    const filteredGroups = groupsList.filter(group =>
        group.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        group.description?.toLowerCase().includes(searchTerm.toLowerCase())
    )

    const requiredGroups = groupsList.filter(g => g.is_required).length
    const optionalGroups = groupsList.filter(g => !g.is_required).length
    const totalOptions = groupsList.reduce((acc, g) => acc + (g.modifier_group_items?.length || 0), 0)

    const toggleExpand = (groupId: string) => {
        setExpandedGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }))
    }

    const setModifierDraft = (id: string, patch: Partial<{ price: number | null; isActive: boolean; isSaving: boolean }>) => {
        setModifierDrafts(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }))
    }

    const setGroupDraft = (id: string, patch: Partial<{ isActive: boolean; isSaving: boolean }>) => {
        setGroupDrafts(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }))
    }

    const handleDelete = async () => {
        if (!deletingGroup) return
        deleteGroupMutation.mutate(deletingGroup.id, {
            onSuccess: () => {
                setDeletingGroup(null)
            }
        })
    }

    const handleToggleVisibility = (groupId: string, isActive: boolean) => {
        visibilityMutation.mutate({ modifierGroupId: groupId, isActive })
    }

    const handleGroupActiveChange = async (group: any, isActive: boolean) => {
        const locId = isAllLocations ? null : selectedLocation?.id || null
        setGroupDraft(group.id, { isActive, isSaving: true })
        try {
            const result = await updateModifierGroup({
                modifierGroupId: group.id,
                isActive,
                locationId: locId || undefined,
            })
            if (!result.success) {
                toast.error('Failed to update group', { description: result.error })
                return
            }
            toast.success('Group updated', {
                description: locId ? 'Location override saved' : 'Global group updated',
            })
            refetch()
        } catch (error) {
            toast.error('Failed to update group', { description: 'Please try again.' })
        } finally {
            setGroupDraft(group.id, { isSaving: false })
        }
    }

    const handleSaveModifierItem = async (item: any) => {
        const draft = modifierDrafts[item.id] || {}
        const price = draft.price !== undefined ? draft.price : (item.location_override?.price_modifier ?? item.price_modifier ?? 0)
        const isActive = draft.isActive !== undefined ? draft.isActive : (item.location_override?.is_active ?? item.is_active ?? true)
        const locId = isAllLocations ? null : selectedLocation?.id || null

        setModifierDraft(item.id, { isSaving: true })
        try {
            const result = await updateModifierItem({
                modifierItemId: item.id,
                priceModifier: price,
                isActive,
                locationId: locId || undefined,
            })
            if (!result.success) {
                toast.error('Failed to update option', { description: result.error })
                return
            }
            toast.success('Option updated', {
                description: locId ? 'Location override saved' : 'Global option updated',
            })
            refetch()
        } catch (error) {
            toast.error('Failed to update option', { description: 'Please try again.' })
        } finally {
            setModifierDraft(item.id, { isSaving: false })
        }
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Modifier Groups</h2>
                    <p className="text-muted-foreground">
                        Manage customization options for your menu items
                        {!isAllLocations && selectedLocation && (
                            <Badge variant="secondary" className="ml-2">
                                {selectedLocation.name}
                            </Badge>
                        )}
                    </p>
                </div>
                <Button onClick={() => setIsCreateSheetOpen(true)} className="gap-2">
                    <Plus className="h-4 w-4" />
                    {isAllLocations ? 'Create Global Group' : 'Create Location Group'}
                </Button>
            </div>

            {/* Stats Overview */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card className="transition-all hover:shadow-md">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Groups</CardTitle>
                        <Layers className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{groupsList.length}</div>
                        <p className="text-xs text-muted-foreground">
                            Modifier groups
                        </p>
                    </CardContent>
                </Card>
                <Card className="transition-all hover:shadow-md">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Required</CardTitle>
                        <Settings2 className="h-4 w-4 text-red-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-600">{requiredGroups}</div>
                        <p className="text-xs text-muted-foreground">
                            Must select options
                        </p>
                    </CardContent>
                </Card>
                <Card className="transition-all hover:shadow-md">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Optional</CardTitle>
                        <Settings2 className="h-4 w-4 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-blue-600">{optionalGroups}</div>
                        <p className="text-xs text-muted-foreground">
                            Optional selections
                        </p>
                    </CardContent>
                </Card>
                <Card className="transition-all hover:shadow-md">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Options</CardTitle>
                        <Layers className="h-4 w-4 text-purple-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-purple-600">{totalOptions}</div>
                        <p className="text-xs text-muted-foreground">
                            Across all groups
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Modifier Groups List */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>All Modifier Groups</CardTitle>
                            <CardDescription>Click to expand and see options</CardDescription>
                        </div>
                        <div className="relative">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search modifier groups..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-8 w-64"
                            />
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="space-y-3">
                            {[1, 2, 3, 4].map((i) => (
                                <Skeleton key={i} className="h-24 w-full" />
                            ))}
                        </div>
                    ) : filteredGroups.length === 0 ? (
                        <Empty
                            icon={Layers}
                            title={groupsList.length === 0 ? "No modifier groups yet" : "No groups found"}
                            description={
                                groupsList.length === 0
                                    ? "Create modifier groups to let customers customize their orders"
                                    : "Try adjusting your search terms"
                            }
                            action={
                                groupsList.length === 0 ? (
                                    <Button onClick={() => setIsCreateSheetOpen(true)}>
                                        <Plus className="h-4 w-4 mr-2" />
                                        Create Modifier Group
                                    </Button>
                                ) : null
                            }
                        />
                    ) : (
                        <div className="space-y-3">
                            {filteredGroups.map((group, index) => {
                                const isGlobal = !group.location_id
                                const isLocationSpecific = !!group.location_id
                                const hasLocationOverride = group.location_override && group.location_override.length > 0
                                const locationOverride = hasLocationOverride ? group.location_override?.[0] : null
                                const effectiveIsActive = locationOverride ? locationOverride.is_active : true
                                return (
                                    <Collapsible
                                        key={group.id}
                                        open={expandedGroups[group.id]}
                                        onOpenChange={() => toggleExpand(group.id)}
                                    >
                                        <Card
                                            className={cn(
                                                "transition-all hover:shadow-md animate-in fade-in slide-in-from-left-4",
                                                expandedGroups[group.id] && "ring-2 ring-primary/20",
                                                !effectiveIsActive && !isAllLocations && "opacity-50"
                                            )}
                                            style={{ animationDelay: `${index * 50}ms` }}
                                        >
                                            <CollapsibleTrigger asChild>
                                                <CardContent className="p-4 cursor-pointer">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-4 flex-1">
                                                            <div className="h-12 w-12 rounded-lg bg-purple-500/10 flex items-center justify-center">
                                                                <Layers className="h-6 w-6 text-purple-500" />
                                                            </div>
                                                            <div className="flex-1">
                                                                <div className="font-semibold flex items-center gap-2 flex-wrap">
                                                                    {group.name}
                                                                    {group.is_required && (
                                                                        <Badge variant="destructive" className="text-xs">Required</Badge>
                                                                    )}
                                                                    {isGlobal && (
                                                                        <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                                                                            Global
                                                                        </Badge>
                                                                    )}
                                                                    {isLocationSpecific && (
                                                                        <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                                                                            <MapPin className="h-3 w-3 mr-1" />
                                                                            {group?.location_name?.name}
                                                                        </Badge>
                                                                    )}
                                                                    {hasLocationOverride && !isLocationSpecific && (
                                                                        <Badge variant="default" className="text-xs bg-yellow-100 text-yellow-800 border-yellow-300">
                                                                            Custom at Location
                                                                        </Badge>
                                                                    )}
                                                                    {!effectiveIsActive && !isAllLocations && (
                                                                        <Badge variant="outline" className="text-xs text-muted-foreground">
                                                                            Hidden Here
                                                                        </Badge>
                                                                    )}
                                                                </div>
                                                                {group.description && (
                                                                    <div className="text-sm text-muted-foreground line-clamp-1">
                                                                        {group.description}
                                                                    </div>
                                                                )}
                                                                <div className="flex flex-wrap gap-1 mt-2">
                                                                    {group.modifier_group_items?.slice(0, 5).map((item) => (
                                                                        <Badge key={item.id} variant="outline" className="text-xs">
                                                                            {item.name}
                                                                            {item.price_modifier > 0 && (
                                                                                <span className="text-green-600 ml-1">+${item.price_modifier}</span>
                                                                            )}
                                                                        </Badge>
                                                                    ))}
                                                                    {(group.modifier_group_items?.length || 0) > 5 && (
                                                                        <Badge variant="outline" className="text-xs">
                                                                            +{(group.modifier_group_items?.length || 0) - 5} more
                                                                        </Badge>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-3">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-xs text-muted-foreground">Active</span>
                                                                <Switch
                                                                    checked={groupDrafts[group.id]?.isActive ?? effectiveIsActive}
                                                                    disabled={groupDrafts[group.id]?.isSaving}
                                                                    onCheckedChange={(checked) => handleGroupActiveChange(group, checked)}
                                                                />
                                                            </div>
                                                            <div className="text-right text-sm text-muted-foreground">
                                                                {group.modifier_group_items?.length || 0} options
                                                            </div>
                                                            <ChevronDown className={cn(
                                                                "h-5 w-5 text-muted-foreground transition-transform duration-200",
                                                                expandedGroups[group.id] && "rotate-180"
                                                            )} />
                                                        </div>
                                                    </div>
                                                </CardContent>
                                            </CollapsibleTrigger>

                                            <CollapsibleContent>
                                                <div className="px-4 pb-4 pt-0 border-t">
                                                    {/* Options List */}
                                                    <div className="mt-4 space-y-2">
                                                        <h4 className="text-sm font-medium text-muted-foreground">Options</h4>
                                                        {group.modifier_group_items && group.modifier_group_items.length > 0 ? (
                                                            <div className="space-y-3">
                                                                {group.modifier_group_items.map((item) => {
                                                                    const draft = modifierDrafts[item.id] || {}
                                                                    const price = draft.price !== undefined ? draft.price : (item.location_override?.price_modifier ?? item.price_modifier ?? 0)
                                                                    const isActive = draft.isActive !== undefined ? draft.isActive : (item.location_override?.is_active ?? item.is_active ?? true)
                                                                    const isSaving = draft.isSaving
                                                                    const scopeBadge = isAllLocations ? 'Global' : 'Location Override'

                                                                    return (
                                                                        <div
                                                                            key={item.id}
                                                                            className="p-3 rounded-lg border bg-muted/40 space-y-2"
                                                                        >
                                                                            <div className="flex items-center justify-between gap-2">
                                                                                <div>
                                                                                    <div className="flex items-center gap-2 font-medium">
                                                                                        {item.name}
                                                                                        {item?.is_default && (
                                                                                            <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                                                                                                Default
                                                                                            </Badge>
                                                                                        )}
                                                                                    </div>
                                                                                    {item.description && (
                                                                                        <div className="text-xs text-muted-foreground">{item.description}</div>
                                                                                    )}
                                                                                </div>
                                                                                <Badge variant="outline" className="text-[10px]">
                                                                                    {scopeBadge}
                                                                                </Badge>
                                                                            </div>

                                                                            <div className="grid gap-3 md:grid-cols-3 items-center">
                                                                                <div>
                                                                                    <div className="text-xs text-muted-foreground mb-1">Price Modifier</div>
                                                                                    <div className="relative">
                                                                                        <span className="absolute left-2 top-2 text-muted-foreground text-sm">$</span>
                                                                                        <Input
                                                                                            className="pl-6 h-9"
                                                                                            type="number"
                                                                                            step="0.01"
                                                                                            value={price ?? ''}
                                                                                            onChange={(e) => {
                                                                                                const val = e.target.value
                                                                                                setModifierDraft(item.id, { price: val === '' ? null : parseFloat(val) })
                                                                                            }}
                                                                                        />
                                                                                    </div>
                                                                                </div>

                                                                                <div className="flex items-center gap-2">
                                                                                    <div className="text-xs text-muted-foreground">Active</div>
                                                                                    <Switch
                                                                                        checked={!!isActive}
                                                                                        onCheckedChange={(checked) => setModifierDraft(item.id, { isActive: checked })}
                                                                                    />
                                                                                </div>

                                                                                <div className="flex justify-end">
                                                                                    <Button
                                                                                        size="sm"
                                                                                        onClick={() => handleSaveModifierItem(item)}
                                                                                        disabled={isSaving}
                                                                                        className="gap-2"
                                                                                    >
                                                                                        {isSaving ? (
                                                                                            <>
                                                                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                                                                Saving...
                                                                                            </>
                                                                                        ) : (
                                                                                            <>
                                                                                                <Sparkles className="h-4 w-4" />
                                                                                                Save
                                                                                            </>
                                                                                        )}
                                                                                    </Button>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    )
                                                                })}
                                                            </div>
                                                        ) : (
                                                            <p className="text-sm text-muted-foreground">No options added yet</p>
                                                        )}
                                                    </div>

                                                    {/* Used by Items */}
                                                    {group.menu_item_modifier_groups && group.menu_item_modifier_groups.length > 0 && (
                                                        <div className="mt-4 space-y-2">
                                                            <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                                                <Utensils className="h-4 w-4" />
                                                                Used by {group.menu_item_modifier_groups.length} item(s)
                                                            </h4>
                                                            <div className="flex flex-wrap gap-2">
                                                                {group.menu_item_modifier_groups.slice(0, 8).map((assignment: any) => (
                                                                    <Badge key={assignment.id} variant="secondary">
                                                                        {assignment.menu_item?.name || 'Unknown Item'}
                                                                    </Badge>
                                                                ))}
                                                                {group.menu_item_modifier_groups.length > 8 && (
                                                                    <Badge variant="outline">
                                                                        +{group.menu_item_modifier_groups.length - 8} more
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Selection Rules */}
                                                    <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
                                                        <span>
                                                            Select: {group.min_selections > 0 ? group.min_selections : 'Any'}
                                                            {group.max_selections ? ` - ${group.max_selections}` : group.min_selections > 0 ? '+' : ''}
                                                        </span>
                                                    </div>

                                                    {/* Actions */}
                                                    <div className="mt-4 flex items-center gap-2">
                                                        {/* Hide/Show button for global groups at specific location */}
                                                        {!isAllLocations && isGlobal && (
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={(e) => {
                                                                    e.stopPropagation()
                                                                    handleToggleVisibility(group.id, !effectiveIsActive)
                                                                }}
                                                            >
                                                                {effectiveIsActive ? (
                                                                    <>
                                                                        <EyeOff className="h-4 w-4 mr-1" />
                                                                        Hide Here
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <Eye className="h-4 w-4 mr-1" />
                                                                        Show Here
                                                                    </>
                                                                )}
                                                            </Button>
                                                        )}

                                                        {/* Edit button - disabled for location-specific groups when viewing all locations */}
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={(e) => {
                                                                e.stopPropagation()
                                                                setEditingGroup(group)
                                                            }}
                                                            disabled={isLocationSpecific && isAllLocations}
                                                        >
                                                            <Edit3 className="h-4 w-4 mr-1" />
                                                            Edit
                                                        </Button>

                                                        {/* Delete button - disabled for location-specific groups when viewing all locations */}
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={(e) => {
                                                                e.stopPropagation()
                                                                setDeletingGroup(group)
                                                            }}
                                                            className="text-destructive hover:text-destructive"
                                                            disabled={(isLocationSpecific && isAllLocations) || (group.location_id == null && selectedLocation?.id != null)}
                                                        >
                                                            <Trash2 className="h-4 w-4 mr-1" />
                                                            Delete
                                                        </Button>
                                                    </div>
                                                </div>
                                            </CollapsibleContent>
                                        </Card>
                                    </Collapsible>
                                )
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Create/Edit Sheet */}
            <ModifierGroupFormSheet
                open={isCreateSheetOpen || !!editingGroup}
                onOpenChange={(open) => {
                    if (!open) {
                        setIsCreateSheetOpen(false)
                        setEditingGroup(null)
                    }
                }}
                clerkOrgId={clerkOrgId}
                editGroup={editingGroup}
                onSuccess={() => {
                    setIsCreateSheetOpen(false)
                    setEditingGroup(null)
                    refetch()
                }}
            />

            {/* Delete Confirmation Dialog */}
            <Dialog open={!!deletingGroup} onOpenChange={(open) => !open && setDeletingGroup(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete Modifier Group</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete "{deletingGroup?.name}"? This will remove all options and unlink it from any menu items. This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeletingGroup(null)}>
                            Cancel
                        </Button>
                        <Button variant="destructive" onClick={handleDelete}>
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}

