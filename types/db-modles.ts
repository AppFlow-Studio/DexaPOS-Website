export interface UsersModel {
    id: string
    first_name: string
    last_name: string
    email: string
    avatar_url: string
    created_at: string
    updated_at: string
}

export interface MembersModel {
    id: string
    user_id: string
    organization_id: string
    created_at: string
    updated_at: string
}

export interface OrganizationsModel {
    id: string
    name: string
    imageURL: string
    created_at: string
    updated_at: string
}

export interface CarriersModel {
    id: string
    clerk_org_id: string // FK to organizations table
    name: string
    created_at: string
    updated_at: string
}

export interface MerchantsModel {
    id: string
    clerk_org_id: string // FK to organizations table
    carrier_id: string // FK to carriers table
    public_metadata: {
        org_type: string,
        status: 'active' | 'pending' | 'suspended',
        business_address: string,
        owner_name: string,
        owner_email: string,
        owner_phone: string,
        carrierId: string,
        createdBy: string,
    }
    type: string
    name: string
    created_at: string
    updated_at: string
}

export interface LocationsModel {
    id: string
    merchant_id: string // FK to merchants table
    name: string
    address: string
    created_at: string
    updated_at: string
}

export interface PendingOrgAdminInvitesModel {
    id: string
    organization_id: string // FK to organizations table
    clerk_invite_id: string // FK to clerk_invitations table
    email: string
    status: string
    role: string
    clerk_user_id: string // FK to clerk_users table
    created_at: string
    updated_at: string
}

// Extended interfaces for merchant info with related data
export interface MerchantInfoModel {
    id: string
    clerk_org_id: string
    carrier_id: string
    public_metadata: {
        org_type: string
        status: 'active' | 'pending' | 'suspended'
        business_address: string
        owner_name: string
        owner_email: string
        owner_phone: string
        carrierId: string
        createdBy: string
    }
    type: string
    name: string
    created_at: Date
    updated_at: Date
    // Related data from joins
    organizations?: {
        imageURL: string
    }
    carriers?: CarriersModel
    members?: Array<{
        id: string
        user_id: string
        organization_id: string
        created_at: string
        updated_at: string
        users?: UsersModel
    }>
    pending_org_admin_invites?: Array<{
        id: string
        organization_id: string
        clerk_invite_id: string
        email: string
        status: string
        role: string
        clerk_user_id: string
        created_at: string
        updated_at: string
        users?: UsersModel
    }>
}

// Interface for merchant analytics/KPI data
export interface MerchantAnalyticsModel {
    total_sales: number
    transaction_count: number
    conversion_rate: number
    growth_rate: number
    monthly_revenue: number
    average_transaction: number
    customer_count: number
    staff_count: number
}

// Interface for transaction data
export interface TransactionModel {
    id: string
    amount: number
    customer: string
    time: string
    status: 'completed' | 'pending' | 'refunded' | 'failed'
    created_at: string
    updated_at: string
}

// Interface for staff member data
export interface StaffMemberModel {
    id: string
    name: string
    role: 'Owner' | 'Manager' | 'Cashier' | 'Admin'
    email: string
    status: 'active' | 'inactive'
    last_login: string
    created_at: string
    updated_at: string
}

// Complete merchant info interface combining all data
export interface CompleteMerchantInfoModel extends MerchantInfoModel {
    analytics?: MerchantAnalyticsModel
    recent_transactions?: TransactionModel[]
    staff?: StaffMemberModel[]
    locations?: LocationsModel[]
}

export interface RolesModel {
    id: string
    code: string,
    name: string,
    description: string,
    organization_type: string,
    level: number,
    is_system_role: boolean,
    level_type: string,
    created_at: string,
    updated_at: string
}

export interface PermissionsModel {
    id: string
    code: string,
    name: string,
    description: string,
    category: string,
    scope: string,
    created_at: string,
}

export interface RolePermissionsModel {
    id: string
    role_code: string,
    permission_code: string,
    created_at: string,
}