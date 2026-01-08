import {
  ScheduleTemplate,
  Shift,
  WeeklySchedule,
  SchedulePeriod,
} from "@/types/schedule";
import {
  startOfDay,
  getDay,
  parseISO,
  isValid,
  areIntervalsOverlapping,
  addDays,
  format,
  isSameDay,
} from "date-fns";

export interface ConflictDetail {
  templateShift: any; // Using any for TemplateShift as imported from types
  conflictType: "overlap" | "pto";
  conflictingWith?: Shift;
}

export interface TemplateConflictSummary {
  shiftsToAdd: number;
  conflictsDetected: number;
  conflictDetails: ConflictDetail[];
}

/**
 * Detects conflicts between a schedule template and an existing schedule.
 * Conflicts include overlapping shifts for the same employee.
 */
export function detectTemplateConflicts(
  template: ScheduleTemplate,
  currentSchedule: SchedulePeriod | WeeklySchedule,
  schedulePeriodStartDate: Date,
  schedulePeriodEndDate: Date
  // approvedPtoRequests: PTORequest[] // TODO: Add PTO support
): TemplateConflictSummary {
  let totalShiftsToAdd = 0;
  const conflictDetails: ConflictDetail[] = [];

  // Iterate through each day of the schedule period
  let currentDate = startOfDay(schedulePeriodStartDate);
  const endOfPeriod = startOfDay(schedulePeriodEndDate);

  // Safety break to prevent infinite loops if dates are bad
  let safetyCounter = 0;
  while (currentDate <= endOfPeriod && safetyCounter < 365) {
    safetyCounter++;
    const dayOfWeek = getDay(currentDate); // 0 for Sunday, 1 for Monday, etc.
    const currentDateISO = format(currentDate, "yyyy-MM-dd");

    template.shifts.forEach((templateShift) => {
      if (templateShift.dayOfWeek === dayOfWeek) {
        // This template shift applies to the current day
        if (!templateShift.employeeId) {
          totalShiftsToAdd++;
          return;
        }

        // Parse times. TemplateShift uses camelCase startTime/endTime
        const tStartPart = templateShift.startTime.includes("T")
          ? templateShift.startTime.split("T")[1]
          : "09:00:00";
        const tEndPart = templateShift.endTime.includes("T")
          ? templateShift.endTime.split("T")[1]
          : "17:00:00";

        const templateShiftStartDateTime = parseISO(
          `${currentDateISO}T${tStartPart}`
        );
        const templateShiftEndDateTime = parseISO(
          `${currentDateISO}T${tEndPart}`
        );

        if (
          !isValid(templateShiftStartDateTime) ||
          !isValid(templateShiftEndDateTime)
        ) {
          console.warn("Invalid date/time for template shift:", templateShift);
          return;
        }

        const templateShiftInterval = {
          start: templateShiftStartDateTime,
          end: templateShiftEndDateTime,
        };

        const existingEmployeeShiftsOnDay = currentSchedule.shifts.filter(
          (s) =>
            s.employee_id === templateShift.employeeId &&
            isSameDay(parseISO(s.start_time), currentDate)
        );

        let hasConflict = false;

        // 1. Check for Overlapping Shifts
        for (const existingShift of existingEmployeeShiftsOnDay) {
          const existingShiftStartDateTime = parseISO(existingShift.start_time);
          const existingShiftEndDateTime = parseISO(existingShift.end_time);

          if (
            !isValid(existingShiftStartDateTime) ||
            !isValid(existingShiftEndDateTime)
          ) {
            continue;
          }

          const existingShiftInterval = {
            start: existingShiftStartDateTime,
            end: existingShiftEndDateTime,
          };

          if (
            areIntervalsOverlapping(
              templateShiftInterval,
              existingShiftInterval
            )
          ) {
            conflictDetails.push({
              templateShift,
              conflictType: "overlap",
              conflictingWith: existingShift,
            });
            hasConflict = true;
            break; // Found a conflict for this shift
          }
        }

        // 2. Check for PTO (Skipped for now)

        if (!hasConflict) {
          totalShiftsToAdd++;
        }
      }
    });

    currentDate = addDays(currentDate, 1);
  }

  return {
    shiftsToAdd: totalShiftsToAdd,
    conflictsDetected: conflictDetails.length,
    conflictDetails,
  };
}
