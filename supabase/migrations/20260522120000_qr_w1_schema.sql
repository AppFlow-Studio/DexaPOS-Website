-- QR Dine-In Wave 1 schema spine
--
-- Additive only. This lands the shared database backbone for:
-- - table QR codes
-- - QR-bound online order sessions
-- - QR analytics events
-- - guest alert inbox
-- - QR store config flags
-- - qr_dine_in enum value
--
-- Follow-up waves add token helpers, anon RPCs, POS surfaces, and Track B
-- storefront / edge integration.

create table if not exists public.table_qr_codes (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id),
  location_id uuid not null references public.locations(id),
  floor_plan_object_id uuid not null references public.floor_plan_objects(id),
  table_label text not null,
  token text not null unique,
  token_version int not null default 1,
  is_active boolean not null default true,
  scan_count bigint not null default 0,
  last_scanned_at timestamptz,
  created_at timestamptz not null default now(),
  rotated_at timestamptz,
  created_by text,
  constraint table_qr_codes_token_version_positive
    check (token_version > 0),
  constraint table_qr_codes_scan_count_nonnegative
    check (scan_count >= 0)
);

create unique index if not exists uq_active_qr_per_table
  on public.table_qr_codes(floor_plan_object_id)
  where is_active;

alter table public.online_store_config
  add column if not exists accepts_dine_in boolean not null default false,
  add column if not exists qr_fulfillment_mode text not null default 'runner',
  add column if not exists qr_geofence_enabled boolean not null default false,
  add column if not exists qr_service_fee_pct numeric(5,2) not null default 0,
  add column if not exists qr_kill_switch boolean not null default false;

alter table public.online_store_config
  drop constraint if exists online_store_config_qr_fulfillment_mode_check;

alter table public.online_store_config
  add constraint online_store_config_qr_fulfillment_mode_check
  check (qr_fulfillment_mode in ('runner', 'counter'));

alter table public.online_order_sessions
  add column if not exists floor_plan_object_id uuid references public.floor_plan_objects(id),
  add column if not exists table_label text,
  add column if not exists table_qr_code_id uuid references public.table_qr_codes(id);

alter type public.order_type add value if not exists 'qr_dine_in';

create table if not exists public.qr_scan_events (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null,
  location_id uuid not null,
  floor_plan_object_id uuid,
  table_qr_code_id uuid,
  online_order_session_id uuid,
  order_id uuid,
  stage text not null,
  user_agent text,
  ip_hash text,
  occurred_at timestamptz not null default now(),
  constraint qr_scan_events_stage_check
    check (stage in ('scanned', 'menu_viewed', 'cart_started', 'checkout', 'paid', 'abandoned'))
);

create index if not exists ix_qr_scan_events_loc_time
  on public.qr_scan_events(location_id, occurred_at);

create table if not exists public.qr_guest_alerts (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id),
  location_id uuid not null references public.locations(id),
  floor_plan_object_id uuid references public.floor_plan_objects(id),
  table_label text not null,
  online_order_session_id uuid,
  order_id uuid,
  alert_type text not null,
  message text,
  alert_key text not null,
  status text not null default 'open',
  acknowledged_at timestamptz,
  acknowledged_by text,
  resolved_at timestamptz,
  resolved_by text,
  created_at timestamptz not null default now(),
  constraint qr_guest_alerts_status_check
    check (status in ('open', 'resolved'))
);

create index if not exists ix_qr_guest_alerts_open
  on public.qr_guest_alerts(location_id, status)
  where status <> 'resolved';

create unique index if not exists uq_qr_guest_alert_active
  on public.qr_guest_alerts(alert_key)
  where status <> 'resolved';

comment on table public.table_qr_codes is
  'Opaque QR-code registry for QR dine-in table ordering. One active code per floor-plan table.';

comment on column public.table_qr_codes.table_label is
  'Snapshot of the resolved table label at QR generation time.';

comment on column public.table_qr_codes.created_by is
  'Clerk user id / JWT sub of the staff user who generated the QR code.';

comment on table public.qr_scan_events is
  'Analytics/event spine for QR dine-in scans and guest checkout progression.';

comment on table public.qr_guest_alerts is
  'Persistent guest alert inbox for QR dine-in. V1 lifecycle is open -> resolved.';

alter table public.table_qr_codes enable row level security;
alter table public.table_qr_codes force row level security;
alter table public.qr_scan_events enable row level security;
alter table public.qr_scan_events force row level security;
alter table public.qr_guest_alerts enable row level security;
alter table public.qr_guest_alerts force row level security;

drop policy if exists table_qr_codes_select_scope on public.table_qr_codes;
create policy table_qr_codes_select_scope
on public.table_qr_codes
for select
to authenticated
using (
  public.is_dexapos_admin()
  or (
    merchant_id = public.user_merchant_id()
    and location_id = any(public.user_location_ids())
  )
);

drop policy if exists table_qr_codes_manage_scope on public.table_qr_codes;
create policy table_qr_codes_manage_scope
on public.table_qr_codes
for insert
to authenticated
with check (
  public.is_dexapos_admin()
  or (
    merchant_id = public.user_merchant_id()
    and location_id = any(public.user_location_ids())
  )
);

drop policy if exists table_qr_codes_update_scope on public.table_qr_codes;
create policy table_qr_codes_update_scope
on public.table_qr_codes
for update
to authenticated
using (
  public.is_dexapos_admin()
  or (
    merchant_id = public.user_merchant_id()
    and location_id = any(public.user_location_ids())
  )
)
with check (
  public.is_dexapos_admin()
  or (
    merchant_id = public.user_merchant_id()
    and location_id = any(public.user_location_ids())
  )
);

drop policy if exists qr_scan_events_select_scope on public.qr_scan_events;
create policy qr_scan_events_select_scope
on public.qr_scan_events
for select
to authenticated
using (
  public.is_dexapos_admin()
  or (
    merchant_id = public.user_merchant_id()
    and location_id = any(public.user_location_ids())
  )
);

drop policy if exists qr_guest_alerts_select_scope on public.qr_guest_alerts;
create policy qr_guest_alerts_select_scope
on public.qr_guest_alerts
for select
to authenticated
using (
  public.is_dexapos_admin()
  or (
    merchant_id = public.user_merchant_id()
    and location_id = any(public.user_location_ids())
  )
);

drop policy if exists qr_guest_alerts_update_scope on public.qr_guest_alerts;
create policy qr_guest_alerts_update_scope
on public.qr_guest_alerts
for update
to authenticated
using (
  public.is_dexapos_admin()
  or (
    merchant_id = public.user_merchant_id()
    and location_id = any(public.user_location_ids())
  )
)
with check (
  public.is_dexapos_admin()
  or (
    merchant_id = public.user_merchant_id()
    and location_id = any(public.user_location_ids())
  )
);

revoke all on table public.table_qr_codes from public, anon, authenticated;
revoke all on table public.qr_scan_events from public, anon, authenticated;
revoke all on table public.qr_guest_alerts from public, anon, authenticated;

grant select, insert, update on public.table_qr_codes to authenticated;
grant select on public.qr_scan_events to authenticated;
grant select, update on public.qr_guest_alerts to authenticated;

grant all on public.table_qr_codes to service_role;
grant all on public.qr_scan_events to service_role;
grant all on public.qr_guest_alerts to service_role;
