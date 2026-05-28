-- =============================================================================
-- Friday Security Hardening: Lanes A-D
-- Scope:
--   A. RLS lockdown
--   B. Cascade FK hardening
--   C. PIN hash backfill
--   D. SECURITY DEFINER privilege hardening
--
-- Notes:
-- - Lane A4 CFD public-read intent still needs product confirmation. This
--   migration preserves public CFD reads, but narrows them explicitly to
--   anon/authenticated instead of implicit PUBLIC.
-- - Lane B4 (merchant_billing_profiles/customers soft-delete conversation) is
--   intentionally documented only and not changed here.
-- =============================================================================

begin;
-- =============================================================================
-- Shared helper for tenant-scoped RLS
-- =============================================================================

create or replace function public.user_belongs_to_merchant(p_merchant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    p_merchant_id is not null
    and (
      public.is_dexapos_admin()
      or exists (
        select 1
        from public.admin_merchant_access ama
        where ama.merchant_id = p_merchant_id
          and ama.admin_user_id = public.current_user_id()
          and ama.is_active = true
      )
      or exists (
        select 1
        from public.location_members lm
        where lm.merchant_id = p_merchant_id
          and lm.user_id = public.current_user_id()
          and lm.is_active = true
      )
      or exists (
        select 1
        from public.staff_profiles sp
        where sp.merchant_id = p_merchant_id
          and sp.user_id = public.current_user_id()
          and sp.is_active = true
      )
      or exists (
        select 1
        from public.merchants mer
        join public.members m
          on m.organization_id = mer.clerk_org_id
        where mer.id = p_merchant_id
          and m.user_id = public.current_user_id()
      )
      or exists (
        select 1
        from public.merchants mer
        join public.carriers c
          on c.id = mer.carrier_id
        join public.members m
          on m.organization_id = c.clerk_org_id
        where mer.id = p_merchant_id
          and m.user_id = public.current_user_id()
      )
    );
$function$;
revoke all on function public.user_belongs_to_merchant(uuid) from public;
grant execute on function public.user_belongs_to_merchant(uuid) to authenticated;
grant execute on function public.user_belongs_to_merchant(uuid) to service_role;
-- =============================================================================
-- Lane A - RLS lockdown
-- =============================================================================

-- A1. merchants must have enabled + forced RLS
alter table public.merchants enable row level security;
alter table only public.merchants force row level security;
-- A2. Replace always-true tenant-scoped SELECT policies

drop policy if exists "location_select" on public.locations;
create policy "location_select"
on public.locations
for select
to authenticated
using (
  public.user_belongs_to_merchant(merchant_id)
  or public.is_location_member(id)
);
drop policy if exists "locations_insert" on public.locations;
create policy "locations_insert"
on public.locations
for insert
to authenticated
with check (public.user_belongs_to_merchant(merchant_id));
drop policy if exists "locations_update" on public.locations;
create policy "locations_update"
on public.locations
for update
to authenticated
using (
  public.is_merchant_admin(merchant_id)
  or public.user_has_location_permission(id, 'location.manage')
)
with check (public.user_belongs_to_merchant(merchant_id));
drop policy if exists "Enable read access for all users" on public.categories;
drop policy if exists "categories_tenant_select" on public.categories;
create policy "categories_tenant_select"
on public.categories
for select
to authenticated
using (public.user_belongs_to_merchant(merchant_id));
drop policy if exists "Enable read access for all users" on public.category_items;
drop policy if exists "category_items_tenant_select" on public.category_items;
create policy "category_items_tenant_select"
on public.category_items
for select
to authenticated
using (public.user_belongs_to_merchant(merchant_id));
drop policy if exists "Enable read access for all users" on public.category_schedules;
drop policy if exists "category_schedules_tenant_select" on public.category_schedules;
create policy "category_schedules_tenant_select"
on public.category_schedules
for select
to authenticated
using (public.user_belongs_to_merchant(merchant_id));
drop policy if exists "Enable read access for all users" on public.menu_item_menus;
drop policy if exists "menu_item_menus_tenant_select" on public.menu_item_menus;
create policy "menu_item_menus_tenant_select"
on public.menu_item_menus
for select
to authenticated
using (public.user_belongs_to_merchant(merchant_id));
drop policy if exists "Enable read access for all users" on public.menu_item_modifier_groups;
drop policy if exists "menu_item_modifier_groups_tenant_select" on public.menu_item_modifier_groups;
create policy "menu_item_modifier_groups_tenant_select"
on public.menu_item_modifier_groups
for select
to authenticated
using (public.user_belongs_to_merchant(merchant_id));
drop policy if exists "Enable read access for all users" on public.modifier_group_items;
drop policy if exists "modifier_group_items_tenant_select" on public.modifier_group_items;
create policy "modifier_group_items_tenant_select"
on public.modifier_group_items
for select
to authenticated
using (public.user_belongs_to_merchant(merchant_id));
drop policy if exists "Enable read access for all users" on public.order_payment_items;
drop policy if exists "order_payment_items_tenant_select" on public.order_payment_items;
create policy "order_payment_items_tenant_select"
on public.order_payment_items
for select
to authenticated
using (
  exists (
    select 1
    from public.order_payments op
    join public.orders o
      on o.id = op.order_id
    where op.id = order_payment_items.order_payment_id
      and public.user_belongs_to_merchant(o.merchant_id)
  )
);
drop policy if exists "Enable read access for all users" on public.members;
drop policy if exists "members_tenant_select" on public.members;
create policy "members_tenant_select"
on public.members
for select
to authenticated
using (
  user_id = public.current_user_id()
  or exists (
    select 1
    from public.merchants mer
    where mer.clerk_org_id = members.organization_id
      and public.user_belongs_to_merchant(mer.id)
  )
);
drop policy if exists "Enable read access for all users" on public.organizations;
drop policy if exists "organizations_tenant_select" on public.organizations;
create policy "organizations_tenant_select"
on public.organizations
for select
to authenticated
using (
  id = public.get_my_claim('org_id')
  or exists (
    select 1
    from public.merchants mer
    where mer.clerk_org_id = organizations.id
      and public.user_belongs_to_merchant(mer.id)
  )
);
drop policy if exists "Enable read access for all users" on public.users;
drop policy if exists "users_tenant_select" on public.users;
create policy "users_tenant_select"
on public.users
for select
to authenticated
using (
  id = public.current_user_id()
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
-- Tables added after the main remote dump still shipped with SELECT USING (true)
drop policy if exists "Enable read access for all users" on public.category_modifier_groups;
drop policy if exists "category_modifier_groups_tenant_select" on public.category_modifier_groups;
create policy "category_modifier_groups_tenant_select"
on public.category_modifier_groups
for select
to authenticated
using (public.user_belongs_to_merchant(merchant_id));
drop policy if exists "Enable read access for all users" on public.location_item_modifier_groups;
drop policy if exists "location_item_modifier_groups_tenant_select" on public.location_item_modifier_groups;
create policy "location_item_modifier_groups_tenant_select"
on public.location_item_modifier_groups
for select
to authenticated
using (public.user_belongs_to_merchant(merchant_id));
-- A3. Lock down audit_logs
drop policy if exists "audit_logs_insert" on public.audit_logs;
drop policy if exists "audit_logs_read" on public.audit_logs;
create policy "audit_logs_read"
on public.audit_logs
for select
to authenticated
using (
  merchant_id is not null
  and public.user_belongs_to_merchant(merchant_id)
);
create policy "audit_logs_insert"
on public.audit_logs
for insert
to authenticated
with check (
  actor_user_id = public.current_user_id()
  and (
    merchant_id is null
    or public.user_belongs_to_merchant(merchant_id)
  )
);
-- A4 + A6. Rebuild CFD policies explicitly
do $$
declare
  r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('cfd_carousel_images', 'cfd_ordering_panel_images')
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      r.policyname,
      r.schemaname,
      r.tablename
    );
  end loop;
end $$;
create policy "cfd_carousel_images_public_read"
on public.cfd_carousel_images
for select
to anon, authenticated
using (true);
create policy "cfd_carousel_images_location_write"
on public.cfd_carousel_images
to authenticated
using (
  location_id = any (public.user_location_ids())
)
with check (
  location_id = any (public.user_location_ids())
);
create policy "cfd_ordering_panel_images_public_read"
on public.cfd_ordering_panel_images
for select
to anon, authenticated
using (true);
create policy "cfd_ordering_panel_images_location_write"
on public.cfd_ordering_panel_images
to authenticated
using (
  location_id = any (public.user_location_ids())
)
with check (
  location_id = any (public.user_location_ids())
);
-- A5. waitlist needs forced RLS and tenant-scoped access
alter table public.waitlist enable row level security;
alter table only public.waitlist force row level security;
drop policy if exists "waitlist_tenant_scope" on public.waitlist;
create policy "waitlist_tenant_scope"
on public.waitlist
for all
to authenticated
using (
  public.user_belongs_to_merchant(merchant_id)
  or public.is_location_member(location_id)
)
with check (
  public.user_belongs_to_merchant(merchant_id)
  or public.is_location_member(location_id)
);
-- A7. session_kick_notifications must not be globally readable/writable
drop policy if exists "session_kick_notifications_location_scope" on public.session_kick_notifications;
drop policy if exists "session_kick_notifications_tenant_scope" on public.session_kick_notifications;
create policy "session_kick_notifications_tenant_scope"
on public.session_kick_notifications
for all
to authenticated
using (
  exists (
    select 1
    from public.station_sessions ss
    where ss.id = session_kick_notifications.session_id
      and (
        public.user_belongs_to_merchant(ss.merchant_id)
        or public.is_location_member(ss.location_id)
      )
  )
)
with check (
  exists (
    select 1
    from public.station_sessions ss
    where ss.id = session_kick_notifications.session_id
      and (
        public.user_belongs_to_merchant(ss.merchant_id)
        or public.is_location_member(ss.location_id)
      )
  )
);
-- =============================================================================
-- Lane B - Cascade FK hardening
-- =============================================================================

alter table public.audit_logs
  drop constraint if exists audit_logs_merchant_id_fkey;
alter table public.audit_logs
  add constraint audit_logs_merchant_id_fkey
  foreign key (merchant_id)
  references public.merchants(id)
  on delete set null;
alter table public.audit_logs
  drop constraint if exists audit_logs_actor_user_id_fkey;
alter table public.audit_logs
  add constraint audit_logs_actor_user_id_fkey
  foreign key (actor_user_id)
  references public.users(id)
  on update cascade
  on delete set null;
alter table public.order_payments
  drop constraint if exists order_payments_order_id_fkey;
alter table public.order_payments
  add constraint order_payments_order_id_fkey
  foreign key (order_id)
  references public.orders(id)
  on delete restrict;
-- B4 follow-up only:
-- - merchant_billing_profiles.merchant_id_fkey
-- - customers.merchant_id_fkey
-- Both need a soft-delete architecture conversation and are intentionally
-- deferred out of this migration.

-- =============================================================================
-- Lane C - PIN backfill
-- =============================================================================

update public.location_members
set pin_hashed = extensions.crypt(pin_plain, extensions.gen_salt('bf', 10))
where pin_plain is not null
  and pin_hashed is null;
do $$
begin
  if exists (
    select 1
    from public.location_members
    where pin_plain is not null
      and pin_hashed is null
  ) then
    raise exception 'PIN hash backfill incomplete: location_members rows still have pin_plain without pin_hashed';
  end if;
end $$;
-- =============================================================================
-- Lane D - SECURITY DEFINER privilege hardening
-- =============================================================================

do $$
declare
  r record;
  v_search_path_names text[] := array[
    'add_order_item_v2',
    'apply_refund_to_payment',
    'broadcast_order_changes',
    'calculate_order_totals_fast',
    'ensure_course_exists',
    'get_categories_for_location',
    'get_eod_cash_summary',
    'get_kds_tickets_v2',
    'get_menu_with_categories',
    'get_session_variance_analysis',
    'process_payment_v8',
    'record_cash_operation',
    'record_refund_items',
    'remove_order_item',
    'reset_category_item_to_level',
    'upsert_category_item_override',
    'void_payment'
  ];
begin
  for r in
    select p.oid::regprocedure as regproc
    from pg_proc p
    join pg_namespace n
      on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any (v_search_path_names)
  loop
    execute format('alter function %s set search_path = ''''', r.regproc);
  end loop;
end $$;
do $$
declare
  r record;
  v_revoke_names text[] := array[
    'add_order_item_v2',
    'apply_refund_to_payment',
    'broadcast_order_changes',
    'calculate_order_totals_fast',
    'ensure_course_exists',
    'get_eod_cash_summary',
    'get_kds_tickets_v2',
    'get_session_variance_analysis',
    'process_payment_v8',
    'record_cash_operation',
    'record_refund_items',
    'remove_order_item',
    'reset_category_item_to_level',
    'upsert_category_item_override',
    'void_payment',
    'pos_staff_login'
  ];
begin
  for r in
    select p.oid::regprocedure as regproc
    from pg_proc p
    join pg_namespace n
      on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any (v_revoke_names)
  loop
    execute format('revoke execute on function %s from public, anon', r.regproc);
  end loop;
end $$;
commit;
