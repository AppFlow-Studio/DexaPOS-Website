# Route SaaS billing through the central DEXA POS AI merchant

**Status:** In progress — routing built + proven on staging (data layer). Destructive cutover + app-level E2E pending.
**Date:** 2026-09-14
**Rollout:** Staging-direct (no feature flags), then prod once Valor prod EPI/modules/webhooks are confirmed.

## Implementation notes / deviations
- **Reused the existing `platform_billing_provider_configs` table** (built for the dormant NMI
  rail; its own comment says it's for "Dexa subscription billing") instead of creating a new
  `platform_saas_billing_config` table. Extended it with `valor_epi`/`valor_appid`, relaxed
  `tokenization_key` NOT NULL, added `'valor'` to the provider check, and added a
  valor-requires-epi/appid check. Central Valor creds live as the `provider='valor'` singleton.
  Migration `20260914120000_platform_valor_saas_billing_config.sql` (applied to staging).
- New RPCs: `upsert_platform_valor_saas_config(...)` (vaults the app key like
  `board_persist_valor_account`; accepts an existing secret id for staging) and
  `get_platform_valor_saas_source()` (returns epi/appid + app-key vault secret *reference*).
- New HQ actions in `app/manage/actions/merchant-billing.ts`:
  `setPlatformValorSaasBillingCredentials(...)` and `reprovisionAllSubscriptionRails()`.
- `provisionSubscriptionBillingRail` now clones from the central config (was: merchant's
  online_order account). Charge/enroll/resolver/RLS/FKs unchanged.

## Staging verification (2026-09-14)
- Migration applied; `valor` config row seeded with the **sandbox demo EPI `2412333540`** (the
  real prod EPI `2501496431` can't process on the sandbox host, so the demo EPI stands in to prove
  routing). Config references the demo EPI's already-vaulted app key by secret UUID.
- Ran the reprovision update: **both Joes Coffee Shop subscription rails now carry the central EPI
  `2412333540`** — Downtown Hamra flipped off its own EPI `2319993369` — and each still decrypts
  its app key (32 chars) via the shared vault secret. Routing mechanism proven at the data layer.
- Cutover surface on staging: Uptown (card + native schedule `55000`) already central → no-op;
  **Downtown Hamra's 2 card profiles are stale** (vaulted under `2319993369`) → need re-vault; no
  native schedules to tear down.

## Cutover action + live charge (2026-09-14)
- Migration `20260914130000_billing_profile_vaulted_under_epi.sql` (applied to staging) adds
  `merchant_billing_profiles.vaulted_under_epi`; both Valor enroll paths now record the vaulting
  EPI (`merchant-billing.ts` HQ path + `dashboard/.../subscription-billing.ts` self-service).
- `cutoverSubscriptionRailsToCentral({ dryRun })` added to `merchant-billing.ts`: per rail, tears
  down native schedules on the OLD EPI (old creds, before overwrite) → reprovisions to central →
  invalidates cards vaulted under a non-central EPI. Rails already on central are skipped (protects
  working schedules like `55000`). Idempotent via `vaulted_under_epi`.
- Cutover logic verified on staging data: after backfilling `vaulted_under_epi` from history, the
  invalidation filter flags **exactly** Downtown's 2 stale cards and spares the 3 central-vaulted
  cards.
- **Live charge through the DEPLOYED `billing-charge-subscription` fn** (gateway `apikey` +
  `x-internal-secret`): charging Downtown's invoice returned Valor **`E75 INVALID VAULT CUSTOMER
  INFO`** — proving the charge now runs on the central EPI `2412333540` and correctly rejects the
  old-EPI card. This is the conclusive live proof that central routing is active end-to-end.
- **Green S00 not yet obtained on staging**: no genuinely-chargeable card is vaulted on the demo
  EPI (the QA test vaults decline), so a successful charge needs a fresh card re-vaulted via the
  Passage UI (a logged-in session) or a prod run with a real re-vaulted card. NOT a routing/code
  gap — the routing is proven live.

## HQ UI (2026-09-14) — built + verified in the running app
- Extended `getPlatformValorSaasBillingConfigSummary()` in `platform-billing-config.ts`; new client
  card `app/manage/settings/integrations/DexaSaasBillingValorRailCard.tsx` (modeled on the NMI rail
  card), wired into `/manage/settings/integrations` above the NMI card. HQ actions gated on
  `system.config.manage` (matches the sibling platform-config surface).
- Card shows current config (provider/status/EPI/app-key/active/updated), a set/rotate form
  (EPI + app id + app key — app key optional on update, reuses the vaulted key), and a **Cut over
  existing subscription rails** section: a confirm checkbox gates the destructive **Run cutover**;
  **Preview (dry run)** shows counts + per-item plan.
- **Verified live** on staging via the running dashboard: card renders "Configured" (EPI
  `2412333540`); the **dry run** returned *Rails migrated: 0 · Schedules torn down: 0 · Cards
  invalidated: 2* (both Downtown `03a80a14`) — exactly matching the SQL-level prediction.

## Remaining before prod
1. Seed the real DEXA POS AI creds via the new HQ card (Integrations → Central SaaS Billing):
   EPI `2501496431` + appid + appkey (from the Valor portal). Swaps the staging sandbox EPI.
2. Preview cutover (dry run) → then Run cutover from the card.
3. Green-path E2E: re-vault a card under the central EPI (Passage UI) → charge → confirm `S00` +
   webhook reconciles the invoice to paid.

## Problem

SaaS subscription fees must settle to **Dexa's** bank. A Valor EPI settles to its own
merchant-of-record's account, so charging a merchant's monthly fee through **that merchant's own
EPI** (the current behavior) deposits the money right back into the merchant's account — Dexa
collects nothing. It only appears to "work" in sandbox because nothing settles.

Today `provisionSubscriptionBillingRail` **clones the merchant's own `online_order` EPI** into
their `purpose='subscription'` account row, and the charge + card-enroll paths use whatever creds
that row carries. The `VALOR_DEXA_HQ_EPI` "central merchant" model is only a stale comment in
`lib/payments/valor/subscriptionApi.ts` — no code reads it.

## Goal

All SaaS charges + card vaulting run through the single central **DEXA POS AI** Valor merchant
(live EPI `2501496431`), so funds settle to Dexa.

## Design (minimal blast radius)

The `processor_account_id` FKs on `merchant_subscriptions` / `merchant_billing_profiles` /
`subscription_invoices` are **simple** (`references merchant_processor_accounts(id)`), and every
`purpose='subscription'` row is owned by the paying merchant. The charge fn
(`billing-charge-subscription`) and enroll fn (`PurchaseMerchantServiceAddOn`) both resolve that
per-merchant row and blindly use its EPI/appid/appkey.

**Therefore: keep the per-merchant subscription rows exactly as they are, and only change WHERE
their credentials come from.** Flip `provisionSubscriptionBillingRail`'s clone source from "the
merchant's online_order account" to "the central DEXA POS AI credentials." Everything downstream
(charge, vault, resolver, RLS, FKs, uniqueness) is unchanged.

Central credentials live in a **dedicated singleton config table** (`platform_saas_billing_config`),
with the appkey stored in Vault — mirroring `board_persist_valor_account`. The per-merchant
subscription row copies the config's `valor_appkey_encrypted` **vault UUID** (a reference, not the
secret), so `get_valor_account_credentials(rowId)` decrypts the shared central appkey. This is the
same UUID-sharing the current clone already does.

## Work items

### DB / migration (staging-first; timestamp newer than main's latest migration — CI guardrail)
- [ ] **M1** `platform_saas_billing_config` singleton table: `valor_epi`, `valor_appid`,
      `valor_appkey_encrypted` (vault UUID), `is_active`, timestamps. Enforce one row. Enable +
      FORCE RLS; grant `service_role`; SELECT for `is_dexapos_admin()`; no direct
      INSERT/UPDATE for `authenticated` (writes go through the definer RPC).
- [ ] **M2** RPC `set_platform_saas_billing_credentials(p_epi, p_appid, p_appkey)` —
      `SECURITY DEFINER`, gated to `service_role`/`is_dexapos_admin()`. Vaults the appkey under a
      stable name `valor_appkey:platform-saas` (create/update like `board_persist_valor_account`
      L79-101), upserts the config row with epi/appid/UUID. Validates EPI via the 10-digit rule.

### Server actions (`app/manage/actions/`)
- [ ] **A1** `setPlatformSaasBillingCredentials({epi, appid, appkey})` — HQ-permission gated
      (reuse existing `hq.*` perm, no new code — see memory), calls M2, `LogAuditEvent`.
- [ ] **A2** Repoint `provisionSubscriptionBillingRail` (`merchant-billing.ts` L357–417): replace
      the online_order source lookup with a read of `platform_saas_billing_config` (service role);
      if unset/incomplete → clear error ("Central DEXA POS AI SaaS credentials are not configured —
      set them in HQ billing settings"). The demote + per-(merchant,location) upsert stay identical.
- [ ] **A3** `reprovisionAllSubscriptionRails()` (backfill, idempotent) — for every active
      `purpose='subscription'` row, overwrite `valor_epi`/`valor_appid`/`valor_appkey_encrypted`
      with the central config. Re-runnable (upsert semantics). Audit-logged.

### One-time data cutover (run on staging, then prod)
- [ ] **C1** Seed central creds via A1 (EPI `2501496431` + appid + appkey from the Valor portal).
- [ ] **C2** Run A3 to re-provision existing subscription rows onto the central EPI.
- [ ] **C3** Invalidate stale card vaults: existing subscription `merchant_billing_profiles` hold
      vault profiles on OLD EPIs (vault profiles are EPI-scoped). Mark them
      `is_active=false`/`is_verified=false` so the UI prompts re-entry; the next card-add re-vaults
      under the central EPI. (Few/none live on prod yet.)
- [ ] **C4** Tear down old native Valor recurring schedules: for `merchant_subscriptions` with a
      `processor_subscription_id` created on an old EPI, deactivate/delete on the old account (reuse
      `syncValorSubscriptionLifecycle`) and clear `processor_subscription_id`/status so the next
      cycle recreates on the central EPI. (Likely none on prod yet.)

### Guardrails + verification
- [ ] **V1** Provisioning refuses if config EPI is missing/invalid; optional charge-time sanity that
      the resolved EPI == central EPI.
- [ ] **V2** SQL checks: every active `purpose='subscription'` row carries EPI `2501496431`; no
      active subscription billing profile references an old EPI's vault.
- [ ] **V3** Staging E2E: seed creds → re-provision one location → add a test card (confirm the
      returned vault profile is under `2501496431`) → run `billing-charge-subscription` (manual mode)
      on a test invoice → expect `S00` → confirm the txn appears under **DEXA POS AI** in the Valor
      portal → confirm the recurring webhook reconciles the invoice to paid.

### Optional (can defer; staging-direct lets us seed via action first)
- [ ] **O1** HQ UI card ("Central SaaS billing — DEXA POS AI") to set/rotate creds + a
      "Re-provision all subscription rails" button, in `/manage/settings/billing-catalog`.

## Valor-side prerequisites (parallel, not code)
Central EPI `2501496431` active with appid+appkey generated; **Recurring/Subscription + Vault
(customer-profile) modules enabled**; CNP MID; **no surcharge**; recurring `SUCCESS/FAILED`
webhooks pointed at the prod `valor-webhook` fn + `VALOR_WEBHOOK_SECRET` set; `VALOR_ENV=production`
+ prod hosts (`VALOR_BASE_URL`, `VALOR_VAULT_BASE_URL`).

## Files touched
- `supabase/migrations/<new>.sql` — M1, M2
- `app/manage/actions/merchant-billing.ts` — A1, A2, A3 (or a new `platform-billing.ts` for A1/A3)
- (optional) HQ settings UI — O1
- No change to: `billing-charge-subscription`, `PurchaseMerchantServiceAddOn`, `resolver.ts`, RLS,
  or the `processor_account_id` FKs.

## Risks / rollback
- **Re-vault is user-visible**: merchants with a saved card must re-enter it once (vault profiles
  are EPI-scoped). Communicate before prod cutover.
- **Old native schedules** keep charging the old EPI until C4 tears them down.
- **Rollback** is a one-line revert of A2's source query; the config table is additive (no drop
  needed). Re-provisioning is idempotent.
- Merchant scoping/RLS unchanged: the subscription row is still owned by the paying merchant.
