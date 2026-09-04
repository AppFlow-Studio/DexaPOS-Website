-- ============================================================================
-- respond_to_reservation_request — the merchant accepts or declines
-- ============================================================================
--
-- WHY NOT REUSE update_reservation_status. Three reasons, each sufficient:
--
--   1. It cannot set `cancelled_by`, so a merchant decline would be
--      indistinguishable from a guest cancelling their own booking. Those are
--      different events and the guest gets a different message for each.
--   2. It cannot tell a first Confirm from a second one. It writes the status
--      unconditionally and reports success, so two managers both clicking
--      Confirm on a Friday night would each fire a confirmation message at the
--      guest. This function acts only on 'pending' and reports `already` for
--      everything else.
--   3. It is granted to `anon`. That is not a precedent worth copying onto a
--      function that decides whether a restaurant accepts a booking.
--
-- cancelled_by = 'staff', NOT 'merchant'. The column carries a CHECK:
--
--     CHECK (cancelled_by IS NULL OR cancelled_by = ANY (ARRAY['guest','staff','system']))
--
-- 'merchant' is not in that set and would fail the constraint on the first
-- decline. 'staff' already means "someone at the restaurant did this", which is
-- exactly what a decline is, and it needs no DDL. The three values already
-- separate the cases that matter to a guest: they cancelled, the restaurant
-- declined, or the system expired it.
--
-- THE AUTHORIZATION GATE is the same pair its sibling uses —
-- `merchant_id = user_merchant_id() AND location_id = ANY(user_location_ids())`
-- — so it inherits the repair in 20260829120000, which gave merchant owners and
-- admins every location their merchant owns. Note both halves route through
-- `user_merchant_id()`, which resolves via `staff_profiles`: a merchant admin
-- with no staff_profiles row is invisible to this function regardless of the
-- repair. That is a pre-existing platform invariant, not something introduced
-- here, but it is the first thing to check if a legitimate owner is denied.
--
-- IDEMPOTENT BY DESIGN. A second Confirm returns {acted: false, already: true}
-- and the caller shows success, matching what `cancel_public_reservation`
-- already does for a double cancel. The alternative — a red toast on the second
-- click — teaches staff that the button is broken.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.respond_to_reservation_request(
  p_reservation_id uuid,
  p_accept         boolean,
  p_reason         text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_current reservation_status;
  v_next    reservation_status;
BEGIN
  IF p_reservation_id IS NULL OR p_accept IS NULL THEN
    RETURN json_build_object('acted', false, 'already', false, 'error', 'invalid_arguments');
  END IF;

  -- Lock the row so two managers answering at once serialise rather than both
  -- reading 'pending' and both proceeding.
  SELECT status INTO v_current
  FROM public.reservations
  WHERE id = p_reservation_id
    AND merchant_id = user_merchant_id()
    AND location_id = ANY(user_location_ids())
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reservation not found';
  END IF;

  -- Anything other than 'pending' has already been answered — by the other
  -- manager, by the guest withdrawing, or by an expiry job. Report it rather
  -- than erroring: the caller wants to show the current state, not a failure.
  IF v_current <> 'pending' THEN
    RETURN json_build_object(
      'acted',          false,
      'already',        true,
      'reservation_id', p_reservation_id,
      'status',         v_current
    );
  END IF;

  v_next := CASE WHEN p_accept THEN 'confirmed' ELSE 'cancelled' END::reservation_status;

  UPDATE public.reservations
  SET status              = v_next,
      cancelled_at        = CASE WHEN p_accept THEN cancelled_at ELSE now() END,
      -- See the header: 'staff' is the constraint-legal value for "the
      -- restaurant did this", as distinct from 'guest' and 'system'.
      cancelled_by        = CASE WHEN p_accept THEN cancelled_by ELSE 'staff' END,
      -- Only written on a decline, and only when one was given. A reason left
      -- over from an earlier cancellation must not be resurrected onto an
      -- acceptance.
      cancellation_reason = CASE
                              WHEN p_accept THEN cancellation_reason
                              ELSE NULLIF(btrim(COALESCE(p_reason, '')), '')
                            END,
      updated_at          = now()
  WHERE id = p_reservation_id;

  RETURN json_build_object(
    'acted',           true,
    'already',         false,
    'reservation_id',  p_reservation_id,
    'previous_status', v_current,
    'status',          v_next
  );
END $function$;

COMMENT ON FUNCTION public.respond_to_reservation_request(uuid, boolean, text) IS
  'A merchant accepts or declines a pending booking request. Acts only on pending and is idempotent: a second call returns already=true rather than erroring or re-notifying. A decline sets cancelled_by = ''staff'', which is the constraint-legal value for "the restaurant did this".';

-- Not anon. A public caller has no business answering a restaurant's requests,
-- and the sibling function being granted to anon is a defect rather than a
-- pattern.
REVOKE ALL ON FUNCTION public.respond_to_reservation_request(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_to_reservation_request(uuid, boolean, text) TO authenticated, service_role;
