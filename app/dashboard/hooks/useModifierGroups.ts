'use client'

import { useQuery } from '@tanstack/react-query'
import { GetModifierGroups } from '../actions/modifier-groups'

export function useModifierGroups(clerkOrgId: string | undefined) {
    return useQuery({
        queryKey: ['modifier-groups', clerkOrgId],
        queryFn: async () => {
            if (!clerkOrgId) return []
            return GetModifierGroups(clerkOrgId)
        },
        enabled: !!clerkOrgId,
        staleTime: 30000,
    })
}

