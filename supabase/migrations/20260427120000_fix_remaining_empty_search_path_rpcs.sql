-- Fix: 42P01 "relation does not exist" errors firing in app RPCs.
--
-- Follows 20260427110000_fix_empty_search_path_rpcs.sql, which fixed
-- get_menu_with_categories and upsert_category_item_override.
--
-- The same misconfiguration is present on every app function listed below:
-- SECURITY DEFINER + `SET search_path = ''` (empty) + unqualified table
-- references in the body. As soon as each is invoked, it fails with 42P01.
--
-- Restore `public` to each function's search_path. Metadata-only — does not
-- modify function bodies. Extension functions (pg_trgm, moddatetime) and
-- functions with explicit non-empty search_paths are deliberately excluded.

-- Categories / menu
ALTER FUNCTION public.get_categories_for_location(uuid, uuid)
  SET search_path = public;
ALTER FUNCTION public.reset_category_item_to_level(uuid, uuid, uuid, uuid, integer)
  SET search_path = public;

-- Orders / order items
ALTER FUNCTION public.add_order_item_v2(
  uuid, uuid, integer, numeric, numeric, text, text, uuid, uuid, text,
  numeric, jsonb, text, integer, integer, uuid, text, uuid
) SET search_path = public;
ALTER FUNCTION public.remove_order_item(uuid)
  SET search_path = public;
ALTER FUNCTION public.calculate_order_totals_fast(uuid)
  SET search_path = public;
ALTER FUNCTION public.ensure_course_exists(uuid, integer)
  SET search_path = public;
ALTER FUNCTION public.broadcast_order_changes()
  SET search_path = public;

-- Payments / refunds
ALTER FUNCTION public.process_payment_v8(
  uuid, text, numeric, numeric, numeric, jsonb, uuid, jsonb,
  integer, integer, boolean, uuid
) SET search_path = public;
ALTER FUNCTION public.void_payment(uuid, text)
  SET search_path = public;
ALTER FUNCTION public.apply_refund_to_payment(
  uuid, numeric, reversal_type, text, text, text, text, text, uuid
) SET search_path = public;
ALTER FUNCTION public.apply_refund_to_payment(
  uuid, numeric, reversal_type, text, text, text, text, text, uuid, boolean
) SET search_path = public;
ALTER FUNCTION public.record_refund_items(uuid, jsonb)
  SET search_path = public;
ALTER FUNCTION public.record_refund_items(uuid, jsonb, boolean)
  SET search_path = public;

-- Cash drawer / EOD
ALTER FUNCTION public.record_cash_operation(
  uuid, uuid, text, numeric, uuid, uuid, uuid, text, uuid
) SET search_path = public;
ALTER FUNCTION public.get_eod_cash_summary(uuid, date)
  SET search_path = public;
ALTER FUNCTION public.get_session_variance_analysis(uuid)
  SET search_path = public;

-- KDS
ALTER FUNCTION public.get_kds_tickets_v2(uuid, text[], uuid)
  SET search_path = public;

-- RLS helper (used inside policies — could silently break access checks)
ALTER FUNCTION public.user_belongs_to_merchant(uuid)
  SET search_path = public;

NOTIFY pgrst, 'reload schema';
