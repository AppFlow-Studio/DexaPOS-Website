-- Rollback for 20260830120100_respond_to_reservation_request.sql
--
-- The function is new, so removing it is the whole rollback. Nothing else
-- referenced it before this migration.
--
-- Dropping it does NOT strand data: it only ever wrote `status`,
-- `cancelled_at`, `cancelled_by` and `cancellation_reason`, all of which are
-- ordinary columns that `update_reservation_status` and the day view continue
-- to read. Bookings it already confirmed or declined stay exactly as they are.
--
-- Any reservation still sitting at 'pending' when this is dropped can still be
-- answered through `update_reservation_status` from the day view — with the
-- three defects that function has, and which are why this one exists: no
-- `cancelled_by`, no double-answer guard, and a grant to anon.

DROP FUNCTION IF EXISTS public.respond_to_reservation_request(uuid, boolean, text);
