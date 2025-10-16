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