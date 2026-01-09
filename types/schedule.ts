export type Role = "server" | "cashier" | "kitchen" | "manager" | "driver";

export type ShiftStatus = "scheduled" | "open" | "filled" | "cancelled";

export interface Shift {
  id: string;
  employee_id: string | null; // null for open shifts
  employee_name: string;
  start_time: string; // ISO datetime
  end_time: string; // ISO datetime
  role: Role;
  location_id: string;
  notes?: string;
  is_template?: boolean;
  color?: string; // For UI customization
  status?: ShiftStatus;
  // New fields to match App
  break_minutes?: number;
  expected_pace?: "Moderate" | "Busy" | "Calm";
  staffing_level?: "May need help" | "Fully staffed";
  locked?: boolean;
  allow_open_claims?: boolean;
}

// Template-specific shift (uses relative DayOfWeek instead of absolute date)
export interface TemplateShift {
  tempId: string;
  employeeId: string;
  dayOfWeek: number; // 0-6 (Sun-Sat) or 1-7 depending on usage
  startTime: string; // ISO datetime string (date part ignored)
  endTime: string; // ISO datetime string
  role: Role;
  notes?: string;
  // New fields to match App
  breakMinutes?: number;
  expectedPace?: "Moderate" | "Busy" | "Calm";
  staffingLevel?: "May need help" | "Fully staffed";
}

export interface ScheduleTemplate {
  id: string;
  name: string;
  shifts: TemplateShift[];
  description?: string;
  tags?: string[];
  created_at: string;
  lastUsed?: Date;
}

export type ScheduleStatus = "draft" | "draft-edit" | "published" | "archived";

export interface WeeklySchedule {
  id: string;
  name: string;
  startDate: string; // ISO date (YYYY-MM-DD)
  endDate: string; // ISO date (YYYY-MM-DD)
  shifts: Shift[];
  status: ScheduleStatus;
  createdBy?: string;
  type: "weekly";
  originalScheduleId?: string; // For draft-edit workflow
}

export interface SchedulePeriod {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  shifts: Shift[];
  status: "draft" | "draft-edit" | "active" | "archived";
  type: "period";
  originalScheduleId?: string; // For draft-edit workflow
}

export type ApplyMode = "merge" | "replace-all" | "fill-gaps";

// --- Request Types ---

export type RequestStatus =
  | "pending"
  | "approved"
  | "denied"
  | "pending-manager"
  | "pending-peer";

export interface DropRequest {
  id: string;
  shiftId: string;
  shift: Shift; // Embedded for display
  employeeId: string;
  reason: string;
  submittedAt: string; // ISO datetime
  status: RequestStatus;
  approvedBy?: string;
  deniedBy?: string;
  denyReason?: string;
}

export interface SwapRequest {
  id: string;
  ownerId: string; // Employee initiating the swap
  peerId?: string; // Target employee
  myShiftId: string;
  peerShiftId?: string;
  status: RequestStatus;
  submittedAt: string;
  approvedBy?: string;
}

export interface PTORequest {
  id: string;
  employeeId: string;
  startDate: string; // ISO date
  endDate: string; // ISO date
  note?: string;
  status: RequestStatus;
  submittedAt: string;
  approvedBy?: string;
  deniedBy?: string;
  denyReason?: string;
}

// --- Change Summary for Publish ---

export interface ChangeSummary {
  added: number;
  updated: number;
  removed: number;
}

export interface ShiftConflict {
  employeeName: string;
  date: string;
  shiftId: string;
}
