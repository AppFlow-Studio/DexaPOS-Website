# SaaS Access, Add-on Authorization & Billing Recovery — Staging QA Report

- **PR:** #305 — "Complete SaaS access, add-on authorization, and billing recovery" (merged into `dexaposwebsite-preview`)
- **Related build doc:** [`SAAS-ADMIN-COMPLETION-2026-09-08.md`](./SAAS-ADMIN-COMPLETION-2026-09-08.md)
- **QA date:** 2026-09-08
- **Environment:** staging Supabase `dfwqakoyittmrwbqvxgw`, app on local dev server (`localhost:3000`) pointed at staging, Chrome (Personal Chrome, HQ super-admin session)
- **Method:** hybrid — DB access/entitlement contract verified via SQL against staging; UI + live edge-function flows driven through Chrome; edge functions exercised live (Valor sandbox).
- **Test subject:** `Joes Coffee Shop` — merchant `2add44cb-f498-4653-aca3-a8f0ca258e70`, org `org_34LN9aMJGO4jNllGTvHH4CLB5gq`, 5 locations, tier plan `multi_location` (Fine Dining).

## Verdict

**PR #305 access/entitlement, add-on-authorization, and notification logic is correct across every path exercised.** All 7 DB-contract items and 6 of the UI/live items pass. Two caveats: (1) approve **success/activation** could not be demonstrated live — blocked by an **external, pre-existing Valor issue (error A44, cross-host vault)**, not by PR #305 code; DEXA-side logic is verified correct up to and including the charge attempt and failure/decline handling. (2) **Billing bug found in invoice composition** (Finding #4): the location-scope invoice wrongly includes the $99 DEXA POS Base tier line — **locations must not be charged the base; only the merchant is** — so location invoices are over-charged by the base amount.

---

## Lane A — DB access & entitlement contract (SQL): 7/7 ✅

Verified via `get_subscription_access_state`, `get_subscription_entitlement`, `apply_subscription_access_state` under a `service_role` JWT claim. Joes baseline: 16 active stations / 4 active terminals across 5 locations.

| # | Item | Evidence | Result |
|---|------|----------|--------|
| A1 | `past_due` keeps access available (grace) | tier & location `past_due` → `allowed=true`, `access_status=past_due_grace`, correct grace timestamps, **0 stations/terminals disabled** (stayed 16/4) | ✅ |
| A2 | Merchant-tier suspend disables all locations | tier `suspended` + `apply_…` → **all 5 locations → 0** (16→0 stations, 4→0 terminals); metadata snapshot captured all 16 station + 4 terminal IDs; `subscription_suspended` | ✅ |
| A3 | Tier restore re-enables everything | tier `active` + `apply_…` → exact baseline restored (16/4, original per-location split); metadata state `restored` | ✅ |
| A4 | Location-service suspend isolates to one location | Uptown loc `suspended` + `apply_…` → **only Uptown offline** (9 st + 3 term → 0); Downtown Hamra/Ein l Mirasi/Joes Downtown untouched; merchant-wide access stays `active`, only `uptown` reports `location_suspended` | ✅ |
| A5 | Restore respects other suspended streams | tier suspended→restored **while Uptown loc still suspended** → other 3 locations came back (7 st/1 term), **Uptown stayed dark (0/0)** | ✅ |
| A6 | QR entitlement matrix | `qr_table_ordering` (requires `multi_location`): **direct assignment** (entitled via direct, plan=basic), **tier inclusion** (`included_by_plan`), **grace** (`past_due` still entitled), **tier suspension** (entitled=false despite direct assignment), **location suspension** (entitled=false / `location_suspended`); plus per-location isolation (unassigned location → "Service is not assigned to this location") | ✅ |
| A7 | Authorization evidence immutable + non-deletable | `UPDATE` of an authorization field → **BLOCKED** ("evidence is immutable"); `DELETE` → **BLOCKED** ("cannot be deleted"); review-field update (status/reviewer/note) → **succeeds** | ✅ |

Note on test mechanics: Joes' tier `merchant_subscription` was in a "billing-cutover-held" state (`billing_setup_required=true`, enforced by the `merchant_subscriptions_cutover_nonbillable` constraint + `guard_subscription_billing_scope` trigger). To exercise A1–A6 the flag was cleared using the intended escape hatch (`set_config('app.billing_scope_review', <sub_id>)`), the same mechanism `prepare_migrated_subscription` uses.

---

## Lane B — UI + live edge functions

| # | Item | Evidence | Result |
|---|------|----------|--------|
| B1 | Merchant add-on request + explicit-auth gate | Impersonated Joes → Subscription & Billing → Add-ons → Uptown → Loyalty. "Authorize paid add-on" dialog: **Send disabled until the authorization checkbox is checked**. Submitted → toast "ADD-000002 submitted for DEXA review". | ✅ |
| B2 | Authorization evidence captured | Row `ADD-000002`: subtotal $79 + surcharge $3.16 = **$82.16**, `monthly_recurring`, terms `merchant-addon-recurring-v1`, accepted+timestamp, **IP `::1`**, **user-agent**, unique ref `AUTH-3535DB29…`, full authorization text | ✅ |
| B3 | HQ in-app notification | `audience=hq`, `subscription_service_requested`, "Joes Coffee Shop requested a paid add-on … Loyalty Program for Uptown Branch at $82.16/month", deep link with `serviceRequest=…` | ✅ |
| B4 | HQ review UI + evidence display | `/manage/subscriptions/…` step 3 "Location Add-ons": pending request card, expandable evidence panel with all fields, decision note, Approve/Deny; "Add-on authorization history" section (permanent records) | ✅ |
| B5 | CSV export | "Export evidence" → downloaded `AUTH-3535DB29-…​.csv` (794 bytes), `Field,Value` CSV with the complete authorization record | ✅ |
| B6 | `past_due` warning banner (merchant) | Merchant Billing tab: yellow warning **"Outstanding balance: $6,239.01 — Update the saved card so DEXA Billing can automatically retry eligible invoices"** + "Review payment method"; tier shows **Past Due**; full dashboard remains accessible (access preserved during grace) | ✅ |
| B7 | Valor **decline** → assignments intact, request → pending | Live approve charged Valor → **declined (A44)**; invoice `SUB-202608-0004` → `failed`; request stayed **`pending`**, `applied_subscription_id=null`, **no Loyalty assignment created**, existing Uptown assignments intact; HQ + merchant `subscription_payment_failed` notifications fired | ✅ |
| B8 | Billing **recovery** → notifications + emails (idempotent) | `billing-mark-paid` on the failed invoice (sub set `past_due`) → sub → **active**, invoice → **paid**; HQ + merchant `subscription_restored` in-app notifications; **5/6 emails sent** (support@mtechdistributors.com, temur@appflowstudio.io, 3 gmail); re-fire kept in-app count at 2 (idempotent) with per-recipient delivery ledger | ✅ |
| B9 | Approve **success** → charge-before-activation | Order proven (invoice + charge attempted before any activation; activation correctly withheld on failure). **Full success/activation not demonstrated** — every charge on this vault is rejected by Valor A44. | ⚠️ blocked (external) |

---

## Findings

1. **[Infra — resolved during QA] Edge-function internal auth failed on a service-role key mismatch.**
   `billing-charge-subscription` / `billing-mark-paid` authorize via `isAuthorizedInternalBillingRequest`, which requires the `Bearer` token to string-equal the function's injected `SUPABASE_SERVICE_ROLE_KEY` (or an `x-internal-secret` = `INTERNAL_NOTIFICATION_SECRET`). The app sent the **legacy JWT** service-role key, but the deployed functions are injected the **new `sb_secret_…`** key (project has new API keys enabled) → HTTP 401 `Unauthorized`. `verify_jwt=false` is already set in `config.toml` and is **not** the cause (the request reaches the function body). **Fix applied:** set `SUPABASE_SERVICE_ROLE_KEY=sb_secret_…` in `.env` + restart dev. Verified via direct curl (fake invoice → 404 "Invoice not found" instead of 401). *Recommendation:* ensure prod/staging server env uses the key format the functions actually validate, or switch the two charge callers to the `x-internal-secret` path (already used by `app/api/internal/*` routes) to be format-agnostic.

2. **[External blocker] Valor A44 "INVALID PAYMENT INFO" blocks all live charges on this vault.**
   `processor_response = {msg:"PROCESSING ERROR", desc:"INVALID PAYMENT INFO", error_no:"A44"}`. This is the known cross-host vault issue (vault created on one Valor host, charged from another — demo vs securelink) tracked from the recurring-billing work ([`VALOR-RECURRING-E2E-2026-09-07.md`](./VALOR-RECURRING-E2E-2026-09-07.md)). Not a PR #305 defect. **Approve-success/activation cannot be demonstrated live until Valor reconciles the vault/host.**

3. **[Correct] Two-card routing works.** The location invoice is charged to **Uptown's own card** (`billing_profile_id 28969f9b`); the merchant-tier ($99.99) is a separate charge on the merchant card. Merchant UI states it explicitly ("This card pays the merchant tier only. Each location pays its own devices and add-ons using its own card").

4. **[BUG — billing] Location invoice incorrectly includes the $99 DEXA POS Base (`base_monthly`) line.** Per the billing model, **locations do NOT pay the DEXA POS Base tier — only the merchant does** (locations are billed on stations + devices + features, *no tier*; confirmed by the product owner). But the generated Uptown location invoice `SUB-202608-0004` line items include `base_monthly $99` ("Dexa POS Base monthly base"), so the location is **double-charged the base** (merchant pays the $99.99 tier *and* the location is billed $99). This inflates Uptown's recurring by $99: current subtotal $702 (= base 99 + KDS 87 + POS 117 + franchise 399) should be **$603** (drop the base); my test total $812.24 (subtotal $781 + 4% surcharge) should have been ≈ **$709.28** (subtotal $682 + surcharge).
   **Root cause:** `public.calculate_subscription_total(...)` in `supabase/migrations/20260906120000_separate_subscription_billing_scopes.sql` (~lines 461–483) sets `v_base_price = v_plan.base_price_monthly` for the non-`merchant_tier` branch and unconditionally appends a `base_monthly` plan line when `v_base_price > 0`. The location plan (`Dexa POS Base` / `SERVICE_CATALOG`) carries `base_price_monthly = 99`, so every location invoice picks it up.
   **Fix:** for non-`merchant_tier` scope, do not add the base line (force `v_base_price := 0`, i.e. only emit the base line when `v_plan_scope = 'merchant_tier'`). Locations should bill stations + devices + features only.
   **Reverse direction is correct (verified live):** the `merchant_tier` branch of the same function properly **excludes location services** — it forces `station_count := 0` (no per-station charges) and **hard-rejects any services** (`raise 'Merchant tier pricing cannot include location services'`). Test: `calculate_subscription_total(multi_location, 3, '[]')` → single `merchant_tier_base` line, $99.99, `station_count=0`; passing a service → exception. So the fix belongs **only in the location/non-tier branch**.

5. **[Minor] Test-data: merchant billing contact `test@example.com`.** Resend returns 422 (`example.com` blocked), so that one delivery fails and makes `notifySubscriptionRestored` throw "1 delivery failed" (caught by `billing-mark-paid`, harmless — invoice still paid, other 5 emails send, ledger retries only the failed recipient). *Recommendation:* (a) use a real merchant billing email for tests; (b) consider not failing the whole notification batch on a single invalid recipient.

6. **[Minor] Generated invoice was back-dated** (period Jul 31–Aug 30, due Aug 31) — likely a stale `current_period` on the test location sub, not a PR #305 issue. Worth confirming period selection on add-on approval.

7. **[Observation] No subscription-billing charge cron on staging.** Only `flag-missed-auto-settlements` (hourly, healthy) is billing-adjacent; `billing-charge-subscription` is not cron-scheduled here. Confirm whether charges are meant to be cron-driven or invoked another way.

## Not yet tested

- **Signed `valor-webhook` restoration path** — requires a signed payload with `VALOR_WEBHOOK_SECRET`; not exercised this session.
- **Approve success + activation** — blocked by finding #2 (Valor A44).

---

## Staging state left in place (per request: "leave as-is")

Joes Coffee Shop was **not** restored; artifacts left for inspection:
- Merchant tier `merchant_subscription` = `past_due` (grace); `billing_setup_required` flag cleared during QA.
- `merchant_plan_subscriptions` = `multi_location` / `active`.
- Uptown location sub = `active`; a `qr_table_ordering` `merchant_subscription_services` row was added to Uptown (not in original).
- `subscription_service_requests`: `ADD-000002` (Loyalty · Uptown · **pending**) and synthetic `ADD-000001` (QR · **denied**, from the immutability test).
- Invoice `SUB-202608-0004` (`86050541-52d0-493f-b0bc-eb4e37c39552`) = **paid** (created + recovered during QA).
- App notifications generated: `subscription_service_requested`, `subscription_payment_failed` (×2), `subscription_restored` (×2); delivery ledger rows in `subscription_billing_notification_deliveries`.
- Stations/terminals restored to the original 16/4 active baseline.

### Restore snapshot

A full pre-QA snapshot exists in schema **`qa305_backup`** (tables: `merchant_subscriptions`, `merchant_plan_subscriptions`, `merchants`, `stations`, `payment_terminals`, `merchant_subscription_services`). To restore Joes exactly: re-apply those rows (set `app.billing_scope_review` to the tier sub id when re-adding `billing_setup_required`), delete the QA invoice / notifications / delivery rows, remove the added QR assignment, and delete the two `ADD-…` request rows via a temporary disable of the `protect_subscription_service_request_authorization` trigger. Then `drop schema qa305_backup cascade`.

## Key IDs (reference)

- Merchant `2add44cb-f498-4653-aca3-a8f0ca258e70` · org `org_34LN9aMJGO4jNllGTvHH4CLB5gq`
- Tier sub `4cbd717b-4f62-46f3-86b1-6469955c3c20` · Uptown loc sub `d3d9f799-25c7-439f-afb4-c9d8787848db` · plan sub `34dd7d28-fab2-49e2-914f-09b302c70a46`
- Uptown Branch location `8835e749-9bbf-4405-b4a4-7f28a56f990a` · Uptown Valor subscription profile `28969f9b-d10d-4428-916e-7a4ef9de1337`
- Request `ADD-000002` = `6b3301ce-640b-48d1-b391-708c6422d565` · invoice `86050541-52d0-493f-b0bc-eb4e37c39552`
- QR service `aa9ec70b-fe2b-4991-b1ed-c60e412b8dda`
