"use client";

import React from "react";
import {
  format,
  parseISO,
  differenceInMinutes,
  isValid,
  addDays,
} from "date-fns";
import { Plus, User } from "lucide-react";
import { TemplateShift } from "@/types/schedule";

// Determine start of week for generic display (Monday base)
const startOfWeek = new Date("2024-01-01T00:00:00.000Z"); // A Monday
const weekDates = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek, i));

interface EmployeeProfile {
  id: string;
  fullName: string;
  role: string;
  baseWage?: number;
}

interface TemplateGridProps {
  shifts: TemplateShift[];
  employees: EmployeeProfile[];
  onShiftPress: (shift: TemplateShift) => void;
  onAddShift: (employeeId: string, dayOfWeek: number) => void;
}

const TemplateGrid: React.FC<TemplateGridProps> = ({
  shifts,
  employees,
  onShiftPress,
  onAddShift,
}) => {
  const getShiftsForDayAndEmployee = (
    dayOfWeek: number,
    employeeId: string
  ) => {
    return shifts.filter(
      (s) => s.dayOfWeek === dayOfWeek && s.employeeId === employeeId
    );
  };

  const calculateTotalHours = (employeeId: string) => {
    const totalMinutes = shifts
      .filter((s) => s.employeeId === employeeId)
      .reduce((total, shift) => {
        if (!shift.startTime || !shift.endTime) return total;
        const start = parseISO(shift.startTime);
        const end = parseISO(shift.endTime);
        if (!isValid(start) || !isValid(end)) return total;
        return total + differenceInMinutes(end, start);
      }, 0);
    return (totalMinutes / 60).toFixed(1);
  };

  return (
    <div className="flex-1 bg-background rounded-lg overflow-hidden border">
      {/* Header Row */}
      <div className="flex bg-muted/40 border-b">
        <div className="w-56 p-4 border-r flex-shrink-0">
          <span className="text-sm font-bold text-foreground">Employee</span>
        </div>
        <div className="flex-1 flex min-w-0">
          {weekDates.map((date, i) => (
            <div
              key={i}
              className="flex-1 min-w-[120px] p-3 text-center border-r last:border-r-0 flex items-center justify-center font-medium"
            >
              <span className="text-sm text-foreground">
                {format(date, "EEEE")}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Grid Body */}
      <div className="overflow-y-auto max-h-[600px]">
        {employees.map((employee) => (
          <div
            key={employee.id}
            className="flex border-b group hover:bg-muted/10 transition-colors"
          >
            {/* Employee Column */}
            <div className="w-56 p-3 flex items-center border-r bg-muted/10 flex-shrink-0 sticky left-0 z-10">
              <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center mr-3 shadow-sm flex-shrink-0">
                <span className="text-primary-foreground font-bold text-sm">
                  {employee.fullName
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-foreground truncate">
                  {employee.fullName}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {employee.role}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {calculateTotalHours(employee.id)}h
                </div>
              </div>
            </div>

            {/* Days Columns */}
            <div className="flex-1 flex min-w-0">
              {weekDates.map((date) => {
                const dayOfWeek = date.getDay();

                const dayShifts = getShiftsForDayAndEmployee(
                  dayOfWeek,
                  employee.id
                );

                return (
                  <div
                    key={`${employee.id}-${dayOfWeek}`}
                    className="flex-1 min-w-[120px] p-2 border-r last:border-r-0 relative min-h-[80px]"
                  >
                    {dayShifts.length > 0 ? (
                      <div className="space-y-1.5">
                        {dayShifts.map((shift) => (
                          <div
                            key={shift.tempId}
                            onClick={() => onShiftPress(shift)}
                            className="bg-primary/10 border border-primary/20 rounded p-1.5 cursor-pointer hover:bg-primary/20 transition-colors"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-medium text-foreground truncate">
                                {shift.role}
                              </span>
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              {format(parseISO(shift.startTime), "HH:mm")} -{" "}
                              {format(parseISO(shift.endTime), "HH:mm")}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <button
                        onClick={() => onAddShift(employee.id, dayOfWeek)}
                        className="w-full h-full flex items-center justify-center rounded border border-dashed text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-all opacity-0 group-hover:opacity-100"
                      >
                        <Plus size={16} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TemplateGrid;
