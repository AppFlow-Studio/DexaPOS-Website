# NMI Billing Rail Plan

## Contract

- Dexa is the billing source of truth.
- NMI is the payment rail only.
- Recurring subscription math, enabled services, quantities, invoice generation, retry state, and suspension state stay in Dexa.
- NMI is used for:
  - storing reusable billing methods in Customer Vault
  - charging the final invoice total

## What is already true

- Online ordering NMI checkout works with Dexa-calculated totals.
- Subscription invoices are stored in `public.subscription_invoices`.
- Service-catalog billing exists in Dexa:
  - `public.billable_services`
  - `public.merchant_subscription_services`
- Manual invoice generation exists.
- Manual subscription charge exists.

## Immediate fixes

### 1. Close paid online-order checks

Paid online card orders must not remain with an open check.

Implementation:
- on successful card capture in `supabase/functions/create-online-order/index.ts`
  - set `orders.payment_status = 'paid'`
  - set `orders.amount_due = 0`
  - set `orders.check_status = 'Closed'`
  - set `orders.closed_at = now()`

### 2. Payment emails after successful payment

Two separate payment-email flows are required.

- Online order payment email
  - recipient: customer email used during checkout
  - trigger: successful online card payment

- Subscription invoice payment email
  - recipient: merchant owner email
  - trigger: successful subscription invoice charge

Notes:
- this is payment confirmation email behavior, not full PDF invoicing
- subscription invoice records already exist in Dexa

## Core missing foundation

### Vault-backed merchant billing onboarding

Current merchant billing setup stores token metadata manually.
That is not sufficient for production recurring billing.

Required target flow:

1. merchant or HQ enters billing card in Dexa
2. frontend tokenizes card securely
3. backend creates/updates NMI Customer Vault entry
4. Dexa stores only the durable vault reference plus display metadata

Fields that Dexa should persist:
- durable NMI vault/customer/payment-method reference
- card brand
- card last 4
- expiration month/year

## Recommended implementation order

### Phase 1
- close paid online-order checks automatically
- send online-order payment emails
- send subscription payment emails

### Phase 2
- replace manual `cardToken` billing onboarding with:
  - secure card capture
  - tokenization
  - NMI Customer Vault creation
  - durable vault reference storage

### Phase 3
- switch subscription charge path to use the durable vault reference explicitly
- remove dependency on manually pasted billing tokens

### Phase 4
- automate monthly subscription charging with Dexa cron:
  - generate invoices
  - charge open invoices
  - retry failed invoices
  - suspend overdue subscriptions

## Non-goals

- NMI-owned recurring plan objects as the system of record
- pushing service line items or quantity math into NMI

## Why this model

- pricing is dynamic by location and quantity
- Dexa already needs to own service assignments and invoice math
- NMI recurring plan sync would add mirrored-state complexity without removing Dexa’s core billing logic
