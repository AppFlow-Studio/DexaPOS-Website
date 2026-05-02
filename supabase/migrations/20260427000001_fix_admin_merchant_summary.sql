-- Fix admin_merchant_summary view — A1 bug
--
-- Three issues:
--  1. last_order_at used ALL orders (incl. cancelled/draft) for derived_status,
--     inflating "active" count.
--  2. orders_today counted preparing/pending/in-flight orders alongside completed,
--     making it inconsistent with revenue_today (completed-only).
--  3. View itself is fine after these fixes; the filter bug is in the server action.

CREATE OR REPLACE VIEW "public"."admin_merchant_summary" AS
SELECT
    m.id,
    m.name,
    m.clerk_org_id,
    m.type,
    m.created_at,
    m.updated_at,
    m.public_metadata,
    org."imageURL" AS logo_url,

    -- Location counts
    (
        SELECT COUNT(*)::integer
        FROM public.locations l
        WHERE l.merchant_id = m.id
    ) AS total_locations,
    (
        SELECT COUNT(*)::integer
        FROM public.locations l
        WHERE l.merchant_id = m.id AND l.is_active = true
    ) AS active_locations,

    -- Staff count
    (
        SELECT COUNT(*)::integer
        FROM public.staff_profiles sp
        WHERE sp.merchant_id = m.id AND sp.is_active = true
    ) AS active_staff_count,

    -- orders_today: completed orders only (consistent with revenue_today)
    (
        SELECT COUNT(*)::integer
        FROM public.orders o
        WHERE
            o.merchant_id = m.id
            AND o.created_at >= CURRENT_DATE
            AND o.status = 'completed'
    ) AS orders_today,

    -- revenue_today: unchanged — already correct
    (
        SELECT COALESCE(SUM(o.total_amount), 0)
        FROM public.orders o
        WHERE
            o.merchant_id = m.id
            AND o.created_at >= CURRENT_DATE
            AND o.status = 'completed'
    ) AS revenue_today,

    -- last_order_at: exclude cancelled/draft/void so derived_status reflects
    -- real activity, not noise from aborted orders
    (
        SELECT MAX(o.created_at)
        FROM public.orders o
        WHERE
            o.merchant_id = m.id
            AND o.status NOT IN (
                'cancelled',
                'draft',
                'void'
            )
    ) AS last_order_at,

    -- derived_status uses the same filtered last_order_at logic
    CASE
        WHEN NOT EXISTS (
            SELECT 1 FROM public.locations l
            WHERE l.merchant_id = m.id AND l.is_active = true
        ) THEN 'onboarding'
        WHEN (
            SELECT MAX(o.created_at)
            FROM public.orders o
            WHERE
                o.merchant_id = m.id
                AND o.status NOT IN ('cancelled', 'draft', 'void')
        ) IS NULL THEN 'onboarding'
        WHEN (
            SELECT MAX(o.created_at)
            FROM public.orders o
            WHERE
                o.merchant_id = m.id
                AND o.status NOT IN ('cancelled', 'draft', 'void')
        ) < (now() - INTERVAL '7 days') THEN 'inactive'
        ELSE 'active'
    END AS derived_status

FROM public.merchants m
LEFT JOIN public.organizations org ON m.clerk_org_id = org.id;

ALTER VIEW "public"."admin_merchant_summary" OWNER TO postgres;
