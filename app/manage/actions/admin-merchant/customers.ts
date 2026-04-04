'use server'

import { assertHQPermission } from '@/lib/admin/auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { CustomerListItem, CustomerProfile } from '@/types/customer'

async function getMerchantIdFromClerkOrgId(clerkOrgId: string): Promise<string | null> {
  if (!clerkOrgId) return null

  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('merchants')
    .select('id')
    .eq('clerk_org_id', clerkOrgId)
    .single()

  if (error || !data) {
    console.error('[getMerchantIdFromClerkOrgId] Error:', error)
    return null
  }

  return data.id as string
}

export async function getAdminMerchantCustomers(
  clerkOrgId: string,
  options?: {
    limit?: number
    offset?: number
    orderBy?: 'last_order_date' | 'lifetime_spend' | 'visits' | 'created_at'
    ascending?: boolean
    locationId?: string
  }
): Promise<CustomerListItem[]> {
  await assertHQPermission('hq.merchant.view')

  if (!clerkOrgId) return []

  const merchantId = await getMerchantIdFromClerkOrgId(clerkOrgId)
  if (!merchantId) return []

  const supabase = createServiceRoleClient()
  const limit = options?.limit ?? 100
  const offset = options?.offset ?? 0
  const orderBy = options?.orderBy ?? 'last_order_date'
  const ascending = options?.ascending ?? false
  const locationId = options?.locationId

  if (locationId && locationId !== 'all') {
    const { data: locationOrders, error: orderError } = await supabase
      .from('orders')
      .select('customer_id, total_amount, created_at')
      .eq('merchant_id', merchantId)
      .eq('location_id', locationId)
      .not('customer_id', 'is', null)

    if (orderError) {
      console.error('[getAdminMerchantCustomers] Error fetching location orders:', orderError)
      return []
    }

    const customerStats = new Map<
      string,
      { spend: number; orders: number; lastVisit: string | null }
    >()

    for (const order of locationOrders || []) {
      const customerId = order.customer_id as string
      const amount = Number(order.total_amount) || 0
      const existing = customerStats.get(customerId)

      if (existing) {
        existing.spend += amount
        existing.orders += 1
        if (order.created_at && (!existing.lastVisit || order.created_at > existing.lastVisit)) {
          existing.lastVisit = order.created_at
        }
      } else {
        customerStats.set(customerId, {
          spend: amount,
          orders: 1,
          lastVisit: order.created_at,
        })
      }
    }

    const uniqueIds = [...customerStats.keys()]
    if (uniqueIds.length === 0) return []

    const { data, error } = await supabase
      .from('customers')
      .select('id, name, phone, email, tags')
      .eq('merchant_id', merchantId)
      .eq('is_active', true)
      .in('id', uniqueIds)

    if (error) {
      console.error('[getAdminMerchantCustomers] Error fetching customers:', error)
      return []
    }

    const results: CustomerListItem[] = (data || []).map((customer) => {
      const stats = customerStats.get(customer.id)!
      return {
        ...customer,
        lifetime_spend: stats.spend,
        visits: stats.orders,
        total_orders: stats.orders,
        avg_spend: stats.orders > 0 ? stats.spend / stats.orders : 0,
        last_visit: stats.lastVisit,
      }
    })

    const sortKey = orderBy === 'last_order_date' ? 'last_visit' : orderBy
    results.sort((a, b) => {
      const aVal = (a as unknown as Record<string, unknown>)[sortKey] ?? ''
      const bVal = (b as unknown as Record<string, unknown>)[sortKey] ?? ''
      if (aVal < bVal) return ascending ? -1 : 1
      if (aVal > bVal) return ascending ? 1 : -1
      return 0
    })

    return results.slice(offset, offset + limit)
  }

  const { data, error } = await supabase
    .from('customers')
    .select(
      'id, name, phone, email, lifetime_spend, visits, last_visit, total_orders, avg_spend, tags'
    )
    .eq('merchant_id', merchantId)
    .eq('is_active', true)
    .order(orderBy, { ascending, nullsFirst: false })
    .range(offset, offset + limit - 1)

  if (error) {
    console.error('[getAdminMerchantCustomers] Error:', error)
    return []
  }

  return (data as CustomerListItem[]) || []
}

export async function getAdminCustomerProfile(
  customerId: string
): Promise<CustomerProfile | null> {
  await assertHQPermission('hq.merchant.view')

  if (!customerId) return null

  const supabase = createServiceRoleClient()
  const { data, error } = await supabase.rpc('get_customer_profile', {
    p_customer_id: customerId,
  })

  if (error) {
    console.error('[getAdminCustomerProfile] Error:', error)
    return null
  }

  return data as CustomerProfile
}

export async function adminAddCustomerTag(
  customerId: string,
  tag: string
): Promise<{ success: boolean; error?: string; tags?: string[] }> {
  await assertHQPermission('hq.merchant.update')

  if (!customerId || !tag.trim()) {
    return { success: false, error: 'Customer ID and tag are required' }
  }

  const supabase = createServiceRoleClient()
  const normalizedTag = tag.trim().toUpperCase()

  const { data: customer, error: fetchError } = await supabase
    .from('customers')
    .select('tags')
    .eq('id', customerId)
    .single()

  if (fetchError) {
    console.error('[adminAddCustomerTag] Error fetching customer:', fetchError)
    return { success: false, error: fetchError.message }
  }

  const currentTags = (customer?.tags || []) as string[]
  if (currentTags.includes(normalizedTag)) {
    return { success: true, tags: currentTags }
  }

  const newTags = [...currentTags, normalizedTag]
  const { data, error } = await supabase
    .from('customers')
    .update({
      tags: newTags,
      updated_at: new Date().toISOString(),
    })
    .eq('id', customerId)
    .select('tags')
    .single()

  if (error) {
    console.error('[adminAddCustomerTag] Error updating tags:', error)
    return { success: false, error: error.message }
  }

  return { success: true, tags: (data?.tags as string[]) || newTags }
}

export async function adminUpdateCustomerNotes(
  customerId: string,
  notes: string
): Promise<{ success: boolean; error?: string }> {
  await assertHQPermission('hq.merchant.update')

  if (!customerId) {
    return { success: false, error: 'Customer ID is required' }
  }

  const supabase = createServiceRoleClient()
  const { error } = await supabase
    .from('customers')
    .update({
      notes: notes.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', customerId)

  if (error) {
    console.error('[adminUpdateCustomerNotes] Error:', error)
    return { success: false, error: error.message }
  }

  return { success: true }
}
