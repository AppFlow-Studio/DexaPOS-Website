import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock=vi.hoisted(()=>({context:vi.fn(),rpc:vi.fn()}));
vi.mock('@/lib/admin/merchant-context',()=>({getEffectiveMerchantContext:mock.context}));
vi.mock('@/lib/supabase/server',()=>({createServerSupabaseClient:()=>({rpc:mock.rpc})}));
import { authorizeMarketingMerchant } from '@/lib/messaging/marketing-access';
beforeEach(()=>{vi.resetAllMocks();mock.context.mockResolvedValue({merchantId:'active-merchant'});mock.rpc.mockResolvedValue({data:true,error:null});});
describe('marketing merchant permission',()=>{
  it('binds the requested merchant to the authenticated or impersonated context',async()=>{expect(await authorizeMarketingMerchant('active-merchant')).toBe('active-merchant');expect(mock.context).toHaveBeenCalledWith(null);expect(mock.rpc).toHaveBeenCalledWith('is_merchant_admin',{p_merchant_id:'active-merchant'});});
  it('denies another merchant even if the client supplies its ID',async()=>{await expect(authorizeMarketingMerchant('other')).rejects.toThrow('denied');expect(mock.rpc).not.toHaveBeenCalled();});
  it.each([{data:false,error:null},{data:null,error:null},{data:true,error:{code:'failed'}}])('fails closed on insufficient or unavailable permission: %j',async(result)=>{mock.rpc.mockResolvedValue(result);await expect(authorizeMarketingMerchant()).rejects.toThrow('denied');});
});
