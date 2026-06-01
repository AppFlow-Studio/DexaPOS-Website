-- Support notification bell — fix HQ Realtime delivery (Wire-Up ticket, Part A)
-- ---------------------------------------------------------------------------
-- Symptom: the HQ notification bell never incremented on a new merchant ticket
-- / reply, even though the merchant bell worked.
--
-- Cause: Realtime postgres_changes only delivers a row to a subscriber that
-- passes the table's RLS SELECT policy. The HQ branch of
-- support_tickets_admin_or_merchant_all depends on current_setting(
-- 'app.dexa_hq_org_id', true), a GUC that is NOT set in the Realtime RLS
-- context (it evaluates to null there). So HQ users matched no rows and
-- received no events. The merchant branch uses the JWT org claim directly and
-- worked fine.
--
-- Fix: give HQ a JWT-only SELECT path via is_dexapos_admin() (reads the org_id
-- claim, the same pattern device_heartbeats already uses for working HQ
-- realtime). These are additive PERMISSIVE policies — RLS combines them with OR
-- — so they only grant HQ the visibility it is already intended to have; no
-- existing access is restricted. App reads use the service role and are
-- unaffected.

drop policy if exists "support_tickets_hq_realtime_select" on public.support_tickets;
create policy "support_tickets_hq_realtime_select"
  on public.support_tickets
  for select
  to authenticated
  using (public.is_dexapos_admin());

drop policy if exists "support_ticket_messages_hq_realtime_select" on public.support_ticket_messages;
create policy "support_ticket_messages_hq_realtime_select"
  on public.support_ticket_messages
  for select
  to authenticated
  using (public.is_dexapos_admin());

notify pgrst, 'reload schema';
