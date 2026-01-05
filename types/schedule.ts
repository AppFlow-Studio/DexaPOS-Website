export type Role = "server" | "cashier" | "kitchen" | "manager" | "driver";

export interface Shift {
  id: string;
  employee_id: string;
  employee_name: string;
  start_time: string; // ISO datetime
  end_time: string; // ISO datetime
  role: Role;
  location_id: string;
  notes?: string;
  is_template?: boolean;
  color?: string; // For UI customization
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

export interface WeeklySchedule {
  id: string;
  name: string;
  startDate: string; // ISO date (YYYY-MM-DD)
  endDate: string; // ISO date (YYYY-MM-DD)
  shifts: Shift[];
  status: "draft" | "published" | "archived";
  createdBy?: string;
  type: "weekly";
}

export interface SchedulePeriod {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  shifts: Shift[];
  status: "draft" | "active" | "archived";
  type: "period";
}

export type ApplyMode = "merge" | "replace-all" | "fill-gaps";
