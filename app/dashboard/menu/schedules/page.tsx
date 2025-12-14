'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Calendar, Plus, Search, Edit3, Trash2, Clock, Eye, EyeOff, MapPin, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import {
    useLocationScopedSchedules,
    useIsAllLocations,
    useSelectedLocation,
    useDeleteScheduleMutation,
    useScheduleVisibilityMutation
} from '../../hooks/useLocationScopedSchedules'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Empty } from '@/components/ui/empty'
import { ScheduleFormSheet } from '@/components/dashboard/menu/ScheduleFormSheet'
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
import { useUserInfo } from '@/app/manage/hooks/useUserInfo.'

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const formatTimeSlot = (slot: any) => {
    const days = DAYS_OF_WEEK
    return `${days[slot.day_of_week]} ${slot.start_time.slice(0, 5)} - ${slot.end_time.slice(0, 5)}`
}

//TODO: SETUP LATE NIGHT SCHEDULE HANDLERS

export default function SchedulesPage() {
    const { data: userInfo } = useUserInfo()
    const clerkOrgId = userInfo?.members?.[0]?.organizations?.id
    const isAllLocations = useIsAllLocations()
    const selectedLocation = useSelectedLocation()

    const { data: schedules, isLoading, refetch } = useLocationScopedSchedules()
    const deleteScheduleMutation = useDeleteScheduleMutation()
    const visibilityMutation = useScheduleVisibilityMutation()

    const [searchTerm, setSearchTerm] = useState('')
    const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false)
    const [editingSchedule, setEditingSchedule] = useState<any>(null)
    const [deletingSchedule, setDeletingSchedule] = useState<any>(null)
    const [expandedSchedules, setExpandedSchedules] = useState<Record<string, boolean>>({})

    const schedulesList = Array.isArray(schedules) ? schedules : []
    const filteredSchedules = schedulesList.filter(schedule =>
        schedule.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        schedule.description?.toLowerCase().includes(searchTerm.toLowerCase())
    )

    const activeSchedules = schedulesList.filter(s => s.effective_is_active).length
    const totalTimeSlots = schedulesList.reduce((acc, s) => acc + (s.schedule_time_slots?.length || 0), 0)
    const globalSchedules = schedulesList.filter(s => !s.is_location_specific).length
    const locationSchedules = schedulesList.filter(s => s.is_location_specific).length

    const toggleExpand = (scheduleId: string) => {
        setExpandedSchedules(prev => ({ ...prev, [scheduleId]: !prev[scheduleId] }))
    }

    const handleDelete = async () => {
        if (!deletingSchedule) return
        deleteScheduleMutation.mutate(deletingSchedule.id, {
            onSuccess: () => {
                setDeletingSchedule(null)
            }
        })
    }

    const handleToggleVisibility = (scheduleId: string, isActive: boolean) => {
        visibilityMutation.mutate({ scheduleId, isActive })
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Schedules</h2>
                    <p className="text-muted-foreground">
                        Manage availability schedules for menus and categories
                        {!isAllLocations && selectedLocation && (
                            <Badge variant="secondary" className="ml-2">
                                {selectedLocation.name}
                            </Badge>
                        )}
                    </p>
                </div>
                <Button onClick={() => setIsCreateSheetOpen(true)} className="gap-2">
                    <Plus className="h-4 w-4" />
                    {isAllLocations ? 'Create Global Schedule' : 'Create Location Schedule'}
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
                            {globalSchedules} global, {locationSchedules} location-specific
                        </p>
                    </CardContent>
                </Card>
                <Card className="transition-all hover:shadow-md">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active</CardTitle>
                        <Eye className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600">{activeSchedules}</div>
                        <p className="text-xs text-muted-foreground">
                            Currently active
                        </p>
                    </CardContent>
                </Card>
                <Card className="transition-all hover:shadow-md">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Time Slots</CardTitle>
                        <Clock className="h-4 w-4 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-blue-600">{totalTimeSlots}</div>
                        <p className="text-xs text-muted-foreground">
                            Across all schedules
                        </p>
                    </CardContent>
                </Card>
                <Card className="transition-all hover:shadow-md">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Context</CardTitle>
                        <MapPin className="h-4 w-4 text-purple-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-purple-600">
                            {isAllLocations ? 'All' : '1'}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {isAllLocations ? 'All locations' : selectedLocation?.name}
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Schedules List */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Schedule Library</CardTitle>
                            <CardDescription>View and manage your availability schedules</CardDescription>
                        </div>
                        <div className="relative w-64">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                placeholder="Search schedules..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9"
                            />
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="space-y-3">
                            {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full" />)}
                        </div>
                    ) : filteredSchedules.length === 0 ? (
                        <Empty
                            icon={Calendar}
                            title="No schedules found"
                            description={searchTerm ? "No schedules match your search" : "Create your first schedule to get started"}
                            action={
                                !searchTerm && (
                                    <Button onClick={() => setIsCreateSheetOpen(true)}>
                                        <Plus className="h-4 w-4 mr-2" />
                                        Create Schedule
                                    </Button>
                                )
                            }
                        />
                    ) : (
                        <div className="space-y-3">
                            {filteredSchedules.map(schedule => (
                                <Collapsible
                                    key={schedule.id}
                                    open={expandedSchedules[schedule.id]}
                                    onOpenChange={() => toggleExpand(schedule.id)}
                                >
                                    <div className={cn(
                                        "border rounded-lg p-4 transition-all",
                                        !schedule.effective_is_active && "opacity-60"
                                    )}>
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2">
                                                    <CollapsibleTrigger asChild>
                                                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                                                            <ChevronDown className={cn(
                                                                "h-4 w-4 transition-transform",
                                                                expandedSchedules[schedule.id] && "rotate-180"
                                                            )} />
                                                        </Button>
                                                    </CollapsibleTrigger>
                                                    <h4 className="font-semibold">{schedule.name}</h4>

                                                    {/* Badges */}
                                                    {schedule.is_location_specific && (
                                                        <Badge variant="outline" className="gap-1">
                                                            <MapPin className="h-3 w-3" />
                                                            Location
                                                        </Badge>
                                                    )}
                                                    {schedule.has_location_override && (
                                                        <Badge variant="secondary">
                                                            Override
                                                        </Badge>
                                                    )}
                                                    <Badge variant={schedule.effective_is_active ? "default" : "secondary"}>
                                                        {schedule.effective_is_active ? 'Active' : 'Inactive'}
                                                    </Badge>
                                                </div>
                                                {schedule.description && (
                                                    <p className="text-sm text-muted-foreground mt-1">
                                                        {schedule.description}
                                                    </p>
                                                )}
                                                <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                                                    <span className="flex items-center gap-1">
                                                        <Clock className="h-3 w-3" />
                                                        {schedule.schedule_time_slots?.length || 0} time slots
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                {/* Location-specific visibility toggle */}
                                                {!isAllLocations && !schedule.is_location_specific && (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleToggleVisibility(
                                                            schedule.id,
                                                            !schedule.effective_is_active
                                                        )}
                                                    >
                                                        {schedule.effective_is_active ? (
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

                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setEditingSchedule(schedule)}
                                                >
                                                    <Edit3 className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setDeletingSchedule(schedule)}
                                                >
                                                    <Trash2 className="h-4 w-4 text-destructive" />
                                                </Button>
                                            </div>
                                        </div>

                                        {/* Expanded Content */}
                                        <CollapsibleContent className="mt-4">
                                            <div className="border-t pt-4">
                                                <h5 className="text-sm font-medium mb-2">Time Slots</h5>
                                                {schedule.schedule_time_slots?.length > 0 ? (
                                                    <div className="grid gap-2 md:grid-cols-2">
                                                        {schedule.schedule_time_slots.map((slot: any) => (
                                                            <div
                                                                key={slot.id}
                                                                className={cn(
                                                                    "flex items-center justify-between p-2 rounded-md border text-sm",
                                                                    !slot.is_active && "opacity-50"
                                                                )}
                                                            >
                                                                <span>{formatTimeSlot(slot)}</span>
                                                                {!slot.is_active && (
                                                                    <Badge variant="secondary" className="text-xs">
                                                                        Inactive
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <p className="text-sm text-muted-foreground">No time slots defined</p>
                                                )}
                                            </div>
                                        </CollapsibleContent>
                                    </div>
                                </Collapsible>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Create/Edit Sheet */}
            <ScheduleFormSheet
                open={isCreateSheetOpen || !!editingSchedule}
                onOpenChange={(open) => {
                    if (!open) {
                        setIsCreateSheetOpen(false)
                        setEditingSchedule(null)
                    }
                }}
                clerkOrgId={clerkOrgId}
                editSchedule={editingSchedule}
                onCreateSchedule={() => {}}
                onAssignSchedule={() => {}}
                onSuccess={() => {
                    setIsCreateSheetOpen(false)
                    setEditingSchedule(null)
                    refetch()
                }}
            />

            {/* Delete Confirmation Dialog */}
            <Dialog open={!!deletingSchedule} onOpenChange={() => setDeletingSchedule(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete Schedule</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete "{deletingSchedule?.name}"? This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeletingSchedule(null)}>
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleDelete}
                            disabled={deleteScheduleMutation.isPending}
                        >
                            {deleteScheduleMutation.isPending ? 'Deleting...' : 'Delete'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
