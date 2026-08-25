-- Subscription plan requests and read-only application notifications.
--
-- Subscription changes are workflow records, not support conversations. This
-- migration gives merchant plan requests their own approve/deny lifecycle and
-- provides a shared read-only notification feed for merchant and HQ users.

begin;

create sequence if not exists public.subscription_plan_request_number_seq;

create table if not exists public.subscription_plan_requests (
  id uuid primary key default gen_random_uuid(),
  request_number text not null unique default (
    'SUB-' || lpad(nextval('public.subscription_plan_request_number_seq')::text, 5, '0')
  ),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  current_plan_id uuid references public.subscription_plans(id) on delete set null,
  requested_plan_id uuid not null references public.subscription_plans(id) on delete restrict,
  requested_by text not null,
  requested_by_email text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'denied', 'cancelled')),
  reviewed_by text,
  reviewed_at timestamptz,
  decision_note text,
  applied_subscription_id uuid references public.merchant_plan_subscriptions(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_subscription_plan_requests_one_pending_per_merchant
  on public.subscription_plan_requests (merchant_id)
  where status = 'pending';

create index if not exists idx_subscription_plan_requests_hq_queue
  on public.subscription_plan_requests (status, created_at desc);

create index if not exists idx_subscription_plan_requests_merchant_history
  on public.subscription_plan_requests (merchant_id, created_at desc);

drop trigger if exists update_subscription_plan_requests_updated_at
  on public.subscription_plan_requests;
create trigger update_subscription_plan_requests_updated_at
before update on public.subscription_plan_requests
for each row execute function public.update_updated_at_column();

create table if not exists public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  audience text not null check (audience in ('hq', 'merchant')),
  merchant_id uuid references public.merchants(id) on delete cascade,
  recipient_user_id text,
  notification_type text not null,
  title text not null check (length(btrim(title)) between 1 and 160),
  body text not null check (length(btrim(body)) between 1 and 2000),
  href text,
  actor_user_id text,
  subscription_plan_request_id uuid
    references public.subscription_plan_requests(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint app_notifications_merchant_audience_scope check (
    (audience = 'merchant' and merchant_id is not null)
    or audience = 'hq'
  )
);

create index if not exists idx_app_notifications_audience_created
  on public.app_notifications (audience, created_at desc);

create index if not exists idx_app_notifications_merchant_created
  on public.app_notifications (merchant_id, created_at desc)
  where merchant_id is not null;

create index if not exists idx_app_notifications_recipient_created
  on public.app_notifications (recipient_user_id, created_at desc)
  where recipient_user_id is not null;

create table if not exists public.app_notification_reads (
  notification_id uuid not null references public.app_notifications(id) on delete cascade,
  user_id text not null,
  read_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);

create index if not exists idx_app_notification_reads_user
  on public.app_notification_reads (user_id, read_at desc);

alter table public.subscription_plan_requests enable row level security;
alter table public.subscription_plan_requests force row level security;
alter table public.app_notifications enable row level security;
alter table public.app_notifications force row level security;
alter table public.app_notification_reads enable row level security;
alter table public.app_notification_reads force row level security;

drop policy if exists subscription_plan_requests_select on public.subscription_plan_requests;
create policy subscription_plan_requests_select
on public.subscription_plan_requests
for select
to authenticated
using (
  (public.user_belongs_to_merchant(merchant_id) and not public.is_dexapos_admin())
  or public.hq_has_permission('system.billing.manage')
);

drop policy if exists app_notifications_select on public.app_notifications;
create policy app_notifications_select
on public.app_notifications
for select
to authenticated
using (
  (recipient_user_id is null or recipient_user_id = public.current_user_id())
  and (
    (
      audience = 'merchant'
      and not public.is_dexapos_admin()
      and public.user_belongs_to_merchant(merchant_id)
    )
    or (audience = 'hq' and public.hq_has_permission('system.billing.manage'))
  )
);

drop policy if exists app_notification_reads_select on public.app_notification_reads;
create policy app_notification_reads_select
on public.app_notification_reads
for select
to authenticated
using (user_id = public.current_user_id());

create or replace function public.get_my_app_notifications(p_limit integer default 20)
returns table (
  id uuid,
  audience text,
  merchant_id uuid,
  notification_type text,
  title text,
  body text,
  href text,
  metadata jsonb,
  created_at timestamptz,
  is_read boolean
)
language sql
stable
security invoker
set search_path = 'public', 'pg_temp'
as $function$
  select
    n.id,
    n.audience,
    n.merchant_id,
    n.notification_type,
    n.title,
    n.body,
    n.href,
    n.metadata,
    n.created_at,
    exists (
      select 1
      from public.app_notification_reads r
      where r.notification_id = n.id
        and r.user_id = public.current_user_id()
    ) as is_read
  from public.app_notifications n
  order by n.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
$function$;

create or replace function public.get_my_unread_app_notification_count()
returns bigint
language sql
stable
security invoker
set search_path = 'public', 'pg_temp'
as $function$
  select count(*)
  from public.app_notifications n
  where not exists (
    select 1
    from public.app_notification_reads r
    where r.notification_id = n.id
      and r.user_id = public.current_user_id()
  );
$function$;

create or replace function public.mark_app_notification_read(p_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_user_id text := public.current_user_id();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.app_notifications n
    where n.id = p_notification_id
      and (n.recipient_user_id is null or n.recipient_user_id = v_user_id)
      and (
        (
          n.audience = 'merchant'
          and not public.is_dexapos_admin()
          and public.user_belongs_to_merchant(n.merchant_id)
        )
        or (n.audience = 'hq' and public.hq_has_permission('system.billing.manage'))
      )
  ) then
    raise exception 'Notification not found';
  end if;

  insert into public.app_notification_reads (notification_id, user_id, read_at)
  values (p_notification_id, v_user_id, now())
  on conflict (notification_id, user_id)
  do update set read_at = excluded.read_at;
end;
$function$;

create or replace function public.mark_all_app_notifications_read()
returns integer
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_user_id text := public.current_user_id();
  v_count integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  insert into public.app_notification_reads (notification_id, user_id, read_at)
  select n.id, v_user_id, now()
  from public.app_notifications n
  where (n.recipient_user_id is null or n.recipient_user_id = v_user_id)
    and (
      (
        n.audience = 'merchant'
        and not public.is_dexapos_admin()
        and public.user_belongs_to_merchant(n.merchant_id)
      )
      or (n.audience = 'hq' and public.hq_has_permission('system.billing.manage'))
    )
  on conflict (notification_id, user_id) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

revoke all on table public.subscription_plan_requests from public, anon, authenticated;
revoke all on table public.app_notifications from public, anon, authenticated;
revoke all on table public.app_notification_reads from public, anon, authenticated;

grant select on table public.subscription_plan_requests to authenticated;
grant select on table public.app_notifications to authenticated;
grant select on table public.app_notification_reads to authenticated;
grant all on table public.subscription_plan_requests to service_role;
grant all on table public.app_notifications to service_role;
grant all on table public.app_notification_reads to service_role;
grant usage, select on sequence public.subscription_plan_request_number_seq to service_role;

revoke all on function public.get_my_app_notifications(integer) from public, anon;
revoke all on function public.get_my_unread_app_notification_count() from public, anon;
revoke all on function public.mark_app_notification_read(uuid) from public, anon;
revoke all on function public.mark_all_app_notifications_read() from public, anon;

grant execute on function public.get_my_app_notifications(integer) to authenticated, service_role;
grant execute on function public.get_my_unread_app_notification_count() to authenticated, service_role;
grant execute on function public.mark_app_notification_read(uuid) to authenticated, service_role;
grant execute on function public.mark_all_app_notifications_read() to authenticated, service_role;

do $publication$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'app_notifications'
  ) then
    alter publication supabase_realtime add table public.app_notifications;
  end if;
end;
$publication$;

commit;
