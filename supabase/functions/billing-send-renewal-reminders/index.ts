import { createClient } from 'npm:@supabase/supabase-js'
import { isAuthorizedInternalBillingRequest } from '../_shared/internal-billing-auth.ts'
import { isSubscriptionBillingHeld } from '../_shared/subscription-billing-scope.ts'
import { loadMerchantBillingExemption } from '../_shared/merchant-billing-exemption.ts'
import { sendSubscriptionRenewalReminderEmail } from '../_shared/payment-emails.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const APP_URL = (Deno.env.get('APP_URL') ?? Deno.env.get('NEXT_PUBLIC_APP_URL') ?? '').replace(/\/+$/, '')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders } })
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Emails merchants a heads-up a few days before their subscription auto-renews.
 * Idempotent per renewal date via `metadata.renewal_reminder_sent_for` so the
 * daily cron never double-sends. Schedule this like the other billing crons
 * (e.g. once daily). No invoice exists yet at reminder time, so there is no PDF.
 */
Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ success: false, error: 'Method not allowed' }, 405)
  if (!(await isAuthorizedInternalBillingRequest(req))) {
    return jsonResponse({ success: false, error: 'Unauthorized' }, 401)
  }

  try {
    const body = (await req.json().catch(() => ({}))) as { days_ahead?: number; as_of_date?: string }
    const daysAhead = Number.isFinite(body.days_ahead) ? Number(body.days_ahead) : 3
    const today = body.as_of_date ?? new Date().toISOString().slice(0, 10)
    const windowEnd = addDays(today, daysAhead)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { data: subscriptions, error } = await supabase
      .from('merchant_subscriptions')
      .select('id, merchant_id, location_id, status, metadata, monthly_amount, next_billing_date, billing_profile_id')
      .eq('status', 'active')
      .gte('next_billing_date', today)
      .lte('next_billing_date', windowEnd)

    if (error) return jsonResponse({ success: false, error: error.message }, 500)

    const sent: string[] = []
    const skipped: Array<{ subscription_id: string; reason: string }> = []

    for (const sub of subscriptions ?? []) {
      const renewalDate = sub.next_billing_date as string
      const metadata = (sub.metadata ?? {}) as Record<string, unknown>
      if (metadata.renewal_reminder_sent_for === renewalDate) {
        skipped.push({ subscription_id: sub.id, reason: 'already_reminded' })
        continue
      }
      if (isSubscriptionBillingHeld(metadata)) {
        skipped.push({ subscription_id: sub.id, reason: 'billing_held' })
        continue
      }
      if (Number(sub.monthly_amount ?? 0) <= 0) {
        skipped.push({ subscription_id: sub.id, reason: 'zero_amount' })
        continue
      }
      const exemption = await loadMerchantBillingExemption(supabase, sub.merchant_id)
      if (exemption.active) {
        skipped.push({ subscription_id: sub.id, reason: 'billing_exempt' })
        continue
      }

      const [{ data: merchant }, { data: location }] = await Promise.all([
        supabase.from('merchants').select('name, owner_email').eq('id', sub.merchant_id).maybeSingle(),
        sub.location_id
          ? supabase.from('locations').select('name').eq('id', sub.location_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ])
      let billingEmail: string | null = null
      if (sub.billing_profile_id) {
        const { data: profile } = await supabase
          .from('merchant_billing_profiles')
          .select('billing_email')
          .eq('id', sub.billing_profile_id)
          .maybeSingle()
        billingEmail = (profile?.billing_email as string | null)?.trim() || null
      }
      const recipient = (billingEmail || (merchant?.owner_email as string | null)?.trim() || '').toLowerCase()
      if (!recipient) {
        skipped.push({ subscription_id: sub.id, reason: 'no_recipient' })
        continue
      }

      try {
        await sendSubscriptionRenewalReminderEmail({
          to: recipient,
          merchantName: (merchant?.name as string) || 'Dexa POS',
          locationName: ((location as { name?: string } | null)?.name as string) || 'your location',
          amount: Number(sub.monthly_amount ?? 0),
          renewalDate,
          viewUrl: APP_URL ? `${APP_URL}/dashboard/subscriptions/billing` : null,
        })
        await supabase
          .from('merchant_subscriptions')
          .update({ metadata: { ...metadata, renewal_reminder_sent_for: renewalDate } })
          .eq('id', sub.id)
        sent.push(sub.id)
      } catch (err) {
        console.error('[billing-send-renewal-reminders] send failed:', err)
        skipped.push({ subscription_id: sub.id, reason: 'send_failed' })
      }
    }

    return jsonResponse({
      success: true,
      as_of_date: today,
      window_end: windowEnd,
      sent_count: sent.length,
      skipped_count: skipped.length,
      sent,
      skipped,
    })
  } catch (err) {
    console.error('[billing-send-renewal-reminders] Unhandled error:', err)
    return jsonResponse({ success: false, error: 'Internal server error' }, 500)
  }
})
