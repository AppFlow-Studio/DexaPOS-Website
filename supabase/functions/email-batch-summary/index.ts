// deno-lint-ignore-file no-explicit-any
// email-batch-summary — auto-emails the batch-out settlement summary to the
// location owner when a terminal batches out.
//
// The tablet POSTs { settlement_batch_id } with the cashier's Clerk token
// (fire-and-forget, in parallel with printing). We RE-FETCH the summary by
// calling get_batch_summary_v1 with the FORWARDED token: that single call is
// both the tenant-ownership gate (the RPC raises "Access denied" on a scope
// mismatch) and the authoritative, print-parity data — the email never trusts
// client-sent money.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Resend } from 'npm:resend@4.0.1';
import {
  renderBatchSummaryHtml,
  type BatchSummary,
} from '../_shared/batch-summary-template.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface RequestBody {
  settlement_batch_id?: string;
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

function logError(message: string, error: unknown): void {
  console.error(
    `[${new Date().toISOString()}] [email-batch-summary] ERROR: ${message}`,
    error,
  );
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

async function fetchMerchantLogoUrl(
  sb: ReturnType<typeof createClient>,
  merchantId: string,
): Promise<string | null> {
  try {
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
  } catch {
    return null;
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResp(
      { success: false, message: 'method_not_allowed' },
      { status: 405 },
    );
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResp(
      { success: false, message: 'unauthenticated' },
      { status: 401 },
    );
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceKey) {
    logError('Missing supabase env vars', null);
    return jsonResp(
      { success: false, message: 'server_misconfigured' },
      { status: 500 },
    );
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return jsonResp(
      { success: false, message: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const settlementBatchId = body.settlement_batch_id;
  if (!settlementBatchId) {
    return jsonResp(
      { success: false, message: 'settlement_batch_id required' },
      { status: 400 },
    );
  }

  const userId = decodeJwtSub(authHeader);

  // 1. Ownership gate + authoritative data in one call. RLS/scope checks inside
  //    get_batch_summary_v1 raise "Access denied" if the batch isn't the
  //    caller's — the forwarded token is what makes user_merchant_id() resolve.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: summaryData, error: summaryError } = await userClient.rpc(
    'get_batch_summary_v1',
    { p_settlement_batch_id: settlementBatchId },
  );

  if (summaryError) {
    const msg = summaryError.message ?? '';
    if (/access denied/i.test(msg)) {
      return jsonResp(
        { success: false, skipped: 'forbidden' },
        { status: 403 },
      );
    }
    if (/not found/i.test(msg)) {
      return jsonResp(
        { success: false, skipped: 'not_found' },
        { status: 404 },
      );
    }
    logError('get_batch_summary_v1 failed', summaryError);
    return jsonResp({ success: false, message: msg }, { status: 400 });
  }

  const summary = summaryData as unknown as BatchSummary;
  const admin = createClient(supabaseUrl, serviceKey);

  // 2. Resolve location (the summary header has no location_id / merchant_id).
  const { data: batch, error: batchError } = await admin
    .from('settlement_batches')
    .select('merchant_id, location_id')
    .eq('id', settlementBatchId)
    .single();

  if (batchError || !batch) {
    logError('settlement_batches lookup failed', batchError);
    return jsonResp(
      { success: false, message: 'settlement batch not found' },
      { status: 404 },
    );
  }

  const merchantId = (batch as any).merchant_id as string;
  const locationId = (batch as any).location_id as string;

  // 3. Per-location toggle + recipient override.
  const { data: location, error: locationError } = await admin
    .from('locations')
    .select(
      'name, email, batch_summary_email_enabled, batch_summary_email_recipient',
    )
    .eq('id', locationId)
    .single();

  if (locationError || !location) {
    logError('locations lookup failed', locationError);
    return jsonResp(
      { success: false, message: 'location not found' },
      { status: 404 },
    );
  }

  const loc = location as any;
  if (!loc.batch_summary_email_enabled) {
    return jsonResp({ success: true, skipped: 'disabled' });
  }

  const override = (loc.batch_summary_email_recipient ?? '').trim();
  const recipient = override || (loc.email ?? '').trim();
  if (!recipient) {
    return jsonResp({ success: true, skipped: 'no_recipient' });
  }

  // 4. Idempotency — UNIQUE(settlement_batch_id) makes re-fires a no-op.
  const { data: pendingRow, error: pendingErr } = await admin
    .from('batch_summary_email_sends')
    .insert({
      settlement_batch_id: settlementBatchId,
      merchant_id: merchantId,
      location_id: locationId,
      recipient,
      status: 'pending',
      created_by: userId,
    })
    .select('id')
    .single();

  if (pendingErr) {
    // 23505 = unique_violation → this batch was already emailed.
    if ((pendingErr as any).code === '23505') {
      return jsonResp({ success: true, skipped: 'already_sent' });
    }
    logError('ledger insert failed', pendingErr);
    return jsonResp(
      { success: false, message: 'Failed to initialise send record.' },
      { status: 500 },
    );
  }

  const ledgerId = (pendingRow as { id: string }).id;

  // 5. Render + send.
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) {
    await admin
      .from('batch_summary_email_sends')
      .update({ status: 'failed', error_message: 'RESEND_API_KEY not set' })
      .eq('id', ledgerId);
    return jsonResp({
      success: false,
      message: 'Email service not configured. Set RESEND_API_KEY.',
    });
  }
  const resend = new Resend(apiKey);
  const fromEmail =
    Deno.env.get('RESEND_FROM_EMAIL') || 'receipts@resend.dev';

  const locationName = (loc.name as string | null) || 'Batch-Out Summary';
  const merchantLogoUrl = await fetchMerchantLogoUrl(admin, merchantId);
  const html = renderBatchSummaryHtml(summary, {
    locationName,
    merchantLogoUrl,
  });
  const businessDate = summary?.header?.business_date
    ? new Date(String(summary.header.business_date)).toLocaleDateString(
        'en-US',
        { month: 'short', day: 'numeric', year: 'numeric' },
      )
    : '';
  const subject = businessDate
    ? `Batch-out summary · ${locationName} · ${businessDate}`
    : `Batch-out summary · ${locationName}`;

  try {
    const { error: emailError } = await resend.emails.send({
      from: fromEmail,
      to: recipient,
      subject,
      html,
    });

    if (emailError) {
      await admin
        .from('batch_summary_email_sends')
        .update({ status: 'failed', error_message: emailError.message })
        .eq('id', ledgerId);
      logError('resend send failed', emailError);
      return jsonResp({ success: false, message: emailError.message });
    }

    await admin
      .from('batch_summary_email_sends')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', ledgerId);

    return jsonResp({ success: true, message: 'Batch summary emailed' });
  } catch (err: any) {
    const message = err?.message || 'Failed to send batch summary email';
    await admin
      .from('batch_summary_email_sends')
      .update({ status: 'failed', error_message: message })
      .eq('id', ledgerId);
    logError('send threw', err);
    return jsonResp({ success: false, message }, { status: 500 });
  }
});
