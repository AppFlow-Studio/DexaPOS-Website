# Valor Website E2E QA and Recording Guide

## Recommendation

Record four focused videos instead of one long video. Each video has one clear
audience and can be replaced independently if a scenario fails or changes.

QR checkout is a website/customer-browser flow for this recording plan. No POS
screen recording is required unless the reviewer separately asks to prove the
order on a physical register or KDS.

## Prerequisites

- Staging migrations and updated Edge Functions are deployed.
- `VALOR_ENV=sandbox` is set in all Valor payment functions.
- `PAYMENTS_FORCE_NMI` is absent or set to `false` for every website payment
  function used in the recording.
- `VALOR_WEBHOOK_SECRET` exactly matches the enabled Valor webhook secret.
- A controlled merchant is boarded on Valor.
- The test location has active primary Valor accounts for `online_order` and
  `invoice`.
- The merchant has an active primary Valor account for `subscription`.
- Hosted storefront and QR URLs are reachable from a private/mobile browser.
- Use only approved Valor sandbox card data; never expose credentials or full
  card values in the recording.
- The storefront Passage form must show billing street address and ZIP. These
  AVS values are forwarded with the tokenized sale; raw card data remains inside
  Passage.js and must never pass through DEXA.
- The order contact name is not sent as Valor's optional `cardholdername`.
  Passage.js tokenization remains the source of payment-card identity.

### Storefront sale correction - 2026-08-30

- Passage.js card tokenization succeeded, but the server-side charge returned a
  `502 payment_gateway_error` with no Valor response code.
- Root cause: the sale clients posted to `/?saleToken`. Valor's current
  Passage.js contract posts the card token to `/?sale` and identifies the source
  with `ecomm_channel: passagejs`.
- Both the Node payment adapter and Deno Edge Function client now use the
  documented endpoint and parse the documented `txnid`, `msg`, and `desc`
  response fields.
- Both clients normalize Valor's constrained Passage.js fields identically:
  invoice IDs are alphanumeric and at most 12 characters, US phone numbers
  contain 10 digits, ZIP codes contain 5 digits, and customer/address fields
  stay within the documented lengths.
- Tip remains part of the charged grand total and the local order breakdown,
  but is not emitted as an unsupported top-level field to Valor's Passage.js
  Sale API.
- Deploy the updated `create-online-order` function before repeating the
  staging payment recording.

### Current Staging Readiness - 2026-08-30

- The required migrations and payment/billing Edge Functions are deployed.
- Joes Coffee Shop / Uptown Branch is provisioned for `online_order` and
  `invoice`; the merchant is provisioned for merchant-global `subscription`.
- Both new purpose accounts pass the credential-decryption RPC check.
- No billing profile or payment was created automatically. Create the sandbox
  profile through Passage during the SaaS recording so tokenization and Vault
  persistence are part of the evidence.
- The deployed storefront payment Edge Function successfully mints a sandbox
  Passage client token for Joes Coffee Uptown. Card tokenization is a separate
  browser-to-Valor request: direct non-charging probes to Valor's sandbox
  transaction host on both `4430` (Passage.js default) and `443` timed out from
  this workstation on 2026-08-30. A Vercel preview does not proxy that browser
  request, so complete card E2E from a network that can reach the Valor sandbox
  host or ask Valor to confirm sandbox/IP access before rotating credentials.

### QA Processor Compatibility - 2026-08-31

- Network access is no longer the blocker. Passage tokenization and direct
  calls to Valor's sandbox transaction and Vault hosts succeed from this
  workstation.
- The DEXA-boarded Uptown EPI returns `E98/VP` (`Merchant Profile Update
  Required`) for Sale and Add Subscription. Valor/ISO must correct that
  processor profile before it can be used as production-like QA evidence.
- Valor's documented public sandbox transaction profile approved a tokenized
  Sale, a Void, and a non-charging Add Subscription request. Its profile
  requires `surchargeIndicator="1"`.
- Valor's documented public sandbox EPI is recognized directly in sandbox so
  staging QA does not depend on secret-management access. An optional
  `VALOR_QA_SURCHARGE_EPI` supports one additional controlled QA EPI. The
  resolver always returns `"0"` in production and for every non-matching EPI.
- The live Vault API requires `billing_*` and `shipping_*` address keys; the
  previous generic address payload returned HTTP 400. The website client now
  emits the live contract and parses both `errors[]` and legacy `error[]`.
- The live Add Subscription API requires `subscription_starts_from` as
  `YYYY-MM-DD`. The published schema still says `YYYYMMDD`, but the latter is
  rejected with `SUB07`; both Node and Edge clients now use the live format.
- Supabase project RBAC currently blocks this workstation from setting the QA
  secret or deploying functions to `dfwqakoyittmrwbqvxgw`. No staging account
  was switched while deployment was incomplete.

#### Authorized staging deployment

Run these only after `npx supabase login` uses an account with Edge Function
deployment access to the staging project:

```powershell
npx supabase functions deploy create-online-order --project-ref dfwqakoyittmrwbqvxgw
npx supabase functions deploy cancel-online-order --project-ref dfwqakoyittmrwbqvxgw
npx supabase functions deploy billing-charge-subscription --project-ref dfwqakoyittmrwbqvxgw
```

After deployment, route only the controlled staging `online_order`, `invoice`,
and `subscription` processor accounts, preserve a rollback snapshot, and rerun
the API smoke tests before opening the recording URLs.

## Video 1 - HQ Boarding and Processor Provisioning

### Goal

Show that HQ can prepare a merchant for Valor without direct database edits.

### Steps

1. Sign in as an HQ billing/merchant administrator.
2. Open `/manage/merchants/<merchantId>`.
3. Open the Business section and show that required owner, address, business
   type, and EIN fields are complete.
4. Open the Valor boarding panel.
5. Run boarding or re-provision the controlled merchant.
6. Show the successful result and the provisioned locations.
7. Open the payment/processor account view and show active Valor accounts by
   purpose. Mask EPI, app key, and any secret.
8. Run re-provision once more to demonstrate idempotency: the merchant is reused
   and only missing stores/accounts are created.

## Video 2 - Hosted Online Order and QR Dine-In

### Part A - Hosted Storefront

1. Open the hosted storefront in a private browser.
2. Add an item, modifier, tax, and tip.
3. Proceed to checkout and show the Valor Passage form.
4. Enter the approved sandbox card plus its AVS street address and ZIP.
5. Pay with approved sandbox data.
6. Show the customer confirmation page and order number.
7. In the merchant dashboard, open `/dashboard/orders` and the order detail.
8. Show paid status, total/tip agreement, and Valor transaction reference.

### Part B - QR Dine-In

1. Open the table QR management page and show an active QR/table assignment.
2. Scan the QR with a phone or open its public URL in a private browser.
3. Add an item and pay with Valor Passage.
4. Show the QR customer confirmation and order number.
5. Open the order in `/dashboard/orders` and confirm table/QR context and paid
   status.
6. Refresh/reopen the QR URL and show that the completed payment is not charged
   again.

## Video 3 - Invoice Payment and Online-Order Reversal

### Part A - Invoice

1. Open `/dashboard/invoices/new` and create an invoice for a test customer.
2. Send the invoice and open its public `/invoice/<token>` URL privately.
3. Pay through Valor Passage.
4. Return to `/dashboard/invoices/<id>` and show Paid status and Valor
   transaction reference.
5. Refresh/reopen the public link and show already-paid protection.

### Part B - Refund/Void

1. Open a recently paid Valor online order at `/dashboard/orders/<orderId>`.
2. Before settlement, demonstrate a void on one controlled order.
3. After settlement, demonstrate a full or partial refund on another controlled
   order.
4. Show the reversal status, amount, and updated payment/order totals.
5. Attempt the same reversal again and show duplicate/over-refund protection.

## Video 4 - SaaS Subscription, Failure, and Recovery

### Part A - Setup and Initial Collection

1. As the merchant, open `/dashboard/subscriptions`.
2. Request a plan and show the explicit recurring-charge authorization.
3. As HQ, open `/manage/subscriptions/<merchantId>` and approve/activate it.
4. Open the merchant billing setup and add/replace the card through Passage.
5. Show that the profile is **Valor ready**.
6. Generate or open the subscription invoice and use **Pay now**.
7. Show the invoice Paid, subscription Active, and Valor transaction reference.

### Part B - Controlled Failure

1. Use the approved sandbox decline scenario or a signed controlled recurring
   failure webhook.
2. Show the invoice Failed and the subscription Past Due.
3. Show merchant and HQ in-app notifications and the configured emails.
4. Show the grace-period/deactivation information in HQ.
5. If staging time controls permit, run suspension and show Suspended state.

### Part C - Recovery

1. As the merchant, replace the card through Passage.
2. Use **Pay now** on the failed invoice.
3. Show Valor `updateSub` recovery succeeding.
4. Show the invoice Paid, subscription Active, grace/failure state cleared, and
   merchant/HQ restoration notification.
5. Confirm the website no longer reports an NMI device as SaaS billing
   eligibility.

## Optional Technical Evidence - No Product Video Required

Capture screenshots or a short engineering clip for:

- Valid versus invalid Valor webhook HMAC response.
- Duplicate recurring webhook returning success without a second update.
- `valor_recurring_webhook_events` processed row.
- One local invoice linked to one `processor_transaction_id`.
- Settlement webhook batch adoption and watchdog output.
- Merchant/location/purpose isolation queries.

## Final Sign-Off Checklist

- [ ] Boarding video approved.
- [ ] Hosted online order and QR video approved.
- [ ] Invoice and reversal video approved.
- [ ] SaaS failure/recovery video approved.
- [ ] No secrets or full sandbox card data appear in recordings.
- [ ] Migration and Edge Function versions recorded in the QA notes.
- [ ] Reviewer confirms no duplicate charge across every demonstrated flow.
