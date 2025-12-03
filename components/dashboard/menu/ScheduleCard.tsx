'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
    Calendar,
    Clock,
    ChevronDown,
    ChevronUp,
    Trash2,
    MoreVertical,
    Zap
} from 'lucide-react'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SchedulesModel, ScheduleTimeSlotsModel } from '@/types/db-modles'
import { cn } from '@/lib/utils'

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

interface ScheduleCardProps {
    schedule: SchedulesModel & {
        schedule_time_slots: ScheduleTimeSlotsModel[]
    }
    index?: number
    onRemove?: () => void
    onEdit?: () => void
}

// Helper to format time from "HH:MM:SS" to "HH:MM AM/PM"
function formatTime(time: string): string {
    const [hours, minutes] = time.split(':').map(Number)
    const ampm = hours >= 12 ? 'PM' : 'AM'
    const hour12 = hours % 12 || 12
    return `${hour12}:${minutes.toString().padStart(2, '0')} ${ampm}`
}

// Helper to check if schedule is currently active
function isCurrentlyActive(timeSlots: ScheduleTimeSlotsModel[]): boolean {
    const now = new Date()
    const currentDay = now.getDay()
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:00`

    return timeSlots.some(slot =>
        slot.is_active &&
        slot.day_of_week === currentDay &&
        slot.start_time <= currentTime &&
        slot.end_time >= currentTime
    )
}

// Helper to parse time to minutes for positioning
function timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number)
    return hours * 60 + minutes
}

export function ScheduleCard({ schedule, index = 0, onRemove, onEdit }: ScheduleCardProps) {
    const [isExpanded, setIsExpanded] = useState(false)

    const timeSlots = schedule.schedule_time_slots || []
    const isLive = isCurrentlyActive(timeSlots)

    // Group time slots by day
    const slotsByDay = useMemo(() => {
        const grouped: Record<number, ScheduleTimeSlotsModel[]> = {}
        timeSlots.forEach(slot => {
            if (!grouped[slot.day_of_week]) {
                grouped[slot.day_of_week] = []
            }
            grouped[slot.day_of_week].push(slot)
        })
        // Sort slots within each day by start time
        Object.keys(grouped).forEach(day => {
            grouped[Number(day)].sort((a, b) => a.start_time.localeCompare(b.start_time))
        })
        return grouped
    }, [timeSlots])

    // Get unique active days count
    const activeDaysCount = Object.keys(slotsByDay).length

    return (
        <Card
            className={cn(
                "group transition-all duration-300 hover:shadow-lg overflow-hidden",
                "animate-in fade-in slide-in-from-bottom-4",
                isLive && "ring-2 ring-green-500/50"
            )}
            style={{ animationDelay: `${index * 100}ms`, animationFillMode: 'both' }}
        >
            <CardContent className="p-0">
                {/* Header */}
                <div className="p-4 flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className={cn(
                            "h-10 w-10 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                            isLive
                                ? "bg-green-500/20 text-green-600"
                                : "bg-primary/10 text-primary group-hover:bg-primary/20"
                        )}>
                            <Calendar className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <h3 className="font-semibold truncate group-hover:text-primary transition-colors">
                                    {schedule.name}
                                </h3>
                                {isLive && (
                                    <Badge
                                        variant="default"
                                        className="bg-green-500 text-white shrink-0 animate-pulse"
                                    >
                                        <Zap className="h-3 w-3 mr-1" />
                                        Live
                                    </Badge>
                                )}
                            </div>
                            {schedule.description && (
                                <p className="text-sm text-muted-foreground line-clamp-1 mt-0.5">
                                    {schedule.description}
                                </p>
                            )}
                            <div className="flex items-center gap-2 mt-2">
                                <Badge variant={schedule.is_active ? "default" : "secondary"} className="text-xs">
                                    {schedule.is_active ? 'Active' : 'Inactive'}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                    {activeDaysCount} day{activeDaysCount !== 1 ? 's' : ''} · {timeSlots.length} time slot{timeSlots.length !== 1 ? 's' : ''}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-1">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <MoreVertical className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                {onEdit && (
                                    <DropdownMenuItem onClick={onEdit}>
                                        Edit Schedule
                                    </DropdownMenuItem>
                                )}
                                {onRemove && (
                                    <DropdownMenuItem onClick={onRemove} className="text-destructive">
                                        <Trash2 className="h-4 w-4 mr-2" />
                                        Remove from Menu
                                    </DropdownMenuItem>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>

                {/* Mini Weekly Calendar */}
                <div className="px-4 pb-3">
                    <div className="flex gap-1">
                        {DAYS_OF_WEEK.map((day, dayIndex) => {
                            const hasSlots = slotsByDay[dayIndex]?.length > 0
                            const isToday = new Date().getDay() === dayIndex

                            return (
                                <div
                                    key={day}
                                    className={cn(
                                        "flex-1 text-center py-1.5 px-1 rounded-md text-xs font-medium transition-all duration-300",
                                        hasSlots
                                            ? "bg-primary/20 text-primary"
                                            : "bg-muted/50 text-muted-foreground",
                                        isToday && hasSlots && "ring-2 ring-primary ring-offset-1",
                                        isToday && !hasSlots && "ring-1 ring-muted-foreground/30"
                                    )}
                                    style={{
                                        animationDelay: `${(index * 100) + (dayIndex * 30)}ms`,
                                    }}
                                >
                                    {day}
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* Expandable Time Slots Detail */}
                <div className="border-t">
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="w-full px-4 py-2 flex items-center justify-between text-sm text-muted-foreground hover:bg-muted/50 transition-colors"
                    >
                        <span className="flex items-center gap-2">
                            <Clock className="h-4 w-4" />
                            {isExpanded ? 'Hide' : 'View'} time slots
                        </span>
                        {isExpanded ? (
                            <ChevronUp className="h-4 w-4 transition-transform" />
                        ) : (
                            <ChevronDown className="h-4 w-4 transition-transform" />
                        )}
                    </button>

                    <div className={cn(
                        "overflow-hidden transition-all duration-300",
                        isExpanded ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
                    )}>
                        <div className="px-4 pb-4 space-y-2">
                            {DAYS_OF_WEEK.map((day, dayIndex) => {
                                const daySlots = slotsByDay[dayIndex]
                                if (!daySlots?.length) return null

                                const isToday = new Date().getDay() === dayIndex

                                return (
                                    <div
                                        key={day}
                                        className={cn(
                                            "p-3 rounded-lg transition-all duration-200",
                                            isToday
                                                ? "bg-primary/10 border border-primary/20"
                                                : "bg-muted/30"
                                        )}
                                        style={{
                                            animationDelay: `${dayIndex * 50}ms`,
                                        }}
                                    >
                                        <div className="flex items-center justify-between mb-2">
                                            <span className={cn(
                                                "text-sm font-medium",
                                                isToday && "text-primary"
                                            )}>
                                                {DAYS_FULL[dayIndex]}
                                                {isToday && (
                                                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                                                        (Today)
                                                    </span>
                                                )}
                                            </span>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {daySlots.map((slot, slotIndex) => {
                                                const now = new Date()
                                                const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:00`
                                                const isCurrentSlot = isToday &&
                                                    slot.start_time <= currentTime &&
                                                    slot.end_time >= currentTime

                                                return (
                                                    <div
                                                        key={slot.id}
                                                        className={cn(
                                                            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all",
                                                            isCurrentSlot
                                                                ? "bg-green-500 text-white animate-pulse"
                                                                : slot.is_active
                                                                    ? "bg-background border shadow-sm"
                                                                    : "bg-muted text-muted-foreground line-through"
                                                        )}
                                                        style={{
                                                            animationDelay: `${(dayIndex * 50) + (slotIndex * 30)}ms`,
                                                        }}
                                                    >
                                                        <Clock className="h-3 w-3" />
                                                        {formatTime(slot.start_time)} - {formatTime(slot.end_time)}
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )
                            })}

                            {timeSlots.length === 0 && (
                                <div className="text-center py-4 text-sm text-muted-foreground">
                                    No time slots defined
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}

// Export helper functions for reuse
export { formatTime, isCurrentlyActive, timeToMinutes, DAYS_OF_WEEK, DAYS_FULL }

