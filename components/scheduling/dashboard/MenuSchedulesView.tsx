"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty } from "@/components/ui/empty";
import {
  Calendar,
  Plus,
  Edit3,
  Trash2,
  Search,
  MoreVertical,
  MapPin,
  Globe,
  Power,
  PowerOff,
  Utensils,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScheduleFormSheet } from "@/components/dashboard/menu/ScheduleFormSheet";
import { useLocationScopedSchedulesWithTimeSlots } from "@/app/dashboard/hooks/useLocationScoped";
import {
  useDeleteScheduleMutation,
  useToggleScheduleActiveMutation,
} from "@/app/dashboard/hooks/useLocationScopedSchedules";
import { useIsSingleLocation } from "@/stores/location-store";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SchedulesModel, ScheduleTimeSlotsModel } from "@/types/db-modles";
import { DAYS_OF_WEEK } from "@/components/dashboard/menu/ScheduleCard";
import { AssignMenusSheet } from "./AssignMenusSheet";
import { DeleteScheduleDialog } from "./DeleteScheduleDialog";
import { Panel, StatRow, StatTile } from "@/components/dashboard/shell";

type ScheduleWithSlots = SchedulesModel & {
  schedule_time_slots?: ScheduleTimeSlotsModel[];
};

export function MenuSchedulesView() {
  const isSingleLocation = useIsSingleLocation();

  const { data: schedules, isLoading } =
    useLocationScopedSchedulesWithTimeSlots();
  const deleteScheduleMutation = useDeleteScheduleMutation();
  const toggleActiveMutation = useToggleScheduleActiveMutation();

  const [searchTerm, setSearchTerm] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] =
    useState<ScheduleWithSlots | null>(null);
  const [deletingSchedule, setDeletingSchedule] =
    useState<ScheduleWithSlots | null>(null);
  const [assigningSchedule, setAssigningSchedule] =
    useState<ScheduleWithSlots | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const schedulesList: ScheduleWithSlots[] = (schedules ||
    []) as ScheduleWithSlots[];

  // Filter schedules
  const filteredSchedules = schedulesList.filter(
    (schedule: ScheduleWithSlots) =>
      schedule.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      schedule.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Stats
  const stats = {
    total: schedulesList.length,
    active: schedulesList.filter((s: ScheduleWithSlots) => s.is_active).length,
    inactive: schedulesList.filter((s: ScheduleWithSlots) => !s.is_active)
      .length,
    global: schedulesList.filter((s: ScheduleWithSlots) => !s.location_id)
      .length,
  };

  const handleCreate = () => {
    setEditingSchedule(null);
    setIsFormOpen(true);
  };

  const handleEdit = (schedule: ScheduleWithSlots) => {
    setEditingSchedule(schedule);
    setIsFormOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingSchedule) return;

    setIsDeleting(true);
    const result = await deleteScheduleMutation.mutateAsync(
      deletingSchedule.id
    );

    if (result.error) {
      toast.error("Failed to delete schedule", {
        description: result.error,
      });
    } else {
      toast.success("Schedule deleted", {
        description: `"${deletingSchedule.name}" has been removed`,
      });
    }

    setIsDeleting(false);
    setDeletingSchedule(null);
  };

  const handleToggleActive = async (schedule: ScheduleWithSlots) => {
    const result = await toggleActiveMutation.mutateAsync(schedule.id);

    if (result.error) {
      toast.error("Failed to update schedule", {
        description: result.error,
      });
    } else {
      toast.success(
        schedule.is_active ? "Schedule deactivated" : "Schedule activated",
        {
          description: `"${schedule.name}" is now ${
            schedule.is_active ? "inactive" : "active"
          }`,
        }
      );
    }
  };

  return (
    <div className="animate-in fade-in duration-500">
      <Panel className="overflow-hidden">
        <section className="flex flex-col gap-4 px-4 py-5 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-primary">
              Menu availability
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Control when menus and categories are available.
            </p>
          </div>
          <Button className="w-full sm:w-auto" onClick={handleCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Create schedule
          </Button>
        </section>

        <section className="border-t border-border/60 px-4 py-6 sm:px-6">
          <StatRow columns={isSingleLocation ? 3 : 4}>
            <StatTile
              label="Total schedules"
              value={stats.total}
              icon={<Calendar />}
              meta={
                isSingleLocation
                  ? "Menu availability windows"
                  : `${stats.global} global, ${stats.total - stats.global} location-specific`
              }
            />
            <StatTile
              label="Active"
              value={stats.active}
              icon={<Power className="text-emerald-600" />}
              meta="Currently in use"
            />
            <StatTile
              label="Inactive"
              value={stats.inactive}
              icon={<PowerOff />}
              meta="Not currently active"
            />
            {!isSingleLocation && (
              <StatTile
                label="Global"
                value={stats.global}
                icon={<Globe className="text-primary" />}
                meta="Available everywhere"
              />
            )}
          </StatRow>
        </section>

        <section className="border-t border-border/60 px-4 py-6 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-semibold">All schedules</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {filteredSchedules.length} schedule
                {filteredSchedules.length !== 1 ? "s" : ""} found
              </p>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search schedules..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="h-10 rounded-full border-0 bg-muted/45 pl-10 shadow-none focus-visible:ring-1"
              />
            </div>
          </div>

          <div className="mt-5">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-28 w-full rounded-2xl" />
              ))}
            </div>
          ) : filteredSchedules.length === 0 ? (
            <Empty
              icon={Calendar}
              title={
                schedulesList.length === 0
                  ? "No schedules yet"
                  : "No schedules found"
              }
              description={
                schedulesList.length === 0
                  ? "Create your first schedule to control when menus are available"
                  : "Try adjusting your search terms"
              }
              action={
                schedulesList.length === 0 ? (
                  <Button onClick={handleCreate}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create schedule
                  </Button>
                ) : null
              }
            />
          ) : (
            <div className="space-y-3">
              {filteredSchedules.map((schedule, index) => {
                const timeSlots = schedule.schedule_time_slots || [];
                const days = [
                  ...new Set(timeSlots.map((s) => s.day_of_week)),
                ] as number[];
                days.sort((a, b) => a - b);

                return (
                  <div
                    key={schedule.id}
                    className={cn(
                      "group rounded-2xl bg-muted/30 px-4 py-4 transition-colors duration-200",
                      "hover:bg-muted/45",
                      "animate-in fade-in slide-in-from-bottom-2"
                    )}
                    style={{
                      animationDelay: `${Math.min(index * 30, 300)}ms`,
                    }}
                  >
                    <div className="flex items-start justify-between gap-3 sm:gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <Calendar
                            className={cn(
                              "h-4 w-4 shrink-0",
                              schedule.is_active
                                ? "text-primary"
                                : "text-muted-foreground"
                            )}
                          />
                          <h4 className="font-semibold truncate">
                            {schedule.name}
                          </h4>
                          {!isSingleLocation &&
                            (schedule.location_id ? (
                              <Badge variant="secondary" className="text-xs">
                                <MapPin className="mr-1 h-2.5 w-2.5" />
                                Location
                              </Badge>
                            ) : (
                              <Badge
                                variant="secondary"
                                className="bg-emerald-100 text-xs text-emerald-700"
                              >
                                <Globe className="mr-1 h-2.5 w-2.5" />
                                Global
                              </Badge>
                            ))}
                          <Badge
                            variant={
                              schedule.is_active ? "default" : "secondary"
                            }
                            className={cn(
                              "border-0 text-xs",
                              schedule.is_active &&
                                "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                            )}
                          >
                            {schedule.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                        {schedule.description && (
                          <p className="mb-3 text-sm text-muted-foreground">
                            {schedule.description}
                          </p>
                        )}

                        <div className="flex flex-wrap gap-2">
                          {days.length === 0 ? (
                            <Badge
                              variant="secondary"
                              className="bg-amber-100 text-xs text-amber-700"
                            >
                              No time slots
                            </Badge>
                          ) : (
                            days.map((day: number) => {
                              const daySlots = timeSlots.filter(
                                (s: ScheduleTimeSlotsModel) =>
                                  s.day_of_week === day
                              );
                              return (
                                <Badge
                                  key={day}
                                  variant="secondary"
                                  className="border-0 bg-background/80 text-xs font-normal"
                                >
                                  {DAYS_OF_WEEK[day]}: {daySlots.length} slot
                                  {daySlots.length !== 1 ? "s" : ""}
                                </Badge>
                              );
                            })
                          )}
                        </div>
                      </div>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 shrink-0 rounded-full"
                          >
                            <MoreVertical className="h-4 w-4" />
                            <span className="sr-only">Open schedule actions</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => handleEdit(schedule)}
                          >
                            <Edit3 className="h-4 w-4 mr-2" />
                            Edit Schedule
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleToggleActive(schedule)}
                          >
                            {schedule.is_active ? (
                              <>
                                <PowerOff className="h-4 w-4 mr-2" />
                                Deactivate
                              </>
                            ) : (
                              <>
                                <Power className="h-4 w-4 mr-2" />
                                Activate
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setAssigningSchedule(schedule)}
                          >
                            <Utensils className="h-4 w-4 mr-2" />
                            Assign to Menus
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setDeletingSchedule(schedule)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          </div>
        </section>
      </Panel>

      {/* Form Sheet */}
      <ScheduleFormSheet
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        editSchedule={editingSchedule}
        mode={editingSchedule ? "edit" : "create"}
      />

      {/* Assign Menus Sheet */}
      <AssignMenusSheet
        open={!!assigningSchedule}
        onOpenChange={(open) => !open && setAssigningSchedule(null)}
        schedule={assigningSchedule}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteScheduleDialog
        open={!!deletingSchedule}
        onOpenChange={(open) => !open && setDeletingSchedule(null)}
        schedule={deletingSchedule}
        onConfirm={handleDelete}
        isDeleting={isDeleting}
      />
    </div>
  );
}
