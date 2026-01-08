"use client";

import { useMemo, useState } from "react";
import {
  format,
  addDays,
  startOfWeek,
  endOfWeek,
  isSameDay,
  parseISO,
  isWithinInterval,
  isBefore,
  isAfter,
  startOfDay,
  endOfDay,
} from "date-fns";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  DragEndEvent,
  DragStartEvent,
  useSensor,
  useSensors,
  PointerSensor,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useUnifiedStaff } from "@/app/dashboard/hooks/useStaff";
import { useScheduleStore } from "@/stores/useScheduleStore";
import { ShiftModal } from "./ShiftModal";
import { Shift } from "@/types/schedule";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Plus, AlertTriangle, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { ShiftCard } from "./ShiftCard";
import { toast } from "sonner";
import React from "react";

interface WeeklyCalendarProps {
  currentDate: Date;
  minDate?: Date;
  maxDate?: Date;
  previewShifts?: Shift[];
  conflictingPreviewIds?: Set<string>;
}

export function WeeklyCalendar({
  currentDate,
  scheduleId,
  minDate,
  maxDate,
  previewShifts,
  conflictingPreviewIds,
}: WeeklyCalendarProps & { scheduleId: string }) {
  const schedule = useScheduleStore(
    (state) =>
      state.weeklySchedules.find((s) => s.id === scheduleId) ||
      state.schedulePeriods.find((s) => s.id === scheduleId)
  );
  const shifts = schedule?.shifts || [];
  const { data: staffMembers = [] } = useUnifiedStaff();

  const weekStart = startOfDay(currentDate);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  const weeklyShifts = useMemo(() => {
    const start = startOfDay(currentDate);
    const end = endOfDay(addDays(start, 6));
    return shifts.filter((s) =>
      isWithinInterval(parseISO(s.start_time), { start, end })
    );
  }, [shifts, currentDate]);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [newShiftDefaults, setNewShiftDefaults] = useState<{
    date?: Date;
    employeeId?: string;
  }>({});

  const handleAddShift = (date: Date, employeeId: string) => {
    setSelectedShift(null);
    setNewShiftDefaults({ date, employeeId });
    setIsModalOpen(true);
  };

  const handleEditShift = (shift: Shift) => {
    setSelectedShift(shift);
    setNewShiftDefaults({});
    setIsModalOpen(true);
  };

  // DnD State
  const [activeDragShift, setActiveDragShift] = useState<Shift | null>(null);
  const moveShift = useScheduleStore((state) => state.moveShift);
  const checkConflicts = useScheduleStore((state) => state.checkConflicts);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const shiftId = event.active.id as string;
    const shift = shifts.find((s) => s.id === shiftId);
    if (shift) setActiveDragShift(shift);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragShift(null);

    if (!over) return;

    const shiftId = active.id as string;
    const shift = shifts.find((s) => s.id === shiftId);
    if (!shift) return;

    const [_, employeeId, dateStr] = (over.id as string).split("::");

    if (employeeId && dateStr) {
      const oldStart = parseISO(shift.start_time);
      const oldEnd = parseISO(shift.end_time);
      const duration = oldEnd.getTime() - oldStart.getTime();

      const newDate = parseISO(dateStr);
      const newStart = new Date(newDate);
      newStart.setHours(oldStart.getHours(), oldStart.getMinutes());
      const newEnd = new Date(newStart.getTime() + duration);

      const potentialShift = {
        ...shift,
        start_time: newStart.toISOString(),
        end_time: newEnd.toISOString(),
        employee_id: employeeId,
      };

      if (checkConflicts(scheduleId, potentialShift, shift.id)) {
        toast.error("Conflict detected", {
          description: "This shift overlaps with another shift.",
        });
        return;
      }

      moveShift(
        scheduleId,
        shiftId,
        newStart.toISOString(),
        newEnd.toISOString(),
        employeeId
      );
    }
  };

  // -------------------------------------------------------------------------
  // Helper to render a Row (Employee or Open)
  // -------------------------------------------------------------------------
  const renderRow = (
    rowId: string,
    headerContent: React.ReactNode,
    rowShifts: Shift[],
    rowPreviewShifts: Shift[]
  ) => {
    // Calculate total hours for this row
    const hours = rowShifts.reduce((acc, shift) => {
      const duration =
        (new Date(shift.end_time).getTime() -
          new Date(shift.start_time).getTime()) /
        1000 /
        60 /
        60;
      return acc + duration;
    }, 0);

    return (
      <div
        key={rowId}
        className="flex border-b border-border min-h-[100px] hover:bg-muted/5 transition-colors group/row even:bg-muted/[0.02]"
      >
        {/* Row Header */}
        <div className="w-[200px] flex-shrink-0 border-r border-border p-4 flex flex-col gap-2 bg-background/50 sticky left-0 z-10 backdrop-blur-sm">
          {headerContent}
          <div className="mt-auto pt-2 text-xs text-muted-foreground border-t border-border/50 flex justify-between items-center">
            <span>Total</span>
            <span className="font-medium bg-primary/10 px-1.5 py-0.5 rounded text-[10px] text-primary">
              {hours.toFixed(1)}h
            </span>
          </div>
        </div>

        {/* Day Cells */}
        {days.map((day) => {
          const dayShifts = rowShifts
            .filter((s) => isSameDay(parseISO(s.start_time), day))
            .sort((a, b) => a.start_time.localeCompare(b.start_time));

          const dayPreviewShifts = rowPreviewShifts
            .filter((s) => isSameDay(parseISO(s.start_time), day))
            .sort((a, b) => a.start_time.localeCompare(b.start_time));

          const isDisabled =
            (minDate && isBefore(day, startOfDay(minDate))) ||
            (maxDate && isAfter(day, endOfDay(maxDate)));

          return (
            <DayCell
              key={day.toISOString()}
              day={day}
              employeeId={rowId}
              onAdd={() => handleAddShift(day, rowId)}
              disabled={isDisabled}
            >
              {/* Render Preview Shifts FIRST (Bottom layer visually, but top of stack) */}
              {dayPreviewShifts.map((shift) => {
                const tempId = shift.id.replace("preview-", "");
                const isConflicting = conflictingPreviewIds?.has(tempId);

                return (
                  <div
                    key={`preview-${shift.id}`}
                    className={cn(
                      "relative border-2 border-dashed pointer-events-none rounded-r-md rounded-l-none overflow-hidden animate-in fade-in zoom-in-95 duration-200 border-l-4",
                      isConflicting
                        ? "border-red-500/50 bg-red-500/10 border-l-red-500"
                        : "border-primary/50 bg-primary/5 border-l-primary/50",
                      "opacity-100"
                    )}
                  >
                    {isConflicting && (
                      <div className="absolute top-0 right-0 bg-red-500 text-[9px] text-white px-1.5 py-0.5 rounded-bl-md z-10 font-bold flex items-center gap-1">
                        <AlertTriangle
                          className="w-2 h-2"
                          fill="currentColor"
                        />
                      </div>
                    )}
                    {/* Ghost Tag for Non-conflicting */}
                    {!isConflicting && (
                      <div className="absolute top-0 right-0 bg-primary text-[8px] text-primary-foreground px-1.5 py-0.5 rounded-bl-md z-10 font-bold">
                        NEW
                      </div>
                    )}

                    <div
                      className={cn(
                        "transition-opacity duration-200",
                        isConflicting
                          ? "opacity-90"
                          : "opacity-70 grayscale-[0.3]"
                      )}
                    >
                      <ShiftCard shift={shift} />
                    </div>
                  </div>
                );
              })}

              {/* Render Actual Shifts */}
              {dayShifts.map((shift) => (
                <DraggableShiftCard
                  key={shift.id}
                  shift={shift}
                  onClick={() => handleEditShift(shift)}
                />
              ))}
            </DayCell>
          );
        })}
      </div>
    );
  };

  // -------------------------------------------------------------------------
  // Prepare Open Shifts Row Data
  // -------------------------------------------------------------------------
  const staffIds = new Set(staffMembers.map((s) => s.member_id));

  const openShifts = weeklyShifts.filter(
    (s) => s.employee_id === "unassigned" || !staffIds.has(s.employee_id)
  );
  const openPreviewShifts = (previewShifts || []).filter(
    (s) => s.employee_id === "unassigned" || !staffIds.has(s.employee_id)
  );

  // -------------------------------------------------------------------------
  // Main Render
  // -------------------------------------------------------------------------
  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col h-full bg-background rounded-lg border shadow-sm overflow-hidden">
        {/* Calendar Header */}
        <div className="flex border-b border-border min-h-[60px] bg-muted/50 sticky top-0 z-20">
          <div className="w-[200px] flex-shrink-0 border-r border-border p-4 flex items-center bg-muted/20">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Employee
            </span>
          </div>
          {days.map((day) => (
            <div
              key={day.toISOString()}
              className="flex-1 border-r border-border last:border-r-0 p-2 text-center flex flex-col justify-center items-center bg-muted/20"
            >
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {format(day, "EEE")}
              </div>
              <div
                className={cn(
                  "text-lg font-light flex items-center justify-center mt-0.5",
                  isSameDay(day, new Date())
                    ? "text-primary font-medium"
                    : "text-foreground/80"
                )}
              >
                {format(day, "d")}
              </div>
            </div>
          ))}
        </div>

        {/* Scrollable Grid Body */}
        <div className="flex-1 overflow-auto">
          <div className="flex flex-col">
            {/* Open Shifts Row (Always First) */}
            {(openShifts.length > 0 || openPreviewShifts.length > 0) &&
              renderRow(
                "unassigned",
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-orange-500/10 text-orange-600 flex items-center justify-center border border-orange-200">
                    <Users className="w-4 h-4" />
                  </div>
                  <div className="overflow-hidden">
                    <div className="text-sm font-semibold truncate text-foreground">
                      Open Shifts
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      Unassigned
                    </div>
                  </div>
                </div>,
                openShifts,
                openPreviewShifts
              )}

            {/* Staff Rows */}
            {staffMembers.map((staff) => {
              const rowShifts = weeklyShifts.filter(
                (s) => s.employee_id === staff.member_id
              );
              const rowPreviewShifts = (previewShifts || []).filter(
                (s) => s.employee_id === staff.member_id
              );

              return renderRow(
                staff.member_id,
                <div className="flex items-center gap-3">
                  <Avatar className="h-9 w-9 ring-2 ring-background border border-border shadow-sm">
                    <AvatarImage src={staff.avatar_url || ""} />
                    <AvatarFallback className="bg-gradient-to-br from-primary/10 to-primary/5 text-primary text-xs font-bold">
                      {staff.first_name[0]}
                      {staff.last_name[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div className="overflow-hidden">
                    <div className="text-sm font-semibold truncate text-foreground">
                      {staff.display_name}
                    </div>
                    <div className="text-xs text-muted-foreground truncate flex items-center gap-1">
                      {staff.primary_location_name || "Staff"}
                    </div>
                  </div>
                </div>,
                rowShifts,
                rowPreviewShifts
              );
            })}
          </div>
        </div>

        <DragOverlay>
          {activeDragShift ? (
            <div className="opacity-90 rotate-2 scale-105 cursor-grabbing shadow-xl">
              <ShiftCard shift={activeDragShift} />
            </div>
          ) : null}
        </DragOverlay>

        <ShiftModal
          open={isModalOpen}
          onOpenChange={setIsModalOpen}
          defaultDate={newShiftDefaults.date}
          defaultEmployeeId={newShiftDefaults.employeeId}
          editShift={selectedShift}
          scheduleId={scheduleId}
        />
      </div>
    </DndContext>
  );
}

// Sub-components
function DayCell({
  day,
  employeeId,
  children,
  onAdd,
  disabled,
}: {
  day: Date;
  employeeId: string;
  children: React.ReactNode;
  onAdd: () => void;
  disabled?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `cell::${employeeId}::${format(day, "yyyy-MM-dd")}`,
    disabled,
  });

  if (disabled) {
    return (
      <div className="flex-1 border-r border-border last:border-r-0 p-2 min-h-[100px] bg-muted/50 cursor-not-allowed relative">
        <div className="relative z-0 flex flex-col gap-2 min-h-full pb-6 opacity-40 pointer-events-none">
          {children}
        </div>
      </div>
    );
  }

  const hasShifts = React.Children.count(children) > 0;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex-1 border-r border-border last:border-r-0 p-2 relative group transition-colors min-h-[100px] flex flex-col gap-2",
        isOver
          ? "bg-primary/5 ring-inset ring-2 ring-primary/20"
          : "hover:bg-muted/10"
      )}
    >
      <div className="relative z-10 flex flex-col gap-2 min-h-full pointer-events-auto">
        {children}
      </div>

      {!hasShifts && (
        <button
          onClick={onAdd}
          className="absolute inset-0 flex items-center justify-center border border-dashed border-border/50 rounded-lg hover:border-primary/30 hover:bg-primary/5 transition-all opacity-0 group-hover:opacity-100 z-20 m-1"
        >
          <Plus className="h-4 w-4 text-muted-foreground/50 hover:text-primary" />
        </button>
      )}
    </div>
  );
}

function DraggableShiftCard({
  shift,
  onClick,
}: {
  shift: Shift;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: shift.id, data: { shift } });
  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;
  if (isDragging)
    return (
      <div ref={setNodeRef} className="opacity-30">
        <ShiftCard shift={shift} />
      </div>
    );
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="pointer-events-auto"
    >
      <ShiftCard shift={shift} onClick={onClick} />
    </div>
  );
}
