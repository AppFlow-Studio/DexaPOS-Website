'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  BottomSheet,
  BottomSheetContent,
  BottomSheetHeader,
  BottomSheetBody,
  BottomSheetFooter,
  BottomSheetTitle,
  BottomSheetSection,
} from '@/components/ui/bottom-sheet'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Loader2,
  Clock,
  Plus,
  X,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'

import {
  assignScheduleToMenu,
  removeScheduleFromMenu,
  createAdminSchedule,
} from '@/app/manage/actions/admin-merchant/schedules'
import {
  useAdminSchedules,
  useAdminMenuSchedules,
  type AdminSchedule,
} from '@/lib/queries/use-admin-merchant'
import { adminKeys } from '@/lib/queries/admin-keys'

// ============================================================================
// TYPES & SCHEMA
// ============================================================================

const DAYS = [
  { value: 0, label: 'Sunday', short: 'Sun' },
  { value: 1, label: 'Monday', short: 'Mon' },
  { value: 2, label: 'Tuesday', short: 'Tue' },
  { value: 3, label: 'Wednesday', short: 'Wed' },
  { value: 4, label: 'Thursday', short: 'Thu' },
  { value: 5, label: 'Friday', short: 'Fri' },
  { value: 6, label: 'Saturday', short: 'Sat' },
]

const scheduleFormSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  description: z.string().optional(),
  selectedDays: z.array(z.number()).min(1, 'Select at least one day'),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time format'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time format'),
})

type ScheduleFormValues = z.infer<typeof scheduleFormSchema>

// ============================================================================
// PROPS
// ============================================================================

interface MenuSchedulesSheetProps {
  open: boolean
  onClose: () => void
  merchantId: string
  locationId: string | null
  menuId: string | null
  menuName: string
  onSuccess: () => void
}

// ============================================================================
// COMPONENT
// ============================================================================

export function MenuSchedulesSheet({
  open,
  onClose,
  merchantId,
  locationId,
  menuId,
  menuName,
  onSuccess,
}: MenuSchedulesSheetProps) {
  const queryClient = useQueryClient()
  const [isCreating, setIsCreating] = useState(false)
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null)
  const [isAssigning, setIsAssigning] = useState(false)

  // Fetch all schedules for merchant
  const { data: allSchedules = [], isLoading: schedulesLoading } = useAdminSchedules(
    merchantId,
    locationId
  )

  // Fetch schedules assigned to this menu
  const { data: assignedSchedules = [], isLoading: menuSchedulesLoading } = useAdminMenuSchedules(
    merchantId,
    menuId
  )

  // Get IDs of assigned schedules for filtering
  const assignedScheduleIds = new Set(assignedSchedules.map((s) => s.id))

  // Available schedules (not yet assigned)
  const availableSchedules = allSchedules.filter((s) => !assignedScheduleIds.has(s.id))

  const form = useForm<ScheduleFormValues>({
    resolver: zodResolver(scheduleFormSchema),
    defaultValues: {
      name: '',
      description: '',
      selectedDays: [],
      startTime: '09:00',
      endTime: '17:00',
    },
  })

  const { isSubmitting } = form.formState

  const handleAssignSchedule = async () => {
    if (!menuId || !selectedScheduleId) return

    setIsAssigning(true)
    try {
      const result = await assignScheduleToMenu(merchantId, menuId, selectedScheduleId)
      if (result.error) {
        toast.error('Failed to assign schedule', { description: result.error })
      } else {
        toast.success('Schedule assigned to menu')
        setSelectedScheduleId(null)
        // Invalidate queries
        queryClient.invalidateQueries({ queryKey: adminKeys.merchantMenuSchedules(merchantId, menuId) })
        queryClient.invalidateQueries({ queryKey: adminKeys.merchantMenus(merchantId, locationId) })
        onSuccess()
      }
    } catch (error) {
      toast.error('Failed to assign schedule')
    } finally {
      setIsAssigning(false)
    }
  }

  const handleRemoveSchedule = async (scheduleId: string) => {
    if (!menuId) return

    try {
      const result = await removeScheduleFromMenu(merchantId, menuId, scheduleId)
      if (result.error) {
        toast.error('Failed to remove schedule', { description: result.error })
      } else {
        toast.success('Schedule removed from menu')
        // Invalidate queries
        queryClient.invalidateQueries({ queryKey: adminKeys.merchantMenuSchedules(merchantId, menuId) })
        queryClient.invalidateQueries({ queryKey: adminKeys.merchantMenus(merchantId, locationId) })
        onSuccess()
      }
    } catch (error) {
      toast.error('Failed to remove schedule')
    }
  }

  const onSubmit = async (values: ScheduleFormValues) => {
    if (!menuId) return

    try {
      // Create schedule with time slots
      const timeSlots = values.selectedDays.map((day) => ({
        day_of_week: day,
        start_time: values.startTime,
        end_time: values.endTime,
        is_active: true,
      }))

      const createResult = await createAdminSchedule(merchantId, {
        name: values.name,
        description: values.description,
        is_active: true,
        location_id: locationId,
        time_slots: timeSlots,
      })

      if (createResult.error || !createResult.data) {
        toast.error('Failed to create schedule', { description: createResult.error })
        return
      }

      // Assign the new schedule to the menu
      const assignResult = await assignScheduleToMenu(merchantId, menuId, createResult.data.id)

      if (assignResult.error) {
        toast.error('Schedule created but failed to assign to menu', { description: assignResult.error })
      } else {
        toast.success('Schedule created and assigned to menu')
        form.reset()
        setIsCreating(false)
        // Invalidate queries
        queryClient.invalidateQueries({ queryKey: adminKeys.merchantSchedules(merchantId, locationId) })
        queryClient.invalidateQueries({ queryKey: adminKeys.merchantMenuSchedules(merchantId, menuId) })
        queryClient.invalidateQueries({ queryKey: adminKeys.merchantMenus(merchantId, locationId) })
        onSuccess()
      }
    } catch (error) {
      toast.error('Failed to create schedule')
    }
  }

  const formatTimeSlots = (schedule: AdminSchedule) => {
    if (!schedule.schedule_time_slots || schedule.schedule_time_slots.length === 0) {
      return 'No time slots'
    }

    // Group by time ranges
    const grouped = schedule.schedule_time_slots.reduce((acc, slot) => {
      const key = `${slot.start_time}-${slot.end_time}`
      if (!acc[key]) {
        acc[key] = []
      }
      acc[key].push(slot.day_of_week)
      return acc
    }, {} as Record<string, number[]>)

    return Object.entries(grouped).map(([timeRange, days]) => {
      const dayLabels = days.sort().map((d) => DAYS[d].short).join(', ')
      return `${dayLabels} ${timeRange}`
    }).join(' | ')
  }

  return (
    <BottomSheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <BottomSheetContent>
        <BottomSheetHeader>
          <BottomSheetTitle>Schedules for {menuName}</BottomSheetTitle>
        </BottomSheetHeader>

        <BottomSheetBody>
          <ScrollArea className="h-[600px]">
            {/* Assigned Schedules */}
            <BottomSheetSection title="Assigned Schedules">
              {menuSchedulesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : assignedSchedules.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">No schedules assigned to this menu</p>
              ) : (
                <div className="space-y-2">
                  {assignedSchedules.map((schedule) => (
                    <div
                      key={schedule.id}
                      className="flex items-start justify-between gap-4 p-3 border rounded-lg"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium text-sm">{schedule.name}</p>
                          {schedule.is_active ? (
                            <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-900 dark:text-green-300 border-0 text-xs">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-red-50 text-red-700 dark:bg-red-900 dark:text-red-300 border-0 text-xs">
                              <XCircle className="h-3 w-3 mr-1" />
                              Inactive
                            </Badge>
                          )}
                        </div>
                        {schedule.description && (
                          <p className="text-xs text-muted-foreground mb-2">{schedule.description}</p>
                        )}
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {formatTimeSlots(schedule)}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleRemoveSchedule(schedule.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </BottomSheetSection>

            <Separator className="my-6" />

            {/* Add Existing Schedule */}
            <BottomSheetSection title="Add Existing Schedule">
              {schedulesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : availableSchedules.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">No available schedules</p>
              ) : (
                <div className="flex gap-2">
                  <Select
                    value={selectedScheduleId || ''}
                    onValueChange={setSelectedScheduleId}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Select a schedule" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableSchedules.map((schedule) => (
                        <SelectItem key={schedule.id} value={schedule.id}>
                          {schedule.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={handleAssignSchedule}
                    disabled={!selectedScheduleId || isAssigning}
                  >
                    {isAssigning ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Assign'
                    )}
                  </Button>
                </div>
              )}
            </BottomSheetSection>

            <Separator className="my-6" />

            {/* Create New Schedule */}
            <Collapsible open={isCreating} onOpenChange={setIsCreating}>
              <CollapsibleTrigger asChild>
                <Button variant="outline" className="w-full justify-between">
                  <span className="flex items-center gap-2">
                    <Plus className="h-4 w-4" />
                    Create New Schedule
                  </span>
                  {isCreating ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-4">
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Schedule Name</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., Breakfast Hours" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description (Optional)</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Brief description of when this schedule applies"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="selectedDays"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Days</FormLabel>
                          <FormControl>
                            <div className="grid grid-cols-7 gap-2">
                              {DAYS.map((day) => (
                                <div key={day.value} className="flex items-center justify-center">
                                  <Checkbox
                                    checked={field.value.includes(day.value)}
                                    onCheckedChange={(checked) => {
                                      const newValue = checked
                                        ? [...field.value, day.value]
                                        : field.value.filter((v) => v !== day.value)
                                      field.onChange(newValue)
                                    }}
                                    id={`day-${day.value}`}
                                  />
                                  <label
                                    htmlFor={`day-${day.value}`}
                                    className="ml-1 text-xs cursor-pointer"
                                  >
                                    {day.short}
                                  </label>
                                </div>
                              ))}
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="startTime"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Start Time</FormLabel>
                            <FormControl>
                              <Input type="time" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="endTime"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>End Time</FormLabel>
                            <FormControl>
                              <Input type="time" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="flex gap-2 pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          form.reset()
                          setIsCreating(false)
                        }}
                        disabled={isSubmitting}
                      >
                        Cancel
                      </Button>
                      <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Creating...
                          </>
                        ) : (
                          <>
                            <Plus className="h-4 w-4 mr-2" />
                            Create & Assign
                          </>
                        )}
                      </Button>
                    </div>
                  </form>
                </Form>
              </CollapsibleContent>
            </Collapsible>
          </ScrollArea>
        </BottomSheetBody>

        <BottomSheetFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </BottomSheetFooter>
      </BottomSheetContent>
    </BottomSheet>
  )
}
