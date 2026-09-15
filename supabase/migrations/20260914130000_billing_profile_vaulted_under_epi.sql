-- Track which Valor EPI each SaaS card was vaulted under.
--
-- Valor vault customer/payment profiles are EPI-scoped: a profile created under
-- EPI A cannot be charged by EPI B. When the SaaS rail moves to the central
-- DEXA POS AI EPI, cards vaulted under an old EPI must be re-collected. Recording
-- the vaulting EPI makes stale-card detection deterministic and idempotent (a card
-- re-added under the central EPI won't be flagged again).

begin;

alter table public.merchant_billing_profiles
  add column if not exists vaulted_under_epi text;

comment on column public.merchant_billing_profiles.vaulted_under_epi is
  'The Valor EPI the customer/payment vault profile was created under. Vault profiles are EPI-scoped, so a mismatch vs the charging EPI means the card must be re-vaulted.';

commit;
