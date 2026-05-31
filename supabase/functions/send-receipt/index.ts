// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Resend } from 'npm:resend@4.0.1';
import {
  renderReceiptHtml,
  renderReceiptText,
} from '../_shared/receipt-template.ts';
import { sendSMS } from '../_shared/telnyx.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const RATE_LIMIT_SENDS = 3;
const RATE_LIMIT_WINDOW_HOURS = 1;

interface SendReceiptBody {
  order_id: string;
  delivery_method: 'email' | 'sms';
  recipient: string;
  receipt_template_id?: string;
}

function jsonResp(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
}

function decodeJwtSub(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const parts = m[1].split('.');
  if (parts.length !== 3) return null;
  try {
    const padded = parts[1] + '='.repeat((4 - (parts[1].length % 4)) % 4);
    const json = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(json) as { sub?: string };
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

function appBaseUrl(): string {
  const raw =
    Deno.env.get('APP_URL') ?? Deno.env.get('NEXT_PUBLIC_APP_URL') ?? '';
  return raw.replace(/\/$/, '');
}

async function ensureReceiptToken(
  sb: ReturnType<typeof createClient>,
  orderId: string,
): Promise<string | null> {
  const { data } = await sb
    .from('orders')
    .select('receipt_token')
    .eq('id', orderId)
    .single();
  const existing = (data as { receipt_token?: string | null } | null)
    ?.receipt_token;
  if (existing) return existing;

  // Lazy backfill — null forces the column default expression to re-run.
  const { data: updated } = await sb
    .from('orders')
    .update({ receipt_token: null })
    .eq('id', orderId)
    .select('receipt_token')
    .single();
  return (
    (updated as { receipt_token?: string | null } | null)?.receipt_token ??
    null
  );
}

async function fetchMerchantLogoUrl(
  sb: ReturnType<typeof createClient>,
  merchantId: string,
): Promise<string | null> {
  const { data } = await sb
    .from('merchants')
    .select('clerk_org_id')
    .eq('id', merchantId)
    .maybeSingle();
  const clerkOrgId = (data as any)?.clerk_org_id;
  if (!clerkOrgId) return null;
  const { data: org } = await sb
    .from('organizations')
    .select('imageURL')
    .eq('id', clerkOrgId)
    .maybeSingle();
  return ((org as any)?.imageURL as string | null) ?? null;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const userId = decodeJwtSub(req.headers.get('authorization'));

  let body: SendReceiptBody;
  try {
    body = await req.json();
  } catch {
    return jsonResp(
      { success: false, message: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const { order_id, delivery_method, recipient, receipt_template_id } = body;
  if (!order_id || !delivery_method || !recipient) {
    return jsonResp(
      {
        success: false,
        message: 'order_id, delivery_method, recipient required',
      },
      { status: 400 },
    );
  }
  if (delivery_method !== 'email' && delivery_method !== 'sms') {
    return jsonResp(
      {
        success: false,
        message: "delivery_method must be 'email' or 'sms'",
      },
      { status: 400 },
    );
  }

  const { data: order, error: orderError } = await sb
    .from('orders')
    .select(
      `
      *,
      order_items(*, order_item_modifiers(*)),
      order_payments(*),
      location:locations!orders_location_id_fkey(name, address_line1, address_line2, city, state, postal_code, phone)
    `,
    )
    .eq('id', order_id)
    .single();

  if (orderError || !order) {
    return jsonResp(
      { success: false, message: 'Order not found' },
      { status: 404 },
    );
  }

  const merchantId: string | undefined = (order as any).merchant_id;
  if (!merchantId) {
    return jsonResp(
      { success: false, message: 'Order has no merchant_id' },
      { status: 500 },
    );
  }

  const since = new Date(
    Date.now() - RATE_LIMIT_WINDOW_HOURS * 60 * 60 * 1000,
  ).toISOString();
  const { count: recentCount } = await sb
    .from('receipt_sends')
    .select('id', { count: 'exact', head: true })
    .eq('order_id', order_id)
    .gte('sent_at', since);

  if ((recentCount ?? 0) >= RATE_LIMIT_SENDS) {
    return jsonResp({
      success: false,
      message: `Rate limit exceeded. Maximum ${RATE_LIMIT_SENDS} receipts per order per hour.`,
    });
  }

  const location = (order as any).location ?? null;
  const businessName = (location as any)?.name || 'Receipt';
  const displayNum = (order as any).display_number as string | undefined;
  const fallbackNum = (order as any).order_number as string | undefined;
  // display_number already has a leading '#'; only prefix the raw fallback.
  const orderNumberForSubject =
    displayNum || (fallbackNum ? `#${fallbackNum}` : '—');

  try {
    if (delivery_method === 'email') {
      const apiKey = Deno.env.get('RESEND_API_KEY');
      if (!apiKey) {
        return jsonResp({
          success: false,
          message: 'Email service not configured. Set RESEND_API_KEY.',
        });
      }
      const resend = new Resend(apiKey);
      const fromEmail =
        Deno.env.get('RESEND_FROM_EMAIL') || 'receipts@resend.dev';
      const merchantLogoUrl = await fetchMerchantLogoUrl(sb, merchantId);
      const html = renderReceiptHtml(order as any, location, {
        merchantLogoUrl,
      });

      const { error: emailError } = await resend.emails.send({
        from: fromEmail,
        to: recipient,
        subject: `Your receipt from ${businessName} · Order ${orderNumberForSubject}`,
        html,
      });

      if (emailError) {
        await sb.from('receipt_sends').insert({
          order_id,
          merchant_id: merchantId,
          delivery_method: 'email',
          recipient,
          receipt_template_id: receipt_template_id ?? null,
          status: 'failed',
          error_message: emailError.message,
          created_by: userId,
        });
        return jsonResp({ success: false, message: emailError.message });
      }

      await sb.from('receipt_sends').insert({
        order_id,
        merchant_id: merchantId,
        delivery_method: 'email',
        recipient,
        receipt_template_id: receipt_template_id ?? null,
        status: 'sent',
        created_by: userId,
      });

      return jsonResp({
        success: true,
        message: 'Receipt sent to email successfully',
      });
    }

    // SMS
    const { data: pendingRow, error: pendingErr } = await sb
      .from('receipt_sends')
      .insert({
        order_id,
        merchant_id: merchantId,
        delivery_method: 'sms',
        recipient,
        receipt_template_id: receipt_template_id ?? null,
        status: 'pending',
        created_by: userId,
      })
      .select('id, send_token')
      .single();

    if (pendingErr || !pendingRow) {
      return jsonResp({
        success: false,
        message: 'Failed to initialise receipt send record.',
      });
    }

    const receiptToken = await ensureReceiptToken(sb, order_id);
    const sendToken = (pendingRow as { send_token?: string }).send_token;
    const baseUrl = appBaseUrl();
    const receiptUrl = receiptToken && sendToken && baseUrl
      ? `${baseUrl}/receipts/${receiptToken}/${sendToken}`
      : baseUrl;

    const text = renderReceiptText(order as any, location, receiptUrl);
    const smsResult = await sendSMS(recipient, text);

    const newStatus = 'error' in smsResult ? 'failed' : 'sent';
    await sb
      .from('receipt_sends')
      .update({
        status: newStatus,
        error_message: 'error' in smsResult ? smsResult.error : null,
      })
      .eq('id', (pendingRow as { id: string }).id);

    if ('error' in smsResult) {
      return jsonResp({ success: false, message: smsResult.error });
    }

    return jsonResp({
      success: true,
      message: 'Receipt sent via SMS successfully',
    });
  } catch (err: any) {
    const message = err?.message || 'Failed to send receipt';
    try {
      await sb.from('receipt_sends').insert({
        order_id,
        merchant_id: merchantId,
        delivery_method,
        recipient,
        status: 'failed',
        error_message: message,
        receipt_template_id: receipt_template_id ?? null,
        created_by: userId,
      });
    } catch (_) {
      // best-effort audit
    }
    return jsonResp({ success: false, message }, { status: 500 });
  }
});
