// tests/orders.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { OrdersAPI } from '../lib/supabase-orders';

// Create a test Supabase client
function createTestSupabaseClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        throw new Error(
            'Missing Supabase environment variables. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'
        );
    }

    return createClient(supabaseUrl, supabaseKey);
}

describe('Orders API', () => {
    let supabase: ReturnType<typeof createTestSupabaseClient>;

    beforeAll(() => {
        supabase = createTestSupabaseClient();
    });

    it('should create order with valid data', async () => {
        const result = await OrdersAPI.createOrder({
            p_merchant_id: '2add44cb-f498-4653-aca3-a8f0ca258e70',
            p_location_id: '657a703d-37ef-423e-a72b-a8766f67941a',
            p_order_type: 'dine_in',
            p_table_number: '5'
        }, supabase);

        expect(result.success).toBe(true);
        expect(result.order_id).toBeDefined();
        expect(result.order_number).toMatch(/^ORD-\d{8}-\d{4}$/);
    });

    it('should calculate tax correctly', async () => {
        const orderId = 'test-order-id';
        const taxRate = 0.0825; // 8.25%

        const result = await OrdersAPI.calculateTax(orderId, taxRate, supabase);

        expect(result.success).toBe(true);
        expect(result.tax_amount).toBeCloseTo(8.25, 2);
    });

    it('should reject negative payment amounts', async () => {
        await expect(
            OrdersAPI.processPayment({
                p_order_id: 'test-order-id',
                p_payment_method: 'cash',
                p_amount: -10.00
            }, supabase)
        ).rejects.toThrow('Payment amount must be positive');
    });
});