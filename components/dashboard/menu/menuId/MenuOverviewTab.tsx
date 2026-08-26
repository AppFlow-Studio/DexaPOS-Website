'use client'

import { Panel, StatRow, StatTile } from '@/components/dashboard/shell'
import { Tag, Utensils, Clock } from 'lucide-react'
import { WeeklyScheduleView } from '../WeeklyScheduleView'
import { SchedulesModel, ScheduleTimeSlotsModel } from '@/types/db-modles'

interface MenuOverviewTabProps {
    categoriesCount: number
    totalItems: number
    menuSchedules: (SchedulesModel & {
        schedule_time_slots: ScheduleTimeSlotsModel[]
        time_slots: Array<{ id: string; day_of_week: number; start_time: string; end_time: string }>
    })[]
}

export function MenuOverviewTab({
    categoriesCount,
    totalItems,
    menuSchedules,
}: MenuOverviewTabProps) {
    return (
        <div className="space-y-4">
            <Panel padded>
                <StatRow columns={3}>
                    <StatTile
                        label="Categories"
                        value={categoriesCount}
                        meta="Total categories"
                        icon={<Tag />}
                    />
                    <StatTile
                        label="Items"
                        value={totalItems}
                        meta="Total items across all categories"
                        icon={<Utensils />}
                    />
                    <StatTile
                        label="Schedules"
                        value={menuSchedules.length}
                        meta="Active schedules"
                        icon={<Clock />}
                    />
                </StatRow>
            </Panel>

            {/* Quick Schedule Preview */}
            {menuSchedules.length > 0 && (
                <WeeklyScheduleView schedules={menuSchedules} />
            )}
        </div>
    )
}
