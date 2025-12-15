'use server'

import { CreateLocationInvite, CancelLocationInvite, GetLocationInvites, GetLocationMembers } from './location-members'
import { inviteStaffMember, InviteStaffParams, quickAddStaff } from './staff'

export async function GetStaffAndInvites(locationId: string, merchantId: string) {
    if (!locationId) {
        return { members: [], invites: [] }
    }

    const [members, invites] = await Promise.all([
        GetLocationMembers(locationId, merchantId),
        GetLocationInvites(locationId, merchantId)
    ])

    return { members, invites }
}

export async function InviteClerkToLocation(params: InviteStaffParams, clerkOrgId: string) {
    return inviteStaffMember({
        merchantId: params.merchantId,
        phone: params.phone,
        firstName: params.firstName,
        lastName: params.lastName,
        email: params.email,
        roleCode: params.roleCode,
        locationAssignments: params.locationAssignments,
        employmentType: params.employmentType,
        hourlyRate: params.hourlyRate,
        employeeId: params.employeeId,
        invited_by_user_id: params.invited_by_user_id,
    }, clerkOrgId)
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

