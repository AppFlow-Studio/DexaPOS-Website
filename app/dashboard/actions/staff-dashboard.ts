'use server'

import { CreateLocationInvite, CancelLocationInvite, GetLocationInvites, GetLocationMembers } from './location-members'
import { quickAddStaff } from './staff'

export async function GetStaffAndInvites(locationId: string) {
    if (!locationId) {
        return { members: [], invites: [] }
    }

    const [members, invites] = await Promise.all([
        GetLocationMembers(locationId),
        GetLocationInvites(locationId)
    ])

    return { members, invites }
}

export async function InviteClerkToLocation(params: {
    locationId: string
    email: string
    role_code: string
    invited_by_user_id: string
}) {
    return CreateLocationInvite(params.locationId, {
        email: params.email,
        role_code: params.role_code,
        invited_by_user_id: params.invited_by_user_id
    })
}

export async function CancelLocationInviteById(inviteId: string) {
    return CancelLocationInvite(inviteId)
}

export async function CreatePosStaff(params: {
    merchantId: string
    locationId: string
    firstName: string
    lastName: string
    roleCode: string
    pin: string
    employmentType?: string
    hourlyRate?: number
}) {
    return quickAddStaff({
        merchantId: params.merchantId,
        locationId: params.locationId,
        firstName: params.firstName,
        lastName: params.lastName,
        roleCode: params.roleCode,
        pin: params.pin,
        employmentType: params.employmentType,
        hourlyRate: params.hourlyRate,
    })
}

