-- Shared Supabase/Postgres performance audit - read-only collection
-- Date: 2026-07-31
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
