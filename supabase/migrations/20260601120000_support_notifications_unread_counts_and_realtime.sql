-- Support-Ticket Counter + Notification Bell (Wire-Up ticket, Part A)
-- ---------------------------------------------------------------------------
-- This migration covers three Part A items:
--   * Item 4 — new RPC get_unread_ticket_counts() (role-aware, JWT-scoped)
--   * Item 5 — add support_tickets + support_ticket_messages to the
--              supabase_realtime publication (idempotent)
--   * Item 6 — fix the duplicated search_path on get_support_dashboard_stats
--
-- Applied to staging dfwqakoyittmrwbqvxgw via the migration chain (SQL editor
-- paste -> `migration repair --status applied`), NOT `db push`.

-- ===========================================================================
-- Item 6 — Housekeeping: get_support_dashboard_stats had a duplicated
-- search_path ('public','public','pg_temp'). Reset it without touching the
-- function body.
-- ===========================================================================
alter function public.get_support_dashboard_stats()
  set search_path = 'public', 'pg_temp';

-- ===========================================================================
-- Item 4 — get_unread_ticket_counts()
-- Role-aware, JWT-scoped unread counter that drives both notification bells.
--   * HQ  (is_dexapos_admin) -> every admin-side unread message: merchant
--      replies / new tickets not yet read by an admin, internal notes excluded.
--   * Merchant -> own unread DEXA replies (admin messages not yet read by the
--      merchant), internal notes excluded.
-- Returns { role, total, per_ticket:[{ticket_id, count}] } so a bell can show
-- both an aggregate badge and per-ticket clearing.
--
-- The active Clerk org id arrives on the JWT in two shapes depending on token
-- version: a flat `org_id` claim (used by is_dexapos_admin) and a nested
-- `org.id` claim (used by the support_tickets RLS policy). Coalesce both.
-- ===========================================================================
create or replace function public.get_unread_ticket_counts()
returns jsonb
language plpgsql
stable
security definer
set search_path = 'public', 'pg_temp'
as $$
declare
  v_org_id     text;
  v_total      integer := 0;
  v_per_ticket jsonb   := '[]'::jsonb;
begin
  v_org_id := coalesce(
    public.get_my_claim('org_id'::text),
    auth.jwt() -> 'org' ->> 'id'
  );

  if v_org_id is null then
    return jsonb_build_object('role', 'none', 'total', 0, 'per_ticket', '[]'::jsonb);
  end if;

  -- ---- HQ / admin side --------------------------------------------------
  if public.is_dexapos_admin() then
    select count(*)::int into v_total
    from public.support_ticket_messages m
    where m.read_by_admin = false
      and m.is_internal = false
      and m.sender_role = 'merchant';

    select coalesce(
             jsonb_agg(jsonb_build_object('ticket_id', x.ticket_id, 'count', x.cnt)),
             '[]'::jsonb
           )
    into v_per_ticket
    from (
      select m.ticket_id, count(*)::int as cnt
      from public.support_ticket_messages m
      where m.read_by_admin = false
        and m.is_internal = false
        and m.sender_role = 'merchant'
      group by m.ticket_id
    ) x;

    return jsonb_build_object('role', 'admin', 'total', v_total, 'per_ticket', v_per_ticket);
  end if;

  -- ---- Merchant side ----------------------------------------------------
  select count(*)::int into v_total
  from public.support_ticket_messages m
  join public.support_tickets t  on t.id = m.ticket_id
  join public.merchants       mr on mr.id = t.merchant_id
  where mr.clerk_org_id = v_org_id
    and m.read_by_merchant = false
    and m.is_internal = false
    and m.sender_role = 'admin';

  select coalesce(
           jsonb_agg(jsonb_build_object('ticket_id', x.ticket_id, 'count', x.cnt)),
           '[]'::jsonb
         )
  into v_per_ticket
  from (
    select m.ticket_id, count(*)::int as cnt
    from public.support_ticket_messages m
    join public.support_tickets t  on t.id = m.ticket_id
    join public.merchants       mr on mr.id = t.merchant_id
    where mr.clerk_org_id = v_org_id
      and m.read_by_merchant = false
      and m.is_internal = false
      and m.sender_role = 'admin'
    group by m.ticket_id
  ) x;

  return jsonb_build_object('role', 'merchant', 'total', v_total, 'per_ticket', v_per_ticket);
end;
$$;

revoke all on function public.get_unread_ticket_counts() from public;
grant execute on function public.get_unread_ticket_counts() to authenticated, service_role;

-- ===========================================================================
-- Item 5 — Realtime transport. The bells subscribe to postgres_changes on
-- these tables; without them in the publication the subscription is silent.
-- Idempotent so re-runs are safe.
-- ===========================================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'support_tickets'
  ) then
    alter publication supabase_realtime add table public.support_tickets;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'support_ticket_messages'
  ) then
    alter publication supabase_realtime add table public.support_ticket_messages;
  end if;
end $$;

notify pgrst, 'reload schema';
