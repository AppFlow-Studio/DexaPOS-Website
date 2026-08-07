# Invoice NMI + Webhook Handoff

## Scope

This handoff covers the final section of the invoice ticket:

- NMI payment rail resolution for public invoice payments
- merchant/location NMI credential reuse for `merchant_to_customer` invoices
- Dexa platform billing rail support for `platform_to_merchant` invoices
- async NMI webhook ingestion for invoice payment status tracking
- HQ configuration inputs for NMI webhook secrets

Ali Awdi completed the invoice creation, send, PDF, public page, quantity, KPI, and admin-billing surfaces.
This document covers the last NMI/webhook integration layer added on top.

## Files Changed

### Payment rail resolution

- `lib/invoices/payment-rail.ts`

What it does:

- resolves the correct payment rail from an invoice row or public invoice token
- supports:
  - `merchant_to_customer` -> active `location_payment_devices` NMI device
  - `platform_to_merchant` -> active `platform_billing_provider_configs` NMI config
- falls back to another active merchant device when an invoice has no `location_id`
- exposes:
  - public tokenization key for the pay page
  - private API key for the charge action
  - webhook secret for webhook verification
  - stable order id helper: `invoicepay:<invoice_payment_id>`

### Public invoice pay bootstrap

- `app/actions/invoices/invoice-payment-bootstrap.ts`

What it does:

- returns only the public tokenization key for `/invoice/[token]`
- uses the shared rail resolver instead of only looking up a location-scoped device
- now supports both merchant invoices and platform invoices

### Live invoice charge action

- `app/actions/invoices/charge-invoice.ts`
- `app/invoice/[token]/PayPanel.tsx`
- `lib/payments/nmi.ts`

What it does:

- charges the canonical server-resolved invoice balance only
- creates an `invoice_payments` attempt row before charging
- generates a stable NMI `orderid` using `invoicepay:<payment_id>`
- writes `payment_events`
- guards:
  - already paid invoice
  - cancelled invoice
  - active attempt already in progress
  - duplicate idempotency key
- stores:
  - `transaction_id`
  - `authorization_code`
  - `card_type`
  - `card_last_four`
  - processor response payload

NMI helper updates:

- `createNmiSale()` now supports `orderId` and billing fields
- when `orderId` is present it prefers NMI classic/direct-post payloads so `orderid` is sent and can be matched in the webhook
- keeps the v5 flow for simpler calls and falls back to classic on invalid-submission responses

### NMI invoice webhook

- `app/api/webhooks/nmi/invoices/route.ts`

What it does:

- accepts NMI invoice-payment webhooks
- verifies the signature using the configured webhook secret
- matches the event back to `invoice_payments` using:
  - `event_body.order_id` -> `invoicepay:<payment_id>`
  - fallback: `transaction_id`
- updates `invoice_payments`
- writes `payment_events`
- flips `invoices.status`, `paid_at`, and `amount_paid` when capture/sale success is confirmed

Important verification note:

- NMI's current docs use the `Signature` header with `HMAC-SHA256(raw_json_body, subscription_secret)`.
- The webhook route now verifies against that documented format.
- It also accepts `Webhook-Signature` as a fallback header name if an environment still proxies it that way, but the hash logic is the raw-body `Signature` flow.

Official source used:

- `https://docs.nmi.com/reference/msu-webhook-subscriptions`
- `https://docs.nmi.com/reference/transaction-events`

### HQ NMI configuration surfaces

- `app/manage/actions/platform-billing-config.ts`
- `app/manage/settings/integrations/DexaBillingNmiRailCard.tsx`
- `app/manage/actions/admin-merchant/online-ordering.ts`
- `app/manage/merchants/[merchantId]/components/OnlineStoreTab.tsx`
- `lib/queries/use-admin-online-ordering.ts`

What changed:

- Dexa platform billing rail can now store a webhook secret
- merchant/location NMI config can now store a webhook secret
- both configuration surfaces expose whether a webhook secret is already configured

## Migration Added

- `supabase/migrations/20260616190000_invoice_nmi_webhook_support.sql`

What it adds:

- `platform_billing_provider_configs.webhook_secret_id`
- `get_platform_billing_provider_payment_secrets(text)`
- `set_platform_billing_provider_webhook_secret(text, text)`
- `get_nmi_device_payment_secrets(uuid)`
- `set_nmi_payment_device_webhook_secret(uuid, text)`

This migration assumes the earlier invoice schema work from the branch is already applied, especially:

- `supabase/migrations/20260612100100_invoice_payments_table.sql`
- `supabase/migrations/20260612100300_payment_events_generalization.sql`

## Runtime Flow

### Merchant -> Customer invoice

1. Merchant creates and sends invoice.
2. Customer opens `/invoice/[token]`.
3. Public page asks `getInvoicePaymentBootstrap()` for the tokenization key.
4. Card is tokenized in Collect.js.
5. `chargeInvoice()`:
   - resolves invoice total server-side
   - resolves the merchant/location NMI rail
   - inserts `invoice_payments` row in `processing`
   - charges NMI with `orderid = invoicepay:<payment_id>`
6. On immediate success:
   - payment row -> `captured`
   - invoice -> `paid`
   - `payment_events` row -> `captured`
7. Webhook later replays or confirms the transaction idempotently.

### Admin -> Merchant invoice

1. HQ creates a `platform_to_merchant` invoice.
2. Merchant opens the same public `/invoice/[token]` page.
3. Bootstrap resolves the Dexa platform NMI tokenization key.
4. Charge action resolves the Dexa platform private API key and webhook secret.
5. The same payment + webhook flow applies, but through the platform rail instead of a location device.

## Configuration Requirements

### Merchant invoice payments

Required:

- active NMI `location_payment_devices` row for the merchant/location
- tokenization key
- private API/security key
- webhook secret

Configured from:

- HQ merchant online ordering payment settings

### Platform invoice payments

Required:

- active `platform_billing_provider_configs` row for provider `nmi`
- tokenization key
- private API key
- webhook secret

Configured from:

- `/manage/settings/integrations`

## Webhook Endpoint

- `POST /api/webhooks/nmi/invoices`

Expected NMI setup:

- register this endpoint in the NMI webhook subscription UI
- use the same secret entered in the relevant Dexa config UI
- subscribe at minimum to:
  - `transaction.sale.success`
  - `transaction.sale.failure`
  - `transaction.sale.unknown`

Supported in the route:

- `transaction.sale.success`
- `transaction.sale.failure`
- `transaction.sale.unknown`
- `transaction.auth.success`
- `transaction.auth.failure`
- `transaction.auth.unknown`
- `transaction.capture.success`
- `transaction.capture.failure`
- `transaction.capture.unknown`

Behavior:

- `auth.success` -> payment row becomes `authorized`
- `sale.success` and `capture.success` -> payment row becomes `captured`, invoice becomes `paid`
- `*.failure` -> payment row becomes `declined`, invoice becomes `payment_failed`
- `*.unknown` -> payment row becomes `failed`, invoice becomes `payment_failed`

## Manual QA

### Merchant -> Customer

1. In HQ, ensure the merchant location has:
   - NMI tokenization key
   - NMI private API key
   - NMI webhook secret
2. In NMI, point the invoice webhook subscription to the staging/public invoice webhook URL.
3. Create a customer invoice with a new total.
4. Send it by email or SMS.
5. Open the public invoice link in a fresh browser session.
6. Confirm the pay page renders Collect.js card fields.
7. Pay with an approval card.
8. Verify:
   - page shows paid confirmation
   - invoice flips to `paid`
   - `invoice_payments` row exists
   - `payment_events` rows include `created` and `captured`
9. Repeat with a declined card.
10. Verify:
   - no false `paid`
   - payment row becomes `declined` or `failed`
   - invoice becomes `payment_failed`

### Double-submit guard

1. Open a fresh payable invoice.
2. Click Pay twice quickly.
3. Verify only one `processing/captured` attempt is created for that invoice.

### Webhook idempotency

1. Use a paid invoice with an existing `invoice_payments.id`.
2. Replay the same webhook payload/signature.
3. Verify:
   - no duplicate `captured` event row for the same payment + PSP reference
   - invoice remains stable

### Admin -> Merchant platform invoice

1. Configure the Dexa billing NMI rail in `/manage/settings/integrations`.
2. Create a `platform_to_merchant` invoice from HQ.
3. Send the invoice to the merchant.
4. Open the public link as the merchant.
5. Pay the invoice.
6. Verify:
   - charge runs through the platform config
   - invoice is visible as merchant payable
   - invoice is not mixed into merchant customer-invoice KPI lists

## Known Notes

- The branch still has unrelated TypeScript issues in shared type files outside this ticket:
  - `types/merchant_locations.ts`
  - `types/order-management.ts`
- A file-scoped TypeScript check on the invoice/NMI path does not surface new invoice-specific errors from this work.
- No commit was created as part of this handoff work.
