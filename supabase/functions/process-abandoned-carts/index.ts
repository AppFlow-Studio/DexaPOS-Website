// ============================================================================
// process-abandoned-carts Edge Function
// ============================================================================
// Finds abandoned cart sessions (30-min idle, has email, no order placed,
// not yet notified) and sends recovery emails via Resend.
// Designed to run on a 15-minute schedule via pg_cron or Supabase scheduler.
// ============================================================================

import { createClient } from 'npm:@supabase/supabase-js'
import { Resend } from 'npm:resend'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const RESEND_FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') || 'orders@resend.dev'
const APP_URL = Deno.env.get('NEXT_PUBLIC_APP_URL') || Deno.env.get('VERCEL_URL')
  ? `https://${Deno.env.get('VERCEL_URL')}`
  : 'http://localhost:3000'

const ABANDONMENT_THRESHOLD_MINUTES = 30

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

async function recordQrAbandonedSessions(
  supabase: ReturnType<typeof createClient>,
): Promise<number> {
  const { data: qrSessions, error: qrSessionError } = await supabase
    .from('online_order_sessions')
    .select(`
      id,
      floor_plan_object_id,
      table_qr_code_id,
      table_label,
      online_store_config!inner(
        merchant_id,
        location_id
      )
    `)
    .is('order_id', null)
    .not('cart_data', 'eq', '[]')
    .not('cart_data', 'is', null)
    .lte('expires_at', new Date().toISOString())

  if (qrSessionError || !qrSessions?.length) {
    if (qrSessionError) {
      console.error('[QR_ABANDONED] Failed to fetch expired QR sessions:', qrSessionError)
    }
    return 0
  }

  const eligibleSessions = qrSessions.filter((session: any) =>
    Boolean(session.table_qr_code_id || session.floor_plan_object_id || session.table_label)
  )

  if (!eligibleSessions.length) return 0

  const sessionIds = eligibleSessions.map((session: any) => session.id)
  const { data: existingEvents, error: existingEventsError } = await supabase
    .from('qr_scan_events')
    .select('online_order_session_id')
    .in('online_order_session_id', sessionIds)
    .eq('stage', 'abandoned')

  if (existingEventsError) {
    console.error('[QR_ABANDONED] Failed to fetch existing abandoned events:', existingEventsError)
    return 0
  }

  const existingSessionIds = new Set(
    (existingEvents ?? []).map((event: any) => event.online_order_session_id)
  )

  const inserts = eligibleSessions
    .filter((session: any) => !existingSessionIds.has(session.id))
    .map((session: any) => ({
      merchant_id: session.online_store_config.merchant_id,
      location_id: session.online_store_config.location_id,
      floor_plan_object_id: session.floor_plan_object_id ?? null,
      table_qr_code_id: session.table_qr_code_id ?? null,
      online_order_session_id: session.id,
      stage: 'abandoned',
    }))

  if (!inserts.length) return 0

  const { error: insertError } = await supabase
    .from('qr_scan_events')
    .insert(inserts)

  if (insertError) {
    console.error('[QR_ABANDONED] Failed to insert abandoned QR events:', insertError)
    return 0
  }

  return inserts.length
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (!RESEND_API_KEY) {
    return new Response(
      JSON.stringify({ success: false, error: 'RESEND_API_KEY not configured' }),
      { status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    )
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const resend = new Resend(RESEND_API_KEY)
  const qrAbandonedLogged = await recordQrAbandonedSessions(supabase)

  const thresholdTime = new Date(Date.now() - ABANDONMENT_THRESHOLD_MINUTES * 60 * 1000).toISOString()

  // Find abandoned sessions with cart data, email, no order, updated 30+ min ago
  const { data: sessions, error: queryError } = await supabase
    .from('online_order_sessions')
    .select(`
      id, session_token, store_config_id, customer_email, customer_name,
      cart_data, updated_at,
      online_store_config!inner(slug, location_id)
    `)
    .is('order_id', null)
    .lt('updated_at', thresholdTime)
    .not('customer_email', 'is', null)
    .not('cart_data', 'eq', '[]')
    .not('cart_data', 'is', null)
    .gt('expires_at', new Date().toISOString())

  if (queryError) {
    console.error('[QUERY] Failed to fetch sessions:', queryError)
    return new Response(
      JSON.stringify({ success: false, error: 'Failed to query sessions' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    )
  }

  if (!sessions || sessions.length === 0) {
    return new Response(
      JSON.stringify({ success: true, processed: 0, message: 'No abandoned carts found' }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    )
  }

  // Filter out sessions that already have a notification
  const sessionIds = sessions.map((s: any) => s.id)
  const { data: existing } = await supabase
    .from('abandoned_cart_notifications')
    .select('session_id')
    .in('session_id', sessionIds)

  const notifiedSet = new Set((existing ?? []).map((e: any) => e.session_id))
  const toProcess = sessions.filter((s: any) => !notifiedSet.has(s.id))

  // Get store names for email subject
  const locationIds = [...new Set(toProcess.map((s: any) => (s as any).online_store_config.location_id))]
  const { data: locations } = await supabase
    .from('locations')
    .select('id, name')
    .in('id', locationIds)
  const locationMap = new Map((locations ?? []).map((l: any) => [l.id, l.name]))

  let sent = 0
  let failed = 0

  for (const session of toProcess) {
    const config = (session as any).online_store_config
    const slug = config.slug
    const storeName = locationMap.get(config.location_id) || 'Our Store'
    const email = session.customer_email
    const cartItems = session.cart_data as any[]

    if (!email || !cartItems?.length) continue

    // Create notification record
    const { data: notification, error: insertError } = await supabase
      .from('abandoned_cart_notifications')
      .insert({
        session_id: session.id,
        store_config_id: session.store_config_id,
        notification_type: 'email',
        recipient: email,
        status: 'pending',
      })
      .select('id, recovery_token')
      .single()

    if (insertError || !notification) {
      console.error(`[INSERT] Failed for session ${session.id}:`, insertError)
      failed++
      continue
    }

    const recoveryUrl = `${APP_URL}/sites/${slug}/checkout?recover=${notification.recovery_token}`

    const itemsHtml = cartItems
      .map(
        (item: any) =>
          `<tr><td style="padding:8px;border-bottom:1px solid #eee;">${item.quantity || 1}x ${item.name}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">$${((item.totalPrice || item.price || 0) * (item.quantity || 1)).toFixed(2)}</td></tr>`
      )
      .join('')

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:'Segoe UI',system-ui,sans-serif;max-width:500px;margin:0 auto;padding:20px;color:#333;">
  <h2 style="margin-bottom:4px;">${storeName}</h2>
  <p style="color:#666;margin-top:0;">You left some items in your cart!</p>
  <table style="width:100%;border-collapse:collapse;margin:20px 0;">
    <thead><tr><th style="text-align:left;padding:8px;border-bottom:2px solid #333;">Item</th><th style="text-align:right;padding:8px;border-bottom:2px solid #333;">Price</th></tr></thead>
    <tbody>${itemsHtml}</tbody>
  </table>
  <div style="text-align:center;margin:30px 0;">
    <a href="${recoveryUrl}" style="display:inline-block;padding:14px 32px;background-color:#000;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Complete Your Order</a>
  </div>
  <p style="font-size:12px;color:#999;text-align:center;">If you didn't start this order, you can safely ignore this email.</p>
</body>
</html>`.trim()

    try {
      const { error: emailError } = await resend.emails.send({
        from: RESEND_FROM_EMAIL,
        to: email,
        subject: `Complete your order from ${storeName}`,
        html,
      })

      if (emailError) {
        await supabase
          .from('abandoned_cart_notifications')
          .update({ status: 'failed', error_message: emailError.message, sent_at: new Date().toISOString() })
          .eq('id', notification.id)
        console.error(`[EMAIL] Failed for ${email}:`, emailError)
        failed++
      } else {
        await supabase
          .from('abandoned_cart_notifications')
          .update({ status: 'sent', sent_at: new Date().toISOString() })
          .eq('id', notification.id)
        sent++
        console.log(`[EMAIL] Recovery email sent to ${email} for session ${session.id}`)
      }
    } catch (err) {
      await supabase
        .from('abandoned_cart_notifications')
        .update({ status: 'failed', error_message: String(err), sent_at: new Date().toISOString() })
        .eq('id', notification.id)
      console.error(`[EMAIL] Exception for ${email}:`, err)
      failed++
    }
  }

  console.log(`[DONE] Processed ${toProcess.length} abandoned carts: ${sent} sent, ${failed} failed`)

  return new Response(
    JSON.stringify({
      success: true,
      total: toProcess.length,
      sent,
      failed,
      qr_abandoned_logged: qrAbandonedLogged,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
  )
})
