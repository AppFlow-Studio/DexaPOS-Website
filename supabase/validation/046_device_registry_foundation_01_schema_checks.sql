-- ============================================================================
-- Device Registry Foundation Validation
-- Part 1: Schema Checks
-- ============================================================================

SELECT
  t.table_name
FROM information_schema.tables t
WHERE t.table_schema = 'public'
  AND t.table_name IN (
    'device_catalog',
    'device_inventory',
    'device_assignments',
    'device_config_history',
    'device_notes'
  )
ORDER BY t.table_name;

SELECT
  routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'assign_device';

SELECT
  schemaname,
  tablename,
  policyname,
  cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'device_inventory',
    'device_assignments',
    'device_config_history',
    'device_notes'
  )
ORDER BY tablename, policyname;

SELECT *
FROM public.admin_device_summary
ORDER BY device_category, manufacturer, model_name, status
LIMIT 20;
