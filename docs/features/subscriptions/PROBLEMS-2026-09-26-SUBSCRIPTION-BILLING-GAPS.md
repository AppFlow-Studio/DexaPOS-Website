# Problems — Subscription billing gaps found during the page redesign

**Date:** 2026-09-26 · **Found while:** planning the "Statement" layout for `/dashboard/subscriptions`
([plan](./PLAN-2026-09-26-SUBSCRIPTION-PAGE-STATEMENT-LAYOUT.md)).
**Audience:** whoever owns subscription billing (backend + Valor) and product.

The redesigned page asks the owner's billing questions in order. These are the answers the backend
cannot give today. Each item shows what the owner sees, the cause with file references, and what a
fix needs. The page works around every one of them honestly. Nothing here is fixed yet.

Severity: **P0** = money or trust at risk now · **P1** = a core owner question goes unanswered ·
**P2** = a missing convenience.

---

## P0-1 · A merchant cannot pay an overdue balance

**Owner sees:** "$X overdue", but the only buttons are *Update card* and *Contact DEXA billing*.
There is no pay button.

**Cause.**
- The only on-demand charge is the edge function `supabase/functions/billing-charge-subscription`.
  Only HQ can call it, through `chargeSubscriptionInvoiceManually`
  (`app/manage/actions/subscription-billing.ts:4087`, permission `system.billing.manage`).
- `app/dashboard/actions/subscription-billing.ts` has no charge or retry export.
- **Updating the card does not retry anything.** `saveMerchantBillingCardWithVault`
  (`app/manage/actions/merchant-billing.ts:848-1127`) swaps the card, but it never calls the charge
  function. Its Valor schedule update is `validateOnly: true`, so the recurring schedule may still
  point at the old vault profile.

**Why it wasn't built into the redesign.**
- In `manual` mode, an invoice whose subscription already has a Valor schedule only gets
  `updateRecurringSubscription`. Nobody has verified that this charges immediately.
- No idempotency key is sent to Valor.
- A crash after the `processing` claim leaves the invoice stuck, and nothing recovers it.

**Fix needs:**
1. Prove on staging that an immediate charge happens.
2. Add a merchant action `PaySubscriptionInvoices`: check the merchant owns the invoices, charge
   them, audit the attempt, and report the outcome per invoice. The toast must claim success only
   for invoices that came back `paid` (see the lessons.md entry for 2026-09-14).
3. Add recovery for invoices stuck in `processing`.
4. Decide whether saving a new card should retry failed invoices automatically.

## P0-2 · Recurring charges are failing at the processor

**Owner sees:** several failed payments in a row on the test merchant (Joes Coffee Shop).

**Cause (suspected):** the central EPI is not provisioned for Valor native recurring. `/?addSub`
returns HTTP 200 with an empty body (see the lessons.md entry for 2026-09-14). A pay button would
fail the same way until this is fixed, which is why P0-1 is blocked on it.

**Fix needs:** Valor to confirm how the EPI is provisioned, then one successful end-to-end charge on
staging.

## P0-3 · Raw processor errors reach merchants

**Owner sees (before this redesign):** text like *"Valor returned HTTP 200 with an empty response
body… This EPI may not be provisioned for native recurring"*.

**Cause.** `last_payment_error` holds raw Valor text:
- `billing-charge-subscription/index.ts:450`
- `valor-webhook/index.ts:222-225`
- `_shared/valor.ts:531-553`

**Status:**
- **The page is fixed by this redesign.** A new `describePaymentFailure()` maps that text to a plain
  sentence.
- **Emails are still unfixed.** They send the raw text
  (`supabase/functions/_shared/subscription-failure-notifications.ts:251`). The same mapper should
  be used there.

## P1-1 · There's no real "next retry" date

**Owner sees:** no retry date, because we don't invent one.

**Cause:**
- The only writer of a non-null `next_retry_at` is `supabase/functions/billing-handle-failure`, and
  nothing in the repo calls it.
- The charge function and the webhook both write `null`.
- No cron schedules `billing-retry-due-invoices` or `billing-suspend-overdue`.
- Valor's native schedule does its own retries (`retry_count: '1'`), but we never store when the
  next one is.

**Fix needs:** decide who owns dunning, DEXA or Valor, then either schedule the sweeper or store
Valor's next attempt date.

## P1-2 · The next-charge estimate is a client-side copy of the SQL pricing

**Premise corrected during QA.** We first thought the page's $180 estimate was missing a tier card
fee, because failed invoices were about $184. It isn't:
- The Multi-Location tier's `card_surcharge_pct` is **0** in the catalogue, so the SQL charges no fee
  on the plan and $180.00 is right.
- The ~$184.08 failed invoices are **location** invoices ($177.00 + 4%), not the plan.

**The real, smaller problem:** the page recomputes the total in TypeScript
(`lib/subscription-billing/merchant-billing-statement.ts` → `estimateNextCharge`) by mirroring SQL
`calculate_subscription_total`
(`supabase/migrations/20260910130000_location_count_tier_and_fine_dining.sql:92-295`). It now
applies the fee the same way the SQL does, per subscription, but it is still a copy. The copy can't
see a location subscription's own plan rate, so it uses the highest add-on rate.

**Fix needs:** have the overview return `merchant_subscriptions.monthly_amount` per subscription,
or call `calculate_subscription_total`, so there is one source of truth.

**Related data problem:** several `serviceAssignments` resolve to no catalogue service, so
locations that are invoiced monthly (e.g. Uptown Branch at $212.16) show $0.00 of add-ons.

## P1-3 · The "Renews" date is stale

**Cause:** the page read `merchant_plan_subscriptions.current_period_end`, which only HQ's
`upsertMerchantTierSubscription` writes. The real date is `merchant_subscriptions.next_billing_date`
on the tier row. Invoice generation advances that date.

**Status:** the page now reads `next_billing_date`. The other table's column still goes stale for any
other reader.

**Also stale:** on the test merchant, `next_billing_date` is **Sep 7** as of Sep 26. The date only
moves when a cycle is invoiced, and nothing schedules that (see P1-1). The page now says "Was due
Sep 7 · not collected yet" instead of presenting a past date as the next charge.

## P1-4 · ACH is saved but can never be charged

**Owner sees:** nothing, because the page no longer says "Waived with ACH".

**Cause:** a merchant can save an ACH profile (`saveMerchantBilling`), but:
- the charge function rejects non-card invoices (`billing-charge-subscription/index.ts:143-152`);
- `resolve_subscription_billing_profile` requires a card.

The waived-fee promise could not be kept.

**Fix needs:** product decision. Either support ACH through Valor or stop offering it.

## P1-5 · No self-serve way to change what you pay for

These don't exist for merchants:
- withdrawing a pending request (a `cancelled` status exists, but nothing writes it);
- removing an active add-on;
- cancelling a location or the plan.

Only HQ can do these:
- `replaceSubscriptionServiceAssignments` (`app/manage/actions/subscription-billing.ts:3328`);
- `upsertMerchantSubscription` / `saveAndChargeMerchantSubscription` with status `canceled`.

**Owner sees:** "Want to pause or cancel? Contact DEXA support."

**Fix needs:** product decision on what merchants may do themselves. Start with withdrawing a
pending request, because it moves no money.

## P2-1 · No monthly statement

**Owner sees:** payments grouped by month with totals, but no single statement to hand to an
accountant. Only per-invoice PDFs exist (`lib/subscription-billing/invoice-pdf.ts`,
`/subscription-invoice/[token]/pdf`).

**Fix needs:** a statement PDF or CSV per month covering the plan and every location invoice.

## P2-2 · Card details can be blank

`card_brand`, `card_last_four` and the expiry are pulled best-effort from Valor vault responses
(`app/manage/actions/merchant-billing.ts:103-156`), so a real card can show as just "Card".
On the test merchant, two location cards have `card_brand = "credit-card"` and no last four. The page
now shows "Card" rather than the raw token.

**Fix needs:** capture them from the Passage tokenization response when the card is saved.
