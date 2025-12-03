'use client'

import { useMemo, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SchedulesModel, ScheduleTimeSlotsModel } from '@/types/db-modles'
import { cn } from '@/lib/utils'
import { Clock, Calendar } from 'lucide-react'
import { formatTime, DAYS_OF_WEEK, DAYS_FULL } from './ScheduleCard'

interface WeeklyScheduleViewProps {
    schedules: Array<SchedulesModel & {
        schedule_time_slots: ScheduleTimeSlotsModel[]
    }>
    className?: string
}

// Time range for the view (6 AM to 11 PM)
const START_HOUR = 6
const END_HOUR = 23
const TOTAL_HOURS = END_HOUR - START_HOUR

// Generate hour labels
const HOUR_LABELS = Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => {
    const hour = START_HOUR + i
    const ampm = hour >= 12 ? 'PM' : 'AM'
    const hour12 = hour % 12 || 12
    return `${hour12}${ampm}`
})

// Helper to convert time string to percentage position
function timeToPercent(time: string): number {
    const [hours, minutes] = time.split(':').map(Number)
    const totalMinutes = (hours - START_HOUR) * 60 + minutes
    const maxMinutes = TOTAL_HOURS * 60
    return Math.max(0, Math.min(100, (totalMinutes / maxMinutes) * 100))
}

// Colors for different schedules
const SCHEDULE_COLORS = [
    { bg: 'bg-blue-500/30', border: 'border-blue-500', text: 'text-blue-700 dark:text-blue-300' },
    { bg: 'bg-emerald-500/30', border: 'border-emerald-500', text: 'text-emerald-700 dark:text-emerald-300' },
    { bg: 'bg-violet-500/30', border: 'border-violet-500', text: 'text-violet-700 dark:text-violet-300' },
    { bg: 'bg-amber-500/30', border: 'border-amber-500', text: 'text-amber-700 dark:text-amber-300' },
    { bg: 'bg-rose-500/30', border: 'border-rose-500', text: 'text-rose-700 dark:text-rose-300' },
]

export function WeeklyScheduleView({ schedules, className }: WeeklyScheduleViewProps) {
    const [currentTime, setCurrentTime] = useState(new Date())

    // Update current time every minute
    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentTime(new Date())
        }, 60000)
        return () => clearInterval(interval)
    }, [])

    // Calculate current time position
    const currentTimePercent = useMemo(() => {
        const hours = currentTime.getHours()
        const minutes = currentTime.getMinutes()
        const time = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`
        return timeToPercent(time)
    }, [currentTime])

    const currentDay = currentTime.getDay()

    // Flatten all time slots with schedule info and colors
    const allSlots = useMemo(() => {
        const slots: Array<{
            slot: ScheduleTimeSlotsModel
            scheduleName: string
            color: typeof SCHEDULE_COLORS[0]
            scheduleIndex: number
        }> = []

        schedules.forEach((schedule, scheduleIndex) => {
            const color = SCHEDULE_COLORS[scheduleIndex % SCHEDULE_COLORS.length]
            schedule.schedule_time_slots?.forEach(slot => {
                if (slot.is_active) {
                    slots.push({
                        slot,
                        scheduleName: schedule.name,
                        color,
                        scheduleIndex,
                    })
                }
            })
        })

        return slots
    }, [schedules])

    // Group slots by day
    const slotsByDay = useMemo(() => {
        const grouped: Record<number, typeof allSlots> = {}
        for (let i = 0; i < 7; i++) {
            grouped[i] = []
        }
        allSlots.forEach(item => {
            grouped[item.slot.day_of_week].push(item)
        })
        return grouped
    }, [allSlots])

    if (schedules.length === 0) {
        return null
    }

    return (
        <Card className={cn("overflow-hidden", className)}>
            <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Weekly Availability
                </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
                {/* Legend */}
                {schedules.length > 1 && (
                    <div className="px-4 pb-3 flex flex-wrap gap-3">
                        {schedules.map((schedule, index) => {
                            const color = SCHEDULE_COLORS[index % SCHEDULE_COLORS.length]
                            return (
                                <div
                                    key={schedule.id}
                                    className="flex items-center gap-2 text-xs"
                                >
                                    <div className={cn(
                                        "w-3 h-3 rounded-sm border-l-2",
                                        color.bg,
                                        color.border
                                    )} />
                                    <span className="text-muted-foreground">{schedule.name}</span>
                                </div>
                            )
                        })}
                    </div>
                )}

                {/* Calendar Grid */}
                <div className="overflow-x-auto">
                    <div className="min-w-[600px]">
                        {/* Hour Labels */}
                        <div className="flex border-b bg-muted/30">
                            <div className="w-16 shrink-0 border-r px-2 py-1" />
                            <div className="flex-1 relative h-6">
                                {HOUR_LABELS.map((label, index) => (
                                    <span
                                        key={label}
                                        className="absolute text-[10px] text-muted-foreground -translate-x-1/2"
                                        style={{ left: `${(index / TOTAL_HOURS) * 100}%` }}
                                    >
                                        {label}
                                    </span>
                                ))}
                            </div>
                        </div>

                        {/* Day Rows */}
                        {DAYS_OF_WEEK.map((day, dayIndex) => {
                            const daySlots = slotsByDay[dayIndex]
                            const isToday = dayIndex === currentDay

                            return (
                                <div
                                    key={day}
                                    className={cn(
                                        "flex border-b last:border-b-0 transition-colors",
                                        isToday && "bg-primary/5"
                                    )}
                                >
                                    {/* Day Label */}
                                    <div className={cn(
                                        "w-16 shrink-0 border-r px-2 py-3 flex items-center",
                                        isToday && "bg-primary/10"
                                    )}>
                                        <span className={cn(
                                            "text-xs font-medium",
                                            isToday ? "text-primary" : "text-muted-foreground"
                                        )}>
                                            {day}
                                            {isToday && (
                                                <span className="block text-[10px] font-normal opacity-70">
                                                    Today
                                                </span>
                                            )}
                                        </span>
                                    </div>

                                    {/* Time Blocks */}
                                    <div className="flex-1 relative h-14 bg-muted/10">
                                        {/* Hour grid lines */}
                                        {HOUR_LABELS.map((_, index) => (
                                            <div
                                                key={index}
                                                className="absolute top-0 bottom-0 w-px bg-border/50"
                                                style={{ left: `${(index / TOTAL_HOURS) * 100}%` }}
                                            />
                                        ))}

                                        {/* Time Slots */}
                                        {daySlots.map((item, slotIndex) => {
                                            const left = timeToPercent(item.slot.start_time)
                                            const right = timeToPercent(item.slot.end_time)
                                            const width = right - left

                                            return (
                                                <div
                                                    key={item.slot.id}
                                                    className={cn(
                                                        "absolute top-1 bottom-1 rounded-md border-l-2 transition-all",
                                                        "hover:scale-y-110 hover:z-10 cursor-default",
                                                        "animate-in fade-in slide-in-from-left-2",
                                                        item.color.bg,
                                                        item.color.border
                                                    )}
                                                    style={{
                                                        left: `${left}%`,
                                                        width: `${width}%`,
                                                        animationDelay: `${(dayIndex * 50) + (slotIndex * 30)}ms`,
                                                        animationFillMode: 'both'
                                                    }}
                                                    title={`${item.scheduleName}: ${formatTime(item.slot.start_time)} - ${formatTime(item.slot.end_time)}`}
                                                >
                                                    {width > 8 && (
                                                        <div className={cn(
                                                            "absolute inset-0 flex items-center px-1.5 overflow-hidden",
                                                            item.color.text
                                                        )}>
                                                            <span className="text-[10px] font-medium truncate">
                                                                {formatTime(item.slot.start_time)}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })}

                                        {/* Current Time Indicator */}
                                        {isToday && currentTimePercent >= 0 && currentTimePercent <= 100 && (
                                            <div
                                                className="absolute top-0 bottom-0 z-20 pointer-events-none"
                                                style={{ left: `${currentTimePercent}%` }}
                                            >
                                                <div className="relative h-full">
                                                    {/* Line */}
                                                    <div className="absolute top-0 bottom-0 w-0.5 bg-red-500 animate-pulse" />
                                                    {/* Top dot */}
                                                    <div className="absolute -top-1 -left-1 w-2.5 h-2.5 rounded-full bg-red-500 shadow-sm" />
                                                    {/* Time label */}
                                                    <div className="absolute -top-5 left-1/2 -translate-x-1/2 px-1.5 py-0.5 bg-red-500 text-white text-[9px] font-medium rounded whitespace-nowrap">
                                                        {currentTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* Footer with current time info */}
                <div className="px-4 py-2 bg-muted/30 border-t flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>
                        Showing schedule from {HOUR_LABELS[0]} to {HOUR_LABELS[HOUR_LABELS.length - 1]}
                    </span>
                </div>
            </CardContent>
        </Card>
    )
}

