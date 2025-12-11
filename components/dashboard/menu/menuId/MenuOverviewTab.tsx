'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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

export function MenuOverviewTab({ categoriesCount, totalItems, menuSchedules }: MenuOverviewTabProps) {
    return (
        <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Categories</CardTitle>
                        <Tag className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{categoriesCount}</div>
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
        </div>
    )
}

