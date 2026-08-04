-- Shared Supabase/Postgres performance audit - read-only collection
-- Date: 2026-07-31
-- Expanded: 2026-08-03
--
-- Safety:
--   * Every statement is SELECT-only.
--   * Run each numbered query separately in Supabase SQL Editor.
--   * Export each result as JSON and label it staging or production.
--   * Do not add EXPLAIN ANALYZE to mutation statements.
--   * Some Supabase roles cannot read all statistics views. Report permission
--     errors rather than changing grants during this audit.

-- 01. Server and extension capability
select
  current_database() as database_name,
  current_user as executed_as,
  version() as postgres_version,
  current_setting('TimeZone') as database_timezone,
  current_setting('track_io_timing', true) as track_io_timing,
  current_setting('shared_preload_libraries', true) as shared_preload_libraries;

select
  extname,
  extversion
from pg_extension
where extname in ('pg_stat_statements', 'pg_stat_monitor', 'hypopg', 'pg_cron')
order by extname;

-- 02. Database-level cache and transaction health
select
  datname,
  numbackends,
  xact_commit,
  xact_rollback,
  blks_read,
  blks_hit,
  round(100.0 * blks_hit / nullif(blks_hit + blks_read, 0), 2) as cache_hit_pct,
  temp_files,
  pg_size_pretty(temp_bytes) as temp_bytes,
  deadlocks,
  conflicts
from pg_stat_database
where datname = current_database();

-- 03. Top statements by total execution time
-- Requires pg_stat_statements.
select
  queryid,
  calls,
  round(total_exec_time::numeric, 2) as total_exec_ms,
  round(mean_exec_time::numeric, 2) as mean_exec_ms,
  round(max_exec_time::numeric, 2) as max_exec_ms,
  rows,
  round(rows::numeric / nullif(calls, 0), 2) as rows_per_call,
  shared_blks_hit,
  shared_blks_read,
  temp_blks_read,
  temp_blks_written,
  left(regexp_replace(query, '\s+', ' ', 'g'), 1500) as normalized_query
from extensions.pg_stat_statements
where dbid = (select oid from pg_database where datname = current_database())
order by total_exec_time desc
limit 100;

-- 04. Slowest frequently called statements
select
  queryid,
  calls,
  round(mean_exec_time::numeric, 2) as mean_exec_ms,
  round(total_exec_time::numeric, 2) as total_exec_ms,
  rows,
  round(rows::numeric / nullif(calls, 0), 2) as rows_per_call,
  left(regexp_replace(query, '\s+', ' ', 'g'), 1500) as normalized_query
from extensions.pg_stat_statements
where dbid = (select oid from pg_database where datname = current_database())
  and calls >= 20
order by mean_exec_time desc
limit 100;

-- 05. Highest-call statements, useful for polling/N+1 detection
select
  queryid,
  calls,
  round(total_exec_time::numeric, 2) as total_exec_ms,
  round(mean_exec_time::numeric, 2) as mean_exec_ms,
  rows,
  left(regexp_replace(query, '\s+', ' ', 'g'), 1500) as normalized_query
from extensions.pg_stat_statements
where dbid = (select oid from pg_database where datname = current_database())
order by calls desc
limit 100;

-- 06. Table scan, vacuum, and modification statistics
select
  schemaname,
  relname,
  n_live_tup,
  n_dead_tup,
  seq_scan,
  seq_tup_read,
  idx_scan,
  idx_tup_fetch,
  n_tup_ins,
  n_tup_upd,
  n_tup_del,
  last_analyze,
  last_autoanalyze,
  last_vacuum,
  last_autovacuum
from pg_stat_user_tables
order by seq_tup_read desc
limit 150;

-- 07. Largest tables and indexes
select
  n.nspname as schema_name,
  c.relname as table_name,
  pg_size_pretty(pg_relation_size(c.oid)) as table_size,
  pg_size_pretty(pg_indexes_size(c.oid)) as index_size,
  pg_size_pretty(pg_total_relation_size(c.oid)) as total_size,
  pg_total_relation_size(c.oid) as total_bytes
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('r', 'p')
  and n.nspname = 'public'
order by pg_total_relation_size(c.oid) desc
limit 100;

-- 08. Index definitions and usage for primary website fact tables
select
  s.schemaname,
  s.relname as table_name,
  s.indexrelname as index_name,
  s.idx_scan,
  s.idx_tup_read,
  s.idx_tup_fetch,
  pg_size_pretty(pg_relation_size(s.indexrelid)) as index_size,
  pg_get_indexdef(s.indexrelid) as index_definition
from pg_stat_user_indexes s
where s.schemaname = 'public'
  and s.relname in (
    'orders', 'order_items', 'order_item_modifiers', 'order_payments',
    'order_payment_items', 'order_refunds', 'order_refund_items',
    'audit_logs', 'staff_shifts', 'online_order_sessions',
    'abandoned_cart_notifications', 'merchant_subscriptions',
    'subscription_invoices', 'locations', 'members', 'location_members'
  )
order by s.relname, s.idx_scan desc, s.indexrelname;

-- 09. Potentially unused non-unique indexes
-- Treat zero scans as a review candidate only. Statistics may have reset, and
-- constraint/rare incident indexes can still be required.
select
  s.schemaname,
  s.relname as table_name,
  s.indexrelname as index_name,
  s.idx_scan,
  pg_size_pretty(pg_relation_size(s.indexrelid)) as index_size,
  pg_get_indexdef(s.indexrelid) as index_definition
from pg_stat_user_indexes s
join pg_index i on i.indexrelid = s.indexrelid
where s.schemaname = 'public'
  and s.idx_scan = 0
  and not i.indisunique
  and not i.indisprimary
order by pg_relation_size(s.indexrelid) desc
limit 150;

-- 10. Structurally duplicate indexes
select
  n.nspname as schema_name,
  t.relname as table_name,
  array_agg(i.relname order by i.relname) as duplicate_indexes,
  count(*) as duplicate_count,
  pg_get_expr(x.indpred, x.indrelid) as predicate,
  pg_get_expr(x.indexprs, x.indrelid) as expressions,
  x.indkey::text as key_columns
from pg_index x
join pg_class i on i.oid = x.indexrelid
join pg_class t on t.oid = x.indrelid
join pg_namespace n on n.oid = t.relnamespace
where n.nspname = 'public'
group by
  n.nspname,
  t.relname,
  x.indrelid,
  x.indkey,
  x.indclass,
  x.indcollation,
  x.indoption,
  x.indexprs,
  x.indpred
having count(*) > 1
order by duplicate_count desc, table_name;

-- 11. Foreign keys without a supporting leading-column index
select
  n.nspname as schema_name,
  c.relname as table_name,
  con.conname as constraint_name,
  pg_get_constraintdef(con.oid) as constraint_definition
from pg_constraint con
join pg_class c on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
where con.contype = 'f'
  and n.nspname = 'public'
  and not exists (
    select 1
    from pg_index i
    where i.indrelid = con.conrelid
      and i.indisvalid
      and i.indisready
      and i.indpred is null
      and array(
        select key_part.attnum
        from unnest(i.indkey::smallint[])
          with ordinality as key_part(attnum, position)
        where key_part.position <= cardinality(con.conkey)
        order by key_part.position
      ) = con.conkey
  )
order by table_name, constraint_name;

-- 12. Live SECURITY DEFINER functions without a pinned search_path
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  r.rolname as owner_name,
  p.proconfig,
  p.proacl as access_control_list
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join pg_roles r on r.oid = p.proowner
where n.nspname = 'public'
  and p.prosecdef
  and not exists (
    select 1
    from unnest(coalesce(p.proconfig, array[]::text[])) as cfg
    where cfg like 'search_path=%'
  )
order by p.proname, identity_arguments;

-- 13. All SECURITY DEFINER functions, settings, and grants
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  r.rolname as owner_name,
  p.proconfig,
  p.provolatile,
  p.proparallel,
  has_function_privilege('anon', p.oid, 'execute') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_execute,
  has_function_privilege('service_role', p.oid, 'execute') as service_role_execute,
  p.proacl as access_control_list
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join pg_roles r on r.oid = p.proowner
where n.nspname = 'public'
  and p.prosecdef
order by p.proname, identity_arguments;

-- 13b. Explicit routine grants, including the PUBLIC pseudo-role
select
  routine_schema,
  routine_name,
  grantee,
  privilege_type,
  is_grantable
from information_schema.routine_privileges
where routine_schema = 'public'
order by routine_name, grantee, privilege_type;

-- 13c. Compact SECURITY DEFINER privilege/pinning baseline
-- Use this aggregate for future snapshots; Query 13 remains authoritative for
-- signature-level review. The ACL-text counts intentionally distinguish
-- explicit entries from effective privileges inherited through PUBLIC.
select
  count(*) as total_security_definer_signatures,
  count(*) filter (
    where has_function_privilege('anon', p.oid, 'execute')
  ) as anon_can_execute,
  count(*) filter (
    where has_function_privilege('authenticated', p.oid, 'execute')
  ) as authenticated_can_execute,
  count(*) filter (
    where has_function_privilege('service_role', p.oid, 'execute')
  ) as service_role_can_execute,
  count(*) filter (
    where exists (
      select 1
      from aclexplode(coalesce(p.proacl, array[]::aclitem[])) as acl
      where acl.grantee = 0
        and acl.privilege_type = 'EXECUTE'
    )
  ) as explicit_public_execute_acl,
  count(*) filter (
    where exists (
      select 1
      from aclexplode(coalesce(p.proacl, array[]::aclitem[])) as acl
      where acl.grantee = (
        select oid from pg_roles where rolname = 'anon'
      )
        and acl.privilege_type = 'EXECUTE'
    )
  ) as explicit_anon_execute_acl,
  count(*) filter (
    where exists (
      select 1
      from unnest(coalesce(p.proconfig, array[]::text[])) as cfg
      where cfg like 'search_path=%'
    )
  ) as search_path_pinned,
  count(*) filter (
    where not exists (
      select 1
      from unnest(coalesce(p.proconfig, array[]::text[])) as cfg
      where cfg like 'search_path=%'
    )
  ) as search_path_unpinned,
  count(*) filter (where p.provolatile = 'v') as volatile_count,
  count(*) filter (where p.provolatile = 's') as stable_count,
  count(*) filter (where p.provolatile = 'i') as immutable_count
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef;

-- 14. RLS status for public tables
select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced,
  count(pol.polname) as policy_count
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy pol on pol.polrelid = c.oid
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
group by n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity
order by c.relrowsecurity, c.relname;

-- 15. RLS policy definitions for per-row subquery review
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check,
  case
    when coalesce(qual, '') ~* '(select|exists|members|location_members|role_permissions)'
      or coalesce(with_check, '') ~* '(select|exists|members|location_members|role_permissions)'
    then true else false
  end as review_for_per_row_lookup
from pg_policies
where schemaname = 'public'
order by review_for_per_row_lookup desc, tablename, policyname;

-- 16. JSON/JSONB columns on the largest application tables
select
  c.table_schema,
  c.table_name,
  c.column_name,
  c.data_type
from information_schema.columns c
where c.table_schema = 'public'
  and c.data_type in ('json', 'jsonb')
order by c.table_name, c.ordinal_position;

-- 17. Targeted row volume by month and order source
select
  date_trunc('month', created_at) as month,
  order_source,
  status,
  payment_status,
  count(*) as order_count,
  sum(total_amount) as gross_total
from public.orders
where created_at >= now() - interval '12 months'
group by 1, 2, 3, 4
order by 1 desc, 2, 3, 4;

-- 18. Merchant/location concentration for recent orders
select
  merchant_id,
  location_id,
  count(*) as order_count,
  min(created_at) as oldest_order,
  max(created_at) as newest_order
from public.orders
where created_at >= now() - interval '90 days'
group by merchant_id, location_id
order by order_count desc
limit 100;

-- 19. Payment volume and filter selectivity
select
  date_trunc('month', initiated_at) as month,
  status,
  payment_method,
  count(*) as payment_count,
  sum(total_amount) as payment_total
from public.order_payments
where initiated_at >= now() - interval '12 months'
group by 1, 2, 3
order by 1 desc, 2, 3;

-- 20. Audit-log growth
select
  date_trunc('month', created_at) as month,
  count(*) as row_count,
  count(distinct merchant_id) as merchant_count,
  count(distinct actor_user_id) as actor_count
from public.audit_logs
where created_at >= now() - interval '12 months'
group by 1
order by 1 desc;

-- 21. Open shift and billing-job queue sizes
select
  'open_staff_shifts' as workload,
  count(*) as row_count,
  min(clock_in_time) as oldest_at
from public.staff_shifts
where status <> 'completed'
union all
select
  'due_subscriptions',
  count(*),
  min(next_billing_date::timestamptz)
from public.merchant_subscriptions
where status in ('trial', 'active', 'past_due')
  and next_billing_date <= current_date
union all
select
  'overdue_invoices',
  count(*),
  min(due_date::timestamptz)
from public.subscription_invoices
where status in ('open', 'failed')
  and due_date <= current_date;

-- 22. Abandoned-cart workload size
select
  count(*) as eligible_sessions,
  min(updated_at) as oldest_updated_at,
  max(updated_at) as newest_updated_at
from public.online_order_sessions
where order_id is null
  and updated_at < now() - interval '30 minutes'
  and customer_email is not null
  and cart_data is not null
  and cart_data <> '[]'::jsonb
  and expires_at > now();

-- 23. Current long-running queries and wait state
select
  pid,
  usename,
  application_name,
  client_addr,
  state,
  wait_event_type,
  wait_event,
  now() - query_start as query_age,
  left(regexp_replace(query, '\s+', ' ', 'g'), 1200) as query
from pg_stat_activity
where datname = current_database()
  and pid <> pg_backend_pid()
  and state <> 'idle'
order by query_start;

-- 24. Column statistics for core filters
select
  schemaname,
  tablename,
  attname as column_name,
  null_frac,
  n_distinct,
  most_common_vals,
  most_common_freqs,
  histogram_bounds
from pg_stats
where schemaname = 'public'
  and (
    (tablename = 'orders' and attname in (
      'merchant_id', 'location_id', 'created_at', 'status',
      'payment_status', 'order_source', 'order_type'
    ))
    or (tablename = 'order_payments' and attname in (
      'merchant_id', 'location_id', 'initiated_at', 'status',
      'payment_method', 'card_type'
    ))
    or (tablename = 'staff_shifts' and attname in (
      'merchant_id', 'location_id', 'status', 'clock_in_time'
    ))
  )
order by tablename, attname;

-- 25. Reset timestamps for interpreting cumulative statistics
select
  now() as observed_at,
  pg_postmaster_start_time() as server_started_at,
  now() - pg_postmaster_start_time() as server_uptime,
  d.stats_reset as database_stats_reset,
  psi.stats_reset as statement_stats_reset,
  psi.dealloc as statement_deallocations
from pg_stat_database d
cross join extensions.pg_stat_statements_info psi
where d.datname = current_database();

-- 26. Connection, backend, and wait-state summary
select
  coalesce(usename, '<none>') as user_name,
  coalesce(nullif(application_name, ''), '<unset>') as application_name,
  backend_type,
  state,
  wait_event_type,
  wait_event,
  count(*) as connection_count,
  max(now() - backend_start) as oldest_backend_age,
  max(now() - xact_start) filter (where xact_start is not null) as oldest_transaction_age,
  max(now() - query_start) filter (where query_start is not null) as oldest_query_age
from pg_stat_activity
where datname = current_database()
group by usename, application_name, backend_type, state, wait_event_type, wait_event
order by connection_count desc, oldest_query_age desc nulls last;

-- 27. Current lock inventory
select
  l.locktype,
  l.mode,
  l.granted,
  coalesce(n.nspname || '.' || c.relname, '<non-relation>') as relation_name,
  count(*) as lock_count
from pg_locks l
left join pg_class c on c.oid = l.relation
left join pg_namespace n on n.oid = c.relnamespace
group by l.locktype, l.mode, l.granted, n.nspname, c.relname
order by l.granted, lock_count desc, relation_name;

-- 28. User-function execution statistics
-- Empty output can mean track_functions is disabled or the functions have not
-- executed since statistics were reset.
select
  schemaname,
  funcname,
  calls,
  round(total_time::numeric, 2) as total_time_ms,
  round(self_time::numeric, 2) as self_time_ms,
  round((total_time / nullif(calls, 0))::numeric, 2) as mean_time_ms
from pg_stat_user_functions
order by total_time desc
limit 200;

-- 29. Realtime/logical publication inventory
select
  p.pubname,
  p.puballtables,
  p.pubinsert,
  p.pubupdate,
  p.pubdelete,
  p.pubtruncate
from pg_publication p
order by p.pubname;

select
  pubname,
  schemaname,
  tablename
from pg_publication_tables
order by pubname, schemaname, tablename;

-- 30. Non-internal triggers on public application tables
select
  n.nspname as schema_name,
  c.relname as table_name,
  t.tgname as trigger_name,
  t.tgenabled as enabled_mode,
  pg_get_triggerdef(t.oid, true) as trigger_definition
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and not t.tgisinternal
order by c.relname, t.tgname;

-- 31. Materialized-view inventory and size
select
  m.schemaname,
  m.matviewname,
  m.ispopulated,
  pg_size_pretty(pg_total_relation_size(
    format('%I.%I', m.schemaname, m.matviewname)::regclass
  )) as total_size,
  m.definition
from pg_matviews m
order by pg_total_relation_size(
  format('%I.%I', m.schemaname, m.matviewname)::regclass
) desc;

-- 32. Server settings relevant to query, connection, WAL, and maintenance cost
select
  name,
  setting,
  unit,
  context,
  source,
  pending_restart
from pg_settings
where name in (
  'max_connections', 'shared_buffers', 'effective_cache_size',
  'work_mem', 'maintenance_work_mem', 'track_io_timing',
  'track_functions', 'random_page_cost', 'effective_io_concurrency',
  'max_parallel_workers', 'max_parallel_workers_per_gather',
  'autovacuum', 'autovacuum_max_workers', 'autovacuum_naptime',
  'wal_level', 'max_wal_size', 'min_wal_size',
  'max_replication_slots', 'max_wal_senders',
  'statement_timeout', 'idle_in_transaction_session_timeout'
)
order by name;

-- 33. Applied Supabase migration history
-- to_jsonb avoids assuming that every project has the optional name column.
select
  sm.version,
  coalesce(to_jsonb(sm) ->> 'name', '') as migration_name,
  coalesce(jsonb_array_length(coalesce(to_jsonb(sm) -> 'statements', '[]'::jsonb)), 0)
    as statement_count
from supabase_migrations.schema_migrations sm
order by sm.version desc
limit 1000;

-- 34. Logical replication slots and retained WAL
select
  slot_name,
  plugin,
  slot_type,
  database,
  active,
  active_pid,
  restart_lsn,
  confirmed_flush_lsn,
  case
    when restart_lsn is null then null
    else pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn))
  end as retained_wal
from pg_replication_slots
order by active desc, slot_name;

-- 35. Extended churn and maintenance indicators
select
  schemaname,
  relname,
  n_live_tup,
  n_dead_tup,
  n_mod_since_analyze,
  n_ins_since_vacuum,
  n_tup_ins,
  n_tup_upd,
  n_tup_hot_upd,
  n_tup_del,
  vacuum_count,
  autovacuum_count,
  analyze_count,
  autoanalyze_count,
  last_autovacuum,
  last_autoanalyze
from pg_stat_user_tables
order by n_dead_tup desc, n_mod_since_analyze desc
limit 200;

-- 36. pg_cron schedule inventory
-- Run only when query 01 reports that pg_cron is installed. The command body
-- is intentionally excluded because it can contain operational secrets.
select
  jobid,
  jobname,
  schedule,
  database,
  username,
  active
from cron.job
order by active desc, jobname, jobid;

-- 37. Partitioned-table inventory
select
  n.nspname as schema_name,
  c.relname as partitioned_table,
  pg_get_partkeydef(c.oid) as partition_key,
  count(child.oid) as partition_count
from pg_partitioned_table pt
join pg_class c on c.oid = pt.partrelid
join pg_namespace n on n.oid = c.relnamespace
left join pg_inherits i on i.inhparent = c.oid
left join pg_class child on child.oid = i.inhrelid
where n.nspname = 'public'
group by n.nspname, c.relname, c.oid
order by c.relname;

-- 38. Duplicate-index ownership, uniqueness, size, and usage
-- Run after query 10. A structural duplicate is not removable until this
-- proves whether a constraint owns it and whether each copy is used.
with duplicate_shapes as (
  select
    x.indrelid,
    x.indkey,
    x.indclass,
    x.indcollation,
    x.indoption,
    x.indexprs,
    x.indpred
  from pg_index x
  join pg_class t on t.oid = x.indrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
  group by
    x.indrelid, x.indkey, x.indclass, x.indcollation, x.indoption,
    x.indexprs, x.indpred
  having count(*) > 1
)
select
  tn.nspname as schema_name,
  t.relname as table_name,
  i.relname as index_name,
  x.indisprimary,
  x.indisunique,
  x.indisvalid,
  con.conname as owning_constraint,
  coalesce(s.idx_scan, 0) as idx_scan,
  pg_size_pretty(pg_relation_size(i.oid)) as index_size,
  pg_get_indexdef(i.oid) as index_definition
from duplicate_shapes d
join pg_index x
  on x.indrelid = d.indrelid
 and x.indkey = d.indkey
 and x.indclass = d.indclass
 and x.indcollation = d.indcollation
 and x.indoption = d.indoption
 and x.indexprs is not distinct from d.indexprs
 and x.indpred is not distinct from d.indpred
join pg_class i on i.oid = x.indexrelid
join pg_class t on t.oid = x.indrelid
join pg_namespace tn on tn.oid = t.relnamespace
left join pg_constraint con on con.conindid = i.oid
left join pg_stat_user_indexes s on s.indexrelid = i.oid
order by table_name, index_name;

-- 39. Definitions for unpinned SECURITY DEFINER functions from query 12
-- Review only; do not execute the returned definitions.
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  p.proacl as access_control_list,
  pg_get_functiondef(p.oid) as function_definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
  and not exists (
    select 1
    from unnest(coalesce(p.proconfig, array[]::text[])) as cfg
    where cfg like 'search_path=%'
  )
order by p.proname, pg_get_function_identity_arguments(p.oid);

-- 40. Grants for RLS-disabled public tables
select
  c.table_schema,
  c.table_name,
  c.grantee,
  array_agg(distinct c.privilege_type order by c.privilege_type) as privileges
from information_schema.role_table_grants c
where c.table_schema = 'public'
  and c.table_name in ('kiosk_pickup_sequences', 'luqra_sync_runs')
group by c.table_schema, c.table_name, c.grantee
order by c.table_name, c.grantee;

-- 41. Effective schema privileges relevant to unpinned SECURITY DEFINER paths
-- This does not invoke any application function. CREATE on a schema reachable
-- through a definer function's search_path increases object-shadowing risk.
select
  n.nspname as schema_name,
  coalesce(bool_or(a.grantee = 0 and a.privilege_type = 'USAGE'), false)
    as public_acl_usage,
  coalesce(bool_or(a.grantee = 0 and a.privilege_type = 'CREATE'), false)
    as public_acl_create,
  has_schema_privilege('anon', n.oid, 'USAGE') as anon_usage,
  has_schema_privilege('anon', n.oid, 'CREATE') as anon_create,
  has_schema_privilege('authenticated', n.oid, 'USAGE') as authenticated_usage,
  has_schema_privilege('authenticated', n.oid, 'CREATE') as authenticated_create,
  has_schema_privilege('service_role', n.oid, 'USAGE') as service_role_usage,
  has_schema_privilege('service_role', n.oid, 'CREATE') as service_role_create
from pg_namespace n
left join lateral aclexplode(
  coalesce(n.nspacl, acldefault('n', n.nspowner))
) a on true
where n.nspname in ('public', 'extensions')
group by n.nspname, n.oid
order by n.nspname;

-- 42. Live functions that reference the two exposed RLS-disabled tables
-- Metadata only. This identifies contracts that a grant/RLS containment
-- migration must preserve; it does not execute any returned function.
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  p.prosecdef as security_definer,
  p.proacl as access_control_list,
  p.proconfig
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.prokind in ('f', 'p')
  and (
    pg_get_functiondef(p.oid) ilike '%kiosk_pickup_sequences%'
    or pg_get_functiondef(p.oid) ilike '%luqra_sync_runs%'
  )
order by n.nspname, p.proname,
  pg_get_function_identity_arguments(p.oid);
