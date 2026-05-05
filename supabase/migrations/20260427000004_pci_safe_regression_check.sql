-- A13: Regression check that fails if any export RPC references a PCI-tagged
-- column or the raw `order_payments` table.
--
-- Run in CI:
--   psql "$DATABASE_URL" -c "SELECT public.assert_pci_safe_exports();"
--
-- Returns void on success, RAISE EXCEPTION on violation.

CREATE OR REPLACE FUNCTION public.assert_pci_safe_exports()
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_fn_name text;
  v_fn_src text;
  v_violations text[] := ARRAY[]::text[];
  v_pci_columns text[];
  v_col text;
BEGIN
  -- Pull every column tagged @pci-sensitive from pg_description.
  SELECT COALESCE(array_agg(a.attname), ARRAY[]::text[])
  INTO v_pci_columns
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_description d ON d.objoid = a.attrelid AND d.objsubid = a.attnum
  WHERE n.nspname = 'public'
    AND c.relname = 'order_payments'
    AND a.attnum > 0
    AND NOT a.attisdropped
    AND d.description LIKE '%@pci-sensitive%';

  -- For every registered export function, inspect its source.
  FOR v_fn_name IN
    SELECT function_name FROM public.pci_export_function_registry
  LOOP
    SELECT prosrc INTO v_fn_src
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = v_fn_name
    LIMIT 1;

    IF v_fn_src IS NULL THEN
      v_violations := v_violations || format('Registered export function %I does not exist.', v_fn_name);
      CONTINUE;
    END IF;

    -- Disallow direct reference to the raw table when a pci_safe_* view exists.
    -- Word-boundary match so "order_payments_id" wouldn't trip it; we look for
    -- " order_payments" or "(order_payments" or "public.order_payments" etc.
    IF v_fn_src ~* '(^|[^a-z_])order_payments([^a-z_0-9]|$)'
       AND v_fn_src !~* 'pci_safe_order_payments' THEN
      v_violations := v_violations || format(
        'Export function %I references public.order_payments directly. Use public.pci_safe_order_payments.',
        v_fn_name
      );
    END IF;

    -- Disallow any reference to a tagged column name.
    FOREACH v_col IN ARRAY v_pci_columns LOOP
      IF v_fn_src ~* ('(^|[^a-z_])' || v_col || '([^a-z_0-9]|$)') THEN
        v_violations := v_violations || format(
          'Export function %I references PCI-sensitive column %I. Remove or relocate to pci_safe_* view.',
          v_fn_name, v_col
        );
      END IF;
    END LOOP;
  END LOOP;

  IF array_length(v_violations, 1) > 0 THEN
    RAISE EXCEPTION E'PCI-safe export check failed:\n  - %', array_to_string(v_violations, E'\n  - ');
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assert_pci_safe_exports() TO authenticated, service_role;

COMMENT ON FUNCTION public.assert_pci_safe_exports() IS
  'A13 regression check: fails if any registered export function references the raw order_payments table or a @pci-sensitive column. Run in CI.';

-- Run the check now so a faulty migration fails fast at deploy time.
DO $$
BEGIN
  PERFORM public.assert_pci_safe_exports();
END $$;
