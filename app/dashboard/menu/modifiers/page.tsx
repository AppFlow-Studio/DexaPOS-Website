'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Layers, Plus, Search, Edit3, Trash2, Settings2, Utensils } from 'lucide-react'
import { useState } from 'react'
import { useModifierGroups } from '../../hooks/useModifierGroups'
import { useUserInfo } from '../../../manage/hooks/useUserInfo.'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Empty } from '@/components/ui/empty'
import { ModifierGroupFormSheet } from '@/components/dashboard/menu/ModifierGroupFormSheet'
import { DeleteModifierGroup } from '../../actions/modifier-groups'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
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

export default function ModifiersPage() {
    const { data: userInfo } = useUserInfo()
    const clerkOrgId = userInfo?.members?.[0]?.organizations?.id
    const queryClient = useQueryClient()

    const { data: modifierGroups, isLoading, refetch } = useModifierGroups(clerkOrgId)
    const [searchTerm, setSearchTerm] = useState('')
    const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false)
    const [editingGroup, setEditingGroup] = useState<any>(null)
    const [deletingGroup, setDeletingGroup] = useState<any>(null)
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})

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

    const handleDelete = async () => {
        if (!deletingGroup) return

        try {
            const result = await DeleteModifierGroup(deletingGroup.id)
            if (result.error) {
                toast.error('Delete Failed', {
                    description: result.error
                })
                return
            }
            toast.success('Modifier Group Deleted', {
                description: `"${deletingGroup.name}" has been permanently deleted.`
            })
            queryClient.invalidateQueries({ queryKey: ['modifier-groups'] })
            refetch()
        } catch (error) {
            toast.error('Delete Failed', {
                description: 'Unable to delete the modifier group. Please try again.'
            })
        } finally {
            setDeletingGroup(null)
        }
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Modifier Groups</h2>
                    <p className="text-muted-foreground">
                        Manage customization options for your menu items
                    </p>
                </div>
                <Button onClick={() => setIsCreateSheetOpen(true)} className="gap-2">
                    <Plus className="h-4 w-4" />
                    Create Modifier Group
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
                            {filteredGroups.map((group, index) => (
                                <Collapsible
                                    key={group.id}
                                    open={expandedGroups[group.id]}
                                    onOpenChange={() => toggleExpand(group.id)}
                                >
                                    <Card
                                        className={cn(
                                            "transition-all hover:shadow-md animate-in fade-in slide-in-from-left-4",
                                            expandedGroups[group.id] && "ring-2 ring-primary/20"
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
                                                            <div className="font-semibold flex items-center gap-2">
                                                                {group.name}
                                                                {group.is_required && (
                                                                    <Badge variant="destructive" className="text-xs">Required</Badge>
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
                                                        <div className="grid gap-2 md:grid-cols-2">
                                                            {group.modifier_group_items.map((item) => (
                                                                <div
                                                                    key={item.id}
                                                                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                                                                >
                                                                    <div>
                                                                        <div className="font-medium">{item.name}</div>
                                                                        {item.description && (
                                                                            <div className="text-sm text-muted-foreground">{item.description}</div>
                                                                        )}
                                                                    </div>
                                                                    <div className={cn(
                                                                        "font-semibold",
                                                                        item.price_modifier > 0 ? "text-green-600" :
                                                                            item.price_modifier < 0 ? "text-red-500" : "text-muted-foreground"
                                                                    )}>
                                                                        {item.price_modifier !== 0 && (
                                                                            <>
                                                                                {item.price_modifier > 0 ? '+' : ''}${item.price_modifier.toFixed(2)}
                                                                            </>
                                                                        )}
                                                                        {item.price_modifier === 0 && '$0.00'}
                                                                    </div>
                                                                </div>
                                                            ))}
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
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            setEditingGroup(group)
                                                        }}
                                                    >
                                                        <Edit3 className="h-4 w-4 mr-1" />
                                                        Edit
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            setDeletingGroup(group)
                                                        }}
                                                        className="text-destructive hover:text-destructive"
                                                    >
                                                        <Trash2 className="h-4 w-4 mr-1" />
                                                        Delete
                                                    </Button>
                                                </div>
                                            </div>
                                        </CollapsibleContent>
                                    </Card>
                                </Collapsible>
                            ))}
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

