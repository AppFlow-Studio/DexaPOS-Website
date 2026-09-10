begin;

alter table public.merchant_billing_profiles
  add column if not exists processor_account_id uuid,
  add column if not exists payment_profile_id text;

alter table public.merchant_billing_profiles
  drop constraint if exists merchant_billing_profiles_processor_account_id_fkey;

alter table public.merchant_billing_profiles
  add constraint merchant_billing_profiles_processor_account_id_fkey
  foreign key (processor_account_id)
  references public.merchant_processor_accounts(id)
  on delete set null;

alter table public.merchant_subscriptions
  add column if not exists processor text,
  add column if not exists processor_account_id uuid,
  add column if not exists processor_subscription_id text,
  add column if not exists processor_subscription_status text,
  add column if not exists processor_schedule_created_at timestamptz,
  add column if not exists processor_next_payment_at date;

alter table public.merchant_subscriptions
  drop constraint if exists merchant_subscriptions_processor_check,
  drop constraint if exists merchant_subscriptions_processor_account_id_fkey;

alter table public.merchant_subscriptions
  add constraint merchant_subscriptions_processor_check
  check (processor is null or processor = 'valor'),
  add constraint merchant_subscriptions_processor_account_id_fkey
  foreign key (processor_account_id)
  references public.merchant_processor_accounts(id)
  on delete set null;

alter table public.subscription_invoices
  add column if not exists processor text,
  add column if not exists processor_account_id uuid,
  add column if not exists processor_transaction_id text,
  add column if not exists processor_response jsonb;

alter table public.subscription_invoices
  drop constraint if exists subscription_invoices_processor_check,
  drop constraint if exists subscription_invoices_processor_account_id_fkey;

alter table public.subscription_invoices
  add constraint subscription_invoices_processor_check
  check (processor is null or processor = 'valor'),
  add constraint subscription_invoices_processor_account_id_fkey
  foreign key (processor_account_id)
  references public.merchant_processor_accounts(id)
  on delete set null;

create unique index if not exists uq_merchant_subscriptions_valor_subscription
  on public.merchant_subscriptions (processor_account_id, processor_subscription_id)
  where processor = 'valor' and processor_subscription_id is not null;

create unique index if not exists uq_subscription_invoices_processor_transaction
  on public.subscription_invoices (processor, processor_transaction_id)
  where processor is not null and processor_transaction_id is not null;

create table if not exists public.valor_recurring_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  event_name text not null,
  processor_subscription_id text,
  processor_transaction_id text,
  merchant_subscription_id uuid references public.merchant_subscriptions(id) on delete set null,
  subscription_invoice_id uuid references public.subscription_invoices(id) on delete set null,
  status text not null default 'processing'
    check (status in ('processing', 'processed', 'ignored', 'failed')),
  error_message text,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

alter table public.valor_recurring_webhook_events enable row level security;
alter table public.valor_recurring_webhook_events force row level security;

revoke all on table public.valor_recurring_webhook_events from public, anon, authenticated;
grant select, insert, update on table public.valor_recurring_webhook_events to service_role;

create index if not exists idx_valor_recurring_webhook_events_subscription
  on public.valor_recurring_webhook_events (processor_subscription_id, received_at desc);

comment on column public.merchant_billing_profiles.payment_profile_id is
  'Valor vault payment-profile identifier. Raw card data and Passage tokens are never persisted.';
comment on column public.merchant_subscriptions.processor_subscription_id is
  'Valor native recurring-subscription identifier. Valor owns recurring execution once populated.';
comment on table public.valor_recurring_webhook_events is
  'Idempotency and delivery ledger for signed Valor recurring billing webhook events.';

commit;
