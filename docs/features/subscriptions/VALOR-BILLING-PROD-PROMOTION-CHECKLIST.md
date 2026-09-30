# Valor SaaS Billing: Production Promotion Checklist

**Last verified:** 2026-09-29, by read-only SQL against staging (`dfwqakoyittmrwbqvxgw`) and
prod (`hifouuofcaytijrkbvcy`), plus one live $1.04 subscription on prod.

This replaces the 2026-09-07 version. That version listed the A44 vault error and the prod
migration gap as blockers. Both are resolved; see "Superseded" at the end.

Related: [sandbox finding](./VALOR-SANDBOX-ADD-SUBSCRIPTION-EMPTY-200-2026-09-29.md),
[central rail plan](./CENTRAL-SAAS-BILLING-RAIL-PLAN.md),
[phased rollout](./saas-billing-phased-rollout.md),
[online settlement plan](../payments/PLAN-2026-09-29-VALOR-ONLINE-ORDER-SETTLEMENT.md).

## Where prod stands

| Item | State |
|---|---|
| Billing schema and RPCs | Applied |
| 8 billing edge functions and `valor-webhook` | Deployed |
| Edge secrets (`VALOR_ENV=production`, transaction, vault and boarding hosts, webhook secret, internal secret) | Set |
| Central credentials, EPI `2501496431` | Seeded 2026-09-29 |
| Vault on the central merchant | Enabled by Valor 2026-09-29 |
| Create a subscription and charge the card | **Proven**: `S00`, Valor subscription `253837` |
| Recurring webhook delivered and signature verified | **Proven** |
| Webhook applied to the invoice | **Failed**; fixed in code, not deployed |
| Billing cron jobs | None installed |
| Feature paywall | Dark |

## 1. Clean up the test (do first)

- [ ] Cancel the Sakura Tea Test subscription in HQ. It is active, priced at $82.16 on our side,
      and Valor schedule `253837` will charge $1.04 on 2026-10-29.
- [ ] Confirm in the Valor portal that schedule `253837` is gone.
- [ ] Optional: void the $1.04 charge, transaction `11013174026`.

## 2. Promote code

All of this is uncommitted in the working tree as of 2026-09-29.

- [ ] **Web app**
  - Valor auto-boarding shows "Coming soon"; status and "Set live" remain.
  - The online-store toggle checks for a live Valor account instead of an NMI device.
  - Per-service card surcharge input removed from the billing catalog.
  - Saved cards show brand and last four; existing cards repair themselves when listed.
- [ ] **`valor-webhook`**: attaches the first payment's transaction to the invoice that was
      settled inline. Also stops storing full payloads for events it ignores.
- [ ] **`billing-charge-subscription`**: sends `failure_notification: 0` when the merchant has
      no email or phone, instead of failing with `SUB21`.

Confirm the prod web app has `INTERNAL_NOTIFICATION_SECRET` set. The first prod charge passed
auth, so it is either set or the service-role key matches.

## 3. Apply migrations

Apply out of band and record each version in `supabase_migrations.schema_migrations`. Do not
`db push`; other local migrations are pending.

- [ ] `20260930130000_uniform_card_surcharge.sql`. Applied to staging. Also resets `loyalty`
      from 0% to the platform rate on prod.
- [ ] `20260930140000_valor_online_order_settlement.sql`. **Not yet applied to staging.** Apply
      and test there first.
- [ ] After the second one, run the replay query in the settlement plan.

## 4. Install cron jobs

Valor charges its own schedules and the webhook creates the month's invoice if it is missing.
These still need a schedule on prod:

- [ ] `billing-retry-due-invoices`
- [ ] `billing-suspend-overdue`
- [ ] `billing-send-renewal-reminders`
- [ ] `billing-generate-monthly-invoices`, for any subscription without a Valor schedule

## 5. Ask Valor or Mtech

- [ ] Scope webhook delivery to the DEXAPOS ISV. Prod receives events for about 100 EPIs that
      are not ours.
- [ ] Fix sandbox Add Subscription, or issue a sandbox EPI under our ISV.
- [ ] Confirm whether a 4% card surcharge folded into the amount is acceptable on a
      traditional MID (`surchargeIndicator: 0`).

## 6. Still unverified

- [ ] **Declined first charge.** Valor charges during the create call and we mark the invoice
      paid on `S00`. If Valor returns `S00` when that charge declines, we would record a payment
      that never happened. Test with a card that declines.
- [ ] **Second cycle.** The first scheduled charge is 2026-10-29. Confirm the webhook creates
      and settles that month's invoice.
- [ ] **Webhook fix live.** Proven by unit tests only. The next new subscription on prod is the
      first real test.
- [ ] **Refund or void** of a subscription charge from our side.
- [ ] **Card display** in a browser, and the repair of existing cards against the prod vault.

## 7. Onboard merchants

- [ ] Provision the subscription rail per location ("Set up subscription billing").
- [ ] Vault a card per location.
- [ ] Review pricing, then Save & charge.

## 8. Phase 2: enforce the paywall (later)

Unchanged. Run `grandfather-comp-backfill.sql`, then set `PAYWALL_ENABLED = true`.

## Known limitation

Staging cannot create a Valor subscription. The sandbox returns an empty HTTP 200 for every
valid Add Subscription request, including Valor's own documented example. Everything else in
the flow can be tested on staging.

## Superseded from the 2026-09-07 version

| Old item | Outcome |
|---|---|
| A44 cross-host vault blocker | Not cross-host. The keys were wrong; fixed 2026-09-10. |
| Prod missing the `20260830*` billing migrations | Both are on prod's ledger. |
| `prod-reconcile/` migration set | No longer needed. |
| "EPI not provisioned for native recurring" | Disproved; see the sandbox finding. |
| Register the recurring webhook on prod | Done; events are arriving. |
