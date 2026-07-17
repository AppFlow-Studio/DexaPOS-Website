# DEFECT (CONFIRMED): QR dine-in notifications not sending — internal notify env not wired on staging

**Area:** Notifications (QR-25) — BOTH placed/confirmation AND order-status emails/SMS
**Severity:** High — Day-1 defect to Awdi per deliverable #3. No guest notification is sending at all.
**Found:** 2026-07-15 QR dine-in E2E test on staging (`dfwqakoyittmrwbqvxgw`)
**Status:** CONFIRMED not sending. Tester received NEITHER a placed/confirmation email NOR a status email for real paid QR orders.

## What works

- **Order advance + live tracking:** advanced ORD-20260715-0001 (`429e1f8b`) `pending → sent_to_kitchen` via the real `accept_online_order` RPC; `get_qr_order_status` immediately reflected "Preparing". ✅ (On-screen tracking works; email/SMS do not.)

## What is BROKEN

Tester received **no confirmation/placed email** and **no status email** for the paid QR orders. Two separate code paths, but they share one root cause: the internal notification HTTP hop targets a DEPLOYED app URL that is either unset or not serving the route in this environment.

### Path 1 — placed/confirmation email (create-online-order edge fn)
`supabase/functions/create-online-order/index.ts` → `triggerOrderPlacedNotifications()` (line ~400) fetches `${getAppBaseUrl()}/api/internal/order-placed-notify`.
- `getAppBaseUrl()` (line 189) = edge env `NEXT_PUBLIC_APP_URL` (or `VERCEL_URL`), else **null**.
- If null OR `INTERNAL_NOTIFICATION_SECRET` missing → **silently skips** (line 404-410, log only).
- If fetch fails / non-OK → **silently swallowed** (line 423-432, log only).
- Guest ALWAYS sees checkout success regardless. This is why no confirmation email arrived.
- Note: `appBaseUrl` is the edge fn's env on STAGING — points at the deployed app, never localhost. Local LAN test cannot exercise it.

### Path 2 — status email (DB trigger) — same structural wall

## Notification chain (why it can't be verified locally)

1. Order status changes → row inserted into `order_status_history`.
2. Trigger `notify_order_status_change` (migration `20260507180200_...v2.sql`) fires.
3. Trigger gates on: `online_orders.provider='website'` for the order — **PASSES** (both QR orders have provider=website, verified).
4. Trigger gates on DB GUCs `app.notify_url` + `app.notify_secret` being non-empty — **UNKNOWN on staging** (GUCs not readable over REST).
5. If set, trigger does `net.http_post(app.notify_url, {order_id, event})` → this targets a **DEPLOYED app URL** (e.g. `https://dexapos.com/api/internal/order-status-notify`), **never the local dev server** the test runs against.
6. That route calls `sendOrderStatusNotifications` (Resend/Twilio).

So: the status email depends on staging having `app.notify_url` pointed at a live deployed app instance with `INTERNAL_NOTIFICATION_SECRET` matching. The local LAN test cannot exercise steps 5-6.

## Action items

- [ ] **Awdi/Temur — placed email:** confirm the `create-online-order` EDGE FUNCTION env on staging has `NEXT_PUBLIC_APP_URL` (or `VERCEL_URL`) pointing at a deployed app that serves `/api/internal/order-placed-notify`, and `INTERNAL_NOTIFICATION_SECRET` set + matching the app's env.
- [ ] **Awdi/Temur — status email:** confirm staging DB GUCs `app.notify_url` + `app.notify_secret` are set and point at the same deployed app's `/api/internal/order-status-notify`.
- [ ] Confirm `INTERNAL_NOTIFICATION_SECRET` matches across edge env, DB GUC, and app env.
- [ ] Consider hardening: both notify paths swallow failures silently (log-only). At minimum, surface skip/failure in a way ops can alert on — a paid order with no notification should not be invisible.
- [ ] Re-test against the DEPLOYED app (not local dev): one paid QR order sends exactly one confirmation, one status advance sends exactly one status update, each with correct order#, table label, tracking link.
- [ ] Verify opt-out suppresses the send.

## Note
Code paths and routes exist in repo; this is an **environment wiring** defect (deployed edge/DB notify config), aggravated by **silent-failure design** — every branch logs and returns, so a paid order with zero notifications looks identical to success. The local LAN test structurally cannot exercise these hops (they target the deployed app). Flagging per deliverable #3.
