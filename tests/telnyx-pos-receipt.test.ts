import { beforeAll, describe, expect, it, vi } from 'vitest';
let renderer:typeof import('@/supabase/functions/_shared/pos-receipt-template');
beforeAll(async()=>{vi.stubGlobal('Deno',{env:{get:()=>undefined}});renderer=await import('@/supabase/functions/_shared/pos-receipt-template');vi.unstubAllGlobals();});
const order={display_number:'#S1-0003',receipt_token:'receipt-token',created_at:'2026-09-20T12:00:00Z',total_amount:12,order_items:[{item_name:'Coffee',quantity:2,subtotal:12}],order_payments:[]};
describe('shared POS receipt compatibility',()=>{
  it('retains embedded itemized rendering for ordinary POS receipts',()=>{const text=renderer.renderReceiptText(order,{name:'Cafe'});expect(text).toContain('Coffee');expect(text).toContain('Total: $12.00');expect(text).not.toContain('Order ##');});
  it('keeps kiosk confirmation concise with the original one-token fallback',()=>{const text=renderer.renderReceiptText(order,{name:'Cafe'},{confirmation:true});expect(text).toBe('Order #S1-0003 at Cafe\nReceipt: https://dexaposai.com/receipts/receipt-token');expect(text).not.toContain('$');expect(text).not.toContain('Coffee');});
  it('supports the Website hosted send-token URL without dropping kiosk behavior',()=>{const text=renderer.renderReceiptText(order,{name:'Cafe'},{confirmation:true,receiptUrl:'https://shop.example/receipts/token/send-token'});expect(text).toContain('/token/send-token');expect(text).not.toContain('Coffee');});
  it('keeps the embedded HTML renderer and escapes merchant/customer content',()=>{const html=renderer.renderReceiptHtml(order,{name:'<script>Cafe</script>'});expect(html).toContain('Coffee');expect(html).toContain('&lt;script&gt;');expect(html).not.toContain('<script>');});
});
