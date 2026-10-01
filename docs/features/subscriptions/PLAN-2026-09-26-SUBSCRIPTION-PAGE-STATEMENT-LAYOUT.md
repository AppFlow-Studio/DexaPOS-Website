# Plan — Subscription page: "Statement" layout (Proposal A)

**Date:** 2026-09-26 · **Branch:** `dexaposwebsite-preview` (builds on the uncommitted 2026-09-23 rebuild)
**Page:** `/dashboard/subscriptions` → `components/billing/MerchantSubscriptionOverviewCard.tsx`
**Design source:** canvas "Subscription Page Proposals", board *A · Statement* (+ *A · Mobile*),
https://claude.ai/artifact/RmEpQePQ6hmjA97v5RmVry. Mobbin references behind it: Shopify, Claude,
PlanetScale (overdue + pay), Frame.io / Sketch (line items), Square (per-location billing, monthly
summaries).

## Goal

Answer the owner's questions in the order they ask them, on one scroll with no tabs:

1. Is my account OK? 2. What do I owe and how do I pay it? 3. What's my next charge, and when?
4. What am I paying for? 5. Which card pays for what? 6. What have I paid?
7. How do I change / add / remove / cancel? 8. Is what I asked for on its way?

Q1–Q3 must be answered above the fold.

## Where the canvas is overruled by `docs/UI-DESIGN-SYSTEM.md`

The canvas used 8px-radius buttons, hairline row dividers and brand-blue links. The design system
wins (§0): pill controls (`DS-CTL-01`), **no horizontal lines** (§5.5), `<Table variant="data">` +
card grid below `xl` (§5.3), neutral status pills (`DS-CTL-09`), tinted banners for urgency only,
centred dialogs for panels (`DS-CTL-11`). We take A's **information architecture**, not its pixels.

## Backend facts that shape the plan (research 2026-09-26)

- **No merchant path pays a failed invoice.** The only on-demand charge is the edge function
  `billing-charge-subscription`, callable by HQ (`chargeSubscriptionInvoiceManually`). In `manual`
  mode on an invoice whose sub already has a Valor schedule it only *updates the recurring schedule*
  — an immediate charge is unverified. No idempotency key is sent to Valor; a crash after the claim
  leaves the invoice stuck in `processing`. The failures on test merchants look like the central
  EPI not being provisioned for native recurring (lessons.md 2026-09-14), so a pay button would
  likely fail the same way.
- **Updating a card does not retry failed invoices**, and doesn't re-point the Valor schedule
  (validate-only).
- **Card surcharge** comes from SQL `calculate_subscription_total` (plan `card_surcharge_pct`,
  default 4%, `greatest()` with service pcts, on the whole subtotal; ACH → 0). ~~The page's estimate
  omits the tier surcharge~~ — **corrected in QA:** the Multi-Location tier's rate is 0%, so $180 is
  right; the ~$184 failed invoices are location invoices.
- **"Renews" date is stale**: it reads `merchant_plan_subscriptions.current_period_end`, which only
  HQ writes. The real date is `merchant_subscriptions.next_billing_date` on the tier row.
- **`next_retry_at` is almost always null** (nothing schedules the retry writer). Never render a
  retry date placeholder; show it only when present.
- **Failure reasons are raw Valor text**, shown verbatim today.
- **Statements / CSV, withdrawing a request, removing an add-on, self-serve cancel: do not exist.**
- Support route exists: `/dashboard/support/new`.

## Phase 1 — layout + read-only data (no money moves)

- [x] **P1.1 One scroll, no tabs.** Remove the section rail. Keep `?section=` working: `billing`
      scrolls to *Payments* (billing emails deep-link it), `locations` to *Locations*.
- [x] **P1.2 Header.** "Subscription" · `{plan} · {n} active locations · billed monthly`.
      Change plan becomes an outline pill (it is not the page's primary action).
- [x] **P1.3 One overdue banner** replacing N per-invoice banners: total of failed invoices,
      count, date span, one plain-English reason. Actions per the Phase 2 decision; plus
      "See the N payments" → Payments filtered to Unpaid.
- [x] **P1.4 Other alerts**, one banner each, same component: suspended; over plan limit;
      locations with no card (merged into one banner listing them).
- [x] **P1.5 Next charge.** Amount **including the tier card surcharge**; date from
      `merchant_subscriptions.next_billing_date` (server: select it on the tier row); card + Change.
      Breakdown: plan · location add-ons · card fee ("Waived with ACH" only if ACH is chargeable —
      it is not today, so omit that hint) · total. Drop the `$0 Hardware` line.
- [x] **P1.6 Plan.** Name, pricing sentence, active location count. No coverage bar.
      "Compare plans" opens the existing change-plan dialog.
- [x] **P1.7 Locations and who pays.** One sentence: "The plan is paid by {anchor}. Each location
      pays for its own add-ons." `Table variant="data"` at xl, cards below: Location (address ·
      devices) · Add-ons (active names; pending as a neutral pill) · Paid by (card, "also pays the
      plan" / Add card) · Monthly · **Manage** → centred dialog holding today's devices + request
      hardware, add-ons + request add-on, card link. Inactive locations: "Not billed".
- [x] **P1.8 In progress.** Pending plan / hardware / add-on requests in their own section with a
      Submitted → DEXA review → Active tracker. Removed from the alert count.
- [x] **P1.9 Payments by month.** Group by billing period month; per-month line: N invoices ·
      billed · unpaid. Filter All / Unpaid / Paid. Rows: date · plan or location · invoice # ·
      plain reason if failed · status pill · amount · View / PDF. First 3 per month, then
      "Show N more". No statement download (does not exist — Phase 3).
- [x] **P1.10 Footer.** "Billing emails go to {email} · Change" and
      "Want to pause or cancel? Contact DEXA support" → `/dashboard/support/new`.
- [x] **P1.11 Plain failure reasons.** `describePaymentFailure(raw)` in
      `lib/subscription-billing/` mapping Valor text → owner-facing sentence; raw text never
      rendered to merchants. Vitest cases.
- [x] **P1.12 Pure helpers out of the client module** (lessons 2026-09-23): next-charge math and
      month grouping in `lib/subscription-billing/`, with vitest.
- [x] **P1.13 Verify.** Targeted `tsc`, vitest, DS greps (colour + `border-b|border-t|divide-y`),
      browser QA as Joes Coffee Shop at 1440 and 390, both themes, 0 console errors.

## Phase 2 — "Pay now" (money; needs a decision, see below)

Merchant server action `PaySubscriptionInvoices(invoiceIds)` → own-merchant check → per failed card
invoice, invoke `billing-charge-subscription` in `manual` mode → audit log → return per-invoice
outcome; the toast claims success only for invoices that came back `paid` (lessons 2026-09-14).
Pre-requisites: prove on staging that `manual` mode on an invoice with a live Valor schedule
performs an immediate charge; add a recovery for invoices stuck in `processing`.

## Phase 3 — later / needs product input

Monthly statement PDF · withdraw a pending request · self-serve remove add-on / cancel · ACH that
can actually be charged · a scheduler for dunning (`next_retry_at`).

## Results (2026-09-26)

Phase 1 built. Everything is uncommitted on `dexaposwebsite-preview`, alongside the 2026-09-23 work.

**Files changed:**
- `components/billing/MerchantSubscriptionOverviewCard.tsx`: rewritten render, dialogs kept.
- New helpers in `lib/subscription-billing/merchant-billing-statement.ts`: `estimateNextCharge`,
  `describePaymentFailure`, `groupInvoicesByMonth`, plus 13 vitest cases.
- `app/dashboard/actions/subscription-billing.ts`: `tierNextBillingDate` added.
- `app/dashboard/layout.tsx`: the Dashboard nav item no longer highlights on every
  `/dashboard/*` page.

**Deviations from the plan:**
- **P1.3:** the overdue banner offers *Update payment method* + *Contact DEXA billing* (user decision). When
  every failure is on the processor side, only *Contact DEXA billing* is shown, because a new card
  can't fix it.
- **P1.5:** no tier fee is added, because the catalogue rate is 0%. A past billing date reads
  "Was due {date} · not collected yet".
- **P1.10:** the support link carries `?category=billing`, but the support form doesn't read it yet.
  Another session is rewriting `app/dashboard/support/new/page.tsx`, so the one-line prefill was left
  to avoid a clobber.
- **Card brands:** raw vault tokens like "credit-card" now render as "Card".

**Verified:**
- `tsc`: no errors in the changed files.
- eslint: clean.
- vitest `lib/subscription-billing`: 35/35 pass.
- DS greps: colour appears only in the sanctioned tinted banners; no dividers.
- Browser as Joes Coffee Shop at 1440 (light and dark) and 390:
  - 0 console errors, 0px horizontal overflow on mobile, no tab rail, no raw processor text.
  - Manage dialog, row menu (View/PDF), "See the 5 payments" → Unpaid filter.
  - `?section=billing` scrolls to Payments; legacy `/billing` redirects.
  - Only "Subscriptions" is highlighted in the sidebar.

**Contract tests:** `tests/subscription-billing-safety|scope`, `saas-admin-completion` and
`merchant-billing-exemption` pass (61/61 with the lib tests).
`subscription-billing-safety` had been failing since the 2026-09-23 rebuild, which dropped the
required copy "Update payment method" and "charged automatically". Both are restored: the banner
button and the Payments caption.

**Gaps:** see [PROBLEMS-2026-09-26-SUBSCRIPTION-BILLING-GAPS.md](./PROBLEMS-2026-09-26-SUBSCRIPTION-BILLING-GAPS.md).
