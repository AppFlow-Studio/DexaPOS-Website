-- Allow HQ to create duplicate test invoices for the same billing period.
-- Normal generation logic still blocks duplicates; the admin action clones
-- a new invoice row only when testing requires it.

drop index if exists public.uq_subscription_invoices_period;
create index if not exists idx_subscription_invoices_subscription_period
  on public.subscription_invoices(subscription_id, billing_period_start);
