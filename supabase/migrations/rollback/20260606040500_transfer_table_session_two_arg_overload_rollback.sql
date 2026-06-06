-- Rollback for 20260606040500_transfer_table_session_two_arg_overload.sql.
-- Drops only the 2-arg overload — the 3-arg variant in prod is unaffected.

DROP FUNCTION IF EXISTS public.transfer_table_session(uuid, uuid[]);
