alter table public.online_store_config
  add column if not exists setup_request_status text,
  add column if not exists setup_requested_at timestamptz,
  add column if not exists setup_requested_by text,
  add column if not exists setup_reviewed_at timestamptz,
  add column if not exists setup_reviewed_by text,
  add column if not exists setup_rejection_reason text,
  add column if not exists setup_approved_at timestamptz,
  add column if not exists setup_completed_at timestamptz;

update public.online_store_config
set
  setup_request_status = coalesce(setup_request_status, 'setup_completed'),
  setup_completed_at = coalesce(setup_completed_at, published_at, created_at, now())
where setup_request_status is null;

alter table public.online_store_config
  alter column setup_request_status set default 'setup_completed',
  alter column setup_request_status set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'online_store_config_setup_request_status_check'
  ) then
    alter table public.online_store_config
      add constraint online_store_config_setup_request_status_check
      check (
        setup_request_status = any (
          array[
            'pending_review'::text,
            'approved'::text,
            'rejected'::text,
            'setup_completed'::text
          ]
        )
      );
  end if;
end $$;

create index if not exists idx_online_store_config_setup_request_status
  on public.online_store_config (setup_request_status);
