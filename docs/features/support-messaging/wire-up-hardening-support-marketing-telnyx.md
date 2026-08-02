# Wire-Up & Hardening — Support Counter, Notification Bell, Customer Marketing (Telnyx Email + SMS)

## Overview

A consolidated wire-up ticket for the "built but not wired up" class across the HQ and Merchant surfaces. In each case the data model and RPCs largely exist — what's missing is the connection between finished backend and live UI. Three interlocking workstreams: (A) the HQ support-ticket counter + notification bell, (B) the customer-marketing send/track/consent loop, and (C) the Telnyx webhook + message ledger that A's notifications and B's consent flow both depend on.

All findings verified against staging `dfwqakoyittmrwbqvxgw`. Provider is **Telnyx** for both SMS and email (the UI still shows stale Twilio references — those get removed in Part B).

> **Owner:** Ali Awdi — sole owner, all parts. Net-new schema (Part C) and the Realtime publication change (Part A) run through the migration chain (SQL editor paste → `migration repair --status applied`, **not** `db push`).
>

---

## Part A — Support-Ticket Counter + Notification Bell

### Problem statement

Two symptoms, one root cause. The HQ "Support Tickets" Platform Pulse card reads `0` while merchants have live open tickets (DEXA-00007, DEXA-00008). And no notification fires on either side — staff must manually open the Support tab to discover new tickets; merchants get no indicator when DEXA replies.

### Root-cause findings (verified)

- The card is **not** calling `get_support_dashboard_stats()`. That RPC exists, is `SECURITY DEFINER`, and returns correct data live (`open_count: 4` on staging). The card is bound to a placeholder `0` — a frontend data-binding gap, not a DB defect.
- The unread model is **already built**: `support_ticket_messages.read_by_merchant` and `.read_by_admin` exist. Missing: an unread-count RPC and the realtime transport.
- `support_tickets` and `support_ticket_messages` are **absent from the `supabase_realtime` publication**, so any `postgres_changes` subscription receives nothing.
- No general `notifications` table — the bell must be driven by realtime + an unread-count RPC.
- Minor: `get_support_dashboard_stats` has a duplicated `search_path` (`'public','public','pg_temp'`).

### Scope

> **Status: ✅ DONE** — all six items shipped & verified on staging `dfwqakoyittmrwbqvxgw` (2026-06-01).

- [x]
    1. Bind the HQ "Support Tickets" card to `get_support_dashboard_stats()` → `open_count`; remove the placeholder; the `0.0%` delta must be real or removed, not faked. — *card now reads `open_count`; faked `0.0%` pill removed via `hideChange` prop ([dashboard.ts](../../../app/manage/actions/hq-platform/dashboard.ts), [PlatformPulseSection.tsx](../../../app/manage/components/PlatformPulseSection.tsx)).*
- [x]
    1. Admin/HQ notification bell — badge counting unread merchant messages (`read_by_admin=false`, exclude `is_internal`); increments on new ticket / merchant reply, clears on read. — *required an extra fix: HQ realtime was filtered out because the admin RLS branch depends on the `app.dexa_hq_org_id` GUC (null in the Realtime context); added JWT-based `is_dexapos_admin()` SELECT policies in `20260601130000`.*
- [x]
    1. Merchant notification bell — badge counting unread DEXA replies (`read_by_merchant=false`); clears on ticket open.
- [x]
    1. New RPC `get_unread_ticket_counts()` — `SECURITY DEFINER`, `search_path='public','pg_temp'`, JWT-scoped; role-aware counts (HQ = all admin-side unread; merchant = own unread). — *role resolved via `is_dexapos_admin()` + `org_id` JWT claim (coalescing flat `org_id` and nested `org.id`).*
- [x]
    1. Realtime migration — add `support_tickets` + `support_ticket_messages` to `supabase_realtime` (idempotent wrap).
- [x]
    1. Housekeeping — fix the `get_support_dashboard_stats` search_path.

**Migrations:** `20260601120000_support_notifications_unread_counts_and_realtime.sql` (items 4/5/6) + `20260601130000_support_tickets_hq_realtime_rls.sql` (HQ realtime RLS).
**Shared UI:** `components/notifications/NotificationBell.tsx`, mounted in `app/manage/layout.tsx` + `app/dashboard/layout.tsx`; `GetUnreadTicketCounts` action added to both `support.ts` files.

### Acceptance criteria

- HQ card matches `get_support_dashboard_stats()->>'open_count'`; verified by submitting a test ticket and watching it increment.
- Admin bell increments within seconds of a merchant submit/reply, no refresh.
- Merchant bell increments on a DEXA reply, clears on open.
- `get_unread_ticket_counts()` returns correct role-scoped counts under both an HQ and a merchant JWT.
- Counts survive a hard refresh (RPC-backed, not local state); no console errors.

### QA matrix

| Scenario | HQ card | Admin bell | Merchant bell |
| --- | --- | --- | --- |
| Merchant submits new ticket | +1 | +1 | — |
| Merchant replies to open ticket | no change | +1 | — |
| DEXA admin replies | no change | — | +1 |
| Admin reads ticket | no change | clears that ticket | — |
| Merchant opens ticket | no change | — | clears that ticket |
| Internal note (`is_internal=true`) | no change | no change | no change |
| Hard refresh after reads | persists | persists | persists |

---

## Part B — Customer Marketing: wire up & harden Email + SMS

### Problem statement

The Customers page exposes a marketing surface — per-customer "Send Quick Message," "Create Campaign," opt-in/Unsubscribe controls, and Campaign History. The schema and consent model behind it are complete and one-off SMS delivers, but the surface still carries **stale Twilio code** (a "Twilio Trial" banner) from before the move to **Telnyx**, email is unproven end-to-end, bulk campaign sends are untested, delivery/engagement status lands only ~50% of the time, and there's no evidence the send path enforces consent.

### Root-cause / current-state findings (verified)

- `marketing_campaigns` + `marketing_recipients` exist and are populated (16 campaigns: 7 SMS / 9 email, all `sent`). Tables are not the gap.
- `marketing_recipients`: only **8/16** reached `delivered` → provider status callbacks aren't consistently updating recipients or the campaign rollup counters.
- No `*_campaign` / `send_*` / `unsubscribe_*` RPC in `public` — orchestration lives outside the DB, unaudited and unisolated.
- `customers` consent fields fully present (`sms_opt_in`, `email_opt_in`, `marketing_unsubscribed_at`, `*_opt_in_at`, `tags[]`); only **2/44** opted in, so an unfiltered blast is a TCPA/CAN-SPAM exposure.
- UI references **Twilio (trial)** — stale; the platform provider is **Telnyx** for both SMS and email. The leftover banner is itself proof the surface wasn't fully migrated.

### Scope

- [ ]
    1. **Provider correctness + cleanup** — confirm both SMS and email route through **Telnyx**; remove the stale Twilio "Trial Account Limitation" banner and any Twilio client references from the customer-marketing surface. Confirm Telnyx email sender domain auth (SPF/DKIM) is configured; flag to Temur if not.
- [ ]
    1. **Email channel parity** — wire the email send path end-to-end via Telnyx (send → write `marketing_recipients`, `channel='email'`). Email must be selectable wherever SMS is (quick message + campaign builder).
- [ ]
    1. **Bulk "Create Campaign" pipeline** — audience resolution (`audience_type` all / tags via `customers.tags` / `audience_filter` jsonb) → expand to `marketing_recipients` → send per channel → set `status` + `total_recipients`. Must handle multi-recipient (current data is 1:1; bulk untested).
- [ ]
    1. **Consent enforcement (hard gate)** — exclude `marketing_unsubscribed_at IS NOT NULL`; require `sms_opt_in=true` / `email_opt_in=true` per channel. Skipped recipients logged `error_message='not_opted_in'`, never silently dropped. Reads consent state maintained by Part C.
- [ ]
    1. **Delivery & engagement tracking** — wire Telnyx status callbacks (delivered/bounce for SMS; delivered/open/click/bounce for email) to update `marketing_recipients` timestamps + roll up `marketing_campaigns.total_delivered/opened/clicked/bounced`. Closes the 8/16 gap. Backed by the Part C message ledger.
- [ ]
    1. **Unsubscribe loop** — wire the "Unsubscribe" button + inbound SMS **STOP** to set `customers.marketing_unsubscribed_at` + flip the channel flag, stamp `marketing_recipients.unsubscribed_at`, increment `total_unsubscribed`. Email needs a one-click unsubscribe link/header. (STOP/START handled in Part C item 18.)
- [ ]
    1. **Hardened RPCs** (`SECURITY DEFINER`, `search_path='public','pg_temp'`, JWT-scoped, merchant-isolated): `create_marketing_campaign`, `send_marketing_campaign`, `record_marketing_result` (webhook writer), `unsubscribe_customer`. Mirror the existing waitlist-SMS RPC pattern.
- [ ]
    1. **Campaign History accuracy** — history reflects real per-recipient status, not just `sent`, so failed/blocked sends are visible to the merchant.

### Acceptance criteria

- A quick **Email** to a consented customer delivers via Telnyx and logs a `delivered` recipient row.
- A bulk tag-based campaign expands to N recipients, sends only to opted-in/non-unsubscribed customers, and `total_recipients`/`total_delivered` reconcile.
- An opted-out/unsubscribed customer is provably skipped (`not_opted_in`, no provider call).
- A Telnyx webhook moves a recipient `pending → sent → delivered` (and `bounced`/`failed`) without manual intervention; counters roll up.
- Unsubscribe (button + SMS STOP) stamps `marketing_unsubscribed_at`; future sends are blocked.
- No stale Twilio references remain on the surface.
- No PII/destination leaks across merchants (RLS verified under a second merchant's JWT).

### QA matrix

| Scenario | Expected |
| --- | --- |
| Quick SMS, opted-in | Delivered via Telnyx, recipient `delivered`, shown in history |
| Quick Email, opted-in | Delivered via Telnyx, recipient `delivered` |
| Send to `marketing_unsubscribed_at` set | Skipped, `not_opted_in`, no provider call |
| Send to `sms_opt_in=false` | Skipped on SMS channel |
| Bulk campaign, 3 tagged / 1 opted-out | 2 sent, 1 skipped, counts reconcile |
| Telnyx rejects invalid number | Surfaced as `failed` in history, not silent |
| Telnyx delivery webhook fires | Recipient + campaign counters update |
| Inbound SMS "STOP" | `marketing_unsubscribed_at` set, future sends blocked |
| Cross-merchant read attempt | Blocked by RLS |

---

## Part C — Telnyx Webhook + Message Ledger (inbound/outbound)

### Problem statement

There is no persistent record of any message sent or received. Outbound state today is just counters (`waitlist.notification_failures`, the `marketing_campaigns.total_*` rollups); inbound messages aren't captured anywhere. Without a webhook listener writing every message to the DB, opt-out (STOP) and opt-in (START) can't be honored reliably, delivery status can't be traced, and there's no audit trail when a merchant disputes "did this customer get the text."

### Findings (verified)

- No `messages` / `message_log` / inbound table exists on staging (checked `%message%`, `%inbound%`, `%outbound%`, `%log%`, `%telnyx%`).
- The one working SMS path (`record_waitlist_sms_result`) only bumps a failure counter; it does not store the message or its Telnyx ID.

### Telnyx contract (from docs — build to this exactly)

- **Events:** `message.received` (inbound), `message.sent` (accepted by carrier), `message.finalized` (terminal: delivered / failed). All share `{ data: { event_type, id, occurred_at, payload, record_type }, meta }`.
- **Key payload fields:** `payload.id` (Telnyx message ID), `payload.direction` (`inbound`/`outbound`), `payload.from.phone_number`, `payload.to[].phone_number` + per-recipient `status`, `payload.text`, `payload.messaging_profile_id`, `payload.errors[]`, `payload.cost`, `payload.completed_at`.
- **Security:** verify the **Ed25519** signature on `telnyx-signature-ed25519` + `telnyx-timestamp` headers against the Telnyx public key (Mission Control → Keys & Credentials → Public Key), with a 300s timestamp tolerance to block replays. **Verify before parsing.**
- **Ack rules:** return 2xx within ~2s or Telnyx retries (up to 3) then hits the failover URL. Do heavy work async; ack fast.
- **Idempotency:** Telnyx can deliver the same event more than once — dedupe on `data.id` (event id) and/or `payload.id`.
- **URL hierarchy:** per-message `webhook_url` → messaging-profile URL. Set the inbound/status URL on the **messaging profile** so all numbers route to one endpoint; optionally set a `webhook_failover_url`.

### Build status (2026-06-03 — Ali)

> **Code complete; awaiting manual migration apply + edge-function deploy + Telnyx ops creds (Temur) before live verification.**
>
> - Migration written: [`20260603000000_message_log_ledger_and_telnyx_rpcs.sql`](../../../supabase/migrations/20260603000000_message_log_ledger_and_telnyx_rpcs.sql) — `message_log` table (+ RLS, indexes, `updated_at` trigger), `record_telnyx_message(jsonb)` webhook writer (idempotent on `telnyx_message_id`, recipient rollup, STOP/START), `log_outbound_message(...)` send-time writer, `phone_last10()` helper. **Not yet applied** — Supabase MCP is read-only; apply via SQL editor paste → `supabase migration repair --status applied 20260603000000` (per the chain convention, not `db push`).
> - Webhook endpoint: [`supabase/functions/telnyx-webhook/index.ts`](../../../supabase/functions/telnyx-webhook/index.ts) (+ `deno.json`, `config.toml` entry). Ed25519 verify (`telnyx-signature-ed25519` + `telnyx-timestamp`, 300s tolerance) **before** parse; verifies → service-role `record_telnyx_message` → fast 2xx; bad/missing/stale sig → 401, writes nothing.
> - Outbound wiring (SMS) at send time via `logOutboundMessage` ([`lib/messaging/message-log.ts`](../../../lib/messaging/message-log.ts)): marketing campaigns (both send paths) + quick message ([`marketing.ts`](../../../app/dashboard/actions/marketing.ts)), waitlist ([`waitlist.ts`](../../../app/actions/notifications/waitlist.ts)), reservation confirm/cancel ([`reservation.ts`](../../../app/actions/notifications/reservation.ts)). Campaign/quick-message rows carry `recipient_id` so `message.finalized` rolls up into `marketing_recipients`/`marketing_campaigns` (closes the Part B 8/16 gap).
> - jsonb extraction + STOP/phone-match/status-mapping logic verified read-only against staging.
> - **Surprise (flag for Part B):** email sends route through **Resend**, not Telnyx — so the Telnyx ledger/webhook is SMS-only; email engagement is a separate provider path. Telnyx is **platform-shared** (no per-merchant config): outbound carries `merchant_id` at send time; inbound resolves merchant via customer phone.
> - **Blocked on Temur:** `TELNYX_PUBLIC_KEY` env (Mission Control → Keys & Credentials), messaging-profile webhook URL → `…/functions/v1/telnyx-webhook` (+ optional failover), email sender SPF/DKIM.

### Scope

- [ ]
    1. **New schema — message ledger** (net-new; coordinate the migration through the chain, not `db push`):
        - `message_log` — `id`, `merchant_id` (RLS tenant key), `customer_id` (nullable, resolved by phone), `telnyx_message_id` (unique — idempotency), `direction` (`inbound`/`outbound`), `channel`, `from_number`, `to_number`, `body`, `status`, `error_code`, `cost NUMERIC(12,4)`, `messaging_profile_id`, `campaign_id` (nullable FK → `marketing_campaigns`), `occurred_at`, `created_at`, plus `raw` jsonb for the full payload.
        - Unique constraint on `telnyx_message_id`; index on `(merchant_id, to_number)` and `(customer_id)`.
- [ ]
    1. **Webhook endpoint** (Edge Function / route) — Ed25519 verify → ack 2xx fast → enqueue/process → upsert into `message_log` on `telnyx_message_id` (idempotent).
- [ ]
    1. **Outbound wiring** — every send (marketing + waitlist + quick message) writes an `outbound` row at send time with the returned `telnyx_message_id`; `message.sent`/`message.finalized` then update that row's `status`/`cost`/`error_code` and roll up into `marketing_recipients` / `marketing_campaigns` (this is also how Part B item 11 closes the 8/16 delivery gap).
- [ ]
    1. **Inbound + STOP/START opt-out flow** — on `message.received`, resolve `customer_id` by `from_number` within merchant, store the row, then:
        - body matches **STOP / STOPALL / UNSUBSCRIBE / CANCEL / END / QUIT** → set `customers.marketing_unsubscribed_at = now()`, flip `sms_opt_in=false`;
        - body matches **START / UNSTOP / YES** → clear `marketing_unsubscribed_at`, set `sms_opt_in=true`, stamp `sms_opt_in_at`.
        - This is the system of record the Part B consent gate (item 10) and unsubscribe loop (item 12) read from.
- [ ]
    1. **RPC** `record_telnyx_message(p_payload jsonb)` — `SECURITY DEFINER`, `search_path='public','pg_temp'`, idempotent on `telnyx_message_id`; single writer used by the webhook so RLS/audit stay consistent. The webhook authenticates via signature, so this RPC is service-role-invoked, not JWT-scoped — note that distinction.

### Acceptance criteria

- Sending an SMS to my own phone, then replying, produces exactly two `message_log` rows (one `outbound`, one `inbound`) with correct `direction`, `telnyx_message_id`, and `body`.
- Re-delivering the same Telnyx event does **not** create a duplicate row (idempotency holds).
- Texting **STOP** sets `marketing_unsubscribed_at` and a subsequent campaign send skips that customer (`not_opted_in`); texting **START** re-enables.
- A forged/unsigned webhook (bad or missing `telnyx-signature-ed25519`) is rejected with 4xx and writes nothing.
- A `message.finalized` with `failed` updates the matching outbound row's `status`/`error_code`, visible in Campaign History.

### QA matrix

| Scenario | Expected |
| --- | --- |
| Outbound SMS sent | `outbound` row created with `telnyx_message_id`, status `sent` |
| `message.finalized` delivered | same row → `delivered`  • cost |
| `message.finalized` failed | same row → `failed`  • `error_code`, surfaced in history |
| Inbound reply | `inbound` row, `customer_id` resolved by phone |
| Inbound "STOP" | unsubscribe stamped, opt-in false, future sends blocked |
| Inbound "START" after STOP | re-subscribed |
| Duplicate event id redelivered | no duplicate row |
| Invalid signature | 4xx, nothing written |
| Stale timestamp (>300s) | rejected |
| Cross-merchant read of `message_log` | blocked by RLS |

---

## Dependencies (need from Temur / ops)

- **Telnyx public key** (Mission Control → Keys & Credentials → Public Key) for Ed25519 webhook verification.
- **Messaging-profile webhook URL** pointed at the new endpoint (+ optional failover URL).
- **Telnyx email sender domain auth** (SPF/DKIM) confirmed configured.

## Out of scope (whole ticket)

Email/SMS for support tickets, support ticket tags, canned responses, SLA tracking, carrier read-only view; new marketing campaign types (drip/automation), A/B testing, loyalty-triggered sends, marketing analytics beyond existing counters.

## Definition of Done

Screen recordings attached before any status flips to Done:

- **Part A:** HQ card reflecting a live count; admin bell incrementing on a fresh merchant ticket; merchant bell incrementing on a DEXA reply.
- **Part B:** a consented email delivering via Telnyx; a bulk tag campaign skipping an opted-out customer with counts reconciling; an unsubscribe blocking a subsequent send.
- **Part C:** a live round-trip (send → reply → STOP → blocked re-send), the resulting `message_log` rows, and a rejected forged webhook.
