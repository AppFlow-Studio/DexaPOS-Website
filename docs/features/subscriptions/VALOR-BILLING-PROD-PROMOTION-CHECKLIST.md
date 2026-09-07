# Valor Recurring / SaaS Billing — Production Promotion Checklist

Gating checklist to take the separated subscription billing (PR #303 + the
SUB08/A40 fixes in this change) from staging to production. Companion to the
sandbox E2E write-up: [VALOR-RECURRING-E2E-2026-09-07.md](./VALOR-RECURRING-E2E-2026-09-07.md).

Environments: staging Supabase `dfwqakoyittmrwbqvxgw`; production Supabase
`hifouuofcaytijrkbvcy` (see [[project_supabase_staging_prod_link]] semantics —
verify the pooler-url target before any `db push`). Rollout is staging-first.

## 0. Hard blocker — must clear before anything else

- [ ] **A44 cross-host vault** resolved with Valor. The card is vaulted on the
      Vault host but `/?addSub` runs on the transaction host, and the vault
      reference is rejected (`INVALID PAYMENT INFO`). Awaiting Valor's answer
      (email sent to isvsupport@valorpaytech.com). Once answered, implement their
      pattern (vault on the same host as the subscription API, or pass a
      Passage.js token / card at subscription-create time) and **re-run the
      staging vault-based E2E until `/?addSub` returns `S00`**. Until this is
      green on staging, do not promote.

## 1. Credentials & environment (production)

- [ ] `VALOR_ENV=production` set on prod Supabase Edge Function secrets **and** the web app.
- [ ] `VALOR_BASE_URL` set to the **prod transaction host** (unpublished — obtain from Valor). The code refuses to run in production without it; it never guesses a host.
- [ ] Prod Vault host confirmed (may differ from `demo.valorpaytech.com`) and consistent with the A44 resolution.
- [ ] `VALOR_WEBHOOK_SECRET` set for prod.
- [ ] Confirm the prod app `SUPABASE_SERVICE_ROLE_KEY` matches the value the Edge Functions receive (a mismatch reproduces the "Unauthorized" seen locally). Optionally harden the server action to also send `x-internal-secret`.

## 2. Valor merchant / account setup (production)

- [ ] DEXA SaaS billing account boarded with **real underwriting MIDs / prod EPI** (sandbox used the public surcharge EPI `2412333540`). Persisted as a `merchant_processor_accounts` row (`processor='valor'`, `purpose='subscription'`, `is_active`, `is_primary`).
- [ ] Confirm **surcharge intent**: the `surchargeIndicator='1'` path is hardcoded to the sandbox surcharge EPI only; a real prod EPI falls through to `'0'` (traditional / no surcharge). Verify that matches the intended prod billing model.
- [ ] Per-location primary Valor cards vaulted for every location that will bill (and the merchant-wide card for the tier, if used).

## 3. Database migration (production)

- [ ] Apply `20260906120000_separate_subscription_billing_scopes.sql` **out-of-band**. Prod is behind and has version-slot collisions; a blind `db push` would **silently skip** it (see [[project_prod_staging_migration_slot_divergence]] / [[project_prod_migration_gap_and_813120000_collision]]). Reconcile `schema_migrations` and verify the RPCs exist afterward:
  - [ ] `resolve_subscription_billing_profile`
  - [ ] `prepare_migrated_subscription`
- [ ] Test the full-schema migration on an **isolated prod copy** first; compare historical invoice IDs/amounts/statuses/card links before/after. Known native-schedule blockers must roll it back.
- [ ] Regenerate Supabase TypeScript types for both RPCs and remove the temporary RPC adapter casts.

## 4. Deploy website + Edge Functions together (production)

Deploy these six functions with the web app, including `_shared/subscription-billing-scope.ts` and `_shared/valor.ts` (which carry the A40 fix):

- [ ] `billing-charge-subscription` (SUB08 clamp + A40 normalize)
- [ ] `billing-generate-monthly-invoices`
- [ ] `billing-retry-due-invoices`
- [ ] `billing-suspend-overdue`
- [ ] `billing-handle-failure`
- [ ] `valor-webhook`
- [ ] Do **not** resume old worker versions after the migration.

## 5. Webhook & cron (production)

- [ ] Register the recurring subscription webhook in the Valor **prod** dashboard; verify delivery/replay against **both** a merchant-tier and a location subscription ID.
- [ ] Verify existing billing cron jobs (monthly invoice generation, retry-due, suspend-overdue) point at the updated functions. No new cron / env var is introduced.

## 6. Cutover of existing accounts (production)

- [ ] For each "Migrated billing: setup required" replacement row: add the correct scope card, agree a cutover date that doesn't duplicate a paid period, tick the reconciliation confirmation, then **Prepare without charging** (no invoice/charge, stays canceled).
- [ ] On/after the reviewed date, review pricing and **Save & Charge** with that start date; Valor approval required. Reconcile old balances out-of-band — they are not rolled into the replacement's first bill.
- [ ] Do **not** restore the old unique-location schema after replacement rows exist; use a forward fix or coordinated backup restore.

## 7. POS compatibility

- [ ] Verify any POS query assuming one `merchant_subscriptions` row per `location_id` filters `metadata.billing_scope='location'` and handles `canceled` / `billing_setup_required` rows. POS code is not modified by this change and must be checked before shared rollout.

## 8. Verification gates (all must pass before launch)

- [ ] Staging **vault-based** E2E green: `add_subscription` returns `S00` + `subscription_id`; invoice → paid; subscription active; `processor_subscription_id` stored.
- [ ] Separate invoice/subscription/schedule IDs per scope; no tier line in location invoices; no cross-location card fallback; isolated card replacement.
- [ ] Held/archived invoices never reach Valor (payment, retry, invoice-gen, failure-handler, suspend, webhook).
- [ ] Failed activation rolls back to the previous tier (no unpaid access); recurring webhook delivery/replay reconciles correctly.
- [ ] A **prod smoke test** with a real card (small amount) end-to-end incl. the first recurring cycle + webhook.
- [ ] Recordings captured (no secrets / full card data) and verifier sign-off obtained.

## Status snapshot (2026-09-07)

- ✅ Staging: migration applied; 6 Edge Functions deployed (incl. SUB08/A40 fixes); wizard / cutover panel / scope-gated card UI / Passage.js vault save / live pricing verified; recurring charge proven via isolation (card path) → Valor sub `55000`.
- ❌ Blocked on **A44** (section 0) for the real vault path.
- ⏳ All of sections 1–7 are prod-only and untested in sandbox.
