// lib/supabase-orders.ts
import { createServerSupabaseClient } from '../lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { 
  Order, 
  CreateOrderParams, 
  AddOrderItemParams,
  ProcessPaymentParams,
  OrderStatus
} from '@/types/order-management';

type SupabaseClientType = SupabaseClient<any, 'public', any>

const getSupabaseClient = (client?: SupabaseClientType) => {
    // If a client is provided (e.g., from tests), use it
    // Otherwise, use the server client with Clerk auth
    return client || createServerSupabaseClient()
}

export const OrdersAPI = {
  // Create new order
    createOrder: async (params: CreateOrderParams, supabase?: SupabaseClientType) => {
        const client = getSupabaseClient(supabase)
        const { data, error } = await client.rpc('create_order', params);
    if (error) throw error;
    return data;
  },

  // Add item to order
    addItem: async (params: AddOrderItemParams, supabase?: SupabaseClientType) => {
        const client = getSupabaseClient(supabase)
        const { data, error } = await client.rpc('add_order_item', params);
    if (error) throw error;
    return data;
  },

  // Update order status
    updateStatus: async (orderId: string, status: OrderStatus, reason?: string, supabase?: SupabaseClientType) => {
        const client = getSupabaseClient(supabase)
        const { data, error } = await client.rpc('update_order_status', {
      p_order_id: orderId,
      p_new_status: status,
      p_reason: reason
    });
    if (error) throw error;
    return data;
  },

  // Calculate tax
    calculateTax: async (orderId: string, taxRate: number = 0.0825, supabase?: SupabaseClientType) => {
        const client = getSupabaseClient(supabase)
        const { data, error } = await client.rpc('calculate_order_tax', {
      p_order_id: orderId,
      p_tax_rate: taxRate
    });
    if (error) throw error;
    return data;
  },

  // Process payment
    processPayment: async (params: ProcessPaymentParams, supabase?: SupabaseClientType) => {
        const client = getSupabaseClient(supabase)
        if (params.p_amount <= 0) {
            throw new Error('Payment amount must be positive');
        }
        const { data, error } = await client.rpc('process_payment', params);
    if (error) throw error;
    return data;
  },

  // Get order details
    getOrderDetails: async (orderId: string, supabase?: SupabaseClientType) => {
        const client = getSupabaseClient(supabase)
        const { data, error } = await client.rpc('get_order_details', {
      p_order_id: orderId
    });
    if (error) throw error;
    return data;
  },

  // Get orders for location
    getLocationOrders: async (locationId: string, statuses?: OrderStatus[], supabase?: SupabaseClientType) => {
        const client = getSupabaseClient(supabase)
        let query = client
      .from('orders')
      .select(`
        *,
        order_items (
          *,
          order_item_modifiers (*)
        ),
        order_payments (*)
      `)
      .eq('location_id', locationId)
      .order('created_at', { ascending: false });

    if (statuses && statuses.length > 0) {
      query = query.in('status', statuses);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data as Order[];
  },

  // Void order item
    voidItem: async (orderItemId: string, reason: string, supabase?: SupabaseClientType) => {
        const client = getSupabaseClient(supabase)
        const { data, error } = await client.rpc('void_order_item', {
      p_order_item_id: orderItemId,
      p_void_reason: reason
    });
    if (error) throw error;
    return data;
  }
};