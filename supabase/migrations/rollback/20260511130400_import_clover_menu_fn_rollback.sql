-- Rollback for 20260511130400_import_clover_menu_fn.sql
--
-- Drops the three functions created by the forward migration:
--   - public.import_clover_menu(uuid, jsonb, text, jsonb)        -- main RPC
--   - public._clover_should_overwrite(text, timestamptz, ...)    -- helper
--   - public.compute_merchant_menu_fingerprint(uuid)             -- helper
--
-- NOT applied automatically. Run manually if the forward migration must be
-- reverted. Run BEFORE the dry-runs / columns / indexes rollbacks if doing a
-- full revert — the functions reference those objects.
--
-- Local:  psql "$DATABASE_URL" -f supabase/migrations/rollback/20260511130400_import_clover_menu_fn_rollback.sql
-- Remote: paste into Supabase SQL editor and execute.
--
-- NOTE: Rolling back this function does NOT undo any menu data already
-- imported by callers of import_clover_menu. Imported rows live in
-- menu_items / categories / modifier_groups / modifier_group_items / menus
-- with source_system = 'clover'. To purge them, also run the dry-runs +
-- columns rollbacks (which drop the source_system column and thus erase the
-- "this came from Clover" marker), OR delete those rows manually first.

DROP FUNCTION IF EXISTS public.import_clover_menu(
    uuid,   -- p_dry_run_id
    jsonb,  -- p_target
    text,   -- p_field_update_policy
    jsonb   -- p_flag_resolutions
);

DROP FUNCTION IF EXISTS public._clover_should_overwrite(
    text,         -- p_policy
    timestamptz,  -- p_row_updated_at
    timestamptz,  -- p_last_commit_at
    text          -- p_source_system
);

DROP FUNCTION IF EXISTS public.compute_merchant_menu_fingerprint(uuid);
