# Wire-Up & Hardening — Support Counter, Notification Bells, Customer Marketing & Telnyx Message Ledger

> **Base branch:** this PR should target **`dexaposwebsite-preview`**, not `main`. The work depends on the preview integration branch; against `main` the diff is ~169 files of inherited history and is not reviewable. Against `dexaposwebsite-preview` it is the focused 24-file change described below.

## Summary

Consolidated "built but not wired up" pass across the HQ and Merchant surfaces. In each case the data model and RPCs largely existed — the gap was the connection between finished backend and live UI. Three interlocking workstreams:

- **Part A** — HQ support-ticket counter + notification bells (HQ + merchant)
- **Part B** — Customer marketing send/track/consent loop, hardened and de-Twilio'd
- **Part C** — Telnyx webhook + `message_log` ledger that A's notifications and B's consent flow depend on

Full spec, root-cause findings, acceptance criteria and QA matrices: [`tasks/wire-up-hardening-support-marketing-telnyx.md`](tasks/wire-up-hardening-support-marketing-telnyx.md).

Provider note: **SMS = Telnyx**, **email = Resend** (not Telnyx). The Telnyx ledger/webhook is SMS-only. Stale Twilio references on the marketing surface are removed in Part B.

---

## Part A — Support-Ticket Counter + Notification Bells  ✅ done & verified on staging

**Problem:** HQ "Support Tickets" Platform Pulse card read `0` despite live open tickets, and no notification fired on new tickets/replies on either side.

**Changes**
- Bind the HQ card to `get_support_dashboard_stats()->>'open_count'`; removed the placeholder `0` and the faked `0.0%` delta pill.
- Shared `NotificationBell` mounted in both layouts — HQ badge counts unread merchant messages (`read_by_admin=false`, excludes internal notes); merchant badge counts unread DEXA replies (`read_by_merchant=false`).
- New RPC `get_unread_ticket_counts()` (`SECURITY DEFINER`, role-aware, JWT-scoped).
- Added `support_tickets` + `support_ticket_messages` to the `supabase_realtime` publication (idempotent).
- Added JWT-based `is_dexapos_admin()` SELECT policies so HQ actually receives realtime (the admin RLS branch previously depended on a GUC that is null in the Realtime context).
- Housekeeping: fixed duplicated `search_path` on `get_support_dashboard_stats`.

**Key files:** `app/manage/actions/hq-platform/dashboard.ts`, `app/manage/components/PlatformPulseSection.tsx`, `components/notifications/NotificationBell.tsx`, `app/manage/layout.tsx`, `app/dashboard/layout.tsx`, `app/manage/actions/support.ts`, `app/dashboard/actions/support.ts`.
**Migrations:** `20260601120000_support_notifications_unread_counts_and_realtime.sql`, `20260601130000_support_tickets_hq_realtime_rls.sql`.

---

## Part B — Customer Marketing: wire up & harden Email + SMS

**Problem:** Marketing surface carried stale Twilio code, email was unproven, bulk sends untested, delivery status landed ~50% of the time, and the send path didn't provably enforce consent (only 2/44 customers opted in — a TCPA/CAN-SPAM exposure).

**Changes**
- Removed stale Twilio "Trial Account Limitation" banner / client references.
- Email channel parity (send path writes `marketing_recipients`, `channel='email'`).
- Bulk campaign pipeline: audience resolution → expand to recipients → per-channel send → status + counters.
- **Hard consent gate** — excludes `marketing_unsubscribed_at IS NOT NULL`, requires per-channel opt-in; skipped recipients logged `not_opted_in` (never silently dropped). Reads consent state maintained by Part C.
- Delivery/engagement tracking wired to roll up `marketing_campaigns.total_*` (closes the 8/16 delivery gap, backed by the Part C ledger).
- Unsubscribe loop: `/api/marketing/unsubscribe` route + SMS STOP (Part C).
- Hardened RPCs (`SECURITY DEFINER`, `search_path='public','pg_temp'`, merchant-isolated).

**Key files:** `app/dashboard/actions/marketing.ts`, `app/api/marketing/unsubscribe/route.ts`, `app/dashboard/customers/components/tabs/MarketingTab.tsx`, `app/dashboard/customers/hooks/useCustomerMarketing.ts`, `lib/messaging/resend.ts`.
**Migration:** `20260601140000_marketing_hardened_rpcs.sql`.

---

## Part C — Telnyx Webhook + Message Ledger  ⚠️ code-complete; migration not yet applied

**Problem:** No persistent record of any message sent/received. Without a ledger, STOP/START opt-out can't be honored reliably and there's no delivery audit trail.

**Changes**
- `message_log` table (+ RLS, indexes, `updated_at` trigger), unique on `telnyx_message_id` (idempotency).
- `record_telnyx_message(jsonb)` webhook writer (idempotent, recipient rollup, STOP/START), `log_outbound_message(...)` send-time writer, `phone_last10()` helper.
- Edge function `telnyx-webhook`: **Ed25519 signature verify before parse** (`telnyx-signature-ed25519` + `telnyx-timestamp`, 300s tolerance) → service-role `record_telnyx_message` → fast 2xx; bad/missing/stale signature → 401, writes nothing.
- Outbound wiring at send time via `logOutboundMessage`: marketing campaigns + quick message, waitlist, reservation confirm/cancel. Campaign rows carry `recipient_id` so `message.finalized` rolls up into `marketing_recipients`/`marketing_campaigns`.

**Key files:** `supabase/functions/telnyx-webhook/index.ts` (+ `deno.json`, `supabase/config.toml`), `lib/messaging/message-log.ts`, `app/actions/notifications/waitlist.ts`, `app/actions/notifications/reservation.ts`.
**Migration:** `20260603000000_message_log_ledger_and_telnyx_rpcs.sql`.

---

## ⚠️ Reviewer notes / not-yet-live

- **Part C migration `20260603000000` is NOT applied.** Supabase MCP is read-only; apply via SQL-editor paste → `supabase migration repair --status applied 20260603000000` (per the chain convention — **not** `db push`).
- **Blocked on Temur / ops** before Part C can be verified live:
  - `TELNYX_PUBLIC_KEY` env (Mission Control → Keys & Credentials)
  - Messaging-profile webhook URL → `…/functions/v1/telnyx-webhook` (+ optional failover)
  - Email sender SPF/DKIM (Resend)
- Email engagement is a **Resend** path, separate from the Telnyx SMS ledger.

## Test plan

See the QA matrices in the spec doc for each part. Highlights:
- **A:** submit a test ticket → HQ card increments; admin bell increments on merchant reply within seconds (no refresh); merchant bell increments on DEXA reply, clears on open; counts survive hard refresh.
- **B:** quick email to consented customer delivers + logs `delivered`; bulk tag campaign skips opted-out customer with counts reconciling; unsubscribe blocks a subsequent send; no Twilio references remain; cross-merchant RLS holds.
- **C:** send→reply produces one `outbound` + one `inbound` row; duplicate event id creates no duplicate; STOP stamps `marketing_unsubscribed_at` and blocks re-send, START re-enables; forged/unsigned webhook → 4xx, nothing written.

## Files changed (24)

Support/notifications, marketing, Telnyx ledger across `app/`, `components/`, `lib/`, `supabase/` — see the diff. Four migrations: `20260601120000`, `20260601130000`, `20260601140000`, `20260603000000`.
