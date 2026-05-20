begin;
-- =============================================================================
-- Saturday security hardening follow-up (Lanes E-I)
-- =============================================================================
-- Scope grounded in the current repo state:
-- - Lane E: add low-risk CHECK constraints that match current role/status usage
-- - Lane F: lock down support attachments bucket, add cfd-images limits,
--           and add explicit storage.objects write policies
-- - Lane G: convert remaining postgres-owned views to security_invoker
-- - Lane H: no auth.uid() references remain in the local schema snapshot;
--           staging verification still required, but no SQL rewrite is needed
-- - Lane I: harden helper functions/search_path and keep Clerk-compatible
--           auth.jwt()->>'sub' claim lookups as the source of truth
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Lane E - Role/status constraints
-- -----------------------------------------------------------------------------

alter table public.members
  drop constraint if exists members_role_not_blank_check;
alter table public.members
  add constraint members_role_not_blank_check
  check (role is null or btrim(role) <> '');
alter table public.pending_org_admin_invites
  drop constraint if exists pending_org_admin_invites_role_check;
alter table public.pending_org_admin_invites
  add constraint pending_org_admin_invites_role_check
  check (
    role is null
    or btrim(role) <> ''
  );
alter table public.pending_org_admin_invites
  drop constraint if exists pending_org_admin_invites_status_check;
alter table public.pending_org_admin_invites
  add constraint pending_org_admin_invites_status_check
  check (
    status is null
    or status = any (
      array[
        'pending'::text,
        'revoked'::text,
        'accepted'::text,
        'expired'::text,
        'cancelled'::text,
        'failed'::text,
        'direct_created'::text
      ]
    )
  );
-- -----------------------------------------------------------------------------
-- Lane F - Storage bucket lockdown
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'support-attachments',
  'support-attachments',
  false,
  5242880,
  array[
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/pdf'
  ]::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cfd-images',
  'cfd-images',
  true,
  5242880,
  array[
    'image/png',
    'image/jpeg',
    'image/webp'
  ]::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists support_attachments_insert on storage.objects;
create policy support_attachments_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'support-attachments'
  and (
    (
      (storage.foldername(name))[1] = 'admin'
      and (storage.foldername(name))[2] = 'tickets'
      and public.is_dexapos_admin()
    )
    or (
      (storage.foldername(name))[1] = public.user_merchant_id()::text
      and (storage.foldername(name))[2] = 'tickets'
    )
  )
);
drop policy if exists support_attachments_update on storage.objects;
create policy support_attachments_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'support-attachments'
  and (
    (
      (storage.foldername(name))[1] = 'admin'
      and (storage.foldername(name))[2] = 'tickets'
      and public.is_dexapos_admin()
    )
    or (
      (storage.foldername(name))[1] = public.user_merchant_id()::text
      and (storage.foldername(name))[2] = 'tickets'
    )
  )
)
with check (
  bucket_id = 'support-attachments'
  and (
    (
      (storage.foldername(name))[1] = 'admin'
      and (storage.foldername(name))[2] = 'tickets'
      and public.is_dexapos_admin()
    )
    or (
      (storage.foldername(name))[1] = public.user_merchant_id()::text
      and (storage.foldername(name))[2] = 'tickets'
    )
  )
);
drop policy if exists support_attachments_delete on storage.objects;
create policy support_attachments_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'support-attachments'
  and (
    (
      (storage.foldername(name))[1] = 'admin'
      and (storage.foldername(name))[2] = 'tickets'
      and public.is_dexapos_admin()
    )
    or (
      (storage.foldername(name))[1] = public.user_merchant_id()::text
      and (storage.foldername(name))[2] = 'tickets'
    )
  )
);
-- -----------------------------------------------------------------------------
-- Lane G - postgres-owned views -> security_invoker
-- -----------------------------------------------------------------------------

alter view public.vw_platform_transactions set (security_invoker = true);
alter view public.v_cash_drawer_summary set (security_invoker = true);
alter view public.v_eod_cash_summary set (security_invoker = true);
alter view public.customer_profile_summary set (security_invoker = true);
alter view public.active_customers set (security_invoker = true);
alter view public.admin_merchant_summary set (security_invoker = true);
alter view public.admin_device_summary set (security_invoker = true);
alter view public.admin_device_inventory set (security_invoker = true);
alter view public.location_summary set (security_invoker = true);
alter view public.v_location_menu_items set (security_invoker = true);
-- -----------------------------------------------------------------------------
-- Lane I - Helper verification and search_path hardening
-- -----------------------------------------------------------------------------

create or replace function public.get_my_claim(claim text)
returns text
language sql
stable
set search_path = ''
as $function$
  select auth.jwt()->>claim;
$function$;
create or replace function public.current_user_id()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  return public.get_my_claim('sub')::text;
end;
$function$;
create or replace function public.user_staff_profile_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $function$
  select sp.id
  from public.staff_profiles sp
  where sp.user_id = public.get_my_claim('sub')
  limit 1;
$function$;
create or replace function public.user_merchant_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $function$
  select sp.merchant_id
  from public.staff_profiles sp
  where sp.user_id = public.get_my_claim('sub')
  limit 1;
$function$;
create or replace function public.user_location_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(
    array_agg(distinct location_id),
    array[]::uuid[]
  )
  from (
    select lm.location_id
    from public.location_members lm
    where lm.is_active = true
      and lm.merchant_id = public.user_merchant_id()
      and (
        lm.user_id = public.get_my_claim('sub')
        or lm.staff_profile_id = public.user_staff_profile_id()
      )

    union

    select l.id as location_id
    from public.locations l
    where l.merchant_id = public.user_merchant_id()
      and exists (
        select 1
        from public.user_roles ur
        join public.roles r
          on r.code = ur.role_code
        where ur.user_id = public.get_my_claim('sub')
          and r.organization_type = 'merchant'
          and r.level_type = any (array['merchant'::text, 'organization'::text])
      )
  ) all_locations
  where location_id is not null;
$function$;
create or replace function public.is_merchant_admin(p_merchant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select (
    public.is_dexapos_admin()
    or exists (
      select 1
      from public.members m
      join public.merchants mer
        on mer.clerk_org_id = m.organization_id
      where m.user_id = public.current_user_id()
        and mer.id = p_merchant_id
        and m.role = any (
          array[
            'merchant.owner'::text,
            'merchant.admin'::text,
            'merchant.manager'::text
          ]
        )
    )
  );
$function$;
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
create or replace function public.update_terminal_status(
  p_terminal_id uuid,
  p_status text,
  p_is_connected boolean
)
returns json
language plpgsql
security definer
set search_path = ''
as $function$
begin
  update public.payment_terminals
  set
    is_connected = p_is_connected,
    last_connection_test_at = now(),
    last_connection_status = p_status,
    updated_at = now()
  where id = p_terminal_id
    and merchant_id in (
      select sp.merchant_id
      from public.staff_profiles sp
      where sp.user_id = public.get_my_claim('sub')
    );

  if not found then
    return json_build_object('success', false, 'error', 'Terminal not found');
  end if;

  return json_build_object('success', true);
end;
$function$;
commit;
