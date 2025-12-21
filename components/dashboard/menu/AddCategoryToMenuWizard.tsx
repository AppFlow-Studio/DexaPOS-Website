'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import {
    BottomSheet,
    BottomSheetContent,
    BottomSheetHeader,
    BottomSheetBody,
    BottomSheetFooter,
    BottomSheetTitle,
    BottomSheetDescription,
} from '@/components/ui/bottom-sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
    Tag,
    Globe,
    MapPin,
    Search,
    CheckCircle2,
    X,
    Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { CategoryWithItems, MenuWithCategories } from '@/types/menu'
import {
    AddCategoryToMenu,
    ToggleCategoryInMenu,
    UpdateLocationMenuCategoryOverride,
} from '@/app/dashboard/actions/categories'
import { useLocationStore, useIsAllLocations } from '@/stores/location-store'
import { useUserInfo } from '@/app/manage/hooks/useUserInfo.'

interface AddCategoryToMenuWizardProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    menuId: string
    menuName?: string
    menu?: MenuWithCategories | null
    userRole?: string
    categoriesWithItems?: CategoryWithItems[]
    onSuccess?: () => void
}

export function AddCategoryToMenuWizard({
    open,
    onOpenChange,
    menuId,
    menuName,
    menu,
    userRole,
    categoriesWithItems = [],
    onSuccess,
}: AddCategoryToMenuWizardProps) {
    const queryClient = useQueryClient()
    const { selectedLocationId } = useLocationStore()
    const isAllLocations = useIsAllLocations()
    const { data: userInfo } = useUserInfo()
    const merchantId = userInfo?.members?.[0]?.organizations?.merchants?.id
    const effectiveUserRole = userRole || userInfo?.members?.[0]?.role
    const [selectedCategories, setSelectedCategories] = React.useState<Set<string>>(new Set())
    const [searchQuery, setSearchQuery] = React.useState('')
    const [isSaving, setIsSaving] = React.useState(false)
    const [categoryOverrides, setCategoryOverrides] = React.useState<Record<string, {
        customTitle: string
        displayOrder: number | null
        isActive: boolean
    }>>({})

    // Determine user role type
    const isMerchantOwner = effectiveUserRole === 'merchant.owner'
    const isMerchantManager = effectiveUserRole === 'merchant.manager'

    // Determine menu type
    const isGlobalMenu = menu?.is_global === true
    const isLocationMenu = menu?.is_location_owned === true

    // Identify categories already in the menu
    const alreadyInMenu = React.useMemo(() => {
        if (!menu?.categories) return new Set<string>()
        return new Set(menu.categories.map(c => c.category_id))
    }, [menu?.categories])

    // Determine if user can add/remove categories
    const canAddRemoveCategories = React.useMemo(() => {
        // Merchant.owner viewing all locations can always add/remove
        if (isMerchantOwner && isAllLocations) {
            return true
        }
        // Merchant.owner/manager viewing location menu can add/remove
        if ((isMerchantOwner || isMerchantManager) && isLocationMenu) {
            return true
        }
        // Merchant.owner/manager location scoped viewing global menu can only edit state
        if ((isMerchantOwner || isMerchantManager) && !isAllLocations && isGlobalMenu) {
            return false
        }
        // Default: allow add/remove
        return true
    }, [isMerchantOwner, isMerchantManager, isAllLocations, isGlobalMenu, isLocationMenu])

    // Filter categories based on restrictions and exclude already-in-menu categories
    const availableCategories = React.useMemo(() => {
        let filtered = categoriesWithItems

        // Merchant.owner + all locations + global menu: Show only global categories
        if (isMerchantOwner && isAllLocations && isGlobalMenu) {
            filtered = filtered.filter(cat => cat.is_global === true)
        }
        // Merchant.owner + all locations + location menu: Show global + location categories
        else if (isMerchantOwner && isAllLocations && isLocationMenu) {
            // Show all categories (global + location)
            filtered = filtered
        }
        // Merchant.owner + location scoped + global menu: Show all but disable add/remove
        else if (isMerchantOwner && !isAllLocations && isGlobalMenu) {
            // Show all categories but they're read-only
            filtered = filtered
        }
        // Merchant.owner + location scoped + location menu: Show global + location scoped
        else if (isMerchantOwner && !isAllLocations && isLocationMenu) {
            filtered = filtered.filter(cat =>
                cat.is_global === true ||
                (cat.location_id === selectedLocationId || menu.location_id)
            )
        }
        // Merchant.manager + location scoped + global menu: Show all but disable add/remove
        else if (isMerchantManager && !isAllLocations && isGlobalMenu) {
            // Show all categories but they're read-only
            filtered = filtered
        }
        // Merchant.manager + location scoped + location menu: Show global + location scoped
        else if (isMerchantManager && !isAllLocations && isLocationMenu) {
            filtered = filtered.filter(cat =>
                cat.is_global === true ||
                (cat.location_id === selectedLocationId)
            )
        }

        // Exclude categories that are already in the menu
        filtered = filtered.filter(cat => !alreadyInMenu.has(cat.id))

        return filtered
    }, [categoriesWithItems, isMerchantOwner, isMerchantManager, isAllLocations, isGlobalMenu, isLocationMenu, selectedLocationId, alreadyInMenu])

    // Filter categories by search query
    const filteredCategories = React.useMemo(() => {
        if (!searchQuery.trim()) return availableCategories

        const query = searchQuery.toLowerCase()
        return availableCategories.filter(cat =>
            cat.name.toLowerCase().includes(query) ||
            cat.description?.toLowerCase().includes(query)
        )
    }, [availableCategories, searchQuery])

    // Separate global and location categories
    const globalCategories = filteredCategories.filter(cat => cat.is_global)
    const locationCategories = filteredCategories.filter(cat => !cat.is_global)

    // Reset on close
    React.useEffect(() => {
        if (!open) {
            setSelectedCategories(new Set())
            setSearchQuery('')
            setCategoryOverrides({})
        }
    }, [open])

    // Initialize override defaults when category is selected
    const handleToggleCategory = (categoryId: string) => {
        // Don't allow toggling if user can't add/remove categories
        if (!canAddRemoveCategories) {
            return
        }

        setSelectedCategories(prev => {
            const next = new Set(prev)
            if (next.has(categoryId)) {
                next.delete(categoryId)
                // Remove override when deselected
                setCategoryOverrides(prevOverrides => {
                    const { [categoryId]: _, ...rest } = prevOverrides
                    return rest
                })
            } else {
                next.add(categoryId)
                // Initialize override with defaults
                const category = availableCategories.find(c => c.id === categoryId)
                if (category) {
                    setCategoryOverrides(prev => ({
                        ...prev,
                        [categoryId]: {
                            customTitle: category.name,
                            displayOrder: category.display_order ?? null,
                            isActive: category.effective_is_active ?? true,
                        },
                    }))
                }
            }
            return next
        })
    }

    const handleSelectAll = (categoryIds: string[]) => {
        if (!canAddRemoveCategories) return

        setSelectedCategories(prev => {
            const next = new Set(prev)
            categoryIds.forEach(id => {
                if (!next.has(id)) {
                    next.add(id)
                    const category = availableCategories.find(c => c.id === id)
                    if (category) {
                        setCategoryOverrides(prevOverrides => ({
                            ...prevOverrides,
                            [id]: {
                                customTitle: category.name,
                                displayOrder: category.display_order ?? null,
                                isActive: category.effective_is_active ?? true,
                            },
                        }))
                    }
                }
            })
            return next
        })
    }

    const handleDeselectAll = (categoryIds: string[]) => {
        if (!canAddRemoveCategories) return

        setSelectedCategories(prev => {
            const next = new Set(prev)
            categoryIds.forEach(id => {
                next.delete(id)
            })
            setCategoryOverrides(prevOverrides => {
                const filtered = { ...prevOverrides }
                categoryIds.forEach(id => {
                    delete filtered[id]
                })
                return filtered
            })
            return next
        })
    }

    const handleSave = async () => {
        if (selectedCategories.size === 0) {
            toast.error('No categories selected', {
                description: 'Please select at least one category to add.',
            })
            return
        }

        if (!canAddRemoveCategories) {
            toast.error('Cannot add categories', {
                description: 'You do not have permission to add categories to this menu.',
            })
            return
        }

        setIsSaving(true)
        try {
            const results = await Promise.allSettled(
                Array.from(selectedCategories).map(async (categoryId) => {
                    const override = categoryOverrides[categoryId]
                    const category = availableCategories.find(c => c.id === categoryId)

                    if (!category) {
                        throw new Error(`Category ${categoryId} not found`)
                    }

                    // Add category to menu
                    const attachResult = await AddCategoryToMenu(
                        menuId,
                        categoryId,
                        merchantId,
                        override?.displayOrder ?? 0,
                    )

                    if ((attachResult as any)?.error) {
                        throw new Error((attachResult as any).error)
                    }

                    // // Apply location override if in location view
                    // if (!isAllLocations && selectedLocationId && override) {
                    //     await UpdateLocationMenuCategoryOverride(
                    //         selectedLocationId,
                    //         menuId,
                    //         categoryId,
                    //         {
                    //             customTitle: override.customTitle !== category.name ? override.customTitle : undefined,
                    //             displayOrder: override.displayOrder ?? undefined,
                    //             isActive: override.isActive,
                    //         }
                    //     )
                    // }
                })
            )

            const failed = results.filter(r => r.status === 'rejected')
            const succeeded = results.filter(r => r.status === 'fulfilled')

            if (failed.length > 0) {
                toast.error('Some categories failed to add', {
                    description: `${failed.length} of ${selectedCategories.size} categories could not be added.`,
                })
            } else {
                toast.success('Categories Added', {
                    description: `${succeeded.length} categor${succeeded.length !== 1 ? 'ies' : 'y'} added to "${menuName || 'this menu'}".`,
                })
            }

            queryClient.invalidateQueries({ queryKey: ['menu-with-categories', menuId] })
            queryClient.invalidateQueries({ queryKey: ['categories-with-items'] })
            onOpenChange(false)
            onSuccess?.()
        } catch (error) {
            toast.error('Failed to add categories', {
                description: error instanceof Error ? error.message : 'An unexpected error occurred.',
            })
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <BottomSheet open={open} onOpenChange={onOpenChange}>
            <BottomSheetContent className="!h-[95vh]">
                <BottomSheetHeader>
                    <BottomSheetTitle className="flex items-center gap-2">
                        <Tag className="h-5 w-5 text-primary" />
                        Add Categories to Menu
                    </BottomSheetTitle>
                    <BottomSheetDescription>
                        Select categories to add to &quot;{menuName || 'this menu'}&quot;. You can customize each category after adding.
                    </BottomSheetDescription>
                </BottomSheetHeader>

                <BottomSheetBody className="px-0">
                    <div className="flex flex-col h-full">
                        {/* Search */}
                        <div className="px-6 pb-4 border-b">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search categories..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-9"
                                />
                            </div>
                            {selectedCategories.size > 0 && (
                                <div className="mt-3 flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">
                                        {selectedCategories.size} categor{selectedCategories.size !== 1 ? 'ies' : 'y'} selected
                                    </span>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                            setSelectedCategories(new Set())
                                            setCategoryOverrides({})
                                        }}
                                    >
                                        Clear All
                                    </Button>
                                </div>
                            )}
                            {!canAddRemoveCategories && (
                                <div className="mt-3 p-3 bg-muted/50 rounded-md text-sm text-muted-foreground">
                                    <p>You do not have permission to add categories to this menu.</p>
                                </div>
                            )}
                        </div>

                        {/* Categories List */}
                        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
                            {/* Global Categories */}
                            {globalCategories.length > 0 && (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Globe className="h-4 w-4 text-muted-foreground" />
                                            <Label className="text-sm font-semibold">Global Categories</Label>
                                            <Badge variant="secondary" className="text-xs">
                                                {globalCategories.length}
                                            </Badge>
                                        </div>
                                        {globalCategories.length > 0 && (
                                            <div className="flex items-center gap-2">
                                                {selectedCategories.size < globalCategories.length && canAddRemoveCategories && (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleSelectAll(globalCategories.map(c => c.id))}
                                                    >
                                                        Select All
                                                    </Button>
                                                )}
                                                {Array.from(selectedCategories).some(id => globalCategories.some(c => c.id === id)) && canAddRemoveCategories && (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleDeselectAll(globalCategories.map(c => c.id))}
                                                    >
                                                        Deselect All
                                                    </Button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    <div className="space-y-2">
                                        {globalCategories.map((category) => {
                                            const isSelected = selectedCategories.has(category.id)
                                            const override = categoryOverrides[category.id]

                                            return (
                                                <div
                                                    key={category.id}
                                                    className={cn(
                                                        "border rounded-lg p-4 transition-all",
                                                        canAddRemoveCategories ? "cursor-pointer" : "cursor-not-allowed opacity-60",
                                                        isSelected
                                                            ? "border-primary bg-primary/5 shadow-sm"
                                                            : "border-muted hover:border-primary/50"
                                                    )}
                                                    onClick={() => canAddRemoveCategories && handleToggleCategory(category.id)}
                                                >
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2 mb-1">
                                                                {isSelected ? (
                                                                    <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                                                                ) : (
                                                                    <div className="h-5 w-5 rounded-full border-2 border-muted-foreground shrink-0" />
                                                                )}
                                                                <span className="font-medium">{category.name}</span>
                                                            </div>
                                                            {category.description && (
                                                                <p className="text-sm text-muted-foreground ml-7">
                                                                    {category.description}
                                                                </p>
                                                            )}
                                                            <div className="flex items-center gap-2 mt-2 ml-7">
                                                                <Badge variant="outline" className="text-xs">
                                                                    {category.item_count || 0} items
                                                                </Badge>
                                                                {category.menu_count > 0 && (
                                                                    <Badge variant="outline" className="text-xs">
                                                                        Used in {category.menu_count} menu{category.menu_count !== 1 ? 's' : ''}
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Override settings (shown when selected) */}
                                                    {isSelected && !isAllLocations && (
                                                        <div
                                                            className="mt-3 pt-3 border-t space-y-3"
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            <div className="grid grid-cols-2 gap-3">
                                                                <div className="space-y-1.5">
                                                                    <Label className="text-xs">Custom Title</Label>
                                                                    <Input
                                                                        className="h-8 text-sm"
                                                                        value={override?.customTitle || category.name}
                                                                        onChange={(e) =>
                                                                            setCategoryOverrides(prev => ({
                                                                                ...prev,
                                                                                [category.id]: {
                                                                                    ...prev[category.id],
                                                                                    customTitle: e.target.value,
                                                                                },
                                                                            }))
                                                                        }
                                                                        placeholder={category.name}
                                                                    />
                                                                </div>
                                                                <div className="space-y-1.5">
                                                                    <Label className="text-xs">Display Order</Label>
                                                                    <Input
                                                                        type="number"
                                                                        className="h-8 text-sm"
                                                                        value={override?.displayOrder ?? ''}
                                                                        onChange={(e) =>
                                                                            setCategoryOverrides(prev => ({
                                                                                ...prev,
                                                                                [category.id]: {
                                                                                    ...prev[category.id],
                                                                                    displayOrder: e.target.value ? Number(e.target.value) : null,
                                                                                },
                                                                            }))
                                                                        }
                                                                        placeholder="Auto"
                                                                    />
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center justify-between p-2 rounded-md bg-muted/50">
                                                                <Label className="text-xs font-medium">Active in menu</Label>
                                                                <Switch
                                                                    checked={override?.isActive ?? true}
                                                                    onCheckedChange={(checked) =>
                                                                        setCategoryOverrides(prev => ({
                                                                            ...prev,
                                                                            [category.id]: {
                                                                                ...prev[category.id],
                                                                                isActive: checked,
                                                                            },
                                                                        }))
                                                                    }
                                                                />
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Location Categories */}
                            {locationCategories.length > 0 && (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <MapPin className="h-4 w-4 text-muted-foreground" />
                                            <Label className="text-sm font-semibold">Location Categories</Label>
                                            <Badge variant="secondary" className="text-xs">
                                                {locationCategories.length}
                                            </Badge>
                                        </div>
                                        {locationCategories.length > 0 && (
                                            <div className="flex items-center gap-2">
                                                {selectedCategories.size < locationCategories.length && canAddRemoveCategories && (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleSelectAll(locationCategories.map(c => c.id))}
                                                    >
                                                        Select All
                                                    </Button>
                                                )}
                                                {Array.from(selectedCategories).some(id => locationCategories.some(c => c.id === id)) && canAddRemoveCategories && (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleDeselectAll(locationCategories.map(c => c.id))}
                                                    >
                                                        Deselect All
                                                    </Button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    <div className="space-y-2">
                                        {locationCategories.map((category) => {
                                            const isSelected = selectedCategories.has(category.id)
                                            const override = categoryOverrides[category.id]

                                            return (
                                                <div
                                                    key={category.id}
                                                    className={cn(
                                                        "border rounded-lg p-4 transition-all",
                                                        canAddRemoveCategories ? "cursor-pointer" : "cursor-not-allowed opacity-60",
                                                        isSelected
                                                            ? "border-primary bg-primary/5 shadow-sm"
                                                            : "border-muted hover:border-primary/50"
                                                    )}
                                                    onClick={() => canAddRemoveCategories && handleToggleCategory(category.id)}
                                                >
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2 mb-1">
                                                                {isSelected ? (
                                                                    <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                                                                ) : (
                                                                    <div className="h-5 w-5 rounded-full border-2 border-muted-foreground shrink-0" />
                                                                )}
                                                                <span className="font-medium">{category.name}</span>
                                                                <Badge variant="outline" className="text-xs bg-purple-50 text-purple-600 border-purple-200">
                                                                    {category.location_name}
                                                                </Badge>
                                                            </div>
                                                            {category.description && (
                                                                <p className="text-sm text-muted-foreground ml-7">
                                                                    {category.description}
                                                                </p>
                                                            )}
                                                            <div className="flex items-center gap-2 mt-2 ml-7">
                                                                <Badge variant="outline" className="text-xs">
                                                                    {category.item_count || 0} items
                                                                </Badge>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Override settings */}
                                                    {isSelected && !isAllLocations && (
                                                        <div
                                                            className="mt-3 pt-3 border-t space-y-3"
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            <div className="grid grid-cols-2 gap-3">
                                                                <div className="space-y-1.5">
                                                                    <Label className="text-xs">Custom Title</Label>
                                                                    <Input
                                                                        className="h-8 text-sm"
                                                                        value={override?.customTitle || category.name}
                                                                        onChange={(e) =>
                                                                            setCategoryOverrides(prev => ({
                                                                                ...prev,
                                                                                [category.id]: {
                                                                                    ...prev[category.id],
                                                                                    customTitle: e.target.value,
                                                                                },
                                                                            }))
                                                                        }
                                                                        placeholder={category.name}
                                                                    />
                                                                </div>
                                                                <div className="space-y-1.5">
                                                                    <Label className="text-xs">Display Order</Label>
                                                                    <Input
                                                                        type="number"
                                                                        className="h-8 text-sm"
                                                                        value={override?.displayOrder ?? ''}
                                                                        onChange={(e) =>
                                                                            setCategoryOverrides(prev => ({
                                                                                ...prev,
                                                                                [category.id]: {
                                                                                    ...prev[category.id],
                                                                                    displayOrder: e.target.value ? Number(e.target.value) : null,
                                                                                },
                                                                            }))
                                                                        }
                                                                        placeholder="Auto"
                                                                    />
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center justify-between p-2 rounded-md bg-muted/50">
                                                                <Label className="text-xs font-medium">Active in menu</Label>
                                                                <Switch
                                                                    checked={override?.isActive ?? true}
                                                                    onCheckedChange={(checked) =>
                                                                        setCategoryOverrides(prev => ({
                                                                            ...prev,
                                                                            [category.id]: {
                                                                                ...prev[category.id],
                                                                                isActive: checked,
                                                                            },
                                                                        }))
                                                                    }
                                                                />
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Empty State */}
                            {filteredCategories.length === 0 && (
                                <div className="text-center py-12">
                                    <Tag className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                                    <p className="text-sm font-medium text-muted-foreground mb-1">
                                        {searchQuery ? 'No categories found' : 'No categories available'}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {searchQuery
                                            ? 'Try adjusting your search query'
                                            : 'Create categories first to add them to menus'}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </BottomSheetBody>

                <BottomSheetFooter>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        className="flex-1 lg:flex-none"
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={isSaving || selectedCategories.size === 0}
                        className="flex-1 lg:flex-none lg:min-w-[150px]"
                    >
                        {isSaving ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Adding...
                            </>
                        ) : (
                            <>
                                <Tag className="h-4 w-4 mr-2" />
                                Add {selectedCategories.size > 0 ? `${selectedCategories.size} ` : ''}Categor{selectedCategories.size !== 1 ? 'ies' : 'y'}
                            </>
                        )}
                    </Button>
                </BottomSheetFooter>
            </BottomSheetContent>
        </BottomSheet>
    )
}

