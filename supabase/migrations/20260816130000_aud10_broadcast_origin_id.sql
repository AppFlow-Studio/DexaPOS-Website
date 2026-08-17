-- =============================================================================
-- AUD-10 — broadcast origin_id: let a station recognise its own echo
-- =============================================================================
-- Source: Notion [POS-PERF] AUD-10. DB half ONLY. The client half (echo
--         suppression behind a kill switch, default OFF) ships separately.
--
-- PROBLEM
--   Every cart mutation a station performs comes back to that same station a
--   moment later as a realtime broadcast and is re-processed as though it were
--   news. The station already applied the change optimistically, so the work
--   is pure waste: a re-hydration plus a re-render per keystroke-scale edit.
--
--   The client already MEASURES this and cannot yet FIX it. See
--   stores/useOrderStore.ts ~5521:
--       if (isOwnStationOrder) recordCount(KEY_RT_OWN_ECHO);
--       // "how often do our own echoes slip past the noMeaningfulChange skip"
--   The payload carries nothing that identifies who performed the write, so
--   the only available proxy is `station_id` — which is the order's OWNING
--   station, NOT the author of this particular mutation. Those differ any time
--   station B edits an order owned by station A (expo, bar, manager station,
--   floor-plan transfers). Suppressing on `station_id` would drop legitimate
--   cross-station updates. That is precisely why this needs a new field.
--
--   This migration adds that one missing fact: `origin_id`.
--
-- =============================================================================
-- GROUND TRUTH, MAPPED BEFORE DESIGNING
-- Read this section before reviewing the code. Three facts about how this
-- actually works — none of them visible from the client — drove every design
-- decision below, and each was verified read-only against staging
-- (dfwqakoyittmrwbqvxgw) on 2026-08-16.
-- =============================================================================
--
--   FACT 1 — no RPC builds the broadcast. A TRIGGER does.
--     The POS calls add_order_item_v3 / update_order_item_v3 / … but not one
--     of them emits anything. Exactly one function builds the order payload:
--     public.broadcast_order_changes(), and it is reached only as a trigger.
--     Therefore p_origin_id cannot simply be "put into the payload" by the
--     RPC — it has to travel from the RPC to a trigger that takes no
--     arguments and sees only NEW/OLD.
--
--   FACT 2 — that trigger is DEFERRED, and it is the ONLY one left.
--       CREATE CONSTRAINT TRIGGER orders_broadcast_trigger_deferred
--         AFTER INSERT OR DELETE OR UPDATE ON public.orders
--         DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
--         EXECUTE FUNCTION broadcast_order_changes()
--     It fires during pre-commit, still inside the writing transaction.
--     broadcast_order_item_changes() and broadcast_order_item_modifier_changes()
--     still EXIST as functions but are attached to NOTHING — verified: the only
--     non-internal trigger using any broadcast_order* function is the one
--     above. Item and modifier edits reach the wire solely because the cart
--     RPCs update the parent order's totals. So there is ONE payload builder to
--     touch, not three.
--
--   FACT 3 — broadcast_order_changes() is NOT SECURITY DEFINER.
--     It runs as the calling role. Any mechanism that requires the trigger to
--     READ a row would therefore have to clear RLS, i.e. drag in a second
--     SECURITY DEFINER reader function and a new grant surface. The mechanism
--     chosen below reads no rows at all, so this problem does not arise.
--
-- =============================================================================
-- MECHANISM — transaction-local GUC, chosen over a stamp table
-- =============================================================================
--   The wrapper RPCs call set_broadcast_origin(p_origin_id), which does
--       set_config('app.broadcast_origin_id', <uuid>::text, true)
--                                                            ^^^^
--                                              is_local => TRANSACTION-scoped
--   and the trigger reads it back with current_setting(…, missing_ok => true).
--
--   Why not a stamp table (the obvious alternative, and the one a previous
--   draft of this ticket used):
--
--     - COST. This is a PERFORMANCE ticket. A stamp table adds a real write
--       (and eventually GC) to every cart mutation in order to save a
--       re-render. The GUC costs zero writes, zero WAL, zero bloat.
--     - CROSS-TRANSACTION STALENESS BECOMES IMPOSSIBLE, rather than guarded.
--       A stamp table must not let station A's stamp leak onto station B's
--       later broadcast — if it does, echo suppression eats a legitimate
--       cross-station update. A table prevents that with a hand-written
--       xact_id predicate that has to be correct. A transaction-local GUC
--       cannot leak by construction: it is reverted when the transaction ends,
--       and PostgREST runs each RPC in its own transaction.
--     - NO NEW RLS SURFACE. See FACT 3.
--
--   FAIL-SAFE DIRECTION (the property that makes this low risk):
--   if the GUC is somehow not visible when the deferred trigger fires, then
--   origin_id is simply NULL, the client suppresses nothing, and behaviour is
--   byte-identical to today. The failure mode is "the optimisation does
--   nothing", never "an update is lost". Combined with a client kill switch
--   that ships default-OFF, the blast radius is nil.
--
-- =============================================================================
-- PAYLOAD CONTRACT — ADDITIVE ONLY
-- =============================================================================
--   ADDED   data.order.origin_id            uuid or null — author of the write
--   CHANGED data.order._broadcast_version   3 -> 4        (value, not shape)
--
--   NOTHING is removed and NOTHING is renamed. `card_subtotal` in particular
--   is still emitted (stores/useOrderStore.ts reads it for activeOrderSubtotal)
--   and is untouched, as are card_tax_amount / card_total / cash_total and the
--   whole SC-snapshot block.
--
--   Money stays NUMERIC(12,2) dollars. origin_id is a uuid and carries no
--   monetary meaning; no money field is touched by this migration.
--
--   The _broadcast_version bump is safe. Verified every client read of it:
--     hooks/realtime/useOrdersRealtime.ts:329  — Sentry tag only, String(v).
--     stores/useOrderStore.ts:5517 -> hasItemLevelChanges(…, broadcastVersion)
--       whose only test is `if ((broadcastVersion ?? 1) >= 2) return false;`
--   Both are >= comparisons or pure telemetry. No client compares === 3.
--
--   SEQUENCING — the wire format must change exactly ONCE (requirement 5).
--   The v3 payload trim (20260713120000_broadcast_order_changes_v3_payload_trim)
--   is ALREADY APPLIED on staging — confirmed present in
--   supabase_migrations.schema_migrations, and the live body carries
--   '_broadcast_version', 3 plus the v3 jsonb_strip_nulls block. The body
--   recreated below is that post-trim body with origin_id inserted, so a
--   station that upgrades once sees trim+origin as a single format change.
--   On any environment still PRE-trim, 20260713120000 must be applied before
--   this file — and that ordering is ENFORCED, not merely requested: the
--   pre-image md5 guard in PART 0 aborts this migration if the live body is
--   not the exact text this change was based on.
--
-- =============================================================================
-- NEVER-SUPPRESS LIST — normative for the CLIENT half
-- =============================================================================
--   origin_id is a HINT, never an instruction. A matching origin_id means
--   "you already applied this optimistically", which is only ever true for
--   the narrow class of local cart edits stamped below. The client MUST apply
--   the broadcast regardless of origin_id when any of these hold:
--
--     1. SERVER-AUTHORED STATUS CHANGES. Any change to status, check_status,
--        payment_status, sent_to_kitchen_at, completed_at, cancelled_at.
--        The server normalises and re-derives these (e.g. accept normalises to
--        sent_to_kitchen); the local optimistic value is a guess, not a copy.
--     2. CROSS-STATION PAYMENTS. Any payload where order_payments or
--        payment_items is present (the trigger only attaches them when
--        payment_status / amount_paid / amount_due actually moved), or where
--        amount_paid / amount_due / cash_amount_due differ. Money must never
--        be skipped — see the "payment flash-then-gone" incident.
--     3. KDS-ORIGINATED TRANSITIONS. Anything reaching the order via KDS
--        (bulk_update_order_item_status_v2, recall_kds_items_v2, fire_course,
--        mark_course_served). These are never stamped here and must never be
--        inferred as local.
--     4. VOID AND REFUND EVENTS. Item voids, order voids, refunds, reversals,
--        and any payload where is_returned / refunded_amount / return_* moved.
--
--     Belt and braces on (4): void_order_item is DELIBERATELY NOT given a
--     stamping wrapper by this migration, so its broadcasts cannot carry an
--     origin_id at all and are therefore structurally unsuppressable. Same
--     principle as the GUC choice — make the dangerous case impossible rather
--     than guarded. This is intentional; do not "complete the set" later
--     without revisiting this paragraph.
--
--   COVERAGE IS PARTIAL, BY DESIGN — read this before measuring the win.
--   These mutations also reach orders/order_items and therefore also fire a
--   broadcast, but are NOT given stamping wrappers here:
--       set_item_course, set_item_seat, toggle_to_go_order_items,
--       toggle_priority_order_items, toggle_rush_order_items,
--       void_order_item (see the paragraph above), update_order_status
--   Their broadcasts carry origin_id = null, so the client suppresses nothing
--   and behaviour is exactly as it is today. That is fail-safe, not a bug: the
--   failure mode of an unstamped path is the status quo. It does mean the echo
--   reduction measured after this ships will be PARTIAL — do not read a
--   less-than-total drop in the KEY_RT_OWN_ECHO counter as the stamp being
--   broken. The five toggles above are low-frequency relative to add/update/
--   remove and were left out to keep the first wave's blast radius small; they
--   are the obvious wave-2 candidates. update_order_status and void_order_item
--   are NOT candidates — they are never-suppress paths (1) and (4).
--
--   RECOMMENDATION FOR THE CLIENT HALF — origin_id should be a random uuid
--   generated once per app boot, NOT the station_id. Two reasons: (a) two
--   surfaces on one station (POS + CFD) are distinct writers; (b) station_id
--   is well-known to every other station, so a hostile or buggy client could
--   stamp a victim's id and make that victim skip a real update. A per-boot
--   random uuid makes that require guessing a uuid, and the never-suppress
--   list above bounds the damage even then.
--
-- =============================================================================
-- WHAT WAS VERIFIED, AND WHAT WAS NOT
-- =============================================================================
--   VERIFIED read-only against staging (dfwqakoyittmrwbqvxgw), 2026-08-16:
--     - trigger wiring, deferrability, and that the item/modifier broadcast
--       triggers are detached (FACT 2);
--     - broadcast_order_changes() is not SECURITY DEFINER and carries
--       SET search_path TO 'public', 'pg_temp' (FACT 3) — both preserved
--       verbatim below;
--     - the live body, md5-pinned in PART 0. The replacement was produced by
--       inserting into that exact fetched text, not retyped from memory;
--     - identity, return type (json vs jsonb — they differ across delegates),
--       SECURITY DEFINER status and EXACT DEFAULT EXPRESSIONS of all eleven
--       delegates. Defaults are reproduced verbatim: a wrapper defaulting
--       p_quantity to NULL where the delegate defaults it to 1 would silently
--       change behaviour;
--     - all eleven delegate signature strings used by the PART 0 assertion
--       resolve via to_regprocedure (11/11);
--     - set_config(name, val, true) / current_setting(name, true) round-trip,
--       the uuid cast, and that current_setting returns NULL when unset;
--     - no pre-existing `app.broadcast%` GUC and no existing origin_id key in
--       the payload — nothing to collide with;
--     - PostgreSQL 17.6.
--
--   NOT VERIFIED — nothing in this file has been EXECUTED. Agent-applied DDL
--   is forbidden in this program after two prior incidents, so it could not be
--   run. Names inside a plpgsql body resolve at RUNTIME; this program has
--   already shipped a migration that applied with zero errors and then failed
--   on first call. PART 0 converts as much of that risk as possible into
--   apply-time failure, but the following MUST be run before this is called
--   done. Run the POSITIVE case, not only the negative one — a guard that
--   correctly denies an attacker while also denying the legitimate owner
--   passes the negative test and is still broken.
--
--     (1) POSITIVE — a stamped mutation must echo its own origin_id.
--         As a NORMAL `authenticated` merchant session (NOT postgres — a
--         superuser test would mask a grant mistake), subscribe to
--         location:<loc>:orders, then:
--           select public.add_order_item_v4(
--                    p_order_id => '<order>', p_menu_item_id => '<item>',
--                    p_quantity => 1, p_unit_price => 9.99,
--                    p_origin_id => '11111111-1111-4111-8111-111111111111');
--         EXPECT on the wire:
--           data.order.origin_id           = '1111…'
--           data.order._broadcast_version  = 4
--           data.order.card_subtotal       still present and correct
--
--     (2) NEGATIVE — an UNSTAMPED mutation must carry origin_id = null.
--         Call the v3 delegate directly, with no p_origin_id at all.
--         EXPECT data.order.origin_id IS NULL, and every legacy client
--         unaffected.
--
--     (3) THE DEFERRED-TRIGGER READ — the one genuinely unproven assumption.
--         PostgreSQL fires deferred constraint triggers during pre-commit,
--         before transaction-local GUCs are reverted, so the trigger should
--         see the value. This could NOT be executed here. Test (1) proves it
--         directly: if origin_id comes back null there while the wrapper
--         clearly ran, this assumption is wrong. If so the feature is inert,
--         NOT broken (see FAIL-SAFE DIRECTION) — and the fix is to stamp
--         orders.updated_at's row instead, not to revert anything.
--
--     (4) EVERY WRAPPER RESOLVES ITS DELEGATE. PART 0 asserts the eleven
--         delegates exist at apply time, but the named-argument call inside
--         each wrapper still resolves at runtime. Call each of the eleven once
--         with p_origin_id set and confirm a normal result plus origin_id on
--         the wire. Pay special attention to add_order_item_v4 and
--         replace_order_item_modifiers_v3: their delegates are DOUBLY
--         OVERLOADED (see PART 3) and a bad call raises
--         "function … is not unique" at RUNTIME only.
--
--     (5) NO EXTRA BROADCASTS. Confirm one cart edit still produces exactly
--         one order broadcast. The wrappers deliberately perform no write of
--         their own; if a future change adds one, the deferred per-row trigger
--         will fire twice and this perf ticket will have made things worse.
--
-- =============================================================================
-- HOUSE-CONVENTION NOTE — new names, deliberately
-- =============================================================================
--   The brief allowed adding p_origin_id in place, drop-and-recreating where a
--   defaulted parameter would create an ambiguous overload. This file instead
--   ships NEW functions ALONGSIDE, per the standing rule "new RPCs ship
--   alongside existing ones; never edit a live RPC in place". Two concrete
--   reasons, neither stylistic:
--
--     - THE AMBIGUITY IS ALREADY REAL, not hypothetical. Two targets are
--       ALREADY doubly overloaded on staging:
--         add_order_item_v3                14-arg AND 20-arg
--         replace_order_item_modifiers_v2   2-arg AND  3-arg  (json vs jsonb!)
--       services/orderService.ts:1746 documents the second and dispatches on
--       signature on purpose. Adding a defaulted parameter in place means
--       DROPPING and RECREATING live, hot-path, money-adjacent functions.
--     - DROP-AND-RECREATE WOULD REQUIRE REPRODUCING ELEVEN plpgsql BODIES
--       COPIED FROM STAGING — into a file that will also be applied to PROD.
--       Staging and prod drift. Any prod-only fix inside any of those bodies
--       would be silently reverted. That is the exact failure this program has
--       already been bitten by. A wrapper reproduces no body, so drift is
--       irrelevant to it.
--
--   The requirement the brief was protecting is met in full, and then some:
--   p_origin_id is `uuid DEFAULT NULL` on every new function, and existing
--   clients keep working because every existing function is left byte-identical
--   — only broadcast_order_changes() is modified, additively. The client half
--   opts in by adding a v4/v3/v2 tier to rpcWithIdempotency's name ladder in
--   services/orderService.ts, exactly as previous waves did.
--
--   The wrappers delegate 1:1 and add no privilege of their own: authorization,
--   idempotency, station-ownership checks, pricing and totals all remain in the
--   untouched delegate. Their only added effect is setting one GUC.
--
-- Applies cleanly inside a transaction. No CONCURRENTLY, no index work, no
-- table rewrite, no data migration.
-- =============================================================================

BEGIN;

-- =============================================================================
-- PART 0 — pre-flight assertions (fail at APPLY time, not on first call)
-- =============================================================================

-- 0a. Pre-image pin. Guarantees we are editing the body we actually read, and
--     enforces the trim-before-origin ordering described under SEQUENCING.
--     If this fires: diff the live body against the one recreated in PART 2,
--     reconcile by hand, then update the constant. Do NOT simply delete the
--     guard — that is how a prod-only fix gets silently reverted.
DO $guard$
DECLARE
  v_expected constant text := '01227a524798a10cae91892173e4f3de';
  v_actual   text;
BEGIN
  SELECT md5(pg_get_functiondef('public.broadcast_order_changes'::regproc))
    INTO v_actual;

  IF v_actual IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION
      'AUD-10 aborted: broadcast_order_changes() pre-image drift. expected md5 %, found %. This environment is not at the state this migration was written against (most likely 20260713120000_broadcast_order_changes_v3_payload_trim has not been applied here yet, or a hotfix landed on this environment only). Reconcile before applying — see SEQUENCING in the header.',
      v_expected, v_actual;
  END IF;
END
$guard$;

-- 0b. Delegate existence. Every wrapper in PART 3 calls one of these by name,
--     and plpgsql resolves those names at RUNTIME. Asserting here turns a
--     first-call production failure into an apply-time abort.
DO $delegates$
DECLARE
  v_sig     text;
  v_missing text[] := ARRAY[]::text[];
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public.add_order_item_v3(uuid,uuid,integer,numeric,numeric,text,text,uuid,uuid,text,numeric,jsonb,text,integer,integer,uuid,text,uuid,uuid,uuid)',
    'public.add_open_item_v3(uuid,text,numeric,integer,text,boolean,integer,uuid,uuid,boolean)',
    'public.update_order_item_quantity_v3(uuid,integer,uuid)',
    'public.update_order_item_v3(uuid,integer,numeric,text,integer,uuid)',
    'public.replace_order_item_modifiers_v2(uuid,jsonb,uuid)',
    'public.add_order_item_modifier_v2(uuid,uuid,uuid,text,text,numeric,integer,uuid,uuid)',
    'public.remove_order_item_modifier_v2(uuid,uuid,uuid)',
    'public.duplicate_order_item_v2(uuid,integer,uuid,uuid)',
    'public.remove_order_item(uuid)',
    'public.remove_order_items_batch(uuid[])',
    'public.clear_order_items(uuid)'
  ]
  LOOP
    IF to_regprocedure(v_sig) IS NULL THEN
      v_missing := v_missing || v_sig;
    END IF;
  END LOOP;

  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION
      'AUD-10 aborted: wrapper delegate(s) absent on this environment: %. The wrappers would compile and then fail on first call.',
      array_to_string(v_missing, ', ');
  END IF;
END
$delegates$;

-- =============================================================================
-- PART 1 — the origin channel
-- =============================================================================

-- Sets the transaction-local GUC that broadcast_order_changes() reads back.
--
-- is_local => true is LOAD-BEARING. With false the value would persist on the
-- pooled connection and leak into the NEXT, unrelated request on that same
-- connection — which would make a different station's write look like a local
-- echo and get it suppressed. It must never be changed to false.
--
-- NULL in => no-op, so an unstamped call leaves the GUC unset and the payload
-- gets origin_id: null. This is what makes p_origin_id DEFAULT NULL genuinely
-- backwards compatible rather than nominally so.
CREATE OR REPLACE FUNCTION public.set_broadcast_origin(p_origin_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF p_origin_id IS NULL THEN
    RETURN;
  END IF;

  PERFORM set_config('app.broadcast_origin_id', p_origin_id::text, true);
END;
$$;

COMMENT ON FUNCTION public.set_broadcast_origin(uuid) IS
  'AUD-10. Stamps the current transaction with the id of the station/surface performing the write, for broadcast_order_changes() to echo back as data.order.origin_id. Transaction-local by design. Calling this on its own from a client is a no-op: PostgREST gives every RPC its own transaction, so the stamp must be set by the same RPC that performs the write.';

REVOKE ALL ON FUNCTION public.set_broadcast_origin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_broadcast_origin(uuid)
  TO authenticated, service_role;

-- =============================================================================
-- PART 2 — broadcast_order_changes(): emit origin_id (ADDITIVE)
-- =============================================================================
-- Recreated from the md5-pinned live body (see PART 0a). Diff against that
-- pre-image and you will find exactly four changes, all additive:
--   1. declare v_origin_id uuid;
--   2. a guarded read of the GUC at the top of the body;
--   3. 'origin_id' added to the DELETE-branch order object;
--   4. 'origin_id' added to order_data, and _broadcast_version 3 -> 4.
-- Everything else — the v3 payment strip_nulls block, card_subtotal, the SC
-- snapshot block, the QR emission, the exception handler — is byte-identical.
--
-- NOTE: no SECURITY DEFINER, matching the live definition (FACT 3). Reading a
-- GUC needs no privileges. Do not "helpfully" add it.
CREATE OR REPLACE FUNCTION public.broadcast_order_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  payload jsonb;
  order_data jsonb;
  order_payments_data jsonb;
  payment_items_data jsonb;

  v_topic text;
  v_location_id uuid;
  v_station_name text;
  v_item_count integer;
  v_qr_session_token text;
  v_qr_topic text;
  v_qr_payload jsonb;
  v_should_emit_qr boolean := false;
  v_origin_id uuid;
begin
  -- AUD-10: who performed this write, if anyone said so. The nested handler is
  -- deliberate: this trigger's outer handler swallows exceptions and returns
  -- null, so an unparseable GUC would silently DROP THE ENTIRE BROADCAST. Only
  -- set_broadcast_origin(uuid) writes this GUC and it is already type-safe, so
  -- this should be unreachable — it exists so that it cannot cost us a
  -- broadcast if it ever is reachable.
  begin
    v_origin_id := nullif(current_setting('app.broadcast_origin_id', true), '')::uuid;
  exception
    when others then
      v_origin_id := null;
  end;

  v_location_id := coalesce(new.location_id, old.location_id);

  if v_location_id is null then
    return null;
  end if;

  v_topic := 'location:' || v_location_id::text || ':orders';

  if tg_op = 'DELETE' then
    payload := jsonb_build_object(
      'operation', tg_op,
      'timestamp', now(),
      'data', jsonb_build_object(
        'order', jsonb_build_object(
          'id', old.id,
          'order_number', old.order_number,
          'location_id', old.location_id,
          'station_id', old.station_id,
          'origin_id', v_origin_id
        )
      )
    );
  else
    select station_name into v_station_name
    from public.stations
    where id = new.station_id;

    select count(*) into v_item_count
    from public.order_items
    where order_id = new.id
      and coalesce(is_voided, false) = false;

    if tg_op = 'INSERT' or (
      tg_op = 'UPDATE' and (
        new.payment_status is distinct from old.payment_status or
        new.amount_paid is distinct from old.amount_paid or
        new.amount_due is distinct from old.amount_due
      )
    ) then
      -- v3: strip null-valued keys per payment (cash payments carry ~20 null
      -- card/return keys and vice versa), then re-attach the two nullable
      -- fields the client reads WITHOUT coalescing so their keys stay
      -- present even when null (hydration parity: null, never undefined).
      select coalesce(jsonb_agg(
        jsonb_strip_nulls(
          jsonb_build_object(
            'id', op.id,
            'order_id', op.order_id,
            'payment_method', op.payment_method,
            'amount', op.amount,
            'tip_amount', coalesce(op.tip_amount, 0),
            'total_amount', op.total_amount,
            'status', op.status,
            'amount_tendered', op.amount_tendered,
            'change_given', coalesce(op.change_given, 0),
            'is_cash_priced', coalesce(op.is_cash_priced, false),
            'original_amount', op.original_amount,
            'split_portion_index', op.split_portion_index,
            'split_count', op.split_count,
            'covers_items', coalesce(op.covers_items, array[]::uuid[]),
            'card_type', op.card_type,
            'card_last_four', op.card_last_four,
            'transaction_id', op.transaction_id,
            'terminal_type', op.terminal_type,
            'is_voided', coalesce(op.is_voided, false),
            'void_reason', op.void_reason,
            'refunded_amount', coalesce(op.refunded_amount, 0),
            'refunded_at', op.refunded_at
          ) || jsonb_build_object(
            'captured_at', op.captured_at,
            'authorization_code', op.authorization_code,
            'auth_code', op.auth_code,
            'rrn', op.rrn,
            'batch_number', op.batch_number,
            'dejavoo_batch_number', op.dejavoo_batch_number,
            'dejavoo_invoice_number', op.dejavoo_invoice_number,
            'result_code', op.result_code,
            'entry_mode', op.processor_response->'dejavoo_transaction'->>'entryMode',
            'reference_number', op.reference_number,
            'reference_id', op.reference_number,
            'created_at', op.initiated_at,
            'is_returned', coalesce(op.is_returned, false),
            'returned_at', op.returned_at,
            'returned_by', op.returned_by,
            'return_amount', coalesce(op.return_amount, 0),
            'return_rrn', op.return_rrn,
            'return_auth_code', op.return_auth_code,
            'return_reference_id', op.return_reference_id,
            'return_number', op.return_number,
            'return_reason', op.return_reason
          )
        ) || jsonb_build_object(
          'subtotal_portion', op.subtotal_portion,
          'tax_portion', op.tax_portion
        )
      ), '[]'::jsonb)
      into order_payments_data
      from public.order_payments op
      where op.order_id = new.id
        and op.status in ('captured', 'refunded', 'partially_refunded', 'void');

      -- v3: `id` (junction row PK) dropped — never read by any client.
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'order_payment_id', opi.order_payment_id,
          'order_item_id', opi.order_item_id,
          'quantity_paid', opi.quantity_paid,
          'unit_price_paid', opi.unit_price_paid,
          'subtotal_paid', opi.subtotal_paid,
          'tax_paid', opi.tax_paid
        )
      ), '[]'::jsonb)
      into payment_items_data
      from public.order_payment_items opi
      join public.order_payments op on op.id = opi.order_payment_id
      where op.order_id = new.id;
    else
      order_payments_data := null;
      payment_items_data := null;
    end if;

    order_data := jsonb_build_object(
      '_broadcast_version', 4,
      'item_count', v_item_count,
      'id', new.id,
      'order_number', new.order_number,
      'display_number', new.display_number,
      'location_id', new.location_id,
      'customer_id', new.customer_id,
      'customer_name', new.customer_name,
      'customer_phone', new.customer_phone,
      'customer_email', new.customer_email,
      'delivery_address', new.delivery_address,
      'created_by_staff_id', new.created_by_staff_id,
      'assigned_server_id', new.assigned_server_id,
      'session_id', new.session_id,
      'station_id', new.station_id,
      'station_name', v_station_name,
      'order_type', new.order_type,
      'order_source', new.order_source,
      'delivery_platform', coalesce(new.delivery_platform, new.metadata->>'delivery_company'),
      'platform_order_number', coalesce(new.platform_order_number, new.metadata->>'provider_order_id'),
      'split_payment_path', new.split_payment_path
    );

    -- AUD-10. `station_id` above is the order's OWNING station; `origin_id` is
    -- the author of THIS write. They are not interchangeable — see the header.
    -- Null whenever the mutation came through an unstamped (legacy) path.
    order_data := order_data || jsonb_build_object(
      'origin_id', v_origin_id
    );

    order_data := order_data || jsonb_build_object(
      'status', new.status,
      'table_number', new.table_number,
      'check_status', new.check_status,
      'tax_amount', new.tax_amount,
      'discount_amount', new.discount_amount,
      'service_charge', new.service_charge,
      'total_amount', new.total_amount,
      'card_subtotal', new.card_subtotal,
      'card_tax_amount', new.card_tax_amount,
      'card_total', new.card_total,
      'cash_total', new.cash_total
    );

    -- SC snapshot fields. Without these, client transformer maps missing
    -- service_charge_is_manual ?? false, wiping the manager override flag on
    -- every broadcast from a discount/item edit. See migration header.
    order_data := order_data || jsonb_build_object(
      'service_charge_name',       new.service_charge_name,
      'service_charge_rate',       new.service_charge_rate,
      'service_charge_applies_on', new.service_charge_applies_on,
      'service_charge_rule_id',    new.service_charge_rule_id,
      'service_charge_is_manual',  new.service_charge_is_manual,
      'service_charge_is_taxable', new.service_charge_is_taxable
    );

    order_data := order_data || jsonb_build_object(
      'payment_status', new.payment_status,
      'amount_paid', new.amount_paid,
      'amount_due', new.amount_due,
      'cash_amount_due', new.cash_amount_due
    );

    order_data := order_data || jsonb_build_object(
      'created_at', new.created_at,
      'updated_at', new.updated_at,
      'sent_to_kitchen_at', new.sent_to_kitchen_at,
      'completed_at', new.completed_at,
      'sync_version', new.sync_version
    );

    if order_payments_data is not null then
      order_data := order_data || jsonb_build_object(
        'order_payments', order_payments_data,
        'payment_items', payment_items_data
      );
    end if;

    payload := jsonb_build_object(
      'operation', tg_op,
      'timestamp', now(),
      'data', jsonb_build_object(
        'order', order_data
      )
    );

    v_should_emit_qr :=
      new.order_type = 'qr_dine_in'
      and new.online_session_id is not null
      and (
        tg_op = 'INSERT' or
        new.status is distinct from old.status or
        new.payment_status is distinct from old.payment_status or
        new.accepted_at is distinct from old.accepted_at or
        new.sent_to_kitchen_at is distinct from old.sent_to_kitchen_at or
        new.started_preparing_at is distinct from old.started_preparing_at or
        new.ready_at is distinct from old.ready_at or
        new.completed_at is distinct from old.completed_at or
        new.cancelled_at is distinct from old.cancelled_at or
        new.updated_at is distinct from old.updated_at
      );
  end if;

  perform realtime.send(
    payload,
    tg_op,
    v_topic,
    true
  );

  if v_should_emit_qr then
    select s.session_token
      into v_qr_session_token
    from public.online_order_sessions s
    where s.id = new.online_session_id
    limit 1;

    if nullif(trim(coalesce(v_qr_session_token, '')), '') is not null then
      v_qr_topic := 'qr-session:' || v_qr_session_token;
      v_qr_payload := jsonb_build_object(
        'operation', tg_op,
        'timestamp', now(),
        'order_id', new.id,
        'online_session_id', new.online_session_id,
        'status', new.status,
        'payment_status', new.payment_status,
        'updated_at', new.updated_at,
        'table_label', new.table_number,
        'order_type', new.order_type
      );

      perform realtime.send(
        v_qr_payload,
        'qr_order_changed',
        v_qr_topic,
        true
      );
    end if;
  end if;

  return null;

exception
  when others then
    raise warning 'broadcast_order_changes failed: %', sqlerrm;
    return null;
end;
$function$;

-- =============================================================================
-- PART 3 — cart-mutation wrappers: p_origin_id uuid DEFAULT NULL
-- =============================================================================
-- Invariants, all four load-bearing:
--
--   1. p_origin_id is ALWAYS the LAST parameter and ALWAYS DEFAULT NULL, so a
--      caller that omits it behaves exactly like the delegate.
--   2. Every other parameter — name, type, ORDER and DEFAULT EXPRESSION — is
--      reproduced verbatim from the delegate. Defaults differ per function
--      (p_quantity defaults to 1 in some, NULL in others); they were read from
--      pg_get_function_arguments, not assumed.
--   3. Return type matches the delegate EXACTLY. Some return json, others
--      jsonb; they are not interchangeable to PostgREST.
--   4. Delegate calls use FULL named notation. Two delegates are doubly
--      overloaded, so this is not cosmetic:
--        - add_order_item_v3 also has a 14-arg form; passing all 20 names
--          (p_menu_id / p_menu_name / p_category_id / p_idempotency_key /
--          p_station_id / p_seat_number exist only on the 20-arg form) makes
--          resolution unambiguous.
--        - replace_order_item_modifiers_v2 also has a 2-arg form returning
--          jsonb; passing p_idempotency_key selects the 3-arg json form.
--      Get this wrong and it fails at RUNTIME with "is not unique", never at
--      CREATE time.
--
-- Deliberately NOT wrapped: void_order_item. See the NEVER-SUPPRESS list.

-- 3.1 ---------------------------------------------------------------- add item
CREATE OR REPLACE FUNCTION public.add_order_item_v4(
  p_order_id uuid,
  p_menu_item_id uuid DEFAULT NULL::uuid,
  p_quantity integer DEFAULT 1,
  p_unit_price numeric DEFAULT 0,
  p_cash_unit_price numeric DEFAULT NULL::numeric,
  p_item_name text DEFAULT NULL::text,
  p_category_name text DEFAULT NULL::text,
  p_location_exclusive_item_id uuid DEFAULT NULL::uuid,
  p_selected_size_id uuid DEFAULT NULL::uuid,
  p_selected_size_name text DEFAULT NULL::text,
  p_size_price_modifier numeric DEFAULT 0,
  p_modifiers jsonb DEFAULT NULL::jsonb,
  p_special_instructions text DEFAULT NULL::text,
  p_course_number integer DEFAULT 1,
  p_seat_number integer DEFAULT NULL::integer,
  p_menu_id uuid DEFAULT NULL::uuid,
  p_menu_name text DEFAULT NULL::text,
  p_category_id uuid DEFAULT NULL::uuid,
  p_idempotency_key uuid DEFAULT NULL::uuid,
  p_station_id uuid DEFAULT NULL::uuid,
  p_origin_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  PERFORM public.set_broadcast_origin(p_origin_id);

  RETURN public.add_order_item_v3(
    p_order_id                   => p_order_id,
    p_menu_item_id               => p_menu_item_id,
    p_quantity                   => p_quantity,
    p_unit_price                 => p_unit_price,
    p_cash_unit_price            => p_cash_unit_price,
    p_item_name                  => p_item_name,
    p_category_name              => p_category_name,
    p_location_exclusive_item_id => p_location_exclusive_item_id,
    p_selected_size_id           => p_selected_size_id,
    p_selected_size_name         => p_selected_size_name,
    p_size_price_modifier        => p_size_price_modifier,
    p_modifiers                  => p_modifiers,
    p_special_instructions       => p_special_instructions,
    p_course_number              => p_course_number,
    p_seat_number                => p_seat_number,
    p_menu_id                    => p_menu_id,
    p_menu_name                  => p_menu_name,
    p_category_id                => p_category_id,
    p_idempotency_key            => p_idempotency_key,
    p_station_id                 => p_station_id
  );
END;
$$;

COMMENT ON FUNCTION public.add_order_item_v4(uuid,uuid,integer,numeric,numeric,text,text,uuid,uuid,text,numeric,jsonb,text,integer,integer,uuid,text,uuid,uuid,uuid,uuid) IS
  'AUD-10. add_order_item_v3 + p_origin_id, stamped onto the broadcast as data.order.origin_id. Delegates 1:1; all pricing, idempotency and authorization stay in v3.';

REVOKE ALL ON FUNCTION public.add_order_item_v4(uuid,uuid,integer,numeric,numeric,text,text,uuid,uuid,text,numeric,jsonb,text,integer,integer,uuid,text,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_order_item_v4(uuid,uuid,integer,numeric,numeric,text,text,uuid,uuid,text,numeric,jsonb,text,integer,integer,uuid,text,uuid,uuid,uuid,uuid)
  TO authenticated, service_role;

-- 3.2 ----------------------------------------------------------- add open item
CREATE OR REPLACE FUNCTION public.add_open_item_v4(
  p_order_id uuid,
  p_item_name text,
  p_unit_price numeric,
  p_quantity integer DEFAULT 1,
  p_special_instructions text DEFAULT NULL::text,
  p_is_tax_exempt boolean DEFAULT false,
  p_seat_number integer DEFAULT NULL::integer,
  p_idempotency_key uuid DEFAULT NULL::uuid,
  p_station_id uuid DEFAULT NULL::uuid,
  p_is_to_go boolean DEFAULT false,
  p_origin_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  PERFORM public.set_broadcast_origin(p_origin_id);

  RETURN public.add_open_item_v3(
    p_order_id             => p_order_id,
    p_item_name            => p_item_name,
    p_unit_price           => p_unit_price,
    p_quantity             => p_quantity,
    p_special_instructions => p_special_instructions,
    p_is_tax_exempt        => p_is_tax_exempt,
    p_seat_number          => p_seat_number,
    p_idempotency_key      => p_idempotency_key,
    p_station_id           => p_station_id,
    p_is_to_go             => p_is_to_go
  );
END;
$$;

COMMENT ON FUNCTION public.add_open_item_v4(uuid,text,numeric,integer,text,boolean,integer,uuid,uuid,boolean,uuid) IS
  'AUD-10. add_open_item_v3 + p_origin_id. Delegates 1:1.';

REVOKE ALL ON FUNCTION public.add_open_item_v4(uuid,text,numeric,integer,text,boolean,integer,uuid,uuid,boolean,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_open_item_v4(uuid,text,numeric,integer,text,boolean,integer,uuid,uuid,boolean,uuid)
  TO authenticated, service_role;

-- 3.3 -------------------------------------------------------------- update qty
CREATE OR REPLACE FUNCTION public.update_order_item_quantity_v4(
  p_order_item_id uuid,
  p_quantity integer,
  p_idempotency_key uuid DEFAULT NULL::uuid,
  p_origin_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  PERFORM public.set_broadcast_origin(p_origin_id);

  RETURN public.update_order_item_quantity_v3(
    p_order_item_id   => p_order_item_id,
    p_quantity        => p_quantity,
    p_idempotency_key => p_idempotency_key
  );
END;
$$;

COMMENT ON FUNCTION public.update_order_item_quantity_v4(uuid,integer,uuid,uuid) IS
  'AUD-10. update_order_item_quantity_v3 + p_origin_id. Hot path. Delegates 1:1.';

REVOKE ALL ON FUNCTION public.update_order_item_quantity_v4(uuid,integer,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_order_item_quantity_v4(uuid,integer,uuid,uuid)
  TO authenticated, service_role;

-- 3.4 ------------------------------------------------------------- update item
CREATE OR REPLACE FUNCTION public.update_order_item_v4(
  p_order_item_id uuid,
  p_quantity integer DEFAULT NULL::integer,
  p_unit_price numeric DEFAULT NULL::numeric,
  p_special_instructions text DEFAULT NULL::text,
  p_seat_number integer DEFAULT NULL::integer,
  p_idempotency_key uuid DEFAULT NULL::uuid,
  p_origin_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  PERFORM public.set_broadcast_origin(p_origin_id);

  RETURN public.update_order_item_v3(
    p_order_item_id        => p_order_item_id,
    p_quantity             => p_quantity,
    p_unit_price           => p_unit_price,
    p_special_instructions => p_special_instructions,
    p_seat_number          => p_seat_number,
    p_idempotency_key      => p_idempotency_key
  );
END;
$$;

COMMENT ON FUNCTION public.update_order_item_v4(uuid,integer,numeric,text,integer,uuid,uuid) IS
  'AUD-10. update_order_item_v3 + p_origin_id. Hot path. Delegates 1:1.';

REVOKE ALL ON FUNCTION public.update_order_item_v4(uuid,integer,numeric,text,integer,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_order_item_v4(uuid,integer,numeric,text,integer,uuid,uuid)
  TO authenticated, service_role;

-- 3.5 -------------------------------------------------------- replace modifiers
-- Delegate is doubly overloaded: (uuid,jsonb)->jsonb and (uuid,jsonb,uuid)->json.
-- Passing p_idempotency_key selects the 3-arg json form; hence RETURNS json.
CREATE OR REPLACE FUNCTION public.replace_order_item_modifiers_v3(
  p_order_item_id uuid,
  p_modifiers jsonb,
  p_idempotency_key uuid DEFAULT NULL::uuid,
  p_origin_id uuid DEFAULT NULL::uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  PERFORM public.set_broadcast_origin(p_origin_id);

  RETURN public.replace_order_item_modifiers_v2(
    p_order_item_id   => p_order_item_id,
    p_modifiers       => p_modifiers,
    p_idempotency_key => p_idempotency_key
  );
END;
$$;

COMMENT ON FUNCTION public.replace_order_item_modifiers_v3(uuid,jsonb,uuid,uuid) IS
  'AUD-10. replace_order_item_modifiers_v2 (3-arg overload) + p_origin_id. Hot path. Delegates 1:1.';

REVOKE ALL ON FUNCTION public.replace_order_item_modifiers_v3(uuid,jsonb,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_order_item_modifiers_v3(uuid,jsonb,uuid,uuid)
  TO authenticated, service_role;

-- 3.6 ------------------------------------------------------------ add modifier
CREATE OR REPLACE FUNCTION public.add_order_item_modifier_v3(
  p_order_item_id uuid,
  p_modifier_group_id uuid,
  p_modifier_item_id uuid,
  p_modifier_group_name text,
  p_modifier_name text,
  p_price_modifier numeric,
  p_quantity integer DEFAULT 1,
  p_idempotency_key uuid DEFAULT NULL::uuid,
  p_station_id uuid DEFAULT NULL::uuid,
  p_origin_id uuid DEFAULT NULL::uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  PERFORM public.set_broadcast_origin(p_origin_id);

  RETURN public.add_order_item_modifier_v2(
    p_order_item_id       => p_order_item_id,
    p_modifier_group_id   => p_modifier_group_id,
    p_modifier_item_id    => p_modifier_item_id,
    p_modifier_group_name => p_modifier_group_name,
    p_modifier_name       => p_modifier_name,
    p_price_modifier      => p_price_modifier,
    p_quantity            => p_quantity,
    p_idempotency_key     => p_idempotency_key,
    p_station_id          => p_station_id
  );
END;
$$;

COMMENT ON FUNCTION public.add_order_item_modifier_v3(uuid,uuid,uuid,text,text,numeric,integer,uuid,uuid,uuid) IS
  'AUD-10. add_order_item_modifier_v2 + p_origin_id. Delegates 1:1.';

REVOKE ALL ON FUNCTION public.add_order_item_modifier_v3(uuid,uuid,uuid,text,text,numeric,integer,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_order_item_modifier_v3(uuid,uuid,uuid,text,text,numeric,integer,uuid,uuid,uuid)
  TO authenticated, service_role;

-- 3.7 --------------------------------------------------------- remove modifier
CREATE OR REPLACE FUNCTION public.remove_order_item_modifier_v3(
  p_modifier_id uuid,
  p_idempotency_key uuid DEFAULT NULL::uuid,
  p_station_id uuid DEFAULT NULL::uuid,
  p_origin_id uuid DEFAULT NULL::uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  PERFORM public.set_broadcast_origin(p_origin_id);

  RETURN public.remove_order_item_modifier_v2(
    p_modifier_id     => p_modifier_id,
    p_idempotency_key => p_idempotency_key,
    p_station_id      => p_station_id
  );
END;
$$;

COMMENT ON FUNCTION public.remove_order_item_modifier_v3(uuid,uuid,uuid,uuid) IS
  'AUD-10. remove_order_item_modifier_v2 + p_origin_id. Delegates 1:1.';

REVOKE ALL ON FUNCTION public.remove_order_item_modifier_v3(uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_order_item_modifier_v3(uuid,uuid,uuid,uuid)
  TO authenticated, service_role;

-- 3.8 ------------------------------------------------------------- duplicate
CREATE OR REPLACE FUNCTION public.duplicate_order_item_v3(
  p_order_item_id uuid,
  p_quantity integer DEFAULT NULL::integer,
  p_idempotency_key uuid DEFAULT NULL::uuid,
  p_station_id uuid DEFAULT NULL::uuid,
  p_origin_id uuid DEFAULT NULL::uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  PERFORM public.set_broadcast_origin(p_origin_id);

  RETURN public.duplicate_order_item_v2(
    p_order_item_id   => p_order_item_id,
    p_quantity        => p_quantity,
    p_idempotency_key => p_idempotency_key,
    p_station_id      => p_station_id
  );
END;
$$;

COMMENT ON FUNCTION public.duplicate_order_item_v3(uuid,integer,uuid,uuid,uuid) IS
  'AUD-10. duplicate_order_item_v2 + p_origin_id. Delegates 1:1.';

REVOKE ALL ON FUNCTION public.duplicate_order_item_v3(uuid,integer,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.duplicate_order_item_v3(uuid,integer,uuid,uuid,uuid)
  TO authenticated, service_role;

-- 3.9 ------------------------------------------------------------- remove item
CREATE OR REPLACE FUNCTION public.remove_order_item_v2(
  p_order_item_id uuid,
  p_origin_id uuid DEFAULT NULL::uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  PERFORM public.set_broadcast_origin(p_origin_id);

  RETURN public.remove_order_item(p_order_item_id => p_order_item_id);
END;
$$;

COMMENT ON FUNCTION public.remove_order_item_v2(uuid,uuid) IS
  'AUD-10. remove_order_item + p_origin_id. Delegates 1:1.';

REVOKE ALL ON FUNCTION public.remove_order_item_v2(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_order_item_v2(uuid,uuid)
  TO authenticated, service_role;

-- 3.10 ------------------------------------------------------- remove items bulk
CREATE OR REPLACE FUNCTION public.remove_order_items_batch_v2(
  p_order_item_ids uuid[],
  p_origin_id uuid DEFAULT NULL::uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  PERFORM public.set_broadcast_origin(p_origin_id);

  RETURN public.remove_order_items_batch(p_order_item_ids => p_order_item_ids);
END;
$$;

COMMENT ON FUNCTION public.remove_order_items_batch_v2(uuid[],uuid) IS
  'AUD-10. remove_order_items_batch + p_origin_id. Delegates 1:1.';

REVOKE ALL ON FUNCTION public.remove_order_items_batch_v2(uuid[],uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_order_items_batch_v2(uuid[],uuid)
  TO authenticated, service_role;

-- 3.11 ------------------------------------------------------------ clear items
CREATE OR REPLACE FUNCTION public.clear_order_items_v2(
  p_order_id uuid,
  p_origin_id uuid DEFAULT NULL::uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  PERFORM public.set_broadcast_origin(p_origin_id);

  RETURN public.clear_order_items(p_order_id => p_order_id);
END;
$$;

COMMENT ON FUNCTION public.clear_order_items_v2(uuid,uuid) IS
  'AUD-10. clear_order_items + p_origin_id. Delegates 1:1.';

REVOKE ALL ON FUNCTION public.clear_order_items_v2(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clear_order_items_v2(uuid,uuid)
  TO authenticated, service_role;

COMMIT;

-- =============================================================================
-- POST-APPLY SMOKE TEST — run this, it is not optional
-- =============================================================================
-- A clean apply proves nothing about a plpgsql body: names inside resolve at
-- RUNTIME. Run as a normal `authenticated` merchant session, not as postgres.
--
--   -- every new function exists with the expected signature
--   select p.proname, pg_get_function_identity_arguments(p.oid)
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and p.proname in ('set_broadcast_origin','add_order_item_v4',
--        'add_open_item_v4','update_order_item_quantity_v4',
--        'update_order_item_v4','replace_order_item_modifiers_v3',
--        'add_order_item_modifier_v3','remove_order_item_modifier_v3',
--        'duplicate_order_item_v3','remove_order_item_v2',
--        'remove_order_items_batch_v2','clear_order_items_v2')
--   order by 1;                                    -- expect 12 rows
--
--   -- the payload carries the new key and kept the old ones
--   select md5(pg_get_functiondef('public.broadcast_order_changes'::regproc));
--   -- then, with a realtime subscription on location:<loc>:orders, run the
--   -- POSITIVE / NEGATIVE / per-wrapper cases (1)(2)(4) from the header.
--
-- =============================================================================
-- ROLLBACK — complete, in this order
-- =============================================================================
-- Safe to run at any time. Dropping the wrappers strands any client already
-- calling them, so flip the client kill switch OFF (or ship a build that uses
-- the v3/v2 delegates) BEFORE running this. The delegates themselves are never
-- touched by this migration, so no cart operation is ever lost by rolling back.
--
-- BEGIN;
--
-- -- 1. wrappers (delegates are untouched and remain fully functional)
-- DROP FUNCTION IF EXISTS public.clear_order_items_v2(uuid,uuid);
-- DROP FUNCTION IF EXISTS public.remove_order_items_batch_v2(uuid[],uuid);
-- DROP FUNCTION IF EXISTS public.remove_order_item_v2(uuid,uuid);
-- DROP FUNCTION IF EXISTS public.duplicate_order_item_v3(uuid,integer,uuid,uuid,uuid);
-- DROP FUNCTION IF EXISTS public.remove_order_item_modifier_v3(uuid,uuid,uuid,uuid);
-- DROP FUNCTION IF EXISTS public.add_order_item_modifier_v3(uuid,uuid,uuid,text,text,numeric,integer,uuid,uuid,uuid);
-- DROP FUNCTION IF EXISTS public.replace_order_item_modifiers_v3(uuid,jsonb,uuid,uuid);
-- DROP FUNCTION IF EXISTS public.update_order_item_v4(uuid,integer,numeric,text,integer,uuid,uuid);
-- DROP FUNCTION IF EXISTS public.update_order_item_quantity_v4(uuid,integer,uuid,uuid);
-- DROP FUNCTION IF EXISTS public.add_open_item_v4(uuid,text,numeric,integer,text,boolean,integer,uuid,uuid,boolean,uuid);
-- DROP FUNCTION IF EXISTS public.add_order_item_v4(uuid,uuid,integer,numeric,numeric,text,text,uuid,uuid,text,numeric,jsonb,text,integer,integer,uuid,text,uuid,uuid,uuid,uuid);
--
-- -- 2. revert the payload to v3 (the md5-pinned pre-image of this migration).
-- --    Restore it from the previous migration rather than retyping it:
-- --      supabase/migrations/20260713120000_broadcast_order_changes_v3_payload_trim.sql
-- --    Re-run that file's CREATE OR REPLACE FUNCTION public.broadcast_order_changes()
-- --    verbatim here. It restores _broadcast_version 3 and drops origin_id.
-- --    Afterwards confirm:
-- --      select md5(pg_get_functiondef('public.broadcast_order_changes'::regproc));
-- --      -- expect 01227a524798a10cae91892173e4f3de
-- --    The trigger itself is NOT dropped or recreated at any point — neither by
-- --    this migration nor by its rollback — so no broadcast is ever missed
-- --    during either direction.
--
-- -- 3. the origin channel, last (the wrappers above reference it)
-- DROP FUNCTION IF EXISTS public.set_broadcast_origin(uuid);
--
-- COMMIT;
-- =============================================================================
