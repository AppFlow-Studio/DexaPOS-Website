begin;

alter table public.merchant_subscriptions
  add column if not exists grace_period_ends_at timestamptz,
  add column if not exists grace_reason text,
  add column if not exists grace_extended_at timestamptz,
  add column if not exists grace_extended_by text;

alter table public.subscription_invoices
  add column if not exists next_retry_at timestamptz,
  add column if not exists retry_exhausted_at timestamptz;

create index if not exists idx_merchant_subscriptions_grace_period
  on public.merchant_subscriptions (grace_period_ends_at)
  where grace_period_ends_at is not null;

create index if not exists idx_subscription_invoices_retry_due
  on public.subscription_invoices (next_retry_at)
  where status = 'failed' and next_retry_at is not null;

comment on column public.merchant_subscriptions.grace_period_ends_at is
  'HQ-controlled deadline before an overdue subscription may be suspended.';
comment on column public.subscription_invoices.next_retry_at is
  'Earliest time an automatic subscription payment retry may run.';

commit;
