-- Let merchant admins UPDATE their own schedules.
--
-- Root cause
-- ----------
-- public.schedules has merchant-admin policies for INSERT and DELETE
-- (is_merchant_admin(merchant_id)) and read policies for members, but no
-- UPDATE policy outside HQ impersonation. Under RLS an UPDATE with no matching
-- policy is not an error — it silently matches zero rows. So from the
-- dashboard:
--   * ToggleScheduleActive's .update().select().single() fails with PGRST116
--     ("The result contains 0 rows").
--   * UpdateScheduleWithTimeSlots' name / description / is_active update
--     "succeeds" while changing nothing (only its slot rewrite lands, because
--     that part uses the service-role client).
--
-- Fix
-- ---
-- Add the missing UPDATE policy with the same predicate the INSERT and DELETE
-- policies already use. Additive and permissive: nothing that works today
-- changes. WITH CHECK stops a schedule being moved to another merchant.

drop policy if exists "schedules_merchant_admin_update" on public.schedules;
create policy "schedules_merchant_admin_update" on public.schedules
  for update to authenticated
  using (public.is_merchant_admin(merchant_id))
  with check (public.is_merchant_admin(merchant_id));

-- ---------------------------------------------------------------------------
-- Verification (staging first):
--
--   -- Policies on schedules — expect select, insert, update, delete for
--   -- merchant admins (plus the impersonation set):
--   SELECT policyname, cmd FROM pg_policies
--    WHERE schemaname = 'public' AND tablename = 'schedules'
--    ORDER BY cmd, policyname;
--
--   -- Then in the dashboard: Schedules → Menu availability → toggle a
--   -- schedule. It should flip without the PGRST116 error, and the POS
--   -- probe (get_pos_menu_version_v3) should move.
-- ---------------------------------------------------------------------------
