'use client'

import { useQuery } from '@tanstack/react-query'
import { GetModifierGroup } from '../actions/modifier-groups'

export function useModifierGroup(modifierGroupId: string | undefined) {
    return useQuery({
        queryKey: ['modifier-group', modifierGroupId],
        queryFn: async () => {
            if (!modifierGroupId) return null
            return GetModifierGroup(modifierGroupId)
        },
        enabled: !!modifierGroupId,
        staleTime: 30000,
    })
}

