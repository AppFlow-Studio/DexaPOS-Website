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
}

export interface ScheduleTemplate {
  id: string;
  name: string;
  shifts: Omit<Shift, "id" | "employee_name">[];
  description?: string;
  created_at: string;
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
