"use client";

import { useQuery } from "@tanstack/react-query";
import { GetModifierGroups } from "../actions/modifier-groups";

export function useModifierGroups(
  clerkOrgId: string | undefined,
  locationId: string | null = null
) {
  return useQuery({
    queryKey: ["modifier-groups", clerkOrgId, locationId],
    queryFn: async () => {
      if (!clerkOrgId) return [];
      return GetModifierGroups(clerkOrgId, locationId);
    },
    enabled: !!clerkOrgId,
    staleTime: 30000,
  });
}
