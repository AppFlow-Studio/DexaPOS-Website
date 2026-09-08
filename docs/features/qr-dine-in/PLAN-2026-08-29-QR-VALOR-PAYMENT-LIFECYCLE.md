# QR Table Ordering - Valor Payment Lifecycle

## Source Tickets

- QR ticket: **Ali Awdi - QR Table Ordering (Edge, Storefront, Dashboard)**
  - Notion page ID: `3658280c-1b1d-8135-94b3-f54439e54c50`
  - URL: https://www.notion.so/3658280c1b1d813594b3f54439e54c50
- Valor ticket: **[Valor] Complete Integration - Online Payments, Invoices, SaaS Monthly Billing**
  - Notion page ID: `3c68280c-1b1d-8106-8352-ee19b4b32807`
  - URL: https://www.notion.so/3c68280c1b1d81068352ee19b4b32807
- Superseded implementation source: PR `#251` / commit `a80a4086`.
  That branch is substantially behind preview and must not be merged wholesale.

## Problem

QR checkout already used the same storefront payment path as ordinary online
orders, and that path now defaults to Valor. The customer cancellation edge
function still rejected every processor other than NMI. A QR customer could
therefore be charged through Valor but could not automatically void or refund
the charge when cancelling or when the pending-order timeout fired.

The stale QR PR also contained a correct tip-accounting migration, but applying
that migration alone would have made the current admin Valor refund use a
tip-exclusive amount as its full-refund ceiling. The payment, reporting,
notification, and refund changes must ship as one contract.

## Implemented In Code

- [x] Added documented Valor refund and void calls to the Deno payment module.
- [x] Added Node/Deno golden-body parity tests for Valor refund and void payloads.
- [x] Added Valor response classification tests.
- [x] Updated QR/customer cancellation to route by `processor_name`.
- [x] Valor cancellation resolves the exact account stored in
  `order_payments.metadata.valor_account_id` and audits credential access.
- [x] Unsettled Valor payments are voided; settled payments are refunded.
- [x] NMI remains supported behind the existing storefront kill switch.
- [x] NMI void reasons now use the v5 enum instead of customer free text.
- [x] NMI reversal success recognizes v5 cancelled/refunded conditions.
- [x] Both providers retry the opposite operation only for an explicit settlement
  state mismatch.
- [x] The local reversal is persisted with the existing service-role-capable
  `apply_refund_to_payment` RPC.
- [x] Added a migration that stores online order lane totals tip-exclusive while
  retaining payment totals and `amount_paid` as the actual card charge.
- [x] Updated the admin Valor refund ceiling to use the charged
  `order_payments.total_amount`, including gratuity.
- [x] Updated order notification totals to add the separately stored tip.
- [x] Added QR table number to the receipt template.
- [x] Persisted merchant online-order notification preferences.
- [x] Respected the email-on-order-placed preference for the direct payment email.
- [x] Added QR checkout reload recovery and tracking hydration stability.

## Files

- `app/dashboard/actions/refund-online-order.ts`
- `app/dashboard/online-ordering/hooks/useOnlineOrderingSettings.ts`
- `app/sites/components/OrderTrackingPage.tsx`
- `app/sites/components/checkout/CheckoutPage.tsx`
- `lib/messaging/order-notifications.ts`
- `lib/messaging/receipt-template.ts`
- `lib/payments/__tests__/valor-storefront-deno-parity.test.ts`
- `supabase/functions/_shared/nmi.ts`
- `supabase/functions/_shared/payment-emails.ts`
- `supabase/functions/_shared/valor.ts`
- `supabase/functions/cancel-online-order/index.ts`
- `supabase/functions/create-online-order/index.ts`
- `supabase/migrations/20260829120000_process_online_order_total_amount_tip_exclusive.sql`

## Deployment Order

Do not deploy only part of this set.

1. Review and apply
   `20260829120000_process_online_order_total_amount_tip_exclusive.sql` on staging.
2. Deploy `create-online-order` and `cancel-online-order` from the same commit.
3. Confirm `VALOR_ENV=sandbox` and the existing Valor storefront environment are
   configured for both functions.
4. Confirm the test location resolves an active primary Valor `online_order`
   processor account with credentials.
5. Deploy the website build from the same commit.
6. Run the sandbox QA below before production promotion.

No migration or edge-function deployment was performed while implementing this
change.

## Automated Verification

- `npm test -- --run lib/payments/__tests__/valor-storefront-deno-parity.test.ts lib/payments/__tests__/valor-refund.test.ts`
  - Result: 23 tests passed.
- `npm test -- lib/payments`
  - Result: 13 test files and 212 tests passed.
- Targeted ESLint for the payment, settings, notification, receipt, payment-email,
  and Valor parity files completed with no findings.
- `npm run build`
  - Result: successful optimized Next.js production build; all 122 routes were
    generated without a build failure.
- TypeScript `transpileModule` parse check for both changed Edge Functions and
  their NMI, Valor, and payment-email modules completed without syntax errors.
- Repository-wide `npx tsc --noEmit` is not a usable gate on the current preview
  baseline: it reports numerous unrelated Clerk, application, and Deno-under-Node
  errors.
- Targeted ESLint reaches pre-existing React effect/compiler findings in the QR
  checkout and tracking components.

## Manual QA

### A. Valor QR sale

1. In merchant dashboard, enable QR dine-in and create or choose a table QR.
2. Open the hosted QR URL in a clean browser session.
3. Add an item and tip, then pay with the Valor sandbox card flow.
4. Confirm the order page loads and the dashboard/POS receives a `qr_dine_in`
   order.
5. Confirm `order_payments.processor_name = 'valor'` and metadata contains the
   Valor account ID.
6. Confirm `orders.total_amount` excludes tip while `order_payments.amount` and
   `order_payments.total_amount` equal the actual card charge.

### B. Unsettled customer cancellation

1. Place another QR order and leave it pending.
2. Cancel from the customer tracking page before settlement.
3. Confirm Valor records a void.
4. Confirm the order becomes `void` and the payment becomes `void` locally.
5. Confirm a second cancellation attempt cannot move money again.

### C. Timeout cancellation

1. Place a QR order and leave it pending until the configured timeout.
2. Confirm the automatic cancellation uses the same Valor void path.
3. Confirm the order status, payment status, and tracking page agree.

### D. Settled refund

1. Use a sandbox transaction known to be settled, or mark settlement only through
   the approved sandbox settlement workflow.
2. Cancel/refund it.
3. Confirm Valor records a refund rather than a void.
4. Confirm local refunded amount includes the tip and does not exceed the charged
   total.

### E. Admin partial refund

1. Open the Valor-paid QR order in dashboard order details.
2. Issue a partial refund and verify the Valor response and local reversal row.
3. Issue the remaining refund and confirm total refunds equal the original card
   charge, including tip, without exceeding it.

### F. Reliability and notifications

1. Reload immediately after successful QR payment; confirm it returns to the
   existing order tracking page instead of an empty checkout.
2. Confirm order tracking hydrates without a mismatch warning.
3. Confirm the receipt shows the table number and correct single-counted tip.
4. Disable `email_on_order_placed`, save, reload, and place a test order; confirm
   the preference persists and the direct payment email is not sent.

## Remaining Before Done

- [ ] Staging migration applied and recorded.
- [ ] Both edge functions deployed together.
- [ ] Valor sandbox sale, void, settled refund, and partial refund verified.
- [ ] QR timeout behavior verified against a real pending order.
- [ ] NMI kill-switch regression verified once.
- [ ] Screen recording attached to the ticket.
- [ ] Verifier signs off before merge/production promotion.
