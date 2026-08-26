import { createClient } from 'npm:@supabase/supabase-js'
import { isAuthorizedInternalBillingRequest } from '../_shared/internal-billing-auth.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ success: false, error: 'Method not allowed' }, 405)
  if (!(await isAuthorizedInternalBillingRequest(req))) {
    return jsonResponse({ success: false, error: 'Unauthorized' }, 401)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const { data: invoices, error } = await supabase
    .from('subscription_invoices')
    .select('id')
    .eq('status', 'failed')
    .not('next_retry_at', 'is', null)
    .lte('next_retry_at', new Date().toISOString())
    .order('next_retry_at', { ascending: true })
    .limit(50)

  if (error) {
    return jsonResponse({ success: false, error: error.message }, 500)
  }

  const results = await Promise.all(
    (invoices ?? []).map(async (invoice) => {
      try {
        const response = await fetch(
          `${SUPABASE_URL.replace(/\/+$/, '')}/functions/v1/billing-charge-subscription`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              apikey: SUPABASE_SERVICE_ROLE_KEY,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ invoice_id: invoice.id }),
          },
        )
        const payload = await response.json().catch(() => ({}))
        return { invoiceId: invoice.id, ok: response.ok, payload }
      } catch (retryError) {
        return {
          invoiceId: invoice.id,
          ok: false,
          payload: {
            error: retryError instanceof Error ? retryError.message : 'Retry request failed',
          },
        }
      }
    }),
  )

  return jsonResponse({
    success: true,
    attempted: results.length,
    succeeded: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
    results,
  })
})
