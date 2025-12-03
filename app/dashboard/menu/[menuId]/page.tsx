'use client'

import { useParams, useRouter } from 'next/navigation'
import React, { useState, useMemo, useEffect } from 'react'
import { useMenu } from '../../hooks/useMenu'
import { useUserInfo } from '../../../manage/hooks/useUserInfo.'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Utensils, Tag, Calendar, Settings, Plus, Trash2, Edit3, Clock, Power, Save, Info, AlertTriangle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { GetMenuItemsByMenu } from '../../actions/menu-items'
import { DeleteMenu, UpdateMenu, ToggleMenuActive } from '../../actions/menus'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    CreateSchedule,
    AssignScheduleToMenu,
    RemoveScheduleFromMenu,
    GetSchedulesWithTimeSlots
} from '../../actions/schedules'
import { useQuery, useQueryClient } from '@tanstack/react-query'
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

export default function MenuDetailPage() {
    const params = useParams()
    const router = useRouter()
    const queryClient = useQueryClient()
    const menuId = params.menuId as string
    const { data: menu, isLoading, refetch: refetchMenu } = useMenu(menuId)
    const { data: userInfo } = useUserInfo()
    const clerkOrgId = userInfo?.members?.[0]?.organizations?.id

    const { data: menuItems, isLoading: itemsLoading } = useQuery({
        queryKey: ['menu-items-by-menu', menuId],
        queryFn: () => GetMenuItemsByMenu(menuId),
        enabled: !!menuId,
    })

    // Fetch all available schedules for assignment
    const { data: allSchedules, isLoading: schedulesLoading } = useQuery({
        queryKey: ['schedules-with-slots', clerkOrgId],
        queryFn: () => GetSchedulesWithTimeSlots(clerkOrgId || ''),
        enabled: !!clerkOrgId,
    })

    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const [isScheduleSheetOpen, setIsScheduleSheetOpen] = useState(false)
    const [removingScheduleId, setRemovingScheduleId] = useState<string | null>(null)

    // Settings state
    const [isTogglingActive, setIsTogglingActive] = useState(false)
    const [isSavingSettings, setIsSavingSettings] = useState(false)
    const [editedName, setEditedName] = useState('')
    const [editedDescription, setEditedDescription] = useState('')
    const [hasSettingsChanges, setHasSettingsChanges] = useState(false)

    // Initialize settings when menu loads
    useEffect(() => {
        if (menu) {
            setEditedName(menu.name)
            setEditedDescription(menu.description || '')
            setHasSettingsChanges(false)
        }
    }, [menu])

    // Check for settings changes
    useEffect(() => {
        if (menu) {
            const hasChanges = editedName !== menu.name || editedDescription !== (menu.description || '')
            setHasSettingsChanges(hasChanges)
        }
    }, [editedName, editedDescription, menu])

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
            queryClient.invalidateQueries({ queryKey: ['menu', menuId] })
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
            queryClient.invalidateQueries({ queryKey: ['menu', menuId] })
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

    // Extract menu schedules from the menu data
    const menuSchedules = useMemo(() => {
        if (!menu) return []
        const scheduleData = (menu as any).menu_schedules || []
        return scheduleData
            .map((ms: any) => ms.schedule)
            .filter(Boolean) as Array<SchedulesModel & { schedule_time_slots: ScheduleTimeSlotsModel[] }>
    }, [menu])

    // Get unassigned schedules (schedules not already assigned to this menu)
    const unassignedSchedules = useMemo(() => {
        if (!allSchedules) return []
        const assignedIds = new Set(menuSchedules.map(s => s.id))
        return allSchedules.filter(s => !assignedIds.has(s.id))
    }, [allSchedules, menuSchedules])

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
                description: `"${(menu as any).name}" has been permanently deleted.`
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

        // Create the schedule
        const createResult = await CreateSchedule(clerkOrgId, {
            name: data.name,
            description: data.description,
            time_slots: data.time_slots,
        })

        if (createResult.error || !createResult.data) {
            return { error: createResult.error || 'Failed to create schedule' }
        }

        // Assign the new schedule to this menu
        const assignResult = await AssignScheduleToMenu(menuId, createResult.data.id)

        if (assignResult.error) {
            return { error: assignResult.error }
        }

        // Refresh data
        queryClient.invalidateQueries({ queryKey: ['menu', menuId] })
        queryClient.invalidateQueries({ queryKey: ['schedules-with-slots'] })
        refetchMenu()

        return { data: createResult.data }
    }

    const handleAssignSchedule = async (scheduleId: string) => {
        const result = await AssignScheduleToMenu(menuId, scheduleId)

        if (result.error) {
            return { error: result.error }
        }

        // Refresh data
        queryClient.invalidateQueries({ queryKey: ['menu', menuId] })
        refetchMenu()

        return {}
    }

    const handleRemoveSchedule = async (scheduleId: string) => {
        setRemovingScheduleId(scheduleId)
        try {
            const result = await RemoveScheduleFromMenu(menuId, scheduleId)

            if (result.error) {
                toast.error('Remove Failed', { description: result.error })
                return
            }

            toast.success('Schedule Removed', {
                description: 'The schedule has been removed from this menu.'
            })

            // Refresh data
            queryClient.invalidateQueries({ queryKey: ['menu', menuId] })
            refetchMenu()
        } catch {
            toast.error('Remove Failed', {
                description: 'Unable to remove the schedule. Please try again.'
            })
        } finally {
            setRemovingScheduleId(null)
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

    const categories = (menu as any).menu_categories || []
    const items = menuItems || []

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
                    <h2 className="text-2xl font-bold tracking-tight">{menu.name}</h2>
                    {menu.description && (
                        <p className="text-muted-foreground">{menu.description}</p>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <Badge variant={menu.is_active ? "default" : "secondary"}>
                        {menu.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                    <Button variant="outline" onClick={() => router.push('/dashboard/menu')}>
                        <Edit3 className="h-4 w-4 mr-2" />
                        Edit Menu
                    </Button>
                    <Button variant="destructive" onClick={() => setIsDeleteDialogOpen(true)}>
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                    </Button>
                </div>
            </div>

            <Tabs defaultValue="overview" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="categories">Categories</TabsTrigger>
                    <TabsTrigger value="items">Items</TabsTrigger>
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
                                <div className="text-2xl font-bold">{items.length}</div>
                                <p className="text-xs text-muted-foreground">
                                    Total items
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
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle>Categories</CardTitle>
                                    <CardDescription>Manage categories in this menu</CardDescription>
                                </div>
                                <Button>
                                    <Plus className="h-4 w-4 mr-2" />
                                    Add Category
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {categories.length === 0 ? (
                                <Empty
                                    icon={Tag}
                                    title="No categories"
                                    description="Add categories to organize your menu items"
                                    action={
                                        <Button>
                                            <Plus className="h-4 w-4 mr-2" />
                                            Add Category
                                        </Button>
                                    }
                                />
                            ) : (
                                <div className="space-y-2">
                                    {categories.map((cat: any) => (
                                        <Card key={cat.id} className="p-4">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <div className="font-semibold">{cat.category?.name}</div>
                                                    {cat.category?.description && (
                                                        <div className="text-sm text-muted-foreground">
                                                            {cat.category.description}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </Card>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="items" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle>Items</CardTitle>
                                    <CardDescription>Manage items in this menu</CardDescription>
                                </div>
                                <Button onClick={() => router.push('/dashboard/menu/items')}>
                                    <Plus className="h-4 w-4 mr-2" />
                                    Add Item
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {itemsLoading ? (
                                <div className="space-y-2">
                                    {[1, 2, 3].map((i) => (
                                        <Skeleton key={i} className="h-16 w-full" />
                                    ))}
                                </div>
                            ) : items.length === 0 ? (
                                <Empty
                                    icon={Utensils}
                                    title="No items"
                                    description="Add items to this menu"
                                    action={
                                        <Button onClick={() => router.push('/dashboard/menu/items')}>
                                            <Plus className="h-4 w-4 mr-2" />
                                            Add Item
                                        </Button>
                                    }
                                />
                            ) : (
                                <div className="space-y-2">
                                    {items.map((item: any) => (
                                        <Card key={item.id} className="p-4 hover:shadow-md transition-shadow cursor-pointer" onClick={() => router.push(`/dashboard/menu/items/${item.id}`)}>
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-4">
                                                    <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                                                        <Utensils className="h-6 w-6 text-primary" />
                                                    </div>
                                                    <div>
                                                        <div className="font-semibold">{item.name}</div>
                                                        {item.description && (
                                                            <div className="text-sm text-muted-foreground line-clamp-1">
                                                                {item.description}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    {item.custom_price && item.custom_price !== item.price ? (
                                                        <div className="space-y-0.5">
                                                            <div className="flex items-center justify-end gap-2">
                                                                <span className="text-xs text-muted-foreground line-through">
                                                                    ${item.price?.toFixed(2)}
                                                                </span>
                                                                <span className={`font-semibold ${item.custom_price < item.price ? 'text-green-600' : 'text-orange-600'}`}>
                                                                    ${item.custom_price?.toFixed(2)}
                                                                </span>
                                                            </div>
                                                            <Badge variant="outline" className={`text-xs ${item.custom_price < item.price ? 'border-green-200 bg-green-50 text-green-700' : 'border-orange-200 bg-orange-50 text-orange-700'}`}>
                                                                {item.custom_price < item.price ? '↓' : '↑'} Custom Price
                                                            </Badge>
                                                        </div>
                                                    ) : (
                                                        <div className="font-semibold">
                                                            ${item.price?.toFixed(2) || '0.00'}
                                                        </div>
                                                    )}
                                                    <Badge variant={item.is_available_in_menu ? "default" : "secondary"} className="mt-1">
                                                        {item.is_available_in_menu ? 'Available' : 'Unavailable'}
                                                    </Badge>
                                                </div>
                                            </div>
                                        </Card>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
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
                                <Button onClick={() => setIsScheduleSheetOpen(true)}>
                                    <Plus className="h-4 w-4 mr-2" />
                                    Add Schedule
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {schedulesLoading ? (
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
                                    <p className="font-medium">{items.length} items</p>
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
                                    onClick={() => setIsDeleteDialogOpen(true)}
                                >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete Menu
                                </Button>
                            </div>
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
                            Are you sure you want to delete "{menu.name}"? This action cannot be undone.
                            All items and categories will be unlinked from this menu.
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
                existingSchedules={unassignedSchedules}
                isLoadingSchedules={schedulesLoading}
                onCreateSchedule={handleCreateSchedule}
                onAssignSchedule={handleAssignSchedule}
            />
        </div>
    )
}
