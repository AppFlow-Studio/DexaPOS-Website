'use server'

import { assertHQPermission } from '@/lib/admin/auth'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export interface PlatformTransaction {
  id: string
  merchant_name: string
  merchant_id: string
  total_amount: number
  status: string
  order_type: string
  created_at: string
  customer_name?: string
  payment_status: string
  payment_method?: string
}

/**
 * Get platform-wide transactions feed
 */
export async function getPlatformTransactions(limit: number = 50, offset: number = 0): Promise<{ data: PlatformTransaction[], total: number }> {
  await assertHQPermission('hq.merchant.transactions')

  const supabase = createServerSupabaseClient()

  const { data, error, count } = await supabase
    .from('orders')
    .select(`
      id,
      total_amount,
      status,
      order_type,
      created_at,
      customer_name,
      payment_status,
      merchant_id,
      merchants!inner(name)
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    console.error('[getPlatformTransactions] Error:', error)
    return { data: [], total: 0 }
  }

  const formattedData = data.map((order: any) => ({
    id: order.id,
    merchant_name: order.merchants.business_name,
    merchant_id: order.merchant_id,
    total_amount: Number(order.total_amount),
    status: order.status,
    order_type: order.order_type,
    created_at: order.created_at,
    customer_name: order.customer_name,
    payment_status: order.payment_status
  }))

  return { 
    data: formattedData, 
    total: count || 0 
  }
}
