'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    Calendar,
    Plus,
    Search,
    Clock,
    MoreVertical,
    Trash2,
    Power,
    Edit,
    Utensils,
    Zap
} from 'lucide-react'
import { useState, useMemo } from 'react'
import { useUserInfo } from '../../../manage/hooks/useUserInfo.'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Empty } from '@/components/ui/empty'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import {
    GetSchedulesWithMenus,
    CreateSchedule,
    UpdateSchedule,
    DeleteSchedule,
    ToggleScheduleActive,
    CreateTimeSlot,
    DeleteTimeSlot,
} from '../../actions/schedules'
import { ScheduleCard, DAYS_OF_WEEK, formatTime, isCurrentlyActive } from '@/components/dashboard/menu/ScheduleCard'
import { CreateScheduleSheet } from '@/components/dashboard/menu/CreateScheduleSheet'
import { ScheduleDetailSheet } from '@/components/dashboard/menu/ScheduleDetailSheet'
import { SchedulesModel, ScheduleTimeSlotsModel } from '@/types/db-modles'
import { cn } from '@/lib/utils'

interface ScheduleWithMenus extends SchedulesModel {
    schedule_time_slots: ScheduleTimeSlotsModel[]
    menu_schedules: Array<{
        id: string
        menu: {
            id: string
            name: string
            is_active: boolean
        } | null
    }>
}

export default function SchedulesPage() {
    const router = useRouter()
    const queryClient = useQueryClient()
    const { data: userInfo } = useUserInfo()
    const clerkOrgId = userInfo?.members?.[0]?.organizations?.id

    // Fetch schedules with menus
    const { data: schedules, isLoading, refetch } = useQuery({
        queryKey: ['schedules-with-menus', clerkOrgId],
        queryFn: () => GetSchedulesWithMenus(clerkOrgId || ''),
        enabled: !!clerkOrgId,
    })

    const [searchTerm, setSearchTerm] = useState('')
    const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false)
    const [selectedSchedule, setSelectedSchedule] = useState<ScheduleWithMenus | null>(null)
    const [isDetailSheetOpen, setIsDetailSheetOpen] = useState(false)
    const [scheduleToDelete, setScheduleToDelete] = useState<ScheduleWithMenus | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)

    const schedulesList = useMemo(() => {
        return Array.isArray(schedules) ? schedules as ScheduleWithMenus[] : []
    }, [schedules])

    const filteredSchedules = useMemo(() => {
        return schedulesList.filter(schedule =>
            schedule.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            schedule.description?.toLowerCase().includes(searchTerm.toLowerCase())
        )
    }, [schedulesList, searchTerm])

    const activeSchedules = schedulesList.filter(s => s.is_active).length
    const inactiveSchedules = schedulesList.filter(s => !s.is_active).length
    const liveSchedules = schedulesList.filter(s => s.is_active && isCurrentlyActive(s.schedule_time_slots)).length

    // Handler functions
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

        const result = await CreateSchedule(clerkOrgId, {
            name: data.name,
            description: data.description,
            time_slots: data.time_slots,
        })

        if (result.error) {
            return { error: result.error }
        }

        queryClient.invalidateQueries({ queryKey: ['schedules-with-menus'] })
        refetch()

        return { data: result.data }
    }

    const handleUpdateSchedule = async (scheduleId: string, data: {
        name?: string
        description?: string
        is_active?: boolean
    }) => {
        const result = await UpdateSchedule(scheduleId, data)

        if (result.error) {
            return { error: result.error }
        }

        queryClient.invalidateQueries({ queryKey: ['schedules-with-menus'] })
        refetch()

        return {}
    }

    const handleToggleActive = async (scheduleId: string) => {
        const result = await ToggleScheduleActive(scheduleId)

        if (result.error) {
            return { error: result.error }
        }

        queryClient.invalidateQueries({ queryKey: ['schedules-with-menus'] })
        refetch()

        return {}
    }

    const handleDeleteSchedule = async (scheduleId: string) => {
        const result = await DeleteSchedule(scheduleId)

        if (result.error) {
            return { error: result.error }
        }

        queryClient.invalidateQueries({ queryKey: ['schedules-with-menus'] })
        refetch()

        return {}
    }

    const handleConfirmDelete = async () => {
        if (!scheduleToDelete) return

        setIsDeleting(true)
        try {
            const result = await DeleteSchedule(scheduleToDelete.id)

            if (result.error) {
                toast.error('Delete Failed', { description: result.error })
                return
            }

            toast.success('Schedule Deleted', {
                description: `"${scheduleToDelete.name}" has been permanently deleted.`
            })

            queryClient.invalidateQueries({ queryKey: ['schedules-with-menus'] })
            refetch()
            setScheduleToDelete(null)
        } catch {
            toast.error('Delete Failed', {
                description: 'Unable to delete the schedule. Please try again.'
            })
        } finally {
            setIsDeleting(false)
        }
    }

    const handleCreateTimeSlot = async (scheduleId: string, data: {
        day_of_week: number
        start_time: string
        end_time: string
    }) => {
        const result = await CreateTimeSlot(scheduleId, data)

        if (result.error) {
            return { error: result.error }
        }

        queryClient.invalidateQueries({ queryKey: ['schedules-with-menus'] })
        refetch()

        return {}
    }

    const handleDeleteTimeSlot = async (timeSlotId: string) => {
        const result = await DeleteTimeSlot(timeSlotId)

        if (result.error) {
            return { error: result.error }
        }

        queryClient.invalidateQueries({ queryKey: ['schedules-with-menus'] })
        refetch()

        return {}
    }

    const handleQuickToggle = async (schedule: ScheduleWithMenus) => {
        const result = await ToggleScheduleActive(schedule.id)

        if (result.error) {
            toast.error('Update Failed', { description: result.error })
            return
        }

        toast.success(schedule.is_active ? 'Schedule Deactivated' : 'Schedule Activated')
        queryClient.invalidateQueries({ queryKey: ['schedules-with-menus'] })
        refetch()
    }

    const openScheduleDetail = (schedule: ScheduleWithMenus) => {
        setSelectedSchedule(schedule)
        setIsDetailSheetOpen(true)
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Schedules</h2>
                    <p className="text-muted-foreground">
                        Manage schedules for menus and categories
                    </p>
                </div>
                <Button onClick={() => setIsCreateSheetOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Schedule
                </Button>
            </div>

            {/* Stats Overview */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card className="transition-all hover:shadow-md">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Schedules</CardTitle>
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{schedulesList.length}</div>
                        <p className="text-xs text-muted-foreground">
                            All schedules
                        </p>
                    </CardContent>
                </Card>
                <Card className="transition-all hover:shadow-md">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Live Now</CardTitle>
                        <Zap className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600">{liveSchedules}</div>
                        <p className="text-xs text-muted-foreground">
                            Currently active
                        </p>
                    </CardContent>
                </Card>
                <Card className="transition-all hover:shadow-md">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active</CardTitle>
                        <Clock className="h-4 w-4 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-blue-600">{activeSchedules}</div>
                        <p className="text-xs text-muted-foreground">
                            Enabled schedules
                        </p>
                    </CardContent>
                </Card>
                <Card className="transition-all hover:shadow-md">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Inactive</CardTitle>
                        <Clock className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{inactiveSchedules}</div>
                        <p className="text-xs text-muted-foreground">
                            Disabled schedules
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Schedules List */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>All Schedules</CardTitle>
                            <CardDescription>View and manage all your schedules</CardDescription>
                        </div>
                        <div className="relative">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search schedules..."
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
                            {[1, 2, 3, 4, 5].map((i) => (
                                <Skeleton key={i} className="h-24 w-full" />
                            ))}
                        </div>
                    ) : filteredSchedules.length === 0 ? (
                        <Empty
                            icon={Calendar}
                            title={schedulesList.length === 0 ? "No schedules yet" : "No schedules found"}
                            description={
                                schedulesList.length === 0
                                    ? "Get started by creating your first schedule"
                                    : "Try adjusting your search terms"
                            }
                            action={
                                schedulesList.length === 0 ? (
                                    <Button onClick={() => setIsCreateSheetOpen(true)}>
                                        <Plus className="h-4 w-4 mr-2" />
                                        Create Schedule
                                    </Button>
                                ) : null
                            }
                        />
                    ) : (
                        <div className="space-y-3">
                            {filteredSchedules.map((schedule, index) => {
                                const isLive = isCurrentlyActive(schedule.schedule_time_slots)
                                const menuCount = schedule.menu_schedules?.filter(ms => ms.menu).length || 0
                                const slotCount = schedule.schedule_time_slots?.length || 0
                                const activeDays = [...new Set(schedule.schedule_time_slots?.map(s => s.day_of_week) || [])].length

                                return (
                                    <Card
                                        key={schedule.id}
                                        className={cn(
                                            "group transition-all hover:shadow-md cursor-pointer animate-in fade-in slide-in-from-left-4",
                                            isLive && "ring-2 ring-green-500/50"
                                        )}
                                        style={{ animationDelay: `${index * 50}ms` }}
                                        onClick={() => openScheduleDetail(schedule)}
                                    >
                                        <CardContent className="p-4">
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="flex items-start gap-4 flex-1">
                                                    <div className={cn(
                                                        "h-12 w-12 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                                                        isLive
                                                            ? "bg-green-500/20 text-green-600"
                                                            : "bg-primary/10 text-primary group-hover:bg-primary/20"
                                                    )}>
                                                        <Calendar className="h-6 w-6" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <h3 className="font-semibold group-hover:text-primary transition-colors">
                                                                {schedule.name}
                                                            </h3>
                                                            {isLive && (
                                                                <Badge className="bg-green-500 text-white animate-pulse">
                                                                    <Zap className="h-3 w-3 mr-1" />
                                                                    Live
                                                                </Badge>
                                                            )}
                                                            <Badge variant={schedule.is_active ? "default" : "secondary"}>
                                                                {schedule.is_active ? 'Active' : 'Inactive'}
                                                            </Badge>
                                                        </div>
                                                        {schedule.description && (
                                                            <p className="text-sm text-muted-foreground line-clamp-1 mt-0.5">
                                                                {schedule.description}
                                                            </p>
                                                        )}
                                                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                                                            <span className="flex items-center gap-1">
                                                                <Clock className="h-3 w-3" />
                                                                {activeDays} day{activeDays !== 1 ? 's' : ''}, {slotCount} slot{slotCount !== 1 ? 's' : ''}
                                                            </span>
                                                            {menuCount > 0 && (
                                                                <span className="flex items-center gap-1">
                                                                    <Utensils className="h-3 w-3" />
                                                                    {menuCount} menu{menuCount !== 1 ? 's' : ''}
                                                                </span>
                                                            )}
                                                        </div>

                                                        {/* Mini Day Indicator */}
                                                        <div className="flex gap-1 mt-2">
                                                            {DAYS_OF_WEEK.map((day, dayIndex) => {
                                                                const hasSlots = schedule.schedule_time_slots?.some(s => s.day_of_week === dayIndex)
                                                                const isToday = new Date().getDay() === dayIndex

                                                                return (
                                                                    <div
                                                                        key={day}
                                                                        className={cn(
                                                                            "w-6 h-6 rounded text-[10px] font-medium flex items-center justify-center transition-all",
                                                                            hasSlots
                                                                                ? "bg-primary/20 text-primary"
                                                                                : "bg-muted/50 text-muted-foreground/50",
                                                                            isToday && hasSlots && "ring-1 ring-primary"
                                                                        )}
                                                                    >
                                                                        {day[0]}
                                                                    </div>
                                                                )
                                                            })}
                                                        </div>
                                                    </div>
                                                </div>

                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8">
                                                            <MoreVertical className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem onClick={(e) => {
                                                            e.stopPropagation()
                                                            openScheduleDetail(schedule)
                                                        }}>
                                                            <Edit className="mr-2 h-4 w-4" />
                                                            View & Edit
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onClick={(e) => {
                                                            e.stopPropagation()
                                                            handleQuickToggle(schedule)
                                                        }}>
                                                            <Power className="mr-2 h-4 w-4" />
                                                            {schedule.is_active ? 'Deactivate' : 'Activate'}
                                                        </DropdownMenuItem>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem
                                                            onClick={(e) => {
                                                                e.stopPropagation()
                                                                setScheduleToDelete(schedule)
                                                            }}
                                                            className="text-destructive"
                                                        >
                                                            <Trash2 className="mr-2 h-4 w-4" />
                                                            Delete
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>
                                        </CardContent>
                                    </Card>
                                )
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Create Schedule Sheet */}
            <CreateScheduleSheet
                open={isCreateSheetOpen}
                onOpenChange={setIsCreateSheetOpen}
                onCreateSchedule={handleCreateSchedule}
            />

            {/* Schedule Detail Sheet */}
            <ScheduleDetailSheet
                open={isDetailSheetOpen}
                onOpenChange={(open) => {
                    setIsDetailSheetOpen(open)
                    if (!open) {
                        // Refresh when closing to get updated data
                        refetch()
                        setSelectedSchedule(null)
                    }
                }}
                schedule={selectedSchedule}
                onUpdate={handleUpdateSchedule}
                onDelete={handleDeleteSchedule}
                onToggleActive={handleToggleActive}
                onCreateTimeSlot={handleCreateTimeSlot}
                onDeleteTimeSlot={handleDeleteTimeSlot}
                onNavigateToMenu={(menuId) => {
                    setIsDetailSheetOpen(false)
                    router.push(`/dashboard/menu/${menuId}`)
                }}
            />

            {/* Delete Confirmation Dialog */}
            <Dialog open={!!scheduleToDelete} onOpenChange={(open) => !open && setScheduleToDelete(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-destructive">
                            <Trash2 className="h-5 w-5" />
                            Delete Schedule
                        </DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete "{scheduleToDelete?.name}"? This action cannot be undone.
                            {scheduleToDelete?.menu_schedules && scheduleToDelete.menu_schedules.filter(ms => ms.menu).length > 0 && (
                                <span className="block mt-2 text-amber-600">
                                    Warning: This schedule is currently used by {scheduleToDelete.menu_schedules.filter(ms => ms.menu).length} menu(s).
                                    They will no longer have this schedule.
                                </span>
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setScheduleToDelete(null)}
                            disabled={isDeleting}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleConfirmDelete}
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
                                    Delete Schedule
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
