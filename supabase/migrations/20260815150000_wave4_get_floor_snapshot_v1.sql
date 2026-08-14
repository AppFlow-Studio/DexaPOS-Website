-- =============================================================================
-- Wave 4 — get_floor_snapshot_v1: version the geometry, stop resending it
-- =============================================================================
-- Source: Notion [POS-PERF] AUD-2, audit 2026-07-24.
--
-- FIRST, A CORRECTION TO THE TICKET
--   AUD-2 states that the 5.85 s floor-plan load is server-bound. That is
--   FALSE and nothing in this migration should be sold on it. Measured on prod
--   (pg_stat_statements, 254-day window):
--
--     get_floor_plan_status        175,040 calls @  6.76 ms =  1,183.7 s
--     get_location_floor_plans      34,068 calls @ 18.50 ms =    630.2 s
--                                                             ---------
--                                                              1,813.9 s
--
--   That is ~7 s of database time per day, and 1.9% of the ~97,000 s the RLS
--   problem in Wave 1 was costing. Server-side these two functions are already
--   fast, and their plans are already optimal (see INDEXES below). If the floor
--   screen takes 5.85 s to appear, the remaining time is client-side: transfer,
--   JSON parse, store hydration and render. Do not expect this migration to
--   move mean_exec_time. It will not, and it is not trying to.
--
-- WHAT IS ACTUALLY WRONG (payload and round-trips, both measured)
--
--   1. GEOMETRY IS RESENT ON EVERY CALL AND ALMOST NEVER CHANGES.
--      get_location_floor_plans serialises every floor_plan_object at the
--      location -- x, y, width, height, rotation, z_index, overrides -- on
--      every single call. Measured payload, by location, prod 2026-08-13:
--
--        94dd8b80  2 plans   38,652 bytes
--        5afc6641  2 plans   16,603 bytes
--        fb1faf52  1 plan       218 bytes
--
--      Against 34,068 calls that is on the order of a gigabyte of geometry
--      pushed over the wire and re-parsed by tablets on bad restaurant WiFi.
--
--      Meanwhile, in the SAME 254-day window, the total number of statements
--      that changed any floor_plan_objects row was 1,764:
--
--        update_floor_plan_object_position (RPC)                     863
--        add_floor_plan_object             (RPC)                     314
--        update_floor_plan_objects_batch   (RPC, one stmt per obj)   188
--        UPDATE floor_plan_objects SET height, width  (PostgREST)    143
--        DELETE FROM floor_plan_objects WHERE id = $1 (PostgREST)    119
--        UPDATE floor_plan_objects SET name           (PostgREST)    111
--        UPDATE floor_plan_objects SET rotation       (PostgREST)     14
--        UPDATE floor_plan_objects SET color_override (PostgREST)     12
--
--      34,068 reads against at most 1,764 mutating statements: AT LEAST 94.8%
--      of geometry fetches return bytes the caller already had. A floor plan is
--      laid out once and then read for months.
--
--   2. THE STATUS POLL RESENDS GEOMETRY TOO.
--      get_floor_plan_status is called 175,040 times -- 5.1 times for every
--      get_location_floor_plans call -- and each table it returns carries
--      name, shape_id, category, x, y, rotation and capacity alongside the
--      session. Every one of those fields is geometry the client already holds.
--
--   3. THE CLIENT MAKES A THIRD ROUND TRIP TO PATCH THE GAP.
--      get_location_floor_plans omits canvas_width / canvas_height / grid_size /
--      background_color, so stores/useFloorPlanStore.ts:866 does:
--
--        // The get_location_floor_plans RPC may not include canvas_width /
--        // canvas_height. Patch them from the direct table if missing.
--        supabase.from("floor_plans").select("id, canvas_width, canvas_height")
--
--      So a cold floor load today is: 1 geometry call + N status calls + 1
--      remedial canvas-dimension call.
--
-- THE FIX
--   Give floor_plans a monotonic geometry_version. get_floor_snapshot_v1 takes
--   the caller's version token and OMITS the geometry key entirely when it
--   matches, returning only the volatile session/reservation status. One RPC
--   replaces all three round trips, and the steady-state response is the status
--   payload alone.
--
--   Cold call  (no token / stale token):  geometry + status + sections
--   Warm call  (token matches):           status + sections, no geometry key
--
--   ABSENT 'geometry' MEANS "REUSE YOUR CACHE".
--   'geometry': [] MEANS "THIS LOCATION HAS NO FLOOR PLANS".
--   These are different and the client must not conflate them.
--
-- MEASURED EFFECT — DO NOT ROUND THIS UP
--   All bodies below were executed read-only against prod for location
--   94dd8b80 (2 floor plans, 118 objects, 53 active tables/booths), which is
--   the largest on the platform. Bytes are the serialised payload.
--
--     Today, one floor refresh                       bytes   round trips
--       get_location_floor_plans                    38,652
--       get_floor_plan_status  (plan 5aa28ac6)      18,470
--       get_floor_plan_status  (plan 90e7e7af)      17,864
--       floor_plans canvas-dimension patch select     ~200
--                                                   ------   -----------
--                                                   75,186             4
--
--     get_floor_snapshot_v1, cold (no token)        64,863             1
--     get_floor_snapshot_v1, warm (token matches)   27,726             1
--
--   So: -14% cold, -63% warm, and 4 round trips collapse to 1 in both cases.
--   On the polling path specifically -- the 175,040-call one -- 36,334 bytes
--   across two calls become 27,726 bytes in one, or -24%.
--
--   THE ABSOLUTE BYTE COUNTS DRIFT UPWARD AND WILL NOT REPRODUCE EXACTLY.
--   Both the old and the new status payload carry
--     minutes_seated = EXTRACT(EPOCH FROM (NOW() - ts.seated_at)) / 60
--   an unrounded numeric whose decimal expansion lengthens as a session ages.
--   An earlier run of this same measurement returned 64,767 / 27,644; the two
--   runs are ~0.1% apart. The drift applies identically to the old and new
--   sides, so the PERCENTAGES are stable while the byte counts are not. Quote
--   the percentages. (Rounding minutes_seated would shrink both sides and is a
--   reasonable follow-up, but it changes an existing client-visible value and
--   is deliberately out of scope for this wave.)
--
--   The 94.8% figure above is the share of calls whose GEOMETRY IS UNCHANGED.
--   It is not a byte reduction and must not be quoted as one: status is
--   genuinely volatile and is still sent in full every time. The honest summary
--   of this wave is "one round trip instead of four, and roughly two thirds
--   less data in steady state". Anything larger requires trimming the session
--   payload itself, which is out of scope here.
--
-- =============================================================================
-- DESIGN DECISION 1 — TRIGGER, NOT EDITS TO THE FOUR EDITOR RPCs
-- =============================================================================
--   The task asked us to weigh bumping geometry_version inside
--   add_floor_plan_object / update_floor_plan_object_position /
--   update_floor_plan_objects_batch / delete_floor_plan_cascade against a
--   trigger on floor_plan_objects. The evidence settles it: a trigger.
--
--   Those four RPCs DO NOT COVER THE WRITE PATH. pg_stat_statements shows 399
--   object-level mutations -- 22.6% of all of them -- arriving as direct
--   PostgREST statements that touch none of the four functions (the height/width,
--   DELETE, name, rotation and color_override rows listed above). The POS client
--   does the same for the parent table: services/floorPlanService.ts uses
--   .from("floor_plans").update(...) and .from("floor_plans").delete() rather
--   than an RPC, and prod has logged 47 such direct floor_plans writes
--   (canvas dims 11, name 10, is_default 10, INSERT 5, DELETE 11).
--
--   Function-side bumping would therefore leave roughly a quarter of geometry
--   edits unversioned. The failure mode of a missed bump is not slowness, it is
--   a tablet rendering a stale floor plan indefinitely -- tables in the wrong
--   place, deleted tables still present -- because the token never changed and
--   the server never resends. That is a correctness bug, and it is silent.
--
--   A trigger cannot be bypassed by a write path we did not think of, including
--   ones added after this migration ships. The four RPCs are left byte-for-byte
--   untouched, which also means this migration adds no new failure mode to the
--   floor editor's write path.
--
-- DESIGN DECISION 2 — THE TOKEN IS A SET DIGEST, NOT A MAX
--   The response can cover several floor plans. The token is
--   md5 of 'id:version' pairs ordered by id across the ENTIRE authorized scope.
--   A max() or sum() would miss plan DELETION: dropping an old plan leaves the
--   maximum untouched, so the client would keep rendering a plan the merchant
--   deleted. A digest over the full set changes on add, remove and edit alike,
--   which is why no INSERT/DELETE trigger on floor_plans is needed -- the set
--   membership change is itself the signal.
--
--   The token is scoped to the request. The client MUST key its cache by
--   (p_location_id, p_floor_plan_id) and must never replay a token from one
--   scope into another. It is opaque; do not parse it.
--
-- DESIGN DECISION 3 — SECURITY DEFINER ON THE floor_plan_objects TRIGGER ONLY
--   The floor_plans BEFORE-UPDATE trigger touches nothing but the NEW record in
--   flight, so it stays SECURITY INVOKER. The floor_plan_objects trigger has to
--   write a DIFFERENT table, and there it matters:
--
--   floor_plans RLS is  is_dexapos_admin() OR merchant_id = user_merchant_id().
--   The editor RPCs authorize with is_merchant_admin_or_impersonating(), which
--   is STRICTLY BROADER -- it also admits an HQ admin inside an active
--   impersonation_sessions row, whose user_merchant_id() is not the target
--   merchant. Under a non-DEFINER trigger that caller would successfully edit
--   the object, then the version bump would match zero rows under RLS and
--   silently do nothing: a permanently stale cache for every tablet at that
--   location. SECURITY DEFINER closes that hole.
--
--   This grants no new capability. The trigger can only ever increment
--   geometry_version on the floor plan of a row the caller already successfully
--   mutated; it reads nothing and returns nothing to the caller.
--
-- DESIGN DECISION 4 — WHAT IS GEOMETRY AND WHAT IS STATUS
--   geometry  = floor_plans row + every floor_plan_objects row. Versioned.
--   status    = sessions and next reservations, keyed BY OBJECT ID ONLY.
--   sections  = server_sections. ALWAYS SENT, never versioned, because
--               assigned_staff_id changes every time a section is reassigned
--               mid-shift; it is volatile data that merely lives on a
--               geometry-shaped table.
--
--   status deliberately does NOT repeat name/shape_id/category/x/y/rotation/
--   capacity the way get_floor_plan_status does. The client joins status to
--   geometry by id. This is safe precisely because of the version token: if any
--   object had been added, moved or removed, the token would have changed and
--   geometry would have been resent in this same response. A status entry can
--   never reference an id the client's cached geometry lacks.
--
-- =============================================================================
-- A LIVE BUG FOUND WHILE READING get_floor_plan_status  (READ THIS)
-- =============================================================================
--   get_floor_plan_status's 'summary' block joins
--     LEFT JOIN table_session_tables tst ON tst.table_id = fpo.id
--   with NO is_active predicate, then counts the resulting rows. Every historic
--   seating of a table therefore multiplies that table in the count. On prod
--   57 tables carry more than one junction row, and the summary it is serving
--   today is nonsense:
--
--     floor_plan   true_tables  reported   true_capacity  reported
--     67a206ef              14      1053              56      4212
--     a38baa2c              14       548              66      2620
--     90e7e7af              26        74              92       248
--     5aa28ac6              27        37             104       140
--
--   A 14-table dining room reporting 1,053 tables and seating for 4,212.
--
--   Those two 67a206ef figures are a MOVING TARGET, and that is the point: they
--   were 1,051 / 4,204 earlier the same day. Every new seating of a table adds
--   another junction row and inflates them further, forever. Re-measuring will
--   not reproduce these exact numbers; it will reproduce larger ones.
--
--   PRECISELY WHICH FIELDS ARE AFFECTED, because it matters for cutover diffing:
--     total_tables, total_capacity, available  -- INFLATED, sometimes 75x.
--     occupied, current_covers                 -- CORRECT even today. The
--       duplicate junction rows are inactive, so they contribute rows with a
--       NULL session, which the FILTER (WHERE session_id IS NOT NULL) and the
--       party_size SUM both skip. Only the unfiltered COUNT(*) and SUM(capacity)
--       pick them up.
--     EMPTY FLOOR PLANS -- a second, smaller divergence, unrelated to fan-out.
--       On a plan with no tables at all (prod: 4dfc18e0) get_floor_plan_status
--       returns  total_capacity: null, current_covers: null,  because SUM() over
--       zero rows is NULL. v1 wraps both in COALESCE and returns 0. A client
--       doing arithmetic on those fields gets a number instead of a null. This
--       is the only summary difference that shows up on a plan with no data.
--
--   get_floor_snapshot_v1 does NOT reproduce this. Its summary joins
--   table_session_tables with  AND tst.is_active, which idx_unique_active_table
--   (UNIQUE on table_id WHERE is_active = true) makes provably at most one row
--   per object, so fan-out is structurally impossible rather than merely
--   absent today. Verified by execution: for floor plan 90e7e7af v1 returns
--   total_tables 26 / total_capacity 92, matching the underlying rows exactly,
--   where get_floor_plan_status returns 74 / 248.
--
--   ==> THIS IS AN INTENTIONAL OUTPUT DIFFERENCE FROM THE RPC BEING REPLACED.
--       Anyone comparing v1 against get_floor_plan_status during cutover will
--       see total_tables, total_capacity and available disagree. v1 is the
--       correct side. If any client screen reads those three today, its numbers
--       change -- for the better -- on cutover. Flag it in the client PR.
--
--   UNRELATED DATA ISSUE, NOTED SO IT IS NOT MISATTRIBUTED TO THIS CHANGE:
--   floor plan 90e7e7af reports current_covers 4347 across 26 tables both
--   before and after this fix, because its active table_sessions carry
--   party_size values of 999, 807, 777, 558, 508 ... That is junk seeded data,
--   not a query defect, and v1 deliberately does not paper over it.
--
--   Two smaller corrections, both verified output-neutral on current prod data
--   (i.e. they fix latent bugs that have not yet fired):
--     - the per-table 'session' lookup gains  AND tst.is_active. Without it the
--       subquery is a scalar subquery over an unbounded row set and would raise
--       "more than one row returned by a subquery" the first time a stale
--       junction row survives alongside an active one. Verified: 0 tables today
--       reach an active session ONLY through an inactive junction row, so the
--       filter changes nothing now and prevents a hard error later.
--     - 'merged_tables' gains AND tst2.is_active and ORDER BY tst2.seated_position,
--       matching get_floor_plan_objects_with_sessions. Verified: 0 active
--       sessions currently have any inactive junction row, so output is
--       unchanged today.
--
--   All three corrections are confined to the NEW function. get_floor_plan_status
--   is left live and untouched, so nothing regresses before client cutover.
--
-- =============================================================================
-- INDEXES: NONE ADDED, AND THAT IS THE HONEST ANSWER
-- =============================================================================
--   floor_plan_objects holds 118 rows across 5 floor plans in 9 pages. Both
--   halves of this function already plan optimally on the existing indexes.
--   EXPLAIN (ANALYZE, BUFFERS) against prod, location 94dd8b80 (the largest):
--
--   Geometry half:
--     Seq Scan on floor_plans fp (actual time=0.406..0.658 rows=2 loops=1)
--       ->  Index Scan using idx_floor_plan_objects_floor_plan
--             on floor_plan_objects o (actual time=0.010..0.056 rows=42 loops=2)
--     Execution Time: 0.769 ms
--
--   Status half:
--     Seq Scan on floor_plan_objects fpo (actual time=0.024..0.093 rows=81 loops=1)
--       Rows Removed by Filter: 37
--       Buffers: shared hit=9
--     Index Scan using idx_unique_active_table
--       on table_session_tables tst (actual time=0.003..0.003 rows=1 loops=53)
--     Execution Time: 1.010 ms
--
--   A 9-buffer sequential scan is the correct plan for a 118-row table; an index
--   would add write cost and buy nothing. The session lookup already lands on
--   idx_unique_active_table and the reservation lookup on idx_reservations_date.
--   No CREATE INDEX CONCURRENTLY statement appears in this file, so the whole
--   migration is a single transaction. Revisit only if floor_plan_objects grows
--   by two orders of magnitude.
--
--   ONE INDEX HERE IS LOAD-BEARING FOR CORRECTNESS, NOT SPEED:
--     idx_unique_active_table  -- UNIQUE (table_id) WHERE is_active = true
--   The per-table 'session' lookup is a SCALAR subquery. It is single-row only
--   because that unique index makes it impossible for one object to have two
--   active junction rows. If that index is ever dropped, this function does not
--   get slower -- it starts raising "more than one row returned by a subquery
--   used as an expression" the first time a table is double-booked, and the
--   whole floor screen fails. Checked against the Wave 5 index cleanup
--   (20260815160000): it drops only orders / order_items indexes and does not
--   touch this one. Any future index-pruning pass must treat it as a constraint.
--
-- BLAST RADIUS OF THE NEW COLUMN AND THE EXTRA WRITE  (both checked, both nil)
--   REALTIME: publication supabase_realtime carries floor_plan_objects,
--   table_sessions and table_session_tables -- but NOT floor_plans. Verified
--   against pg_publication_tables on prod. So the version bump, which writes
--   only floor_plans, emits no realtime message, adds no WAL traffic to any
--   subscriber, and cannot change the shape of a payload any client is already
--   decoding. Adding geometry_version to a published table would have done all
--   three; adding it here does none.
--
--   SELECT *: floor_plans is read with SELECT * by add_floor_plan_object (into
--   a plpgsql RECORD) and by PostgREST clients. Neither breaks on an added
--   column -- RECORD is positional-agnostic and PostgREST returns the extra key
--   -- but database.types.ts in both repos must be regenerated at cutover or
--   the field will be invisible to TypeScript.
--
-- ROLLOUT
--   Ships ALONGSIDE get_location_floor_plans, get_floor_plan and
--   get_floor_plan_status, all of which stay live and unmodified. Nothing calls
--   v1 until the POS client is cut over, so this migration is inert on deploy
--   apart from the new column and the four triggers that maintain it (one on
--   floor_plans, three on floor_plan_objects). Those four are the only part
--   that touches a live write path, which is why they do as little as possible:
--   one integer increment on a five-row table. Rollback is a client revert plus
--   the block at the bottom of this file.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. floor_plans.geometry_version
-- -----------------------------------------------------------------------------
-- bigint, not int: this counter is incremented by every editor action forever
-- and is never reset. NOT NULL with a non-volatile DEFAULT, so PostgreSQL 11+
-- records it in the catalog without rewriting the heap; floor_plans holds 5
-- rows regardless.
--
-- Existing rows all start at 1. Every currently-running client holds no token,
-- so the first v1 call after deploy is a cold call and gets full geometry.
ALTER TABLE public.floor_plans
  ADD COLUMN IF NOT EXISTS geometry_version bigint NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.floor_plans.geometry_version IS
  'Monotonic counter bumped by trigger whenever this plan''s layout changes, '
  'including any INSERT/UPDATE/DELETE on its floor_plan_objects. Feeds the '
  'geometry_version token of get_floor_snapshot_v1. Never reset, never written '
  'by application code -- let the triggers own it.';

-- -----------------------------------------------------------------------------
-- 2. Bump on changes to the floor_plans row itself
-- -----------------------------------------------------------------------------
-- BEFORE UPDATE, so the bump rides along on the caller's own write: no second
-- statement, no recursion, no extra tuple version.
--
-- The column list is exactly the set of floor_plans columns that appear in the
-- 'geometry' payload. Crucially geometry_version is NOT in it, which is what
-- lets the floor_plan_objects trigger below write geometry_version = +1 without
-- this trigger bumping it a second time.
--
-- created_at / updated_at / created_by / merchant_id / location_id are excluded
-- deliberately: they are not rendered, so touching them must not invalidate
-- every tablet's cache.
--
-- NOT SECURITY DEFINER, unlike its floor_plan_objects counterpart below. This
-- function reads and writes nothing but the NEW record already in flight, so it
-- has no RLS to be blocked by and nothing to gain from elevation. Adding
-- DEFINER here would widen the privileged surface for no reason.
CREATE OR REPLACE FUNCTION public.tg_floor_plans_bump_geometry_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.name             IS DISTINCT FROM OLD.name
  OR NEW.description      IS DISTINCT FROM OLD.description
  OR NEW.canvas_width     IS DISTINCT FROM OLD.canvas_width
  OR NEW.canvas_height    IS DISTINCT FROM OLD.canvas_height
  OR NEW.grid_size        IS DISTINCT FROM OLD.grid_size
  OR NEW.background_color IS DISTINCT FROM OLD.background_color
  OR NEW.display_order    IS DISTINCT FROM OLD.display_order
  OR NEW.is_active        IS DISTINCT FROM OLD.is_active
  OR NEW.is_default       IS DISTINCT FROM OLD.is_default
  THEN
    NEW.geometry_version := OLD.geometry_version + 1;
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.tg_floor_plans_bump_geometry_version() IS
  'BEFORE UPDATE on floor_plans: bumps geometry_version when a rendered column '
  'changes. Ignores geometry_version itself so the floor_plan_objects trigger '
  'cannot double-bump.';

REVOKE ALL ON FUNCTION public.tg_floor_plans_bump_geometry_version() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_floor_plans_bump_geometry_version ON public.floor_plans;
CREATE TRIGGER trg_floor_plans_bump_geometry_version
  BEFORE UPDATE ON public.floor_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_floor_plans_bump_geometry_version();

-- -----------------------------------------------------------------------------
-- 3. Bump on changes to the objects belonging to a floor plan
-- -----------------------------------------------------------------------------
-- STATEMENT-level with transition tables, not FOR EACH ROW. A statement that
-- moves 40 objects then produces ONE update of the parent instead of 40 HOT
-- updates of the same row. PostgreSQL forbids transition tables on a trigger
-- with more than one event, hence three triggers sharing one function; each
-- TG_OP branch is only ever planned under its own operation, so the branch
-- referencing newtab is never parsed during a DELETE and vice versa.
--
-- UPDATE unions old and new floor_plan_id so that RE-PARENTING an object
-- (moving a table from one plan to another) invalidates BOTH plans. Missing
-- that would leave the source plan showing a table it no longer owns.
--
-- The UPDATE branch bumps on any change, without inspecting which column moved.
-- That is deliberate over-approximation: every column of floor_plan_objects
-- except created_at/updated_at is rendered, and the asymmetry of the two
-- mistakes is total -- a spurious bump costs one redundant geometry payload,
-- a missed bump serves a wrong floor plan until someone force-reloads.
--
-- floor_plan_objects.floor_plan_id is ON DELETE CASCADE. When a floor plan is
-- deleted the children cascade first and this trigger then updates a parent row
-- already deleted in the same transaction, which matches zero rows and is a
-- harmless no-op. delete_floor_plan_cascade behaves the same way. Both are
-- correct: a deleted plan leaves the digest's key set, so the token changes
-- regardless of its final version number.
--
-- KNOWN GAP, accepted: TRUNCATE fires none of these three triggers, so
-- TRUNCATE floor_plan_objects would empty a floor plan without moving its
-- token, and every tablet would keep rendering the old layout. No application
-- path truncates this table -- deletes go through delete_floor_plan_cascade or
-- a PostgREST DELETE, both of which are row operations and both of which are
-- covered. Adding a TRUNCATE trigger is not worth the surface; a human running
-- TRUNCATE by hand should bump geometry_version by hand in the same
-- transaction, or simply DELETE instead.
CREATE OR REPLACE FUNCTION public.tg_floor_plan_objects_bump_geometry_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_plan_ids uuid[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT array_agg(DISTINCT n.floor_plan_id) INTO v_plan_ids FROM newtab n;

  ELSIF TG_OP = 'DELETE' THEN
    SELECT array_agg(DISTINCT o.floor_plan_id) INTO v_plan_ids FROM oldtab o;

  ELSE  -- UPDATE: invalidate the plan it left and the plan it joined
    SELECT array_agg(DISTINCT u.floor_plan_id) INTO v_plan_ids
    FROM (
      SELECT n.floor_plan_id FROM newtab n
      UNION
      SELECT o.floor_plan_id FROM oldtab o
    ) u;
  END IF;

  IF v_plan_ids IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.floor_plans fp
     SET geometry_version = fp.geometry_version + 1
   WHERE fp.id = ANY (v_plan_ids);

  RETURN NULL;
END;
$function$;

COMMENT ON FUNCTION public.tg_floor_plan_objects_bump_geometry_version() IS
  'AFTER STATEMENT on floor_plan_objects: bumps floor_plans.geometry_version for '
  'every plan touched. SECURITY DEFINER so the bump cannot be silently swallowed '
  'by floor_plans RLS when the caller authorized via impersonation.';

REVOKE ALL ON FUNCTION public.tg_floor_plan_objects_bump_geometry_version() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_fpo_bump_geometry_version_ins ON public.floor_plan_objects;
CREATE TRIGGER trg_fpo_bump_geometry_version_ins
  AFTER INSERT ON public.floor_plan_objects
  REFERENCING NEW TABLE AS newtab
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.tg_floor_plan_objects_bump_geometry_version();

DROP TRIGGER IF EXISTS trg_fpo_bump_geometry_version_upd ON public.floor_plan_objects;
CREATE TRIGGER trg_fpo_bump_geometry_version_upd
  AFTER UPDATE ON public.floor_plan_objects
  REFERENCING OLD TABLE AS oldtab NEW TABLE AS newtab
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.tg_floor_plan_objects_bump_geometry_version();

DROP TRIGGER IF EXISTS trg_fpo_bump_geometry_version_del ON public.floor_plan_objects;
CREATE TRIGGER trg_fpo_bump_geometry_version_del
  AFTER DELETE ON public.floor_plan_objects
  REFERENCING OLD TABLE AS oldtab
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.tg_floor_plan_objects_bump_geometry_version();

-- -----------------------------------------------------------------------------
-- 4. get_floor_snapshot_v1
-- -----------------------------------------------------------------------------
-- Returns:
--   {
--     "geometry_version": "<opaque md5>",
--     "geometry": [ ... ]        -- KEY ABSENT when p_geometry_version matched
--     "status":   [ { floor_plan_id, tables:[{id, session, next_reservation}],
--                     summary:{...} } ],
--     "sections": [ ... ]
--   }
--
-- p_floor_plan_id NULL  => every floor plan at the location (replaces
--                          get_location_floor_plans + N x get_floor_plan_status)
-- p_floor_plan_id set   => that one plan only.
--
-- AUTHORIZATION is preserved exactly as get_location_floor_plans expresses it:
-- is_merchant_admin_or_impersonating(fp.merchant_id), applied to floor_plans
-- rows. It is resolved ONCE into v_plan_ids and every later query is driven off
-- that already-authorized id array, so no unauthorized row can be reached
-- through the object, session, reservation or section subqueries.
--
-- On the per-row argument: is_merchant_admin_or_impersonating() takes a column
-- argument and therefore cannot be hoisted into an InitPlan -- the exact defect
-- Wave 1 removed from the order RLS policies. It is acceptable HERE and only
-- here because this is a SECURITY DEFINER function body evaluated once per
-- request over at most a handful of floor_plans rows (5 on all of prod), not an
-- RLS policy evaluated per row of a growing table. DO NOT copy this pattern
-- into any RLS policy.
--
-- Like get_location_floor_plans -- and unlike get_floor_plan -- an unauthorized
-- or empty scope RETURNS AN EMPTY SHAPE RATHER THAN RAISING, so the caller's
-- error handling is unchanged by cutover.
CREATE OR REPLACE FUNCTION public.get_floor_snapshot_v1(
  p_location_id uuid,
  p_floor_plan_id uuid DEFAULT NULL::uuid,
  p_geometry_version text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_plan_ids uuid[];
  v_version  text;
  v_geometry jsonb;
  v_status   jsonb;
  v_sections jsonb;
  v_result   jsonb;
BEGIN
  -- ---------------------------------------------------------------------
  -- Authorized scope + version token, in one pass over floor_plans.
  -- The digest covers the whole SET of (id, version) pairs, so adding or
  -- deleting a plan changes the token just as an edit does.
  -- ---------------------------------------------------------------------
  SELECT
    COALESCE(array_agg(fp.id ORDER BY fp.id), ARRAY[]::uuid[]),
    md5(COALESCE(
      string_agg(fp.id::text || ':' || fp.geometry_version::text, ',' ORDER BY fp.id),
      ''
    ))
  INTO v_plan_ids, v_version
  FROM public.floor_plans fp
  WHERE fp.location_id = p_location_id
    AND (p_floor_plan_id IS NULL OR fp.id = p_floor_plan_id)
    AND public.is_merchant_admin_or_impersonating(fp.merchant_id);

  -- ---------------------------------------------------------------------
  -- GEOMETRY — built only when the caller's token is stale or absent.
  -- Field set is get_location_floor_plans' verbatim, PLUS canvas_width,
  -- canvas_height, grid_size and background_color, which it omitted and
  -- which the client currently fetches in a separate round trip
  -- (stores/useFloorPlanStore.ts:866).
  -- ---------------------------------------------------------------------
  IF p_geometry_version IS DISTINCT FROM v_version THEN
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id',               fp.id,
          'name',             fp.name,
          'description',      fp.description,
          'canvas_width',     fp.canvas_width,
          'canvas_height',    fp.canvas_height,
          'grid_size',        fp.grid_size,
          'background_color', fp.background_color,
          'display_order',    fp.display_order,
          'is_active',        fp.is_active,
          'is_default',       fp.is_default,
          'geometry_version', fp.geometry_version,
          'table_count', (
            SELECT COUNT(*)
            FROM public.floor_plan_objects fpo
            WHERE fpo.floor_plan_id = fp.id
              AND fpo.category IN ('table', 'booth')
          ),
          'total_capacity', (
            SELECT COALESCE(SUM(fpo.capacity), 0)
            FROM public.floor_plan_objects fpo
            WHERE fpo.floor_plan_id = fp.id
              AND fpo.category IN ('table', 'booth')
          ),
          'objects', (
            SELECT COALESCE(
              jsonb_agg(
                jsonb_build_object(
                  'id',                fpo.id,
                  'name',              fpo.name,
                  'shape_id',          fpo.shape_id,
                  'category',          fpo.category,
                  'x',                 fpo.x,
                  'y',                 fpo.y,
                  'rotation',          fpo.rotation,
                  'width',             fpo.width,
                  'height',            fpo.height,
                  'capacity',          fpo.capacity,
                  'min_capacity',      fpo.min_capacity,
                  'is_reservable',     fpo.is_reservable,
                  'is_combinable',     fpo.is_combinable,
                  'default_turn_time', fpo.default_turn_time,
                  'section_id',        fpo.section_id,
                  'zone_name',         fpo.zone_name,
                  'label_override',    fpo.label_override,
                  'color_override',    fpo.color_override,
                  'z_index',           fpo.z_index,
                  'is_visible',        fpo.is_visible,
                  'is_active',         fpo.is_active
                ) ORDER BY fpo.z_index ASC, fpo.created_at ASC
              ),
              '[]'::jsonb
            )
            FROM public.floor_plan_objects fpo
            WHERE fpo.floor_plan_id = fp.id
          )
        ) ORDER BY fp.display_order, fp.name
      ),
      '[]'::jsonb
    )
    INTO v_geometry
    FROM public.floor_plans fp
    WHERE fp.id = ANY (v_plan_ids);
  END IF;

  -- ---------------------------------------------------------------------
  -- STATUS — always returned. Volatile fields ONLY; the client joins to
  -- cached geometry by object id. Safe because a geometry change would have
  -- moved the token and resent geometry in this same response.
  -- ---------------------------------------------------------------------
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'floor_plan_id', fp.id,
        'tables', (
          SELECT COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'id', fpo.id,
                'session', (
                  -- tst.is_active makes this scalar subquery provably
                  -- single-row via idx_unique_active_table
                  -- (UNIQUE (table_id) WHERE is_active = true).
                  SELECT jsonb_build_object(
                    'id',              ts.id,
                    'session_number',  ts.session_number,
                    'status',          ts.status,
                    'party_size',      ts.party_size,
                    'guest_name',      ts.guest_name,
                    'server_staff_id', ts.server_staff_id,
                    'order_id',        ts.order_id,
                    'seated_at',       ts.seated_at,
                    'current_course',  ts.current_course,
                    'needs_attention', ts.needs_attention,
                    'is_vip',          ts.is_vip,
                    'minutes_seated',  EXTRACT(EPOCH FROM (NOW() - ts.seated_at)) / 60,
                    'merged_tables', (
                      SELECT jsonb_agg(tst2.table_id ORDER BY tst2.seated_position)
                      FROM public.table_session_tables tst2
                      WHERE tst2.session_id = ts.id
                        AND tst2.is_active = TRUE
                        AND tst2.table_id <> fpo.id
                    )
                  )
                  FROM public.table_sessions ts
                  JOIN public.table_session_tables tst ON tst.session_id = ts.id
                  WHERE tst.table_id = fpo.id
                    AND tst.is_active = TRUE
                    AND ts.is_active = TRUE
                ),
                'next_reservation', (
                  SELECT jsonb_build_object(
                    'id',         r.id,
                    'party_name', r.party_name,
                    'party_size', r.party_size,
                    'time',       r.reservation_time,
                    'status',     r.status
                  )
                  FROM public.reservations r
                  WHERE r.assigned_table_ids @> ARRAY[fpo.id]
                    AND r.reservation_date = CURRENT_DATE
                    AND r.status IN ('pending', 'confirmed', 'reminded')
                  ORDER BY r.reservation_time
                  LIMIT 1
                )
              ) ORDER BY fpo.id
            ),
            '[]'::jsonb
          )
          FROM public.floor_plan_objects fpo
          WHERE fpo.floor_plan_id = fp.id
            AND fpo.category IN ('table', 'booth')
            AND fpo.is_active = TRUE
        ),
        'summary', (
          -- See header: get_floor_plan_status omits tst.is_active here and
          -- fans out, reporting 1,051 tables for a 14-table room. The filter
          -- below caps the join at one row per object by unique index.
          SELECT jsonb_build_object(
            'total_tables',   COUNT(*),
            'available',      COUNT(*) FILTER (WHERE s.session_id IS NULL),
            'occupied',       COUNT(*) FILTER (WHERE s.session_id IS NOT NULL),
            'total_capacity', COALESCE(SUM(s.capacity), 0),
            'current_covers', COALESCE(SUM(COALESCE(s.party_size, 0)), 0)
          )
          FROM (
            SELECT
              fpo.id,
              fpo.capacity,
              ts.id         AS session_id,
              ts.party_size
            FROM public.floor_plan_objects fpo
            LEFT JOIN public.table_session_tables tst
              ON tst.table_id = fpo.id
             AND tst.is_active = TRUE
            LEFT JOIN public.table_sessions ts
              ON ts.id = tst.session_id
             AND ts.is_active = TRUE
            WHERE fpo.floor_plan_id = fp.id
              AND fpo.category IN ('table', 'booth')
              AND fpo.is_active = TRUE
          ) s
        )
      ) ORDER BY fp.display_order, fp.name
    ),
    '[]'::jsonb
  )
  INTO v_status
  FROM public.floor_plans fp
  WHERE fp.id = ANY (v_plan_ids);

  -- ---------------------------------------------------------------------
  -- SECTIONS — always returned, never versioned: assigned_staff_id changes
  -- whenever a section is reassigned mid-shift. Same is_active = TRUE filter
  -- get_floor_plan uses, plus floor_plan_id so the client can bucket them.
  -- NOTE: server_sections holds 0 rows on prod today, so this branch has been
  -- reviewed but not exercised against real data.
  -- ---------------------------------------------------------------------
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id',                ss.id,
        'floor_plan_id',     ss.floor_plan_id,
        'name',              ss.name,
        'color',             ss.color,
        'assigned_staff_id', ss.assigned_staff_id,
        'is_active',         ss.is_active
      ) ORDER BY ss.name, ss.id
    ),
    '[]'::jsonb
  )
  INTO v_sections
  FROM public.server_sections ss
  WHERE ss.floor_plan_id = ANY (v_plan_ids)
    AND ss.is_active = TRUE;

  -- ---------------------------------------------------------------------
  -- Assemble. 'geometry' is added as a key ONLY on a cold/stale call.
  -- jsonb_strip_nulls is deliberately NOT used: it would recurse and delete
  -- legitimately-null session fields such as guest_name and order_id.
  -- ---------------------------------------------------------------------
  v_result := jsonb_build_object(
    'geometry_version', v_version,
    'status',           v_status,
    'sections',         v_sections
  );

  IF v_geometry IS NOT NULL THEN
    v_result := v_result || jsonb_build_object('geometry', v_geometry);
  END IF;

  RETURN v_result;
END;
$function$;

COMMENT ON FUNCTION public.get_floor_snapshot_v1(uuid, uuid, text) IS
  'One-round-trip floor snapshot for a location. Replaces get_location_floor_plans '
  '+ N x get_floor_plan_status + the remedial canvas-dimension select. Omits the '
  'geometry key entirely when p_geometry_version matches the current token, so '
  'steady-state polling carries only session/reservation status. See AUD-2. '
  'NOTE: its summary block fixes a fan-out bug still present in '
  'get_floor_plan_status, so summary values differ from that RPC by design.';

REVOKE ALL ON FUNCTION public.get_floor_snapshot_v1(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_floor_snapshot_v1(uuid, uuid, text)
  TO authenticated, service_role;

COMMIT;

-- =============================================================================
-- HOW TO TEST (staging, before any client change)
-- =============================================================================
-- 1. Cold call returns geometry, and the token is stable across repeat calls:
--      SELECT public.get_floor_snapshot_v1('<location>') ? 'geometry';   -- true
--      SELECT public.get_floor_snapshot_v1('<location>')->>'geometry_version';
--
-- 2. Warm call omits geometry but still returns status:
--      WITH t AS (SELECT public.get_floor_snapshot_v1('<location>') s)
--      SELECT (s->>'geometry_version') AS tok,
--             public.get_floor_snapshot_v1('<location>', NULL, s->>'geometry_version') ? 'geometry'  -- false
--        FROM t;
--
-- 3. Every mutation path moves the token. Run each of these and re-read the
--    token; it MUST differ every time. The direct PostgREST forms are the ones
--    a function-side implementation would have missed:
--      SELECT public.update_floor_plan_object_position('<obj>', 10, 10);
--      SELECT public.add_floor_plan_object('<plan>','T99','round','table');
--      SELECT public.update_floor_plan_objects_batch('[{"id":"<obj>","x":5,"y":5}]');
--      UPDATE public.floor_plan_objects SET width = width  WHERE id = '<obj>';
--      UPDATE public.floor_plan_objects SET name  = name || '' WHERE id = '<obj>';
--      DELETE FROM public.floor_plan_objects WHERE id = '<obj>';
--      UPDATE public.floor_plans SET canvas_width = canvas_width + 1 WHERE id = '<plan>';
--      INSERT INTO public.floor_plans (...);      -- token changes: set membership
--      DELETE FROM public.floor_plans WHERE id = '<plan>';  -- ditto
--
-- 4. A NON-geometry write must NOT move the token:
--      UPDATE public.floor_plans SET updated_at = now() WHERE id = '<plan>';
--
-- 5. Multi-row statement bumps exactly once (statement-level trigger):
--      SELECT geometry_version FROM public.floor_plans WHERE id = '<plan>';
--      UPDATE public.floor_plan_objects SET x = x WHERE floor_plan_id = '<plan>';
--      SELECT geometry_version FROM public.floor_plans WHERE id = '<plan>';  -- +1, not +N
--
-- 6. Re-parenting bumps BOTH plans:
--      UPDATE public.floor_plan_objects SET floor_plan_id = '<planB>' WHERE id = '<obj>';
--
-- 7. Geometry equivalence against the RPC being replaced (must be empty):
--      SELECT jsonb_array_elements(public.get_floor_snapshot_v1('<loc>')->'geometry')
--             - 'canvas_width' - 'canvas_height' - 'grid_size'
--             - 'background_color' - 'geometry_version'
--      EXCEPT
--      SELECT jsonb_array_elements(public.get_location_floor_plans('<loc>')::jsonb);
--
--    ALREADY VERIFIED READ-ONLY ON PROD 2026-08-13, both directions, all 5
--    floor plans on the platform:
--      in_v1_not_old 0 | in_old_not_v1 0 | plans_compared 5
--    This also settles the json -> jsonb switch: every value in the geometry
--    payload, including the floor_object_category and *_status ENUMS, round
--    trips through jsonb_build_object to byte-identical output. Re-run on
--    staging anyway -- it is the cheapest possible guard on the client cutover.
--
-- 8. Summary DIVERGENCE is expected and correct, in total_tables /
--    total_capacity / available only. Confirm v1 matches reality:
--      SELECT count(*), sum(capacity) FROM public.floor_plan_objects
--       WHERE floor_plan_id = '<plan>' AND category IN ('table','booth') AND is_active;
--    v1's total_tables / total_capacity must equal these; get_floor_plan_status's
--    will not. occupied and current_covers must match BOTH functions -- if they
--    do not, something else changed and this migration is not the cause.
--
-- 9. Authorization: call as a merchant admin of ANOTHER merchant. Must return
--    geometry_version = md5('') = d41d8cd98f00b204e9800998ecf8427e, and
--    geometry [], status [], sections [] -- never rows, never an exception.
--    Note the unauthorized response DOES carry a geometry key (an empty array),
--    because an absent token never matches. Absent-geometry is reserved
--    exclusively for "your cache is still valid".
--
-- 10. Empty floor plan: v1's summary must report total_capacity 0 and
--     current_covers 0 where get_floor_plan_status reports null for both.
--     Confirms the COALESCE difference documented in the header.
-- =============================================================================

-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.get_floor_snapshot_v1(uuid, uuid, text);
--
-- DROP TRIGGER IF EXISTS trg_fpo_bump_geometry_version_ins ON public.floor_plan_objects;
-- DROP TRIGGER IF EXISTS trg_fpo_bump_geometry_version_upd ON public.floor_plan_objects;
-- DROP TRIGGER IF EXISTS trg_fpo_bump_geometry_version_del ON public.floor_plan_objects;
-- DROP FUNCTION IF EXISTS public.tg_floor_plan_objects_bump_geometry_version();
--
-- DROP TRIGGER IF EXISTS trg_floor_plans_bump_geometry_version ON public.floor_plans;
-- DROP FUNCTION IF EXISTS public.tg_floor_plans_bump_geometry_version();
--
-- -- Drop the column LAST, and only if no client build in the field is still
-- -- sending tokens. Dropping it is safe for the old RPCs (none reference it),
-- -- but any surviving v1 caller would break -- revert the client first.
-- ALTER TABLE public.floor_plans DROP COLUMN IF EXISTS geometry_version;
-- COMMIT;
--
-- get_location_floor_plans, get_floor_plan, get_floor_plan_objects_with_sessions
-- and get_floor_plan_status are untouched by this migration and remain live
-- throughout, so a client revert alone is a complete rollback.
-- =============================================================================
