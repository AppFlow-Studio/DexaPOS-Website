# Valor Complete Integration Plan

## Source Contract

- Ticket: `[Valor] Complete Integration - Online Payments, Invoices, SaaS Monthly Billing`
- Notion page ID: `3c68280c-1b1d-8106-8352-ee19b4b32807`
- Notion URL: https://app.notion.com/p/3c68280c1b1d81068352ee19b4b32807
- Ticket owner: Ali Dika
- Source branch: `feat/c2-payment-processor-interface`
- Environment: Valor sandbox first
- Ticket and its one discussion were fetched on 2026-08-25.

This document tracks implementation and closure. No Valor migration, Edge
Function, credential change, or production cutover was performed in the
2026-08-26 website implementation pass.

## Objective

Complete Valor across three independent payment purposes without regressing the
existing NMI rollback path:

1. Merchant online-order checkout, tips, refunds, and voids.
2. Merchant-issued invoice payment.
3. DEXA-to-merchant SaaS monthly billing.

Processor selection must remain merchant-, location-, and purpose-aware through
`merchant_processor_accounts`. A single environment flag must not become the
long-term source of truth for every payment purpose.

## Verified Current State

| Workstream | Current state | Evidence / remaining gap |
| --- | --- | --- |
| HQ Valor boarding | Code complete and sandbox verified | Branch commits include persistence and idempotent re-provisioning. |
| Storefront sale and tip | Code complete, not staging-closed | Passage.js and Valor branches exist in both storefront Edge Functions. Resolver migration, deployment, provisioning, and E2E remain. |
| Web refund and void | Code complete, not staging-closed | Uses the reversal RPC lifecycle and the documented `ref_txn_id` request shape. Both pre-settlement void and post-settlement refund still need sandbox proof. |
| Auto-batch settlement webhook | Built and previously staging verified | Webhook HMAC, EPI routing, idempotency, lazy batch adoption, and monitoring exist. Deployment configuration still must be confirmed in the target environment. |
| Merchant invoices | Website code complete; sandbox QA pending | The public invoice bootstrap now resolves the location-aware `invoice` processor, mints a server-side Valor client token, renders Passage.js for Valor, retains Collect.js for NMI, charges through the matching adapter, and records the actual processor. |
| SaaS monthly billing | NMI recovery code complete; Valor contract blocked | Merchant card replacement, Pay now, retry persistence/worker, invoice claiming, HQ grace overrides, and grace-aware suspension are implemented for the existing NMI contract. Valor recurrence ownership and failure-event authority are still undecided, so Valor-selected subscription billing fails closed instead of silently charging NMI. |

The source branch tip inspected on 2026-08-25 was `b4f7a9df`. Its payment test
handoff reports 207 passing `lib/payments` tests, but this does not replace the
deferred staging E2E.

## Blocking Findings

### Migration Version Collision - Resolved

The Valor branch contains:

- `20260824120000_c3_storefront_valor_account_resolver.sql`

The active subscription work contains a different migration with the same
version:

- `20260824120000_subscription_plan_requests_and_app_notifications.sql`

The combined preview branch now carries the resolver as
`20260824153907_c3_storefront_valor_account_resolver.sql`, so it no longer
collides with the subscription request migration. The renamed resolver still
needs the normal staging migration/deployment verification; this implementation
pass did not execute it.

### Invoice Tokenization Mismatch - Resolved In Code

The invoice bootstrap now returns a processor-specific public contract. Valor
app keys are decrypted only in server code and exchanged for a short-lived
client token; only that token, EPI, and sandbox flag reach Passage.js. NMI still
receives only its public tokenization key. The charge action resolves the same
rail again and records `processor_name` as `valor` or `nmi`.

Sandbox payment, decline, retry, and reconciliation proof are still required.

### SaaS Recurrence Ownership

DEXA already generates monthly subscription invoices and charges them from its
own scheduler. Valor also supports processor-managed recurring subscriptions.
Enabling both would risk duplicate monthly charges.

Recommended decision: keep DEXA's invoice scheduler as the billing source of
truth, vault the card with Valor, and let the existing charge job execute one
idempotent Valor payment for each DEXA invoice. Use Valor-managed subscriptions
only if the team explicitly chooses to disable DEXA's recurring charge path and
make Valor events authoritative.

### Environment Documentation Drift

The Notion environment table lists `VALOR_ISO_API_KEY`, `VALOR_ISO_SECRET`,
`VALOR_MAX_AMOUNT_MINOR`, `VALOR_TIMEZONES`, and `VALOR_TZ`. In the inspected
branch, the boarding auth path reads the ISO mail ID, submail ID, passcode, and
ISV delete secret, while the maximum amount and timezone map are code constants.
The listed API key/secret and configurable guard/timezone values are therefore
not proven runtime dependencies. Temur must decide whether the ticket is stale
or the implementation is missing intended configuration before deployment.

## Access and Credential Checklist

### Human Accounts

1. Valor sandbox portal: `https://vpdemo.valorpaytech.com/login`.
2. Human portal user: `DexaISV`.
3. Portal password: obtain from the approved secret store. Do not copy it into
   this repository, PR descriptions, tickets, recordings, or chat.
4. DEXA HQ website account with merchant boarding, payment, invoice, and billing
   permissions.
5. A staging merchant account and customer-facing storefront access for the
   selected test location.
6. Supabase staging project access capable of applying a reviewed migration,
   deploying Edge Functions, setting secrets, and reading test rows.

`DexaISO` is not the human portal login. It is the ISO boarding API identity used
by the server-side environment configuration.

### Server and Edge Function Configuration

Temur must install or confirm these values in the appropriate secret stores.
Secret values must not be sent through WhatsApp. A WhatsApp message should only
confirm that the values were installed and identify the target environment.

- Environment/endpoints: `VALOR_ENV`, `VALOR_BASE_URL`,
  `VALOR_VAULT_BASE_URL`, `VALOR_BOARDING_BASE_URL`.
- Boarding identity: `VALOR_ISO_MAIL_ID`, `VALOR_ISO_SUBMAIL_ID`,
  `VALOR_ISO_PASSCODE`, `VALOR_ISO_API_KEY`, `VALOR_ISO_SECRET`.
- Boarding assignment/config: `VALOR_BOARDING_CREATE_VARIANT`,
  `VALOR_BOARDING_STORE_VARIANT`, `VALOR_BOARDING_PROCESSOR`,
  `VALOR_BOARDING_PROGRAM_TYPE`, `VALOR_BOARDING_PROCESSOR_DATA`,
  `VALOR_BOARDING_DEVICE`, `VALOR_BOARDING_DEVICE_TYPE`,
  `VALOR_BOARDING_MCC`, `VALOR_BOARDING_ISV_USERNAME`.
- Fees: `VALOR_FEE_DISC_RATE_PERCENT`, `VALOR_FEE_RESIDUAL_BPS`,
  `VALOR_FEE_SCHEDULE_ID`, `VALOR_FEE_SURCHARGE_PERCENT`.
- Delete-only credential: `VALOR_ISV_SECRET_KEY`.
- DEXA SaaS billing account: `VALOR_DEXA_HQ_EPI` plus its app ID/key or the
  equivalent Vault-backed processor-account record.
- Settlement: `VALOR_WEBHOOK_SECRET`.
- Rollback: `PAYMENTS_FORCE_NMI`.
- Local smoke-test only: `VALOR_TEST_APP_ID`, `VALOR_TEST_APP_KEY`,
  `VALOR_TEST_EPI`.

The Notion ticket currently contains plaintext sandbox credentials. Rotate the
portal password, ISV secret, and test app key before broader distribution, then
replace the plaintext values with references to the approved secret store.

### Sandbox Test Data

- Valor sandbox BIN: `686868`.
- AVS ZIP: `85284`.
- Obtain the complete test PAN, expiry, CVV, and expected response matrix from
  Valor's official sandbox documentation or the Valor representative. Do not
  invent card details from the BIN alone.

## Decisions Required Before Coding

1. Invoice checkout UX is embedded Passage.js, matching the verified storefront
   tokenization path. Any future hosted-page change is a separate UX decision.
2. SaaS recurrence owner: DEXA scheduler (recommended) or Valor subscription
   scheduler. Exactly one system may initiate monthly charges.
3. SaaS account shape: confirm the DEXA HQ EPI/app credentials and whether they
   live in Vault-backed `merchant_processor_accounts` or environment variables.
4. Invoice scope: confirm support for both `merchant_to_customer` and
   `platform_to_merchant`, including which account owns each charge.
5. Refund policy: full and partial refunds, settled-state definition, tip and
   surcharge treatment, and webhook/event authority.
6. Cutover policy: select Valor per payment purpose and location; reserve
   `PAYMENTS_FORCE_NMI=true` as an emergency rollback, not normal routing.
7. Environment contract: reconcile every variable in the Notion table with an
   actual code read; remove stale entries or add validated configuration tests.

## Execution Plan

### Phase 0 - Integrate Safely

1. Start from the latest `dexaposwebsite-preview` and integrate
   `feat/c2-payment-processor-interface` without discarding either branch's
   payment, billing, notification, or UI work.
2. Resolve the migration-version collision before applying any Valor SQL.
3. Review the combined diff for generated types, Edge Functions, invoice code,
   subscription billing, and processor-account migrations.
4. Run the existing payment test suite, focused lint, typecheck, and production
   build on the combined branch.

Exit gate: clean combined branch, unique migration versions, and no failed
automated checks.

### Phase 1 - Close Storefront Valor on Staging

1. Apply the uniquely versioned storefront resolver migration once to staging.
2. Regenerate `app/database.types.ts` from that staging schema.
3. Set `VALOR_ENV=sandbox` and required non-secret endpoint configuration on
   `process-online-payment` and `create-online-order`.
4. Deploy both Edge Functions to staging.
5. Board or re-provision one controlled staging merchant/location.
6. Persist an active primary Valor `online_order` processor account. Confirm
   the operation demotes the old NMI primary only in the intended scope.
7. Leave `PAYMENTS_FORCE_NMI` disabled for the Valor test.
8. Run checkout with an item, tax, and tip. Verify the charged amount equals
   `totalCents`, and verify processor/account/transaction metadata locally.
9. Test an unsettled void, a settled full refund, and a settled partial refund.
10. Repeat one request with the same idempotency key and prove no duplicate
    charge or reversal occurs.
11. Enable `PAYMENTS_FORCE_NMI=true`, run one rollback smoke test, then restore
    the approved staging setting.

Exit gate: recorded sale, tip, idempotency, void, refund, and rollback evidence.

### Phase 2 - Complete Valor Invoice Payments

1. [x] Extend invoice bootstrap data with processor identity and the correct
   processor-specific client configuration.
2. [x] Render Valor Passage for Valor invoices and retain Collect.js for NMI.
3. [x] Resolve the correct `invoice` processor account by merchant and location.
4. [x] Store provider-neutral transaction metadata while preserving existing
   NMI rows and webhook behavior.
5. [x] Preserve idempotency and already-paid/in-progress guards.
6. [x] Convert thrown processor transport failures into a terminal failed
   attempt instead of leaving the payment stuck in `processing`.
7. [ ] Sandbox-verify success, decline, retry, already-paid, stale-link, and
   location-isolation behavior.
8. [ ] Verify invoice email/SMS links, PDF/download behavior, receipt delivery,
   and merchant/HQ status views.

Exit gate: a sandbox invoice can be issued, opened anonymously, paid once through
Valor, receipted, and reconciled in both merchant and HQ views.

### Phase 3 - Complete Valor SaaS Monthly Billing

1. Record the recurrence-source decision before implementation.
2. Add processor-aware billing profiles and Valor customer/payment-profile IDs
   without storing raw PAN/CVV.
3. Add the merchant payment-method setup/replacement flow using Passage and the
   Valor vault.
4. Update `billing-charge-subscription` to resolve the active primary
   `subscription` account and charge through Valor when selected; preserve NMI
   rollback behavior.
5. Keep invoice generation, idempotency, retries, dunning, grace periods,
   suspension, restoration, notifications, and audit evidence authoritative in
   one system.
6. Persist the Valor transaction/subscription reference in provider-neutral
   fields or metadata and project gateway failures into existing billing states.
7. Test initial charge, renewal, decline, retry, past due, suspension, payment
   recovery, automatic restoration, and manual override.

Exit gate: one controlled monthly cycle is provably single-charge, idempotent,
audited, notified, and recoverable.

### NMI Billing Recovery Implemented While Valor Is Blocked

The processor-neutral lifecycle can move forward without guessing Valor's
recurrence contract. The website now provides merchant payment-method
replacement through the existing NMI vault flow, tenant-scoped payment of open
or failed invoices, retry scheduling and a protected due-invoice worker,
single-claim protection, HQ grace-period controls, and grace-aware suspension.

Deployment requires
`20260826120000_subscription_billing_grace_and_retry_foundation.sql` before the
updated billing Edge Functions. These changes do not enable Valor subscription
charges. If a Valor `subscription` account is selected, the existing fail-closed
guard remains authoritative.

### Phase 4 - Settlement and Operations Closure

1. Confirm `valor-webhook` is deployed to the target staging project with the
   matching HMAC secret.
2. Confirm Valor's portal callback points to that exact deployed URL.
3. Verify valid signature, invalid signature, duplicate webhook, unknown EPI,
   lazy batch adoption, and watchdog behavior.
4. Add dashboards/log queries for failed checkout, unresolved account,
   duplicate prevention, failed invoice callback, failed recurring charge, and
   missed settlement.
5. Update the runbook with rollback, credential rotation, and production
   promotion steps.

Exit gate: operations can identify and safely recover every supported failure
without directly editing payment data.

### Phase 5 - Production Promotion

1. Obtain QA and senior sign-off for all three payment purposes.
2. Rotate any sandbox credentials that were exposed in documentation.
3. Install production endpoints and secrets separately; never reuse sandbox
   values.
4. Apply reviewed production migrations using the team's migration discipline.
5. Deploy production Edge Functions with Valor routing disabled initially.
6. Board one controlled merchant, run a low-value smoke test, and reconcile it.
7. Enable Valor per merchant/location/purpose, not as an immediate global cut.
8. Monitor failures, settlements, refunds, invoices, and SaaS renewals through
   at least one complete billing cycle.

## Verification Matrix

| Surface | Required proof |
| --- | --- |
| Boarding | Initial board, missing-location re-provision, repeated idempotent re-provision, Vault persistence. |
| Storefront | Sale, tax, tip, amount equality, decline, retry, duplicate prevention, NMI rollback. |
| Reversals | Unsettled void, settled full refund, settled partial refund, duplicate reversal prevention. |
| Invoice | Issue, send, open, Valor tokenize/redirect, pay, callback, receipt, already-paid protection. |
| SaaS billing | Vault setup, initial charge, renewal, decline, retry, past due, suspend, restore, notification, audit. |
| Settlement | Valid HMAC, invalid HMAC, duplicate event, unknown EPI, adopted batch, watchdog alert. |
| Isolation | Location A account cannot charge Location B; online-order, invoice, and subscription purposes do not cross-resolve. |

## Website Implementation Update - 2026-08-26

### Completed Code

- Merchant-to-customer invoice rail resolution now checks the active primary
  `merchant_processor_accounts` row for purpose `invoice`; location-specific
  rows win through the shared resolver and merchant-global rows remain valid.
- Valor invoice bootstrap decrypts the app key only through the service-role
  credential RPC, mints a short-lived client token, and returns no secret.
- Public invoices render Passage.js for Valor and the existing Collect.js form
  for NMI.
- Invoice payment attempts persist the selected provider and processor-account
  reference in provider-neutral metadata.
- A thrown processor request is recorded as failed and the invoice becomes
  `payment_failed`, so retries are possible and no attempt remains indefinitely
  in `processing`.
- SaaS card setup and recurring invoice charging detect a selected Valor
  `subscription` account and return the explicit
  `valor_subscription_contract_pending` state instead of silently falling back
  to NMI. The `PAYMENTS_FORCE_NMI=true` emergency rollback remains available.
- Merchant subscription recovery now links to the secure billing-profile editor
  and allows tenant-scoped payment of open or failed invoices.
- Failed NMI subscription charges persist retry timing, a protected worker
  processes due retries, and invoice claiming prevents concurrent duplicate
  charges.
- HQ can extend or clear a reasoned grace period, and overdue suspension honors
  the active deadline.

### Files Changed

- `lib/invoices/payment-rail.ts`
- `app/actions/invoices/invoice-payment-bootstrap.ts`
- `app/actions/invoices/charge-invoice.ts`
- `app/invoice/[token]/PayPanel.tsx`
- `app/invoice/[token]/page.tsx`
- `app/manage/actions/merchant-billing.ts`
- `supabase/functions/billing-charge-subscription/index.ts`
- `supabase/functions/billing-handle-failure/index.ts`
- `supabase/functions/billing-suspend-overdue/index.ts`
- `supabase/functions/billing-retry-due-invoices/index.ts`
- `supabase/functions/_shared/subscription-retry-policy.ts`
- `supabase/migrations/20260826120000_subscription_billing_grace_and_retry_foundation.sql`
- `app/dashboard/actions/subscription-billing.ts`
- `app/manage/actions/subscription-billing.ts`
- `components/billing/MerchantSubscriptionOverviewCard.tsx`
- `components/billing/HqSubscriptionsWorkspace.tsx`
- `tests/valor-invoice-payment.test.ts`
- `tests/subscription-billing-safety.test.ts`

### Automated Verification

- Focused ESLint: passed.
- Full payment and focused billing suite: 15 files, 215 tests passed.
- `tests/valor-invoice-payment.test.ts`: 3 passed.
- `tests/subscription-billing-safety.test.ts`: 7 passed.
- Focused Valor/billing verification: 3 files, 16 tests passed.
- Next.js production build: passed, 119 static pages generated.
- Standalone `tsc --noEmit`: stopped after several minutes with no diagnostics;
  this repository uses Next's TypeScript CLI path and the production build
  completed successfully.

### Manual Staging QA

1. Confirm the Valor credential and storefront resolver migrations are applied
   through the approved staging process. Do not rerun them from this document.
2. Provision a controlled merchant/location with an active primary Valor
   processor account for purpose `invoice`. Keep a second NMI invoice merchant
   for regression coverage.
3. Create and send a merchant-to-customer invoice for the Valor location.
4. Open `/invoice/<public-token>` in a private browser session. Confirm Passage
   renders and no NMI Collect.js frame is loaded.
5. Pay with Valor sandbox data. Confirm exactly one `invoice_payments` row is
   captured, `processor_name = 'valor'`, the invoice becomes paid, and the
   transaction ID is visible in merchant/HQ payment detail.
6. Repeat with a decline and a simulated transport failure. Confirm declined or
   failed state, a retry is allowed, and no row remains stuck in processing.
7. Double-submit once and confirm the idempotency guard prevents a duplicate
   charge.
8. Open an NMI invoice and confirm the existing Collect.js flow still pays it
   with `processor_name = 'nmi'`.
9. Use Location A and Location B with different invoice processor assignments;
   confirm neither resolves the other's account.
10. Select Valor for purpose `subscription` in a controlled non-live merchant.
    Confirm card setup and charge attempts fail before any NMI request, with the
    recurring-contract message.
11. For an NMI subscription merchant, replace the vaulted payment method, pay a
    failed invoice, and confirm one captured attempt and automatic restoration.
12. Verify retry timing and exhaustion with controlled declines, then verify an
    HQ grace deadline prevents suspension until it is cleared or expires.

## Immediate Next Steps

1. Temur confirms the SaaS recurrence owner and Valor renewal/failure event
   source. This is the remaining design blocker.
2. Temur rotates/installs the required secret values and sends a WhatsApp
   confirmation containing environment and variable names only.
3. Complete Phase 1 staging deployment and E2E.
4. Run the Phase 2 invoice staging QA above.
5. Implement Valor SaaS billing only after one recurrence authority is selected
   and the required success/failure reconciliation mechanism is documented.
