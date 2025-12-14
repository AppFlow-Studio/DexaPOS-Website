import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { GetStaffAndInvites, InviteClerkToLocation, CancelLocationInviteById, CreatePosStaff } from '../actions/staff-dashboard'

export function useStaff(locationId: string | null | undefined) {
    return useQuery({
        queryKey: ['staff-and-invites', locationId],
        queryFn: () => locationId ? GetStaffAndInvites(locationId) : { members: [], invites: [] },
        enabled: !!locationId,
    })
}

export function useInviteClerk() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: InviteClerkToLocation,
        onSuccess: (_, vars) => {
            queryClient.invalidateQueries({ queryKey: ['staff-and-invites', vars.locationId] })
        }
    })
}

export function useCreatePosStaff() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: CreatePosStaff,
        onSuccess: (_, vars) => {
            queryClient.invalidateQueries({ queryKey: ['staff-and-invites', vars.locationId] })
        }
    })
}

export function useCancelInvite() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (vars: { inviteId: string; locationId: string }) => {
            return CancelLocationInviteById(vars.inviteId)
        },
        onSuccess: (_, vars) => {
            queryClient.invalidateQueries({ queryKey: ['staff-and-invites', vars.locationId] })
        }
    })
}

