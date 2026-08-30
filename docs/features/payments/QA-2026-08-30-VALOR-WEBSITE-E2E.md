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

### Current Staging Readiness - 2026-08-30

- The required migrations and payment/billing Edge Functions are deployed.
- Joes Coffee Shop / Uptown Branch is provisioned for `online_order` and
  `invoice`; the merchant is provisioned for merchant-global `subscription`.
- Both new purpose accounts pass the credential-decryption RPC check.
- No billing profile or payment was created automatically. Create the sandbox
  profile through Passage during the SaaS recording so tokenization and Vault
  persistence are part of the evidence.
- This workstation timed out connecting directly to Valor's sandbox transaction
  host, but the deployed storefront payment Edge Function successfully minted
  a sandbox Passage token for Joes Coffee Uptown. Run invoice and SaaS card QA
  from the hosted preview because those flows execute through Next.js/Vercel.
  If either hosted flow times out, request Valor/IP allow-list confirmation
  before changing credentials.

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
4. Pay with approved sandbox data.
5. Show the customer confirmation page and order number.
6. In the merchant dashboard, open `/dashboard/orders` and the order detail.
7. Show paid status, total/tip agreement, and Valor transaction reference.

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
