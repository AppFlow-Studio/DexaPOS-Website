alter table public.merchant_billing_profiles
  add column if not exists billing_email text;
comment on column public.merchant_billing_profiles.billing_email is
  'Billing contact email for this merchant/location billing profile. Used for subscription lifecycle and payment emails.';
create index if not exists idx_merchant_billing_profiles_billing_email
  on public.merchant_billing_profiles(billing_email)
  where billing_email is not null;
