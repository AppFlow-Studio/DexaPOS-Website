"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import {
  BottomSheetSection,
} from "@/components/ui/bottom-sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { TimeInput } from "@/components/ui/time-picker";
import { cn } from "@/lib/utils";
import {
  Plus,
  Trash2,
  Calendar,
  Sparkles,
  CheckCircle2,
  Copy,
  ArrowRight,
  Globe,
  MapPin,
} from "lucide-react";
import { SchedulesModel, ScheduleTimeSlotsModel } from "@/types/db-modles";
import { toast } from "sonner";
import { DAYS_OF_WEEK, DAYS_FULL } from "./ScheduleCard";
import {
  useCreateScheduleMutation,
  useUpdateScheduleMutation,
} from "@/app/dashboard/hooks/useLocationScopedSchedules";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  useIsAllLocations,
  useSelectedLocation,
} from "@/stores/location-store";

interface TimeSlotInput {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
}

interface ScheduleFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: "create" | "edit" | "assign";
  editSchedule?:
    | (SchedulesModel & { schedule_time_slots?: ScheduleTimeSlotsModel[] })
    | null;
  onAssignSchedule?: (scheduleId: string) => Promise<{ error?: string }>;
}

// Generate unique ID
let idCounter = 0;
const generateId = () => `slot-${++idCounter}-${Date.now()}`;

export function ScheduleFormSheet({
  open,
  onOpenChange,
  mode = "create",
  editSchedule,
  onAssignSchedule,
}: ScheduleFormSheetProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const createScheduleMutation = useCreateScheduleMutation();
  const updateScheduleMutation = useUpdateScheduleMutation();

  // Location context
  const isAllLocations = useIsAllLocations();
  const selectedLocation = useSelectedLocation();

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [timeSlots, setTimeSlots] = useState<TimeSlotInput[]>([]);

  // Track the schedule ID we've populated for to prevent re-population
  const populatedScheduleIdRef = useRef<string | null>(null);

  // Populate form when editing - only once per schedule
  useEffect(() => {
    console.log("[DEBUG ScheduleFormSheet] useEffect triggered:", {
      mode,
      editScheduleId: editSchedule?.id,
      editScheduleName: editSchedule?.name,
      existingSlotsCount: editSchedule?.schedule_time_slots?.length,
      open,
      populatedScheduleIdRef: populatedScheduleIdRef.current,
      currentTimeSlotsCount: timeSlots.length,
    });

    // Only populate if:
    // 1. In edit mode
    // 2. Have a schedule to edit
    // 3. Sheet is open
    // 4. Haven't already populated for this specific schedule
    if (
      mode === "edit" &&
      editSchedule &&
      open &&
      populatedScheduleIdRef.current !== editSchedule.id
    ) {
      console.log(
        "[DEBUG ScheduleFormSheet] POPULATING FORM for schedule:",
        editSchedule.id
      );
      populatedScheduleIdRef.current = editSchedule.id;

      setName(editSchedule.name);
      setDescription(editSchedule.description || "");

      // Convert existing time slots to input format
      const existingSlots = editSchedule.schedule_time_slots || [];
      console.log(
        "[DEBUG ScheduleFormSheet] Existing slots from editSchedule:",
        existingSlots
      );

      const days = [...new Set(existingSlots.map((s) => s.day_of_week))].sort(
        (a, b) => a - b
      );
      setSelectedDays(days);

      const convertedSlots = existingSlots.map((slot) => ({
        id: generateId(),
        day_of_week: slot.day_of_week,
        start_time: slot.start_time.slice(0, 5), // Remove seconds
        end_time: slot.end_time.slice(0, 5),
      }));
      console.log(
        "[DEBUG ScheduleFormSheet] Setting timeSlots to:",
        convertedSlots
      );
      setTimeSlots(convertedSlots);
    }

    // Reset the ref when sheet closes to allow fresh population next time
    if (!open) {
      console.log("[DEBUG ScheduleFormSheet] Sheet closed, resetting ref");
      populatedScheduleIdRef.current = null;
    }
  }, [mode, editSchedule, open]);

  // Reset form
  const resetForm = () => {
    setName("");
    setDescription("");
    setSelectedDays([]);
    setTimeSlots([]);
    setShowSuccess(false);
  };

  // Handle close
  const handleClose = () => {
    onOpenChange(false);
    setTimeout(resetForm, 300);
  };

  const toggleDay = (day: number) => {
    const isDaySelected = selectedDays.includes(day);

    if (isDaySelected) {
      setSelectedDays((prev) => prev.filter((d) => d !== day));
      setTimeSlots((slots) => slots.filter((s) => s.day_of_week !== day));
    } else {
      setSelectedDays((prev) => [...prev, day].sort((a, b) => a - b));
      const newSlot: TimeSlotInput = {
        id: generateId(),
        day_of_week: day,
        start_time: "09:00",
        end_time: "17:00",
      };
      setTimeSlots((slots) => [...slots, newSlot]);
    }
  };

  // Add time slot to a day
  const addTimeSlot = (day: number) => {
    const newSlot: TimeSlotInput = {
      id: generateId(),
      day_of_week: day,
      start_time: "09:00",
      end_time: "17:00",
    };
    setTimeSlots((prev) => [...prev, newSlot]);
  };

  // Remove time slot
  const removeTimeSlot = (slotId: string) => {
    setTimeSlots((prev) => {
      const slot = prev.find((s) => s.id === slotId);
      if (!slot) return prev;

      const remainingForDay = prev.filter(
        (s) => s.day_of_week === slot.day_of_week && s.id !== slotId
      ).length;

      // If this was the last slot for the day, remove the day from selection
      if (remainingForDay === 0) {
        setSelectedDays((days) => days.filter((d) => d !== slot.day_of_week));
      }

      return prev.filter((s) => s.id !== slotId);
    });
  };

  // Update time slot
  const updateTimeSlot = (
    slotId: string,
    field: "start_time" | "end_time",
    value: string
  ) => {
    setTimeSlots((prev) =>
      prev.map((slot) =>
        slot.id === slotId ? { ...slot, [field]: value } : slot
      )
    );
  };

  // ============================================================================
  // EASY FILL FUNCTIONALITY - Copy time slots from one day to others
  // ============================================================================

  const copyTimeSlotsToOtherDays = (
    sourceDay: number,
    targetDays: number[]
  ) => {
    const sourceSlots = timeSlots.filter((s) => s.day_of_week === sourceDay);

    if (sourceSlots.length === 0) {
      toast.error("No time slots to copy", {
        description: "The source day must have at least one time slot",
      });
      return;
    }

    // Remove existing slots from target days
    const slotsToKeep = timeSlots.filter(
      (s) => !targetDays.includes(s.day_of_week)
    );

    // Create new slots for target days
    const newSlots: TimeSlotInput[] = [];
    targetDays.forEach((day) => {
      sourceSlots.forEach((sourceSlot) => {
        newSlots.push({
          id: generateId(),
          day_of_week: day,
          start_time: sourceSlot.start_time,
          end_time: sourceSlot.end_time,
        });
      });
    });

    setTimeSlots([...slotsToKeep, ...newSlots]);

    // Ensure target days are selected
    setSelectedDays((prev) => {
      const combined = [...new Set([...prev, ...targetDays])];
      return combined.sort((a, b) => a - b);
    });

    toast.success("Time slots copied!", {
      description: `Copied ${sourceSlots.length} slot(s) to ${targetDays.length} day(s)`,
    });
  };

  const copyToAllDays = (sourceDay: number) => {
    const otherDays = selectedDays.filter((d) => d !== sourceDay);
    if (otherDays.length === 0) {
      toast.error("No other days selected", {
        description: "Select other days first to copy time slots to them",
      });
      return;
    }
    copyTimeSlotsToOtherDays(sourceDay, otherDays);
  };

  // Group time slots by day for display
  const slotsByDay = useMemo(() => {
    const grouped: Record<number, TimeSlotInput[]> = {};
    timeSlots.forEach((slot) => {
      if (!grouped[slot.day_of_week]) {
        grouped[slot.day_of_week] = [];
      }
      grouped[slot.day_of_week].push(slot);
    });
    return grouped;
  }, [timeSlots]);

  // Validation
  const isValid = name.trim().length >= 2 && timeSlots.length > 0;

  // Submit handler
  const handleSubmit = async () => {
    if (!isValid) return;

    setIsSubmitting(true);

    try {
      // Process time slots to handle overnight schedules
      // e.g., 10 PM to 2 AM needs to be split into:
      // 1. 10 PM to 11:59 PM (Current Day)
      // 2. 12 AM to 2 AM (Next Day)
      const processedTimeSlots: {
        day_of_week: number;
        start_time: string;
        end_time: string;
      }[] = [];

      timeSlots.forEach((slot) => {
        // Parse time strings HH:MM
        const [startH, startM] = slot.start_time.split(':').map(Number);
        const [endH, endM] = slot.end_time.split(':').map(Number);
        
        const startMinutes = startH * 60 + startM;
        const endMinutes = endH * 60 + endM;

        if (endMinutes <= startMinutes && endMinutes !== 0) {
          // Overnight detected (End is before Start, and not 00:00 exactly if interpreted as midnight start)
          // Wait, if endMinutes is 0 (00:00), it counts as next day if start > 0
          
          // Split Algorithm:
          // Slot 1: Current Day | Start Time -> 23:59
          processedTimeSlots.push({
            day_of_week: slot.day_of_week,
            start_time: slot.start_time + ":00",
            end_time: "23:59:00"
          });

          // Slot 2: Next Day | 00:00 -> End Time
          const nextDay = (slot.day_of_week + 1) % 7;
          processedTimeSlots.push({
            day_of_week: nextDay,
            start_time: "00:00:00",
            end_time: slot.end_time + ":00"
          });
          
          console.log(`[Schedule Form] Splitting overnight slot: ${slot.start_time}-${slot.end_time} on day ${slot.day_of_week}`);
        } else {
          // Normal slot
          processedTimeSlots.push({
            day_of_week: slot.day_of_week,
            start_time: slot.start_time + ":00",
            end_time: slot.end_time + ":00"
          });
        }
      });

      const scheduleData: any = {
        name: name.trim(),
        description: description.trim() || undefined,
        time_slots: processedTimeSlots,
      };

      // Explicitly handle location_id if we are in a specific location view
      // This ensures that even if the mutation hook relies on store, we are being explicit for the action
      if (!isAllLocations && selectedLocation?.id) {
        scheduleData.location_id = selectedLocation.id;
      }

      console.log(
        "[DEBUG ScheduleFormSheet] scheduleData being sent:",
        scheduleData
      );

      if (mode === "edit" && editSchedule) {
        // Update existing schedule
        const result = await updateScheduleMutation.mutateAsync({
          scheduleId: editSchedule.id,
          data: scheduleData,
        });

        if (result.error) {
          toast.error("Failed to update schedule", {
            description: result.error,
          });
          return; // Stop here, do not close or show success
        }

        setShowSuccess(true);
        toast.success("Schedule updated!", {
          description: `"${name}" has been updated successfully`,
        });

        setTimeout(() => {
          handleClose();
        }, 1500);
      } else {
        // Create new schedule
        // IMPORTANT: The useCreateScheduleMutation hook handles location_id automatically via the store
        // but passing it in data override might be safer if the hook merges.
        // However, CreateSchedule action takes location_id.
        
        const result = await createScheduleMutation.mutateAsync(scheduleData);

        if (result.error) {
          toast.error("Failed to create schedule", {
            description: result.error,
          });
          return; // Stop here on error!
        }

        // Only try to assign if creation succeeded
        if (onAssignSchedule && result.data) {
          await onAssignSchedule(result.data.id);
        }

        setShowSuccess(true);
        toast.success("Schedule created!", {
          description: `"${name}" has been created successfully`,
        });

        setTimeout(() => {
          handleClose();
        }, 1500);
      }
    } catch (error) {
      console.error("Schedule Submit Error:", error);
      toast.error("An error occurred", { description: "Please try again." });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="bg-slate-950/40 backdrop-blur-md"
        className="w-full max-w-[calc(100vw-1rem)] gap-0 overflow-hidden rounded-[28px] border border-slate-200/80 bg-background/95 p-0 shadow-[0_30px_100px_rgba(15,23,42,0.26)] sm:max-w-3xl"
      >
        {showSuccess ? (
          // Success animation
          <div className="flex min-h-[420px] flex-col items-center justify-center gap-4 px-6 py-10 animate-in zoom-in-50 fade-in duration-300">
            <div className="h-20 w-20 rounded-full bg-green-500/20 flex items-center justify-center">
              <CheckCircle2 className="h-10 w-10 text-green-500 animate-in zoom-in-0 duration-500" />
            </div>
            <div className="text-center">
              <h3 className="text-xl font-semibold text-green-600">
                {mode === "edit" ? "Schedule Updated!" : "Schedule Created!"}
              </h3>
              <p className="text-muted-foreground mt-1">
                Your changes have been saved
              </p>
            </div>
          </div>
        ) : (
          <div className="flex max-h-[min(92vh,920px)] flex-col">
            <DialogHeader className="border-b border-border/70 bg-background/95 px-6 py-5 pr-14 text-left sm:text-left">
              <DialogTitle className="flex items-center gap-2 text-[1.625rem] font-semibold tracking-tight">
                <Calendar className="h-5 w-5" />
                {mode === "edit" ? "Edit Schedule" : "Create Schedule"}
              </DialogTitle>
              <DialogDescription className="max-w-[60ch] text-sm leading-6">
                Control when menus and categories are available to customers
              </DialogDescription>
              {/* Location Context Banner */}
              <div
                className={cn(
                  "mt-3 p-3 rounded-lg border flex items-center gap-2",
                  isAllLocations
                    ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800"
                    : "bg-purple-50 border-purple-200 dark:bg-purple-950/30 dark:border-purple-800"
                )}
              >
                {isAllLocations ? (
                  <>
                    <Globe className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    <div>
                      <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                        Global Schedule
                      </p>
                      <p className="text-xs text-emerald-600 dark:text-emerald-400">
                        Will be available at all locations
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <MapPin className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                    <div>
                      <p className="text-sm font-medium text-purple-700 dark:text-purple-300">
                        Location-Specific Schedule
                      </p>
                      <p className="text-xs text-purple-600 dark:text-purple-400">
                        Only for:{" "}
                        {selectedLocation?.name || "Selected Location"}
                      </p>
                    </div>
                  </>
                )}
              </div>
            </DialogHeader>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
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
                      const isSelected = selectedDays.includes(index);
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
                      );
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
                        const daySlots = slotsByDay[day] || [];
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
                              <div className="flex gap-1">
                                {/* Easy Fill Button */}
                                {selectedDays.length > 1 &&
                                  daySlots.length > 0 && (
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          className="h-7 text-xs"
                                        >
                                          <Copy className="h-3 w-3 mr-1" />
                                          Copy
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end">
                                        <DropdownMenuLabel className="text-xs">
                                          Copy to...
                                        </DropdownMenuLabel>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                          onClick={() => copyToAllDays(day)}
                                        >
                                          <ArrowRight className="h-3 w-3 mr-2" />
                                          All other selected days
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        {selectedDays
                                          .filter((d) => d !== day)
                                          .map((targetDay) => (
                                            <DropdownMenuItem
                                              key={targetDay}
                                              onClick={() =>
                                                copyTimeSlotsToOtherDays(day, [
                                                  targetDay,
                                                ])
                                              }
                                            >
                                              {DAYS_FULL[targetDay]}
                                            </DropdownMenuItem>
                                          ))}
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  )}
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
                              {daySlots.map((slot, slotIdx) => (
                                <div
                                  key={slot.id}
                                  className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2"
                                  style={{
                                    animationDelay: `${slotIdx * 30}ms`,
                                  }}
                                >
                                  <TimeInput
                                    value={slot.start_time}
                                    onChange={(v) =>
                                      updateTimeSlot(slot.id, "start_time", v)
                                    }
                                    className="flex-1"
                                  />
                                  <span className="text-muted-foreground text-sm">
                                    to
                                  </span>
                                  <TimeInput
                                    value={slot.end_time}
                                    onChange={(v) =>
                                      updateTimeSlot(slot.id, "end_time", v)
                                    }
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
                        );
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
                          {name || "New Schedule"}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {selectedDays.map((day) => {
                          const slots = slotsByDay[day] || [];
                          return (
                            <Badge
                              key={day}
                              variant="secondary"
                              className="text-xs"
                            >
                              {DAYS_OF_WEEK[day]}: {slots.length} slot
                              {slots.length !== 1 ? "s" : ""}
                            </Badge>
                          );
                        })}
                      </div>
                    </div>
                  </BottomSheetSection>
                )}
              </div>
            </div>

            <DialogFooter className="border-t border-border/70 bg-background/95 px-6 py-4">
              <div className="flex w-full flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClose}
                  disabled={isSubmitting}
                  className="sm:min-w-[140px]"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!isValid || isSubmitting}
                  className="sm:min-w-[180px]"
                >
                  {isSubmitting ? (
                    <>
                      <svg
                        className="animate-spin -ml-1 mr-2 h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      {mode === "edit" ? "Updating..." : "Creating..."}
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      {mode === "edit" ? "Update Schedule" : "Create Schedule"}
                    </>
                  )}
                </Button>
              </div>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
