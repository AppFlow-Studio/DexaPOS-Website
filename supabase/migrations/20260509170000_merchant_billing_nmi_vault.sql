-- Merchant billing profiles need explicit durable NMI vault references for
-- recurring billing. The old card_token field was too ambiguous because it
-- could be interpreted as a one-time checkout token.

alter table public.merchant_billing_profiles
  add column if not exists payment_device_id uuid references public.location_payment_devices(id) on delete set null,
  add column if not exists customer_vault_id text,
  add column if not exists vault_initial_transaction_id text;
create index if not exists idx_merchant_billing_profiles_payment_device
  on public.merchant_billing_profiles(payment_device_id);
create index if not exists idx_merchant_billing_profiles_customer_vault
  on public.merchant_billing_profiles(customer_vault_id)
  where customer_vault_id is not null;
comment on column public.merchant_billing_profiles.payment_device_id is
  'NMI device/account used to create the durable billing method in Customer Vault.';
comment on column public.merchant_billing_profiles.customer_vault_id is
  'Durable NMI Customer Vault identifier used for recurring merchant billing.';
comment on column public.merchant_billing_profiles.vault_initial_transaction_id is
  'Initial vaulting transaction identifier used for stored-credential follow-up charges.';
