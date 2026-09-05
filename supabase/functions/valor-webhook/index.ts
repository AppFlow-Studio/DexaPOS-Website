// Valor auto-batch webhook receiver.
//
// Contract (Valor webhook user guide — https://valorapi.readme.io/reference/webhook-user-guide):
//   * Events: batch_summary (batch-level totals) on every batch close, including
//     the nightly auto-batch. Keyed on the device EPI (epi_id).
//   * Security: HMAC-SHA256 over `${rawBody}${timestamp}`, hex digest in header
//     `Valor-Signature`; `Valor-Timestamp` is an ISO-8601 UTC timestamp.
//     VERIFY BEFORE PARSING — a forged/unsigned request writes nothing (4xx).
//   * Ack: return 2xx within ~2s or Valor retries (max 3). Idempotency handled
//     in record_valor_batch_webhook (unique webhook batch per terminal+batch_no),
//     so a redelivered summary is a harmless no-op.
//
// Model: supabase/functions/telnyx-webhook/index.ts (verify-before-parse over the
// raw body, then a SECURITY DEFINER RPC via the service-role client).

import { createClient } from 'npm:@supabase/supabase-js'
import { notifySubscriptionPaymentFailure } from '../_shared/subscription-failure-notifications.ts'

const VALOR_WEBHOOK_SECRET = Deno.env.get('VALOR_WEBHOOK_SECRET') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const TIMESTAMP_TOLERANCE_SECONDS = 600

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Lowercase hex of an ArrayBuffer. */
function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Constant-time string compare (equal length hex strings). */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return mismatch === 0
}

function firstText(
  sources: Array<Record<string, unknown> | null | undefined>,
  keys: string[],
): string {
  for (const source of sources) {
    for (const key of keys) {
      const value = source?.[key]
      if (typeof value === 'string' && value.trim()) return value.trim()
      if (typeof value === 'number' && Number.isFinite(value)) return String(value)
    }
  }
  return ''
}

function normalizeEventName(value: string): string {
  return value.trim().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').toUpperCase()
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return toHex(digest)
}

function runInBackground(task: Promise<unknown>): void {
  const runtime = (globalThis as unknown as {
    EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void }
  }).EdgeRuntime
  if (runtime?.waitUntil) {
    runtime.waitUntil(task)
    return
  }
  task.catch((error) => console.error('[valor-webhook] background task failed', error))
}

/**
 * Verify Valor's HMAC-SHA256 hex signature over `${rawBody}${timestamp}`.
 * Returns false on any error (missing secret/headers, stale timestamp, mismatch).
 */
async function verifyValorSignature(
  rawBody: string,
  signatureHex: string | null,
  timestamp: string | null,
): Promise<boolean> {
  if (!VALOR_WEBHOOK_SECRET || !signatureHex || !timestamp) return false

  // Replay guard: reject stale timestamps (ISO-8601 UTC).
  const tsMs = Date.parse(timestamp)
  if (!Number.isFinite(tsMs)) return false
  const ageSeconds = Math.abs(Date.now() - tsMs) / 1000
  if (ageSeconds > TIMESTAMP_TOLERANCE_SECONDS) return false

  try {
    const enc = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(VALOR_WEBHOOK_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    const mac = await crypto.subtle.sign('HMAC', key, enc.encode(`${rawBody}${timestamp}`))
    return timingSafeEqual(toHex(mac), signatureHex.trim().toLowerCase())
  } catch (err) {
    console.error('[valor-webhook] signature verification threw', err)
    return false
  }
}

Deno.serve(async (req) => {
  const t0 = Date.now()
  // Lazily-created service-role client, reused for logging + the record RPC.
  const supabase =
    SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
      ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
      : null

  // Durable per-request log (valor_webhook_events). Best-effort — never blocks
  // or fails the response.
  async function logEvent(
    outcome: string,
    verified: boolean,
    httpStatus: number,
    opts: { epi?: string | null; batchNo?: string | null; batchUuid?: string | null; detail?: string | null; raw?: unknown } = {},
  ): Promise<void> {
    if (!supabase) return
    try {
      await supabase.rpc('log_valor_webhook_event', {
        p_epi: opts.epi ?? null,
        p_batch_no: opts.batchNo ?? null,
        p_verified: verified,
        p_outcome: outcome,
        p_http_status: httpStatus,
        p_latency_ms: Date.now() - t0,
        p_detail: opts.detail ?? null,
        p_settlement_batch_id: opts.batchUuid ?? null,
        p_raw: (opts.raw ?? null) as Record<string, unknown> | null,
      })
    } catch (err) {
      console.error('[valor-webhook] logEvent failed', err)
    }
  }

  // Reachability / URL-validation ping (the Valor dashboard validate-URL step)
  // and CORS preflight — always ack 200, no secret or signature required.
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    await logEvent('validation', false, 200, { detail: req.method })
    return json({ ok: true, service: 'valor-webhook' }, 200)
  }

  if (req.method !== 'POST') {
    await logEvent('error', false, 405, { detail: `method_not_allowed:${req.method}` })
    return json({ error: 'method_not_allowed' }, 405)
  }

  // Read the raw body BEFORE parsing — the signature covers the exact bytes.
  const rawBody = await req.text()

  let payload: unknown = null
  try {
    payload = rawBody ? JSON.parse(rawBody) : null
  } catch {
    payload = null
  }
  const data =
    (payload as { data?: Record<string, unknown> } | null)?.data ??
    (payload as Record<string, unknown> | null)
  const payloadRecord = payload as Record<string, unknown> | null
  const eventName = firstText(
    [payloadRecord, data],
    ['event_name', 'eventName', 'event', 'type', 'notification_type'],
  )
  const normalizedEventName = normalizeEventName(eventName)
  const looksLikeRecurring = normalizedEventName.includes('RECURRING')
  const epi = (data && typeof data === 'object' ? (data['epi_id'] as string | undefined) : undefined) ?? null
  const batchNo =
    data && typeof data === 'object'
      ? ((data['batch_no'] as string | number | undefined)?.toString() ?? null)
      : null
  const looksLikeBatchSummary =
    !!data &&
    typeof data === 'object' &&
    (('batch_no' in data && 'epi_id' in data) || 'batches_id' in data)

  // Anything that isn't a batch_summary or recurring event (validation POST, empty body, other
  // event) is ack'd 200 without a signature — so URL validation passes even
  // before the secret is set.
  if (!looksLikeBatchSummary && !looksLikeRecurring) {
    await logEvent('ignored', false, 200, { epi, batchNo, raw: payload })
    return json({ ok: true, ignored: true }, 200)
  }

  // From here we are processing a real event: require config + valid HMAC.
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !VALOR_WEBHOOK_SECRET) {
    await logEvent('error', false, 500, { epi, batchNo, detail: 'server_not_configured', raw: payload })
    return json({ error: 'server_not_configured' }, 500)
  }

  const signature = req.headers.get('Valor-Signature') ?? req.headers.get('valor-signature')
  const timestamp = req.headers.get('Valor-Timestamp') ?? req.headers.get('valor-timestamp')

  const verified = await verifyValorSignature(rawBody, signature, timestamp)
  if (!verified) {
    await logEvent('invalid_signature', false, 401, { epi, batchNo, detail: 'HMAC verification failed or stale timestamp', raw: payload })
    return json({ error: 'invalid_signature' }, 401)
  }

  if (looksLikeRecurring) {
    const subscriptionId = firstText(
      [data, payloadRecord],
      ['subscription_id', 'subscriptionid', 'subscriptionId'],
    )
    const transactionId = firstText(
      [data, payloadRecord],
      ['txn_id', 'transaction_id', 'transactionId'],
    )
    const failureMessage = firstText(
      [data, payloadRecord],
      ['display_message', 'error_message', 'response_text', 'message'],
    ) || 'Valor recurring payment failed'
    const isFailure = normalizedEventName.includes('FAILED')
    const isSuccess = normalizedEventName.includes('SUCCESS')
    const eventKey = await sha256Hex(
      [normalizedEventName, subscriptionId, transactionId, timestamp, rawBody].join('|'),
    )

    if (!subscriptionId || (!isFailure && !isSuccess)) {
      await logEvent('ignored', true, 200, {
        epi,
        detail: 'unrecognized_recurring_event',
        raw: payload,
      })
      return json({ ok: true, ignored: true }, 200)
    }

    const { data: claimedEvent, error: claimError } = await supabase!
      .from('valor_recurring_webhook_events')
      .insert({
        event_key: eventKey,
        event_name: normalizedEventName,
        processor_subscription_id: subscriptionId,
        processor_transaction_id: transactionId || null,
        status: 'processing',
        payload,
      })
      .select('id')
      .maybeSingle()

    if (claimError?.code === '23505') {
      await logEvent('processed', true, 200, {
        epi,
        detail: 'duplicate_recurring_event',
        raw: payload,
      })
      return json({ ok: true, duplicate: true }, 200)
    }
    if (claimError || !claimedEvent) {
      await logEvent('error', true, 500, {
        epi,
        detail: claimError?.message || 'recurring_event_claim_failed',
        raw: payload,
      })
      return json({ error: 'recurring_event_claim_failed' }, 500)
    }

    const { data: subscription, error: subscriptionError } = await supabase!
      .from('merchant_subscriptions')
      .select(
        'id, merchant_id, location_id, status, next_billing_date, processor_account_id',
      )
      .eq('processor', 'valor')
      .eq('processor_subscription_id', subscriptionId)
      .maybeSingle()

    if (subscriptionError || !subscription) {
      await supabase!
        .from('valor_recurring_webhook_events')
        .update({
          status: 'failed',
          error_message: subscriptionError?.message || 'subscription_not_found',
          processed_at: new Date().toISOString(),
        })
        .eq('id', claimedEvent.id)
      await logEvent('error', true, 500, {
        epi,
        detail: subscriptionError?.message || 'recurring_subscription_not_found',
        raw: payload,
      })
      return json({ error: 'recurring_subscription_not_found' }, 500)
    }

    type RecurringInvoice = {
      id: string
      invoice_number: string
      payment_attempt_count: number | null
      status: string
    }

    let invoice: RecurringInvoice | null = null
    if (transactionId) {
      const { data: transactionInvoice, error: transactionInvoiceError } = await supabase!
        .from('subscription_invoices')
        .select('id, invoice_number, payment_attempt_count, status')
        .eq('processor', 'valor')
        .eq('processor_transaction_id', transactionId)
        .maybeSingle()
      if (transactionInvoiceError) {
        await supabase!
          .from('valor_recurring_webhook_events')
          .update({
            status: 'failed',
            error_message: transactionInvoiceError.message,
            processed_at: new Date().toISOString(),
          })
          .eq('id', claimedEvent.id)
        return json({ error: 'recurring_invoice_lookup_failed' }, 500)
      }
      invoice = transactionInvoice as RecurringInvoice | null
    }

    if (!invoice) {
      const { data: pendingInvoice, error: pendingInvoiceError } = await supabase!
        .from('subscription_invoices')
        .select('id, invoice_number, payment_attempt_count, status')
        .eq('subscription_id', subscription.id)
        .in('status', ['open', 'processing', 'failed'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (pendingInvoiceError) {
        await supabase!
          .from('valor_recurring_webhook_events')
          .update({
            status: 'failed',
            error_message: pendingInvoiceError.message,
            processed_at: new Date().toISOString(),
          })
          .eq('id', claimedEvent.id)
        return json({ error: 'recurring_invoice_lookup_failed' }, 500)
      }
      invoice = pendingInvoice as RecurringInvoice | null
    }

    // The monthly invoice job and Valor can run within the same minute. If
    // Valor wins that race, create the due invoice before applying the event so
    // every charge/failure has a durable invoice and notification trail.
    if (!invoice) {
      const today = new Date().toISOString().slice(0, 10)
      if (subscription.next_billing_date && subscription.next_billing_date <= today) {
        const { data: generatedInvoiceId, error: generationError } = await supabase!.rpc(
          'generate_subscription_invoice',
          {
            p_subscription_id: subscription.id,
            p_due_date: subscription.next_billing_date,
          },
        )

        if (!generationError && generatedInvoiceId) {
          const { data: generatedInvoice, error: generatedInvoiceError } = await supabase!
            .from('subscription_invoices')
            .select('id, invoice_number, payment_attempt_count, status')
            .eq('id', generatedInvoiceId as string)
            .single()
          if (!generatedInvoiceError) {
            invoice = generatedInvoice as RecurringInvoice
          }
        } else {
          // A concurrent invoice job may have inserted the same period first.
          const { data: racedInvoice } = await supabase!
            .from('subscription_invoices')
            .select('id, invoice_number, payment_attempt_count, status')
            .eq('subscription_id', subscription.id)
            .in('status', ['open', 'processing', 'failed'])
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          invoice = racedInvoice as RecurringInvoice | null
        }
      }
    }

    if (!invoice) {
      const missingInvoiceMessage =
        'No due subscription invoice exists for this recurring Valor event.'
      await supabase!
        .from('valor_recurring_webhook_events')
        .update({
          merchant_subscription_id: subscription.id,
          status: 'failed',
          error_message: missingInvoiceMessage,
          processed_at: new Date().toISOString(),
        })
        .eq('id', claimedEvent.id)
      await logEvent('error', true, 500, {
        epi,
        detail: 'recurring_invoice_missing',
        raw: payload,
      })
      return json({ error: 'recurring_invoice_missing' }, 500)
    }

    const now = new Date().toISOString()
    const attemptCount = Number(invoice?.payment_attempt_count || 0) + 1

    // A redelivery may use a new webhook timestamp and therefore a different
    // event key. The processor transaction remains the business idempotency
    // key, so never apply an already-paid transaction a second time.
    if (invoice.status === 'paid') {
      await supabase!
        .from('valor_recurring_webhook_events')
        .update({
          merchant_subscription_id: subscription.id,
          subscription_invoice_id: invoice.id,
          status: 'processed',
          processed_at: now,
        })
        .eq('id', claimedEvent.id)
      return json({ ok: true, recurring: true, duplicate: true }, 200)
    }

    if (isSuccess) {
      if (invoice) {
        const { error: invoiceUpdateError } = await supabase!
          .from('subscription_invoices')
          .update({
            status: 'paid',
            paid_at: now,
            processor: 'valor',
            processor_account_id: subscription.processor_account_id,
            processor_transaction_id: transactionId || null,
            processor_response: payload,
            payment_attempt_count: attemptCount,
            last_payment_attempt_at: now,
            last_payment_error: null,
            next_retry_at: null,
            retry_exhausted_at: null,
            updated_at: now,
          })
          .eq('id', invoice.id)
        if (invoiceUpdateError) {
          await supabase!
            .from('valor_recurring_webhook_events')
            .update({
              status: 'failed',
              error_message: invoiceUpdateError.message,
              processed_at: now,
            })
            .eq('id', claimedEvent.id)
          return json({ error: 'recurring_invoice_update_failed' }, 500)
        }
      }

      await supabase!
        .from('merchant_subscriptions')
        .update({
          status: 'active',
          processor_subscription_status: 'active',
          grace_period_ends_at: null,
          grace_reason: null,
          updated_at: now,
        })
        .eq('id', subscription.id)
        .neq('status', 'canceled')

      if (['past_due', 'suspended'].includes(subscription.status)) {
        await supabase!.rpc('log_subscription_billing_event', {
          p_action: 'subscription_restored',
          p_merchant_id: subscription.merchant_id,
          p_location_id: subscription.location_id,
          p_resource_type: 'merchant_subscription',
          p_resource_name: invoice?.invoice_number || subscriptionId,
          p_resource_id: subscription.id,
          p_changes: { restored_by_valor_webhook: true },
          p_metadata: { processor: 'valor', transaction_id: transactionId || null },
        })
      }
    } else {
      if (invoice) {
        await supabase!
          .from('subscription_invoices')
          .update({
            status: 'failed',
            processor: 'valor',
            processor_account_id: subscription.processor_account_id,
            processor_transaction_id: transactionId || null,
            processor_response: payload,
            payment_attempt_count: attemptCount,
            last_payment_attempt_at: now,
            last_payment_error: failureMessage,
            next_retry_at: null,
            updated_at: now,
          })
          .eq('id', invoice.id)
      }
      await supabase!
        .from('merchant_subscriptions')
        .update({
          status: 'past_due',
          processor_subscription_status: 'payment_failed',
          updated_at: now,
        })
        .eq('id', subscription.id)
        .neq('status', 'canceled')

      if (invoice) {
        runInBackground(
          notifySubscriptionPaymentFailure({
            supabase: supabase!,
            invoiceId: invoice.id,
            paymentAttemptCount: attemptCount,
            failureMessage,
          }),
        )
      }
    }

    await supabase!.rpc('log_subscription_billing_event', {
      p_action: isSuccess ? 'invoice_charged' : 'invoice_payment_failed',
      p_merchant_id: subscription.merchant_id,
      p_location_id: subscription.location_id,
      p_resource_type: invoice ? 'subscription_invoice' : 'merchant_subscription',
      p_resource_name: invoice?.invoice_number || subscriptionId,
      p_resource_id: invoice?.id || subscription.id,
      p_changes: { status: isSuccess ? 'paid' : 'failed' },
      p_metadata: {
        source: 'valor-webhook',
        processor: 'valor',
        processor_subscription_id: subscriptionId,
        processor_transaction_id: transactionId || null,
      },
      p_status: isSuccess ? 'success' : 'failed',
      p_error_message: isFailure ? failureMessage : null,
    })

    await supabase!
      .from('valor_recurring_webhook_events')
      .update({
        merchant_subscription_id: subscription.id,
        subscription_invoice_id: invoice?.id || null,
        status: 'processed',
        processed_at: now,
      })
      .eq('id', claimedEvent.id)
    await logEvent('processed', true, 200, {
      epi,
      detail: isSuccess ? 'recurring_payment_succeeded' : 'recurring_payment_failed',
      raw: payload,
    })

    return json({ ok: true, recurring: true, status: isSuccess ? 'paid' : 'failed' }, 200)
  }

  const { data: result, error } = await supabase!.rpc('record_valor_batch_webhook', {
    p_payload: payload,
  })

  if (error) {
    console.error('[valor-webhook] record_valor_batch_webhook failed', error)
    await logEvent('error', true, 500, { epi, batchNo, detail: error.message, raw: payload })
    // 500 => Valor retries (idempotency-protected).
    return json({ error: 'record_failed', detail: error.message }, 500)
  }

  // Map the RPC result to a log outcome.
  const r = (result ?? {}) as {
    ok?: boolean; reason?: string; status?: string; batch_uuid?: string
  }
  const outcome =
    r.ok === false ? 'dead_letter' : r.status === 'needs_review' ? 'needs_review' : 'processed'
  await logEvent(outcome, true, 200, {
    epi,
    batchNo,
    batchUuid: r.batch_uuid ?? null,
    detail: r.reason ?? r.status ?? null,
    raw: payload,
  })

  return json({ ok: true, result }, 200)
})
