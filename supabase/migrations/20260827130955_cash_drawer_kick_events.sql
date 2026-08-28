-- =====================================================================
-- cash_drawer_kick_events — durable, append-only cash-drawer kick log
-- =====================================================================
-- P0 cash-drawer observability (companion to 20260826120000_cash_drawers_host_printer_id).
--
-- WHY
--   The POS tablet records every cash-drawer "kick" attempt into a CAPPED ring
--   buffer at printers.metadata->'recentKicks' (last N entries only) plus kick
--   counters. When a merchant complains days later that "the drawer won't open",
--   that history has usually already rolled off. This table is the durable
--   forensic record: one row per kick attempt, retained indefinitely, so the web
--   dashboard can show what happened, on which printer, and whether the drawer
--   physically opened.
--
-- HOW (no POS-app change)
--   The tablet already UPDATEs printers.metadata directly. An AFTER UPDATE OF
--   metadata trigger flattens the ring buffer into durable rows. It is idempotent
--   (the buffer is re-sent on every update) via UNIQUE(printer_id, kicked_at) +
--   ON CONFLICT DO NOTHING, and best-effort so it can never block the tablet's
--   metadata write. Scoping columns (merchant/location/station) are copied from
--   the printer row, never trusted from the tablet-authored JSON.
--
-- JSON-SHAPE NOTE
--   The exact key names inside each recentKicks entry live only in the POS repo
--   (types/printer.ts -> CashDrawerKickResult). The trigger therefore COALESCEs
--   across likely aliases AND stores the whole original entry in `raw`, so a
--   wrong mapping degrades to "column is NULL but data is recoverable", never
--   data loss. Confirm the aliases against the POS types before relying on the
--   flattened columns.
--
-- SAFETY
--   Additive, reversible, idempotent. Adds one table, one function, one trigger,
--   indexes and RLS policies; alters no existing object. The only behavioural
--   change to printers is the new best-effort AFTER trigger.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------
create table if not exists public.cash_drawer_kick_events (
  id                uuid primary key default gen_random_uuid(),

  -- Tenancy / scoping — copied from the printers NEW row (never from JSON).
  merchant_id       uuid not null references public.merchants(id) on delete cascade,
  location_id       uuid not null references public.locations(id) on delete cascade,
  printer_id        uuid not null references public.printers(id)  on delete cascade,
  cash_drawer_id    uuid          references public.cash_drawers(id) on delete set null,
  station_id        uuid          references public.stations(id)     on delete set null,

  -- Flattened kick payload (one recentKicks[] entry).
  kicked_at         timestamptz not null,
  outcome           text not null check (outcome in ('ok', 'unconfirmed', 'failed')),
  command_acked     boolean,          -- ok / ACK flag; NULL if absent in JSON
  drawer_confirmed  boolean,          -- TRI-STATE: true / false / NULL (unknown)
  error_message     text,
  source            text,             -- no_sale | pay_in | pay_out | cash_sale | ...

  -- Forensics: the exact original JSON entry, so nothing is lost on a mismap.
  raw               jsonb not null,

  created_at        timestamptz not null default now(),

  -- One printer fires one kick at one instant → natural idempotency key for the
  -- re-sent ring buffer. If POS timestamps prove second-resolution, widen this.
  constraint uq_cash_drawer_kick_events_printer_kicked_at
    unique (printer_id, kicked_at)
);

comment on table public.cash_drawer_kick_events is
  'Durable append-only log of cash-drawer kick attempts, flattened by trigger '
  'from printers.metadata->''recentKicks''. Read-only for clients (merchant/'
  'location RLS); the SECURITY DEFINER trigger is the sole writer.';
comment on column public.cash_drawer_kick_events.drawer_confirmed is
  'Tri-state: TRUE = drawer sense confirmed physical open, FALSE = confirmed did '
  'NOT open, NULL = no sense line / unknown. Do not collapse NULL into FALSE.';
comment on column public.cash_drawer_kick_events.raw is
  'Original recentKicks[] entry verbatim — forensic escape hatch if a flattened '
  'column mapping is wrong. Never dropped.';

-- ---------------------------------------------------------------------
-- Indexes (reporting query shapes)
-- ---------------------------------------------------------------------
-- Primary support scan: a merchant/location report, newest first.
create index if not exists idx_cdke_merchant_location_kicked_at
  on public.cash_drawer_kick_events (merchant_id, location_id, kicked_at desc);

-- Per-drawer history ("show me this drawer's kicks").
create index if not exists idx_cdke_cash_drawer_id
  on public.cash_drawer_kick_events (cash_drawer_id, kicked_at desc)
  where cash_drawer_id is not null;

-- Failure triage within a location window.
create index if not exists idx_cdke_location_outcome
  on public.cash_drawer_kick_events (location_id, outcome, kicked_at desc);

-- (printer_id, kicked_at) lookups are already served by the UNIQUE constraint.

-- ---------------------------------------------------------------------
-- Trigger function — flatten recentKicks into durable rows
-- ---------------------------------------------------------------------
create or replace function public._log_cash_drawer_kicks()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_kicks          jsonb;
  v_cash_drawer_id uuid;
  v_entry          jsonb;
  v_kicked_at      timestamptz;
  v_outcome        text;
  v_command_acked  boolean;
  v_drawer_conf    boolean;
begin
  -- Nothing to do if metadata is absent or unchanged.
  if NEW.metadata is null then
    return NEW;
  end if;
  if TG_OP = 'UPDATE' and OLD.metadata is not distinct from NEW.metadata then
    return NEW;
  end if;

  -- Locate the ring buffer, tolerant of the exact key name.
  v_kicks := coalesce(
    NEW.metadata -> 'recentKicks',
    NEW.metadata -> 'recent_kicks',
    NEW.metadata #> '{cashDrawer,recentKicks}'
  );
  if v_kicks is null or jsonb_typeof(v_kicks) <> 'array' then
    return NEW;
  end if;

  -- Resolve the bound drawer once (host_printer_id binding, 20260826120000).
  select cd.id
    into v_cash_drawer_id
    from public.cash_drawers cd
   where cd.host_printer_id = NEW.id
   order by cd.updated_at desc nulls last
   limit 1;

  for v_entry in select * from jsonb_array_elements(v_kicks)
  loop
    if jsonb_typeof(v_entry) <> 'object' then
      continue;
    end if;

    -- Timestamp: accept several key names; ISO text first, epoch-ms fallback.
    begin
      v_kicked_at := coalesce(
        v_entry ->> 'kickedAt',
        v_entry ->> 'timestamp',
        v_entry ->> 'ts',
        v_entry ->> 'at'
      )::timestamptz;
    exception when others then
      begin
        v_kicked_at := to_timestamp(
          (coalesce(v_entry ->> 'ts', v_entry ->> 'timestamp'))::double precision / 1000.0
        );
      exception when others then
        v_kicked_at := null;
      end;
    end;

    -- No usable timestamp → can't form the dedupe key; skip just this entry.
    if v_kicked_at is null then
      continue;
    end if;

    -- Command ACK (ok) and physical-open confirmation (tri-state), tolerant of
    -- aliases. jsonb -> ... ::boolean yields SQL NULL for absent keys and for a
    -- JSON `null`, preserving the tri-state.
    begin
      v_command_acked := (coalesce(
        v_entry -> 'commandAcked', v_entry -> 'acked', v_entry -> 'ok'
      ))::boolean;
    exception when others then
      v_command_acked := null;
    end;
    begin
      v_drawer_conf := (coalesce(
        v_entry -> 'drawerConfirmed', v_entry -> 'confirmed'
      ))::boolean;
    exception when others then
      v_drawer_conf := null;
    end;

    -- Outcome: prefer an explicit classified value; otherwise derive it from the
    -- signals, mirroring the POS classifyKickOutcome (keyed on drawerConfirmed).
    v_outcome := lower(coalesce(
      v_entry ->> 'outcome',
      v_entry ->> 'result',
      v_entry ->> 'status'
    ));
    if v_outcome is null or v_outcome not in ('ok', 'unconfirmed', 'failed') then
      v_outcome := case
        when v_drawer_conf is true then 'ok'
        when v_command_acked is false then 'failed'
        else 'unconfirmed'
      end;
    end if;

    insert into public.cash_drawer_kick_events (
      merchant_id, location_id, printer_id, cash_drawer_id, station_id,
      kicked_at, outcome, command_acked, drawer_confirmed, error_message, source, raw
    )
    values (
      NEW.merchant_id,
      NEW.location_id,
      NEW.id,
      v_cash_drawer_id,
      NEW.station_id,
      v_kicked_at,
      v_outcome,
      v_command_acked,
      v_drawer_conf,
      coalesce(v_entry ->> 'errorMessage', v_entry ->> 'error', v_entry ->> 'message'),
      coalesce(v_entry ->> 'source', v_entry ->> 'context', v_entry ->> 'reason'),
      v_entry
    )
    on conflict (printer_id, kicked_at) do nothing;
  end loop;

  return NEW;
exception when others then
  -- Telemetry logging must never block the POS metadata write.
  return NEW;
end;
$function$;

comment on function public._log_cash_drawer_kicks() is
  'AFTER UPDATE OF metadata on printers: flattens NEW.metadata->''recentKicks'' '
  'into durable cash_drawer_kick_events rows. Idempotent via '
  'UNIQUE(printer_id, kicked_at) + ON CONFLICT DO NOTHING (the capped ring buffer '
  'is re-sent each update). SECURITY DEFINER so the insert bypasses RLS for any '
  'POS client role. Best-effort; never blocks the write. JSON keys are defensive '
  'COALESCE aliases — confirm against POS types/printer.ts; raw preserves the '
  'original entry regardless.';

drop trigger if exists trg_log_cash_drawer_kicks on public.printers;
create trigger trg_log_cash_drawer_kicks
  after update of metadata on public.printers
  for each row
  execute function public._log_cash_drawer_kicks();

-- ---------------------------------------------------------------------
-- RLS — read-only for clients; trigger is the sole writer
-- ---------------------------------------------------------------------
alter table public.cash_drawer_kick_events enable row level security;
alter table public.cash_drawer_kick_events force row level security;

-- Merchant owners/admins/managers and Dexa HQ: read all events for the merchant.
drop policy if exists cash_drawer_kick_events_merchant_read on public.cash_drawer_kick_events;
create policy cash_drawer_kick_events_merchant_read
  on public.cash_drawer_kick_events
  for select
  to authenticated
  using (public.is_merchant_admin(merchant_id));

-- Location staff (POS tablet / KDS) scoped to the event's location.
drop policy if exists cash_drawer_kick_events_location_read on public.cash_drawer_kick_events;
create policy cash_drawer_kick_events_location_read
  on public.cash_drawer_kick_events
  for select
  to authenticated
  using (public.is_location_member(location_id));

-- No client INSERT/UPDATE/DELETE policy: writes flow solely through the
-- SECURITY DEFINER trigger. Remove default write grants for good measure.
revoke all on table public.cash_drawer_kick_events from public, anon, authenticated;
grant select on table public.cash_drawer_kick_events to authenticated;
grant all on table public.cash_drawer_kick_events to service_role;

commit;
