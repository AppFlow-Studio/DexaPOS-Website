import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { GetMerchants } from "../actions/get-merchants"
import { MerchantsModel } from "@/types/db-modles"

// Hook to fetch all merchants for admin use
export function useMerchantsForAdmin() {
  return useQuery({
    queryKey: ['admin-merchants-list'],
    queryFn: async () => {
      const result = await GetMerchants()
      if (Array.isArray(result)) {
        return result as MerchantsModel[]
      }
      // Handle error response
      if (result && typeof result === 'object' && 'success' in result && !result.success) {
        throw new Error(result.message || 'Failed to fetch merchants')
      }
      return [] as MerchantsModel[]
    },
    staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
    refetchOnWindowFocus: false,
  })
}

// Hook to search/filter merchants
export function useMerchantsSearch(searchQuery: string) {
  const { data: merchants, ...rest } = useMerchantsForAdmin()

  const filteredMerchants = merchants?.filter((merchant) => {
    if (!searchQuery.trim()) return true
    const query = searchQuery.toLowerCase()
    return (
      merchant.name?.toLowerCase().includes(query) ||
      merchant.type?.toLowerCase().includes(query)
    )
  }) || []

  return {
    ...rest,
    data: filteredMerchants,
    allMerchants: merchants,
  }
}
