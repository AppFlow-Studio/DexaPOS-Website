'use client'

import { useState } from 'react'
import { Panel, PanelSection } from '@/components/dashboard/shell'
import { Button } from '@/components/ui/button'
import { Empty } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { Calendar, Plus } from 'lucide-react'
import { WeeklyScheduleView } from '../WeeklyScheduleView'
import { ScheduleCard } from '../ScheduleCard'
import { SchedulesModel, ScheduleTimeSlotsModel } from '@/types/db-modles'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
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
    const [pendingRemoval, setPendingRemoval] = useState<MenuScheduleAssignment | null>(null)
    const isSingleLocation = useIsSingleLocation()

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
                    action={
                        menuSchedules.length > 0 ? (
                            <Button
                                variant="outline"
                                onClick={onOpenScheduleSheet}
                                className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
                            >
                                <Plus className="mr-1.5 h-4 w-4" />
                                Create schedule
                            </Button>
                        ) : undefined
                    }
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
                                const scopeName = isSingleLocation
                                    ? null
                                    : schedule.assignment_location_id
                                    ? (locationNameById?.[schedule.assignment_location_id] ?? 'Location')
                                    : 'Global'
                                return (
                                    <div
                                        key={`${schedule.id}:${schedule.assignment_location_id ?? 'global'}`}
                                        className="space-y-2"
                                    >
                                        {/* Scope label is noise when there is only one location. */}
                                        {!isSingleLocation && (
                                            <div className="flex items-center gap-2">
                                                <span className="inline-flex items-center rounded-full bg-muted/60 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                                                    {scopeName}
                                                </span>
                                            </div>
                                        )}
                                        <ScheduleCard
                                            schedule={schedule}
                                            index={index}
                                            onRemove={() => setPendingRemoval(schedule)}
                                            onEdit={onEditSchedule ? () => onEditSchedule(schedule) : undefined}
                                        />
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </PanelSection>
            </Panel>

            <AlertDialog
                open={!!pendingRemoval}
                onOpenChange={(open) => {
                    if (!open) setPendingRemoval(null)
                }}
            >
                <AlertDialogContent className="rounded-3xl sm:rounded-3xl">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Remove this schedule?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {pendingRemoval
                                ? `“${pendingRemoval.name}” will be removed from this menu. The schedule itself will remain available to use elsewhere.`
                                : 'This schedule will be removed from the menu.'}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                if (!pendingRemoval) return
                                onRemoveSchedule(
                                    pendingRemoval.id,
                                    pendingRemoval.assignment_location_id,
                                )
                                setPendingRemoval(null)
                            }}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Remove schedule
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}

