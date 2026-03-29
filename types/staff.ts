import { z } from "zod";

// ============================================================================
// Base Types
// ============================================================================

export interface LocationAssignment {
  location_id: string;
  location_name: string;
  role_code: string;
  role_name: string;
  is_primary: boolean;
  is_active: boolean;
  has_pin: boolean;
  hourly_rate: number | null;
  employment_type: "full-time" | "part-time" | "contractor" | null;
  assigned_at: string;
}

export interface UnifiedStaffMember {
  // Member fields
  member_id: string;
  user_id: string | null; // null for POS-only users
  clerk_user_id: string | null;
  staff_profile_id?: string | null; // Added for log filtering
  email: string | null;
  first_name: string;
  last_name: string;
  display_name: string;
  avatar_url: string | null;
  phone: string | null;
  is_clerk_user: boolean;

  // Location assignments (aggregated)
  location_assignments: LocationAssignment[];
  total_locations: number;
  primary_location_id: string | null;
  primary_location_name: string | null;

  // Status
  overall_is_active: boolean;

  // Timestamps
  member_created_at: string;
  last_updated_at: string;
}

// ============================================================================
// Form Types
// ============================================================================

export type StaffType = "clerk" | "pos";
export type EmploymentType = "full-time" | "part-time" | "contractor";

export interface InviteStaffFormData {
  // Step 1: Type & Details
  staff_type: StaffType;
  first_name: string;
  last_name: string;
  email: string | null; // Required for Clerk, optional for POS
  phone: string | null; // Optional for both

  // Step 2: Role Selection
  role_code: string;

  // Step 3: Location Assignments
  location_ids: string[];
  primary_location_id: string | null;

  // Step 4: POS Configuration (only for POS staff)
  auto_generate_pin: boolean;
  pin_code: string | null; // If not auto-generated
  hourly_rate: number | null;
  employment_type: EmploymentType | null;
}

// ============================================================================
// Zod Validation Schemas
// ============================================================================

export const inviteStaffSchema = z
  .object({
    staff_type: z.enum(["clerk", "pos"]),
    first_name: z.string().min(2, "First name must be at least 2 characters"),
    last_name: z.string().min(2, "Last name must be at least 2 characters"),
    email: z.string().email("Invalid email").nullable(),
    phone: z
      .string()
      .regex(/^\+?1?\d{10,14}$/, "Invalid phone number")
      .nullable(),
    role_code: z.string().min(1, "Role is required"),
    location_ids: z
      .array(z.string().uuid())
      .min(1, "At least one location required"),
    primary_location_id: z.string().uuid().nullable(),
    auto_generate_pin: z.boolean(),
    pin_code: z
      .string()
      .regex(/^\d{4,6}$/, "PIN must be 4-6 digits")
      .nullable(),
    hourly_rate: z.number().positive().nullable(),
    employment_type: z
      .enum(["full-time", "part-time", "contractor"])
      .nullable(),
  })
  .refine((data) => (data.staff_type === "clerk" ? !!data.email : true), {
    message: "Email is required for Clerk users",
    path: ["email"],
  })
  .refine(
    (data) => {
      // If POS staff and not auto-generating PIN, must provide PIN
      if (data.staff_type === "pos" && !data.auto_generate_pin) {
        return !!data.pin_code;
      }
      return true;
    },
    {
      message: "PIN code is required when not auto-generating",
      path: ["pin_code"],
    }
  );

// ============================================================================
// Update Staff Assignment Types
// ============================================================================

export interface UpdateStaffAssignmentData {
  role_code?: string;
  is_active?: boolean;
  hourly_rate?: number | null;
  employment_type?: EmploymentType | null;
}

// ============================================================================
// Table Column Definitions (for TanStack Table)
// ============================================================================

export interface StaffTableRow extends UnifiedStaffMember {
  // Additional computed fields for table display
  full_name: string;
  primary_role: string;
  location_badges: string[];
}

// ============================================================================
// Server Action Response Types
// ============================================================================

export interface StaffActionSuccess<T = unknown> {
  data: T;
  error?: never;
}

export interface StaffActionError {
  error: string;
  data?: never;
}

export type StaffActionResponse<T = unknown> =
  | StaffActionSuccess<T>
  | StaffActionError;

// ============================================================================
// PIN Management Types
// ============================================================================

export interface GeneratedPIN {
  pin: string;
  hashed_pin: string;
}

export interface ResetPINResult {
  pin: string; // The unhashed PIN to display to user
}

// ============================================================================
// Upgrade Types
// ============================================================================

export interface UpgradePOSToClerkResult {
  user_id: string;
  temp_password: string;
  email: string;
}

// ============================================================================
// Timesheet / Shift Types
// ============================================================================

export type ShiftStatus =
  | "active"
  | "completed"
  | "edited"
  | "approved"
  | "rejected";

export interface ShiftBreakLog {
  id: string;
  start_at: string;
  end_at?: string;
  duration_minutes: number;
  type: "paid" | "unpaid";
}

export interface StaffShift {
  id: string;
  merchant_id: string;
  location_id: string;
  staff_profile_id: string;
  status: ShiftStatus | string;
  clock_in_time: string;
  clock_out_time: string | null;
  break_logs: ShiftBreakLog[] | null;
  hourly_rate_snapshot: number | null;
  device_id?: string | null;
  notes?: string | null;
  is_verified?: boolean;
  created_at: string;
  updated_at: string;

  // Joined fields
  staff_profile?: {
    first_name: string;
    last_name: string;
    avatar_url: string | null;
  };
  location?: {
    name: string;
  };
}

// ============================================================================
// Admin Staff Management Types
// ============================================================================

/**
 * Admin view of staff member - extends UnifiedStaffMember with additional context
 */
export interface AdminStaffMember extends UnifiedStaffMember {
  // Account type explicit for admin display
  account_type: "clerk" | "pos_only";
}

/**
 * Result from bulk PIN reset operation
 */
export interface BulkPinResetResult {
  staff_profile_id: string;
  staff_name: string;
  new_pin: string;
}

/**
 * Data for creating staff via admin interface
 */
export interface AdminCreateStaffData {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  locationId: string;
  roleCode: string;
  hourlyRate?: number;
  employmentType: EmploymentType;
  autoGeneratePin?: boolean;
  pin?: string;
}

/**
 * Admin PIN reset result
 */
export interface AdminPinResetResult {
  success: boolean;
  pin?: string;
  error?: string;
}

/**
 * Admin staff status toggle result
 */
export interface AdminToggleStatusResult {
  success: boolean;
  error?: string;
}

/**
 * Admin create staff result
 */
export interface AdminCreateStaffResult {
  success: boolean;
  staffProfileId?: string;
  pin?: string;
  error?: string;
}

/**
 * Data for creating a Clerk dashboard user via admin interface
 */
export interface AdminCreateClerkStaffData {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  locationId: string;
  roleCode: string;
  hourlyRate?: number;
  employmentType: EmploymentType;
  autoGeneratePin?: boolean;
  pin?: string;
}

/**
 * Admin create Clerk staff result
 */
export interface AdminCreateClerkStaffResult {
  success: boolean;
  staffProfileId?: string;
  tempPassword?: string;
  generatedPin?: string;
  error?: string;
}
