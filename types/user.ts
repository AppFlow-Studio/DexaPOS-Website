// types/user.ts

// ============================================================================
// BASE TYPES
// ============================================================================

export interface User {
    id: string
    email: string
    first_name: string | null
    last_name: string | null
    avatar_url: string | null
    phone: string | null
    created_at: string
    updated_at: string
}

// ============================================================================
// USER TYPES - A user can be one or more of these
// ============================================================================

export type UserType = 'merchant' | 'carrier' | 'dexa_hq'

// ============================================================================
// MERCHANT RELATED
// ============================================================================

export interface Merchant {
    id: string
    name: string
    clerk_org_id: string
    organization_id?: string  // If you have this FK
    logo_url: string | null
    timezone: string | null
    currency: string
    subscription_status: string | null
    subscription_tier: string | null
    is_active: boolean
    created_at: string
    updated_at: string
}

export interface Location {
    id: string
    merchant_id: string
    name: string
    address: string | null
    city: string | null
    state: string | null
    zip: string | null
    phone: string | null
    timezone: string | null
    is_active: boolean
    created_at: string
    updated_at: string
}

export interface Organization {
    id: string
    clerk_org_id: string
    name: string
    slug: string | null
    logo_url: string | null
    type: 'merchant' | 'carrier' | 'dexa_hq'  // Add this column if not exists
    created_at: string
    updated_at: string
}

// ============================================================================
// MEMBERSHIP TYPES
// ============================================================================

export type MemberRole = 'owner' | 'admin' | 'manager' | 'member'
export type LocationRole = 'manager' | 'staff' | 'cashier' | 'kitchen'
export type CarrierRole = 'owner' | 'admin' | 'dispatcher' | 'driver'
export type DexaHQRole = 'super_admin' | 'admin' | 'support' | 'sales' | 'developer'

export interface Member {
    id: string
    user_id: string
    organization_id: string
    role: MemberRole
    is_active: boolean
    created_at: string
    updated_at: string
    
    // Relations
    organizations?: Organization & {
        merchants?: Merchant | null
        carriers?: Carrier | null
    }
    location_members?: LocationMember[]
}

export interface LocationMember {
    id: string
    member_id: string
    location_id: string
    role: LocationRole
    pin_code: string | null
    is_active: boolean
    created_at: string
    updated_at: string
    locations?: Location
}

// ============================================================================
// CARRIER RELATED (for delivery services)
// ============================================================================

export interface Carrier {
    id: string
    name: string
    clerk_org_id: string
    logo_url: string | null
    is_active: boolean
    service_area: any  // JSONB for geo data
    created_at: string
    updated_at: string
}

export interface CarrierMember {
    id: string
    user_id: string
    carrier_id: string
    role: CarrierRole
    is_active: boolean
    vehicle_info?: any
    created_at: string
    updated_at: string
    carriers?: Carrier
}

// ============================================================================
// DEXA HQ RELATED (internal staff)
// ============================================================================

export interface DexaHQMember {
    id: string
    user_id: string
    role: DexaHQRole
    department: string | null
    is_active: boolean
    created_at: string
    updated_at: string
}

// ============================================================================
// FULL USER TYPE WITH ALL RELATIONS
// ============================================================================

export interface UserWithAllMemberships extends User {
    members?: Member[]                    // Merchant org memberships
    carrier_members?: CarrierMember[]     // Carrier memberships
    dexa_hq_members?: DexaHQMember[]      // DEXA HQ membership
}

// ============================================================================
// COMPUTED/TRANSFORMED TYPES
// ============================================================================

export interface UserContext {
    user: User
    userTypes: UserType[]
    
    // Merchant context
    merchantMemberships: MerchantMembership[]
    currentMerchant: MerchantMembership | null
    
    // Carrier context
    carrierMemberships: CarrierMembership[]
    currentCarrier: CarrierMembership | null
    
    // DEXA HQ context
    dexaHQMembership: DexaHQMembership | null
    
    // Flags
    isMerchantUser: boolean
    isCarrierUser: boolean
    isDexaHQUser: boolean
    isSuperAdmin: boolean
}

export interface MerchantMembership {
    memberId: string
    organizationId: string
    clerkOrgId: string
    organizationName: string
    merchantId: string
    merchantName: string
    merchantLogo: string | null
    role: MemberRole
    isOwner: boolean
    isAdmin: boolean
    isManager: boolean
    locations: UserLocation[]
    permissions: MerchantPermissions
}

export interface CarrierMembership {
    memberId: string
    carrierId: string
    carrierName: string
    clerkOrgId: string
    role: CarrierRole
    isOwner: boolean
    isAdmin: boolean
    isDispatcher: boolean
    isDriver: boolean
    permissions: CarrierPermissions
}

export interface DexaHQMembership {
    memberId: string
    role: DexaHQRole
    department: string | null
    isSuperAdmin: boolean
    isAdmin: boolean
    permissions: DexaHQPermissions
}

export interface UserLocation {
    locationId: string
    locationName: string
    address: string | null
    role: LocationRole
    isManager: boolean
    isActive: boolean
}

// ============================================================================
// PERMISSIONS
// ============================================================================

export interface MerchantPermissions {
    // Organization level
    canManageOrganization: boolean
    canManageBilling: boolean
    canManageLocations: boolean
    canManageMenus: boolean
    canManageStaff: boolean
    canViewReports: boolean
    canManageIntegrations: boolean
    
    // Transaction level
    canProcessOrders: boolean
    canVoidOrders: boolean
    canRefundOrders: boolean
    canApplyDiscounts: boolean
    canOpenCloseRegister: boolean
    
    // Location access
    canAccessAllLocations: boolean
    accessibleLocationIds: string[]
}

export interface CarrierPermissions {
    canManageCarrier: boolean
    canManageDrivers: boolean
    canDispatchOrders: boolean
    canViewAllDeliveries: boolean
    canAcceptDeliveries: boolean
    canCompleteDeliveries: boolean
}

export interface DexaHQPermissions {
    canAccessAllMerchants: boolean
    canManageMerchants: boolean
    canManageCarriers: boolean
    canViewSystemReports: boolean
    canManageSubscriptions: boolean
    canAccessSupport: boolean
    canManageHQStaff: boolean
    canAccessDeveloperTools: boolean
}