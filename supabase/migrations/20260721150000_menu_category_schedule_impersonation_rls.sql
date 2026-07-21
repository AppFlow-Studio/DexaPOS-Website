-- Extend impersonation-aware RLS to menu_schedules + category_schedules.
--
-- Same gap as schedules (see 20260721140000): write policies gate on
-- is_merchant_admin(merchant_id) and read policies on merchant membership, neither of
-- which an HQ admin impersonating a merchant satisfies. Attaching a schedule to a menu
-- (AssignScheduleToMenu -> menu_schedules INSERT) therefore fails under impersonation.
--
-- Reuses public.has_active_impersonation(uuid) from 20260721140000. Additive permissive
-- policies; existing merchant/HQ policies are left untouched.

-- ---------------------------------------------------------------------------
-- menu_schedules
-- ---------------------------------------------------------------------------
drop policy if exists "menu_schedules_impersonation_select" on public.menu_schedules;
create policy "menu_schedules_impersonation_select" on public.menu_schedules
  for select to authenticated
  using (public.has_active_impersonation(merchant_id));

drop policy if exists "menu_schedules_impersonation_insert" on public.menu_schedules;
create policy "menu_schedules_impersonation_insert" on public.menu_schedules
  for insert to authenticated
  with check (public.has_active_impersonation(merchant_id));

drop policy if exists "menu_schedules_impersonation_update" on public.menu_schedules;
create policy "menu_schedules_impersonation_update" on public.menu_schedules
  for update to authenticated
  using (public.has_active_impersonation(merchant_id))
  with check (public.has_active_impersonation(merchant_id));

drop policy if exists "menu_schedules_impersonation_delete" on public.menu_schedules;
create policy "menu_schedules_impersonation_delete" on public.menu_schedules
  for delete to authenticated
  using (public.has_active_impersonation(merchant_id));

-- ---------------------------------------------------------------------------
-- category_schedules
-- ---------------------------------------------------------------------------
drop policy if exists "category_schedules_impersonation_select" on public.category_schedules;
create policy "category_schedules_impersonation_select" on public.category_schedules
  for select to authenticated
  using (public.has_active_impersonation(merchant_id));

drop policy if exists "category_schedules_impersonation_insert" on public.category_schedules;
create policy "category_schedules_impersonation_insert" on public.category_schedules
  for insert to authenticated
  with check (public.has_active_impersonation(merchant_id));

drop policy if exists "category_schedules_impersonation_update" on public.category_schedules;
create policy "category_schedules_impersonation_update" on public.category_schedules
  for update to authenticated
  using (public.has_active_impersonation(merchant_id))
  with check (public.has_active_impersonation(merchant_id));

drop policy if exists "category_schedules_impersonation_delete" on public.category_schedules;
create policy "category_schedules_impersonation_delete" on public.category_schedules
  for delete to authenticated
  using (public.has_active_impersonation(merchant_id));
