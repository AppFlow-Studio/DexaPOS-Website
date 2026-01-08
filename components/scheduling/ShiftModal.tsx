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
import { Switch } from "@/components/ui/switch";
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
import { Shift, Role, TemplateShift } from "@/types/schedule";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";

interface ShiftModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate?: Date;
  defaultEmployeeId?: string;
  defaultRole?: Role;
  editShift?: Shift | TemplateShift | null; // Support both types
  scheduleId?: string; // Optional now
  isTemplateMode?: boolean;
  dayOfWeek?: number; // For new template shifts
  onSave?: (shiftData: any) => void; // Generic handler for templates
  onDelete?: () => void; // External delete handler
}

const roles: Role[] = ["server", "cashier", "kitchen", "manager", "driver"];

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function ShiftModal({
  open,
  onOpenChange,
  defaultDate,
  defaultEmployeeId,
  defaultRole,
  editShift,
  scheduleId,
  isTemplateMode = false,
  dayOfWeek,
  onSave: onExternalSave,
  onDelete: onExternalDelete,
}: ShiftModalProps) {
  const { addShift, updateShift, deleteShift, checkConflicts } =
    useScheduleStore();
  const { data: staffMembers = [] } = useUnifiedStaff();

  const [employeeId, setEmployeeId] = useState("");
  const [role, setRole] = useState<Role>("server");
  const [date, setDate] = useState("");
  const [selectedDayOfWeek, setSelectedDayOfWeek] = useState<number>(1); // Default Monday
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [notes, setNotes] = useState("");
  const [breakMinutes, setBreakMinutes] = useState(30);
  const [expectedPace, setExpectedPace] = useState<
    "Moderate" | "Busy" | "Calm"
  >("Moderate");
  const [staffingLevel, setStaffingLevel] = useState<
    "May need help" | "Fully staffed"
  >("Fully staffed");
  const [locked, setLocked] = useState(false);
  const [allowOpenClaims, setAllowOpenClaims] = useState(true);

  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (open) {
      if (editShift) {
        // Safe cast check - explicit discrimination would be better but simple checks work
        const isTemplate = "tempId" in editShift;

        const eId = isTemplate
          ? (editShift as TemplateShift).employeeId
          : (editShift as Shift).employee_id;
        setEmployeeId(eId);
        const initialRole = editShift.role as Role;
        setRole(roles.includes(initialRole) ? initialRole : "server");

        if (isTemplateMode || isTemplate) {
          const tShift = editShift as TemplateShift;
          setSelectedDayOfWeek(tShift.dayOfWeek);
          setStartTime(format(parseISO(tShift.startTime), "HH:mm"));
          setEndTime(format(parseISO(tShift.endTime), "HH:mm"));
          setBreakMinutes(tShift.breakMinutes || 30);
          setExpectedPace(tShift.expectedPace || "Moderate");
          setStaffingLevel(tShift.staffingLevel || "Fully staffed");
        } else {
          const shift = editShift as Shift;
          setDate(format(new Date(shift.start_time), "yyyy-MM-dd"));
          setStartTime(format(new Date(shift.start_time), "HH:mm"));
          setEndTime(format(new Date(shift.end_time), "HH:mm"));
          setBreakMinutes(shift.break_minutes || 30);
          setExpectedPace(shift.expected_pace || "Moderate");
          setStaffingLevel(shift.staffing_level || "Fully staffed");
          setLocked(shift.locked || false);
          setAllowOpenClaims(shift.allow_open_claims ?? true);
        }
        setNotes(editShift.notes || "");
      } else {
        setEmployeeId(defaultEmployeeId || "");

        if (isTemplateMode) {
          setSelectedDayOfWeek(dayOfWeek ?? 1);
        } else {
          setDate(
            defaultDate
              ? format(defaultDate, "yyyy-MM-dd")
              : format(new Date(), "yyyy-MM-dd")
          );
        }

        setStartTime("09:00");
        setEndTime("17:00");
        const initialDefaultRole = defaultRole || "server";
        setRole(
          roles.includes(initialDefaultRole) ? initialDefaultRole : "server"
        );
        setNotes("");
        setBreakMinutes(30);
        setExpectedPace("Moderate");
        setStaffingLevel("Fully staffed");
        setLocked(false);
        setAllowOpenClaims(true);
      }
      setError(null);
      setShowDeleteConfirm(false);
    }
  }, [
    open,
    editShift,
    defaultDate,
    defaultEmployeeId,
    defaultRole,
    isTemplateMode,
    dayOfWeek,
  ]);

  const handleSave = (force = false) => {
    if (
      !employeeId ||
      (!isTemplateMode && !date) ||
      !startTime ||
      !endTime ||
      !role
    ) {
      setError("Please fill all required fields");
      return;
    }

    const staff = staffMembers.find((s) => s.member_id === employeeId);

    // TEMPLATE MODE HANDLER
    if (isTemplateMode) {
      // Create full ISO strings for time (using arbitrary date)
      const baseDate = "2024-01-01"; // Arbitrary
      const startDateTime = `${baseDate}T${startTime}:00`;
      const endDateTime = `${baseDate}T${endTime}:00`;

      const templateShiftData: Partial<TemplateShift> = {
        tempId: (editShift as TemplateShift)?.tempId || crypto.randomUUID(), // Preserve or generate
        employeeId,
        dayOfWeek: selectedDayOfWeek,
        role,
        startTime: new Date(startDateTime).toISOString(),
        endTime: new Date(endDateTime).toISOString(),
        notes,
        breakMinutes,
        expectedPace,
        staffingLevel,
      };

      if (onExternalSave) {
        onExternalSave(templateShiftData);
      }
      onOpenChange(false);
      return;
    }

    // REGULAR SCHEDULE MODE
    if (!scheduleId) {
      setError("Missing Schedule ID");
      return;
    }

    const startDateTime = `${date}T${startTime}:00`;
    const endDateTime = `${date}T${endTime}:00`;

    const shiftData = {
      employee_id: employeeId,
      employee_name: staff?.display_name || "Unknown",
      role,
      location_id: staff?.primary_location_id || "unknown",
      start_time: new Date(startDateTime).toISOString(),
      end_time: new Date(endDateTime).toISOString(),
      notes,
      break_minutes: breakMinutes,
      expected_pace: expectedPace,
      staffing_level: staffingLevel,
      locked,
      allow_open_claims: allowOpenClaims,
    };

    if (
      !force &&
      checkConflicts(scheduleId, shiftData, (editShift as Shift)?.id)
    ) {
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
      updateShift(scheduleId, (editShift as Shift).id, shiftData);
    } else {
      addShift(scheduleId, shiftData);
    }

    onOpenChange(false);
  };

  const handleDelete = () => {
    if (!editShift) return;

    if (!showDeleteConfirm) {
      setShowDeleteConfirm(true);
      return;
    }

    // External delete handler (for templates)
    if (onExternalDelete) {
      onExternalDelete();
      onOpenChange(false);
      return;
    }

    if (!scheduleId) return;

    deleteShift(scheduleId, (editShift as Shift).id);
    onOpenChange(false);
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

          {/* Date is hidden/implied as per user request */}
          {isTemplateMode && (
            <div className="grid gap-2">
              <Label>Day of Week</Label>
              <Select
                value={String(selectedDayOfWeek)}
                onValueChange={(v) => setSelectedDayOfWeek(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAYS.map((dayName, index) => (
                    <SelectItem key={index} value={String(index)}>
                      {dayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

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

          {/* New Fields: Break, Pace, Staffing */}
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Break (Minutes)</Label>
              <Input
                type="number"
                value={breakMinutes}
                onChange={(e) => setBreakMinutes(Number(e.target.value))}
              />
            </div>
            <div className="grid gap-2">
              <Label>Expected Pace</Label>
              <Select
                value={expectedPace}
                onValueChange={(v: any) => setExpectedPace(v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["Moderate", "Busy", "Calm"].map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Staffing Level</Label>
            <Select
              value={staffingLevel}
              onValueChange={(v: any) => setStaffingLevel(v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["May need help", "Fully staffed"].map((l) => (
                  <SelectItem key={l} value={l}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Security Switches (Only for regular shifts) */}
          {!isTemplateMode && (
            <div className="grid gap-4 pt-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="locked">Lock assignment</Label>
                <Switch
                  id="locked"
                  checked={locked}
                  onCheckedChange={setLocked}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="open-claims">Allow open claims</Label>
                <Switch
                  id="open-claims"
                  checked={allowOpenClaims}
                  onCheckedChange={setAllowOpenClaims}
                />
              </div>
            </div>
          )}

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

        <DialogFooter className="gap-2">
          {editShift && (
            <Button
              variant="destructive"
              onClick={handleDelete}
              className="mr-auto"
            >
              {showDeleteConfirm ? "Confirm Delete?" : "Delete"}
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
