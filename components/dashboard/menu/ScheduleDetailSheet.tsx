'use client'

import { useState, useMemo, useEffect } from 'react'
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
import { Card, CardContent } from '@/components/ui/card'
import { TimeInput } from '@/components/ui/time-picker'
import { cn } from '@/lib/utils'
import {
    Plus,
    Trash2,
    Calendar,
    Clock,
    Utensils,
    Save,
    Power,
    AlertTriangle,
    CheckCircle2,
    ExternalLink,
    Zap
} from 'lucide-react'
import { SchedulesModel, ScheduleTimeSlotsModel } from '@/types/db-modles'
import { toast } from 'sonner'
import { DAYS_OF_WEEK, DAYS_FULL, formatTime, isCurrentlyActive } from './ScheduleCard'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'

interface TimeSlotInput {
    id: string
    day_of_week: number
    start_time: string
    end_time: string
    isNew?: boolean
    isDeleted?: boolean
}

interface ScheduleWithMenus extends SchedulesModel {
    schedule_time_slots: ScheduleTimeSlotsModel[]
    menu_schedules: Array<{
        id: string
        menu: {
            id: string
            name: string
            is_active: boolean
        } | null
    }>
}

interface ScheduleDetailSheetProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    schedule: ScheduleWithMenus | null
    onUpdate: (scheduleId: string, data: {
        name?: string
        description?: string
        is_active?: boolean
    }) => Promise<{ error?: string }>
    onDelete: (scheduleId: string) => Promise<{ error?: string }>
    onToggleActive: (scheduleId: string) => Promise<{ error?: string }>
    onCreateTimeSlot: (scheduleId: string, data: {
        day_of_week: number
        start_time: string
        end_time: string
    }) => Promise<{ error?: string }>
    onDeleteTimeSlot: (timeSlotId: string) => Promise<{ error?: string }>
    onNavigateToMenu?: (menuId: string) => void
}

// Generate unique ID
let idCounter = 0
const generateId = () => `new-slot-${++idCounter}-${Date.now()}`

export function ScheduleDetailSheet({
    open,
    onOpenChange,
    schedule,
    onUpdate,
    onDelete,
    onToggleActive,
    onCreateTimeSlot,
    onDeleteTimeSlot,
    onNavigateToMenu,
}: ScheduleDetailSheetProps) {
    const [isEditing, setIsEditing] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const [showDeleteDialog, setShowDeleteDialog] = useState(false)

    // Editable fields
    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [selectedDays, setSelectedDays] = useState<number[]>([])
    const [timeSlots, setTimeSlots] = useState<TimeSlotInput[]>([])
    const [pendingSlotDeletions, setPendingSlotDeletions] = useState<string[]>([])
    const [pendingNewSlots, setPendingNewSlots] = useState<TimeSlotInput[]>([])

    // Initialize state when schedule changes
    useEffect(() => {
        if (schedule) {
            setName(schedule.name)
            setDescription(schedule.description || '')

            const slots = schedule.schedule_time_slots || []
            const days = [...new Set(slots.map(s => s.day_of_week))].sort()
            setSelectedDays(days)

            setTimeSlots(slots.map(s => ({
                id: s.id,
                day_of_week: s.day_of_week,
                start_time: s.start_time.slice(0, 5), // Remove seconds
                end_time: s.end_time.slice(0, 5),
            })))

            setPendingSlotDeletions([])
            setPendingNewSlots([])
        }
    }, [schedule])

    // Reset editing state when sheet closes
    useEffect(() => {
        if (!open) {
            setIsEditing(false)
            setPendingSlotDeletions([])
            setPendingNewSlots([])
        }
    }, [open])

    const isLive = schedule ? isCurrentlyActive(schedule.schedule_time_slots || []) : false

    // Get associated menus
    const associatedMenus = useMemo(() => {
        if (!schedule) return []
        return schedule.menu_schedules
            .map(ms => ms.menu)
            .filter(Boolean) as Array<{ id: string; name: string; is_active: boolean }>
    }, [schedule])

    // Group time slots by day
    const slotsByDay = useMemo(() => {
        const grouped: Record<number, TimeSlotInput[]> = {}
        const allSlots = [...timeSlots, ...pendingNewSlots]
        allSlots
            .filter(slot => !pendingSlotDeletions.includes(slot.id))
            .forEach(slot => {
                if (!grouped[slot.day_of_week]) {
                    grouped[slot.day_of_week] = []
                }
                grouped[slot.day_of_week].push(slot)
            })
        // Sort slots by start time
        Object.keys(grouped).forEach(day => {
            grouped[Number(day)].sort((a, b) => a.start_time.localeCompare(b.start_time))
        })
        return grouped
    }, [timeSlots, pendingNewSlots, pendingSlotDeletions])

    // Toggle day selection (editing mode)
    const toggleDay = (day: number) => {
        if (!isEditing) return

        setSelectedDays(prev => {
            if (prev.includes(day)) {
                // Mark all slots for this day as deleted
                const slotsToDelete = timeSlots.filter(s => s.day_of_week === day).map(s => s.id)
                setPendingSlotDeletions(prev => [...prev, ...slotsToDelete])
                setPendingNewSlots(prev => prev.filter(s => s.day_of_week !== day))
                return prev.filter(d => d !== day)
            } else {
                // Add day with default time slot
                const newSlot: TimeSlotInput = {
                    id: generateId(),
                    day_of_week: day,
                    start_time: '09:00',
                    end_time: '17:00',
                    isNew: true,
                }
                setPendingNewSlots(prev => [...prev, newSlot])
                return [...prev, day].sort()
            }
        })
    }

    // Add time slot
    const addTimeSlot = (day: number) => {
        const newSlot: TimeSlotInput = {
            id: generateId(),
            day_of_week: day,
            start_time: '09:00',
            end_time: '17:00',
            isNew: true,
        }
        setPendingNewSlots(prev => [...prev, newSlot])
    }

    // Remove time slot
    const removeTimeSlot = (slotId: string, isNew: boolean) => {
        if (isNew) {
            setPendingNewSlots(prev => prev.filter(s => s.id !== slotId))
        } else {
            setPendingSlotDeletions(prev => [...prev, slotId])
        }

        // Check if this was the last slot for the day
        const slot = [...timeSlots, ...pendingNewSlots].find(s => s.id === slotId)
        if (slot) {
            const remainingForDay = [...timeSlots, ...pendingNewSlots]
                .filter(s => s.day_of_week === slot.day_of_week && s.id !== slotId)
                .filter(s => !pendingSlotDeletions.includes(s.id))
                .length

            if (remainingForDay === 0) {
                setSelectedDays(prev => prev.filter(d => d !== slot.day_of_week))
            }
        }
    }

    // Update time slot time
    const updateSlotTime = (slotId: string, field: 'start_time' | 'end_time', value: string, isNew: boolean) => {
        if (isNew) {
            setPendingNewSlots(prev => prev.map(slot =>
                slot.id === slotId ? { ...slot, [field]: value } : slot
            ))
        } else {
            setTimeSlots(prev => prev.map(slot =>
                slot.id === slotId ? { ...slot, [field]: value } : slot
            ))
        }
    }

    // Save changes
    const handleSave = async () => {
        if (!schedule) return

        setIsSaving(true)
        try {
            // Update schedule info
            const updateResult = await onUpdate(schedule.id, {
                name: name.trim(),
                description: description.trim() || undefined,
            })

            if (updateResult.error) {
                toast.error('Update Failed', { description: updateResult.error })
                return
            }

            // Delete removed time slots
            for (const slotId of pendingSlotDeletions) {
                await onDeleteTimeSlot(slotId)
            }

            // Create new time slots
            for (const slot of pendingNewSlots) {
                await onCreateTimeSlot(schedule.id, {
                    day_of_week: slot.day_of_week,
                    start_time: slot.start_time + ':00',
                    end_time: slot.end_time + ':00',
                })
            }

            toast.success('Schedule Updated', {
                description: 'Your changes have been saved.'
            })

            setIsEditing(false)
            setPendingSlotDeletions([])
            setPendingNewSlots([])
        } catch (error) {
            toast.error('Update Failed', {
                description: 'Unable to save changes. Please try again.'
            })
        } finally {
            setIsSaving(false)
        }
    }

    // Cancel editing
    const handleCancelEdit = () => {
        if (schedule) {
            setName(schedule.name)
            setDescription(schedule.description || '')

            const slots = schedule.schedule_time_slots || []
            const days = [...new Set(slots.map(s => s.day_of_week))].sort()
            setSelectedDays(days)

            setTimeSlots(slots.map(s => ({
                id: s.id,
                day_of_week: s.day_of_week,
                start_time: s.start_time.slice(0, 5),
                end_time: s.end_time.slice(0, 5),
            })))
        }
        setPendingSlotDeletions([])
        setPendingNewSlots([])
        setIsEditing(false)
    }

    // Toggle active status
    const handleToggleActive = async () => {
        if (!schedule) return

        const result = await onToggleActive(schedule.id)
        if (result.error) {
            toast.error('Update Failed', { description: result.error })
        } else {
            toast.success(schedule.is_active ? 'Schedule Deactivated' : 'Schedule Activated')
        }
    }

    // Delete schedule
    const handleDelete = async () => {
        if (!schedule) return

        setIsDeleting(true)
        try {
            const result = await onDelete(schedule.id)
            if (result.error) {
                toast.error('Delete Failed', { description: result.error })
                return
            }

            toast.success('Schedule Deleted', {
                description: `"${schedule.name}" has been permanently deleted.`
            })
            setShowDeleteDialog(false)
            onOpenChange(false)
        } catch {
            toast.error('Delete Failed', {
                description: 'Unable to delete the schedule. Please try again.'
            })
        } finally {
            setIsDeleting(false)
        }
    }

    if (!schedule) return null

    return (
        <>
            <BottomSheet open={open} onOpenChange={onOpenChange}>
                <BottomSheetContent height="95">
                    <BottomSheetHeader>
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <div className={cn(
                                    "h-12 w-12 rounded-xl flex items-center justify-center",
                                    isLive
                                        ? "bg-green-500/20 text-green-600"
                                        : "bg-primary/10 text-primary"
                                )}>
                                    <Calendar className="h-6 w-6" />
                                </div>
                                <div>
                                    {isEditing ? (
                                        <Input
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            className="text-xl font-semibold h-auto py-1 px-2 -ml-2"
                                            placeholder="Schedule name"
                                        />
                                    ) : (
                                        <BottomSheetTitle className="flex items-center gap-2">
                                            {schedule.name}
                                            {isLive && (
                                                <Badge className="bg-green-500 text-white animate-pulse">
                                                    <Zap className="h-3 w-3 mr-1" />
                                                    Live
                                                </Badge>
                                            )}
                                        </BottomSheetTitle>
                                    )}
                                    {isEditing ? (
                                        <Input
                                            value={description}
                                            onChange={(e) => setDescription(e.target.value)}
                                            className="text-sm text-muted-foreground h-auto py-1 px-2 -ml-2 mt-1"
                                            placeholder="Add description (optional)"
                                        />
                                    ) : (
                                        <BottomSheetDescription>
                                            {schedule.description || 'No description'}
                                        </BottomSheetDescription>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <Badge variant={schedule.is_active ? "default" : "secondary"}>
                                    {schedule.is_active ? 'Active' : 'Inactive'}
                                </Badge>
                            </div>
                        </div>
                    </BottomSheetHeader>

                    <BottomSheetBody>
                        <div className="space-y-6">
                            {/* Associated Menus */}
                            <BottomSheetSection title="Used By Menus">
                                {associatedMenus.length === 0 ? (
                                    <div className="p-4 rounded-xl bg-muted/30 text-center">
                                        <Utensils className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                                        <p className="text-sm text-muted-foreground">
                                            This schedule is not assigned to any menus yet
                                        </p>
                                    </div>
                                ) : (
                                    <div className="flex flex-wrap gap-2">
                                        {associatedMenus.map((menu, index) => (
                                            <button
                                                key={menu.id}
                                                type="button"
                                                onClick={() => onNavigateToMenu?.(menu.id)}
                                                className={cn(
                                                    "inline-flex items-center gap-2 px-3 py-2 rounded-lg transition-all",
                                                    "bg-muted/50 hover:bg-muted border",
                                                    "animate-in fade-in slide-in-from-left-2"
                                                )}
                                                style={{ animationDelay: `${index * 50}ms` }}
                                            >
                                                <Utensils className="h-4 w-4 text-primary" />
                                                <span className="font-medium text-sm">{menu.name}</span>
                                                <Badge variant={menu.is_active ? "default" : "secondary"} className="text-xs">
                                                    {menu.is_active ? 'Active' : 'Inactive'}
                                                </Badge>
                                                <ExternalLink className="h-3 w-3 text-muted-foreground" />
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </BottomSheetSection>

                            {/* Day Selection */}
                            <BottomSheetSection title="Active Days">
                                <div className="grid grid-cols-7 gap-2">
                                    {DAYS_OF_WEEK.map((day, index) => {
                                        const hasSlots = slotsByDay[index]?.length > 0
                                        const isToday = new Date().getDay() === index

                                        return (
                                            <button
                                                key={day}
                                                type="button"
                                                onClick={() => toggleDay(index)}
                                                disabled={!isEditing}
                                                className={cn(
                                                    "aspect-square rounded-xl text-sm font-medium transition-all duration-200",
                                                    "flex flex-col items-center justify-center gap-0.5",
                                                    hasSlots
                                                        ? "bg-primary text-primary-foreground shadow-md"
                                                        : "bg-muted/50 text-muted-foreground",
                                                    isToday && hasSlots && "ring-2 ring-offset-2 ring-primary",
                                                    isEditing && "cursor-pointer active:scale-95",
                                                    !isEditing && "cursor-default"
                                                )}
                                            >
                                                <span>{day}</span>
                                                {hasSlots && (
                                                    <span className="text-[10px] opacity-80">
                                                        {slotsByDay[index]?.length || 0}
                                                    </span>
                                                )}
                                            </button>
                                        )
                                    })}
                                </div>
                                {isEditing && (
                                    <p className="text-xs text-muted-foreground mt-2">
                                        Tap days to add or remove them from the schedule
                                    </p>
                                )}
                            </BottomSheetSection>

                            {/* Time Slots */}
                            <BottomSheetSection title="Time Slots">
                                {Object.keys(slotsByDay).length === 0 ? (
                                    <div className="p-4 rounded-xl bg-muted/30 text-center">
                                        <Clock className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                                        <p className="text-sm text-muted-foreground">
                                            No time slots defined
                                        </p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {selectedDays
                                            .filter(day => slotsByDay[day]?.length > 0)
                                            .map((day, dayIdx) => {
                                                const daySlots = slotsByDay[day] || []
                                                const isToday = new Date().getDay() === day

                                                return (
                                                    <div
                                                        key={day}
                                                        className={cn(
                                                            "p-4 rounded-xl transition-all",
                                                            isToday
                                                                ? "bg-primary/10 border border-primary/20"
                                                                : "bg-muted/30"
                                                        )}
                                                    >
                                                        <div className="flex items-center justify-between mb-3">
                                                            <h4 className={cn(
                                                                "font-medium",
                                                                isToday && "text-primary"
                                                            )}>
                                                                {DAYS_FULL[day]}
                                                                {isToday && (
                                                                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                                                                        (Today)
                                                                    </span>
                                                                )}
                                                            </h4>
                                                            {isEditing && (
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
                                                            )}
                                                        </div>

                                                        <div className="space-y-2">
                                                            {daySlots.map((slot, slotIdx) => {
                                                                const now = new Date()
                                                                const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
                                                                const isCurrentSlot = isToday &&
                                                                    slot.start_time <= currentTime &&
                                                                    slot.end_time >= currentTime

                                                                return (
                                                                    <div
                                                                        key={slot.id}
                                                                        className={cn(
                                                                            "flex items-center gap-2 animate-in fade-in slide-in-from-left-2",
                                                                            isCurrentSlot && "ring-2 ring-green-500 rounded-lg"
                                                                        )}
                                                                        style={{ animationDelay: `${(dayIdx * 50) + (slotIdx * 30)}ms` }}
                                                                    >
                                                                        {isEditing ? (
                                                                            <>
                                                                                <TimeInput
                                                                                    value={slot.start_time}
                                                                                    onChange={(v) => updateSlotTime(slot.id, 'start_time', v, !!slot.isNew)}
                                                                                    className="flex-1"
                                                                                />
                                                                                <span className="text-muted-foreground text-sm">to</span>
                                                                                <TimeInput
                                                                                    value={slot.end_time}
                                                                                    onChange={(v) => updateSlotTime(slot.id, 'end_time', v, !!slot.isNew)}
                                                                                    className="flex-1"
                                                                                />
                                                                                <Button
                                                                                    type="button"
                                                                                    variant="ghost"
                                                                                    size="icon"
                                                                                    onClick={() => removeTimeSlot(slot.id, !!slot.isNew)}
                                                                                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                                                                >
                                                                                    <Trash2 className="h-4 w-4" />
                                                                                </Button>
                                                                            </>
                                                                        ) : (
                                                                            <div
                                                                                className={cn(
                                                                                    "flex items-center gap-2 px-3 py-2 rounded-lg w-full",
                                                                                    isCurrentSlot
                                                                                        ? "bg-green-500 text-white"
                                                                                        : "bg-background border"
                                                                                )}
                                                                            >
                                                                                <Clock className="h-4 w-4" />
                                                                                <span className="font-medium">
                                                                                    {formatTime(slot.start_time + ':00')} - {formatTime(slot.end_time + ':00')}
                                                                                </span>
                                                                                {isCurrentSlot && (
                                                                                    <Badge className="bg-white/20 text-white ml-auto">
                                                                                        Now
                                                                                    </Badge>
                                                                                )}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )
                                                            })}
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                    </div>
                                )}
                            </BottomSheetSection>

                            {/* Quick Actions */}
                            {!isEditing && (
                                <BottomSheetSection title="Quick Actions">
                                    <div className="flex flex-wrap gap-2">
                                        <Button
                                            variant="outline"
                                            onClick={handleToggleActive}
                                            className={cn(
                                                schedule.is_active
                                                    ? "border-amber-200 text-amber-700 hover:bg-amber-50"
                                                    : "border-green-200 text-green-700 hover:bg-green-50"
                                            )}
                                        >
                                            <Power className="h-4 w-4 mr-2" />
                                            {schedule.is_active ? 'Deactivate' : 'Activate'}
                                        </Button>
                                        <Button
                                            variant="outline"
                                            onClick={() => setShowDeleteDialog(true)}
                                            className="border-destructive/50 text-destructive hover:bg-destructive/10"
                                        >
                                            <Trash2 className="h-4 w-4 mr-2" />
                                            Delete Schedule
                                        </Button>
                                    </div>
                                </BottomSheetSection>
                            )}

                            {/* Info Footer */}
                            <div className="text-xs text-muted-foreground pt-4 border-t">
                                <div className="flex justify-between">
                                    <span>Created: {new Date(schedule.created_at).toLocaleDateString()}</span>
                                    <span>Updated: {new Date(schedule.updated_at).toLocaleDateString()}</span>
                                </div>
                            </div>
                        </div>
                    </BottomSheetBody>

                    <BottomSheetFooter>
                        {isEditing ? (
                            <>
                                <Button
                                    variant="outline"
                                    onClick={handleCancelEdit}
                                    disabled={isSaving}
                                    className="flex-1"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    onClick={handleSave}
                                    disabled={isSaving || !name.trim()}
                                    className="flex-1"
                                >
                                    {isSaving ? (
                                        <>
                                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                            </svg>
                                            Saving...
                                        </>
                                    ) : (
                                        <>
                                            <Save className="h-4 w-4 mr-2" />
                                            Save Changes
                                        </>
                                    )}
                                </Button>
                            </>
                        ) : (
                            <>
                                <Button
                                    variant="outline"
                                    onClick={() => onOpenChange(false)}
                                    className="flex-1"
                                >
                                    Close
                                </Button>
                                <Button
                                    onClick={() => setIsEditing(true)}
                                    className="flex-1"
                                >
                                    Edit Schedule
                                </Button>
                            </>
                        )}
                    </BottomSheetFooter>
                </BottomSheetContent>
            </BottomSheet>

            {/* Delete Confirmation Dialog */}
            <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-destructive">
                            <AlertTriangle className="h-5 w-5" />
                            Delete Schedule
                        </DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete "{schedule.name}"? This action cannot be undone.
                            {associatedMenus.length > 0 && (
                                <span className="block mt-2 text-amber-600">
                                    Warning: This schedule is currently used by {associatedMenus.length} menu{associatedMenus.length !== 1 ? 's' : ''}.
                                    They will no longer have this schedule.
                                </span>
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setShowDeleteDialog(false)}
                            disabled={isDeleting}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleDelete}
                            disabled={isDeleting}
                        >
                            {isDeleting ? (
                                <>
                                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                    Deleting...
                                </>
                            ) : (
                                <>
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete Schedule
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}

