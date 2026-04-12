alter table public.online_store_config
add column if not exists ipospays_ftd_ecom_key text;

comment on column public.online_store_config.ipospays_ftd_ecom_key is
'Branch-specific Dejavoo FTD Ecom/TOP key used by online ordering checkout tokenization.';
