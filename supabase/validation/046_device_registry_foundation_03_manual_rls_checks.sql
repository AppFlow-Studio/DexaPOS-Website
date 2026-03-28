-- ============================================================================
-- Device Registry Foundation Validation
-- Part 3: Manual RLS Checks
-- Run each section from a real authenticated context for that user type
-- ============================================================================

-- HQ session expectations:
-- - can see all rows
-- - can insert/update/delete on device_inventory
-- - can insert into append-only tables
SELECT COUNT(*) AS inventory_count
FROM public.device_inventory;

SELECT COUNT(*) AS assignment_count
FROM public.device_assignments;

SELECT COUNT(*) AS note_count
FROM public.device_notes;

-- Carrier session expectations:
-- - only merchant_ids belonging to that carrier
-- - read-only access
SELECT DISTINCT merchant_id
FROM public.device_inventory
ORDER BY merchant_id;

SELECT *
FROM public.device_inventory
ORDER BY created_at DESC
LIMIT 20;

SELECT *
FROM public.device_assignments
ORDER BY assigned_at DESC
LIMIT 20;

-- Merchant owner/admin session expectations:
-- - only that merchant's device rows
-- - read-only access
SELECT DISTINCT merchant_id
FROM public.device_inventory
ORDER BY merchant_id;

SELECT *
FROM public.device_inventory
ORDER BY created_at DESC
LIMIT 20;

SELECT *
FROM public.device_notes
ORDER BY created_at DESC
LIMIT 20;
