import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  Shift,
  ScheduleTemplate,
  WeeklySchedule,
  SchedulePeriod,
  ApplyMode,
  DropRequest,
  SwapRequest,
  PTORequest,
  ChangeSummary,
  ShiftConflict,
} from "@/types/schedule";
import {
  addDays,
  format,
  parseISO,
  startOfWeek,
  endOfWeek,
  isWithinInterval,
  areIntervalsOverlapping,
  getDay,
  startOfDay,
  isSameDay,
} from "date-fns";

interface ScheduleState {
  currentViewDate: string; // ISO date string
  viewUnsaved: boolean;

  // Schedules
  schedulePeriods: SchedulePeriod[];
  weeklySchedules: WeeklySchedule[];

  // Requests (Mock Data)
  dropRequests: DropRequest[];
  swapRequests: SwapRequest[];
  ptoRequests: PTORequest[];

  // Shift Actions
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
  ) => void;

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

  // Schedule CRUD
  addSchedulePeriod: (period: Omit<SchedulePeriod, "id">) => void;
  updateSchedulePeriod: (id: string, updates: Partial<SchedulePeriod>) => void;
  addWeeklySchedule: (schedule: Omit<WeeklySchedule, "id">) => string;
  updateWeeklySchedule: (id: string, updates: Partial<WeeklySchedule>) => void;
  deleteSchedule: (id: string, type: "period" | "weekly") => void;

  // Conflict Detection
  checkConflicts: (
    scheduleId: string,
    shift: Omit<Shift, "id">,
    excludeShiftId?: string
  ) => boolean;
  checkShiftConflicts: (
    scheduleId: string,
    scheduleType: "period" | "weekly"
  ) => ShiftConflict[];

  // Draft-Edit Workflow
  findOrCreateDraft: (originalId: string, type: "period" | "weekly") => string;
  compareSchedules: (originalId: string, draftId: string) => ChangeSummary;
  discardDraft: (draftId: string, type: "period" | "weekly") => void;

  // Publish
  publishSchedule: (scheduleId: string, type: "period" | "weekly") => void;

  // Request Actions
  approveDropRequest: (requestId: string, approvedBy: string) => void;
  denyDropRequest: (
    requestId: string,
    deniedBy: string,
    reason: string
  ) => void;
  revertDropRequestApproval: (requestId: string) => void;
  approveSwap: (requestId: string) => void;
  denySwap: (requestId: string) => void;
  revertSwapApproval: (requestId: string) => void;
  approvePTORequest: (requestId: string, approvedBy: string) => void;
  denyPTORequest: (requestId: string, deniedBy: string, reason: string) => void;
  revertPTORequestApproval: (requestId: string) => void;

  // Open Shifts
  getOpenShifts: (scheduleId: string) => Shift[];
  assignOpenShift: (
    scheduleId: string,
    shiftId: string,
    employeeId: string,
    employeeName: string
  ) => void;
  reset: () => void;
}

const scheduleInitialState = {
  schedulePeriods: [] as SchedulePeriod[],
  weeklySchedules: [] as WeeklySchedule[],
  currentViewDate: new Date().toISOString(),
  viewUnsaved: false,
  dropRequests: [] as DropRequest[],
  swapRequests: [] as SwapRequest[],
  ptoRequests: [] as PTORequest[],
}

export const useScheduleStore = create<ScheduleState>()(
  persist(
    (set, get) => ({
      schedulePeriods: [],
      weeklySchedules: [],
      currentViewDate: new Date().toISOString(),
      viewUnsaved: false,

      // Mock Request Data
      dropRequests: [],
      swapRequests: [],
      ptoRequests: [
        {
          id: "pto-1",
          employeeId: "emp-1",
          startDate: "2026-01-15",
          endDate: "2026-01-17",
          note: "Family vacation",
          status: "pending",
          submittedAt: new Date().toISOString(),
        },
      ] as any[],

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
          console.log("Applying template (Fixed):", {
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

            const scheduleStartDate = startOfDay(
              parseISO(targetSchedule.startDate)
            );
            const scheduleEndDate = startOfDay(
              parseISO(targetSchedule.endDate)
            );

            const templateShiftsToApply: Shift[] = [];
            let currentDate = scheduleStartDate;

            // Iterate through each day of the schedule period
            while (currentDate <= scheduleEndDate) {
              const dayOfWeek = getDay(currentDate); // 0-6 (Sun-Sat)

              template.shifts.forEach((tShift) => {
                // Match template shift to current day
                if (tShift.dayOfWeek === dayOfWeek) {
                  const dateStr = format(currentDate, "yyyy-MM-dd");

                  // Extract time parts from ISO template strings safely
                  const startTimePart = tShift.startTime.includes("T")
                    ? tShift.startTime.split("T")[1]
                    : "09:00:00";
                  const endTimePart = tShift.endTime.includes("T")
                    ? tShift.endTime.split("T")[1]
                    : "17:00:00";

                  const newStartTime = `${dateStr}T${startTimePart}`;
                  let newEndTime = `${dateStr}T${endTimePart}`;

                  // Handle overnight shifts (if end time is earlier or equal to start time)
                  if (newEndTime <= newStartTime) {
                    const nextDayStr = format(
                      addDays(currentDate, 1),
                      "yyyy-MM-dd"
                    );
                    newEndTime = `${nextDayStr}T${endTimePart}`;
                  }

                  const newShift: Shift = {
                    id: crypto.randomUUID(),
                    employee_id: tShift.employeeId || "unassigned",
                    employee_name: "Unassigned", // Placeholder
                    start_time: newStartTime,
                    end_time: newEndTime,
                    role: tShift.role,
                    location_id: "default",
                    notes: tShift.notes,
                    is_template: true,
                    color: undefined,
                  };
                  templateShiftsToApply.push(newShift);
                }
              });
              currentDate = addDays(currentDate, 1);
            }

            console.log("Processed shifts:", templateShiftsToApply.length);

            const existingShifts = targetSchedule.shifts || [];

            if (mode === "replace-all") {
              targetSchedule.shifts = templateShiftsToApply;
            } else if (mode === "merge") {
              // Delete existing shifts that overlap with new ones for the same employee
              const shiftsToDelete = new Set<string>();

              templateShiftsToApply.forEach((newShift) => {
                const newInterval = {
                  start: parseISO(newShift.start_time),
                  end: parseISO(newShift.end_time),
                };

                existingShifts.forEach((existing) => {
                  const existInterval = {
                    start: parseISO(existing.start_time),
                    end: parseISO(existing.end_time),
                  };

                  // User request: "We check for that day" -> If same employee & same day, OVERWRITE.
                  if (
                    existing.employee_id === newShift.employee_id &&
                    isSameDay(
                      parseISO(existing.start_time),
                      parseISO(newShift.start_time)
                    )
                  ) {
                    shiftsToDelete.add(existing.id);
                  }
                });
              });

              const keptShifts = existingShifts.filter(
                (s) => !shiftsToDelete.has(s.id)
              );
              targetSchedule.shifts = [...keptShifts, ...templateShiftsToApply];
            } else if (mode === "fill-gaps") {
              // Only add new shifts if they DON'T overlap existing
              const nonConflicting = templateShiftsToApply.filter(
                (newShift) => {
                  const newInterval = {
                    start: parseISO(newShift.start_time),
                    end: parseISO(newShift.end_time),
                  };
                  return !existingShifts.some((existing) => {
                    const existInterval = {
                      start: parseISO(existing.start_time),
                      end: parseISO(existing.end_time),
                    };
                    return (
                      existing.employee_id === newShift.employee_id &&
                      areIntervalsOverlapping(newInterval, existInterval)
                    );
                  });
                }
              );
              targetSchedule.shifts = [...existingShifts, ...nonConflicting];
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

      // --- New Actions ---

      checkShiftConflicts: (scheduleId, scheduleType) => {
        const state = get();
        const schedule =
          scheduleType === "weekly"
            ? state.weeklySchedules.find((s) => s.id === scheduleId)
            : state.schedulePeriods.find((s) => s.id === scheduleId);

        if (!schedule) return [];

        const conflicts: ShiftConflict[] = [];
        const shifts = schedule.shifts || [];

        // Group shifts by employee
        const shiftsByEmployee = shifts.reduce((acc, shift) => {
          if (!shift.employee_id) return acc;
          if (!acc[shift.employee_id]) acc[shift.employee_id] = [];
          acc[shift.employee_id].push(shift);
          return acc;
        }, {} as Record<string, Shift[]>);

        // Check for overlaps per employee
        Object.entries(shiftsByEmployee).forEach(([empId, empShifts]) => {
          for (let i = 0; i < empShifts.length; i++) {
            for (let j = i + 1; j < empShifts.length; j++) {
              const a = empShifts[i];
              const b = empShifts[j];
              if (
                areIntervalsOverlapping(
                  { start: parseISO(a.start_time), end: parseISO(a.end_time) },
                  { start: parseISO(b.start_time), end: parseISO(b.end_time) }
                )
              ) {
                conflicts.push({
                  employeeName: a.employee_name,
                  date: format(parseISO(a.start_time), "MMM d"),
                  shiftId: a.id,
                });
              }
            }
          }
        });

        return conflicts;
      },

      findOrCreateDraft: (originalId, type) => {
        const state = get();
        const schedules =
          type === "weekly" ? state.weeklySchedules : state.schedulePeriods;

        // Check if a draft-edit already exists
        const existingDraft = schedules.find(
          (s) =>
            s.originalScheduleId === originalId && s.status === "draft-edit"
        );
        if (existingDraft) return existingDraft.id;

        // Find original
        const original = schedules.find((s) => s.id === originalId);
        if (!original) return originalId;

        // Create draft copy
        const draftId = crypto.randomUUID();
        const draft = {
          ...original,
          id: draftId,
          status: "draft-edit" as const,
          originalScheduleId: originalId,
          shifts: [...(original.shifts || [])],
        };

        if (type === "weekly") {
          set({
            weeklySchedules: [
              ...state.weeklySchedules,
              draft as WeeklySchedule,
            ],
          });
        } else {
          set({
            schedulePeriods: [
              ...state.schedulePeriods,
              draft as SchedulePeriod,
            ],
          });
        }

        return draftId;
      },

      compareSchedules: (originalId, draftId) => {
        const state = get();
        const allSchedules = [
          ...state.weeklySchedules,
          ...state.schedulePeriods,
        ];

        const original = allSchedules.find((s) => s.id === originalId);
        const draft = allSchedules.find((s) => s.id === draftId);

        if (!original || !draft) {
          return { added: 0, updated: 0, removed: 0 };
        }

        const originalShiftIds = new Set(
          (original.shifts || []).map((s) => s.id)
        );
        const draftShiftIds = new Set((draft.shifts || []).map((s) => s.id));

        const added = (draft.shifts || []).filter(
          (s) => !originalShiftIds.has(s.id)
        ).length;
        const removed = (original.shifts || []).filter(
          (s) => !draftShiftIds.has(s.id)
        ).length;
        const updated = (draft.shifts || []).filter((s) => {
          if (!originalShiftIds.has(s.id)) return false;
          const orig = (original.shifts || []).find((os) => os.id === s.id);
          return orig && JSON.stringify(orig) !== JSON.stringify(s);
        }).length;

        return { added, updated, removed };
      },

      discardDraft: (draftId, type) => {
        set((state) => ({
          weeklySchedules:
            type === "weekly"
              ? state.weeklySchedules.filter((s) => s.id !== draftId)
              : state.weeklySchedules,
          schedulePeriods:
            type === "period"
              ? state.schedulePeriods.filter((s) => s.id !== draftId)
              : state.schedulePeriods,
        }));
      },

      publishSchedule: (scheduleId, type) => {
        set((state) => {
          if (type === "weekly") {
            const schedule = state.weeklySchedules.find(
              (s) => s.id === scheduleId
            );
            if (!schedule) return state;

            // If it's a draft-edit, merge into original and delete draft
            if (
              schedule.status === "draft-edit" &&
              schedule.originalScheduleId
            ) {
              return {
                weeklySchedules: state.weeklySchedules
                  .filter((s) => s.id !== scheduleId)
                  .map((s) =>
                    s.id === schedule.originalScheduleId
                      ? {
                          ...s,
                          shifts: schedule.shifts,
                          status: "published" as const,
                        }
                      : s
                  ),
              };
            }

            // Otherwise just publish
            return {
              weeklySchedules: state.weeklySchedules.map((s) =>
                s.id === scheduleId ? { ...s, status: "published" as const } : s
              ),
            };
          } else {
            const schedule = state.schedulePeriods.find(
              (s) => s.id === scheduleId
            );
            if (!schedule) return state;

            if (
              schedule.status === "draft-edit" &&
              schedule.originalScheduleId
            ) {
              return {
                schedulePeriods: state.schedulePeriods
                  .filter((s) => s.id !== scheduleId)
                  .map((s) =>
                    s.id === schedule.originalScheduleId
                      ? {
                          ...s,
                          shifts: schedule.shifts,
                          status: "active" as const,
                        }
                      : s
                  ),
              };
            }

            return {
              schedulePeriods: state.schedulePeriods.map((s) =>
                s.id === scheduleId ? { ...s, status: "active" as const } : s
              ),
            };
          }
        });
      },

      // --- Request Actions ---

      approveDropRequest: (requestId, approvedBy) => {
        set((state) => ({
          dropRequests: state.dropRequests.map((r) =>
            r.id === requestId
              ? { ...r, status: "approved" as const, approvedBy }
              : r
          ),
        }));
      },

      denyDropRequest: (requestId, deniedBy, reason) => {
        set((state) => ({
          dropRequests: state.dropRequests.map((r) =>
            r.id === requestId
              ? {
                  ...r,
                  status: "denied" as const,
                  deniedBy,
                  denyReason: reason,
                }
              : r
          ),
        }));
      },

      revertDropRequestApproval: (requestId) => {
        set((state) => ({
          dropRequests: state.dropRequests.map((r) =>
            r.id === requestId
              ? { ...r, status: "pending" as const, approvedBy: undefined }
              : r
          ),
        }));
      },

      approveSwap: (requestId) => {
        set((state) => ({
          swapRequests: state.swapRequests.map((r) =>
            r.id === requestId ? { ...r, status: "approved" as const } : r
          ),
        }));
      },

      denySwap: (requestId) => {
        set((state) => ({
          swapRequests: state.swapRequests.map((r) =>
            r.id === requestId ? { ...r, status: "denied" as const } : r
          ),
        }));
      },

      revertSwapApproval: (requestId) => {
        set((state) => ({
          swapRequests: state.swapRequests.map((r) =>
            r.id === requestId
              ? { ...r, status: "pending-manager" as const }
              : r
          ),
        }));
      },

      approvePTORequest: (requestId, approvedBy) => {
        set((state) => ({
          ptoRequests: state.ptoRequests.map((r) =>
            r.id === requestId
              ? { ...r, status: "approved" as const, approvedBy }
              : r
          ),
        }));
      },

      denyPTORequest: (requestId, deniedBy, reason) => {
        set((state) => ({
          ptoRequests: state.ptoRequests.map((r) =>
            r.id === requestId
              ? {
                  ...r,
                  status: "denied" as const,
                  deniedBy,
                  denyReason: reason,
                }
              : r
          ),
        }));
      },

      revertPTORequestApproval: (requestId) => {
        set((state) => ({
          ptoRequests: state.ptoRequests.map((r) =>
            r.id === requestId
              ? { ...r, status: "pending" as const, approvedBy: undefined }
              : r
          ),
        }));
      },

      // --- Open Shifts ---

      getOpenShifts: (scheduleId) => {
        const state = get();
        const schedule =
          state.weeklySchedules.find((s) => s.id === scheduleId) ||
          state.schedulePeriods.find((s) => s.id === scheduleId);

        if (!schedule) return [];
        return (schedule.shifts || []).filter(
          (s) => s.status === "open" || s.employee_id === null
        );
      },

      assignOpenShift: (scheduleId, shiftId, employeeId, employeeName) => {
        set((state) => ({
          weeklySchedules: state.weeklySchedules.map((s) =>
            s.id === scheduleId
              ? {
                  ...s,
                  shifts: (s.shifts || []).map((shift) =>
                    shift.id === shiftId
                      ? {
                          ...shift,
                          employee_id: employeeId,
                          employee_name: employeeName,
                          status: "scheduled" as const,
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
                          employee_id: employeeId,
                          employee_name: employeeName,
                          status: "scheduled" as const,
                        }
                      : shift
                  ),
                }
              : s
          ),
        }));
      },

      reset: () => set(scheduleInitialState),
    }),
    {
      name: "schedule-storage",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
