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

