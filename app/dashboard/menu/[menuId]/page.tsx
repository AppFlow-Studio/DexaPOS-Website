'use client'

import { useParams, useRouter } from 'next/navigation'
import React, { useState, useMemo, useEffect } from 'react'
import { useMenuWithCategories } from '../../hooks/useMenu'
import { useUserInfo } from '../../../manage/hooks/useUserInfo.'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Utensils, Tag, Calendar, Settings, Plus, Trash2, Clock, Power, Save, Info, AlertTriangle, Globe, MapPin, ChevronDown, ChevronRight, Star, DollarSign } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { DeleteMenu, UpdateMenu, ToggleMenuActive } from '../../actions/menus'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    CreateSchedule,
    AssignScheduleToMenu,
    RemoveScheduleFromMenu,
} from '../../actions/schedules'
import { useQueryClient } from '@tanstack/react-query'
import { Empty } from '@/components/ui/empty'
import { toast } from 'sonner'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { ScheduleCard } from '@/components/dashboard/menu/ScheduleCard'
import { WeeklyScheduleView } from '@/components/dashboard/menu/WeeklyScheduleView'
import { ScheduleFormSheet } from '@/components/dashboard/menu/ScheduleFormSheet'
import { SchedulesModel, ScheduleTimeSlotsModel } from '@/types/db-modles'
import { cn } from '@/lib/utils'
import { useLocationStore } from '@/stores/location-store'
import { MenuCategory, MenuCategoryItem } from '@/types/menu'
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible'

// Category Section Component with collapsible items
function CategorySection({
    category,
    isExpanded,
    onToggle,
    onItemClick,
    showLocationPricing
}: {
    category: MenuCategory
    isExpanded: boolean
    onToggle: () => void
    onItemClick: (itemId: string) => void
    showLocationPricing: boolean
}) {
    const itemCount = category.items?.length || 0

    return (
        <Collapsible open={isExpanded} onOpenChange={onToggle}>
            <Card className="overflow-hidden">
                <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                {isExpanded ? (
                                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                                ) : (
                                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                                )}
                                <div>
                                    <CardTitle className="text-lg">
                                        {category.category?.name || 'Unnamed Category'}
                                    </CardTitle>
                                    {category.category?.description && (
                                        <CardDescription className="mt-1">
                                            {category.category.description}
                                        </CardDescription>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {!category.is_active && (
                                    <Badge variant="secondary">Inactive</Badge>
                                )}
                                <Badge variant="outline">
                                    {itemCount} item{itemCount !== 1 ? 's' : ''}
                                </Badge>
                            </div>
                        </div>
                    </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <CardContent className="pt-0">
                        {itemCount === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                                No items in this category
                            </div>
                        ) : (
                            <div className="divide-y">
                                {category.items?.map((item: MenuCategoryItem) => (
                                    <CategoryItemRow
                                        key={item.id}
                                        item={item}
                                        onClick={() => onItemClick(item.menu_item_id)}
                                        showLocationPricing={showLocationPricing}
                                    />
                                ))}
                            </div>
                        )}
                    </CardContent>
                </CollapsibleContent>
            </Card>
        </Collapsible>
    )
}

// Individual item row within a category
function CategoryItemRow({
    item,
    onClick,
    showLocationPricing
}: {
    item: MenuCategoryItem
    onClick: () => void
    showLocationPricing: boolean
}) {
    const menuItem = item.menu_item
    const priceSource = menuItem?.price_source || 'base'

    const getPriceSourceBadge = () => {
        switch (priceSource) {
            case 'location_menu':
                return <Badge variant="default" className="text-xs">L5: Menu Override</Badge>
            case 'location_category':
                return <Badge variant="default" className="text-xs">L4: Location Category</Badge>
            case 'category':
                return <Badge variant="secondary" className="text-xs">L3: Category Price</Badge>
            case 'location_item':
                return <Badge variant="secondary" className="text-xs">L2: Location Base</Badge>
            default:
                return null
        }
    }

    return (
        <div
            className="flex items-center gap-4 py-4 px-2 hover:bg-muted/50 cursor-pointer transition-colors rounded-lg"
            onClick={onClick}
        >
            {/* Item Image */}
            <div className="h-16 w-16 rounded-lg bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                {menuItem?.image ? (
                    <img
                        src={menuItem.image}
                        alt={menuItem?.name || ''}
                        className="h-full w-full object-cover"
                    />
                ) : (
                    <Utensils className="h-6 w-6 text-muted-foreground" />
                )}
            </div>

            {/* Item Details */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <h4 className="font-medium truncate">{menuItem?.name}</h4>
                    {item.is_featured && (
                        <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                    )}
                </div>
                {menuItem?.description && (
                    <p className="text-sm text-muted-foreground truncate">
                        {menuItem.description}
                    </p>
                )}
                <div className="flex items-center gap-2 mt-1">
                    {menuItem?.allergens && menuItem.allergens.length > 0 && (
                        <Badge variant="outline" className="text-xs">
                            {menuItem.allergens.length} allergen{menuItem.allergens.length !== 1 ? 's' : ''}
                        </Badge>
                    )}
                    {showLocationPricing && getPriceSourceBadge()}
                </div>
            </div>

            {/* Price */}
            <div className="text-right flex-shrink-0">
                <div className="flex items-center gap-1">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    <span className="font-semibold">
                        {menuItem?.effective_price?.toFixed(2) || '0.00'}
                    </span>
                </div>
                {menuItem?.effective_cash_price && menuItem.effective_cash_price !== menuItem.effective_price && (
                    <div className="text-sm text-muted-foreground">
                        Cash: ${menuItem.effective_cash_price.toFixed(2)}
                    </div>
                )}
                {!menuItem?.effective_availability && (
                    <Badge variant="destructive" className="text-xs mt-1">
                        Unavailable
                    </Badge>
                )}
            </div>
        </div>
    )
}

export default function MenuDetailPage() {
    const params = useParams()
    const router = useRouter()
    const queryClient = useQueryClient()
    const menuId = params.menuId as string
    const { data: menu, isLoading, refetch: refetchMenu } = useMenuWithCategories(menuId)
    const { selectedLocationId } = useLocationStore()
    const { data: userInfo } = useUserInfo()
    const clerkOrgId = userInfo?.members?.[0]?.organizations?.id

    // Track expanded categories
    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())

    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const [isScheduleSheetOpen, setIsScheduleSheetOpen] = useState(false)

    // Settings state
    const [isTogglingActive, setIsTogglingActive] = useState(false)
    const [isSavingSettings, setIsSavingSettings] = useState(false)
    const [editedName, setEditedName] = useState('')
    const [editedDescription, setEditedDescription] = useState('')
    const [hasSettingsChanges, setHasSettingsChanges] = useState(false)

    // Initialize settings and expand all categories when menu loads
    useEffect(() => {
        if (menu) {
            setEditedName(menu.name)
            setEditedDescription(menu.description || '')
            setHasSettingsChanges(false)
            // Expand all categories by default
            const allCategoryIds = new Set(menu.categories?.map(c => c.id) || [])
            setExpandedCategories(allCategoryIds)
        }
    }, [menu])

    // Check for settings changes
    useEffect(() => {
        if (menu) {
            const hasChanges = editedName !== menu.name || editedDescription !== (menu.description || '')
            setHasSettingsChanges(hasChanges)
        }
    }, [editedName, editedDescription, menu])

    const toggleCategory = (categoryId: string) => {
        setExpandedCategories(prev => {
            const next = new Set(prev)
            if (next.has(categoryId)) {
                next.delete(categoryId)
            } else {
                next.add(categoryId)
            }
            return next
        })
    }

    const expandAllCategories = () => {
        const allIds = new Set(menu?.categories?.map(c => c.id) || [])
        setExpandedCategories(allIds)
    }

    const collapseAllCategories = () => {
        setExpandedCategories(new Set())
    }

    const handleToggleMenuActive = async () => {
        setIsTogglingActive(true)
        try {
            const result = await ToggleMenuActive(menuId)
            if (result.error) {
                toast.error('Update Failed', { description: result.error })
                return
            }
            toast.success(menu?.is_active ? 'Menu Deactivated' : 'Menu Activated', {
                description: menu?.is_active
                    ? 'This menu is now hidden from customers.'
                    : 'This menu is now visible to customers.'
            })
            queryClient.invalidateQueries({ queryKey: ['menu-with-categories', menuId] })
            refetchMenu()
        } catch {
            toast.error('Update Failed', {
                description: 'Unable to update menu status. Please try again.'
            })
        } finally {
            setIsTogglingActive(false)
        }
    }

    const handleSaveSettings = async () => {
        if (!hasSettingsChanges) return

        setIsSavingSettings(true)
        try {
            const result = await UpdateMenu(menuId, {
                name: editedName.trim(),
                description: editedDescription.trim() || undefined,
            })

            if (result.error) {
                toast.error('Save Failed', { description: result.error })
                return
            }

            toast.success('Settings Saved', {
                description: 'Menu settings have been updated.'
            })
            queryClient.invalidateQueries({ queryKey: ['menu-with-categories', menuId] })
            refetchMenu()
            setHasSettingsChanges(false)
        } catch {
            toast.error('Save Failed', {
                description: 'Unable to save settings. Please try again.'
            })
        } finally {
            setIsSavingSettings(false)
        }
    }

    // Extract menu schedules from the menu data and transform to expected format
    type TransformedSchedule = SchedulesModel & {
        schedule_time_slots: ScheduleTimeSlotsModel[]
        time_slots: Array<{ id: string; day_of_week: number; start_time: string; end_time: string }>
    }

    const menuSchedules = useMemo(() => {
        if (!menu) return []
        const scheduleData = menu.schedules || []
        return scheduleData
            .map((ms) => {
                const schedule = ms.schedule
                if (!schedule) return null
                const timeSlots = schedule.time_slots || []
                return {
                    ...schedule,
                    merchant_id: menu.merchant_id,
                    created_at: schedule.id,
                    updated_at: schedule.id,
                    time_slots: timeSlots,
                    schedule_time_slots: timeSlots.map((ts) => ({
                        ...ts,
                        schedule_id: schedule.id,
                        is_active: true,
                        created_at: ts.id,
                        updated_at: ts.id,
                    }))
                } as TransformedSchedule
            })
            .filter(Boolean) as TransformedSchedule[]
    }, [menu])

    // Calculate total items across all categories
    const totalItems = useMemo(() => {
        if (!menu?.categories) return 0
        return menu.categories.reduce((sum, cat) => sum + (cat.items?.length || 0), 0)
    }, [menu?.categories])

    const handleDeleteMenu = async () => {
        setIsDeleting(true)
        try {
            const result = await DeleteMenu(menuId)
            if (result.error) {
                toast.error('Delete Failed', {
                    description: result.error
                })
                return
            }
            toast.success('Menu Deleted', {
                description: `"${menu?.name}" has been permanently deleted.`
            })
            queryClient.invalidateQueries({ queryKey: ['menus'] })
            router.push('/dashboard/menu')
        } catch {
            toast.error('Delete Failed', {
                description: 'Unable to delete the menu. Please try again.'
            })
        } finally {
            setIsDeleting(false)
            setIsDeleteDialogOpen(false)
        }
    }

    const handleCreateSchedule = async (data: {
        name: string
        description?: string
        time_slots: Array<{
            day_of_week: number
            start_time: string
            end_time: string
        }>
    }) => {
        if (!clerkOrgId) {
            return { error: 'Organization not found' }
        }

        const createResult = await CreateSchedule(clerkOrgId, {
            name: data.name,
            description: data.description,
            time_slots: data.time_slots,
        })

        if (createResult.error || !createResult.data) {
            return { error: createResult.error || 'Failed to create schedule' }
        }

        const assignResult = await AssignScheduleToMenu(menuId, createResult.data.id)

        if (assignResult.error) {
            return { error: assignResult.error }
        }

        queryClient.invalidateQueries({ queryKey: ['menu-with-categories', menuId] })
        refetchMenu()

        return { data: createResult.data }
    }

    const handleAssignSchedule = async (scheduleId: string) => {
        const result = await AssignScheduleToMenu(menuId, scheduleId)

        if (result.error) {
            return { error: result.error }
        }

        queryClient.invalidateQueries({ queryKey: ['menu-with-categories', menuId] })
        refetchMenu()

        return {}
    }

    const handleRemoveSchedule = async (scheduleId: string) => {
        try {
            const result = await RemoveScheduleFromMenu(menuId, scheduleId)

            if (result.error) {
                toast.error('Remove Failed', { description: result.error })
                return
            }

            toast.success('Schedule Removed', {
                description: 'The schedule has been removed from this menu.'
            })

            queryClient.invalidateQueries({ queryKey: ['menu-with-categories', menuId] })
            refetchMenu()
        } catch {
            toast.error('Remove Failed', {
                description: 'Unable to remove the schedule. Please try again.'
            })
        }
    }

    if (isLoading) {
        return (
            <div className="space-y-6 animate-in fade-in duration-500">
                <Skeleton className="h-10 w-64" />
                <Skeleton className="h-96 w-full" />
            </div>
        )
    }

    if (!menu) {
        return (
            <div className="space-y-6">
                <Empty
                    icon={Utensils}
                    title="Menu not found"
                    description="The menu you're looking for doesn't exist or has been deleted."
                    action={
                        <Button onClick={() => router.push('/dashboard/menu')}>
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Back to Menus
                        </Button>
                    }
                />
            </div>
        )
    }

    const categories = menu.categories || []

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex items-center gap-4">
                <div className="flex-1">
                    {/* Breadcrumbs */}
                    <div className="text-sm text-muted-foreground flex items-center gap-2 mb-2">
                        <Button variant="ghost" size="icon" onClick={() => router.back()}>
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                        <button
                            type="button"
                            className="hover:underline"
                            onClick={() => router.push('/dashboard/menu')}
                        >
                            Menus
                        </button>
                        <span className="mx-2">/</span>
                        <div className="text-foreground">{menu.name}</div>
                    </div>
                    <div className="flex items-center gap-2">
                        <h2 className='text-2xl font-bold tracking-tight'>{menu.name}</h2>
                        <Badge variant={menu.is_location_owned ? "secondary" : "default"}>
                            {menu.is_location_owned ? (
                                <div className="flex items-center gap-2">
                                    <MapPin className="h-4 w-4" />
                                    <p>Location Menu</p>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <Globe className="h-4 w-4" />
                                    <p>Global Menu</p>
                                </div>
                            )}
                        </Badge>
                    </div>
                    {menu.description && (
                        <p className="text-muted-foreground">{menu.description}</p>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    <Badge variant={menu.is_active ? "default" : "secondary"}>
                        {menu.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                </div>
            </div>

            <Tabs defaultValue="overview" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="categories" className="flex items-center gap-1.5">
                        Categories & Items
                        {categories.length > 0 && (
                            <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                                {categories.length}
                            </Badge>
                        )}
                    </TabsTrigger>
                    <TabsTrigger value="schedules" className="flex items-center gap-1.5">
                        Schedules
                        {menuSchedules.length > 0 && (
                            <Badge variant="secondary" className="h-5 w-5 p-0 text-xs flex items-center justify-center">
                                {menuSchedules.length}
                            </Badge>
                        )}
                    </TabsTrigger>
                    <TabsTrigger value="settings">Settings</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-3">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Categories</CardTitle>
                                <Tag className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{categories.length}</div>
                                <p className="text-xs text-muted-foreground">
                                    Total categories
                                </p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Items</CardTitle>
                                <Utensils className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{totalItems}</div>
                                <p className="text-xs text-muted-foreground">
                                    Total items across all categories
                                </p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Schedules</CardTitle>
                                <Clock className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{menuSchedules.length}</div>
                                <p className="text-xs text-muted-foreground">
                                    Active schedules
                                </p>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Quick Schedule Preview */}
                    {menuSchedules.length > 0 && (
                        <WeeklyScheduleView schedules={menuSchedules} />
                    )}
                </TabsContent>

                <TabsContent value="categories" className="space-y-4">
                    {/* Controls */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={expandAllCategories}
                            >
                                Expand All
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={collapseAllCategories}
                            >
                                Collapse All
                            </Button>
                        </div>
                        <div className='flex items-center gap-2'>
                            {selectedLocationId !== 'all' && (
                                <p className="text-xs text-muted-foreground">
                                    Viewing location-specific pricing
                                </p>
                            )}
                            <Button
                                disabled={selectedLocationId !== 'all'}
                                onClick={() => router.push('/dashboard/menu/categories')}
                            >
                                <Plus className="h-4 w-4 mr-2" />
                                Manage Categories
                            </Button>
                        </div>
                    </div>

                    {/* Category Sections */}
                    {categories.length === 0 ? (
                        <Empty
                            icon={Tag}
                            title="No categories"
                            description="Add categories to organize your menu items. Items are displayed within their categories."
                            action={
                                <Button onClick={() => router.push('/dashboard/menu/categories')}>
                                    <Plus className="h-4 w-4 mr-2" />
                                    Add Categories
                                </Button>
                            }
                        />
                    ) : (
                        <div className="space-y-4">
                            {categories.map((category) => (
                                <CategorySection
                                    key={category.id}
                                    category={category}
                                    isExpanded={expandedCategories.has(category.id)}
                                    onToggle={() => toggleCategory(category.id)}
                                    onItemClick={(itemId) => router.push(`/dashboard/menu/items/${itemId}`)}
                                    showLocationPricing={selectedLocationId !== 'all'}
                                />
                            ))}
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="schedules" className="space-y-4">
                    {/* Weekly Schedule Overview */}
                    {menuSchedules.length > 0 && (
                        <WeeklyScheduleView schedules={menuSchedules} />
                    )}

                    {/* Schedule Cards */}
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle>Assigned Schedules</CardTitle>
                                    <CardDescription>
                                        {menuSchedules.length === 0
                                            ? "No schedules assigned yet"
                                            : `${menuSchedules.length} schedule${menuSchedules.length !== 1 ? 's' : ''} controlling menu availability`
                                        }
                                    </CardDescription>
                                </div>
                                <div className='items-end justify-end flex flex-col gap-2'>
                                    <Button
                                        disabled={selectedLocationId !== 'all'}
                                        onClick={() => setIsScheduleSheetOpen(true)}>
                                        <Plus className="h-4 w-4 mr-2" />
                                        Add Schedule
                                    </Button>
                                    {selectedLocationId !== 'all' && <p className="text-xs text-muted-foreground mt-3">
                                        * Addition is only available when viewing all locations.
                                    </p>}
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {isLoading ? (
                                <div className="space-y-3">
                                    {[1, 2].map((i) => (
                                        <Skeleton key={i} className="h-32 w-full" />
                                    ))}
                                </div>
                            ) : menuSchedules.length === 0 ? (
                                <Empty
                                    icon={Calendar}
                                    title="No schedules assigned"
                                    description="Add schedules to control when this menu is available to customers"
                                    action={
                                        <Button onClick={() => setIsScheduleSheetOpen(true)}>
                                            <Plus className="h-4 w-4 mr-2" />
                                            Add Schedule
                                        </Button>
                                    }
                                />
                            ) : (
                                <div className="space-y-4">
                                    {menuSchedules.map((schedule, index) => (
                                        <ScheduleCard
                                            key={schedule.id}
                                            schedule={schedule}
                                            index={index}
                                            onRemove={() => handleRemoveSchedule(schedule.id)}
                                        />
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="settings" className="space-y-4">
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
                                onClick={handleToggleMenuActive}
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
                                    onChange={(e) => setEditedName(e.target.value)}
                                    placeholder="Enter menu name"
                                    className="max-w-md"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="menu-description">Description</Label>
                                <Input
                                    id="menu-description"
                                    value={editedDescription}
                                    onChange={(e) => setEditedDescription(e.target.value)}
                                    placeholder="Enter menu description (optional)"
                                    className="max-w-md"
                                />
                            </div>

                            {hasSettingsChanges && (
                                <div className="flex items-center gap-3 pt-2 animate-in fade-in slide-in-from-bottom-2">
                                    <Button
                                        onClick={handleSaveSettings}
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
                                        onClick={() => {
                                            setEditedName(menu.name)
                                            setEditedDescription(menu.description || '')
                                        }}
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
                                    <p className="font-medium">{categories.length} categories</p>
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
                                    onClick={() => setIsDeleteDialogOpen(true)}
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
                </TabsContent>
            </Tabs>

            {/* Delete Menu Confirmation */}
            <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-destructive">
                            <Trash2 className="h-5 w-5" />
                            Delete Menu
                        </DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete &quot;{menu.name}&quot;? This action cannot be undone.
                            All category associations will be removed from this menu.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setIsDeleteDialogOpen(false)}
                            disabled={isDeleting}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleDeleteMenu}
                            disabled={isDeleting}
                        >
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
                                    Delete Menu
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Schedule Form Sheet */}
            <ScheduleFormSheet
                open={isScheduleSheetOpen}
                onOpenChange={setIsScheduleSheetOpen}
                existingSchedules={[]}
                isLoadingSchedules={isLoading}
                onCreateSchedule={handleCreateSchedule}
                onAssignSchedule={handleAssignSchedule}
            />
        </div>
    )
}
