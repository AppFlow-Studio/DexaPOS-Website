'use client'

import { useState, useMemo } from 'react'
import {
    BottomSheet,
    BottomSheetContent,
    BottomSheetHeader,
    BottomSheetBody,
    BottomSheetFooter,
    BottomSheetTitle,
    BottomSheetDescription,
    BottomSheetSection,
} from '@/components/ui/bottom-sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { TimeInput } from '@/components/ui/time-picker'
import { cn } from '@/lib/utils'
import {
    Plus,
    Trash2,
    Calendar,
    Clock,
    Sparkles,
    CheckCircle2,
    AlertCircle,
    ListPlus,
    FolderPlus
} from 'lucide-react'
import { SchedulesModel, ScheduleTimeSlotsModel } from '@/types/db-modles'
import { toast } from 'sonner'
import { DAYS_OF_WEEK, DAYS_FULL, formatTime } from './ScheduleCard'

interface TimeSlotInput {
    id: string
    day_of_week: number
    start_time: string
    end_time: string
}

interface ScheduleFormSheetProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    existingSchedules?: SchedulesModel[]
    isLoadingSchedules?: boolean
    onCreateSchedule: (data: {
        name: string
        description?: string
        time_slots: Array<{
            day_of_week: number
            start_time: string
            end_time: string
        }>
    }) => Promise<{ error?: string; data?: SchedulesModel }>
    onAssignSchedule: (scheduleId: string) => Promise<{ error?: string }>
}

type Mode = 'create' | 'assign'

// Generate unique ID
let idCounter = 0
const generateId = () => `slot-${++idCounter}-${Date.now()}`

export function ScheduleFormSheet({
    open,
    onOpenChange,
    existingSchedules = [],
    isLoadingSchedules,
    onCreateSchedule,
    onAssignSchedule,
}: ScheduleFormSheetProps) {
    const [mode, setMode] = useState<Mode>('create')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [showSuccess, setShowSuccess] = useState(false)

    // Create mode state
    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [selectedDays, setSelectedDays] = useState<number[]>([])
    const [timeSlots, setTimeSlots] = useState<TimeSlotInput[]>([])

    // Assign mode state
    const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null)

    // Reset form
    const resetForm = () => {
        setName('')
        setDescription('')
        setSelectedDays([])
        setTimeSlots([])
        setSelectedScheduleId(null)
        setShowSuccess(false)
    }

    // Handle close
    const handleClose = () => {
        onOpenChange(false)
        setTimeout(resetForm, 300)
    }

    // Toggle day selection
    const toggleDay = (day: number) => {
        setSelectedDays(prev => {
            if (prev.includes(day)) {
                // Remove day and its time slots
                setTimeSlots(slots => slots.filter(s => s.day_of_week !== day))
                return prev.filter(d => d !== day)
            } else {
                // Add day with default time slot
                const newSlot: TimeSlotInput = {
                    id: generateId(),
                    day_of_week: day,
                    start_time: '09:00',
                    end_time: '17:00',
                }
                setTimeSlots(slots => [...slots, newSlot])
                return [...prev, day].sort()
            }
        })
    }

    // Add time slot to a day
    const addTimeSlot = (day: number) => {
        const newSlot: TimeSlotInput = {
            id: generateId(),
            day_of_week: day,
            start_time: '09:00',
            end_time: '17:00',
        }
        setTimeSlots(prev => [...prev, newSlot])
    }

    // Remove time slot
    const removeTimeSlot = (slotId: string) => {
        setTimeSlots(prev => {
            const slot = prev.find(s => s.id === slotId)
            if (!slot) return prev

            const remainingForDay = prev.filter(
                s => s.day_of_week === slot.day_of_week && s.id !== slotId
            ).length

            // If this was the last slot for the day, remove the day from selection
            if (remainingForDay === 0) {
                setSelectedDays(days => days.filter(d => d !== slot.day_of_week))
            }

            return prev.filter(s => s.id !== slotId)
        })
    }

    // Update time slot
    const updateTimeSlot = (slotId: string, field: 'start_time' | 'end_time', value: string) => {
        setTimeSlots(prev => prev.map(slot =>
            slot.id === slotId ? { ...slot, [field]: value } : slot
        ))
    }

    // Group time slots by day for display
    const slotsByDay = useMemo(() => {
        const grouped: Record<number, TimeSlotInput[]> = {}
        timeSlots.forEach(slot => {
            if (!grouped[slot.day_of_week]) {
                grouped[slot.day_of_week] = []
            }
            grouped[slot.day_of_week].push(slot)
        })
        return grouped
    }, [timeSlots])

    // Validation
    const isCreateValid = name.trim().length >= 2 && timeSlots.length > 0
    const isAssignValid = selectedScheduleId !== null
    const isValid = mode === 'create' ? isCreateValid : isAssignValid

    // Submit handler
    const handleSubmit = async () => {
        if (!isValid) return

        setIsSubmitting(true)

        try {
            if (mode === 'create') {
                const result = await onCreateSchedule({
                    name: name.trim(),
                    description: description.trim() || undefined,
                    time_slots: timeSlots.map(slot => ({
                        day_of_week: slot.day_of_week,
                        start_time: slot.start_time + ':00',
                        end_time: slot.end_time + ':00',
                    })),
                })

                if (result.error) {
                    toast.error('Failed to create schedule', { description: result.error })
                    return
                }

                setShowSuccess(true)
                toast.success('Schedule created!', {
                    description: `"${name}" has been created and assigned to this menu.`
                })

                setTimeout(() => {
                    handleClose()
                }, 1500)
            } else {
                if (!selectedScheduleId) return

                const result = await onAssignSchedule(selectedScheduleId)

                if (result.error) {
                    toast.error('Failed to assign schedule', { description: result.error })
                    return
                }

                const schedule = existingSchedules.find(s => s.id === selectedScheduleId)
                setShowSuccess(true)
                toast.success('Schedule assigned!', {
                    description: `"${schedule?.name}" has been assigned to this menu.`
                })

                setTimeout(() => {
                    handleClose()
                }, 1500)
            }
        } catch (error) {
            toast.error('An error occurred', { description: 'Please try again.' })
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <BottomSheet open={open} onOpenChange={onOpenChange}>
            <BottomSheetContent height="95">
                {showSuccess ? (
                    // Success animation
                    <div className="flex-1 flex flex-col items-center justify-center gap-4 animate-in zoom-in-50 fade-in duration-300">
                        <div className="h-20 w-20 rounded-full bg-green-500/20 flex items-center justify-center">
                            <CheckCircle2 className="h-10 w-10 text-green-500 animate-in zoom-in-0 duration-500" />
                        </div>
                        <div className="text-center">
                            <h3 className="text-xl font-semibold text-green-600">
                                {mode === 'create' ? 'Schedule Created!' : 'Schedule Assigned!'}
                            </h3>
                            <p className="text-muted-foreground mt-1">
                                Your menu will now follow this schedule
                            </p>
                        </div>
                    </div>
                ) : (
                    <>
                        <BottomSheetHeader>
                            <BottomSheetTitle className="flex items-center gap-2">
                                <Calendar className="h-5 w-5" />
                                Add Schedule
                            </BottomSheetTitle>
                            <BottomSheetDescription>
                                Control when this menu is available to customers
                            </BottomSheetDescription>

                            {/* Mode Switcher */}
                            <div className="flex gap-2 mt-4 p-1 bg-muted/50 rounded-xl">
                                <button
                                    type="button"
                                    onClick={() => setMode('create')}
                                    className={cn(
                                        "flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all",
                                        mode === 'create'
                                            ? "bg-background shadow-sm text-foreground"
                                            : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    <FolderPlus className="h-4 w-4" />
                                    Create New
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setMode('assign')}
                                    className={cn(
                                        "flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all",
                                        mode === 'assign'
                                            ? "bg-background shadow-sm text-foreground"
                                            : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    <ListPlus className="h-4 w-4" />
                                    Use Existing
                                </button>
                            </div>
                        </BottomSheetHeader>

                        <BottomSheetBody>
                            {mode === 'create' ? (
                                // Create New Schedule Form
                                <div className="space-y-6">
                                    {/* Schedule Details */}
                                    <BottomSheetSection title="Schedule Details">
                                        <div className="space-y-4">
                                            <div>
                                                <label className="text-sm font-medium mb-1.5 block">
                                                    Schedule Name *
                                                </label>
                                                <Input
                                                    value={name}
                                                    onChange={(e) => setName(e.target.value)}
                                                    placeholder="e.g., Lunch Hours, Weekend Special"
                                                    className="h-11"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-sm font-medium mb-1.5 block">
                                                    Description (optional)
                                                </label>
                                                <Input
                                                    value={description}
                                                    onChange={(e) => setDescription(e.target.value)}
                                                    placeholder="Brief description of this schedule"
                                                    className="h-11"
                                                />
                                            </div>
                                        </div>
                                    </BottomSheetSection>

                                    {/* Day Selection */}
                                    <BottomSheetSection title="Active Days">
                                        <div className="grid grid-cols-7 gap-2">
                                            {DAYS_OF_WEEK.map((day, index) => {
                                                const isSelected = selectedDays.includes(index)
                                                return (
                                                    <button
                                                        key={day}
                                                        type="button"
                                                        onClick={() => toggleDay(index)}
                                                        className={cn(
                                                            "aspect-square rounded-xl text-sm font-medium transition-all duration-200",
                                                            "flex items-center justify-center",
                                                            "active:scale-95",
                                                            isSelected
                                                                ? "bg-primary text-primary-foreground shadow-md scale-105"
                                                                : "bg-muted/50 text-muted-foreground hover:bg-muted"
                                                        )}
                                                    >
                                                        {day}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-2">
                                            Tap to select days when this schedule is active
                                        </p>
                                    </BottomSheetSection>

                                    {/* Time Slots */}
                                    {selectedDays.length > 0 && (
                                        <BottomSheetSection title="Time Slots">
                                            <div className="space-y-4">
                                                {selectedDays.map((day, dayIdx) => {
                                                    const daySlots = slotsByDay[day] || []

                                                    return (
                                                        <div
                                                            key={day}
                                                            className="p-4 rounded-xl bg-muted/30 animate-in fade-in slide-in-from-bottom-2"
                                                            style={{ animationDelay: `${dayIdx * 50}ms` }}
                                                        >
                                                            <div className="flex items-center justify-between mb-3">
                                                                <h4 className="font-medium text-sm">
                                                                    {DAYS_FULL[day]}
                                                                </h4>
                                                                <Button
                                                                    type="button"
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    onClick={() => addTimeSlot(day)}
                                                                    className="h-7 text-xs"
                                                                >
                                                                    <Plus className="h-3 w-3 mr-1" />
                                                                    Add Slot
                                                                </Button>
                                                            </div>

                                                            <div className="space-y-2">
                                                                {daySlots.map((slot, slotIdx) => (
                                                                    <div
                                                                        key={slot.id}
                                                                        className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2"
                                                                        style={{ animationDelay: `${slotIdx * 30}ms` }}
                                                                    >
                                                                        <TimeInput
                                                                            value={slot.start_time}
                                                                            onChange={(v) => updateTimeSlot(slot.id, 'start_time', v)}
                                                                            className="flex-1"
                                                                        />
                                                                        <span className="text-muted-foreground text-sm">to</span>
                                                                        <TimeInput
                                                                            value={slot.end_time}
                                                                            onChange={(v) => updateTimeSlot(slot.id, 'end_time', v)}
                                                                            className="flex-1"
                                                                        />
                                                                        {daySlots.length > 1 && (
                                                                            <Button
                                                                                type="button"
                                                                                variant="ghost"
                                                                                size="icon"
                                                                                onClick={() => removeTimeSlot(slot.id)}
                                                                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                                                            >
                                                                                <Trash2 className="h-4 w-4" />
                                                                            </Button>
                                                                        )}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        </BottomSheetSection>
                                    )}

                                    {/* Preview */}
                                    {timeSlots.length > 0 && (
                                        <BottomSheetSection title="Preview">
                                            <div className="p-4 rounded-xl bg-primary/5 border border-primary/10">
                                                <div className="flex items-center gap-2 mb-3">
                                                    <Sparkles className="h-4 w-4 text-primary" />
                                                    <span className="text-sm font-medium">
                                                        {name || 'New Schedule'}
                                                    </span>
                                                </div>
                                                <div className="flex flex-wrap gap-2">
                                                    {selectedDays.map(day => {
                                                        const slots = slotsByDay[day] || []
                                                        return (
                                                            <Badge
                                                                key={day}
                                                                variant="secondary"
                                                                className="text-xs"
                                                            >
                                                                {DAYS_OF_WEEK[day]}: {slots.length} slot{slots.length !== 1 ? 's' : ''}
                                                            </Badge>
                                                        )
                                                    })}
                                                </div>
                                            </div>
                                        </BottomSheetSection>
                                    )}
                                </div>
                            ) : (
                                // Assign Existing Schedule
                                <div className="space-y-4">
                                    <BottomSheetSection title="Select a Schedule">
                                        {isLoadingSchedules ? (
                                            <div className="space-y-3">
                                                {[1, 2, 3].map(i => (
                                                    <Skeleton key={i} className="h-20 w-full" />
                                                ))}
                                            </div>
                                        ) : existingSchedules.length === 0 ? (
                                            <div className="text-center py-8">
                                                <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                                                <h4 className="font-medium mb-1">No schedules available</h4>
                                                <p className="text-sm text-muted-foreground mb-4">
                                                    Create a new schedule to get started
                                                </p>
                                                <Button
                                                    variant="outline"
                                                    onClick={() => setMode('create')}
                                                >
                                                    <Plus className="h-4 w-4 mr-2" />
                                                    Create Schedule
                                                </Button>
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                                {existingSchedules.map((schedule, index) => {
                                                    const isSelected = selectedScheduleId === schedule.id

                                                    return (
                                                        <button
                                                            key={schedule.id}
                                                            type="button"
                                                            onClick={() => setSelectedScheduleId(schedule.id)}
                                                            className={cn(
                                                                "w-full p-4 rounded-xl text-left transition-all duration-200",
                                                                "animate-in fade-in slide-in-from-bottom-2",
                                                                "border-2",
                                                                isSelected
                                                                    ? "border-primary bg-primary/5"
                                                                    : "border-transparent bg-muted/30 hover:bg-muted/50"
                                                            )}
                                                            style={{ animationDelay: `${index * 50}ms` }}
                                                        >
                                                            <div className="flex items-start justify-between gap-3">
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="flex items-center gap-2">
                                                                        <Calendar className={cn(
                                                                            "h-4 w-4 shrink-0",
                                                                            isSelected ? "text-primary" : "text-muted-foreground"
                                                                        )} />
                                                                        <span className="font-medium truncate">
                                                                            {schedule.name}
                                                                        </span>
                                                                    </div>
                                                                    {schedule.description && (
                                                                        <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                                                                            {schedule.description}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                                <Badge variant={schedule.is_active ? "default" : "secondary"}>
                                                                    {schedule.is_active ? 'Active' : 'Inactive'}
                                                                </Badge>
                                                            </div>

                                                            {/* Selection indicator */}
                                                            {isSelected && (
                                                                <div className="mt-3 pt-3 border-t border-primary/20 flex items-center gap-2 text-sm text-primary">
                                                                    <CheckCircle2 className="h-4 w-4" />
                                                                    Selected
                                                                </div>
                                                            )}
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                        )}
                                    </BottomSheetSection>
                                </div>
                            )}
                        </BottomSheetBody>

                        <BottomSheetFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={handleClose}
                                disabled={isSubmitting}
                                className="flex-1"
                            >
                                Cancel
                            </Button>
                            <Button
                                type="button"
                                onClick={handleSubmit}
                                disabled={!isValid || isSubmitting}
                                className="flex-1"
                            >
                                {isSubmitting ? (
                                    <>
                                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                        </svg>
                                        {mode === 'create' ? 'Creating...' : 'Assigning...'}
                                    </>
                                ) : (
                                    <>
                                        {mode === 'create' ? (
                                            <>
                                                <Plus className="h-4 w-4 mr-2" />
                                                Create & Assign
                                            </>
                                        ) : (
                                            <>
                                                <CheckCircle2 className="h-4 w-4 mr-2" />
                                                Assign Schedule
                                            </>
                                        )}
                                    </>
                                )}
                            </Button>
                        </BottomSheetFooter>
                    </>
                )}
            </BottomSheetContent>
        </BottomSheet>
    )
}

