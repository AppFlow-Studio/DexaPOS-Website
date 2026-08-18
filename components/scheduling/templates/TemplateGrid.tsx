"use client";

import React, { useState } from "react";
import {
  format,
  parseISO,
  differenceInMinutes,
  isValid,
  addDays,
} from "date-fns";
import { Plus, User, Clock } from "lucide-react";
import { TemplateShift } from "@/types/schedule";
import {
  DndContext,
  useDraggable,
  useDroppable,
  DragEndEvent,
  DragOverlay,
  useSensor,
  useSensors,
  PointerSensor,
  TouchSensor,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { createPortal } from "react-dom";

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
  onMoveShift: (
    tempId: string,
    targetEmployeeId: string,
    targetDayOfWeek: number
  ) => void;
}

function DraggableShiftCard({
  shift,
  onClick,
}: {
  shift: TemplateShift;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: shift.tempId,
      data: { shift },
    });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.3 : 1,
    zIndex: isDragging ? 50 : "auto",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={(e) => {
        // Prevent click if dragging
        if (!isDragging) onClick();
      }}
      className="group/card relative cursor-grab touch-none rounded-r-md border-y border-r border-y-primary/10 border-r-primary/10 border-l-4 border-l-primary bg-primary/5 p-2 shadow-sm transition-all hover:bg-primary/10 hover:shadow-md active:cursor-grabbing"
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-bold text-foreground/90 truncate mr-2">
          {shift.role}
        </span>
      </div>
      <div className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
        <Clock className="w-3 h-3" />
        {format(parseISO(shift.startTime), "HH:mm")} -{" "}
        {format(parseISO(shift.endTime), "HH:mm")}
      </div>
    </div>
  );
}

function DroppableCell({
  employeeId,
  dayOfWeek,
  children,
  onAdd,
  hasShift,
}: {
  employeeId: string;
  dayOfWeek: number;
  children: React.ReactNode;
  onAdd: () => void;
  hasShift: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `cell-${employeeId}-${dayOfWeek}`,
    data: { employeeId, dayOfWeek },
  });

  return (
    <div
      ref={setNodeRef}
      className={`group/cell relative flex min-h-[100px] w-[50cqw] flex-none flex-col gap-2 border-r p-2 transition-colors last:border-r-0 sm:w-[140px] ${
        isOver
          ? "bg-primary/15 ring-2 ring-primary/20 ring-inset"
          : "hover:bg-muted/10"
      }`}
    >
      {children}

      {!hasShift && (
        <button
          onClick={onAdd}
          className="flex h-full min-h-8 w-full flex-1 items-center justify-center rounded-md border border-dashed border-muted-foreground/15 bg-transparent text-muted-foreground/45 opacity-100 transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary/70 sm:min-h-10 sm:opacity-0 sm:group-hover/cell:opacity-100"
          aria-label="Add shift"
        >
          <Plus className="h-3 w-3 sm:h-5 sm:w-5" />
        </button>
      )}
    </div>
  );
}

const TemplateGrid: React.FC<TemplateGridProps> = ({
  shifts,
  employees,
  onShiftPress,
  onAddShift,
  onMoveShift,
}) => {
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    })
  );

  const handleDragStart = (event: any) => {
    setActiveDragId(event.active.id);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragId(null);

    if (over && active) {
      const activeShiftId = active.id as string;
      const overData = over.data.current as any;

      if (overData && overData.employeeId && overData.dayOfWeek !== undefined) {
        onMoveShift(activeShiftId, overData.employeeId, overData.dayOfWeek);
      }
    }
  };

  const activeShift = activeDragId
    ? shifts.find((s) => s.tempId === activeDragId)
    : null;

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
      .filter((shift) => shift.employeeId === employeeId)
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
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="h-full min-h-0 w-full overflow-auto rounded-3xl border bg-white [container-type:inline-size]">
        <div className="w-max min-w-full">
          {/* Header Row */}
          <div className="sticky top-0 z-30 flex border-b bg-white">
          <div className="sticky left-0 z-40 w-[50cqw] flex-none border-r bg-white p-3 sm:w-64 sm:p-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Employee
            </span>
          </div>
          <div className="flex flex-none">
            {weekDates.map((date, i) => (
              <div
                key={i}
                className="flex w-[50cqw] flex-none flex-col items-center justify-center border-r bg-white p-3 text-center last:border-r-0 sm:w-[140px]"
              >
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {format(date, "EEE")}
                </span>
                <span className="text-lg font-light text-foreground/80">
                  {format(date, "d")}
                </span>
              </div>
            ))}
          </div>
          </div>

          {/* Grid Body */}
          <div>
          {employees.map((employee, index) => (
            <div
              key={employee.id ?? `employee-${index}`}
              className="flex border-b group transition-colors hover:bg-muted/5 even:bg-muted/[0.02]"
            >
              {/* Employee Column */}
              <div className="sticky left-0 z-20 flex w-[50cqw] flex-none items-center border-r bg-white p-3 sm:w-64 sm:p-4">
                <div className="flex-1 min-w-0">
                  <div className="truncate text-sm font-semibold text-foreground">
                    {employee.fullName}
                  </div>
                  <div className="hidden items-center gap-1.5 truncate text-xs text-muted-foreground sm:flex">
                    <span className="capitalize">{employee.role}</span>
                    <span className="h-1 w-1 rounded-full bg-muted-foreground/30" />
                    <span>{calculateTotalHours(employee.id)}h</span>
                  </div>
                </div>
              </div>

              {/* Days Columns */}
              <div className="flex flex-none">
                {weekDates.map((date) => {
                  const dayOfWeek = date.getDay();
                  const dayShifts = getShiftsForDayAndEmployee(
                    dayOfWeek,
                    employee.id
                  );
                  const hasShift = dayShifts.length > 0;

                  return (
                    <DroppableCell
                      key={`${employee.id}-${dayOfWeek}`}
                      employeeId={employee.id}
                      dayOfWeek={dayOfWeek}
                      onAdd={() => onAddShift(employee.id, dayOfWeek)}
                      hasShift={hasShift}
                    >
                      {dayShifts.map((shift) => (
                        <DraggableShiftCard
                          key={shift.tempId}
                          shift={shift}
                          onClick={() => onShiftPress(shift)}
                        />
                      ))}
                    </DroppableCell>
                  );
                })}
              </div>
            </div>
          ))}
          </div>
        </div>
      </div>

      {createPortal(
        <DragOverlay>
          {activeShift ? (
            <div className="bg-primary/10 border-l-4 border-l-primary p-2 rounded-r-md shadow-xl w-[140px] ring-2 ring-primary">
              <span className="text-xs font-bold text-foreground/90 block mb-1">
                {activeShift.role}
              </span>
              <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {format(parseISO(activeShift.startTime), "HH:mm")} -{" "}
                {format(parseISO(activeShift.endTime), "HH:mm")}
              </div>
            </div>
          ) : null}
        </DragOverlay>,
        document.body
      )}
    </DndContext>
  );
};

export default TemplateGrid;
