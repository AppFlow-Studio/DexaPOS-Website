-- =============================================================================
-- SECURITY FIX — missing authorization check on
--                get_floor_plan_objects_with_sessions, plus pinned search_path
-- =============================================================================
-- SPLIT OUT OF WAVE 5; SHIPS INDEPENDENTLY, AHEAD OF ALL PERFORMANCE WORK.
--   Separated because (a) this closes a LIVE, DEMONSTRATED tenant-isolation
--   bypass present on both staging and prod, and (b) its former partner
--   20260815160000_wave5_index_cleanup.sql can never run under
--   `supabase db push` -- DROP INDEX CONCURRENTLY cannot execute inside the
--   transaction db push wraps each migration in -- so shipping them together
--   would have blocked a security fix behind an unpushable migration.
--
-- THE BYPASS, DEMONSTRATED ON STAGING 2026-08-13 (not inferred):
--   Using a principal with NO membership -- one that provably returns 0 rows
--   from orders / order_items / order_item_modifiers under RLS:
--     select count(*) from get_floor_plan_objects_with_sessions('<any fp_id>');
--       -> 6                                                    LEAKED
--     select get_floor_plan('<same fp_id>');
--       -> ERROR: Floor plan not found or access denied   (sibling is correct)
--   Leaked per row: guest_name, party_size, order_id, server_staff_id,
--   session_status, seated_at, plus full table geometry. Any authenticated
--   account on the platform could read any merchant's live floor and seating
--   state given only a floor-plan UUID.
--
--   Regression risk is minimal: the function has NO runtime caller in either
--   repo -- it appears only in generated database.types.ts. Effectively dead
--   code left as an open door.
--
--   Fix verified by applying this file inside BEGIN ... ROLLBACK on staging:
--   the same unauthorized call then returns
--   'Floor plan not found or access denied'.
-- =============================================================================
-- Source: POS DB Performance Waves (Dexa-POS docs/engineering/performance/
--         db-perf-waves-2026-08-13.md). Catalog verified read-only against
--         PROD (hifouuofcaytijrkbvcy) on 2026-08-14, and INDEPENDENTLY
--         re-verified the same day: all three reference md5/length pairs below
--         re-computed and matched exactly; prosecdef/proconfig/proacl re-read;
--         the #1 body re-fetched and diffed line-by-line against the
--         CREATE OR REPLACE in this file (verbatim apart from the four
--         documented changes); get_categories_for_location re-scanned for
--         cross-schema references (auth/extensions/storage/vault/pg_catalog:
--         all zero); and both RECURRENCE migrations re-confirmed present in
--         supabase_migrations.schema_migrations with the control-group pair
--         still pinned.
--
-- WHY A SECURITY FIX SHIPS INSIDE THE PERFORMANCE PROGRAM
--   A SECURITY DEFINER function runs with the privileges of its OWNER. All
--   three functions here are owned by `postgres`, which is a superuser and
--   bypasses RLS on every table in the database.
--
--   A SECURITY DEFINER function with a MUTABLE search_path is a privilege-
--   escalation vector, not a style nit. The function body resolves unqualified
--   names against whatever search_path the CALLER supplies. Anyone who can
--   create objects in a schema that lands earlier in that search_path can
--   shadow a table or -- much worse -- a FUNCTION that the body relies on, and
--   have their version execute as the owner. `postgres`.
--
--   That is not abstract here. get_floor_plan's ENTIRE authorization decision
--   is two unqualified function calls:
--
--       AND fp.merchant_id = user_merchant_id()
--       AND fp.location_id = ANY(user_location_ids())
--
--   Shadow `user_merchant_id()` and the authorization check returns whatever
--   the attacker wants it to return. The guard IS the attack surface. Pinning
--   search_path is what makes that guard mean anything.
--
--   It rides with the performance work because Waves 1-4 are already rewriting
--   this exact family of RPCs, the audit surfaced all three in the same pass,
--   and the house convention (every function SET search_path TO 'public',
--   'pg_temp') was already being applied to the functions those waves touch.
--   Leaving three known-unsafe neighbours behind would be arbitrary.
--
-- =============================================================================
-- THE THREE DEFECTS
-- =============================================================================
--
-- 1. public.get_floor_plan_objects_with_sessions(uuid)          *** CRITICAL ***
--      prosecdef = true, proconfig = NULL, NO authorization check of any kind.
--      ACL: {=X/postgres, anon=X, authenticated=X, service_role=X}
--
--      `=X/postgres` is the grant to PUBLIC. Combined with `anon=X`, this
--      function is callable BY AN UNAUTHENTICATED CALLER over PostgREST, with
--      a floor plan uuid as the only input, and it will happily return, for
--      any merchant on the platform:
--        table layout and geometry, section and zone names, and -- through the
--        LEFT JOIN onto table_sessions -- live session ids, GUEST NAMES, party
--        sizes, order ids, seated_at times, VIP flags and server staff ids.
--
--      It is SECURITY DEFINER, so RLS on floor_plan_objects, table_sessions and
--      table_session_tables never runs. There is no tenant predicate anywhere
--      in the body. The only thing standing between an anon caller and another
--      merchant's live dining room is not knowing a uuid.
--
--      FIX: add the authorization guard its sibling already has, pin
--           search_path, schema-qualify the body, and bring the grants in line
--           with the house convention (REVOKE FROM PUBLIC; GRANT to
--           authenticated, service_role).
--
-- 2. public.get_floor_plan(uuid)
--      prosecdef = true, proconfig = NULL. HAS a correct authorization check.
--      Defect is the mutable search_path -- and per the argument above, on this
--      function that is precisely what undermines the check it does have.
--      FIX: pin search_path. Body untouched.
--
-- 3. public.get_categories_for_location(uuid, uuid)
--      prosecdef = true, proconfig = NULL.
--      FIX: pin search_path. Body untouched.
--      *** THIS IS THE THIRD TIME THIS FUNCTION HAS LOST ITS search_path. ***
--      It is not a function that was never fixed; it is a function that keeps
--      being un-fixed. See the RECURRENCE section immediately below -- it
--      changes what "done" means for this defect.
--
-- =============================================================================
-- BLAST RADIUS — checked before writing, not assumed
-- =============================================================================
--   grep across BOTH repos (Dexa-POS and dexapos-website), excluding
--   node_modules and .next build output:
--
--     get_floor_plan_objects_with_sessions
--       -> ZERO runtime callers. Appears only in generated database.types.ts
--          (3 files) and in historical schema-dump migrations. No .rpc() call
--          site exists in the POS client or the website.
--     get_floor_plan
--       -> ZERO runtime callers, same picture. The POS floor plan screens use
--          get_location_floor_plans / get_floor_plan_status /
--          get_location_table_status_v2 (services/floorPlanService.ts).
--     get_categories_for_location
--       -> 4 calling FILES / 7 call sites, ALL authenticated:
--            Dexa-POS/hooks/pos/useStandaloneSync.ts:160          (1)
--            dexapos-website/app/dashboard/actions/categories.ts:80,181       (2)
--            dexapos-website/app/dashboard/actions/menu-items-rpc.ts:18,41    (2)
--            dexapos-website/app/manage/actions/admin-merchant/menus.ts:431,505 (2)
--
--   That is why #1 can take a behavioural change (adding a guard where none
--   existed) at effectively zero risk, and why #2 and #3 are restricted to the
--   search_path pin: #3 has live callers and must not move.
--
-- =============================================================================
-- WHY PINNING search_path IS PROVABLY BEHAVIOUR-PRESERVING HERE
-- =============================================================================
--   Pinning only changes behaviour if a body resolves some name outside
--   `public`. Each body was scanned for cross-schema references:
--
--     get_categories_for_location  (15,917 chars, 9 FROM + 8 JOIN targets)
--        occurrences of 'auth.'       0
--        occurrences of 'extensions.' 0
--        occurrences of 'storage.'    0
--        occurrences of 'vault.'      0
--        every relation it reads (categories, category_items, locations,
--        menu_items, location_category_overrides, item_sizes,
--        location_exclusive_items, modifier_groups) confirmed to live in
--        `public` via pg_class/pg_namespace.
--
--     get_floor_plan
--        tables already written as public.floor_plan_objects /
--        public.server_sections / public.floor_plans; only the two helper
--        calls are unqualified, and both helpers are in `public`.
--
--     get_floor_plan_objects_with_sessions
--        reads floor_plan_objects, table_session_tables, table_sessions --
--        all confirmed in `public`.
--
--   So for all three, 'public','pg_temp' resolves every name to the same
--   object it resolves to today. Nothing moves; the resolution just stops
--   being caller-controlled.
--
--   ('pg_temp' is listed last deliberately. If it were first, a caller could
--   create a temp table shadowing a real one. Last means it can only be
--   reached if nothing in public matches, which for these bodies is never.)
--
-- =============================================================================
-- RECURRENCE — get_categories_for_location has been "fixed" twice already
-- =============================================================================
--   This was found while verifying the blast radius, and it is the single most
--   important thing in this file for whoever approves it. The repo history:
--
--     20260427120000_fix_remaining_empty_search_path_rpcs.sql
--        ALTER FUNCTION public.get_categories_for_location(uuid, uuid)
--          SET search_path = public;
--     20260430120000_fix_pos_full_sync_search_path_regression.sql
--        ALTER FUNCTION public.get_categories_for_location(uuid, uuid)
--          SET search_path TO 'public', 'pg_temp';
--
--   Both are recorded as APPLIED in supabase_migrations.schema_migrations on
--   PROD (verified 2026-08-14). The second one's own header documents the first
--   regression, in almost these words: a CREATE OR REPLACE elsewhere "omitted
--   SET search_path ... the function lost its search_path setting".
--
--   And prod's proconfig for this function is NULL again today.
--
--   ROOT CAUSE, with a control group. That same 20260430120000 migration
--   re-pinned two neighbours in the same statement block:
--       get_menu_with_categories  ->  proconfig {"search_path=public, pg_temp"}  INTACT
--       get_pos_full_sync         ->  proconfig {"search_path=public, pg_temp"}  INTACT
--       get_categories_for_location ->  proconfig NULL                            WIPED
--   Three functions, one migration, one day. Only the one that was later
--   rewritten lost its setting. So this is not a failed migration -- it is a
--   subsequent CREATE OR REPLACE that dropped the SET clause.
--
--   Which rewrite? The live prod body contains the `modifier_groups` subquery
--   that docs/features/menu-management/category-flow-bugfix-changelog.md §1B
--   describes ADDING to this function -- and no migration file in this repo
--   replaces get_categories_for_location after 20260430120000. The rewrite was
--   applied out of band (SQL editor / MCP apply_migration) with no migration
--   file, and it carried no SET clause.
--
--   WHY THIS DOES NOT CHANGE THE FIX, BUT DOES CHANGE THE FOLLOW-UP
--   CREATE OR REPLACE is NOT more durable than ALTER here. proconfig is part of
--   the function definition: ANY future CREATE OR REPLACE that omits the SET
--   clause wipes it, no matter how it was set this time. Choosing CREATE OR
--   REPLACE today would buy exactly zero extra durability -- it would only
--   re-introduce the transcription and staging-drift risks argued below.
--
--   The durable fix is the lint rule in the FOLLOW-UPS section. On the evidence
--   above that rule is not a nice-to-have: without it, this file is the third
--   attempt at the same one-line change and there is no reason to expect it to
--   survive any longer than the previous two. Please do not close this defect
--   on the strength of this migration alone.
--
--   OPERATOR NOTE: because these ALTERs did run on staging in April, staging's
--   proconfig for this function may be non-NULL and may differ from prod's
--   NULL. Capture the BEFORE state from the environment you are applying to,
--   not from the values in this file. The ALTER is idempotent either way.
--
-- =============================================================================
-- DELIBERATE DEVIATION FROM THE WAVE BRIEF — please read before approving
-- =============================================================================
--   The brief for #3 said to re-emit get_categories_for_location verbatim from
--   pg_get_functiondef with only the search_path line added. This file uses
--   ALTER FUNCTION ... SET search_path instead, for #2 and #3 both. Reasons:
--
--     1. CORRECTNESS. ALTER FUNCTION sets pg_proc.proconfig and touches
--        nothing else. It is byte-for-byte body-preserving BY CONSTRUCTION.
--        Re-emitting 15,917 characters by hand introduces a transcription
--        risk on a live, load-bearing menu function to buy nothing.
--
--     2. STAGING SAFETY -- this is the stronger reason. These migrations are
--        applied to STAGING FIRST. The body captured above came from PROD. If
--        staging's copy has drifted (menu code is actively worked on), a
--        CREATE OR REPLACE carrying prod's body would silently REVERT staging
--        to prod's version, and the diff would be invisible in review because
--        the file looks like it only added one line. ALTER FUNCTION cannot do
--        that in any environment.
--
--   #1 still uses CREATE OR REPLACE because its body genuinely changes.
--
--   If the lead prefers the literal re-emission, it is a mechanical swap --
--   capture pg_get_functiondef at apply time from the TARGET environment (not
--   from prod) and add the SET line. The verification queries below pass
--   either way.
--
-- REFERENCE HASHES — the exact definitions analysed, prod 2026-08-14:
--   get_floor_plan_objects_with_sessions(uuid)  len 2528  md5 8eae4ec688a4d54c523c7400e8bec0c8
--   get_floor_plan(uuid)                        len 2242  md5 b50fa9fea23259d4dc15913672d6167d
--   get_categories_for_location(uuid,uuid)      len 15917 md5 0aab760527f7e4c2c3c769e20087d8ad
--
--   PRE-APPLY CHECK for #1 -- confirm the target environment's body matches
--   what was analysed, so this CREATE OR REPLACE is a pure hardening and not a
--   silent revert:
--     SELECT md5(pg_get_functiondef(
--              'public.get_floor_plan_objects_with_sessions(uuid)'::regprocedure));
--   Expected 8eae4ec688a4d54c523c7400e8bec0c8. If it differs, STOP and diff
--   the two bodies before proceeding.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. get_floor_plan_objects_with_sessions — add the missing authorization guard
-- -----------------------------------------------------------------------------
-- CHANGES, and nothing else:
--   (a) SET search_path TO 'public', 'pg_temp'
--   (b) an authorization guard, added at the top, copied from the sibling
--       get_floor_plan: the caller must administer the merchant that owns the
--       floor plan AND have its location in their location set
--   (c) tables schema-qualified (defence in depth; with (a) pinned these
--       resolve to exactly the same relations they resolve to today)
--   (d) CRLF line endings in the original body normalised to LF
--
-- UNCHANGED: the RETURNS TABLE signature, column by column and type by type --
-- the POS client's database.types.ts is generated from it. The SELECT list,
-- the joins, the merged_tables subquery, the WHERE and the ORDER BY are
-- reproduced exactly. Existing grants survive because this is CREATE OR
-- REPLACE rather than DROP + CREATE.
--
-- GUARD SEMANTICS: RAISE, not an empty result set. Two reasons. It matches the
-- sibling's error contract exactly ('Floor plan not found or access denied'),
-- which is the point of this fix -- the pair diverging is what produced the
-- bug. And an empty set is indistinguishable from "this floor plan has no
-- tables", which would turn a permission misconfiguration into a silent blank
-- floor plan that an operator could reasonably read as data loss. There are
-- zero callers today, so no existing consumer's error handling can break.
--
-- COST: one primary-key probe into floor_plans, a 5-row table. Immeasurable.
--
-- NOTE ON service_role AND PLATFORM ADMINS: user_merchant_id() derives from
-- the request JWT, so a service_role connection with no user JWT is denied by
-- this guard -- exactly as it already is by get_floor_plan. Neither function
-- has an is_dexapos_admin() escape hatch. That is preserved on purpose: making
-- the pair behave identically is the fix. If platform admins do need access,
-- add the branch to BOTH functions in one follow-up change, never to one.
CREATE OR REPLACE FUNCTION public.get_floor_plan_objects_with_sessions(p_floor_plan_id uuid)
 RETURNS TABLE(id uuid, floor_plan_id uuid, location_id uuid, merchant_id uuid, name text, shape_id text, category text, x numeric, y numeric, rotation numeric, z_index integer, width numeric, height numeric, capacity integer, min_capacity integer, is_reservable boolean, is_combinable boolean, is_visible boolean, is_active boolean, section_id uuid, zone_name text, default_turn_time integer, label_override text, color_override text, created_at timestamp with time zone, updated_at timestamp with time zone, session_id uuid, session_status text, session_number text, party_size integer, guest_name text, order_id uuid, server_staff_id uuid, is_vip boolean, needs_attention boolean, current_course integer, seated_at timestamp with time zone, reservation_id uuid, waitlist_id uuid, merged_tables uuid[])
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- ===========================================================================
  -- WAVE 5B: the entire behavioural change. Identical predicate to
  -- public.get_floor_plan(uuid). Without this, a SECURITY DEFINER function
  -- owned by a superuser returned any merchant's live table sessions -- guest
  -- names, party sizes, order ids -- to any caller holding a floor plan uuid.
  -- ===========================================================================
  -- Authorization mirrors public.get_location_floor_plans(uuid) -- the function
  -- the POS actually calls to enumerate floor plans -- NOT public.get_floor_plan(uuid).
  --
  -- get_floor_plan guards with
  --     fp.merchant_id = user_merchant_id() AND fp.location_id = ANY(user_location_ids())
  -- and that predicate is TOO STRICT to copy here. Measured on staging
  -- 2026-08-13: a merchant OWNER has user_location_ids() = {8835e749...} (one
  -- location), while 3 floor plans belonging to that same merchant sit at other
  -- locations. Copying get_floor_plan's guard denied the owner access to their
  -- own merchant's floor plans -- caught by testing the POSITIVE case, not just
  -- the negative one.
  --
  -- is_merchant_admin_or_impersonating(fp.merchant_id) is the predicate already
  -- governing get_location_floor_plans, so a caller who can LIST a floor plan
  -- can now READ its objects: consistent, and no legitimate access is lost.
  -- It still fully closes the actual vulnerability, which is CROSS-MERCHANT
  -- reads -- the merchant boundary is exactly what it enforces.
  IF NOT EXISTS (
    SELECT 1
    FROM public.floor_plans fp
    WHERE fp.id = p_floor_plan_id
      AND public.is_merchant_admin_or_impersonating(fp.merchant_id)
  ) THEN
    RAISE EXCEPTION 'Floor plan not found or access denied';
  END IF;

  RETURN QUERY
  SELECT
    fpo.id,
    fpo.floor_plan_id,
    fpo.location_id,
    fpo.merchant_id,
    fpo.name,
    fpo.shape_id,
    fpo.category::TEXT,
    fpo.x,
    fpo.y,
    fpo.rotation,
    fpo.z_index,
    fpo.width,
    fpo.height,
    fpo.capacity,
    fpo.min_capacity,
    fpo.is_reservable,
    fpo.is_combinable,
    fpo.is_visible,
    fpo.is_active,
    fpo.section_id,
    fpo.zone_name,
    fpo.default_turn_time,
    fpo.label_override,
    fpo.color_override,
    fpo.created_at,
    fpo.updated_at,
    ts.id AS session_id,
    COALESCE(ts.status::TEXT, 'available') AS session_status,
    ts.session_number,
    ts.party_size,
    ts.guest_name,
    ts.order_id,
    ts.server_staff_id,
    COALESCE(ts.is_vip, false) AS is_vip,
    COALESCE(ts.needs_attention, false) AS needs_attention,
    COALESCE(ts.current_course, 1) AS current_course,
    ts.seated_at,
    ts.reservation_id,
    ts.waitlist_id,
    (
      SELECT ARRAY_AGG(tst2.table_id ORDER BY tst2.seated_position)
      FROM public.table_session_tables tst2
      WHERE tst2.session_id = ts.id
      AND tst2.is_active = true
    ) AS merged_tables
  FROM public.floor_plan_objects fpo
  LEFT JOIN public.table_session_tables tst
    ON tst.table_id = fpo.id
    AND tst.is_active = true
  LEFT JOIN public.table_sessions ts
    ON ts.id = tst.session_id
    AND ts.is_active = true
    AND ts.status NOT IN ('cleaning')
  WHERE fpo.floor_plan_id = p_floor_plan_id
    AND fpo.is_active = true
  ORDER BY fpo.z_index, fpo.name;
END;
$function$;

COMMENT ON FUNCTION public.get_floor_plan_objects_with_sessions(uuid) IS
  'Floor plan objects with their live table sessions. SECURITY DEFINER, so it '
  'carries its own tenant guard: the caller must administer the owning merchant '
  'and hold the location. Guard added in Wave 5B -- before that this function '
  'had no authorization check at all. Keep its predicate identical to '
  'public.get_floor_plan(uuid).';

-- House convention. Also removes anon and PUBLIC, which had no business
-- holding EXECUTE on a SECURITY DEFINER reader of live guest data. Safe: the
-- grep above found zero runtime callers in either repo, so nothing can break.
REVOKE ALL ON FUNCTION public.get_floor_plan_objects_with_sessions(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_floor_plan_objects_with_sessions(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_floor_plan_objects_with_sessions(uuid)
  TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. get_floor_plan — pin search_path
-- -----------------------------------------------------------------------------
-- Body untouched. This function's authorization check is
--   fp.merchant_id = user_merchant_id() AND fp.location_id = ANY(user_location_ids())
-- with both helpers called UNQUALIFIED, so until this line lands the check is
-- resolvable through a caller-supplied search_path. This is the line that
-- makes the existing guard trustworthy.
ALTER FUNCTION public.get_floor_plan(uuid)
  SET search_path TO 'public', 'pg_temp';

-- -----------------------------------------------------------------------------
-- 3. get_categories_for_location — pin search_path
-- -----------------------------------------------------------------------------
-- Body untouched (see the deviation note in the header for why ALTER and not
-- CREATE OR REPLACE). Verified above to reference no schema other than public.
--
-- Grants deliberately NOT changed here. This function HAS live callers, and
-- narrowing its ACL is a separate decision with a separate blast radius that
-- does not belong in a hardening change. It stays on the follow-up list below.
ALTER FUNCTION public.get_categories_for_location(uuid, uuid)
  SET search_path TO 'public', 'pg_temp';

COMMIT;

-- PostgREST caches function signatures AND which roles may execute them. #1's
-- ACL just changed, so without a reload the cache still advertises it to anon;
-- the request would then fail at the database with a raw permission error
-- instead of a clean 404. Harmless if PostgREST is not listening.
NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- VERIFICATION
-- =============================================================================
-- 1. All three now pin search_path:
--      SELECT p.oid::regprocedure AS sig, p.prosecdef, p.proconfig
--        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--       WHERE n.nspname = 'public'
--         AND p.proname IN ('get_floor_plan_objects_with_sessions',
--                           'get_floor_plan',
--                           'get_categories_for_location');
--    Expected proconfig on every row, exactly (this is the representation the
--    168 canonically-pinned SECURITY DEFINER functions in this database carry):
--      {"search_path=public, pg_temp"}
--
-- 2. Bodies of #2 and #3 are provably unchanged. Capture md5 BEFORE applying
--    and compare AFTER -- pg_get_functiondef includes the SET line, so the
--    hash WILL change; compare the body only:
--      SELECT md5(prosrc) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--       WHERE n.nspname='public'
--         AND p.proname IN ('get_floor_plan','get_categories_for_location');
--    These md5(prosrc) values MUST be identical before and after. If either
--    moves, something rewrote a body and this migration is not what it claims.
--
-- 3. The signature #1's callers depend on is byte-identical:
--      SELECT pg_get_function_result(
--               'public.get_floor_plan_objects_with_sessions(uuid)'::regprocedure);
--    Diff against the pre-apply capture. Must be identical -- if it is not,
--    database.types.ts regeneration would ripple into the POS client.
--    (CREATE OR REPLACE would in fact have refused a return-type change, so a
--    successful apply is already strong evidence. Check anyway.)
--
-- 4. The guard actually denies. As an authenticated user of merchant A,
--    against a floor plan belonging to merchant B:
--      SELECT * FROM public.get_floor_plan_objects_with_sessions('<B_floor_plan_id>');
--    Expected: ERROR "Floor plan not found or access denied".
--    Against the caller's OWN floor plan: the same rows as before this change.
--
--    Baseline that "same rows as before" claim on staging BEFORE applying:
--      SELECT count(*), md5(string_agg(t::text, '|' ORDER BY t::text))
--        FROM public.get_floor_plan_objects_with_sessions('<own_floor_plan_id>') t;
--    Re-run after. Identical count and hash for an authorized caller is the
--    proof that only authorization changed and not the result set.
--
-- 5. Grants on #1:
--      SELECT proacl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--       WHERE n.nspname='public' AND p.proname='get_floor_plan_objects_with_sessions';
--    Expected: no bare '=X/postgres' (PUBLIC) entry and no 'anon=X' entry;
--    authenticated and service_role retain X.
--
-- STAGING FIRST, then the human operator promotes to prod.
--
-- =============================================================================
-- FOLLOW-UPS (explicitly NOT done here)
-- =============================================================================
-- * get_floor_plan(uuid) and get_categories_for_location(uuid,uuid) still hold
--   EXECUTE for PUBLIC and anon. get_floor_plan self-defends via its guard, and
--   get_categories_for_location has live callers whose auth context was not
--   audited in this wave (an anon-facing public menu page is plausible), so
--   narrowing either ACL needs its own change with its own caller analysis.
-- * The wider sweep. As of 2026-08-14 prod carries 511 SECURITY DEFINER
--   functions in `public`. 332 of them set some search_path; 179 have
--   proconfig IS NULL and therefore carry the mutable-search_path exposure
--   described at the top of this file. Of the 332, only 168 use the canonical
--   'public, pg_temp' -- so "pinned" is the majority but "pinned correctly" is
--   not yet, and these 179 are stragglers rather than the norm. Enumerate with
--     SELECT p.oid::regprocedure FROM pg_proc p
--       JOIN pg_namespace n ON n.oid=p.pronamespace
--      WHERE n.nspname='public' AND p.prosecdef AND p.proconfig IS NULL
--      ORDER BY 1;
--   and work it as a dedicated security ticket, not inside a perf wave. This
--   file fixes the three the audit surfaced, not the class. Worth sizing
--   properly -- 179 is a backlog, not an afternoon.
--   (Note 15 more functions carry the malformed 'public, public, pg_temp' and
--   6 carry 'public, extensions' with no pg_temp; sweep those in the same pass.)
-- * REQUIRED, NOT OPTIONAL — a CI / migration-lint rule rejecting any
--   CREATE OR REPLACE of a SECURITY DEFINER function that omits SET
--   search_path. Per the RECURRENCE section, get_categories_for_location has
--   now lost this setting twice after being explicitly fixed, and the second
--   wipe came from a rewrite applied with no migration file at all. A lint on
--   migration files alone would NOT have caught that one, so the rule needs a
--   drift check as well -- a scheduled job asserting
--     SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--      WHERE n.nspname='public' AND p.prosecdef AND p.proconfig IS NULL;
--   has not increased since the last known-good baseline. Treat this file as
--   incomplete until that exists: it fixes three instances of a defect whose
--   demonstrated behaviour is to come back.
--
-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- Restores the exact pre-Wave-5B state, including the missing guard. Only run
-- this if #1's guard actually breaks a caller -- it reopens the anon exposure
-- described at the top of this file. Prefer fixing the caller.
--
-- BEGIN;
--
-- -- 2 and 3: unpin search_path (bodies were never touched, nothing to restore)
-- --   RESET restores proconfig to NULL, which IS prod's current state for both
-- --   functions. On staging, check the BEFORE capture first: if staging still
-- --   carries the April pin from 20260430120000, RESET would leave it LESS
-- --   pinned than it started. In that case re-assert rather than reset:
-- --     ALTER FUNCTION ... SET search_path TO 'public', 'pg_temp';
-- --   There is in any case no good reason to roll these two back -- neither
-- --   changes behaviour, and #3's rollback re-opens a defect that has already
-- --   regressed twice.
-- ALTER FUNCTION public.get_floor_plan(uuid) RESET search_path;
-- ALTER FUNCTION public.get_categories_for_location(uuid, uuid) RESET search_path;
--
-- -- 1: unpin and drop the guard. Re-emit the ORIGINAL prod body
-- --    (md5 8eae4ec688a4d54c523c7400e8bec0c8) by taking the CREATE OR REPLACE
-- --    above and making exactly three edits:
-- --      a. delete the line  SET search_path TO 'public', 'pg_temp'
-- --      b. delete the IF NOT EXISTS (...) RAISE EXCEPTION ... END IF; block
-- --      c. optionally drop the public. qualifiers (cosmetic; behaviour with
-- --         an unpinned search_path is unchanged either way)
-- --    The signature, SELECT list, joins, WHERE and ORDER BY are already
-- --    verbatim, so nothing else needs to move.
-- --
-- -- Then restore the original grants:
-- GRANT EXECUTE ON FUNCTION public.get_floor_plan_objects_with_sessions(uuid)
--   TO PUBLIC, anon, authenticated, service_role;
--
-- COMMIT;
-- =============================================================================
