// Isolated PostgreSQL/WASM regression test; never connects to Supabase or Valor.
// Point PGLITE_MODULE_PATH to a locally installed @electric-sql/pglite/dist/index.js.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE_PATH).href)
const db = new PGlite()
const read = (p) => readFileSync(p, 'utf8')
const foundation = read('supabase/migrations/20260507150000_subscription_billing_phase1.sql')
const services = read('supabase/migrations/20260508173000_subscription_billing_service_catalog.sql')
const access = read('supabase/migrations/20260713130000_hq_billing_device_bridge_and_access_gates.sql')
const migration = read('supabase/migrations/20260906120000_separate_subscription_billing_scopes.sql')
const completion = read('supabase/migrations/20260908120000_saas_admin_access_entitlements_and_authorizations.sql')
const table = (sql, name) => {
  const start = sql.indexOf(`create table if not exists public.${name} (`)
  assert(start >= 0)
  return sql.slice(start, sql.indexOf('\n);', start) + 3)
}
const fn = (sql, name) => {
  const start = sql.indexOf(`create or replace function public.${name}(`)
  assert(start >= 0)
  return sql.slice(start, sql.indexOf('$function$;', sql.indexOf('as $function$', start)) + 11)
}
const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0]
let checks = 0
const check = (condition) => { assert(condition); checks++ }
const rejects = async (sql, args, message) => {
  await assert.rejects(db.query(sql, args), message); checks++
}
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.jwt() returns jsonb language sql as $$select '{"role":"service_role"}'::jsonb$$;
    create function public.is_dexapos_admin() returns boolean language sql as $$select true$$;
    create table merchants(id uuid primary key);
    create table locations(id uuid primary key, merchant_id uuid references merchants, created_at timestamptz default now(), is_active boolean default true, name text default 'Test location');
    create function public.user_belongs_to_merchant(uuid) returns boolean language sql as $$select true$$;
    create table merchant_billing_profiles(id uuid primary key, merchant_id uuid, location_id uuid, is_active boolean default true,
      is_primary boolean default true, processor text default 'valor', billing_method text default 'card', created_at timestamptz default now());
    create table stations(id uuid primary key default gen_random_uuid(), location_id uuid, is_active boolean default true, deactivated_at timestamptz, updated_at timestamptz);
    create table payment_terminals(id uuid primary key default gen_random_uuid(), location_id uuid, is_active boolean default true, updated_at timestamptz);
    create function public.get_active_station_count(uuid) returns integer language sql as $$select 7$$;
    create function public.log_subscription_billing_event(text,uuid,uuid,text,text,uuid,jsonb,jsonb) returns void language sql as $$select$$;
    create function public.generate_subscription_invoice_number(date) returns text language sql as $$select gen_random_uuid()::text$$;
  `)
  await db.exec(table(foundation, 'subscription_plans'))
  await db.exec('alter table subscription_plans add column plan_scope text, add column monthly_price_cents integer default 0')
  await db.exec(table(foundation, 'merchant_subscriptions'))
  await db.exec(`alter table merchant_subscriptions
    add column processor_subscription_id text,
    add column processor_subscription_status text,
    add column processor_next_payment_at timestamptz,
    add column grace_period_ends_at timestamptz`)
  await db.exec(table(foundation, 'subscription_invoices'))
  await db.exec(table(services, 'billable_services'))
  await db.exec(table(services, 'merchant_subscription_services'))
  await db.exec(fn(services, 'calculate_billable_service_amounts'))
  await db.exec(fn(access, 'apply_subscription_access_state'))
  await db.exec(fn(access, 'apply_subscription_access_state_trigger'))
  await db.exec('create trigger trg_merchant_subscriptions_access_state after update of status on merchant_subscriptions for each row execute function apply_subscription_access_state_trigger()')
  const legacyMerchant = await scalar('insert into merchants values(gen_random_uuid()) returning id')
  const legacyAnchor = await scalar("insert into locations(id,merchant_id,created_at) values(gen_random_uuid(),$1,'2025-01-01') returning id",[legacyMerchant])
  const legacyLocation = await scalar('insert into locations(id,merchant_id) values(gen_random_uuid(),$1) returning id',[legacyMerchant])
  const legacyStation = await scalar('insert into stations(location_id) values($1) returning id',[legacyLocation])
  const legacyPlan = await scalar("insert into subscription_plans(plan_code,display_name,base_price_monthly,plan_scope) values('LEGACY','Legacy',50,'merchant_tier') returning id")
  const legacyService = await scalar("insert into billable_services(service_code,display_name,service_category,pricing_model,base_price_monthly) values('legacy','Legacy','hardware','flat',10) returning id")
  const legacyId = await scalar(`insert into merchant_subscriptions(merchant_id,location_id,plan_id,current_period_start,current_period_end,next_billing_date,monthly_amount)
    values($1,$2,$3,'2026-09-01','2026-09-30','2026-10-01',60) returning id`,[legacyMerchant,legacyLocation,legacyPlan])
  await db.query('insert into merchant_subscription_services(subscription_id,service_id,quantity) values($1,$2,2)',[legacyId,legacyService])
  const disabledService = await scalar("insert into billable_services(service_code,display_name,service_category,pricing_model,base_price_monthly) values('disabled','Disabled','hardware','flat',5) returning id")
  await db.query('insert into merchant_subscription_services(subscription_id,service_id,quantity,is_enabled) values($1,$2,0,false)',[legacyId,disabledService])
  const locationPlan = await scalar(`insert into subscription_plans(plan_code,display_name,base_price_monthly,plan_scope,per_extra_station_price,card_surcharge_pct)
    values('SERVICE_CATALOG','Services',0,'service_billing',0,0) returning id`)
  const legacyCard = await scalar('insert into merchant_billing_profiles(id,merchant_id,location_id) values(gen_random_uuid(),$1,$2) returning id',[legacyMerchant,legacyAnchor])
  await db.query("update merchant_subscriptions set billing_profile_id=$1, processor_subscription_id='existing-schedule' where id=$2",[legacyCard,legacyId])
  const historicalInvoice = await scalar(`insert into subscription_invoices(subscription_id,merchant_id,location_id,invoice_number,billing_period_start,billing_period_end,
    billing_method,subtotal,total_amount,status,due_date,billing_profile_id,line_items)
    values($1,$2,$3,'OLD-1','2026-09-01','2026-09-30','card',60,60,'paid','2026-09-01',$4,'[{"quantity":1,"amount":60}]') returning id`,
    [legacyId,legacyMerchant,legacyLocation,legacyCard])
  const beforeInvoice = await scalar('select to_jsonb(si) from subscription_invoices si where id=$1',[historicalInvoice])
  await assert.rejects(db.exec(migration), /Reconcile external recurring schedules/); checks++
  await db.exec('rollback')
  check(Number(await scalar("select count(*) from pg_constraint where conname='merchant_subscriptions_location_id_key'")) === 1)
  check(await scalar("select metadata->>'billing_scope' from merchant_subscriptions where id=$1",[legacyId]) === null)
  await db.query('update merchant_subscriptions set processor_subscription_id=null where id=$1',[legacyId])
  await db.query("update merchant_subscriptions set processor_subscription_status='active' where id=$1",[legacyId])
  await assert.rejects(db.exec(migration), /Reconcile external recurring schedules/); checks++
  await db.exec('rollback')
  await db.query('update merchant_subscriptions set processor_subscription_status=null where id=$1',[legacyId])
  // An existing service stream at the anchor must not collide with the new tier.
  const anchorServices = await scalar(`insert into merchant_subscriptions(merchant_id,location_id,plan_id,current_period_start,current_period_end,next_billing_date,monthly_amount,billing_profile_id)
    values($1,$2,$3,'2026-09-01','2026-09-30','2026-10-01',20,$4) returning id`,[legacyMerchant,legacyAnchor,locationPlan,legacyCard])
  const wrongLocation = await scalar('insert into locations(id,merchant_id) values(gen_random_uuid(),$1) returning id',[legacyMerchant])
  const wrongCardSubscription = await scalar(`insert into merchant_subscriptions(merchant_id,location_id,plan_id,current_period_start,current_period_end,next_billing_date,monthly_amount,billing_profile_id)
    values($1,$2,$3,'2026-09-01','2026-09-30','2026-10-01',20,$4) returning id`,[legacyMerchant,wrongLocation,locationPlan,legacyCard])
  const nmiMerchant = await scalar('insert into merchants values(gen_random_uuid()) returning id')
  const nmiLocation = await scalar('insert into locations(id,merchant_id) values(gen_random_uuid(),$1) returning id',[nmiMerchant])
  const nmiCard = await scalar("insert into merchant_billing_profiles(id,merchant_id,location_id,processor,is_active) values(gen_random_uuid(),$1,$2,'nmi',false) returning id",[nmiMerchant,nmiLocation])
  const nmiSubscription = await scalar(`insert into merchant_subscriptions(merchant_id,location_id,plan_id,current_period_start,current_period_end,next_billing_date,monthly_amount,billing_profile_id)
    values($1,$2,$3,'2026-06-01','2026-06-29','2026-06-29',357.75,$4) returning id`,[nmiMerchant,nmiLocation,legacyPlan,nmiCard])
  await db.query('insert into merchant_subscription_services(subscription_id,service_id,quantity) values($1,$2,2)',[nmiSubscription,legacyService])
  await db.exec(migration)
  checks++
  check(await scalar('select is_active from stations where id=$1',[legacyStation]) === true)
  assert.deepEqual(await scalar('select to_jsonb(si) from subscription_invoices si where id=$1',[historicalInvoice]),beforeInvoice); checks++
  check(await scalar("select metadata->>'billing_scope' from merchant_subscriptions where id=$1",[legacyId]) === 'legacy')
  check(await scalar('select status from merchant_subscriptions where id=$1',[legacyId]) === 'canceled')
  check(Number(await scalar('select monthly_amount from merchant_subscriptions where id=$1',[legacyId])) === 60)
  check(await scalar('select billing_profile_id from merchant_subscriptions where id=$1',[legacyId]) === legacyCard)
  const converted = (await db.query("select * from merchant_subscriptions where metadata->>'legacy_subscription_id'=$1",[legacyId])).rows
  check(converted.length === 2 && converted.every(s => s.status === 'canceled' && s.billing_profile_id === null && s.processor_subscription_id === null && s.metadata.billing_setup_required === true))
  const convertedTier = converted.find(s => s.metadata.billing_scope === 'merchant_tier')
  const convertedLocation = converted.find(s => s.metadata.billing_scope === 'location')
  check(convertedTier.location_id === legacyAnchor && convertedLocation.location_id === legacyLocation)
  check(Number(await scalar('select quantity from merchant_subscription_services where subscription_id=$1 and service_id=$2',[convertedLocation.id,legacyService])) === 2)
  const oldAssignments = (await db.query('select service_id,quantity,is_enabled,metadata from merchant_subscription_services where subscription_id=$1 order by service_id',[legacyId])).rows
  assert.deepEqual((await db.query('select service_id,quantity,is_enabled,metadata from merchant_subscription_services where subscription_id=$1 order by service_id',[convertedLocation.id])).rows,oldAssignments); checks++
  check(await scalar('select status from merchant_subscriptions where id=$1',[anchorServices]) === 'active')
  check(Number(await scalar('select count(*) from list_merchant_subscriptions($1)',[legacyMerchant])) === 4)
  check(await scalar("select metadata->>'billing_scope' from merchant_subscriptions where id=$1",[wrongCardSubscription]) === 'legacy')
  const wrongCardReplacement = await scalar("select id from merchant_subscriptions where metadata->>'legacy_subscription_id'=$1",[wrongCardSubscription])
  check(await scalar('select billing_profile_id from merchant_subscriptions where id=$1',[wrongCardReplacement]) === null)
  check(await scalar('select billing_profile_id from list_merchant_subscriptions($1) where id=$2',[legacyMerchant,wrongCardReplacement]) === null)
  check(await scalar('select billing_profile_id from merchant_subscriptions where id=$1',[nmiSubscription]) === nmiCard)
  check(Number(await scalar("select count(*) from merchant_subscriptions where metadata->>'legacy_subscription_id'=$1 and billing_profile_id is null and status='canceled'",[nmiSubscription])) === 2)
  await rejects("update merchant_subscriptions set status='active' where id=$1",[convertedTier.id],/cutover_nonbillable/)
  await rejects("update merchant_subscriptions set metadata=metadata || '{\"billing_setup_required\":false}' where id=$1",[convertedTier.id],/prepare_migrated_subscription/)
  await rejects('select generate_subscription_invoice($1)',[legacyId],/canceled/)
  await rejects('select generate_subscription_invoice($1)',[convertedTier.id],/canceled/)
  await rejects('select recalc_subscription($1)',[legacyId],/read-only/)
  await rejects('delete from merchant_subscription_services where subscription_id=$1',[legacyId],/read-only/)
  await rejects('delete from merchant_subscriptions where id=$1',[legacyId],/read-only/)
  check((await scalar('select apply_subscription_access_state($1)',[legacyId])).state === 'billing_cutover_held')
  const cutoverDate = await scalar("select (greatest(current_date, date '2026-10-01'))::text")
  await rejects('select prepare_migrated_subscription($1,$2,false)',[convertedTier.id,cutoverDate],/Confirm external/)
  await rejects("select prepare_migrated_subscription($1,current_date-1,true)",[convertedTier.id],/today or later/)
  await rejects('select prepare_migrated_subscription($1,$2,true)',[convertedLocation.id,cutoverDate],/No active primary/)
  // Use a future paid period so this check does not depend on today's date.
  await db.query('update subscription_invoices set billing_period_end=current_date+60 where id=$1',[historicalInvoice])
  await rejects('select prepare_migrated_subscription($1,current_date,true)',[convertedTier.id],/overlaps a paid/)
  await db.query('update subscription_invoices set billing_period_end=$1 where id=$2',[beforeInvoice.billing_period_end,historicalInvoice])
  await db.query('select prepare_migrated_subscription($1,$2,true)',[convertedTier.id,cutoverDate])
  check(await scalar('select billing_profile_id from merchant_subscriptions where id=$1',[convertedTier.id]) === legacyCard)
  check(await scalar('select status from merchant_subscriptions where id=$1',[convertedTier.id]) === 'canceled')
  check(Number(await scalar('select count(*) from subscription_invoices where subscription_id=$1',[convertedTier.id])) === 0)
  await rejects('select prepare_migrated_subscription($1,$2,true)',[convertedTier.id,cutoverDate],/not awaiting/)

  const merchant = await scalar('insert into merchants values(gen_random_uuid()) returning id')
  const a = await scalar("insert into locations(id,merchant_id,created_at,is_active) values(gen_random_uuid(), $1, '2026-01-01', true) returning id", [merchant])
  const b = await scalar("insert into locations(id,merchant_id,created_at,is_active) values(gen_random_uuid(), $1, '2026-02-01', true) returning id", [merchant])
  const other = await scalar('insert into merchants values(gen_random_uuid()) returning id')
  const card = (m, l) => scalar('insert into merchant_billing_profiles(id,merchant_id,location_id) values(gen_random_uuid(),$1,$2) returning id', [m,l])
  const aCard = await card(merchant,a)
  const bCard = await card(merchant,b)
  const globalCard = await card(merchant,null)
  const foreignCard = await card(other,null)
  const tierPlan = await scalar(`insert into subscription_plans(plan_code,display_name,base_price_monthly,plan_scope,monthly_price_cents,per_extra_station_price,card_surcharge_pct)
    values('TIER','Tier',99.99,'merchant_tier',9999,50,0) returning id`)
  const resolve = (scope, loc, profile = null) => scalar('select resolve_subscription_billing_profile($1,$2,$3,$4)', [merchant,loc,scope,profile])
  check(await resolve('merchant_tier',null) === globalCard)
  check(await resolve('location',a) === aCard)
  check(await resolve('location',b) === bCard)
  await rejects('select resolve_subscription_billing_profile($1,$2,$3,$4)', [merchant,a,'location',bCard], /No active primary/)
  await rejects('select resolve_subscription_billing_profile($1,$2,$3,$4)', [merchant,a,'location',globalCard], /No active primary/)
  await rejects('select resolve_subscription_billing_profile($1,$2,$3,$4)', [merchant,a,'merchant_tier',foreignCard], /No active primary/)
  await db.query('update merchant_billing_profiles set is_active=false where id=$1',[globalCard])
  check(await resolve('merchant_tier',null) === aCard)
  await db.query('update locations set is_active=false where id=$1',[a])
  check(await resolve('merchant_tier',null) === aCard)
  await db.query('update locations set is_active=true where id=$1',[a])
  await db.query('update merchant_billing_profiles set is_active=false where id=$1',[aCard])
  await rejects('select resolve_subscription_billing_profile($1,null,$2,null)', [merchant,'merchant_tier'], /No active primary/)
  await rejects('select resolve_subscription_billing_profile($1,$2,$3,null)', [merchant,a,'location'], /No active primary/)
  await db.query('update merchant_billing_profiles set is_active=true where id in ($1,$2)',[globalCard,aCard])

  const upsert = (scope, loc, plan, profile, id = null) => scalar(`select upsert_merchant_subscription(
    p_subscription_id=>$1, p_merchant_id=>$2,p_location_id=>$3,p_plan_id=>$4,
    p_current_period_start=>'2026-09-01',p_current_period_end=>'2026-09-30',p_next_billing_date=>'2026-10-01',
    p_billing_profile_id=>$5,p_metadata=>$6)`, [id,merchant,loc,plan,profile,JSON.stringify({billing_scope:scope})])
  const tierId = await upsert('merchant_tier',a,tierPlan,globalCard)
  const aId = await upsert('location',a,locationPlan,aCard)
  const bId = await upsert('location',b,locationPlan,bCard)
  check(new Set([tierId,aId,bId]).size === 3)
  check(await upsert('merchant_tier',a,tierPlan,globalCard) === tierId)
  check(await upsert('location',a,locationPlan,aCard) === aId)
  check(Number(await scalar('select monthly_amount from merchant_subscriptions where id=$1',[tierId])) === 99.99)
  check(Number(await scalar('select station_count from merchant_subscriptions where id=$1',[tierId])) === 0)
  await assert.rejects(upsert('location',a,locationPlan,aCard,tierId), /does not belong/); checks++
  await assert.rejects(upsert('location',a,tierPlan,aCard,aId), /Plan does not match/); checks++
  await rejects('update merchant_subscriptions set billing_profile_id=$1 where id=$2',[bCard,aId],/Billing card does not belong/)
  await rejects("update merchant_subscriptions set metadata=jsonb_build_object('billing_scope','location') where id=$1",[tierId],/scope is immutable/)

  const service = await scalar(`insert into billable_services(service_code,display_name,service_category,pricing_model,base_price_monthly,card_surcharge_pct)
    values('kds','KDS','hardware','per_unit',25,0) returning id`)
  await rejects('insert into merchant_subscription_services(subscription_id,service_id) values($1,$2)',[tierId,service],/Devices and add-ons/)
  await db.query('insert into merchant_subscription_services(subscription_id,service_id) values($1,$2)',[aId,service])
  const tierInvoice = await scalar('select generate_subscription_invoice($1)',[tierId])
  const locationInvoice = await scalar('select generate_subscription_invoice($1)',[aId])
  const t = (await db.query('select * from subscription_invoices where id=$1',[tierInvoice])).rows[0]
  const l = (await db.query('select * from subscription_invoices where id=$1',[locationInvoice])).rows[0]
  check(Number(t.total_amount) === 99.99 && t.billing_profile_id === globalCard)
  check(Number(l.total_amount) === 25 && l.billing_profile_id === aCard)
  check(t.subscription_id !== l.subscription_id && t.location_id === l.location_id)
  check(l.line_items.every(item => item.code !== 'merchant_tier_base'))
  const station = await scalar('insert into stations(location_id) values($1) returning id',[a])
  const otherStation = await scalar('insert into stations(location_id) values($1) returning id',[b])
  const status = async (id, state) => {
    await db.query('update merchant_subscriptions set status=$1 where id=$2',[state,id])
    return scalar('select apply_subscription_access_state($1)',[id])
  }
  await status(tierId,'suspended')
  await status(aId,'suspended')
  check(await scalar('select is_active from stations where id=$1',[station]) === false)
  check((await status(tierId,'active')).state === 'blocked_by_other_subscription')
  check(await scalar('select is_active from stations where id=$1',[station]) === false)
  await status(aId,'active')
  check(await scalar('select is_active from stations where id=$1',[station]) === true)
  check(await scalar('select is_active from stations where id=$1',[otherStation]) === true)
  check(await scalar("select metadata #>> '{billing_access_state,state}' from merchant_subscriptions where id=$1",[tierId]) === 'restored')
  await db.exec(`
    create or replace function public.is_dexapos_admin() returns boolean language sql as $$select false$$;
    create or replace function auth.jwt() returns jsonb language sql as $$select '{"role":"authenticated"}'::jsonb$$;
  `)
  await rejects('select prepare_migrated_subscription($1,current_date,true)',[convertedLocation.id],/Only HQ\/system/)
  await rejects('select * from list_merchant_subscriptions(null)',[],/Unauthorized/)
  await rejects('select resolve_subscription_billing_profile($1,$2,$3,null)',[merchant,a,'location'],/Only HQ\/system/)
  await assert.rejects(upsert('location',a,locationPlan,aCard),/Only HQ/); checks++

  await db.exec(`
    create or replace function public.is_dexapos_admin() returns boolean language sql as $$select true$$;
    create or replace function auth.jwt() returns jsonb language sql as $$select '{"role":"service_role"}'::jsonb$$;
    create function auth.role() returns text language sql as $$select 'service_role'::text$$;
    alter table merchants add column onboarding_status text default 'active';
    create function public.user_merchant_id() returns uuid language sql as $$select null::uuid$$;
    create function public.is_merchant_admin(uuid) returns boolean language sql as $$select false$$;
    create function public.hq_has_permission(text) returns boolean language sql as $$select true$$;
    create function public.update_updated_at_column() returns trigger language plpgsql as $$begin new.updated_at=now(); return new; end$$;
    create table public.app_notifications(id uuid primary key default gen_random_uuid());
    create table public.merchant_plan_subscriptions(
      id uuid primary key default gen_random_uuid(), merchant_id uuid not null references merchants,
      plan_id uuid not null references subscription_plans, status text not null default 'active',
      current_period_start date, current_period_end date, created_at timestamptz default now(), updated_at timestamptz default now()
    );
  `)
  await db.exec(completion)
  checks++

  const accessMerchant = await scalar('insert into merchants(id,onboarding_status) values(gen_random_uuid(),\'active\') returning id')
  const accessA = await scalar('insert into locations(id,merchant_id,created_at) values(gen_random_uuid(),$1,\'2026-01-01\') returning id',[accessMerchant])
  const accessB = await scalar('insert into locations(id,merchant_id,created_at) values(gen_random_uuid(),$1,\'2026-02-01\') returning id',[accessMerchant])
  const accessCard = await scalar('insert into merchant_billing_profiles(id,merchant_id,location_id) values(gen_random_uuid(),$1,$2) returning id',[accessMerchant,accessA])
  await db.query("insert into merchant_plan_subscriptions(merchant_id,plan_id,status) values($1,$2,'active')",[accessMerchant,tierPlan])
  const accessTier = await scalar(`insert into merchant_subscriptions(merchant_id,location_id,plan_id,current_period_start,current_period_end,next_billing_date,monthly_amount,billing_profile_id,metadata)
    values($1,$2,$3,'2026-09-01','2026-09-30','2026-10-01',99.99,$4,'{"billing_scope":"merchant_tier"}') returning id`,[accessMerchant,accessA,tierPlan,accessCard])
  const accessLocation = await scalar(`insert into merchant_subscriptions(merchant_id,location_id,plan_id,current_period_start,current_period_end,next_billing_date,monthly_amount,billing_profile_id,metadata)
    values($1,$2,$3,'2026-09-01','2026-09-30','2026-10-01',25,$4,'{"billing_scope":"location"}') returning id`,[accessMerchant,accessA,locationPlan,accessCard])
  const accessStationA = await scalar('insert into stations(location_id) values($1) returning id',[accessA])
  const accessStationB = await scalar('insert into stations(location_id) values($1) returning id',[accessB])
  check((await scalar('select get_subscription_access_state($1,$2)',[accessMerchant,accessA])).allowed === true)
  await db.query("update merchant_subscriptions set status='past_due' where id=$1",[accessTier])
  const graceAccess = await scalar('select get_subscription_access_state($1,$2)',[accessMerchant,accessA])
  check(graceAccess.allowed === true && graceAccess.status === 'past_due_grace')
  check(await scalar('select status from merchant_plan_subscriptions where merchant_id=$1',[accessMerchant]) === 'past_due')
  await db.query("update merchant_subscriptions set status='suspended' where id=$1",[accessTier])
  check(await scalar('select is_active from stations where id=$1',[accessStationA]) === false)
  check(await scalar('select is_active from stations where id=$1',[accessStationB]) === false)
  check((await scalar('select get_subscription_access_state($1,$2)',[accessMerchant,accessB])).allowed === false)
  await db.query("update merchant_subscriptions set status='active' where id=$1",[accessTier])
  check(await scalar('select is_active from stations where id=$1',[accessStationA]) === true)
  check(await scalar('select is_active from stations where id=$1',[accessStationB]) === true)
  await db.query("update merchant_subscriptions set status='suspended' where id=$1",[accessLocation])
  check(await scalar('select is_active from stations where id=$1',[accessStationA]) === false)
  check(await scalar('select is_active from stations where id=$1',[accessStationB]) === true)
  check((await scalar('select get_subscription_access_state($1,$2)',[accessMerchant,accessA])).allowed === false)
  check((await scalar('select get_subscription_access_state($1,$2)',[accessMerchant,accessB])).allowed === true)

  const authRequest = await scalar(`insert into subscription_service_requests(
    merchant_id,location_id,service_id,merchant_name_snapshot,location_name_snapshot,service_name_snapshot,
    requested_by,authorization_reference,authorization_accepted,
    authorization_accepted_at,authorization_terms_version,authorization_text,authorized_subtotal,
    authorized_card_surcharge,authorized_total,authorized_billing_cadence)
    values($1,$2,$3,'Merchant','Location A','Service','user','AUTH-TEST',true,now(),'v1','Accepted',10,0.4,10.4,'monthly_recurring') returning id`,
    [accessMerchant,accessA,service])
  await rejects('update subscription_service_requests set authorized_total=12 where id=$1',[authRequest],/immutable/)
  await rejects('delete from subscription_service_requests where id=$1',[authRequest],/cannot be deleted/)
  console.log(`PASS: ${checks} isolated PostgreSQL billing-scope checks`)
} finally { await db.close() }
