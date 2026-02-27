import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { AdminMerchantAccess } from "@/types/admin"
import { createBrowserSupabaseClient } from "@/lib/supabase/client"
import { useSession } from "@clerk/nextjs"

// Hook to fetch all merchant access for a specific admin
export function useAdminMerchantAccess(adminUserId: string) {
  const { session, isLoaded } = useSession()

  return useQuery({
    queryKey: ['admin-merchant-access', adminUserId],
    queryFn: async () => {
      if (!adminUserId) return []

      // Get token from session
      const token = await session?.getToken()
      if (!token) {
        throw new Error('No authentication token available')
      }

      const supabase = createBrowserSupabaseClient(token)
      const { data, error } = await supabase
        .from('admin_merchant_access')
        .select(`
          *,
          merchants:merchant_id (
            id,
            name,
            type
          ),
          granted_by_user:granted_by (
            id,
            first_name,
            last_name
          )
        `)
        .eq('admin_user_id', adminUserId)
        .eq('is_active', true)
        .order('granted_at', { ascending: false })

      if (error) {
        console.error('Error fetching admin merchant access:', error)
        throw new Error(error.message)
      }

      // Transform to AdminMerchantAccess format (simplified - no accessLevel)
      return (data || []).map((record: any): AdminMerchantAccess => ({
        id: record.id,
        adminUserId: record.admin_user_id,
        merchantId: record.merchant_id,
        merchantName: record.merchants?.name || 'Unknown',
        grantedBy: record.granted_by,
        grantedByName: record.granted_by_user 
          ? `${record.granted_by_user.first_name} ${record.granted_by_user.last_name}`.trim()
          : undefined,
        grantedAt: record.granted_at,
        revokedAt: record.revoked_at,
        isActive: record.is_active,
        notes: record.notes,
        createdAt: record.created_at,
        updatedAt: record.updated_at,
      }))
    },
    enabled: !!adminUserId && isLoaded && !!session,
    staleTime: 2 * 60 * 1000, // 2 minutes
  })
}

// Hook to grant merchant access to an admin (simplified - no access level)
export function useGrantMerchantAccess() {
  const queryClient = useQueryClient()
  const { session } = useSession()

  return useMutation({
    mutationFn: async ({
      adminUserId,
      merchantId,
      grantedBy,
      notes,
    }: {
      adminUserId: string
      merchantId: string
      grantedBy?: string
      notes?: string
    }) => {
      const token = await session?.getToken()
      if (!token) {
        throw new Error('No authentication token available')
      }

      const supabase = createBrowserSupabaseClient(token)
      
      const { data, error } = await supabase
        .from('admin_merchant_access')
        .upsert({
          admin_user_id: adminUserId,
          merchant_id: merchantId,
          granted_by: grantedBy,
          granted_at: new Date().toISOString(),
          is_active: true,
          revoked_at: null,
          notes,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'admin_user_id,merchant_id'
        })
        .select()
        .single()

      if (error) {
        throw new Error(error.message)
      }

      return data
    },
    onSuccess: (_, variables) => {
      // Invalidate queries to refetch
      queryClient.invalidateQueries({ 
        queryKey: ['admin-merchant-access', variables.adminUserId] 
      })
    },
  })
}

// Hook to revoke merchant access from an admin
export function useRevokeMerchantAccess() {
  const queryClient = useQueryClient()
  const { session } = useSession()

  return useMutation({
    mutationFn: async ({
      adminUserId,
      merchantId,
    }: {
      adminUserId: string
      merchantId: string
    }) => {
      const token = await session?.getToken()
      if (!token) {
        throw new Error('No authentication token available')
      }

      const supabase = createBrowserSupabaseClient(token)
      
      const { data, error } = await supabase
        .from('admin_merchant_access')
        .update({
          is_active: false,
          revoked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('admin_user_id', adminUserId)
        .eq('merchant_id', merchantId)
        .select()
        .single()

      if (error) {
        throw new Error(error.message)
      }

      return data
    },
    onSuccess: (_, variables) => {
      // Invalidate queries to refetch
      queryClient.invalidateQueries({ 
        queryKey: ['admin-merchant-access', variables.adminUserId] 
      })
    },
  })
}

// Hook to bulk grant merchant access (simplified - no access levels)
export function useBulkGrantMerchantAccess() {
  const queryClient = useQueryClient()
  const { session } = useSession()

  return useMutation({
    mutationFn: async ({
      adminUserId,
      merchantIds,
      grantedBy,
    }: {
      adminUserId: string
      merchantIds: string[]
      grantedBy?: string
    }) => {
      const token = await session?.getToken()
      if (!token) {
        throw new Error('No authentication token available')
      }

      const supabase = createBrowserSupabaseClient(token)
      
      const records = merchantIds.map((merchantId) => ({
        admin_user_id: adminUserId,
        merchant_id: merchantId,
        granted_by: grantedBy,
        granted_at: new Date().toISOString(),
        is_active: true,
        updated_at: new Date().toISOString(),
      }))

      const { data, error } = await supabase
        .from('admin_merchant_access')
        .upsert(records, {
          onConflict: 'admin_user_id,merchant_id'
        })
        .select()

      if (error) {
        throw new Error(error.message)
      }

      return data
    },
    onSuccess: (_, variables) => {
      // Invalidate queries to refetch
      queryClient.invalidateQueries({ 
        queryKey: ['admin-merchant-access', variables.adminUserId] 
      })
    },
  })
}

// Hook to bulk revoke merchant access
export function useBulkRevokeMerchantAccess() {
  const queryClient = useQueryClient()
  const { session } = useSession()

  return useMutation({
    mutationFn: async ({
      adminUserId,
      merchantIds,
    }: {
      adminUserId: string
      merchantIds: string[]
    }) => {
      const token = await session?.getToken()
      if (!token) {
        throw new Error('No authentication token available')
      }

      const supabase = createBrowserSupabaseClient(token)
      
      const { data, error } = await supabase
        .from('admin_merchant_access')
        .update({
          is_active: false,
          revoked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('admin_user_id', adminUserId)
        .in('merchant_id', merchantIds)
        .select()

      if (error) {
        throw new Error(error.message)
      }

      return data
    },
    onSuccess: (_, variables) => {
      // Invalidate queries to refetch
      queryClient.invalidateQueries({ 
        queryKey: ['admin-merchant-access', variables.adminUserId] 
      })
    },
  })
}
