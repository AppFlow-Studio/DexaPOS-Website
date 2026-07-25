-- Make schedules + schedule_time_slots RLS impersonation-aware.
--
-- Root cause
-- ----------
-- schedules / schedule_time_slots write policies gate on is_merchant_admin(merchant_id).
-- For an HQ admin impersonating a merchant, the caller is NOT a member of that merchant,
-- so is_merchant_admin() can only pass via is_dexapos_admin() (the org allowlist). When the
-- acting HQ org_id isn't in this database's allowlist, is_merchant_admin() is false and the
-- INSERT raises 42501 ("new row violates row-level security policy"). The SELECT policies were
-- never satisfiable during impersonation either, so .insert().select() could not return the row.
--
-- Fix
-- ---
-- Add impersonation-aware policies keyed on an ACTIVE impersonation_sessions row. That row is
-- un-forgeable: impersonation_sessions has no INSERT policy, so only the HQ-gated
-- start_impersonation_session RPC can create it. Authorization therefore no longer depends on
-- the org allowlist (is_dexapos_admin), which is the latent fragility here.
--
-- These are ADDITIVE permissive policies (they only widen access for a live session); existing
-- merchant/HQ policies are left untouched.

-- ---------------------------------------------------------------------------
-- Predicate: caller has a fresh, active impersonation session for this merchant.
-- ---------------------------------------------------------------------------
create or replace function public.has_active_impersonation(p_merchant_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1
      from public.impersonation_sessions s
     where s.hq_user_id         = public.current_user_id()
       and s.target_merchant_id = p_merchant_id
       and s.ended_at           is null
       and s.last_validated_at  > now() - interval '24 hours'
  );
$$;

-- Match the EXECUTE grants of the sibling RLS helpers.
revoke all on function public.has_active_impersonation(uuid) from public;
grant execute on function public.has_active_impersonation(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- schedules
-- ---------------------------------------------------------------------------
drop policy if exists "schedules_impersonation_select" on public.schedules;
create policy "schedules_impersonation_select" on public.schedules
  for select to authenticated
  using (public.has_active_impersonation(merchant_id));

drop policy if exists "schedules_impersonation_insert" on public.schedules;
create policy "schedules_impersonation_insert" on public.schedules
  for insert to authenticated
  with check (public.has_active_impersonation(merchant_id));

drop policy if exists "schedules_impersonation_update" on public.schedules;
create policy "schedules_impersonation_update" on public.schedules
  for update to authenticated
  using (public.has_active_impersonation(merchant_id))
  with check (public.has_active_impersonation(merchant_id));

drop policy if exists "schedules_impersonation_delete" on public.schedules;
create policy "schedules_impersonation_delete" on public.schedules
  for delete to authenticated
  using (public.has_active_impersonation(merchant_id));

-- ---------------------------------------------------------------------------
-- schedule_time_slots (CreateSchedule inserts slots in the same flow)
-- ---------------------------------------------------------------------------
drop policy if exists "schedule_time_slots_impersonation_select" on public.schedule_time_slots;
create policy "schedule_time_slots_impersonation_select" on public.schedule_time_slots
  for select to authenticated
  using (public.has_active_impersonation(merchant_id));

drop policy if exists "schedule_time_slots_impersonation_insert" on public.schedule_time_slots;
create policy "schedule_time_slots_impersonation_insert" on public.schedule_time_slots
  for insert to authenticated
  with check (public.has_active_impersonation(merchant_id));

drop policy if exists "schedule_time_slots_impersonation_update" on public.schedule_time_slots;
create policy "schedule_time_slots_impersonation_update" on public.schedule_time_slots
  for update to authenticated
  using (public.has_active_impersonation(merchant_id))
  with check (public.has_active_impersonation(merchant_id));

drop policy if exists "schedule_time_slots_impersonation_delete" on public.schedule_time_slots;
create policy "schedule_time_slots_impersonation_delete" on public.schedule_time_slots
  for delete to authenticated
  using (public.has_active_impersonation(merchant_id));
