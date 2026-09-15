# Merchant Tier and Location Billing Separation

## Contract

- One merchant tier subscription, invoice stream, and Valor schedule.
- Each location has its own service subscription, invoice stream, schedule, and card.
- The tier uses the merchant-wide primary Valor card, otherwise the first-created location by creation date. Missing cards fail closed; no arbitrary-location fallback.
- The anchor location can have two rows: a tier row and a separate location-services row.
- Changing/replacing a card does not move another location's charges.

## Implementation and Deployment Status

Code and local database tests are implemented. Shared database migration, Edge
Function deployment, generated types, browser/sandbox payment QA, and recording
remain pending. This code-change turn did not contact Supabase or Valor. The prior
QA card cleanup deactivated legacy NMI profiles separately; it did not migrate
subscriptions or cancel external schedules.

## Migration

`20260906120000_separate_subscription_billing_scopes.sql`

Replaces the old unique-location constraint with one tier per merchant and one
service subscription per location. Stores the discriminator in the existing
`metadata.billing_scope` field. It does not create, cancel, or charge a Valor schedule.

Adds a scope-aware card resolver and guards against cross-location cards, scope
changes, and device/service assignments on tier rows. Updates subscription upsert,
pricing, recalculation, invoice generation (including QA snapshots), device sync,
and station-quota lookups. Restoring one subscription cannot override a suspended
sibling stream. Merchant-wide POS entitlement redesign is outside this change.

Combined tier/add-on subscriptions, incorrectly anchored tiers, and cross-scope
card subscriptions are converted atomically:

- The original row becomes canceled, read-only `billing_scope = 'legacy'`. Its
  original status/cancellation details are retained in metadata; its ID, card,
  amounts, dates, and service assignments remain intact.
- Historical invoices, including paid and outstanding invoices, are not rewritten,
  reassigned, forgiven, or charged. They stay linked to the original subscription.
- Replacement tier/location rows have separate IDs, no card, no native schedule,
  canceled status, and `billing_setup_required = true`. They initially show zero
  monthly amount, not a free plan; review/preparation recalculates actual pricing.
- All service quantities, enabled/disabled flags, and assignment metadata are
  copied to the location replacement. Existing valid location streams are retained.
- Operational lists exclude archives and never supply an implicit fallback card.
- A database check prevents held records becoming active/past_due. Payment,
  retry, invoice-generation, failure-handler, overdue-suspension, and recurring
  webhook paths reject/skip held billing. Card replacement does not rebind archives.

Preflight still aborts on known external schedule IDs/status/next-payment data,
conflicting plan/scope metadata, multiple tiers per merchant, suspended access
snapshots needing reconciliation, or a missing anchor/service-catalog plan.
Do not clear processor fields merely to bypass these checks. Null schedule fields
do not prove that Valor or an older processor has no external recurring schedule.

### Existing Accounts

At `/manage/subscriptions/[merchantId]`, the **Migrated billing: setup required**
panel lists each replacement. This panel is flat, without nested cards.

1. Add the merchant/anchor primary Valor card for the tier. Add each location's
   own primary Valor card for its services; another location's card is not accepted.
2. Have the operator verify old Valor/NMI schedules and outstanding invoices.
   Agree on the cutover date without duplicating a paid period. Old balances need
   separate reconciliation; they are not rolled into the replacement's first bill.
3. Select a start date today or later, explicitly acknowledge the reconciliation,
   and click **Prepare without charging**. The audited
   `prepare_migrated_subscription(uuid,date,boolean)` RPC validates the card,
   rejects overlapping paid periods, records the reviewer/time/date, recalculates
   pricing, and removes the hold. The subscription stays canceled; no invoice or
   external schedule is created.
4. On/after that date, review tier/location pricing and use the existing
   **Save & Charge** flow with the reviewed start date. For the merchant tier,
   explicitly set that date in the tier form; its existing plan dates are not
   automatically rewritten by preparation. Valor approval is still required.

Archived invoice charging through the regular Valor charge action is blocked.
The existing authorized manual mark-paid workflow can record separately verified
historical collections; it does not reactivate the canceled archive. Do not mark
an unpaid invoice paid just to make the migration pass.

### Rollout Order

1. Back up and inspect staging. Reconcile native schedule blockers first. Pause billing writers/workers and coordinate webhook delivery during schema/app deployment. Test the full schema on an isolated copy before shared staging.
2. Apply the migration to staging through the approved process. No other new migration is required by this change.
3. Regenerate Supabase TypeScript types, including `resolve_subscription_billing_profile` and `prepare_migrated_subscription`. Both website adapters have temporary RPC casts until generation.
4. Deploy `billing-charge-subscription`, `billing-generate-monthly-invoices`, `billing-retry-due-invoices`, `billing-suspend-overdue`, `billing-handle-failure`, and `valor-webhook`, including `_shared/subscription-billing-scope.ts`, with this website branch. Do not resume old worker versions after migration.
5. Verify existing invoice generation, retry workers, and Valor webhook against both subscription IDs. No new cron, webhook, environment variable, or payment credential is introduced.
6. Complete the HQ cutover reviews and obtain QA/verifier approval, then repeat the coordinated rollout in production. A Git merge alone does not deploy Supabase changes. Do not roll back to the old unique-location schema after replacement rows exist; use a reviewed forward fix or coordinated backup restoration instead.

POS compatibility: any direct POS query assuming a single `merchant_subscriptions`
  row per `location_id` must filter `metadata.billing_scope = 'location'` and handle
  canceled/setup-required records. The website
repository's device-sync and station-quota RPCs are updated; POS repository code
has not been inspected or modified in this task. Verify that consumer before
shared staging/production rollout.

## Manual QA / Recording

Use sandbox cards only. Start with two locations A (created first) and B, each
with a different saved card, plus an optional merchant-wide card.

1. HQ > Subscriptions > merchant > Merchant Tier: activate a tier. Verify its own invoice/schedule uses the merchant-wide card, or A's card when no merchant-wide card exists.
2. Location Add-ons: configure A's KDS/integrations. Verify a different subscription and invoice from the tier, charged to A's card only; no tier line or tier station overage appears.
3. Configure B's add-ons. Verify B's card is used and A/tier amounts and schedule IDs remain unchanged.
4. Remove or deactivate B's primary card. Activation must fail clearly before payment; it must not fall back to A or the merchant card.
5. Replace the merchant-wide card. Only the tier's card/schedule should change. Replace B's card; only B changes. If the tier uses A's card, replacing A's card also updates that already-linked tier.
6. Supply a wrong-location profile/subscription ID via the action/API. Expect rejection, with no new invoice/payment or altered subscription.
7. Merchant > Subscriptions > Billing: verify merchant and location cards are shown separately, including the single-location case. Each Update location card link opens that scope.
8. Test failed activation, successful payment, recurring webhook delivery/replay, cancellation, and restoration separately for each stream. No duplicate charge or cross-location activation is acceptable.
9. Preserve evidence of invoice IDs, subscription IDs, masked card last-four, amounts, and gateway results. Never record secrets or full card data.

## Local Verification

- Expanded Vitest run including scope, safety, cutover actions, Valor subscription API, notifications, and helper tests: 38 tests passed across 7 files.
- `tests/subscription-billing-scope.postgres.mjs`: 72 isolated PostgreSQL/WASM checks passed, including rollback on known schedules, invoice JSON preservation, archived records, NMI/cross-location legacy cards, copied enabled/disabled quantities, existing anchor services, preparation authorization, paid-period overlap, existing access-state trigger execution, and separate invoice totals. Uses minimal schema/auth fixtures, not the full staging schema.
- Changed TypeScript files: 19-file transpilation/syntax check passed. Focused TypeScript checking of the new review action/component and their imports passed. Targeted ESLint passed for the new review action/component, shared helper, and tests. Full project type checking previously timed out after 90 seconds without diagnostics; it is not a passing type check. Full build/browser tests were not run.
- To run the SQL test, install `@electric-sql/pglite` outside the repo and set `PGLITE_MODULE_PATH` to its `dist/index.js`, then run `node tests/subscription-billing-scope.postgres.mjs`. No shared database or payment API is contacted.
- Full staging migration, browser QA, real sandbox payments, native recurring schedules, and POS integration are not verified by those tests.

## Changed Files

- `app/manage/actions/subscription-billing.ts`: scope-specific resolution, snapshots, location lists, and a tier readiness guard before assignment/approval; unchanged-plan requests only skip charging when the billing tier is already active.
- `app/manage/actions/subscription-cutover.ts`: permission-checked HQ review list and audited preparation action.
- `app/manage/actions/merchant-billing.ts`: card replacement updates only applicable subscription IDs.
- `app/dashboard/actions/subscription-billing.ts`: merchant card display follows the tier profile instead of an arbitrary card.
- `lib/subscription-billing/profile-resolver.ts`: server-only adapter for the new resolver RPC.
- `components/billing/HqSubscriptionsWorkspace.tsx`: isolated location subscription selection, card labels, no fallback.
- `components/billing/SubscriptionCutoverReview.tsx`: explicit date/confirmation review UI; preparation never charges.
- `components/billing/SubscriptionBillingAdminCard.tsx`: removes global-card fallback.
- `components/billing/MerchantSubscriptionOverviewCard.tsx`: separate merchant/location card presentation and scoped links.
- `components/billing/MerchantBillingSetupCard.tsx`: explains ownership of cards.
- `supabase/functions/_shared/subscription-billing-scope.ts`: shared payment boundary and card replacement rules.
- `supabase/functions/billing-charge-subscription/index.ts`: rejects invoice/subscription/card scope mismatches before Valor calls.
- `supabase/functions/billing-generate-monthly-invoices/index.ts`: skips held records.
- `supabase/functions/billing-retry-due-invoices/index.ts`: excludes canceled/archived streams before retry pagination.
- `supabase/functions/billing-suspend-overdue/index.ts`: historical balances cannot suspend replacement subscriptions.
- `supabase/functions/billing-handle-failure/index.ts`: held/archived invoices do not enter failure/retry notification handling.
- `supabase/functions/valor-webhook/index.ts`: refuses recurring event processing for held/archived streams.
- `supabase/migrations/20260906120000_separate_subscription_billing_scopes.sql`: schema/RPC changes described above.
- `tests/subscription-billing-scope.test.ts`: unit and boundary wiring tests.
- `tests/subscription-billing-scope.postgres.mjs`: isolated PostgreSQL regression tests.
- `tests/subscription-cutover-actions.test.ts`: permission, confirmation, error, RPC, and invalidation tests.
- `tests/subscription-plan-request-notifications.test.ts`: tier approval fast-path must check active billing and migration holds.
- `docs/features/subscriptions/SAAS-VALOR-SUBSCRIPTION-ARCHITECTURE.md`: revised billing model.
- `docs/features/subscriptions/BILLING-SCOPE-SEPARATION-QA.md`: this rollout and QA guide.
