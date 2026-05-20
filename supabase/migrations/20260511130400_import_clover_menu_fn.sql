-- =============================================================================
-- Migration: import_clover_menu RPC — atomic commit step of the importer
-- =============================================================================
-- Single PL/pgSQL function that consumes a clover_import_dry_runs row and
-- writes the parsed IR to the merchant's menu domain in one transaction.
--
-- Sequencing (all inside one txn, with statement_timeout=60s, lock_timeout=5s,
-- and a per-merchant pg_advisory_xact_lock that serializes concurrent imports):
--   1. Load + validate the dry-run row (status='pending', not expired,
--      created_by matches the calling Clerk user).
--   2. Recompute the merchant fingerprint; abort with ERR_STALE_PREVIEW if it
--      drifted since preview (the operator must re-preview).
--   3. Resolve the target menu (create or look up by id).
--   4. Upsert categories, modifier_groups, modifier_group_items, menu_items by
--      (merchant_id, source_external_id) where source_system='clover'. The
--      partial unique indexes from R-IMP-0 enforce idempotency.
--   5. Apply FLAG-I resolutions per operator decision (adopt / rename / skip).
--   6. Wire join tables (menu_item_menus, menu_categories, category_items,
--      menu_item_modifier_groups) to the target menu. Re-import case updates
--      display_order rather than inserting a duplicate.
--   7. Mark dry-run row 'committed'; return row counts for the audit log.
--
-- GATE-1 (global scope) is asserted defensively at the top.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.import_clover_menu(
    p_dry_run_id            uuid,
    p_target                jsonb,
    p_field_update_policy   text  DEFAULT 'overwrite_safe',
    p_flag_resolutions      jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_dry_run              public.clover_import_dry_runs%ROWTYPE;
    v_caller_user_id       text;
    v_merchant_id          uuid;
    v_current_fp           text;
    v_target_menu_id       uuid;
    v_target_mode          text;
    v_target_name          text;
    v_target_description   text;
    v_last_commit_at       timestamptz;
    v_payload              jsonb;
    v_flag_res             jsonb;
    v_cat_count            integer := 0;
    v_mg_count             integer := 0;
    v_mgi_count            integer := 0;
    v_item_count           integer := 0;
    v_join_item_menu       integer := 0;
    v_join_menu_cat        integer := 0;
    v_join_cat_item        integer := 0;
    v_join_item_mg         integer := 0;
    v_cat_rec              jsonb;
    v_mg_rec               jsonb;
    v_mgi_rec              jsonb;
    v_item_rec             jsonb;
    v_clover_id            text;
    v_name                 text;
    v_resolution           text;
    v_existing_id          uuid;
    v_new_id               uuid;
    v_parent_mg_id         uuid;
    v_cat_id               uuid;
    v_mg_id                uuid;
    v_price                numeric;
    v_overwrite_allowed    boolean;
BEGIN
    SET LOCAL statement_timeout = '60s';
    SET LOCAL lock_timeout      = '5s';

    -- 1. Load + auth the dry-run row.
    v_caller_user_id := public.current_user_id();
    IF v_caller_user_id IS NULL THEN
        RAISE EXCEPTION 'import_clover_menu: not authenticated' USING ERRCODE = '28000';
    END IF;

    SELECT * INTO v_dry_run
      FROM public.clover_import_dry_runs
     WHERE id = p_dry_run_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'import_clover_menu: dry-run % not found', p_dry_run_id
            USING ERRCODE = 'P0002';
    END IF;

    IF v_dry_run.created_by_clerk_user_id <> v_caller_user_id THEN
        RAISE EXCEPTION 'import_clover_menu: caller is not the dry-run owner'
            USING ERRCODE = '42501';
    END IF;

    IF v_dry_run.status <> 'pending' THEN
        RAISE EXCEPTION 'import_clover_menu: dry-run already in status %', v_dry_run.status
            USING ERRCODE = '22023';
    END IF;

    IF v_dry_run.expires_at < now() THEN
        UPDATE public.clover_import_dry_runs SET status = 'expired' WHERE id = p_dry_run_id;
        RAISE EXCEPTION 'import_clover_menu: dry-run expired at %', v_dry_run.expires_at
            USING ERRCODE = '22023';
    END IF;

    v_merchant_id := v_dry_run.merchant_id;
    v_payload     := v_dry_run.payload;
    v_flag_res    := COALESCE(p_flag_resolutions, '{}'::jsonb);

    -- Serialize concurrent imports against the same merchant.
    PERFORM pg_advisory_xact_lock(hashtext('clover_import:' || v_merchant_id::text));

    -- Field update policy validation.
    IF p_field_update_policy NOT IN ('skip', 'overwrite', 'overwrite_safe') THEN
        RAISE EXCEPTION 'import_clover_menu: invalid field_update_policy %', p_field_update_policy
            USING ERRCODE = '22023';
    END IF;

    -- GATE-1 defense in depth: payload must not carry location_id.
    IF (v_payload ? 'location_id') AND (v_payload->>'location_id') IS NOT NULL THEN
        RAISE EXCEPTION 'import_clover_menu: GATE-1 violation — location-scoped imports are not allowed'
            USING ERRCODE = '42501';
    END IF;

    -- 2. Fingerprint staleness guard.
    SELECT md5(COALESCE(string_agg(t.k || ':' || t.v, '|' ORDER BY t.k), ''))
      INTO v_current_fp
      FROM (
          SELECT id::text AS k, COALESCE(updated_at::text, '') AS v
            FROM public.menu_items WHERE merchant_id = v_merchant_id
          UNION ALL
          SELECT id::text, COALESCE(updated_at::text, '') FROM public.categories WHERE merchant_id = v_merchant_id
          UNION ALL
          SELECT id::text, COALESCE(updated_at::text, '') FROM public.modifier_groups WHERE merchant_id = v_merchant_id
      ) t;

    IF v_current_fp IS DISTINCT FROM v_dry_run.fingerprint THEN
        RAISE EXCEPTION 'ERR_STALE_PREVIEW: merchant menu changed between preview and commit'
            USING ERRCODE = '40001', HINT = 'Re-run preview and try again.';
    END IF;

    -- Last clover commit timestamp — used by overwrite_safe to decide whether a
    -- row has been manually edited since the previous import.
    SELECT MAX(committed_at) INTO v_last_commit_at
      FROM public.clover_import_dry_runs
     WHERE merchant_id = v_merchant_id
       AND status      = 'committed';

    -- 3. Resolve target menu.
    v_target_mode        := COALESCE(p_target->>'mode', '');
    v_target_name        := NULLIF(trim(p_target->>'name'), '');
    v_target_description := NULLIF(trim(p_target->>'description'), '');

    IF v_target_mode = 'existing' THEN
        v_target_menu_id := NULLIF(p_target->>'menu_id', '')::uuid;
        IF v_target_menu_id IS NULL THEN
            RAISE EXCEPTION 'import_clover_menu: GATE-6 — target.menu_id required when mode=existing'
                USING ERRCODE = '22023';
        END IF;

        PERFORM 1 FROM public.menus
          WHERE id = v_target_menu_id AND merchant_id = v_merchant_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'import_clover_menu: target menu % does not belong to merchant', v_target_menu_id
                USING ERRCODE = '42501';
        END IF;
    ELSIF v_target_mode = 'create' THEN
        IF v_target_name IS NULL THEN
            RAISE EXCEPTION 'import_clover_menu: GATE-6 — target.name required when mode=create'
                USING ERRCODE = '22023';
        END IF;

        IF EXISTS (
            SELECT 1 FROM public.menus
             WHERE merchant_id = v_merchant_id AND lower(name) = lower(v_target_name)
        ) THEN
            RAISE EXCEPTION 'import_clover_menu: menu name "%" already exists for merchant', v_target_name
                USING ERRCODE = '23505';
        END IF;

        INSERT INTO public.menus (
            merchant_id, name, description, is_active, created_by, source_system
        ) VALUES (
            v_merchant_id, v_target_name, v_target_description, true, v_caller_user_id, 'clover'
        )
        RETURNING id INTO v_target_menu_id;
    ELSE
        RAISE EXCEPTION 'import_clover_menu: GATE-6 — target.mode must be ''existing'' or ''create''  (got: %)', v_target_mode
            USING ERRCODE = '22023';
    END IF;

    -- Working maps (clover_id -> uuid). Kept ON COMMIT DROP since the txn
    -- envelops this whole function.
    CREATE TEMP TABLE _clover_cat_map (clover_id text PRIMARY KEY, db_id uuid NOT NULL) ON COMMIT DROP;
    CREATE TEMP TABLE _clover_mg_map  (clover_id text PRIMARY KEY, db_id uuid NOT NULL) ON COMMIT DROP;
    CREATE TEMP TABLE _clover_item_map(clover_id text PRIMARY KEY, db_id uuid NOT NULL) ON COMMIT DROP;

    -- 4a. Upsert categories.
    FOR v_cat_rec IN SELECT * FROM jsonb_array_elements(COALESCE(v_payload->'ir'->'categories', '[]'::jsonb))
    LOOP
        v_clover_id := v_cat_rec->>'clover_id';
        v_name      := v_cat_rec->>'name';
        v_resolution := NULL;

        -- Existing clover-owned row?
        SELECT id INTO v_existing_id
          FROM public.categories
         WHERE merchant_id = v_merchant_id
           AND source_system = 'clover'
           AND source_external_id = v_clover_id;

        IF v_existing_id IS NOT NULL THEN
            v_overwrite_allowed := _clover_should_overwrite(
                p_field_update_policy,
                (SELECT updated_at FROM public.categories WHERE id = v_existing_id),
                v_last_commit_at,
                'clover'
            );
            IF v_overwrite_allowed THEN
                UPDATE public.categories
                   SET name          = v_name,
                       display_order = COALESCE((v_cat_rec->>'display_order')::int, display_order),
                       updated_at    = now()
                 WHERE id = v_existing_id;
            END IF;
            INSERT INTO _clover_cat_map(clover_id, db_id) VALUES (v_clover_id, v_existing_id);
        ELSE
            -- FLAG-I path: look up operator resolution by name.
            SELECT (r->>'resolution') INTO v_resolution
              FROM jsonb_array_elements(COALESCE(v_flag_res->'flag_i', '[]'::jsonb)) r
             WHERE r->>'entity_type' = 'category' AND lower(r->>'name') = lower(v_name)
             LIMIT 1;

            IF v_resolution = 'adopt' THEN
                SELECT id INTO v_existing_id
                  FROM public.categories
                 WHERE merchant_id = v_merchant_id
                   AND lower(name) = lower(v_name)
                   AND (source_system IS NULL OR source_system <> 'clover')
                 LIMIT 1;

                IF v_existing_id IS NOT NULL THEN
                    UPDATE public.categories
                       SET source_system      = 'clover',
                           source_external_id = v_clover_id,
                           updated_at         = now()
                     WHERE id = v_existing_id;
                    INSERT INTO _clover_cat_map(clover_id, db_id) VALUES (v_clover_id, v_existing_id);
                    CONTINUE;
                END IF;
            END IF;

            INSERT INTO public.categories (
                merchant_id, name, display_order, is_global, source_system, source_external_id, created_by
            ) VALUES (
                v_merchant_id,
                CASE WHEN v_resolution = 'rename' THEN v_name || ' (Clover)' ELSE v_name END,
                NULLIF(v_cat_rec->>'display_order', '')::int,
                true,
                'clover',
                v_clover_id,
                v_caller_user_id
            )
            RETURNING id INTO v_new_id;
            INSERT INTO _clover_cat_map(clover_id, db_id) VALUES (v_clover_id, v_new_id);
            v_cat_count := v_cat_count + 1;
        END IF;
    END LOOP;

    -- 4b. Upsert modifier_groups (same shape as categories).
    FOR v_mg_rec IN SELECT * FROM jsonb_array_elements(COALESCE(v_payload->'ir'->'modifier_groups', '[]'::jsonb))
    LOOP
        v_clover_id := v_mg_rec->>'clover_id';
        v_name      := v_mg_rec->>'name';
        v_resolution := NULL;

        SELECT id INTO v_existing_id
          FROM public.modifier_groups
         WHERE merchant_id = v_merchant_id
           AND source_system = 'clover'
           AND source_external_id = v_clover_id;

        IF v_existing_id IS NOT NULL THEN
            v_overwrite_allowed := _clover_should_overwrite(
                p_field_update_policy,
                (SELECT updated_at FROM public.modifier_groups WHERE id = v_existing_id),
                v_last_commit_at,
                'clover'
            );
            IF v_overwrite_allowed THEN
                UPDATE public.modifier_groups
                   SET name           = v_name,
                       is_required    = COALESCE((v_mg_rec->>'is_required')::bool, is_required),
                       min_selections = COALESCE((v_mg_rec->>'min_selections')::int, min_selections),
                       max_selections = COALESCE((v_mg_rec->>'max_selections')::int, max_selections),
                       updated_at     = now()
                 WHERE id = v_existing_id;
            END IF;
            INSERT INTO _clover_mg_map(clover_id, db_id) VALUES (v_clover_id, v_existing_id);
        ELSE
            SELECT (r->>'resolution') INTO v_resolution
              FROM jsonb_array_elements(COALESCE(v_flag_res->'flag_i', '[]'::jsonb)) r
             WHERE r->>'entity_type' = 'modifier_group' AND lower(r->>'name') = lower(v_name)
             LIMIT 1;

            IF v_resolution = 'adopt' THEN
                SELECT id INTO v_existing_id
                  FROM public.modifier_groups
                 WHERE merchant_id = v_merchant_id
                   AND lower(name) = lower(v_name)
                   AND (source_system IS NULL OR source_system <> 'clover')
                 LIMIT 1;

                IF v_existing_id IS NOT NULL THEN
                    UPDATE public.modifier_groups
                       SET source_system      = 'clover',
                           source_external_id = v_clover_id,
                           updated_at         = now()
                     WHERE id = v_existing_id;
                    INSERT INTO _clover_mg_map(clover_id, db_id) VALUES (v_clover_id, v_existing_id);
                    CONTINUE;
                END IF;
            END IF;

            INSERT INTO public.modifier_groups (
                merchant_id, name, is_required, min_selections, max_selections,
                source_system, source_external_id
            ) VALUES (
                v_merchant_id,
                CASE WHEN v_resolution = 'rename' THEN v_name || ' (Clover)' ELSE v_name END,
                COALESCE((v_mg_rec->>'is_required')::bool, false),
                COALESCE((v_mg_rec->>'min_selections')::int, 0),
                NULLIF(v_mg_rec->>'max_selections', '')::int,
                'clover',
                v_clover_id
            )
            RETURNING id INTO v_new_id;
            INSERT INTO _clover_mg_map(clover_id, db_id) VALUES (v_clover_id, v_new_id);
            v_mg_count := v_mg_count + 1;
        END IF;

        v_parent_mg_id := (SELECT db_id FROM _clover_mg_map WHERE clover_id = v_clover_id);

        -- 4c. Upsert modifier_group_items.
        FOR v_mgi_rec IN SELECT * FROM jsonb_array_elements(COALESCE(v_mg_rec->'items', '[]'::jsonb))
        LOOP
            SELECT id INTO v_existing_id
              FROM public.modifier_group_items
             WHERE merchant_id = v_merchant_id
               AND source_system = 'clover'
               AND source_external_id = (v_mgi_rec->>'clover_id');

            IF v_existing_id IS NOT NULL THEN
                v_overwrite_allowed := _clover_should_overwrite(
                    p_field_update_policy,
                    (SELECT updated_at FROM public.modifier_group_items WHERE id = v_existing_id),
                    v_last_commit_at,
                    'clover'
                );
                IF v_overwrite_allowed THEN
                    UPDATE public.modifier_group_items
                       SET name           = v_mgi_rec->>'name',
                           price_modifier = COALESCE((v_mgi_rec->>'price_modifier')::numeric, price_modifier),
                           updated_at     = now()
                     WHERE id = v_existing_id;
                END IF;
            ELSE
                INSERT INTO public.modifier_group_items (
                    modifier_group_id, merchant_id, name, price_modifier,
                    source_system, source_external_id
                ) VALUES (
                    v_parent_mg_id, v_merchant_id,
                    v_mgi_rec->>'name',
                    COALESCE((v_mgi_rec->>'price_modifier')::numeric, 0),
                    'clover',
                    v_mgi_rec->>'clover_id'
                );
                v_mgi_count := v_mgi_count + 1;
            END IF;
        END LOOP;
    END LOOP;

    -- 4d. Upsert menu_items.
    FOR v_item_rec IN SELECT * FROM jsonb_array_elements(COALESCE(v_payload->'ir'->'items', '[]'::jsonb))
    LOOP
        v_clover_id := v_item_rec->>'clover_id';
        v_name      := v_item_rec->>'name';
        v_price     := COALESCE(NULLIF(v_item_rec->>'price', '')::numeric, 0);

        SELECT id INTO v_existing_id
          FROM public.menu_items
         WHERE merchant_id = v_merchant_id
           AND source_system = 'clover'
           AND source_external_id = v_clover_id;

        IF v_existing_id IS NOT NULL THEN
            v_overwrite_allowed := _clover_should_overwrite(
                p_field_update_policy,
                (SELECT updated_at FROM public.menu_items WHERE id = v_existing_id),
                v_last_commit_at,
                'clover'
            );
            IF v_overwrite_allowed THEN
                UPDATE public.menu_items
                   SET name          = v_name,
                       price         = v_price,
                       availability  = COALESCE((v_item_rec->>'availability')::bool, availability),
                       is_tax_exempt = COALESCE((v_item_rec->>'is_tax_exempt')::bool, is_tax_exempt),
                       description   = COALESCE(v_item_rec->>'description', description),
                       updated_at    = now()
                 WHERE id = v_existing_id;
            END IF;
            INSERT INTO _clover_item_map(clover_id, db_id) VALUES (v_clover_id, v_existing_id);
        ELSE
            INSERT INTO public.menu_items (
                merchant_id, name, price, availability, is_tax_exempt, description,
                source_system, source_external_id
            ) VALUES (
                v_merchant_id, v_name, v_price,
                COALESCE((v_item_rec->>'availability')::bool, true),
                COALESCE((v_item_rec->>'is_tax_exempt')::bool, false),
                v_item_rec->>'description',
                'clover',
                v_clover_id
            )
            RETURNING id INTO v_new_id;
            INSERT INTO _clover_item_map(clover_id, db_id) VALUES (v_clover_id, v_new_id);
            v_item_count := v_item_count + 1;
        END IF;
    END LOOP;

    -- 5. Wire joins to the target menu.
    -- These tables have no unique constraints on their natural keys today, so
    -- we hand-roll SELECT → UPDATE/INSERT rather than relying on ON CONFLICT.
    -- The category_items branch *does* have a partial unique index (added in
    -- R-IMP-0 indexes), but we use the same pattern for consistency.

    FOR v_item_rec IN SELECT * FROM jsonb_array_elements(COALESCE(v_payload->'ir'->'items', '[]'::jsonb))
    LOOP
        SELECT db_id INTO v_new_id FROM _clover_item_map WHERE clover_id = v_item_rec->>'clover_id';

        -- menu_item_menus: one row per (item, target_menu).
        IF EXISTS (
            SELECT 1 FROM public.menu_item_menus
             WHERE menu_item_id = v_new_id AND menu_id = v_target_menu_id
        ) THEN
            UPDATE public.menu_item_menus
               SET display_order = COALESCE(NULLIF(v_item_rec->>'display_order', '')::int, display_order),
                   updated_at    = now()
             WHERE menu_item_id = v_new_id AND menu_id = v_target_menu_id;
        ELSE
            INSERT INTO public.menu_item_menus (menu_item_id, menu_id, merchant_id, is_available, display_order)
            VALUES (
                v_new_id, v_target_menu_id, v_merchant_id, true,
                NULLIF(v_item_rec->>'display_order', '')::int
            );
        END IF;
        v_join_item_menu := v_join_item_menu + 1;

        -- category_items: L2 membership rows (menu_id IS NULL).
        -- get_menu_with_categories only reads WHERE menu_id IS NULL to build
        -- the item list; menu_id IS NOT NULL rows are L4 pricing-only.
        FOR v_cat_rec IN SELECT * FROM jsonb_array_elements(COALESCE(v_item_rec->'category_clover_ids', '[]'::jsonb))
        LOOP
            SELECT db_id INTO v_cat_id FROM _clover_cat_map WHERE clover_id = (v_cat_rec #>> '{}');
            CONTINUE WHEN v_cat_id IS NULL;

            IF EXISTS (
                SELECT 1 FROM public.category_items
                 WHERE merchant_id  = v_merchant_id
                   AND menu_id      IS NULL
                   AND category_id  = v_cat_id
                   AND menu_item_id = v_new_id
            ) THEN
                UPDATE public.category_items
                   SET display_order = COALESCE(NULLIF(v_item_rec->>'display_order', '')::int, display_order),
                       updated_at    = now()
                 WHERE merchant_id  = v_merchant_id
                   AND menu_id      IS NULL
                   AND category_id  = v_cat_id
                   AND menu_item_id = v_new_id;
            ELSE
                INSERT INTO public.category_items (menu_item_id, category_id, merchant_id, menu_id, display_order, created_at, updated_at)
                VALUES (
                    v_new_id, v_cat_id, v_merchant_id, NULL,
                    NULLIF(v_item_rec->>'display_order', '')::int,
                    now(), now()
                );
            END IF;
            v_join_cat_item := v_join_cat_item + 1;
        END LOOP;

        -- menu_item_modifier_groups: one row per (item, mg). Global binding,
        -- not scoped to a menu.
        FOR v_mg_rec IN SELECT * FROM jsonb_array_elements(COALESCE(v_item_rec->'modifier_group_clover_ids', '[]'::jsonb))
        LOOP
            SELECT db_id INTO v_mg_id FROM _clover_mg_map WHERE clover_id = (v_mg_rec #>> '{}');
            CONTINUE WHEN v_mg_id IS NULL;

            IF NOT EXISTS (
                SELECT 1 FROM public.menu_item_modifier_groups
                 WHERE menu_item_id = v_new_id AND modifier_group_id = v_mg_id
            ) THEN
                INSERT INTO public.menu_item_modifier_groups (menu_item_id, modifier_group_id, merchant_id)
                VALUES (v_new_id, v_mg_id, v_merchant_id);
                v_join_item_mg := v_join_item_mg + 1;
            END IF;
        END LOOP;
    END LOOP;

    -- menu_categories: one row per (target_menu, category).
    FOR v_cat_rec IN SELECT * FROM jsonb_array_elements(COALESCE(v_payload->'ir'->'categories', '[]'::jsonb))
    LOOP
        SELECT db_id INTO v_cat_id FROM _clover_cat_map WHERE clover_id = v_cat_rec->>'clover_id';
        CONTINUE WHEN v_cat_id IS NULL;

        IF EXISTS (
            SELECT 1 FROM public.menu_categories
             WHERE menu_id = v_target_menu_id AND category_id = v_cat_id
        ) THEN
            UPDATE public.menu_categories
               SET display_order = COALESCE(NULLIF(v_cat_rec->>'display_order', '')::int, display_order),
                   updated_at    = now()
             WHERE menu_id = v_target_menu_id AND category_id = v_cat_id;
        ELSE
            INSERT INTO public.menu_categories (menu_id, category_id, merchant_id, is_active, display_order)
            VALUES (
                v_target_menu_id, v_cat_id, v_merchant_id, true,
                NULLIF(v_cat_rec->>'display_order', '')::int
            );
        END IF;
        v_join_menu_cat := v_join_menu_cat + 1;
    END LOOP;

    -- 6. Mark the dry-run committed.
    UPDATE public.clover_import_dry_runs
       SET status       = 'committed',
           committed_at = now()
     WHERE id = p_dry_run_id;

    RETURN jsonb_build_object(
        'target_menu_id',     v_target_menu_id,
        'created_categories', v_cat_count,
        'created_modifier_groups', v_mg_count,
        'created_modifier_group_items', v_mgi_count,
        'created_items',      v_item_count,
        'joined_item_menus',  v_join_item_menu,
        'joined_menu_categories', v_join_menu_cat,
        'joined_category_items',  v_join_cat_item,
        'joined_item_modifier_groups', v_join_item_mg
    );
END;
$$;


-- Helper: per-row "is overwriting safe right now" check. The merchant-level
-- last_clover_commit_at is the threshold: a row updated *after* that timestamp
-- has been manually edited since the previous import, so overwrite_safe leaves
-- it alone. Always overwrite for clover-owned new rows (no prior import).
CREATE OR REPLACE FUNCTION public._clover_should_overwrite(
    p_policy         text,
    p_row_updated_at timestamptz,
    p_last_commit_at timestamptz,
    p_source_system  text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE p_policy
        WHEN 'overwrite' THEN true
        WHEN 'skip'      THEN false
        WHEN 'overwrite_safe' THEN
            -- Never overwrite rows that have been manually edited since the
            -- previous clover commit. If no prior commit exists yet, treat as
            -- safe-to-overwrite for clover-owned rows.
            p_last_commit_at IS NULL
            OR p_row_updated_at <= p_last_commit_at
        ELSE false
    END;
$$;


REVOKE ALL    ON FUNCTION public.import_clover_menu(uuid, jsonb, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.import_clover_menu(uuid, jsonb, text, jsonb) TO authenticated;

COMMENT ON FUNCTION public.import_clover_menu(uuid, jsonb, text, jsonb) IS
    'Commit step of the Clover Menu Importer. Consumes a clover_import_dry_runs row and writes the parsed IR to the merchant menu domain atomically. Idempotent by (merchant_id, source_external_id) on the five R-IMP-0 tables.';


-- Standalone fingerprint helper. Same shape as the inline computation inside
-- import_clover_menu; called from the preview server action to snapshot the
-- merchant menu state at preview time.
CREATE OR REPLACE FUNCTION public.compute_merchant_menu_fingerprint(p_merchant_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
    SELECT md5(COALESCE(string_agg(t.k || ':' || t.v, '|' ORDER BY t.k), ''))
      FROM (
          SELECT id::text AS k, COALESCE(updated_at::text, '') AS v
            FROM public.menu_items WHERE merchant_id = p_merchant_id
          UNION ALL
          SELECT id::text, COALESCE(updated_at::text, '') FROM public.categories WHERE merchant_id = p_merchant_id
          UNION ALL
          SELECT id::text, COALESCE(updated_at::text, '') FROM public.modifier_groups WHERE merchant_id = p_merchant_id
      ) t;
$$;

REVOKE ALL    ON FUNCTION public.compute_merchant_menu_fingerprint(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compute_merchant_menu_fingerprint(uuid) TO authenticated, service_role;
