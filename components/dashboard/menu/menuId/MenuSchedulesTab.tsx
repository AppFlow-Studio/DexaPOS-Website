'use client'

import { Panel, PanelSection } from '@/components/dashboard/shell'
import { Button } from '@/components/ui/button'
import { Empty } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { Calendar, Plus } from 'lucide-react'
import { WeeklyScheduleView } from '../WeeklyScheduleView'
import { ScheduleCard } from '../ScheduleCard'
import { SchedulesModel, ScheduleTimeSlotsModel } from '@/types/db-modles'

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
    return (
        <div className="space-y-4">
            {/* Weekly Schedule Overview */}
            {menuSchedules.length > 0 && (
                <WeeklyScheduleView schedules={menuSchedules} />
            )}

            {/* Schedule Cards */}
            <Panel>
                <PanelSection
                    icon={Calendar}
                    label="Assigned Schedule"
                    caption={
                        menuSchedules.length === 0
                            ? "No schedules assigned yet"
                            : `${menuSchedules.length} schedule${menuSchedules.length !== 1 ? 's' : ''} controlling menu availability`
                    }
                >
                    {scopeLabel && (
                        <p className="-mt-1 mb-4 text-xs text-muted-foreground">
                            {scopeLabel}
                        </p>
                    )}
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
                                <Button onClick={onOpenScheduleSheet} className="rounded-full">
                                    <Plus className="h-4 w-4 mr-2" />
                                    Add Schedule
                                </Button>
                            }
                        />
                    ) : (
                        <div className="space-y-4">
                            {menuSchedules.map((schedule, index) => {
                                const scopeName = schedule.assignment_location_id
                                    ? (locationNameById?.[schedule.assignment_location_id] ?? 'Location')
                                    : 'Global'
                                return (
                                    <div key={`${schedule.id}:${schedule.assignment_location_id ?? 'global'}`} className="space-y-2">
                                        <div className="flex items-center gap-2">
                                            <span className="inline-flex items-center rounded-full bg-muted/60 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                                                {scopeName}
                                            </span>
                                        </div>
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
                </PanelSection>
            </Panel>
        </div>
    )
}

