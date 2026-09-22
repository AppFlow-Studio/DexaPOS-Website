import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock=vi.hoisted(()=>({auth:vi.fn(),access:vi.fn(),service:vi.fn(),from:vi.fn(),rpc:vi.fn(),send:vi.fn(),ledger:vi.fn(),customer:vi.fn(),campaign:vi.fn(),recipient:vi.fn(),eq:vi.fn(),insert:vi.fn()}));
vi.mock('@clerk/nextjs/server',()=>({auth:mock.auth}));
vi.mock('@/lib/messaging/marketing-access',()=>({authorizeMarketingMerchant:mock.access}));
vi.mock('@/lib/supabase/service-role',()=>({createServiceRoleClient:mock.service}));
vi.mock('@/lib/messaging/telnyx',()=>({sendSMS:mock.send,isValidPhoneNumber:()=>true}));
vi.mock('@/lib/messaging/resend',()=>({sendEmail:vi.fn(),buildEmailTemplate:vi.fn(),isValidEmail:()=>true}));
vi.mock('@/lib/messaging/message-log',()=>({logOutboundMessage:mock.ledger}));
import { SendQuickMessage } from '@/app/dashboard/actions/marketing';
const input={merchantId:'merchant-a',customerId:'customer-a',channel:'sms' as const,destination:'+15555550100',message:'Hello'};
beforeEach(()=>{
  vi.resetAllMocks();mock.auth.mockResolvedValue({userId:'user-clerk'});mock.access.mockResolvedValue('merchant-a');
  mock.customer.mockResolvedValue({data:{id:'customer-a',phone:'+15555550100',sms_opt_in:true},error:null});
  mock.campaign.mockResolvedValue({data:{id:'campaign'},error:null});mock.recipient.mockResolvedValue({data:{id:'recipient'},error:null});
  mock.from.mockImplementation((table:string)=>{
    const chain={select:vi.fn(()=>chain),eq:vi.fn((...args)=>{mock.eq(table,...args);return chain}),insert:vi.fn((row)=>{mock.insert(table,row);return chain}),update:vi.fn(()=>chain),single:table==='customers'?mock.customer:table==='marketing_campaigns'?mock.campaign:mock.recipient};return chain;
  });
  mock.service.mockReturnValue({from:mock.from,rpc:mock.rpc});mock.rpc.mockResolvedValue({error:null});
  mock.send.mockResolvedValue({id:'accepted-provider-id',status:'queued',fromNumber:'+15555550200',messagingProfileId:'profile'});mock.ledger.mockResolvedValue({ok:true});
});
describe('quick message boundary',()=>{
  it('denies unauthenticated callers before service-role access',async()=>{mock.auth.mockResolvedValue({});expect(await SendQuickMessage(input)).toHaveProperty('error');expect(mock.service).not.toHaveBeenCalled();expect(mock.send).not.toHaveBeenCalled();});
  it('denies the wrong merchant before service-role access',async()=>{mock.access.mockRejectedValue(new Error('Denied'));expect(await SendQuickMessage(input)).toHaveProperty('error');expect(mock.service).not.toHaveBeenCalled();});
  it('requires the customer to belong to the authorized merchant',async()=>{mock.customer.mockResolvedValue({data:null,error:null});expect(await SendQuickMessage(input)).toHaveProperty('error');expect(mock.eq).toHaveBeenCalledWith('customers','merchant_id','merchant-a');expect(mock.send).not.toHaveBeenCalled();});
  it('does not borrow consent for another destination',async()=>{expect(await SendQuickMessage({...input,destination:'+15555550300'})).toHaveProperty('error');expect(mock.send).not.toHaveBeenCalled();});
  it.each([{sms_opt_in:false},{sms_opt_in:true,marketing_unsubscribed_at:'2026-09-20'}])('blocks opted-out recipients: %j',async(consent)=>{mock.customer.mockResolvedValue({data:{phone:input.destination,...consent}});expect(await SendQuickMessage(input)).toHaveProperty('error');expect(mock.send).not.toHaveBeenCalled();});
  it('creates pending history before sending and records acceptance without delivery',async()=>{
    const result=await SendQuickMessage(input);expect(mock.recipient.mock.invocationCallOrder[0]).toBeLessThan(mock.send.mock.invocationCallOrder[0]);
    expect(mock.insert).toHaveBeenCalledWith('marketing_recipients',expect.objectContaining({status:'pending'}));
    expect(mock.rpc).toHaveBeenCalledWith('record_marketing_result',expect.objectContaining({p_status:'sent',p_provider_message_id:'accepted-provider-id'}));
    expect(result).toHaveProperty('providerMessageId','accepted-provider-id');expect(result).toHaveProperty('recipient.status','sent');
  });
  it('never sends if recipient history cannot be created',async()=>{mock.recipient.mockResolvedValue({error:{code:'failure'}});await SendQuickMessage(input);expect(mock.send).not.toHaveBeenCalled();});
  it('returns the provider reference and warning without retrying an accepted SMS',async()=>{
    mock.ledger.mockResolvedValue({ok:false,error:'Tracking pending; do not resend',recoveryQueued:true});
    const result=await SendQuickMessage(input);expect(mock.send).toHaveBeenCalledTimes(1);expect(result).toHaveProperty('providerMessageId','accepted-provider-id');expect(result).toHaveProperty('trackingWarning','Tracking pending; do not resend');
  });
  it('preserves the provider reference on immediate failure',async()=>{mock.send.mockResolvedValue({id:'failed-id',error:'Invalid number',errorCode:'10002'});await SendQuickMessage(input);expect(mock.ledger).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({telnyxMessageId:'failed-id',status:'failed',errorCode:'10002'}));});
});
