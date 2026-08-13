'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Empty } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Calendar, Plus } from 'lucide-react'
import { WeeklyScheduleView } from '../WeeklyScheduleView'
import { ScheduleCard } from '../ScheduleCard'
import { SchedulesModel, ScheduleTimeSlotsModel } from '@/types/db-modles'
import { useIsSingleLocation } from '@/stores/location-store'

export type MenuScheduleAssignment = SchedulesModel & {
    schedule_time_slots: ScheduleTimeSlotsModel[]
    time_slots: Array<{ id: string; day_of_week: number; start_time: string; end_time: string }>
    assignment_location_id: string | null
}

interface MenuSchedulesTabProps {
    menuSchedules: MenuScheduleAssignment[]
    isLoading: boolean
    scopeLabel?: string
    locationNameById?: Record<string, string>
    onAddSchedule: () => void
    onOpenScheduleSheet: () => void
    onRemoveSchedule: (scheduleId: string, assignmentLocationId: string | null) => void
    onEditSchedule?: (schedule: SchedulesModel & { schedule_time_slots: ScheduleTimeSlotsModel[] }) => void
}

export function MenuSchedulesTab({
    menuSchedules,
    isLoading,
    scopeLabel,
    locationNameById,
    onAddSchedule,
    onOpenScheduleSheet,
    onRemoveSchedule,
    onEditSchedule,
}: MenuSchedulesTabProps) {
    const isSingleLocation = useIsSingleLocation()

    return (
        <div className="space-y-4">
            {/* Weekly Schedule Overview */}
            {menuSchedules.length > 0 && (
                <WeeklyScheduleView schedules={menuSchedules} />
            )}

            {/* Schedule Cards */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Assigned Schedule</CardTitle>
                            <CardDescription>
                                {menuSchedules.length === 0
                                    ? "No schedules assigned yet"
                                    : `${menuSchedules.length} schedule${menuSchedules.length !== 1 ? 's' : ''} controlling menu availability`
                                }
                            </CardDescription>
                            {scopeLabel && (
                                <p className="text-xs text-muted-foreground mt-1">
                                    {scopeLabel}
                                </p>
                            )}
                        </div>
                        {/* <div className='items-end justify-end flex flex-col gap-2'>
                            <Button onClick={onAddSchedule}>
                                <Plus className="h-4 w-4 mr-2" />
                                Add Schedule
                            </Button>
                        </div> */}
                    </div>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="space-y-3">
                            {[1].map((i) => (
                                <Skeleton key={i} className="h-32 w-full" />
                            ))}
                        </div>
                    ) : menuSchedules.length === 0 ? (
                        <Empty
                            icon={Calendar}
                            title="No schedules assigned"
                            description="Add schedules to control when this menu is available to customers"
                            action={
                                <Button onClick={onOpenScheduleSheet}>
                                    <Plus className="h-4 w-4 mr-2" />
                                    Add Schedule
                                </Button>
                            }
                        />
                    ) : (
                        <div className="space-y-4">
                            {menuSchedules.map((schedule, index) => {
                                const scopeName = isSingleLocation
                                    ? null
                                    : schedule.assignment_location_id
                                    ? (locationNameById?.[schedule.assignment_location_id] ?? 'Location')
                                    : 'Global'
                                return (
                                    <div key={`${schedule.id}:${schedule.assignment_location_id ?? 'global'}`} className="space-y-2">
                                        {!isSingleLocation && <div className="flex items-center gap-2">
                                            <Badge variant={schedule.assignment_location_id ? 'outline' : 'secondary'}>
                                                {scopeName}
                                            </Badge>
                                        </div>}
                                        <ScheduleCard
                                            schedule={schedule}
                                            index={index}
                                            onRemove={() => onRemoveSchedule(schedule.id, schedule.assignment_location_id)}
                                            onEdit={onEditSchedule ? () => onEditSchedule(schedule) : undefined}
                                        />
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}

