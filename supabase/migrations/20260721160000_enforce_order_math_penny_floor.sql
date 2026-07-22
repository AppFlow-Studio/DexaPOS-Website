-- enforce_order_math — penny floor fix (P0005 on legitimate $0.01 orders)
--
-- Symptom: a $0.01 card purchase approves on the terminal, but the order can
-- never be marked paid. process_payment_v16 correctly writes
-- payment_status='paid', amount_paid=0.01, amount_due=0 — then the deferred
-- constraint trigger enforce_order_math (Lane G4, 20260501000006) raises at
-- commit:
--
--   P0005: enforce_order_math: order <id> is payment_status=paid but amount_paid=0.01
--
-- rolling the whole payment back. The POS offline-sync classifier
-- (services/offlineSyncInit.ts ~1436) then treats P0005 as a non-retryable
-- data-integrity rejection and DISCARDS the queued payment op, so the card is
-- charged but the order stays unpaid.
--
-- Root cause: the "paid implies real money collected" invariant is documented
-- in G4 as `amount_paid > 0`, but was implemented with a `<= 0.01` floor:
--
--   IF v_status = 'paid' THEN
--     IF v_amount_paid <= 0.01 THEN RAISE ... END IF;   -- rejects a real 1¢
--
-- A fully-paid $0.01 order has amount_paid = 0.01, and 0.01 <= 0.01 is TRUE, so
-- EVERY legitimate penny order is rejected. A $0.02 order (0.02 <= 0.01 = FALSE)
-- passes — exactly the observed "$0.02 works, $0.01 fails".
--
-- Fix: use a sub-cent dust floor `< 0.005`. Money is stored to the cent, so the
-- only value this still rejects is amount_paid = 0.00 (marked paid but nothing
-- collected — a genuine inconsistency, behaviour UNCHANGED). A $0.01 collection
-- is real money and now passes, satisfying G4's documented `amount_paid > 0`
-- intent. Matches the POS client-side dust floor in lib/paymentGuards.ts
-- (isNothingLeftToCollect uses `< 0.005`).
--
-- Body-only change: the deferred constraint trigger binding from 20260501000006
-- is unchanged (CREATE OR REPLACE FUNCTION replaces the body in place). Every
-- other check (negative guards, amount_due > 0.01, the pending guard) is
-- byte-identical to G4.
--
-- Rollback: rollback/20260721160000_enforce_order_math_penny_floor_rollback.sql

CREATE OR REPLACE FUNCTION public.enforce_order_math()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_amount_paid numeric := COALESCE(NEW.amount_paid, 0);
  v_amount_due  numeric := COALESCE(NEW.amount_due, 0);
  v_status      text    := NEW.payment_status::text;
BEGIN
  IF v_amount_paid < -0.01 THEN
    RAISE EXCEPTION 'enforce_order_math: order % has negative amount_paid (%)',
      NEW.id, v_amount_paid
      USING ERRCODE = 'P0005';
  END IF;

  IF v_amount_due < -0.01 THEN
    RAISE EXCEPTION 'enforce_order_math: order % has negative amount_due (%)',
      NEW.id, v_amount_due
      USING ERRCODE = 'P0005';
  END IF;

  IF v_status = 'paid' THEN
    -- Sub-cent dust floor: a paid order must have collected real money. A
    -- legitimate $0.01 order (amount_paid=0.01) MUST pass; only an effectively-
    -- zero amount_paid (rounds to $0.00) is a true inconsistency. The old
    -- `<= 0.01` rejected every valid 1¢ order (P0005) — why $0.02 succeeded but
    -- $0.01 failed. `< 0.005` satisfies G4's documented `amount_paid > 0` intent.
    IF v_amount_paid < 0.005 THEN
      RAISE EXCEPTION
        'enforce_order_math: order % is payment_status=paid but amount_paid=%',
        NEW.id, v_amount_paid
        USING ERRCODE = 'P0005',
              HINT    = 'Reset payment_status to ''pending'' or record the missing payment row.';
    END IF;
    IF v_amount_due > 0.01 THEN
      RAISE EXCEPTION
        'enforce_order_math: order % is payment_status=paid but amount_due=%',
        NEW.id, v_amount_due
        USING ERRCODE = 'P0005',
              HINT    = 'Call update_order_payment_status_after_refund(order_id) to recompute.';
    END IF;
  END IF;

  IF v_status = 'pending' AND v_amount_paid > 0.01 THEN
    RAISE EXCEPTION
      'enforce_order_math: order % is payment_status=pending but amount_paid=%',
      NEW.id, v_amount_paid
      USING ERRCODE = 'P0005',
            HINT    = 'Set payment_status to ''partial'' or ''paid'' to match amount_paid.';
  END IF;

  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.enforce_order_math() FROM PUBLIC;
COMMENT ON FUNCTION public.enforce_order_math() IS
  'G4: asserts orders.amount_paid/amount_due/payment_status invariants. Fires as a deferred constraint trigger so multi-step transactions can temporarily violate intermediate states. Raises P0005 on any final-state violation. 2026-07-21: paid-but-nothing-collected floor changed from `amount_paid <= 0.01` to `amount_paid < 0.005` so a legitimate $0.01 order is accepted (previously every 1c order failed P0005 while $0.02 passed).';
