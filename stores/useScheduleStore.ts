import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  Shift,
  ScheduleTemplate,
  WeeklySchedule,
  SchedulePeriod,
  ApplyMode,
} from "@/types/schedule";
import {
  addDays,
  format,
  parseISO,
  startOfWeek,
  endOfWeek,
  isWithinInterval,
  areIntervalsOverlapping,
} from "date-fns";

interface ScheduleState {
  // shifts: Shift[]; // Logic moved to nested schedules
  // templates: ScheduleTemplate[]; // Removing templates for now as per user instruction to focus on core logic
  currentViewDate: string; // ISO date string
  viewUnsaved: boolean;

  // Actions
  addShift: (scheduleId: string, shift: Omit<Shift, "id">) => void;
  updateShift: (
    scheduleId: string,
    id: string,
    updates: Partial<Shift>
  ) => void;
  deleteShift: (scheduleId: string, id: string) => void;
  moveShift: (
    scheduleId: string,
    id: string,
    newStartTime: string,
    newEndTime: string,
    newEmployeeId?: string
  ) => void; // Updated for Drag-n-Drop
  // Templates
  applyTemplate: (
    scheduleId: string,
    scheduleType: "period" | "weekly",
    template: ScheduleTemplate,
    mode: ApplyMode
  ) => void;
  // View
  setCurrentViewDate: (date: Date) => void;

  // Getters
  getShiftsForDate: (scheduleId: string, date: Date) => Shift[];
  getShiftsForWeek: (scheduleId: string, date: Date) => Shift[];
  getEmployeeHours: (
    scheduleId: string,
    employeeId: string,
    weekStart: Date
  ) => number;
  // Dashboard Actions
  schedulePeriods: SchedulePeriod[];
  weeklySchedules: WeeklySchedule[];

  addSchedulePeriod: (period: Omit<SchedulePeriod, "id">) => void;
  updateSchedulePeriod: (id: string, updates: Partial<SchedulePeriod>) => void;
  addWeeklySchedule: (schedule: Omit<WeeklySchedule, "id">) => string; // Return new ID
  updateWeeklySchedule: (id: string, updates: Partial<WeeklySchedule>) => void;
  deleteSchedule: (id: string, type: "period" | "weekly") => void;

  checkConflicts: (
    scheduleId: string,
    shift: Omit<Shift, "id">,
    excludeShiftId?: string
  ) => boolean;
}

export const useScheduleStore = create<ScheduleState>()(
  persist(
    (set, get) => ({
      // shifts: [],
      templates: [],
      schedulePeriods: [],
      weeklySchedules: [],
      currentViewDate: new Date().toISOString(),
      viewUnsaved: false,

      addShift: (scheduleId, shiftData) =>
        set((state) => ({
          weeklySchedules: state.weeklySchedules.map((s) =>
            s.id === scheduleId
              ? {
                  ...s,
                  shifts: [
                    ...(s.shifts || []),
                    { ...shiftData, id: crypto.randomUUID() },
                  ],
                }
              : s
          ),
          schedulePeriods: state.schedulePeriods.map((s) =>
            s.id === scheduleId
              ? {
                  ...s,
                  shifts: [
                    ...(s.shifts || []),
                    { ...shiftData, id: crypto.randomUUID() },
                  ],
                }
              : s
          ),
        })),

      updateShift: (scheduleId, shiftId, updates) =>
        set((state) => ({
          weeklySchedules: state.weeklySchedules.map((s) =>
            s.id === scheduleId
              ? {
                  ...s,
                  shifts: (s.shifts || []).map((shift) =>
                    shift.id === shiftId ? { ...shift, ...updates } : shift
                  ),
                }
              : s
          ),
          schedulePeriods: state.schedulePeriods.map((s) =>
            s.id === scheduleId
              ? {
                  ...s,
                  shifts: (s.shifts || []).map((shift) =>
                    shift.id === shiftId ? { ...shift, ...updates } : shift
                  ),
                }
              : s
          ),
        })),

      deleteShift: (scheduleId, shiftId) =>
        set((state) => ({
          weeklySchedules: state.weeklySchedules.map((s) =>
            s.id === scheduleId
              ? {
                  ...s,
                  shifts: (s.shifts || []).filter(
                    (shift) => shift.id !== shiftId
                  ),
                }
              : s
          ),
          schedulePeriods: state.schedulePeriods.map((s) =>
            s.id === scheduleId
              ? {
                  ...s,
                  shifts: (s.shifts || []).filter(
                    (shift) => shift.id !== shiftId
                  ),
                }
              : s
          ),
        })),

      moveShift: (
        scheduleId,
        shiftId,
        newStartTime,
        newEndTime,
        newEmployeeId
      ) =>
        set((state) => ({
          weeklySchedules: state.weeklySchedules.map((s) =>
            s.id === scheduleId
              ? {
                  ...s,
                  shifts: (s.shifts || []).map((shift) =>
                    shift.id === shiftId
                      ? {
                          ...shift,
                          start_time: newStartTime,
                          end_time: newEndTime,
                          employee_id: newEmployeeId || shift.employee_id,
                        }
                      : shift
                  ),
                }
              : s
          ),
          schedulePeriods: state.schedulePeriods.map((s) =>
            s.id === scheduleId
              ? {
                  ...s,
                  shifts: (s.shifts || []).map((shift) =>
                    shift.id === shiftId
                      ? {
                          ...shift,
                          start_time: newStartTime,
                          end_time: newEndTime,
                          employee_id: newEmployeeId || shift.employee_id,
                        }
                      : shift
                  ),
                }
              : s
          ),
        })),

      setCurrentViewDate: (date) =>
        set({ currentViewDate: date.toISOString() }),

      getShiftsForDate: (scheduleId, date) => {
        const { weeklySchedules, schedulePeriods } = get();
        const schedule =
          weeklySchedules.find((s) => s.id === scheduleId) ||
          schedulePeriods.find((s) => s.id === scheduleId);

        if (!schedule) return [];

        const targetStr = format(date, "yyyy-MM-dd");
        return (schedule.shifts || []).filter(
          (s) => format(parseISO(s.start_time), "yyyy-MM-dd") === targetStr
        );
      },

      getShiftsForWeek: (scheduleId, date) => {
        const { weeklySchedules, schedulePeriods } = get();
        const schedule =
          weeklySchedules.find((s) => s.id === scheduleId) ||
          schedulePeriods.find((s) => s.id === scheduleId);

        if (!schedule) return [];

        const start = startOfWeek(date, { weekStartsOn: 1 });
        const end = endOfWeek(date, { weekStartsOn: 1 });
        return (schedule.shifts || []).filter((s) =>
          isWithinInterval(parseISO(s.start_time), { start, end })
        );
      },

      getEmployeeHours: (scheduleId, employeeId, weekStart) => {
        const { weeklySchedules, schedulePeriods } = get();
        const schedule =
          weeklySchedules.find((s) => s.id === scheduleId) ||
          schedulePeriods.find((s) => s.id === scheduleId);

        if (!schedule) return 0;

        const start = startOfWeek(weekStart, { weekStartsOn: 1 });
        const end = endOfWeek(weekStart, { weekStartsOn: 1 });

        const weeklyShifts = (schedule.shifts || []).filter(
          (s) =>
            s.employee_id === employeeId &&
            isWithinInterval(parseISO(s.start_time), { start, end })
        );

        return weeklyShifts.reduce((total, shift) => {
          const duration =
            (new Date(shift.end_time).getTime() -
              new Date(shift.start_time).getTime()) /
            1000 /
            60 /
            60;
          return total + duration;
        }, 0);
      },

      checkConflicts: (scheduleId, newShift, excludeShiftId) => {
        const { weeklySchedules, schedulePeriods } = get();
        const schedule =
          weeklySchedules.find((s) => s.id === scheduleId) ||
          schedulePeriods.find((s) => s.id === scheduleId);

        if (!schedule) return false;

        const newInterval = {
          start: parseISO(newShift.start_time),
          end: parseISO(newShift.end_time),
        };

        return (schedule.shifts || []).some((existing) => {
          if (existing.id === excludeShiftId) return false;
          if (existing.employee_id !== newShift.employee_id) return false;

          const existingInterval = {
            start: parseISO(existing.start_time),
            end: parseISO(existing.end_time),
          };

          return areIntervalsOverlapping(newInterval, existingInterval);
        });
      },

      addSchedulePeriod: (period) =>
        set((state) => ({
          schedulePeriods: [
            ...state.schedulePeriods,
            { ...period, id: crypto.randomUUID() },
          ],
        })),

      updateSchedulePeriod: (id, updates) =>
        set((state) => ({
          schedulePeriods: state.schedulePeriods.map((p) =>
            p.id === id ? { ...p, ...updates } : p
          ),
        })),

      addWeeklySchedule: (schedule) => {
        const id = crypto.randomUUID();
        set((state) => ({
          weeklySchedules: [...state.weeklySchedules, { ...schedule, id }],
        }));
        return id;
      },

      updateWeeklySchedule: (id, updates) =>
        set((state) => ({
          weeklySchedules: state.weeklySchedules.map((s) =>
            s.id === id ? { ...s, ...updates } : s
          ),
        })),

      deleteSchedule: (id, type) =>
        set((state) => {
          if (type === "period") {
            return {
              schedulePeriods: state.schedulePeriods.filter((p) => p.id !== id),
            };
          } else {
            return {
              weeklySchedules: state.weeklySchedules.filter((s) => s.id !== id),
            };
          }
        }),
      applyTemplate: (scheduleId, scheduleType, template, mode) => {
        try {
          console.log("Applying template:", {
            scheduleId,
            scheduleType,
            templateName: template.name,
            mode,
          });
          set((state) => {
            let targetSchedule: WeeklySchedule | SchedulePeriod | undefined;
            if (scheduleType === "weekly") {
              targetSchedule = state.weeklySchedules.find(
                (s) => s.id === scheduleId
              );
            } else {
              targetSchedule = state.schedulePeriods.find(
                (s) => s.id === scheduleId
              );
            }

            if (!targetSchedule) {
              console.error("Target schedule not found", scheduleId);
              return {};
            }

            console.log("Found target schedule:", targetSchedule.id);
            const startDate = parseISO(targetSchedule.startDate);
            console.log("Target start date:", startDate);

            const templateShifts = template.shifts
              .map((tShift) => {
                // Calculate relative day/time from template shift
                // For simplicity, assuming template shifts are stored with 2024-01-01 base
                // Adjust to target schedule's start date + relative day index

                // Use start_time as the reference for date, since 'date' property doesn't exist on Shift
                if (!tShift.start_time) {
                  console.error("Template shift missing start_time", tShift);
                  return null;
                }

                const tShiftDate = parseISO(tShift.start_time);
                const dayIndex =
                  (tShiftDate.getDay() - parseISO("2024-01-01").getDay() + 7) %
                  7;
                const targetShiftDate = addDays(startDate, dayIndex);

                // Construct new date object preserving time
                const originalStart = parseISO(tShift.start_time);
                const originalEnd = parseISO(tShift.end_time);

                const newStart = new Date(targetShiftDate);
                newStart.setHours(
                  originalStart.getHours(),
                  originalStart.getMinutes(),
                  0,
                  0
                );

                const newEnd = new Date(targetShiftDate);
                newEnd.setHours(
                  originalEnd.getHours(),
                  originalEnd.getMinutes(),
                  0,
                  0
                );
                // Handle overnight shifts
                if (newEnd <= newStart) {
                  newEnd.setDate(newEnd.getDate() + 1);
                }

                const newShift = {
                  ...tShift,
                  id: crypto.randomUUID(),
                  // date: format(targetShiftDate, "yyyy-MM-dd"), // Shift interface doesn't have date
                  start_time: newStart.toISOString(),
                  end_time: newEnd.toISOString(),
                  status: "open", // Reset status for new shifts
                  employee_id: "00000000-0000-0000-0000-000000000000", // Reset employee assignment (use empty UUID or specific unassigned logic)
                  employee_name: "Unassigned",
                } as Shift;

                return newShift;
              })
              .filter(Boolean) as Shift[];

            console.log("Processed shifts:", templateShifts.length);

            if (mode === "replace-all") {
              targetSchedule.shifts = templateShifts;
            } else if (mode === "merge") {
              targetSchedule.shifts = [
                ...(targetSchedule.shifts || []),
                ...templateShifts,
              ];
            } else if (mode === "fill-gaps") {
              // Only add if no shift exists for that role/time
              const existingShifts = targetSchedule.shifts || [];
              const nonConflictingShifts = templateShifts.filter((newShift) => {
                const newInterval = {
                  start: parseISO(newShift.start_time),
                  end: parseISO(newShift.end_time),
                };
                return !existingShifts.some((existing) => {
                  const existingInterval = {
                    start: parseISO(existing.start_time),
                    end: parseISO(existing.end_time),
                  };
                  return (
                    existing.employee_id === newShift.employee_id && // Check per employee (or role if unassigned)
                    areIntervalsOverlapping(newInterval, existingInterval)
                  );
                });
              });
              targetSchedule.shifts = [
                ...existingShifts,
                ...nonConflictingShifts,
              ];
            }

            console.log(
              "Shifts updated. New count:",
              targetSchedule.shifts.length
            );

            // Propagate manual updates back to state arrays
            if (scheduleType === "weekly") {
              return {
                weeklySchedules: state.weeklySchedules.map((s) =>
                  s.id === scheduleId ? (targetSchedule as WeeklySchedule) : s
                ),
              };
            } else {
              return {
                schedulePeriods: state.schedulePeriods.map((s) =>
                  s.id === scheduleId ? (targetSchedule as SchedulePeriod) : s
                ),
              };
            }
          });
        } catch (e) {
          console.error("Error in applyTemplate:", e);
        }
      },
    }),
    {
      name: "schedule-storage",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
