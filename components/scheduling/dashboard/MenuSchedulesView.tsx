"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { useLocationStore, useIsSingleLocation } from "@/stores/location-store";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SchedulesModel, ScheduleTimeSlotsModel } from "@/types/db-modles";
import { DAYS_OF_WEEK } from "@/components/dashboard/menu/ScheduleCard";
import { AssignMenusSheet } from "./AssignMenusSheet";
import { DeleteScheduleDialog } from "./DeleteScheduleDialog";

type ScheduleWithSlots = SchedulesModel & {
  schedule_time_slots?: ScheduleTimeSlotsModel[];
};

export function MenuSchedulesView() {
  const { selectedLocationId } = useLocationStore();
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
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Menu Availability
          </h2>
          <p className="text-muted-foreground">
            Control when menus and categories are available
          </p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Create Schedule
        </Button>
      </div>

      {/* Stats */}
      <div className={cn("grid gap-4", isSingleLocation ? "md:grid-cols-3" : "md:grid-cols-4")}>
        <Card className="transition-all hover:shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Schedules
            </CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">
              {isSingleLocation
                ? "Menu availability windows"
                : `${stats.global} global, ${stats.total - stats.global} location-specific`}
            </p>
          </CardContent>
        </Card>
        <Card className="transition-all hover:shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
            <Power className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {stats.active}
            </div>
            <p className="text-xs text-muted-foreground">Currently in use</p>
          </CardContent>
        </Card>
        <Card className="transition-all hover:shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Inactive</CardTitle>
            <PowerOff className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-muted-foreground">
              {stats.inactive}
            </div>
            <p className="text-xs text-muted-foreground">
              Not currently active
            </p>
          </CardContent>
        </Card>
        {!isSingleLocation && (
          <Card className="transition-all hover:shadow-md">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Global</CardTitle>
              <Globe className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">
                {stats.global}
              </div>
              <p className="text-xs text-muted-foreground">
                Available everywhere
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Schedules List */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle>All Schedules</CardTitle>
              <CardDescription>
                {filteredSchedules.length} schedule
                {filteredSchedules.length !== 1 ? "s" : ""} found
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search schedules..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-32 w-full" />
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
                    <Plus className="h-4 w-4 mr-2" />
                    Create Schedule
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
                      "group p-4 rounded-xl border bg-card transition-all duration-200",
                      "hover:shadow-md hover:border-primary/30",
                      "animate-in fade-in slide-in-from-bottom-2"
                    )}
                    style={{
                      animationDelay: `${Math.min(index * 30, 300)}ms`,
                    }}
                  >
                    <div className="flex items-start justify-between gap-4">
                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
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
                          {!isSingleLocation && (schedule.location_id ? (
                            <Badge
                              variant="outline"
                              className="text-xs bg-purple-50 text-purple-600 border-purple-200"
                            >
                              <MapPin className="h-2.5 w-2.5 mr-1" />
                              Location
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-xs bg-emerald-50 text-emerald-600 border-emerald-200"
                            >
                              <Globe className="h-2.5 w-2.5 mr-1" />
                              Global
                            </Badge>
                          ))}
                          <Badge
                            variant={
                              schedule.is_active ? "default" : "secondary"
                            }
                          >
                            {schedule.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                        {schedule.description && (
                          <p className="text-sm text-muted-foreground mb-3">
                            {schedule.description}
                          </p>
                        )}

                        {/* Time slots */}
                        <div className="flex flex-wrap gap-2">
                          {days.length === 0 ? (
                            <Badge
                              variant="outline"
                              className="text-xs text-amber-600 bg-amber-50 border-amber-200"
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
                                  variant="outline"
                                  className="text-xs"
                                >
                                  {DAYS_OF_WEEK[day]}: {daySlots.length} slot
                                  {daySlots.length !== 1 ? "s" : ""}
                                </Badge>
                              );
                            })
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0"
                          >
                            <MoreVertical className="h-4 w-4" />
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
        </CardContent>
      </Card>

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
