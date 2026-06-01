-- QR-22: move new online store defaults from retired teal to brand blue.
-- Existing rows are intentionally untouched.

alter table public.online_store_config
  alter column primary_color set default '#0C4FD1';

comment on column public.online_store_config.primary_color is
  'Default storefront primary color. New rows default to Dexa brand blue (#0C4FD1). Existing rows are unchanged.';
