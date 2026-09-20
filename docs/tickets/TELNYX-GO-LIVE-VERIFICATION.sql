-- READ ONLY. Run each statement separately; multi-statement tools may show only
-- the final result. Use staging first. Replace current_date with the recorded
-- QA run start for evidence capture. Do not store query output containing PII
-- in a public PR. Never repair an accepted message by sending it again.

-- Fresh messages and delivery metadata (open a selected raw payload only in the
-- authorized support interface; OTP values must be redacted).
SELECT m.id, m.created_at, m.updated_at, mer.name AS merchant, m.merchant_id,
       m.customer_id, m.telnyx_message_id, m.direction, m.status, m.error_code,
       m.cost, m.from_number, m.to_number, m.messaging_profile_id,
       m.raw IS NOT NULL AS webhook_touched
FROM public.message_log m
LEFT JOIN public.merchants mer ON mer.id = m.merchant_id
WHERE m.channel = 'sms' AND m.created_at >= current_date
ORDER BY m.created_at DESC;

-- Webhook liveness, without mistaking send-time metadata for callbacks.
SELECT count(*) FILTER (WHERE raw IS NOT NULL) AS webhook_touched,
       count(*) FILTER (WHERE status = 'delivered') AS delivered,
       count(*) FILTER (WHERE direction = 'inbound') AS inbound,
       max(updated_at) FILTER (WHERE raw IS NOT NULL) AS last_webhook
FROM public.message_log WHERE channel = 'sms';

-- Must be zero after the full test run, not just before it.
SELECT count(*) AS unattributed_outbound
FROM public.message_log WHERE direction = 'outbound' AND merchant_id IS NULL;

-- Provider ID/merchant equality for online-order sends.
SELECT o.provider_id, o.merchant_id AS order_merchant,
       m.merchant_id AS ledger_merchant, m.id AS ledger_id, m.status
FROM public.order_notifications o
LEFT JOIN public.message_log m ON m.telnyx_message_id = o.provider_id
WHERE o.channel = 'sms' AND o.status = 'sent'
ORDER BY o.sent_at DESC;

-- Explicit missing-ledger count. Historical gaps need repair, not SMS resend.
SELECT count(*) AS accepted_orders_missing_ledger
FROM public.order_notifications o
WHERE o.channel = 'sms' AND o.status = 'sent' AND o.provider_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.message_log m WHERE m.telnyx_message_id = o.provider_id);

-- Duplicate callback/provider IDs must produce no rows here.
SELECT telnyx_message_id, count(*)
FROM public.message_log WHERE telnyx_message_id IS NOT NULL
GROUP BY telnyx_message_id HAVING count(*) > 1;

-- Verify consent for the test customer via its inbound linkage, and compare
-- the same phone under the second merchant separately using an approved session.
SELECT m.id AS message_id, m.merchant_id, m.customer_id, c.sms_opt_in,
       c.marketing_unsubscribed_at, c.sms_opt_in_at, c.sms_consent_event_at
FROM public.message_log m
JOIN public.customers c ON c.id = m.customer_id AND c.merchant_id = m.merchant_id
WHERE m.direction = 'inbound' AND m.created_at >= current_date
ORDER BY m.created_at DESC;

-- Failed callbacks vs accepted-send recovery have different sources.
SELECT id, source, external_event_id, event_type, status, retry_count,
       created_at, resolved_at, error_message
FROM public.webhook_dead_letter_queue
WHERE source IN ('telnyx', 'telnyx_outbound')
ORDER BY created_at DESC;

-- Sender history must not assert delivery before the final callback.
SELECT m.id, m.telnyx_message_id, m.status AS ledger_status,
       r.status AS recipient_status, r.delivered_at
FROM public.message_log m JOIN public.marketing_recipients r ON r.id = m.recipient_id
WHERE m.channel = 'sms' AND m.created_at >= current_date;

-- Stuck accepted messages. Presence alone does not prove a provider failure.
SELECT id, merchant_id, telnyx_message_id, created_at
FROM public.message_log WHERE direction = 'outbound' AND channel = 'sms'
  AND status = 'sent' AND created_at < now() - interval '1 hour';

-- OTP leakage detector; returns counts only, never verification values.
SELECT count(*) FILTER (WHERE body ~* 'verification code is [0-9]+') AS body_leaks,
       count(*) FILTER (WHERE raw::text ~* 'verification code is [0-9]+') AS callback_leaks
FROM public.message_log WHERE created_at >= current_date;

SELECT count(*) AS recovery_otp_leaks
FROM public.webhook_dead_letter_queue
WHERE source IN ('telnyx', 'telnyx_outbound') AND created_at >= current_date
  AND raw_payload::text ~* 'verification code is [0-9]+';

-- Real-JWT RLS verification must be performed through the authenticated client
-- for merchant B, requesting a known merchant A row. Expect [] and no insert/
-- update/RPC privilege. A SQL-editor service-role query cannot establish this.
