-- Location-scoped hardware requests and HQ review workflow.
--
-- Hardware provisioning is intentionally separate from merchant-wide plan
-- requests. A merchant may have one pending request per location while HQ
-- approves or denies each request independently.

begin;

create sequence if not exists public.subscription_hardware_request_number_seq;

create table if not exists public.subscription_hardware_requests (
  id uuid primary key default gen_random_uuid(),
  request_number text not null unique default (
    'DEV-' || lpad(nextval('public.subscription_hardware_request_number_seq')::text, 5, '0')
  ),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  requested_by text not null,
  requested_by_email text,
  requested_quantity integer not null default 1 check (requested_quantity between 1 and 100),
  request_note text check (request_note is null or length(request_note) <= 2000),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'denied', 'cancelled')),
  reviewed_by text,
  reviewed_at timestamptz,
  decision_note text check (decision_note is null or length(decision_note) <= 2000),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_subscription_hardware_requests_one_pending_per_location
  on public.subscription_hardware_requests (merchant_id, location_id)
  where status = 'pending';

create index if not exists idx_subscription_hardware_requests_hq_queue
  on public.subscription_hardware_requests (status, created_at desc);

create index if not exists idx_subscription_hardware_requests_merchant_history
  on public.subscription_hardware_requests (merchant_id, created_at desc);

drop trigger if exists update_subscription_hardware_requests_updated_at
  on public.subscription_hardware_requests;
create trigger update_subscription_hardware_requests_updated_at
before update on public.subscription_hardware_requests
for each row execute function public.update_updated_at_column();

alter table public.subscription_hardware_requests enable row level security;
alter table public.subscription_hardware_requests force row level security;

drop policy if exists subscription_hardware_requests_select
  on public.subscription_hardware_requests;
create policy subscription_hardware_requests_select
on public.subscription_hardware_requests
for select
to authenticated
using (
  (public.user_belongs_to_merchant(merchant_id) and not public.is_dexapos_admin())
  or public.hq_has_permission('system.billing.manage')
);

revoke all on table public.subscription_hardware_requests from public, anon, authenticated;
grant select on table public.subscription_hardware_requests to authenticated;
grant all on table public.subscription_hardware_requests to service_role;
grant usage, select on sequence public.subscription_hardware_request_number_seq to service_role;

commit;
