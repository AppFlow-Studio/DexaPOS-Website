import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { generateKeyPairSync, sign, webcrypto } from 'node:crypto';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

// Execute the actual Deno entrypoint with only its SDK/env/network boundary mocked.
const source=readFileSync('supabase/functions/telnyx-webhook/index.ts','utf8').replace(/import \{ createClient \} from 'npm:@supabase\/supabase-js'/,'');
const script=ts.transpile(source,{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None});
const keys=generateKeyPairSync('ed25519');
const publicKey=Buffer.from(keys.publicKey.export({format:'jwk'}).x!,'base64url').toString('base64');
function setup(){
  const rpc=vi.fn().mockResolvedValue({data:{ok:true},error:null});const insert=vi.fn().mockResolvedValue({error:null});
  const createClient=vi.fn(()=>({rpc,from:()=>({insert})}));
  let handler:(request:Request)=>Promise<Response>;
  runInNewContext(script,{createClient,Request,Response,TextEncoder,crypto:webcrypto,atob,console:{error:vi.fn()},Deno:{env:{get:(name:string)=>({TELNYX_PUBLIC_KEY:publicKey,SUPABASE_URL:'https://example.com',SUPABASE_SERVICE_ROLE_KEY:'test'}[name])},serve:(fn:typeof handler)=>{handler=fn;}}});
  return {invoke:(r:Request)=>handler(r),rpc,insert,createClient};
}
function request(body:string,timestamp=String(Math.floor(Date.now()/1000)),signature?:string){
  return new Request('https://example.com/webhook',{method:'POST',body,headers:{'telnyx-timestamp':timestamp,'telnyx-signature-ed25519':signature??sign(null,Buffer.from(`${timestamp}|${body}`),keys.privateKey).toString('base64')}});
}
const payload=JSON.stringify({data:{id:'event-id',event_type:'message.finalized',payload:{id:'provider-id',direction:'outbound',text:'Safe SMS'}}});
describe('actual Telnyx webhook handler',()=>{
  it('accepts correctly signed exact bytes',async()=>{const h=setup();expect((await h.invoke(request(payload))).status).toBe(200);expect(h.rpc).toHaveBeenCalledTimes(1);});
  it.each(['missing','forged','stale','future','altered'])('rejects %s signatures before any database access',async(mode)=>{
    const h=setup();let req=request(payload);
    if(mode==='missing') req=new Request('https://example.com',{method:'POST',body:payload});
    if(mode==='forged') req=request(payload,undefined,Buffer.alloc(64).toString('base64'));
    if(mode==='stale'||mode==='future') req=request(payload,String(Math.floor(Date.now()/1000)+(mode==='stale'?-301:301)));
    if(mode==='altered'){const timestamp=String(Math.floor(Date.now()/1000));req=request(payload+' ',timestamp,sign(null,Buffer.from(`${timestamp}|${payload}`),keys.privateKey).toString('base64'));}
    expect((await h.invoke(req)).status).toBe(401);expect(h.createClient).not.toHaveBeenCalled();
  });
  it('redacts OTP values in the RPC and in the DLQ on forced failure',async()=>{
    const h=setup();h.rpc.mockResolvedValue({data:null,error:{code:'XX000',message:'forced'}});
    const otp=payload.replace('Safe SMS','Your Shop verification code is 123456.');
    expect((await h.invoke(request(otp))).status).toBe(500);
    expect(JSON.stringify(h.rpc.mock.calls)).not.toContain('123456');expect(JSON.stringify(h.insert.mock.calls)).not.toContain('123456');
    expect(h.insert).toHaveBeenCalledWith(expect.objectContaining({source:'telnyx',external_event_id:'event-id'}));
  });
  it('dead-letters RPC transport failures and treats duplicate DLQ keys as captured',async()=>{
    const h=setup();h.rpc.mockRejectedValue(new Error('transport'));h.insert.mockResolvedValue({error:{code:'23505'}});
    const response=await h.invoke(request(payload));expect(response.status).toBe(500);expect(await response.json()).toHaveProperty('captured',true);
  });
  it('returns retryable failure when both RPC and DLQ transports fail',async()=>{
    const h=setup();h.rpc.mockRejectedValue(new Error());h.insert.mockRejectedValue(new Error());
    expect(await (await h.invoke(request(payload))).json()).toHaveProperty('captured',false);
  });
});
