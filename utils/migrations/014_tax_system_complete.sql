-- ============================================================================
-- Migration 014: Tax System Complete
-- Description: Implements category-based tax rates with location-specific
--              percentages and item control columns (tax, channels)
-- ============================================================================

-- 1. Create Tax Rates Table (Location-Specific Percentages)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.tax_rates (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    location_id uuid REFERENCES public.locations(id) ON DELETE CASCADE NOT NULL,
    name text NOT NULL,
    percentage numeric(10, 4) NOT NULL CHECK (percentage >= 0 AND percentage <= 100),
    tax_category text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

-- Unique constraint: One active rate per category per location
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_loc_tax_cat
    ON public.tax_rates (location_id, tax_category)
    WHERE is_active = true;

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_tax_rates_location
    ON public.tax_rates(location_id)
    WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_tax_rates_category
    ON public.tax_rates(tax_category)
    WHERE is_active = true;

-- ============================================================================
-- 2. Add Control Columns to Menu Items (Global Level)
-- ============================================================================
ALTER TABLE public.menu_items
ADD COLUMN IF NOT EXISTS tax_category text DEFAULT 'standard' NOT NULL,
ADD COLUMN IF NOT EXISTS is_tax_exempt boolean DEFAULT false NOT NULL,
ADD COLUMN IF NOT EXISTS available_channels jsonb DEFAULT '["pos", "online"]'::jsonb NOT NULL;

-- Index for tax category lookups
CREATE INDEX IF NOT EXISTS idx_menu_items_tax_category
    ON public.menu_items(tax_category);

-- ============================================================================
-- 3. Add Control Columns to Location Item Overrides (Level 2)
-- ============================================================================
ALTER TABLE public.location_item_overrides
ADD COLUMN IF NOT EXISTS tax_category text,
ADD COLUMN IF NOT EXISTS is_tax_exempt boolean,
ADD COLUMN IF NOT EXISTS available_channels jsonb;

-- Note: Nullable columns = inherit from menu_items if null

-- ============================================================================
-- 4. Row Level Security Policies for tax_rates
-- ============================================================================

-- Enable RLS
ALTER TABLE public.tax_rates ENABLE ROW LEVEL SECURITY;

-- SELECT: Users can view tax rates for their accessible locations
CREATE POLICY "tax_rates_select_policy" ON public.tax_rates
    FOR SELECT
    USING (
        location_id IN (
            SELECT id FROM public.locations
            WHERE merchant_id = (
                SELECT merchant_id FROM public.users WHERE clerk_user_id = auth.jwt()->>'sub'
            )
        )
    );

-- INSERT: Users can create tax rates for their locations
CREATE POLICY "tax_rates_insert_policy" ON public.tax_rates
    FOR INSERT
    WITH CHECK (
        location_id IN (
            SELECT id FROM public.locations
            WHERE merchant_id = (
                SELECT merchant_id FROM public.users WHERE clerk_user_id = auth.jwt()->>'sub'
            )
        )
    );

-- UPDATE: Users can update tax rates for their locations
CREATE POLICY "tax_rates_update_policy" ON public.tax_rates
    FOR UPDATE
    USING (
        location_id IN (
            SELECT id FROM public.locations
            WHERE merchant_id = (
                SELECT merchant_id FROM public.users WHERE clerk_user_id = auth.jwt()->>'sub'
            )
        )
    )
    WITH CHECK (
        location_id IN (
            SELECT id FROM public.locations
            WHERE merchant_id = (
                SELECT merchant_id FROM public.users WHERE clerk_user_id = auth.jwt()->>'sub'
            )
        )
    );

-- DELETE: Users can delete tax rates for their locations
CREATE POLICY "tax_rates_delete_policy" ON public.tax_rates
    FOR DELETE
    USING (
        location_id IN (
            SELECT id FROM public.locations
            WHERE merchant_id = (
                SELECT merchant_id FROM public.users WHERE clerk_user_id = auth.jwt()->>'sub'
            )
        )
    );

-- ============================================================================
-- 5. Tax Calculation Function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_order_tax(p_order_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_location_id uuid;
    v_merchant_id uuid;
    v_subtotal numeric(10, 2);
    v_calculated_tax numeric(10, 2);
    v_result json;
BEGIN
    -- Verify context and get order details
    SELECT o.location_id, o.merchant_id, o.subtotal
    INTO v_location_id, v_merchant_id, v_subtotal
    FROM public.orders o
    WHERE o.id = p_order_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found: %', p_order_id;
    END IF;

    -- Smart Tax Calculation with Inheritance (L2 > L1)
    SELECT COALESCE(SUM(
        CASE
            -- 1. Exemption Check (L2 Override > L1 Global)
            WHEN COALESCE(lio.is_tax_exempt, mi.is_tax_exempt, false) = true THEN 0

            -- 2. Rate Lookup (Location Rate matching Item Category)
            -- Use L2 tax_category if set, otherwise use L1 tax_category
            ELSE ROUND(
                (oi.quantity * oi.unit_price) * (COALESCE(tr.percentage, 0) / 100),
                2
            )
        END
    ), 0)
    INTO v_calculated_tax
    FROM public.order_items oi
    INNER JOIN public.menu_items mi ON mi.id = oi.menu_item_id
    LEFT JOIN public.location_item_overrides lio
        ON lio.menu_item_id = mi.id
        AND lio.location_id = v_location_id
    LEFT JOIN public.tax_rates tr
        ON tr.location_id = v_location_id
        AND tr.tax_category = COALESCE(lio.tax_category, mi.tax_category, 'standard')
        AND tr.is_active = true
    WHERE oi.order_id = p_order_id
        AND (oi.status IS NULL OR oi.status != 'voided');

    -- Update Order Totals
    UPDATE public.orders
    SET
        tax_amount = v_calculated_tax,
        total_amount = subtotal + v_calculated_tax + COALESCE(service_charge, 0) - COALESCE(discount_amount, 0),
        amount_due = (subtotal + v_calculated_tax + COALESCE(service_charge, 0) - COALESCE(discount_amount, 0)) - COALESCE(amount_paid, 0),
        updated_at = NOW()
    WHERE id = p_order_id;

    -- Return success with calculated tax
    SELECT json_build_object(
        'success', true,
        'tax_amount', v_calculated_tax,
        'order_id', p_order_id
    ) INTO v_result;

    RETURN v_result;
EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object(
            'success', false,
            'error', SQLERRM
        );
END;
$function$;

-- ============================================================================
-- 6. Helper Function: Get Effective Item Tax Info
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_effective_item_tax(
    p_menu_item_id uuid,
    p_location_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_result json;
    v_tax_category text;
    v_is_tax_exempt boolean;
    v_tax_rate record;
BEGIN
    -- Get effective tax settings (L2 override > L1 base)
    SELECT
        COALESCE(lio.tax_category, mi.tax_category, 'standard') as effective_tax_category,
        COALESCE(lio.is_tax_exempt, mi.is_tax_exempt, false) as effective_is_tax_exempt
    INTO v_tax_category, v_is_tax_exempt
    FROM public.menu_items mi
    LEFT JOIN public.location_item_overrides lio
        ON lio.menu_item_id = mi.id
        AND lio.location_id = p_location_id
    WHERE mi.id = p_menu_item_id;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Item not found');
    END IF;

    -- If exempt, return early
    IF v_is_tax_exempt THEN
        RETURN json_build_object(
            'success', true,
            'tax_category', v_tax_category,
            'is_tax_exempt', true,
            'tax_rate', null,
            'percentage', 0
        );
    END IF;

    -- Lookup tax rate
    SELECT * INTO v_tax_rate
    FROM public.tax_rates
    WHERE location_id = p_location_id
        AND tax_category = v_tax_category
        AND is_active = true
    LIMIT 1;

    RETURN json_build_object(
        'success', true,
        'tax_category', v_tax_category,
        'is_tax_exempt', false,
        'tax_rate', row_to_json(v_tax_rate),
        'percentage', COALESCE(v_tax_rate.percentage, 0)
    );
END;
$function$;

-- ============================================================================
-- 7. Update Trigger for tax_rates updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_tax_rates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tax_rates_updated_at_trigger
    BEFORE UPDATE ON public.tax_rates
    FOR EACH ROW
    EXECUTE FUNCTION public.update_tax_rates_updated_at();

-- ============================================================================
-- Migration Complete
-- ============================================================================

-- Grant permissions (adjust based on your role setup)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tax_rates TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;

-- Migration summary
DO $$
BEGIN
    RAISE NOTICE '✅ Tax system migration complete';
    RAISE NOTICE '   - tax_rates table created with RLS policies';
    RAISE NOTICE '   - menu_items extended with tax_category, is_tax_exempt, available_channels';
    RAISE NOTICE '   - location_item_overrides extended with same fields (nullable)';
    RAISE NOTICE '   - calculate_order_tax() function created';
    RAISE NOTICE '   - get_effective_item_tax() helper function created';
END $$;
