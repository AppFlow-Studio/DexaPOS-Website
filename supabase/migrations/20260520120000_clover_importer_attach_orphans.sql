-- =============================================================================
-- Migration: import_clover_menu — rescue orphan items into "Unsorted (Clover)"
-- =============================================================================
-- The original import_clover_menu RPC inserted any item whose Clover record
-- had no resolvable category into menu_items but never wrote a category_items
-- row for it. get_menu_with_categories filters items via category_items, so
-- those items rendered as invisible — the "categories present, no items
-- inside" symptom on the Bora Bora café.
--
-- This migration replaces the function with a version that, after wiring
-- known item↔category joins, finds any imported item still missing a
-- category_items row on the target menu and links it to an auto-created
-- "Unsorted (Clover)" category. The category is itself wired to the target
-- menu via menu_categories. The result jsonb gains `orphan_items_attached`
-- and `unsorted_category_id` so HQ can see exactly what happened.
--
-- Function body is otherwise identical to 20260511130400 except for the new
-- block (5b. Orphan rescue) and the additional return fields.
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
    v_orphan_attached      integer := 0;
    v_unsorted_cat_id      uuid;
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

    PERFORM pg_advisory_xact_lock(hashtext('clover_import:' || v_merchant_id::text));

    IF p_field_update_policy NOT IN ('skip', 'overwrite', 'overwrite_safe') THEN
        RAISE EXCEPTION 'import_clover_menu: invalid field_update_policy %', p_field_update_policy
            USING ERRCODE = '22023';
    END IF;

    IF (v_payload ? 'location_id') AND (v_payload->>'location_id') IS NOT NULL THEN
        RAISE EXCEPTION 'import_clover_menu: GATE-1 violation — location-scoped imports are not allowed'
            USING ERRCODE = '42501';
    END IF;

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

    SELECT MAX(committed_at) INTO v_last_commit_at
      FROM public.clover_import_dry_runs
     WHERE merchant_id = v_merchant_id
       AND status      = 'committed';

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

    CREATE TEMP TABLE _clover_cat_map (clover_id text PRIMARY KEY, db_id uuid NOT NULL) ON COMMIT DROP;
    CREATE TEMP TABLE _clover_mg_map  (clover_id text PRIMARY KEY, db_id uuid NOT NULL) ON COMMIT DROP;
    CREATE TEMP TABLE _clover_item_map(clover_id text PRIMARY KEY, db_id uuid NOT NULL) ON COMMIT DROP;

    FOR v_cat_rec IN SELECT * FROM jsonb_array_elements(COALESCE(v_payload->'ir'->'categories', '[]'::jsonb))
    LOOP
        v_clover_id := v_cat_rec->>'clover_id';
        v_name      := v_cat_rec->>'name';
        v_resolution := NULL;

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

    FOR v_item_rec IN SELECT * FROM jsonb_array_elements(COALESCE(v_payload->'ir'->'items', '[]'::jsonb))
    LOOP
        SELECT db_id INTO v_new_id FROM _clover_item_map WHERE clover_id = v_item_rec->>'clover_id';

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

    -- 5b. ORPHAN RESCUE
    -- Any item we just inserted/updated that has no category_items row on the
    -- target menu would render as invisible. Auto-attach to "Unsorted (Clover)"
    -- so the operator can find and re-classify it instead of losing it.
    SELECT COUNT(*) INTO v_orphan_attached
      FROM _clover_item_map cim
     WHERE NOT EXISTS (
         SELECT 1
           FROM public.category_items ci
           JOIN public.menu_categories mc
             ON mc.category_id = ci.category_id
            AND mc.menu_id     = v_target_menu_id
          WHERE ci.menu_item_id = cim.db_id
            AND ci.menu_id      IS NULL
            AND ci.merchant_id  = v_merchant_id
     );

    IF v_orphan_attached > 0 THEN
        -- Reuse existing Unsorted bucket for this merchant if one is already
        -- present (idempotent across re-imports); otherwise create it.
        SELECT id INTO v_unsorted_cat_id
          FROM public.categories
         WHERE merchant_id = v_merchant_id
           AND source_system = 'clover'
           AND source_external_id = '__clover_unsorted__'
         LIMIT 1;

        IF v_unsorted_cat_id IS NULL THEN
            INSERT INTO public.categories (
                merchant_id, name, display_order, is_global,
                source_system, source_external_id, created_by
            ) VALUES (
                v_merchant_id, 'Unsorted (Clover)', 9999, true,
                'clover', '__clover_unsorted__', v_caller_user_id
            )
            RETURNING id INTO v_unsorted_cat_id;
            v_cat_count := v_cat_count + 1;
        END IF;

        -- Wire Unsorted to the target menu.
        IF NOT EXISTS (
            SELECT 1 FROM public.menu_categories
             WHERE menu_id = v_target_menu_id AND category_id = v_unsorted_cat_id
        ) THEN
            INSERT INTO public.menu_categories (menu_id, category_id, merchant_id, is_active, display_order)
            VALUES (v_target_menu_id, v_unsorted_cat_id, v_merchant_id, true, 9999);
            v_join_menu_cat := v_join_menu_cat + 1;
        END IF;

        -- Link every orphan item to Unsorted with a single set-based insert.
        INSERT INTO public.category_items (
            menu_item_id, category_id, merchant_id, menu_id,
            display_order, created_at, updated_at
        )
        SELECT cim.db_id, v_unsorted_cat_id, v_merchant_id, NULL, NULL, now(), now()
          FROM _clover_item_map cim
         WHERE NOT EXISTS (
             SELECT 1
               FROM public.category_items ci
               JOIN public.menu_categories mc
                 ON mc.category_id = ci.category_id
                AND mc.menu_id     = v_target_menu_id
              WHERE ci.menu_item_id = cim.db_id
                AND ci.menu_id      IS NULL
                AND ci.merchant_id  = v_merchant_id
         );

        v_join_cat_item := v_join_cat_item + v_orphan_attached;
    END IF;

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
        'joined_item_modifier_groups', v_join_item_mg,
        'orphan_items_attached', v_orphan_attached,
        'unsorted_category_id',  v_unsorted_cat_id
    );
END;
$$;

COMMENT ON FUNCTION public.import_clover_menu(uuid, jsonb, text, jsonb) IS
    'Commit step of the Clover Menu Importer. Consumes a clover_import_dry_runs row and writes the parsed IR to the merchant menu domain atomically. Idempotent by (merchant_id, source_external_id) on the five R-IMP-0 tables. Items missing a category are auto-attached to an "Unsorted (Clover)" category so they remain visible to operators (see orphan_items_attached/unsorted_category_id in the return jsonb).';
