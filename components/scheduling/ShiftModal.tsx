"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useUnifiedStaff } from "@/app/dashboard/hooks/useStaff";
import { useScheduleStore } from "@/stores/useScheduleStore";
import { Shift, Role } from "@/types/schedule";
import { format } from "date-fns";
import { toast } from "sonner";

interface ShiftModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate?: Date;
  defaultEmployeeId?: string;
  editShift?: Shift | null;
  scheduleId: string;
}

const roles: Role[] = ["server", "cashier", "kitchen", "manager", "driver"];

export function ShiftModal({
  open,
  onOpenChange,
  defaultDate,
  defaultEmployeeId,
  editShift,
  scheduleId,
}: ShiftModalProps) {
  const { addShift, updateShift, deleteShift, checkConflicts } =
    useScheduleStore();
  const { data: staffMembers = [] } = useUnifiedStaff();

  const [employeeId, setEmployeeId] = useState("");
  const [role, setRole] = useState<Role>("server");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      if (editShift) {
        setEmployeeId(editShift.employee_id);
        setRole(editShift.role);
        setDate(format(new Date(editShift.start_time), "yyyy-MM-dd"));
        setStartTime(format(new Date(editShift.start_time), "HH:mm"));
        setEndTime(format(new Date(editShift.end_time), "HH:mm"));
        setNotes(editShift.notes || "");
      } else {
        setEmployeeId(defaultEmployeeId || "");
        setDate(
          defaultDate
            ? format(defaultDate, "yyyy-MM-dd")
            : format(new Date(), "yyyy-MM-dd")
        );
        setStartTime("09:00");
        setEndTime("17:00");
        setRole("server");
        setNotes("");
      }
      setError(null);
    }
  }, [open, editShift, defaultDate, defaultEmployeeId]);

  const handleSave = (force = false) => {
    if (!employeeId || !date || !startTime || !endTime) {
      setError("Please fill all required fields");
      return;
    }

    const startDateTime = `${date}T${startTime}:00`;
    const endDateTime = `${date}T${endTime}:00`; // Simplified: assume same day for now

    const staff = staffMembers.find((s) => s.member_id === employeeId);

    const shiftData = {
      employee_id: employeeId,
      employee_name: staff?.display_name || "Unknown",
      role,
      location_id: staff?.primary_location_id || "unknown",
      start_time: new Date(startDateTime).toISOString(),
      end_time: new Date(endDateTime).toISOString(),
      notes,
    };

    if (!force && checkConflicts(scheduleId, shiftData, editShift?.id)) {
      toast("Conflict detected", {
        description:
          "This shift conflicts with another shift for this employee.",
        action: {
          label: "Save Anyway",
          onClick: () => handleSave(true),
        },
      });
      return;
    }

    if (editShift) {
      updateShift(scheduleId, editShift.id, shiftData);
    } else {
      addShift(scheduleId, shiftData);
    }

    onOpenChange(false);
  };

  const handleDelete = () => {
    if (!editShift) return;

    // For delete, we can just use a simple toast with undo?
    // Or a persistent toast asking to confirm?
    // User asked "not the dcoument warning".
    // I'll use a toast with "Confirm" button to be safe.

    toast("Delete this shift?", {
      action: {
        label: "Confirm",
        onClick: () => {
          deleteShift(scheduleId, editShift.id);
          onOpenChange(false);
        },
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{editShift ? "Edit Shift" : "New Shift"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Employee Select */}
          <div className="grid gap-2">
            <Label>Employee</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger>
                <SelectValue placeholder="Select employee" />
              </SelectTrigger>
              <SelectContent>
                {staffMembers.map((staff) => (
                  <SelectItem key={staff.member_id} value={staff.member_id}>
                    {staff.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Role Select */}
          <div className="grid gap-2">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v: any) => setRole(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r} value={r} className="capitalize">
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date */}
          <div className="grid gap-2">
            <Label>Date</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          {/* Time Range */}
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Start Time</Label>
              <Input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>End Time</Label>
              <Input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>

          {/* Notes */}
          <div className="grid gap-2">
            <Label>Notes (Optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {editShift && (
            <Button
              variant="destructive"
              onClick={handleDelete}
              className="mr-auto"
            >
              Delete
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => handleSave(false)}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
