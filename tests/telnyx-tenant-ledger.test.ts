import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const db = new PGlite();
const merchantA = '11111111-1111-4111-8111-111111111111';
const merchantB = '22222222-2222-4222-8222-222222222222';
const customerA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const customerB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const sql = (file: string) => readFileSync(`supabase/migrations/${file}`, 'utf8');
const event = (id: string, text: string, time = '2026-09-20T12:00:00Z', profile = 'profile') => ({ data: {
  id: `event-${id}`, event_type: 'message.received', occurred_at: time,
  payload: { id, direction:'inbound', text, from:{phone_number:'+15555550100'}, to:[{phone_number:'+15555550200'}], messaging_profile_id:profile },
} });
const receive = (payload: unknown) => db.query('SELECT record_telnyx_message($1::jsonb) result',[JSON.stringify(payload)]);
async function send(merchant = merchantA, id = 'outbound-1') {
  return db.query(`SELECT log_outbound_message($1, '+15555550100', 'Hello', $2,
    p_from_number => '+15555550200', p_messaging_profile_id => 'profile')`,[merchant,id]);
}

beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE merchants(id uuid primary key);
    CREATE TABLE customers(id uuid primary key, merchant_id uuid references merchants, phone text, created_at timestamptz default now(), sms_opt_in boolean default true, marketing_unsubscribed_at timestamptz, sms_opt_in_at timestamptz);
    CREATE TABLE marketing_campaigns(id uuid primary key, merchant_id uuid references merchants, total_delivered int default 0, total_bounced int default 0);
    CREATE TABLE marketing_recipients(id uuid primary key, campaign_id uuid references marketing_campaigns, customer_id uuid references customers, status text default 'pending', sent_at timestamptz, delivered_at timestamptz, error_message text);
    CREATE TABLE order_notifications(merchant_id uuid, provider_id text, channel text);
    CREATE TABLE webhook_dead_letter_queue(id uuid primary key default gen_random_uuid(), source text, event_type text, raw_payload jsonb, error_message text, status text default 'pending', resolved_at timestamptz, updated_at timestamptz);
    CREATE FUNCTION update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at=now(); RETURN NEW; END $$;
    CREATE FUNCTION is_merchant_admin(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT $1::text = current_setting('test.merchant',true) $$;
    CREATE FUNCTION is_dexapos_admin() RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
  `);
  // Run the real table/RLS definition and both actual RPC migrations in isolated Postgres.
  const initial=sql('20260603000000_message_log_ledger_and_telnyx_rpcs.sql');
  await db.exec(initial.slice(0,initial.indexOf('CREATE OR REPLACE FUNCTION public.log_outbound_message')));
  await db.exec(sql('20260918120000_telnyx_message_ledger_go_live.sql'));
  await db.exec(sql('20260920130000_telnyx_tenant_consent_and_ledger_recovery.sql'));
}, 30000);
afterAll(()=>db.close());
beforeEach(async()=>{
  await db.exec(`TRUNCATE message_log, webhook_dead_letter_queue, marketing_recipients, marketing_campaigns, customers, merchants, order_notifications CASCADE;
    INSERT INTO merchants VALUES ('${merchantA}'),('${merchantB}');
    INSERT INTO customers(id,merchant_id,phone) VALUES ('${customerA}','${merchantA}','+15555550100'),('${customerB}','${merchantB}','+15555550100');`);
});

describe('tenant-safe Telnyx SQL behavior',()=>{
  it('resolves reply by conversation and applies STOP/START only to that merchant',async()=>{
    await send(); await receive(event('stop','STOP'));
    expect((await db.query('SELECT sms_opt_in FROM customers ORDER BY id')).rows).toEqual([{sms_opt_in:false},{sms_opt_in:true}]);
    expect((await db.query("SELECT merchant_id,customer_id FROM message_log WHERE direction='inbound'")).rows).toEqual([{merchant_id:merchantA,customer_id:customerA}]);
    await receive(event('start','START','2026-09-20T12:01:00Z'));
    expect((await db.query('SELECT sms_opt_in FROM customers ORDER BY id')).rows).toEqual([{sms_opt_in:true},{sms_opt_in:true}]);
  });
  it('rejects shared-number ambiguity without changing consent or creating a row',async()=>{
    await send(); await send(merchantB,'outbound-2');
    await expect(receive(event('ambiguous','STOP'))).rejects.toThrow('ambiguous');
    expect((await db.query("SELECT count(*)::int n FROM message_log WHERE direction='inbound'")).rows[0]).toEqual({n:0});
    expect((await db.query('SELECT bool_and(sms_opt_in) ok FROM customers')).rows[0]).toEqual({ok:true});
  });
  it('rejects unknown conversations and wrong profiles even with a matching customer',async()=>{
    await expect(receive(event('unknown','STOP'))).rejects.toThrow('unattributed');
    await send(); await expect(receive(event('profile','STOP',undefined,'other'))).rejects.toThrow('unattributed');
  });
  it('does not guess a customer among duplicates in the resolved merchant',async()=>{
    await send(); await db.exec(`INSERT INTO customers(id,merchant_id,phone) VALUES (gen_random_uuid(),'${merchantA}','+15555550100')`);
    await receive(event('reply','Hello'));
    expect((await db.query("SELECT customer_id FROM message_log WHERE direction='inbound'")).rows[0]).toEqual({customer_id:null});
  });
  it('does not conflate international numbers with identical last ten digits',async()=>{
    await send(); const payload=event('foreign','STOP');payload.data.payload.from.phone_number='+445555550100';
    await expect(receive(payload)).rejects.toThrow('unattributed');
  });
  it('does not replay an old STOP over a newer START and deduplicates events',async()=>{
    await send();const stop=event('stop','STOP');await receive(stop);
    await receive(event('start','START','2026-09-20T12:01:00Z'));await receive(stop);
    expect((await db.query('SELECT sms_opt_in FROM customers WHERE id=$1',[customerA])).rows[0]).toEqual({sms_opt_in:true});
    expect((await db.query("SELECT count(*)::int n FROM message_log WHERE telnyx_message_id='stop'")).rows[0]).toEqual({n:1});
  });
  it('preserves provider ID and repairs only the ledger, idempotently',async()=>{
    const args={p_merchant_id:merchantA,p_to_number:'+15555550100',p_body:'Safe body',p_telnyx_message_id:'accepted-id',p_from_number:'+15555550200',p_messaging_profile_id:'profile'};
    const inserted=await db.query<{id:string}>("INSERT INTO webhook_dead_letter_queue(source,event_type,raw_payload) VALUES ('telnyx_outbound','outbound.ledger_repair',$1) RETURNING id",[JSON.stringify({rpc_args:args})]);
    const id=inserted.rows[0].id;
    await db.query('SELECT repair_telnyx_outbound_ledger($1)',[id]);await db.query('SELECT repair_telnyx_outbound_ledger($1)',[id]);
    expect((await db.query('SELECT telnyx_message_id,status FROM message_log')).rows).toEqual([{telnyx_message_id:'accepted-id',status:'sent'}]);
    expect((await db.query('SELECT status FROM webhook_dead_letter_queue')).rows[0]).toEqual({status:'resolved'});
  });
  it('rejects tenant-mismatched customers and provider ID reassignment',async()=>{
    await expect(db.query("SELECT log_outbound_message($1,'+15555550100','Hello','bad',p_customer_id=>$2)",[merchantA,customerB])).rejects.toThrow('customer_tenant_mismatch');
    await send();await expect(send(merchantB)).rejects.toThrow('provider_message_tenant_mismatch');
  });
  it('reconciles order provider ID, final delivery metadata, duplicates and older callbacks',async()=>{
    await db.query("INSERT INTO order_notifications VALUES ($1,'order-provider','sms')",[merchantA]);
    const payload={data:{id:'delivery',event_type:'message.finalized',occurred_at:'2026-09-20T12:00:00Z',payload:{id:'order-provider',direction:'outbound',text:'Order ready',from:{phone_number:'+15555550200'},to:[{phone_number:'+15555550100',status:'delivered'}],messaging_profile_id:'profile',cost:{amount:'0.004'}}}};
    await receive(payload);await receive(payload);
    await receive({...payload,data:{...payload.data,event_type:'message.sent'}});
    await receive({...payload,data:{...payload.data,occurred_at:'2026-09-20T11:00:00Z',payload:{...payload.data.payload,to:[{phone_number:'+15555550100',status:'delivery_failed'}]}}});
    const rows=(await db.query('SELECT merchant_id,status,cost,raw IS NOT NULL touched FROM message_log')).rows;
    expect(rows).toEqual([{merchant_id:merchantA,status:'delivered',cost:'0.0040',touched:true}]);
  });
  it('updates an invalid-number failure on the same provider row',async()=>{
    await send();await receive({data:{event_type:'message.finalized',payload:{id:'outbound-1',direction:'outbound',to:[{status:'sending_failed'}],errors:[{code:'10002'}]}}});
    expect((await db.query('SELECT telnyx_message_id,status,error_code FROM message_log')).rows).toEqual([{telnyx_message_id:'outbound-1',status:'failed',error_code:'10002'}]);
  });
  it('rolls up a callback that arrives before the sender attaches a recipient',async()=>{
    await send();await receive({data:{event_type:'message.finalized',payload:{id:'outbound-1',direction:'outbound',to:[{status:'delivered'}]}}});
    await db.exec(`INSERT INTO marketing_campaigns(id,merchant_id) VALUES ('${merchantA}','${merchantA}');
      INSERT INTO marketing_recipients(id,campaign_id,customer_id) VALUES ('${customerA}','${merchantA}','${customerA}');`);
    await db.query("SELECT log_outbound_message($1,'+15555550100','Hello','outbound-1',p_customer_id=>$2,p_campaign_id=>$1,p_recipient_id=>$2)",[merchantA,customerA]);
    expect((await db.query('SELECT status FROM marketing_recipients')).rows[0]).toEqual({status:'delivered'});
  });
  it('keeps OTP values out of both body and callback raw',async()=>{
    await send();const payload={data:{event_type:'message.finalized',payload:{id:'outbound-1',direction:'outbound',text:'Your Shop verification code is 654321.',to:[{status:'delivered'}]}}};
    await receive(payload);expect(JSON.stringify((await db.query('SELECT body,raw FROM message_log')).rows)).not.toContain('654321');
  });
  it('blocks unattributed outbound writes and restricts merchant reads by RLS',async()=>{
    await expect(receive({data:{event_type:'message.finalized',payload:{id:'unknown',direction:'outbound'}}})).rejects.toThrow('unattributed_telnyx_outbound');
    await send();await send(merchantB,'other');
    await db.exec(`SET ROLE authenticated; SET test.merchant = '${merchantB}';`);
    try {
      expect((await db.query('SELECT merchant_id FROM message_log')).rows).toEqual([{merchant_id:merchantB}]);
      await expect(db.query("SELECT record_telnyx_message('{}')")).rejects.toThrow('permission denied');
      await expect(db.query('SELECT repair_telnyx_outbound_ledger(gen_random_uuid())')).rejects.toThrow('permission denied');
    } finally {await db.exec('RESET ROLE');}
  });
  it('does not regress delivered marketing history when acceptance is recorded late',async()=>{
    await db.exec(`INSERT INTO marketing_campaigns(id,merchant_id) VALUES ('${merchantA}','${merchantA}');
      INSERT INTO marketing_recipients(id,campaign_id,customer_id) VALUES ('${customerA}','${merchantA}','${customerA}');`);
    await db.query("SELECT record_marketing_result($1,'delivered','provider')",[customerA]);
    await db.query("SELECT record_marketing_result($1,'sent','provider')",[customerA]);
    expect((await db.query('SELECT status FROM marketing_recipients')).rows[0]).toEqual({status:'delivered'});
    expect((await db.query('SELECT total_delivered FROM marketing_campaigns')).rows[0]).toEqual({total_delivered:1});
  });
});
