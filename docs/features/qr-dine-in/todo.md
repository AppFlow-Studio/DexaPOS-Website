# QR Table Ordering — Track B Implementation Plan (Ali Awdi)

> **Scope:** Edge function integration + Guest Storefront + Merchant Dashboard.
> **Out of scope (Track A — Dika):** SQL schema, RPCs, POS tablet, QA scripts.
> **Ground truth:** PDF handoff `HANDOFF-2026-05-24-QR-TRACK-B-CREATE-ONLINE-ORDER.pdf` + task scope.
> **Working assumption:** Dika's Track A foundation (schema, `resolve_table_qr`, status RPC, guest-alert RPCs, pricing math, billing gate) lands on staging before we hit each dependent phase. Each phase calls out what it cannot start without.

---

## Architecture invariants (must hold across every ticket)

These are non-negotiable. If a design decision contradicts these, stop and re-plan.

1. **Pay-before-kitchen, single payer per order.** Payment is *captured* before the order ever reaches the kitchen. No shared cart, no settle-later, no unpaid check.
2. **No `table_sessions` involvement.** `orders.session_id` stays NULL for QR. The order is "dine-in by name only" — labeled `qr_dine_in`, with `orders.table_number` set from the scanned table.
3. **Re-scan = brand-new independent paid order.** No round/merge concept. `qr_consolidate_rounds` was dropped — never reference it.
4. **Captured-price snapshot (D4).** Every line price is snapshotted onto the order at creation. Later menu edits never alter a placed order.
5. **Customer dedupe on E.164 phone (D5).** Existing phone → update. New phone → insert. Never duplicate.
6. **No cash-in-store for QR.** `pay_cash_in_store=true` with a QR-bound session must be rejected.
7. **Idempotency via `_idempotency_claim`.** Reuse, do not invent a new column.
8. **Pricing/tax math owned by Dika's QR-30.** Call it / honor it. Do not re-derive.
9. **Visual law (storefront + dashboard):** flat, zero gradients, zero shadows, one accent. Brand blue `#0C4FD1` — never the teal `#2DD4BF` default.
10. **Engine-reuse mandate:** architect the table-bound storefront so the kiosk/app can reuse the same engine later.

---

## Phase 0 — Do immediately (no dependencies)

### ☑ QR-32 — Payment-domain whitelist (DONE)
**Why first:** NMI Collect.js refuses to tokenize from a non-whitelisted origin. Classic launch-day failure.

**What we found:**
The existing `syncStorefrontWhitelist` already computed origins from slug + `custom_domain` + `NEXT_PUBLIC_APP_URL` + defaults, and ran on every HQ save/toggle. The QR scan route `/s/{slug}/t/{token}` is path-based on the same storefront origin — so origin-wise, QR scans inherit coverage automatically. What was missing was the **operational layer**: a way to (a) bulk-sync existing locations whose `whitelist_origins` predated the current logic, and (b) audit which locations still need NMI portal registration before QR launch.

**What landed:**
- [lib/payments/storefront-whitelist.ts](../../../lib/payments/storefront-whitelist.ts) — extracted the sync logic into a pure module. Exports `computeStorefrontOrigins`, `syncStorefrontWhitelistForLocation`, `bulkSyncStorefrontWhitelist`, `auditStorefrontWhitelist`.
- [app/manage/actions/admin-merchant/online-ordering.ts](../../../app/manage/actions/admin-merchant/online-ordering.ts) — refactored to import from the new module. Behaviour unchanged, ~140 LOC of duplication removed. `StorefrontWhitelistSyncResult` re-exported for any callers.
- [scripts/audit-storefront-whitelist.ts](../../../scripts/audit-storefront-whitelist.ts) — read-only ops report. Lists every location with `status: 'needs_sync'` / `'no_device'` / `'up_to_date'`, prints exactly what to paste into the NMI portal. Supports `--merchant`, `--json`.
- [scripts/backfill-storefront-whitelist.ts](../../../scripts/backfill-storefront-whitelist.ts) — idempotent bulk sync. Supports `--merchant`, `--dry-run`. Re-runnable safely.
- [docs/features/online-ordering/RUNBOOK-PAYMENT-WHITELIST-SYNC.md](../online-ordering/RUNBOOK-PAYMENT-WHITELIST-SYNC.md) — added QR-32 trigger + the two scripts to the runbook.

**Acceptance:**
- [x] `npx tsx scripts/audit-storefront-whitelist.ts` runs against staging — reports a clean baseline OR a concrete list of locations needing action.
- [x] `npx tsx scripts/backfill-storefront-whitelist.ts --dry-run` followed by the real run leaves audit clean.
- [x] Ops registers any newly-listed origins in the NMI portal per the runbook.
- [x] NMI Collect.js loads and a real $0.01 charge succeeds from the QR domain on staging.

---

## Phase 1 — Edge function layer

> **Dika deps:** QR-1 schema (`qr_scan_events`, `online_order_sessions` QR columns, `online_store_config.qr_*` columns), QR-30 pricing math, QR-2b guest-alert RPCs.

### ☐ QR-6 verification (Dika authored — we verify on staging)
**Status:** Dika claims complete locally. Must be staging-verified before downstream tickets are credible.

**Verify on staging (`dfwqakoyittmrwbqvxgw`):**
- [ ] QR-bound checkout creates `orders` row with `order_type='qr_dine_in'`.
- [ ] `orders.table_number` matches the scanned label.
- [ ] `orders.online_session_id` is set; `orders.session_id` is NULL.
- [ ] `online_order_sessions.order_type` remains `pickup|delivery` (legacy CHECK constraint preserved per the PDF's §8).
- [ ] Customer deduped on E.164 phone — confirmed by re-running checkout with same phone.
- [ ] `qr_service_fee_pct` from `online_store_config` shows on the order as a disclosed surcharge.
- [ ] `pay_cash_in_store=true` is rejected on a QR session.
- [ ] Captured-price snapshot intact after a post-checkout menu price edit.

### ☐ QR-7 verification (Dika authored — we verify on staging)
- [ ] `auto_accept_orders=true` → `accept_online_order(order_id)` fires after capture.
- [ ] `auto_accept_orders=false` → order stays `pending` for the POS "Incoming QR" tray.
- [ ] Declined card → no `orders` row duplicated, no kitchen fire, same idempotency key safely retryable.

### ☐ QR-9 — Funnel event emission
**File:** `supabase/functions/create-online-order/index.ts` + storefront call sites.

**Steps:**
1. Define a tiny `recordScanEvent(sessionId, stage, metadata)` helper that inserts into `qr_scan_events`.
2. From the storefront, emit `menu_viewed` on first menu render and `cart_started` on first add-to-cart (one per session, idempotent on `session_token + stage`).
3. In the edge function, emit `checkout` when validation passes and `paid` after `accept_online_order` (or after capture if auto-accept is off).
4. Never fail the order on a funnel-write error — wrap in try/catch, log via `logError` only.
5. (`scanned` is emitted by Dika's QR-2 — we do not touch it.)

**Acceptance:**
- [ ] A successful QR purchase yields one row per stage in `qr_scan_events` for the session.
- [ ] Failing the funnel insert does not break checkout (forced-fail test passes).

### ☐ QR-25 — Digital receipt on paid QR order
**File:** `supabase/functions/create-online-order/index.ts` (post-capture hook) + reuse `send-receipt` edge function.

**Steps:**
1. After `accept_online_order` (or after capture if auto-accept off), invoke `send-receipt` for the order.
2. Read delivery prefs from `online_store_config.notification_prefs` and `online_order_sessions.customer_email_opt_in` / `customer_sms_opt_in`.
3. Suppress channels the guest declined; never send to a missing destination.
4. Idempotent: re-firing `send-receipt` for the same order_id must not duplicate (rely on existing `send-receipt` dedup or add a `receipts_sent` flag if missing).

**Acceptance:**
- [ ] Paid QR order delivers email + SMS per opt-in flags.
- [ ] Opt-out flag silences the corresponding channel.
- [ ] Manual re-invoke of the function does not double-send.

### ☐ QR-9c — Guest-alert broadcast wiring
**Dep:** Dika QR-2b (`raise_qr_guest_alert`, `resolve_qr_guest_alert`).

**Steps:**
1. Confirm Dika's RPCs publish on the same lightweight broadcast channel the Live Orders kanban + KDS already subscribe to.
2. Verify payload shape: `{ alert_id, table_label, alert_type, message, created_at, status }` — must let the bell + sheet render without a refetch.
3. Expose a cheap open-alert count query (RPC or view) for the poll fallback when realtime is unavailable.
4. `qr_guest_alerts.status` remains source of truth — broadcast is a notification, not state.

**Acceptance:**
- [ ] Raising an alert pushes a live increment to Order Line + KDS in a staging session.
- [ ] Resolving an alert pushes a live decrement.
- [ ] Poll fallback returns accurate open-alert count per location.

### ☐ QR-8 — Abandoned-cart QR tagging (P3)
**File:** `supabase/functions/process-abandoned-carts/index.ts`.

**Steps:**
1. Identify expired sessions where `table_qr_code_id IS NOT NULL` and no `orders` row was created.
2. Insert `qr_scan_events(stage='abandoned')` once per session.
3. No kitchen impact, no order side effects.

**Acceptance:**
- [ ] Expired QR sessions land in the funnel as `abandoned`.
- [ ] Re-running the sweep does not double-write.

---

## Phase 2 — Guest Storefront

> **Critical precondition:** the Online Ordering Premium Visual Pass (Pre-Charcoal) storefront must be solid before P1 storefront work begins.
> **Dika deps:** QR-2 (`resolve_table_qr`), QR-4 + QR-24 (status RPC + Realtime channel), QR-2b (alert RPCs).

### ☐ QR-26 — Routing + custom-domain fix
**Files:** new route `app/sites/[slug]/t/[token]/page.tsx`; refactor `getStoreUrl()` in storefront `lib/`.

**Steps:**
1. Add route `/s/{slug}/t/{token}`. On load, call `resolve_table_qr(token)` and hydrate the table-bound store context.
2. Make the route work identically under `custom_domain` (middleware already supports `custom_domain` lookup; verify and extend if needed).
3. Replace the hardcoded host in `getStoreUrl()` with `request headers → custom_domain → slug fallback` resolution.
4. Add Open Graph + Apple deep-link meta so a future native app can intercept the URL.

**Acceptance:**
- [ ] Scan resolves on both default slug domain and `custom_domain`.
- [ ] No hardcoded host remains in `getStoreUrl()` (grep clean).
- [ ] Web is the guaranteed fallback when no app is installed.

### ☐ QR-10 — Table-bound storefront mode
**Files:** new `app/sites/[slug]/t/[token]/` tree; reuse `app/sites/[slug]/components/`.

**Steps:**
1. Top-of-page sticky banner: "Ordering for Table {label}" — brand blue `#0C4FD1`, flat, no shadow, no gradient. **Never teal.**
2. Suppress the pickup/delivery selector when the session is table-bound.
3. Lock the table — no UI to change it.
4. Persist `session_token` in a short-lived cookie + URL so a reload doesn't lose binding.
5. Engine-reuse: factor the table-bound mode into a context/provider so the same engine can drive a kiosk later.

**Acceptance:**
- [ ] Scan → branded menu with table locked.
- [ ] No fulfillment-type selector visible.
- [ ] Legible at minimum target phone width (375px).
- [ ] Banner color audit passes (no teal).

### ☐ QR-11 — QR checkout
**Files:** new `app/sites/[slug]/t/[token]/checkout/`; reuse `process-online-payment`.

**Steps:**
1. Form fields: name + phone (E.164), optional email.
2. Tip presets from `online_store_config.tip_presets` (default `[15,18,20,25]`).
3. Wire Apple Pay + Google Pay via existing Collect.js integration (must work because QR-32 whitelisted the origin).
4. Service-fee disclosure line — read `qr_service_fee_pct`.
5. Optional checkboxes: loyalty opt-in, SMS opt-in — persist to session.
6. Single primary "Pay" CTA, flat brand blue. No secondary fluff.
7. POST to `create-online-order` with the QR-bound `session_token`.

**Acceptance:**
- [ ] Captured-price totals match server-side calculation.
- [ ] Phone dedupe verified (re-checkout with same phone updates same customer).
- [ ] Apple/Google Pay buttons render and complete a charge on staging.
- [ ] Fee disclosure line visible.

### ☐ QR-12 — Live status + re-scan = fresh order
**Files:** new `app/sites/[slug]/t/[token]/status/[orderId]/`; subscribe to Dika's token-scoped Realtime channel.

**Steps:**
1. Staged progress UI: Received → Preparing → Ready / On its way.
2. Subscribe to Dika's QR-24 channel. On message, update local state.
3. Polling fallback: `get_qr_order_status` every 8–10s when websocket fails (use same back-off discipline as Live Orders kanban).
4. Receipt link resumes the status screen for the same order.
5. "Order again" CTA returns to the table-bound menu — re-scan path starts a fresh independent paid order (no merge logic).

**Acceptance:**
- [ ] Live transitions visible on staging without manual refresh.
- [ ] Polling fallback works on a WebSocket-blocked network (Chrome devtools blocked).
- [ ] Re-scan from the same table produces a second independent order with the same `table_number`.

### ☐ QR-12b — "Call your server" button
**Files:** add to the status screen — no new screen.

**Steps:**
1. Calm "Need help" button on status surface.
2. Tap → POST/RPC to `raise_qr_guest_alert(session_token, 'call_server', message?)`.
3. Confirmation toast: "A team member has been notified."
4. Local 60s cooldown — button disabled with countdown.
5. Network-failure path: optimistic retry once, then fail soft with a "Try again" affordance.

**Acceptance:**
- [ ] One tap raises exactly one alert (server-side `alert_key` dedup also enforces this).
- [ ] Cooldown prevents rapid re-fire.
- [ ] No alert is silently lost on a transient network blip.

### ☐ QR-13 — Closed / blocked / outside-hours / error states
**Files:** branch in `app/sites/[slug]/t/[token]/page.tsx` based on `resolve_table_qr` response.

**Steps:**
1. Cover: store closed, store inactive, location blocked, `qr_kill_switch=true`, `accepts_dine_in=false`, geofence reject, invalid/revoked token, expired session.
2. Each state = friendly screen with: clear next action + next-open time (when applicable). Never a raw error.
3. Add a non-blocking "Try again" affordance where it makes sense.

**Acceptance:**
- [ ] Every failure path renders a friendly screen — no stack trace, no "something went wrong" stub.
- [ ] Next-open time displayed for the closed state.

### ☐ QR-33 — A11y + i18n pass (P2)
**Steps:**
1. WCAG AA contrast audit on the full guest flow at 375px width.
2. Focus order + visible focus rings on every interactive control.
3. ARIA labels on the table banner, tip selector, pay button, alert button.
4. Wire the existing menu-language switch on the table-bound storefront.

**Acceptance:**
- [ ] axe-core scan: zero AA violations on scan, menu, checkout, status, alert.
- [ ] Language toggle works end-to-end.

---

## Phase 3 — Merchant Dashboard

> **Precondition:** Abubeckr's QR-20 UX spec landed (table banner, KDS band, QR Manager wireframes).
> **Dika deps:** QR-1 schema, QR-5 (HMAC token), QR-19 (billing tier gate).

### ☐ QR-14 — Settings → QR Table Ordering
**Files:** new section under `app/dashboard/online-ordering/` or `app/dashboard/settings/`.

**Steps:**
1. Form fields: `accepts_dine_in`, fulfillment mode (runner / counter), `qr_service_fee_pct`, geofence radius, `qr_kill_switch`.
2. **Reuse** existing `auto_accept_orders` + `delivery_pricing_enabled` controls — link to them, do not duplicate.
3. **Do not add** any consolidate-rounds control (column was dropped).
4. Tier-gate via Dika's QR-19 — show upgrade CTA if tier insufficient.
5. Server action under `app/dashboard/actions/` with `LogAuditEvent` on save.
6. Flat layout, brand blue accent — match Stripe/Linear/Ramp density.

**Acceptance:**
- [ ] All flags persist round-trip.
- [ ] Tier-gating verified for a non-eligible merchant.
- [ ] Audit log row created on each save.
- [ ] No duplicate controls for already-existing flags.

### ☐ QR-15 — QR Code Manager
**Files:** new page `app/dashboard/online-ordering/qr-codes/`.

**Dep:** Dika QR-5 (HMAC token signing) and the shared generate RPC — same path Dika's POS Print (QR-18) calls.

**Steps:**
1. List `floor_plan_objects` filtered by `category` (tables only), grouped by `section_id` / `zone_name`.
2. Each row: `name` / `label_override`, `capacity`, `is_active`, QR status, 7-day scan count, last scan time.
3. Actions: generate, regenerate (rotate token — warn "existing printed codes will stop working"), revoke, preview (renders the exact guest landing page in a sheet/modal).
4. Bulk: select multiple → bulk generate.
5. Per-table mini-analytics drawer: scan-to-order funnel for that table.
6. All mutations go through the same RPC POS Print uses — never client-only state.

**Acceptance:**
- [ ] Bulk generate creates one `table_qr_codes` row per selected table.
- [ ] Regenerate prompt blocks the irreversible action until confirmed.
- [ ] Preview matches what a real scan loads on staging.

### ☐ QR-16 — Print / download templates
**Files:** new server route or edge function under `app/dashboard/online-ordering/qr-codes/print/`.

**Steps:**
1. Templates: table tent (with fold lines), sticker, acrylic-stand insert.
2. Formats: print-ready PDF, PNG, SVG.
3. Branding toggle: DEXA-branded vs merchant-branded (header image + one accent only — locked).
4. Batch export → ZIP of selected tables.
5. **Render spec (hard):** ECC level Q, ≥4-module quiet zone, ≥0.8″ symbol at tabletop distance, 300 dpi PDF, high-contrast stock.
6. Use a server-side QR library (e.g. `qrcode`) — generate at request time, do not cache to a CDN with stale tokens.

**Acceptance:**
- [ ] PDF passes the render-spec checklist (manual print test on actual stock).
- [ ] Batch ZIP downloads cleanly with one file per table per format.
- [ ] Brand-vs-DEXA toggle visibly switches the layout.

### ☐ QR-17 — Live Orders QR badge
**Files:** extend the existing Live Orders kanban under `app/dashboard/orders/` (or wherever current kanban lives).

**Dep cleared:** Ali Jaffal's broadcast-hydration fix shipped — consume it as-is, do not re-implement.

**Steps:**
1. On order cards where `order_type='qr_dine_in'`, render a blue table badge showing `orders.table_number`.
2. Click the badge → opens the floor plan focused on that table.
3. Confirm payment row hydrates correctly via the existing lightweight broadcast (it should — that's the dep that shipped).
4. KDS / Order Line: ensure the QR-9c alert bell renders here.

**Acceptance:**
- [ ] QR orders show on kanban with payment row populated immediately (no manual refresh).
- [ ] Badge click navigates to floor plan focused on the table.
- [ ] Bell increments on `raise_qr_guest_alert`, decrements on resolve.

### ☐ QR-34 — QR Analytics dashboard (P3)
**Files:** new page under `app/dashboard/online-ordering/analytics/` for merchants; mirror under `app/manage/` for HQ/carrier.

**Dep:** QR-9 funnel events must be flowing first.

**Steps:**
1. Funnel viz: scan → menu_viewed → cart_started → checkout → paid → abandoned.
2. KPIs: AOV (QR vs server), table-turn lift, repeat-phone rate.
3. Peak heatmap by hour / day-of-week.
4. Top items by QR channel.
5. Modeled labor offset (formula spec'd by Dika or product — placeholder until provided).
6. Scope correctly: merchant sees own; carrier sees their merchants; HQ sees fleet.
7. Density: Stripe/Ramp-style flat metric cards.

**Acceptance:**
- [ ] All five funnel stages populate from `qr_scan_events` on staging.
- [ ] Carrier roll-up sums correctly across merchants in their book.
- [ ] HQ view shows fleet totals.

---

## Execution order (recommended)

1. **Phase 0 — QR-32 now.** No deps, biggest launch risk.
2. **Verify Dika's QR-6 / QR-7 on staging** the moment he deploys.
3. **QR-25** (digital receipt) — small, isolated, end-to-end win.
4. **QR-9** (funnel events) — unblocks QR-34 later.
5. **QR-9c** (alert broadcast wiring) — unblocks QR-12b storefront alert.
6. **QR-8** (abandoned-cart tagging) — quiet background.
7. Wait for Dika's QR-2 + QR-24 to land + the Pre-Charcoal storefront baseline to be solid. Then:
8. **QR-26 → QR-10 → QR-11 → QR-12 → QR-12b → QR-13 → QR-33.**
9. Wait for Dika's QR-5 + QR-19 + Abubeckr's QR-20 spec. Then:
10. **QR-14 → QR-15 → QR-16 → QR-17.**
11. **QR-34** last — depends on QR-9 funnel data accumulating.

---

## Risks & open questions

1. **PDF vs codebase mismatch.** None of Dika's claimed Track A work (migrations) or QR-6/QR-7 edits to `create-online-order/index.ts` is in the repo on any visible branch. Working assumption is "lands soon." If it does not, almost all of Phase 1+ is blocked. **Action:** confirm Dika's push status before starting QR-9 / QR-25.
2. **HMAC secret blocker (Dika QR-5).** Per the PDF, Dika is still waiting on Temur for the HMAC secret. Without it, QR-15 generate/regenerate is meaningless beyond a stub. **Action:** track the unblock; do QR-15 layout/list work first, gate the generate path behind a feature flag until QR-5 is real.
3. **`online_order_sessions.order_type` CHECK constraint.** Per the PDF's §8, the legacy `pickup|delivery` constraint is still live. The QR identity must ride on the `orders` row, not the session row. Any QR-related code that writes `qr_dine_in` to the session row will break checkout — must be caught in code review.
4. **Pre-Charcoal storefront readiness.** Phase 2 is gated on this. **Action:** confirm status before scheduling Phase 2 work.
5. **QR-20 spec (Abubeckr).** Phase 3 dashboard work is gated on this UX spec. **Action:** confirm spec exists before scheduling Phase 3.
6. **Modeled labor-offset formula (QR-34).** Not defined yet. **Action:** ask Dika / product before building the panel; ship the rest of the dashboard without it if needed.

---

## Review

(Filled in after execution — per CLAUDE.md "Document Results" rule.)
