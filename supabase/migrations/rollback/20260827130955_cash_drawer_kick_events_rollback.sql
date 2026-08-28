-- =====================================================================
-- Rollback — cash_drawer_kick_events
-- =====================================================================
-- Reverses 20260827130000_cash_drawer_kick_events.sql.
--
-- Drops the durable kick log, its trigger on printers, and the trigger
-- function. The DROP TABLE cascades away the table's indexes, unique
-- constraint and RLS policies. No data outside this table is touched,
-- and printers reverts to having no kick-capture trigger.
--
-- NOT REVERSED: any rows already captured are discarded with the table.
-- =====================================================================

begin;

drop trigger if exists trg_log_cash_drawer_kicks on public.printers;
drop function if exists public._log_cash_drawer_kicks();
drop table if exists public.cash_drawer_kick_events;

commit;
