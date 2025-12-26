'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Empty } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { Calendar, Plus } from 'lucide-react'
import { WeeklyScheduleView } from '../WeeklyScheduleView'
import { ScheduleCard } from '../ScheduleCard'
import { SchedulesModel, ScheduleTimeSlotsModel } from '@/types/db-modles'

interface MenuSchedulesTabProps {
    menuSchedules: (SchedulesModel & {
        schedule_time_slots: ScheduleTimeSlotsModel[]
        time_slots: Array<{ id: string; day_of_week: number; start_time: string; end_time: string }>
    })[]
    isLoading: boolean
    onAddSchedule: () => void
    onOpenScheduleSheet: () => void
    onRemoveSchedule: (scheduleId: string) => void
}

export function MenuSchedulesTab({
    menuSchedules,
    isLoading,
    onAddSchedule,
    onOpenScheduleSheet,
    onRemoveSchedule,
}: MenuSchedulesTabProps) {
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
                            {menuSchedules.map((schedule, index) => (
                                <ScheduleCard
                                    key={schedule.id}
                                    schedule={schedule}
                                    index={index}
                                    onRemove={() => onRemoveSchedule(schedule.id)}
                                />
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}

