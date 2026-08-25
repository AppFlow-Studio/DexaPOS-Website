-- Durable merchant charge authorization and idempotent failed-payment delivery.

begin;

alter table public.subscription_plan_requests
  add column if not exists authorization_reference text,
  add column if not exists authorization_accepted boolean not null default false,
  add column if not exists authorization_accepted_at timestamptz,
  add column if not exists authorization_terms_version text,
  add column if not exists authorization_text text,
  add column if not exists authorized_price_cents integer,
  add column if not exists authorized_billing_cadence text,
  add column if not exists authorization_ip_address text,
  add column if not exists authorization_user_agent text;

create unique index if not exists idx_subscription_plan_requests_authorization_reference
  on public.subscription_plan_requests (authorization_reference)
  where authorization_reference is not null;

alter table public.subscription_plan_requests
  drop constraint if exists subscription_plan_requests_authorized_price_check;
alter table public.subscription_plan_requests
  add constraint subscription_plan_requests_authorized_price_check
  check (authorized_price_cents is null or authorized_price_cents >= 0);

alter table public.subscription_plan_requests
  drop constraint if exists subscription_plan_requests_authorization_complete_check;
alter table public.subscription_plan_requests
  add constraint subscription_plan_requests_authorization_complete_check
  check (
    authorization_accepted = false
    or (
      authorization_reference is not null
      and authorization_accepted_at is not null
      and authorization_terms_version is not null
      and authorization_text is not null
      and authorized_price_cents is not null
      and authorized_billing_cadence is not null
    )
  );

create or replace function public.protect_subscription_plan_request_authorization()
returns trigger
language plpgsql
security invoker
set search_path = 'public', 'pg_temp'
as $function$
begin
  if old.authorization_accepted and (
    new.authorization_reference is distinct from old.authorization_reference
    or new.authorization_accepted is distinct from old.authorization_accepted
    or new.authorization_accepted_at is distinct from old.authorization_accepted_at
    or new.authorization_terms_version is distinct from old.authorization_terms_version
    or new.authorization_text is distinct from old.authorization_text
    or new.authorized_price_cents is distinct from old.authorized_price_cents
    or new.authorized_billing_cadence is distinct from old.authorized_billing_cadence
    or new.authorization_ip_address is distinct from old.authorization_ip_address
    or new.authorization_user_agent is distinct from old.authorization_user_agent
    or new.requested_by is distinct from old.requested_by
    or new.requested_by_email is distinct from old.requested_by_email
  ) then
    raise exception 'Subscription authorization evidence is immutable';
  end if;

  return new;
end;
$function$;

drop trigger if exists protect_subscription_plan_request_authorization
  on public.subscription_plan_requests;
create trigger protect_subscription_plan_request_authorization
before update on public.subscription_plan_requests
for each row execute function public.protect_subscription_plan_request_authorization();

create table if not exists public.subscription_billing_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.subscription_invoices(id) on delete cascade,
  event_key text not null,
  channel text not null check (channel in ('email', 'app_notification')),
  recipient text not null,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed')),
  attempt_count integer not null default 1 check (attempt_count > 0),
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (invoice_id, event_key, channel, recipient)
);

create index if not exists idx_subscription_billing_delivery_status
  on public.subscription_billing_notification_deliveries (status, updated_at desc);

drop trigger if exists update_subscription_billing_notification_deliveries_updated_at
  on public.subscription_billing_notification_deliveries;
create trigger update_subscription_billing_notification_deliveries_updated_at
before update on public.subscription_billing_notification_deliveries
for each row execute function public.update_updated_at_column();

alter table public.subscription_billing_notification_deliveries enable row level security;
alter table public.subscription_billing_notification_deliveries force row level security;

drop policy if exists subscription_billing_notification_deliveries_hq_select
  on public.subscription_billing_notification_deliveries;
create policy subscription_billing_notification_deliveries_hq_select
on public.subscription_billing_notification_deliveries
for select
to authenticated
using (public.hq_has_permission('system.billing.manage'));

revoke all on table public.subscription_billing_notification_deliveries
  from public, anon, authenticated;
grant select on table public.subscription_billing_notification_deliveries
  to authenticated;
grant all on table public.subscription_billing_notification_deliveries
  to service_role;

revoke all on function public.protect_subscription_plan_request_authorization()
  from public, anon, authenticated;

commit;

