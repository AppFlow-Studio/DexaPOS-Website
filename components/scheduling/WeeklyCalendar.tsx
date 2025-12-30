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
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useUnifiedStaff } from "@/app/dashboard/hooks/useStaff";
import { useScheduleStore } from "@/stores/useScheduleStore";
import { ShiftModal } from "./ShiftModal";
import { Shift } from "@/types/schedule";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { ShiftCard } from "./ShiftCard";

interface WeeklyCalendarProps {
  currentDate: Date;
  minDate?: Date;
  maxDate?: Date;
}

export function WeeklyCalendar({
  currentDate,
  scheduleId,
  minDate,
  maxDate,
}: WeeklyCalendarProps & { scheduleId: string }) {
  const schedule = useScheduleStore(
    (state) =>
      state.weeklySchedules.find((s) => s.id === scheduleId) ||
      state.schedulePeriods.find((s) => s.id === scheduleId)
  );
  const shifts = schedule?.shifts || [];
  const { data: staffMembers = [] } = useUnifiedStaff();

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  const weeklyShifts = useMemo(() => {
    const start = startOfWeek(currentDate, { weekStartsOn: 1 });
    const end = endOfWeek(currentDate, { weekStartsOn: 1 });
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

    // Parse drop target ID: "cell-employeeId-dateISO"
    const [_, employeeId, dateStr] = (over.id as string).split("::");

    if (employeeId && dateStr) {
      // Calculate new start/end times keeping duration
      const oldStart = parseISO(shift.start_time);
      const oldEnd = parseISO(shift.end_time);
      const duration = oldEnd.getTime() - oldStart.getTime();

      const newDate = parseISO(dateStr);
      // Keep original time of day, just change date
      const newStart = new Date(newDate);
      newStart.setHours(oldStart.getHours(), oldStart.getMinutes());

      const newEnd = new Date(newStart.getTime() + duration);

      moveShift(
        scheduleId,
        shiftId,
        newStart.toISOString(),
        newEnd.toISOString(),
        employeeId
      );
    }
  };

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex flex-col h-full">
        {/* Header Row */}
        <div className="flex border-b h-14 bg-muted/30">
          <div className="w-[200px] flex-shrink-0 border-r p-4 font-medium text-sm flex items-center">
            Employee
          </div>
          {days.map((day) => (
            <div
              key={day.toISOString()}
              className="flex-1 border-r last:border-r-0 p-2 text-center"
            >
              <div className="text-xs text-muted-foreground uppercase">
                {format(day, "EEE")}
              </div>
              <div
                className={cn(
                  "text-sm font-semibold h-7 w-7 rounded-full flex items-center justify-center mx-auto mt-1",
                  isSameDay(day, new Date())
                    ? "bg-primary text-primary-foreground"
                    : ""
                )}
              >
                {format(day, "d")}
              </div>
            </div>
          ))}
        </div>

        {/* Scrollable Grid */}
        <div className="flex-1 overflow-auto">
          <div className="flex flex-col">
            {staffMembers.map((staff) => {
              // Calculate hours locally from weeklyShifts
              const hours = weeklyShifts
                .filter((s) => s.employee_id === staff.member_id)
                .reduce((acc, shift) => {
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
                  key={staff.member_id}
                  className="flex border-b min-h-[100px]"
                >
                  {/* Employee Cell */}
                  <div className="w-[200px] flex-shrink-0 border-r p-4 flex flex-col gap-2 bg-card/50">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={staff.avatar_url || ""} />
                        <AvatarFallback>
                          {staff.first_name[0]}
                          {staff.last_name[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div className="overflow-hidden">
                        <div className="text-sm font-medium truncate">
                          {staff.display_name}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {staff.primary_location_name || "Unassigned"}
                        </div>
                      </div>
                    </div>
                    <div className="mt-auto pt-2 text-xs text-muted-foreground border-t">
                      Total:{" "}
                      <span className="font-medium text-foreground">
                        {hours.toFixed(1)}h
                      </span>
                    </div>
                  </div>

                  {/* Day Cells */}
                  {days.map((day) => {
                    const dayShifts = weeklyShifts.filter(
                      (s) =>
                        s.employee_id === staff.member_id &&
                        isSameDay(parseISO(s.start_time), day)
                    );

                    const isDisabled =
                      (minDate && isBefore(day, startOfDay(minDate))) ||
                      (maxDate && isAfter(day, endOfDay(maxDate)));

                    return (
                      <DayCell
                        key={day.toISOString()}
                        day={day}
                        employeeId={staff.member_id}
                        onAdd={() => handleAddShift(day, staff.member_id)}
                        disabled={isDisabled}
                      >
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
            })}
          </div>
        </div>

        <DragOverlay>
          {activeDragShift ? (
            <div className="opacity-80 rotate-2 scale-105 cursor-grabbing">
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

// Sub-components for DnD
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
      <div className="flex-1 border-r last:border-r-0 p-2 min-h-[60px] bg-secondary/80 cursor-not-allowed relative">
        <div className="absolute inset-0 z-0 bg-background/20" />
        {/* Still show shifts if they happen to exist (e.g. legacy), but grayed out */}
        <div className="relative z-10 flex flex-col gap-2 min-h-full pb-6 opacity-40 pointer-events-none">
          {children}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex-1 border-r last:border-r-0 p-2 relative group transition-colors min-h-[60px]",
        isOver ? "bg-muted/50" : "hover:bg-muted/20"
      )}
    >
      <button
        onClick={onAdd}
        className="absolute inset-0 w-full h-full opacity-0 group-hover:opacity-100 flex items-center justify-center z-0 cursor-pointer"
      >
        <Plus className="h-6 w-6 text-muted-foreground/30" />
      </button>
      <div className="relative z-10 flex flex-col gap-2 min-h-full pb-6 pointer-events-none">
        {children}
      </div>
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
    useDraggable({
      id: shift.id,
      data: { shift },
    });

  const style = transform
    ? {
        transform: CSS.Translate.toString(transform),
      }
    : undefined;

  if (isDragging) {
    return (
      <div ref={setNodeRef} className="opacity-30">
        <ShiftCard shift={shift} />
      </div>
    );
  }

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
