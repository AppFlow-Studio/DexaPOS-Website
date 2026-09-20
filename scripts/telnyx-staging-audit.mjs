// Read-only staging evidence. Never prints credentials, message bodies or phones.
import fs from 'node:fs';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const env = { ...dotenv.parse(fs.readFileSync('.env')), ...process.env };
const project = 'dfwqakoyittmrwbqvxgw';
const url = env.NEXT_PUBLIC_SUPABASE_URL;
if (new URL(url).hostname !== `${project}.supabase.co`) throw new Error('Staging project mismatch');
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), project,
  localConfig: Object.fromEntries(['SUPABASE_SERVICE_ROLE_KEY','SUPABASE_ACCESS_TOKEN','TELNYX_API_KEY','TELNYX_PUBLIC_KEY','TELNYX_FROM_NUMBER','TELNYX_MESSAGING_PROFILE_ID','TELNYX_WEBHOOK_URL','TELNYX_WEBHOOK_FAILOVER_URL'].map(k => [k, !!env[k]])) }));
const sb = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: rows, error } = await sb.from('message_log')
  .select('id,merchant_id,customer_id,telnyx_message_id,direction,status,created_at,raw,cost,from_number,messaging_profile_id')
  .eq('channel','sms').order('created_at',{ascending:false}).limit(1000);
if (error) throw new Error(`Ledger read failed: ${error.code}`);
console.log(JSON.stringify({ smsRowsInspected: rows.length, capped: rows.length === 1000,
  newest: rows[0] ? { id: rows[0].id, createdAt: rows[0].created_at, status: rows[0].status } : null,
  delivered: rows.filter(r=>r.status==='delivered').length, inbound:rows.filter(r=>r.direction==='inbound').length,
  webhookTouched:rows.filter(r=>r.raw!==null).length,
  completeMetadata:rows.filter(r=>r.raw!==null&&r.cost!==null&&r.from_number&&r.messaging_profile_id).length }));
const unattributed = await sb.from('message_log').select('id',{count:'exact',head:true}).eq('direction','outbound').is('merchant_id',null);
console.log(JSON.stringify({ unattributedOutbound: unattributed.count, error: unattributed.error?.code }));
const orders = await sb.from('order_notifications').select('provider_id').eq('channel','sms').eq('status','sent').limit(1000);
console.log(JSON.stringify({ sentOrderRowsInspected:orders.data?.length, orderIdsAbsentFromInspectedLedger:orders.data?.filter(o=>o.provider_id&&!rows.some(r=>r.telnyx_message_id===o.provider_id)).length, error:orders.error?.code }));
if (env.SUPABASE_ACCESS_TOKEN) {
  for (const endpoint of ['functions','secrets']) {
    const response=await fetch(`https://api.supabase.com/v1/projects/${project}/${endpoint}`,{headers:{Authorization:`Bearer ${env.SUPABASE_ACCESS_TOKEN}`}});
    const data=await response.json();
    console.log(JSON.stringify({ endpoint,status:response.status, data:Array.isArray(data)?data.filter(r=>endpoint==='secrets'?r.name?.startsWith('TELNYX'):['telnyx-webhook','telnyx-messaging','send-receipt','notify-waitlist-guest','notify-reservation-guest'].includes(r.slug)).map(r=>endpoint==='secrets'?{name:r.name}:{slug:r.slug,version:r.version,status:r.status,verify_jwt:r.verify_jwt,updated_at:r.updated_at}):'Unavailable' }));
  }
} else console.log('Deployment and deployed-secret inventory unavailable: no management access token.');
let profileId=env.TELNYX_MESSAGING_PROFILE_ID;
if (env.TELNYX_API_KEY && !profileId && env.TELNYX_FROM_NUMBER) {
  const query=new URLSearchParams({'filter[phone_number]':env.TELNYX_FROM_NUMBER});
  const response=await fetch(`https://api.telnyx.com/v2/phone_numbers?${query}`,{headers:{Authorization:`Bearer ${env.TELNYX_API_KEY}`}});
  const {data}=await response.json();
  const number=Array.isArray(data)?data.find(n=>n.phone_number===env.TELNYX_FROM_NUMBER):null;
  console.log(JSON.stringify({senderLookupStatus:response.status, senderFound:!!number}));
  if (number) {
    const settings=await fetch(`https://api.telnyx.com/v2/phone_numbers/${number.id}/messaging`,{headers:{Authorization:`Bearer ${env.TELNYX_API_KEY}`}});
    const result=await settings.json();profileId=result.data?.messaging_profile_id;
    console.log(JSON.stringify({senderSettingsStatus:settings.status,hasMessagingProfile:!!profileId}));
  }
}
if (env.TELNYX_API_KEY && profileId) {
  const response=await fetch(`https://api.telnyx.com/v2/messaging_profiles/${profileId}`,{headers:{Authorization:`Bearer ${env.TELNYX_API_KEY}`}});
  const {data}=await response.json();
  console.log(JSON.stringify({ profileLookupStatus:response.status, primaryPointsAtStaging:data?.webhook_url===`${url}/functions/v1/telnyx-webhook`,failoverConfigured:!!data?.webhook_failover_url }));
}

// Deliberately invalid signatures: never send a signed synthetic message or SMS.
if (process.argv.includes('--probe-rejections')) {
  const before=await sb.from('message_log').select('id',{head:true,count:'exact'});
  for (const mode of ['missing','forged','stale']) {
    const headers={'Content-Type':'application/json'};
    if (mode!=='missing') {
      headers['telnyx-signature-ed25519']=Buffer.alloc(64).toString('base64');
      headers['telnyx-timestamp']=String(Math.floor(Date.now()/1000)-(mode==='stale'?301:0));
    }
    const response=await fetch(`${url}/functions/v1/telnyx-webhook`,{method:'POST',headers,body:JSON.stringify({data:{id:'go-live-rejection-probe',event_type:'message.sent',payload:{id:'go-live-rejection-probe',direction:'outbound'}}})});
    console.log(JSON.stringify({probe:mode,status:response.status}));
  }
  const after=await sb.from('message_log').select('id',{head:true,count:'exact'});
  console.log(JSON.stringify({ledgerCountBefore:before.count,ledgerCountAfter:after.count,readErrors:!!before.error||!!after.error}));
}
