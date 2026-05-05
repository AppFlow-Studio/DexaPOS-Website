// ============================================================================
// DEXA POS - Locations Types & Zod Schemas
// ============================================================================

import { z } from 'zod';

// ============================================================================
// SECTION 1: Base Database Types
// ============================================================================

// ----------------------------------------------------------------------------
// Locations
// ----------------------------------------------------------------------------

export interface Location {
  id: string;
  merchant_id: string;
  name: string;
  code: string | null;
  description: string | null;
  phone: string | null;
  email: string | null;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  timezone: string;
  pricing_strategy: 'manual' | 'dual';
  dual_pricing_percentage: number;
  use_merchant_pricing_defaults: boolean;
  is_active: boolean;
  is_accepting_orders: boolean;
  business_hours: BusinessHours;
  uses_global_menu: boolean;
  ein: string | null;
  ein_last_four: string | null;
  tax_id: string | null;
  sales_tax_rate: number | null;
  tax_registration_status: 'pending' | 'verified' | 'expired' | null;
  onboarding_step: number;
  onboarding_completed: boolean;
  public_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface BusinessHours {
  monday?: DayHours;
  tuesday?: DayHours;
  wednesday?: DayHours;
  thursday?: DayHours;
  friday?: DayHours;
  saturday?: DayHours;
  sunday?: DayHours;
}

export interface DayHours {
  open: string;         // "09:00" format
  close: string;        // "22:00" format, or "02:00" when is_overnight is true
  is_closed: boolean;
  is_overnight?: boolean; // true = close time is on the next calendar day
}

// ----------------------------------------------------------------------------
// Location Members
// ----------------------------------------------------------------------------

export type EmploymentType = 'full_time' | 'part_time' | 'contractor' | 'seasonal';

export interface LocationMember {
  id: string;
  location_id: string;
  user_id: string;
  role_code: string;
  is_primary_location: boolean;
  is_active: boolean;
  employment_type: EmploymentType | null;
  hourly_rate: number | null;
  pin_code: string | null;
  assigned_at: string;
  updated_at: string;
}

// Extended type with joined data
export interface LocationMemberWithDetails extends LocationMember {
  user: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    avatar_url: string | null;
  };
  role: {
    code: string;
    name: string;
    level: number;
    level_type: string;
  };
}

// ----------------------------------------------------------------------------
// Location Invites
// ----------------------------------------------------------------------------

export type InviteStatus = 'pending' | 'accepted' | 'expired' | 'cancelled';

export interface LocationInvite {
  id: string;
  location_id: string;
  invited_by_user_id: string;
  email: string;
  role_code: string;
  clerk_invite_id: string | null;
  status: InviteStatus;
  accepted_by_user_id: string | null;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
}

// Extended type with joined data
export interface LocationInviteWithDetails extends LocationInvite {
  invited_by: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
  };
  role: {
    code: string;
    name: string;
    level: number;
  };
}

// ----------------------------------------------------------------------------
// Location Menu Customization
// ----------------------------------------------------------------------------

export interface LocationMenu {
  id: string;
  location_id: string;
  menu_id: string;
  is_active: boolean;
  display_order: number | null;
  created_at: string;
  updated_at: string;
}

export type StockTrackingMode = 'in_stock' | 'out_of_stock' | 'quantity' | 'use_default';

export interface LocationMenuItemOverride {
  id: string;
  location_id: string;
  menu_item_id: string;
  custom_price: number | null;
  custom_cash_price: number | null;
  is_available: boolean;
  stock_tracking_mode: StockTrackingMode | null;
  created_at: string;
  updated_at: string;
}

export interface LocationCategoryOverride {
  id: string;
  location_id: string;
  category_id: string;
  is_active: boolean;
  display_order: number | null;
  created_at: string;
  updated_at: string;
}

export interface LocationExclusiveItem {
  id: string;
  location_id: string;
  name: string;
  description: string | null;
  price: number;
  cash_price: number | null;
  image: string | null;
  category_id: string | null;
  meal_types: string[];
  allergens: string[];
  card_bg_color: string | null;
  availability: boolean;
  stock_tracking_mode: StockTrackingMode | null;
  display_order: number | null;
  created_at: string;
  updated_at: string;
}

// ----------------------------------------------------------------------------
// View Types (from SQL views)
// ----------------------------------------------------------------------------

export interface LocationSummary {
  id: string;
  merchant_id: string;
  name: string;
  code: string | null;
  city: string;
  state: string;
  is_active: boolean;
  is_accepting_orders: boolean;
  timezone: string;
  created_at: string;
  active_staff_count: number;
  manager_count: number;
}

export interface UserLocationAssignment {
  user_id: string;
  location_id: string;
  location_name: string;
  city: string;
  state: string;
  merchant_id: string;
  role_code: string;
  role_name: string;
  role_level: number;
  level_type: string;
  is_primary_location: boolean;
  is_active: boolean;
  assigned_at: string;
}


// ============================================================================
// SECTION 2: Zod Schemas for Validation
// ============================================================================

// ----------------------------------------------------------------------------
// Common Schemas
// ----------------------------------------------------------------------------

// US Phone number - flexible format
const phoneSchema = z
  .string()
  .regex(/^[\d\s\-\(\)\+\.]+$/, 'Invalid phone number format')
  .min(10, 'Phone number too short')
  .max(20, 'Phone number too long')
  .nullable()
  .optional();

// US Postal code
const postalCodeSchema = z
  .string()
  .regex(/^\d{5}(-\d{4})?$/, 'Invalid ZIP code format');

// Time in HH:MM format
const timeSchema = z
  .string()
  .regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (use HH:MM)');

// Location code - alphanumeric with dashes
const locationCodeSchema = z
  .string()
  .regex(/^[A-Z0-9\-]+$/, 'Code must be uppercase alphanumeric with dashes')
  .min(2)
  .max(20)
  .nullable()
  .optional();

// PIN code - 4-6 digits
const pinCodeSchema = z
  .string()
  .regex(/^\d{4,6}$/, 'PIN must be 4-6 digits')
  .nullable()
  .optional();

// Price - positive number with 2 decimal places max
const priceSchema = z
  .number()
  .positive('Price must be positive')
  .multipleOf(0.01, 'Price can have at most 2 decimal places');

// ----------------------------------------------------------------------------
// Business Hours Schema
// ----------------------------------------------------------------------------

export const dayHoursSchema = z.object({
  open: timeSchema,
  close: timeSchema,
  is_closed: z.boolean(),
  is_overnight: z.boolean().optional().default(false),
}).refine(
  (data) => data.is_closed || data.is_overnight || data.open < data.close,
  { message: 'Close time must be after open time (or enable overnight for next-day close)' }
);

export const businessHoursSchema = z.object({
  monday: dayHoursSchema.optional(),
  tuesday: dayHoursSchema.optional(),
  wednesday: dayHoursSchema.optional(),
  thursday: dayHoursSchema.optional(),
  friday: dayHoursSchema.optional(),
  saturday: dayHoursSchema.optional(),
  sunday: dayHoursSchema.optional(),
});

// ----------------------------------------------------------------------------
// Location Schemas
// ----------------------------------------------------------------------------

// Schema for creating a new location
export const createLocationSchema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be less than 100 characters'),
  code: locationCodeSchema,
  description: z.string().max(500).nullable().optional(),
  phone: phoneSchema,
  email: z.string().email('Invalid email').nullable().optional(),
  address_line1: z
    .string()
    .min(5, 'Address is too short')
    .max(200, 'Address is too long'),
  address_line2: z.string().max(200).nullable().optional(),
  city: z
    .string()
    .min(2, 'City name is too short')
    .max(100, 'City name is too long'),
  state: z
    .string()
    .length(2, 'Use 2-letter state code'),
  postal_code: postalCodeSchema,
  country: z.string().default('US'),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  timezone: z.string().default('America/New_York'),
  pricing_strategy: z.enum(['manual', 'dual']).default('manual'),
  dual_pricing_percentage: z.number().min(0).max(100).default(4.0),
  use_merchant_pricing_defaults: z.boolean().default(true),
  is_active: z.boolean().default(true),
  is_accepting_orders: z.boolean().default(true),
  business_hours: businessHoursSchema.default({}),
  business_day_end_hour: z.number().int().min(0).max(23).default(0),
  ein: z
    .string()
    .regex(/^\d{2}-?\d{7}$/, 'EIN must be 9 digits (with optional dash)')
    .nullable()
    .optional(),
  tax_id: z.string().max(100).nullable().optional(),
  sales_tax_rate: z.number().min(0).max(1).nullable().optional(),
  tax_registration_status: z.enum(['pending', 'verified', 'expired']).default('pending'),
  onboarding_step: z.number().int().min(0).max(7).default(0),
  onboarding_completed: z.boolean().default(false),
  uses_global_menu: z.boolean().default(true),
  public_metadata: z.record(z.unknown()).default({}),
  luqra_mid: z
    .string()
    .regex(/^[0-9]{8,20}$/, 'MID must be 8-20 digits')
    .nullable()
    .optional(),
  luqra_mid_descriptor: z.string().max(100).nullable().optional(),
  luqra_mid_status: z
    .enum(['pending', 'review', 'live', 'offline'])
    .default('pending'),
});

export type CreateLocationInput = z.infer<typeof createLocationSchema>;

// Schema for updating a location
export const updateLocationSchema = createLocationSchema.partial();

export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;

// ----------------------------------------------------------------------------
// Location Member Schemas
// ----------------------------------------------------------------------------

export const employmentTypeSchema = z.enum([
  'full_time',
  'part_time',
  'contractor',
  'seasonal',
]);

// Schema for adding a member to a location
export const addLocationMemberSchema = z.object({
  user_id: z.string().min(1, 'User ID is required'),
  role_code: z.string().min(1, 'Role is required'),
  is_primary_location: z.boolean().default(false),
  employment_type: employmentTypeSchema.nullable().optional(),
  hourly_rate: priceSchema.nullable().optional(),
  pin_code: pinCodeSchema,
});

export type AddLocationMemberInput = z.infer<typeof addLocationMemberSchema>;

// Schema for updating a location member
export const updateLocationMemberSchema = z.object({
  role_code: z.string().min(1).optional(),
  is_primary_location: z.boolean().optional(),
  is_active: z.boolean().optional(),
  employment_type: employmentTypeSchema.nullable().optional(),
  hourly_rate: priceSchema.nullable().optional(),
  pin_code: pinCodeSchema,
});

export type UpdateLocationMemberInput = z.infer<typeof updateLocationMemberSchema>;

// ----------------------------------------------------------------------------
// Location Invite Schemas
// ----------------------------------------------------------------------------

export const inviteStatusSchema = z.enum([
  'pending',
  'accepted',
  'expired',
  'cancelled',
]);

// Schema for creating an invite
export const createLocationInviteSchema = z.object({
  email: z.string().email('Invalid email address'),
  role_code: z.string().min(1, 'Role is required'),
});

export type CreateLocationInviteInput = z.infer<typeof createLocationInviteSchema>;

// ----------------------------------------------------------------------------
// Menu Override Schemas
// ----------------------------------------------------------------------------

export const stockTrackingModeSchema = z.enum([
  'in_stock',
  'out_of_stock',
  'quantity',
  'use_default',
]);

// Schema for creating/updating item override
export const upsertItemOverrideSchema = z.object({
  custom_price: priceSchema.nullable().optional(),
  custom_cash_price: priceSchema.nullable().optional(),
  is_available: z.boolean().default(true),
  stock_tracking_mode: stockTrackingModeSchema.nullable().optional(),
});

export type UpsertItemOverrideInput = z.infer<typeof upsertItemOverrideSchema>;

// Schema for creating/updating category override
export const upsertCategoryOverrideSchema = z.object({
  is_active: z.boolean().default(true),
  display_order: z.number().int().nullable().optional(),
});

export type UpsertCategoryOverrideInput = z.infer<typeof upsertCategoryOverrideSchema>;

// Schema for creating location-exclusive item
export const createExclusiveItemSchema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be less than 100 characters'),
  description: z.string().max(500).nullable().optional(),
  price: priceSchema,
  cash_price: priceSchema.nullable().optional(),
  image: z.string().url().nullable().optional(),
  category_id: z.string().uuid().nullable().optional(),
  meal_types: z.array(z.string()).default([]),
  allergens: z.array(z.string()).default([]),
  card_bg_color: z.string().nullable().optional(),
  availability: z.boolean().default(true),
  stock_tracking_mode: stockTrackingModeSchema.nullable().optional(),
  display_order: z.number().int().nullable().optional(),
});

export type CreateExclusiveItemInput = z.infer<typeof createExclusiveItemSchema>;

// Schema for updating location-exclusive item
export const updateExclusiveItemSchema = createExclusiveItemSchema.partial();

export type UpdateExclusiveItemInput = z.infer<typeof updateExclusiveItemSchema>;


// ============================================================================
// SECTION 3: API Request/Response Types
// ============================================================================

// ----------------------------------------------------------------------------
// Location Endpoints
// ----------------------------------------------------------------------------

// GET /api/locations
export interface ListLocationsResponse {
  locations: LocationSummary[];
  total: number;
}

// GET /api/locations/:id
export interface GetLocationResponse {
  location: Location;
  stats: {
    active_staff_count: number;
    manager_count: number;
    pending_invites_count: number;
  };
}

// POST /api/locations
export interface CreateLocationRequest {
  body: CreateLocationInput;
}

export interface CreateLocationResponse {
  location: Location;
}

// PATCH /api/locations/:id
export interface UpdateLocationRequest {
  params: { id: string };
  body: UpdateLocationInput;
}

export interface UpdateLocationResponse {
  location: Location;
}

// DELETE /api/locations/:id
export interface DeleteLocationResponse {
  success: true;
  deleted_id: string;
}

// ----------------------------------------------------------------------------
// Location Members Endpoints
// ----------------------------------------------------------------------------

// GET /api/locations/:id/members
export interface ListLocationMembersResponse {
  members: LocationMemberWithDetails[];
  total: number;
}

// POST /api/locations/:id/members
export interface AddLocationMemberRequest {
  params: { location_id: string };
  body: AddLocationMemberInput;
}

export interface AddLocationMemberResponse {
  member: LocationMemberWithDetails;
}

// PATCH /api/locations/:locationId/members/:memberId
export interface UpdateLocationMemberRequest {
  params: { location_id: string; member_id: string };
  body: UpdateLocationMemberInput;
}

export interface UpdateLocationMemberResponse {
  member: LocationMemberWithDetails;
}

// DELETE /api/locations/:locationId/members/:memberId
export interface RemoveLocationMemberResponse {
  success: true;
  removed_member_id: string;
}

// ----------------------------------------------------------------------------
// Location Invites Endpoints
// ----------------------------------------------------------------------------

// GET /api/locations/:id/invites
export interface ListLocationInvitesResponse {
  invites: LocationInviteWithDetails[];
  total: number;
}

// POST /api/locations/:id/invites
export interface CreateLocationInviteRequest {
  params: { location_id: string };
  body: CreateLocationInviteInput;
}

export interface CreateLocationInviteResponse {
  invite: LocationInvite;
}

// DELETE /api/locations/:locationId/invites/:inviteId
export interface CancelLocationInviteResponse {
  success: true;
  cancelled_invite_id: string;
}

// POST /api/locations/:locationId/invites/:inviteId/accept
export interface AcceptLocationInviteResponse {
  member: LocationMemberWithDetails;
}

// ----------------------------------------------------------------------------
// Menu Customization Endpoints
// ----------------------------------------------------------------------------

// GET /api/locations/:id/menu
export interface GetLocationMenuResponse {
  uses_global_menu: boolean;
  active_menus: Array<{
    menu_id: string;
    menu_name: string;
    is_active: boolean;
    display_order: number | null;
  }>;
  item_overrides: Array<LocationMenuItemOverride & {
    menu_item: {
      id: string;
      name: string;
      price: number;
      cash_price: number | null;
    };
  }>;
  category_overrides: Array<LocationCategoryOverride & {
    category: {
      id: string;
      name: string;
    };
  }>;
  exclusive_items: LocationExclusiveItem[];
}

// PUT /api/locations/:locationId/menu/items/:itemId
export interface UpsertItemOverrideRequest {
  params: { location_id: string; item_id: string };
  body: UpsertItemOverrideInput;
}

export interface UpsertItemOverrideResponse {
  override: LocationMenuItemOverride;
}

// PUT /api/locations/:locationId/menu/categories/:categoryId
export interface UpsertCategoryOverrideRequest {
  params: { location_id: string; category_id: string };
  body: UpsertCategoryOverrideInput;
}

export interface UpsertCategoryOverrideResponse {
  override: LocationCategoryOverride;
}

// POST /api/locations/:id/menu/exclusive-items
export interface CreateExclusiveItemRequest {
  params: { location_id: string };
  body: CreateExclusiveItemInput;
}

export interface CreateExclusiveItemResponse {
  item: LocationExclusiveItem;
}

// PATCH /api/locations/:locationId/menu/exclusive-items/:itemId
export interface UpdateExclusiveItemRequest {
  params: { location_id: string; item_id: string };
  body: UpdateExclusiveItemInput;
}

export interface UpdateExclusiveItemResponse {
  item: LocationExclusiveItem;
}

// DELETE /api/locations/:locationId/menu/exclusive-items/:itemId
export interface DeleteExclusiveItemResponse {
  success: true;
  deleted_item_id: string;
}


// ============================================================================
// SECTION 4: Utility Types
// ============================================================================

// For API error responses
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ApiErrorResponse {
  error: ApiError;
}

// For paginated responses
export interface PaginationParams {
  page?: number;
  limit?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
    has_next: boolean;
    has_prev: boolean;
  };
}

// For bulk operations
export interface BulkUpdateItemOverridesRequest {
  params: { location_id: string };
  body: {
    overrides: Array<{
      menu_item_id: string;
      custom_price?: number | null;
      custom_cash_price?: number | null;
      is_available?: boolean;
    }>;
  };
}

export interface BulkUpdateItemOverridesResponse {
  updated_count: number;
  overrides: LocationMenuItemOverride[];
}

// For the user's accessible locations (used in location switcher)
export interface UserAccessibleLocation {
  location_id: string;
  location_name: string;
  city: string;
  state: string;
  role_code: string;
  role_name: string;
  is_primary: boolean;
}

// GET /api/me/locations
export interface GetMyLocationsResponse {
  locations: UserAccessibleLocation[];
  current_location_id: string | null;
}


// ============================================================================
// SECTION 5: Form Types (for React Hook Form / UI)
// ============================================================================

// Multi-step location creation form
export interface LocationFormStep1 {
  name: string;
  code: string;
  phone: string;
  email: string;
}

export interface LocationFormStep2 {
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  timezone: string;
  latitude?: number | null;
  longitude?: number | null;
}

export interface LocationFormStep3 {
  ein: string;
  tax_id: string;
  sales_tax_rate: string;
}

export interface LocationFormStep4 {
  bank_name: string;
  account_holder_name: string;
  routing_number: string;
  account_number: string;
  confirm_account_number: string;
  bank_support_document_name: string;
  bank_support_document_url?: string;
  account_type: 'checking' | 'savings';
  use_merchant_billing_profile: boolean;
  /** Luqra acquiring MID (8-20 digits). Optional at create. */
  luqra_mid?: string;
  /** Free-text descriptor surfaced on Luqra reports. */
  luqra_mid_descriptor?: string;
}

export interface LocationFormStep5 {
  business_hours: BusinessHours;
}

export interface LocationFormStep6 {
  manager_assignment_type: 'skip' | 'invite_new' | 'assign_existing';
  manager_invite_name: string;
  manager_invite_email: string;
  existing_manager_identifier: string;
}

export interface LocationFormHiddenFields {
  uses_global_menu: boolean;
}

export type LocationFormData = LocationFormStep1 &
  LocationFormStep2 &
  LocationFormStep3 &
  LocationFormStep4 &
  LocationFormStep5 &
  LocationFormStep6 &
  LocationFormHiddenFields;

// Invite form
export interface InviteStaffFormData {
  email: string;
  role_code: string;
  is_primary_location: boolean;
}

// Member edit form
export interface EditMemberFormData {
  role_code: string;
  is_primary_location: boolean;
  is_active: boolean;
  employment_type: EmploymentType | null;
  hourly_rate: number | null;
  pin_code: string;
}

// Item override form (for price customization)
export interface ItemOverrideFormData {
  custom_price: string; // String for form input, converted to number
  custom_cash_price: string;
  is_available: boolean;
}


// ============================================================================
// SECTION 6: Constants & Enums
// ============================================================================

export const US_STATES = [
  { code: 'AL', name: 'Alabama' },
  { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'DE', name: 'Delaware' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
  { code: 'DC', name: 'District of Columbia' },
] as const;

export const US_TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Phoenix', label: 'Arizona (MST)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HST)' },
] as const;

export const EMPLOYMENT_TYPES = [
  { value: 'full_time', label: 'Full Time' },
  { value: 'part_time', label: 'Part Time' },
  { value: 'contractor', label: 'Contractor' },
  { value: 'seasonal', label: 'Seasonal' },
] as const;

export const INVITE_STATUS_LABELS: Record<InviteStatus, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  expired: 'Expired',
  cancelled: 'Cancelled',
};

// Default business hours template
export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  monday: { open: '09:00', close: '21:00', is_closed: false },
  tuesday: { open: '09:00', close: '21:00', is_closed: false },
  wednesday: { open: '09:00', close: '21:00', is_closed: false },
  thursday: { open: '09:00', close: '21:00', is_closed: false },
  friday: { open: '09:00', close: '22:00', is_closed: false },
  saturday: { open: '10:00', close: '22:00', is_closed: false },
  sunday: { open: '10:00', close: '20:00', is_closed: false },
};

// 1. Enums/Unions for fixed values
export type PriceModifierType = 'absolute' | 'percentage'; // Adjust based on your specific DB enum

// 2. Sub-interfaces for nested objects
export interface ItemCategory {
  id: string; // UUID
  name: string;
}

export interface LocationOverrideDetails {
  id: string; // UUID
  custom_price: number | null;
  custom_cash_price: number | null;
  price_modifier: number | null;
  price_modifier_type: PriceModifierType | null;
  is_available: boolean;
  stock_tracking_mode: StockTrackingMode;
  current_stock: number | null;
  low_stock_threshold: number | null;
}

// 3. Main Return Type
export interface LocationItem {
  // Identity & Meta
  id: string; // UUID
  name: string;
  description: string | null;
  image: string | null;
  card_bg_color: string | null;
  
  // Arrays (Postgres Arrays return as string[] in JSON)
  meal_types: string[] | null; 
  allergens: string[] | null;

  // Stock Logic
  stock_tracking_mode: StockTrackingMode;

  // Base Level (Level 1)
  base_price: number;
  base_cash_price: number | null;
  base_availability: boolean;

  // Override Level (Level 2) - Nullable if no override exists
  location_override: LocationOverrideDetails | null;

  // Effective Values (What the UI should display)
  effective_price: number;
  effective_cash_price: number | null;
  effective_availability: boolean;

  // UI Flags & Metadata
  has_location_override: boolean;
  price_source: 'base' | 'location_override';
  
  // Relations
  categories: ItemCategory[];
  menu_count: number;

  // Timestamps
  created_at: string; // ISO 8601 String
  updated_at: string; // ISO 8601 String
}
