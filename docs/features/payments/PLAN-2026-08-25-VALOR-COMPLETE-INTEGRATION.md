# Valor Complete Integration - Website

## Source Contract

- Ticket: `[Valor] Complete Integration - Online Payments, Invoices, SaaS Monthly Billing`
- Notion page ID: `3c68280c-1b1d-8106-8352-ee19b4b32807`
- Notion URL: https://app.notion.com/p/3c68280c1b1d81068352ee19b4b32807
- Owner: Ali Dika
- Website branch: `feat/valor-saas-completion`
- Target environment: Valor sandbox on staging before production
- Last updated: 2026-08-30

No migration or Edge Function was deployed by this implementation pass.

## Objective

Use Valor for all new card-processing paths owned by this ticket:

1. HQ merchant boarding and processor-account provisioning.
2. Hosted online-order checkout, including tips.
3. QR dine-in checkout in the customer browser.
4. Merchant-issued invoice payment.
5. Online-order voids and refunds from the website.
6. DEXA-to-merchant SaaS billing, recurring collection, payment failure,
   suspension, and recovery.
7. Valor settlement and recurring-payment webhook reconciliation.

NMI is not a valid fallback for new SaaS card setup or recovery. Historical NMI
references remain readable so old invoice and transaction records do not lose
their audit trail.

## Current Architecture

### Processor Accounts

`merchant_processor_accounts` selects Valor independently by purpose:

- `online_order`
- `invoice`
- `subscription`

Location-specific accounts take precedence where the payment is location
scoped. Merchant-wide subscription cards are supported; a location is used only
as the database anchor required by the existing subscription invoice schema.

### SaaS Recurrence Ownership

Valor owns recurring execution after a native subscription is created. DEXA
owns the local invoice projection, merchant/HQ notifications, grace period,
suspension, restoration, and audit history.

This avoids duplicate collection:

- The monthly invoice process may create the local invoice.
- Valor performs the scheduled card charge and its native retries.
- The automatic DEXA retry worker skips invoices backed by a native Valor
  schedule.
- A merchant-initiated **Pay now** or card replacement uses Valor `updateSub`
  and may collect the current unpaid cycle.
- Signed Valor recurring events update the matching local invoice.

### NMI Policy

- New SaaS cards must use Passage.js and the Valor Vault.
- The generic server action rejects card input outside that flow.
- SaaS billing readiness is based on an active Valor billing profile, not an NMI
  online-ordering device.
- New SaaS subscription and invoice processor fields accept only `valor` or
  `NULL`.
- Old `nmi_transaction_id` values are display-only history.
- `PAYMENTS_FORCE_NMI` must be absent or `false` in the target environment so
  the dormant storefront rollback cannot be exercised during Valor QA.

## Implementation Status

| Workstream | Code status | Remaining closure |
| --- | --- | --- |
| HQ Valor boarding | Complete and previously sandbox verified | Reconfirm on the target staging deployment. |
| Hosted online ordering | Complete | Apply resolver migration, deploy Edge Functions, provision account, run sandbox E2E. |
| QR dine-in payment | Complete in website/customer flow | Apply QR migrations and run QR-to-paid-order E2E. |
| Merchant invoices | Complete | Provision `invoice` account and run Passage success/decline/idempotency QA. |
| Web refund/void | Complete | Prove unsettled void, settled full refund, and settled partial refund. |
| SaaS billing card setup | Complete | Apply lifecycle migration and validate Passage/Vault in staging. |
| Native Valor recurrence | Complete | Create one controlled native schedule and observe a sandbox cycle. |
| Failed-payment recovery | Complete | Send controlled signed failed/success events and verify state/notifications. |
| Grace, suspension, restoration | Complete | Deploy workers and execute controlled time/state QA. |
| Settlement webhook | Built and previously staging verified | Confirm target URL, secret, event selection, and watchdog. |

## SaaS Billing Implementation

### Merchant Card Setup

- `MerchantBillingSetupCard` renders Passage.js for card entry.
- The server exchanges the Passage token for Valor customer/payment profiles.
- Only Valor Vault identifiers are persisted; PAN and CVV are never stored.
- Card replacement updates every applicable native Valor subscription.
- ACH records remain a non-card billing record and do not invoke NMI.

### Schedule Creation and Recovery

- `billing-charge-subscription` resolves the active primary processor account
  with purpose `subscription`.
- A missing native schedule is created with Valor `addSub`.
- A suspended native schedule is activated before recovery.
- Existing schedules use Valor `updateSub` for payment-profile replacement or
  the current past-due charge.
- Cancel and suspend operations call Valor delete/deactivate endpoints before
  local schedule status is changed.
- If Valor rejects a lifecycle transition, merchant-tier and local subscription
  changes are rolled back rather than reporting false success.

### Recurring Webhook

- The shared `valor-webhook` verifies HMAC-SHA256 and accepts recurring events.
- `valor_recurring_webhook_events` claims each event idempotently.
- Processor transaction ID is the business idempotency key across webhook
  redeliveries.
- A due local invoice is generated if Valor wins a race with the monthly invoice
  worker.
- A payment event without a durable due invoice fails closed with HTTP 500 so
  Valor can retry; subscription state is not changed without invoice evidence.
- Success marks the invoice paid and restores past-due/suspended subscriptions.
- Failure marks the invoice failed and subscription past due, then notifies the
  merchant and HQ.

## Database Change

### `20260830130000_valor_saas_billing_lifecycle.sql`

Not yet executed by this implementation pass.

It adds:

- Valor processor and payment-profile references to merchant billing profiles.
- Native recurring schedule fields on merchant subscriptions.
- Provider-neutral processor transaction fields on subscription invoices.
- Unique schedule and processor-transaction indexes.
- `valor_recurring_webhook_events`, protected with enabled and forced RLS,
  service-role-only grants, and an idempotency key.

Apply this migration after the earlier subscription billing authorization and
grace/retry migrations and before deploying the updated billing workers.

After applying it to staging, regenerate `app/database.types.ts` from staging
and compare the generated result with the checked-in type additions.

## Changed Files

### Website

- `app/dashboard/actions/subscription-billing.ts`
- `app/manage/actions/merchant-billing.ts`
- `app/manage/actions/subscription-billing.ts`
- `components/billing/HqSubscriptionsWorkspace.tsx`
- `components/billing/MerchantBillingSetupCard.tsx`
- `components/billing/MerchantSubscriptionOverviewCard.tsx`
- `components/billing/SubscriptionBillingAdminCard.tsx`
- `lib/payments/valor/subscriptionApi.ts`
- `app/database.types.ts`

### Edge Functions

- `supabase/functions/_shared/valor.ts`
- `supabase/functions/billing-charge-subscription/index.ts`
- `supabase/functions/billing-mark-paid/index.ts`
- `supabase/functions/billing-retry-due-invoices/index.ts`
- `supabase/functions/billing-suspend-overdue/index.ts`
- `supabase/functions/valor-webhook/index.ts`

### Migration and Tests

- `supabase/migrations/20260830130000_valor_saas_billing_lifecycle.sql`
- `tests/subscription-billing-safety.test.ts`
- `tests/valor-subscription-api.test.ts`

Other Valor storefront, invoice, refund, QR, and settlement files were already
integrated on the branch before this SaaS completion pass.

## Automated Verification

- Focused Valor/SaaS tests: 2 files, 13 tests passed.
- Next.js production build: passed; 122 routes generated.
- Valor request construction verifies `addSub`, `updateSub`, `activateSub`,
  `de-Activate`, and `deleteSub` contracts.
- Changed website files have no isolated TypeScript errors.
- Full-repository `tsc --noEmit` remains blocked by unrelated existing errors,
  including Clerk API drift, duplicate order interfaces, and Node checking Deno
  imports.
- Focused ESLint remains blocked by existing synchronous state initialization
  effects in the large billing workspaces. No runtime/build failure results.
- Deno CLI is not installed locally, so Edge Function type validation must run
  in Supabase/staging.

## Deployment Order

1. Review and apply all prerequisite subscription authorization and grace/retry
   migrations in their timestamp order.
2. Apply `20260830130000_valor_saas_billing_lifecycle.sql` to staging once.
3. Regenerate Supabase TypeScript types.
4. Confirm an active primary Valor processor account for each tested purpose.
5. Deploy updated Edge Functions:
   - `billing-charge-subscription`
   - `billing-mark-paid`
   - `billing-retry-due-invoices`
   - `billing-suspend-overdue`
   - `valor-webhook`
6. Configure `VALOR_ENV=sandbox`, Valor account credentials, and
   `VALOR_WEBHOOK_SECRET` in the correct server/Edge Function secret stores.
7. Configure Valor recurring and settlement webhook events for the deployed
   `valor-webhook` URL.
8. Run the manual QA in
   `docs/features/payments/QA-2026-08-30-VALOR-WEBSITE-E2E.md`.
9. Obtain senior sign-off before production promotion.

## Remaining External Prerequisites

- Valor sandbox portal access and complete sandbox card response data.
- Permission to configure recurring and settlement webhooks.
- A controlled merchant boarded with active Valor `online_order`, `invoice`,
  and `subscription` accounts as required by each scenario.
- Approved staging migration and Edge Function deployment access.
- One full native recurring cycle or Valor-assisted accelerated recurrence test.

## Production Gate

Do not mark the Valor ticket Done until staging proves:

- Exactly one charge for each online order, QR order, invoice, and SaaS cycle.
- Idempotent duplicate request and webhook handling.
- Decline and transport-failure recovery.
- Unsettled void, settled full refund, and settled partial refund.
- SaaS failure notification, past-due state, grace handling, suspension, card
  replacement, successful recovery, and restoration.
- Merchant/location/purpose isolation.
- Valid/invalid HMAC behavior and operational logs.
