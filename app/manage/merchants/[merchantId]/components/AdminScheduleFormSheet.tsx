'use client'

import { useState, useMemo, useEffect, useRef, type ReactNode } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TimeInput } from '@/components/ui/time-picker'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import {
  Plus,
  Trash2,
  Calendar,
  CheckCircle2,
  Globe,
  MapPin,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  useAdminCreateSchedule,
  useAdminUpdateSchedule,
} from '@/lib/queries/use-admin-schedules'

const DAYS_OF_WEEK = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const DAYS_FULL = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

interface TimeSlotInput {
  id: string
  day_of_week: number
  start_time: string
  end_time: string
}

interface AdminScheduleFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  merchantId: string
  mode?: 'create' | 'edit'
  editSchedule?: any
  locationId?: string | null
}

// Generate unique ID
let idCounter = 0
const generateId = () => `slot-${++idCounter}-${Date.now()}`

function ScheduleSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
      </div>
      {children}
    </section>
  )
}

export function AdminScheduleFormSheet({
  open,
  onOpenChange,
  merchantId,
  mode = 'create',
  editSchedule,
  locationId = null,
}: AdminScheduleFormSheetProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  
  const createMutation = useAdminCreateSchedule(merchantId)
  const updateMutation = useAdminUpdateSchedule(merchantId, editSchedule?.id)

  // Form state
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [selectedDays, setSelectedDays] = useState<number[]>([])
  const [timeSlots, setTimeSlots] = useState<TimeSlotInput[]>([])

  // Track the schedule ID we've populated for to prevent re-population
  const populatedScheduleIdRef = useRef<string | null>(null)

  // Populate form when editing
  useEffect(() => {
    if (mode === 'edit' && editSchedule && open && populatedScheduleIdRef.current !== editSchedule.id) {
      populatedScheduleIdRef.current = editSchedule.id
      setName(editSchedule.name)
      setDescription(editSchedule.description || '')

      const existingSlots = editSchedule.schedule_time_slots || []
      const days = [...new Set(existingSlots.map((s: any) => s.day_of_week))].sort((a: any, b: any) => a - b)
      setSelectedDays(days as number[])

      const convertedSlots = existingSlots.map((slot: any) => ({
        id: generateId(),
        day_of_week: slot.day_of_week,
        start_time: slot.start_time.slice(0, 5),
        end_time: slot.end_time.slice(0, 5),
      }))
      setTimeSlots(convertedSlots)
    }

    if (!open) {
      populatedScheduleIdRef.current = null
    }
  }, [mode, editSchedule, open])

  // Reset form
  const resetForm = () => {
    setName('')
    setDescription('')
    setSelectedDays([])
    setTimeSlots([])
    setShowSuccess(false)
  }

  // Handle close
  const handleClose = () => {
    onOpenChange(false)
    setTimeout(resetForm, 300)
  }

  const toggleDay = (day: number) => {
    const isDaySelected = selectedDays.includes(day)

    if (isDaySelected) {
      setSelectedDays((prev) => prev.filter((d) => d !== day))
      setTimeSlots((slots) => slots.filter((s) => s.day_of_week !== day))
    } else {
      setSelectedDays((prev) => [...prev, day].sort((a, b) => a - b))
      const newSlot: TimeSlotInput = {
        id: generateId(),
        day_of_week: day,
        start_time: '09:00',
        end_time: '17:00',
      }
      setTimeSlots((slots) => [...slots, newSlot])
    }
  }

  const addTimeSlot = (day: number) => {
    const newSlot: TimeSlotInput = {
      id: generateId(),
      day_of_week: day,
      start_time: '09:00',
      end_time: '17:00',
    }
    setTimeSlots((prev) => [...prev, newSlot])
  }

  const removeTimeSlot = (slotId: string) => {
    setTimeSlots((prev) => {
      const slot = prev.find((s) => s.id === slotId)
      if (!slot) return prev

      const remainingForDay = prev.filter(
        (s) => s.day_of_week === slot.day_of_week && s.id !== slotId
      ).length

      if (remainingForDay === 0) {
        setSelectedDays((days) => days.filter((d) => d !== slot.day_of_week))
      }

      return prev.filter((s) => s.id !== slotId)
    })
  }

  const updateTimeSlot = (
    slotId: string,
    field: 'start_time' | 'end_time',
    value: string
  ) => {
    setTimeSlots((prev) =>
      prev.map((slot) =>
        slot.id === slotId ? { ...slot, [field]: value } : slot
      )
    )
  }

  const slotsByDay = useMemo(() => {
    const grouped: Record<number, TimeSlotInput[]> = {}
    timeSlots.forEach((slot) => {
      if (!grouped[slot.day_of_week]) grouped[slot.day_of_week] = []
      grouped[slot.day_of_week].push(slot)
    })
    return grouped
  }, [timeSlots])

  const isValid = name.trim().length >= 2 && timeSlots.length > 0

  const handleSubmit = async () => {
    if (!isValid) return
    setIsSubmitting(true)

    try {
      const scheduleData = {
        name: name.trim(),
        description: description.trim() || undefined,
        location_id: locationId === 'all' ? null : locationId,
        time_slots: timeSlots.map((slot) => ({
          day_of_week: slot.day_of_week,
          start_time: slot.start_time,
          end_time: slot.end_time,
        })),
      }

      let result
      if (mode === 'edit') {
        result = await updateMutation.mutateAsync(scheduleData)
      } else {
        result = await createMutation.mutateAsync(scheduleData)
      }

      if (result.error) {
        // Error handled by mutation onSuccess/onError
        setIsSubmitting(false)
        return
      }

      setShowSuccess(true)
      setTimeout(handleClose, 1500)
    } catch (error) {
      toast.error('An error occurred')
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-3xl max-h-[90vh] overflow-hidden p-0 gap-0"
        overlayClassName="bg-black/35 backdrop-blur-md"
      >
        {showSuccess ? (
          <div className="flex min-h-[420px] flex-col items-center justify-center gap-4 animate-in zoom-in-50 fade-in duration-300 px-6 py-10">
            <div className="h-20 w-20 rounded-full bg-green-500/20 flex items-center justify-center">
              <CheckCircle2 className="h-10 w-10 text-green-500 animate-in zoom-in-0 duration-500" />
            </div>
            <div className="text-center">
              <h3 className="text-xl font-semibold text-green-600">
                {mode === 'edit' ? 'Schedule Updated!' : 'Schedule Created!'}
              </h3>
              <p className="text-muted-foreground mt-1">Your changes have been saved</p>
            </div>
          </div>
        ) : (
          <>
            <DialogHeader className="px-6 pt-6 pb-4 text-left">
              <DialogTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                {mode === 'edit' ? 'Edit Schedule' : 'Create Schedule'}
              </DialogTitle>
              <DialogDescription>
                Control when menus and categories are available to customers
              </DialogDescription>
              
              <div
                className={cn(
                  'mt-3 p-3 rounded-lg border flex items-center gap-2',
                  !locationId || locationId === 'all'
                    ? 'bg-emerald-50 border-emerald-200'
                    : 'bg-purple-50 border-purple-200'
                )}
              >
                {!locationId || locationId === 'all' ? (
                  <>
                    <Globe className="h-4 w-4 text-emerald-600" />
                    <div>
                      <p className="text-sm font-medium text-emerald-700">Global Schedule</p>
                      <p className="text-xs text-emerald-600">Will be available at all locations</p>
                    </div>
                  </>
                ) : (
                  <>
                    <MapPin className="h-4 w-4 text-purple-600" />
                    <div>
                      <p className="text-sm font-medium text-purple-700">Location-Specific Schedule</p>
                      <p className="text-xs text-purple-600">Only for the selected location</p>
                    </div>
                  </>
                )}
              </div>
            </DialogHeader>

            <Separator />

            <div className="overflow-y-auto px-6 py-5 max-h-[calc(90vh-180px)]">
              <div className="space-y-8">
                <ScheduleSection title="Schedule Details">
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Schedule Name *</label>
                      <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g., Lunch Hours, Weekend Special"
                        className="h-11"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Description (optional)</label>
                      <Input
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Brief description of this schedule"
                        className="h-11"
                      />
                    </div>
                  </div>
                </ScheduleSection>

                <ScheduleSection title="Active Days">
                  <div className="grid grid-cols-7 gap-2">
                    {DAYS_OF_WEEK.map((day, index) => {
                      const isSelected = selectedDays.includes(index)
                      return (
                        <button
                          key={`${day}-${index}`}
                          type="button"
                          onClick={() => toggleDay(index)}
                          className={cn(
                            'aspect-square rounded-xl text-sm font-medium transition-all duration-200',
                            'flex items-center justify-center active:scale-95',
                            isSelected
                              ? 'bg-primary text-primary-foreground shadow-md scale-105'
                              : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                          )}
                        >
                          {day}
                        </button>
                      )
                    })}
                  </div>
                </ScheduleSection>

                {selectedDays.length > 0 && (
                  <ScheduleSection title="Time Slots">
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
                              <h4 className="font-medium text-sm">{DAYS_FULL[day]}</h4>
                              <div className="flex gap-1">
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
                            </div>

                            <div className="space-y-2">
                              {daySlots.map((slot) => (
                                <div key={slot.id} className="flex items-center gap-2">
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
                  </ScheduleSection>
                )}
              </div>
            </div>

            <Separator />

            <DialogFooter className="px-6 py-4 border-t-0 sm:justify-end">
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
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                )}
                {mode === 'edit' ? 'Update Schedule' : 'Create Schedule'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
