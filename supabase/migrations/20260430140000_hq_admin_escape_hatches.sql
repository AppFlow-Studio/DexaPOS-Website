-- Bug: the tenant-scoped SELECT policies introduced by
-- 20260427130000_security_hardening_lanes_a_to_d.sql for `members`,
-- `organizations`, `users`, and `audit_logs` only grant access via merchant
-- membership. HQ team members live in the HQ Clerk org (not tied to any
-- merchant), so HQ admins viewing the HQ users list / org list see only
-- themselves and their merchant-side data — never the HQ team itself or
-- HQ-level audit rows.
--
-- Fix: add an explicit `public.is_dexapos_admin()` escape hatch to each of
-- those four policies so DexaPOS HQ super-admins see everything.
-- Tenant-scoped branches stay intact for non-HQ users.

-- ─── members ────────────────────────────────────────────────────────────────
drop policy if exists "members_tenant_select" on public.members;
create policy "members_tenant_select"
on public.members
for select
to authenticated
using (
  public.is_dexapos_admin()
  or user_id = public.current_user_id()
  or exists (
    select 1
    from public.merchants mer
    where mer.clerk_org_id = members.organization_id
      and public.user_belongs_to_merchant(mer.id)
  )
);

-- ─── organizations ──────────────────────────────────────────────────────────
drop policy if exists "organizations_tenant_select" on public.organizations;
create policy "organizations_tenant_select"
on public.organizations
for select
to authenticated
using (
  public.is_dexapos_admin()
  or id = public.get_my_claim('org_id'::text)
  or exists (
    select 1
    from public.merchants mer
    where mer.clerk_org_id = organizations.id
      and public.user_belongs_to_merchant(mer.id)
  )
);

-- ─── users ──────────────────────────────────────────────────────────────────
drop policy if exists "users_tenant_select" on public.users;
create policy "users_tenant_select"
on public.users
for select
to authenticated
using (
  public.is_dexapos_admin()
  or id = public.current_user_id()
  or exists (
    select 1
    from public.staff_profiles sp
    where sp.user_id = users.id
      and public.user_belongs_to_merchant(sp.merchant_id)
  )
  or exists (
    select 1
    from public.members m
    join public.merchants mer
      on mer.clerk_org_id = m.organization_id
    where m.user_id = users.id
      and public.user_belongs_to_merchant(mer.id)
  )
);

-- ─── audit_logs ─────────────────────────────────────────────────────────────
-- Original policy required merchant_id IS NOT NULL, so HQ-level audit rows
-- (merchant_id NULL) were invisible to HQ admins.
drop policy if exists "audit_logs_read" on public.audit_logs;
create policy "audit_logs_read"
on public.audit_logs
for select
to authenticated
using (
  public.is_dexapos_admin()
  or (
    merchant_id is not null
    and public.user_belongs_to_merchant(merchant_id)
  )
);

notify pgrst, 'reload schema';
