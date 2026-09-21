import { describe, expect, it, vi } from 'vitest';
import { writeOutboundLedger } from '@/supabase/functions/_shared/message-ledger';
const args={p_merchant_id:'merchant',p_telnyx_message_id:'provider-id',p_to_number:'+15555550100',p_body:'verification code is [REDACTED]'};
describe('shared outbound ledger recovery',()=>{
  it.each(['rpc-error','transport-error'])('captures %s with enough context for ledger-only recovery',async(kind)=>{
    const rpc=kind==='rpc-error'?vi.fn().mockResolvedValue({error:{code:'XX000'}}):vi.fn().mockRejectedValue(new Error('private phone/body'));
    const insert=vi.fn().mockResolvedValue({error:null});const from=vi.fn(()=>({insert}));const log=vi.spyOn(console,'error').mockImplementation(()=>{});
    try {
      const result=await writeOutboundLedger({rpc,from},args);
      expect(result).toMatchObject({ok:false,recoveryQueued:true,providerMessageId:'provider-id'});
      expect(rpc).toHaveBeenCalledTimes(1);expect(insert).toHaveBeenCalledWith(expect.objectContaining({source:'telnyx_outbound',external_event_id:'provider-id',raw_payload:{version:1,rpc_args:args}}));
      expect(JSON.stringify(log.mock.calls)).not.toContain(args.p_to_number);expect(JSON.stringify(log.mock.calls)).not.toContain(args.p_body);
    } finally {log.mockRestore();}
  });
  it('treats a duplicate recovery item as already captured',async()=>{
    vi.spyOn(console,'error').mockImplementation(()=>{});
    const result=await writeOutboundLedger({rpc:vi.fn().mockResolvedValue({error:{code:'bad'}}),from:()=>({insert:vi.fn().mockResolvedValue({error:{code:'23505'}})})},args);
    expect(result).toHaveProperty('recoveryQueued',true);vi.restoreAllMocks();
  });
  it('reports a failed recovery write with the provider ID, without throwing a send failure',async()=>{
    vi.spyOn(console,'error').mockImplementation(()=>{});
    const result=await writeOutboundLedger({rpc:vi.fn().mockRejectedValue(new Error()),from:()=>({insert:vi.fn().mockRejectedValue(new Error())})},args);
    expect(result).toMatchObject({ok:false,recoveryQueued:false,providerMessageId:'provider-id'});vi.restoreAllMocks();
  });
});
