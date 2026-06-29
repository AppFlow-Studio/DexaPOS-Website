# [Receipts] Remove "If paid by card" alternative-price line — web, digital, SMS & email

> Source: Notion ticket `3828280c-1b1d-81cf-b1a7-c3c0a083cb57`
> https://app.notion.com/p/Receipts-Remove-If-paid-by-card-alternative-price-line-web-digital-SMS-email-3828280c1b1d81cfb1a7c3c0a083cb57
> Status: **In progress** · Priority: **P2 — Medium** · Created 2026-06-17 · Last edited 2026-06-26
> Images/attachments: **none** (field screenshot is described in text only; "Attach file" property empty)

| Field | Value |
|---|---|
| Priority | P2 — Medium |
| Owner | Ali Awdi |
| Verifier | Abubeckr Elcharfa (DoD sign-off) |
| Type | Display cleanup — merchant request |
| Endpoints | Web merchant-admin order/receipt view (Next.js) · Digital/online receipt (dexaposai.com) · SMS/text receipt · Email receipt |
| Sibling ticket | [POS] printed receipt — Ali Dika. Coordinate so QA runs ONE combined endpoint sweep. |

## Problem
Finalized receipts render a secondary dual-pricing line showing the total for the payment method the customer **did not** use. On a cash-paid order, `If paid by card $51.23` prints beneath `TOTAL (CASH) $50.06`. This is documented behavior ("the receipt shows both prices"), but on a closed transaction the alternative total is redundant. Merchant flagged it as unnecessary information and wants it removed from **every** web-layer receipt endpoint, not just the screenshot surface.

## Current vs. Expected
- **Current:** Charged-method total **plus** an "If paid by [other method]" line, unconditionally, regardless of how the order settled.
- **Expected:** Only the total for the method actually charged (e.g. `TOTAL (CASH)`), plus tender / amount paid. Symmetric — a card-paid receipt must **not** show "If paid by cash" either.

## Evidence
Field screenshot — Saucy – 1144 Hylan Blvd (Staten Island, NY), Order **#S5-0001**, Jun 10 2026 11:32 AM, viewed on **dexaposai.com**:
Subtotal $41.69 · Service Charge $4.28 · Tax $4.09 · **TOTAL (CASH) $50.06** · ~~If paid by card $51.23~~ ← circled in red, remove · Cash $50.06 · Amount Paid $50.06.
Order is fully cash-paid (`Cash` = `Amount Paid` = $50.06); the card-equivalent line adds nothing to a closed cash ticket.

## Root cause hypothesis
Each web receipt renderer composes its total block to emit both `effective_total` (charged) and the dual-pricing alternative total, labeling the unused method "If paid by…", with no check for which method actually settled the order. Most likely concentrated in the **unified receipt renderer** (see Related) rather than duplicated — confirm, remove once, verify each endpoint regardless.

## Proposed solution (display-only)
- **Merchant-admin order/receipt view** — remove the alternative-price row.
- **Digital receipt (dexaposai.com)** — remove the alternative-price row (surface in screenshot; the hosted page that SMS/email link to).
- **SMS/text receipt** (Telnyx; A2P 10DLC pending) — confirm whether the body embeds a total summary inline or only links to the hosted receipt. Inline → remove the alt line; link-only → covered by the digital-receipt fix, but verify the body carries no "If paid by…" summary.
- **Email receipt** (inline HTML + view-online link) — remove the alt line from the inline-HTML total block; confirm the view-online link resolves to the corrected digital receipt.

Do **not** touch `order_items.base_card_price` / `base_cash_price`, `locations.dual_pricing_percentage`, or `calculate_order_dual_totals`. Render-only change. If the unified renderer owns all endpoints, a single removal should propagate — still verify each.

## Acceptance criteria
- Cash-paid order: every web endpoint shows cash total + amount paid, **no** "If paid by card" line.
- Card-paid order: every web endpoint shows card total, **no** "If paid by cash" line.
- All four explicitly verified: admin view, digital receipt, SMS (body or linked receipt), email (inline HTML **and** view-online link).
- Reloading a historical receipt (#S5-0001) no longer renders the alt line.
- `orders` totals and dual-pricing math unchanged before/after — diff is display-only.
- Screen-recording proof across endpoints attached; Abubeckr signs off before Done.

## Related tickets / codebase pointers
- [Receipt rendering unification (dashboard view + SMS/guest receipt page)](https://app.notion.com/p/37d8280c1b1d81c59661dcbfe2d84a3a) — dashboard receipt view and hosted SMS/guest receipt page were unified into one renderer; most likely the single point to remove the line for web + digital + SMS.
- [[Receipts] Branded email receipt — parity with hosted SMS receipt](https://app.notion.com/p/3778280c1b1d819695f5d21c48ffba03) — email inline-HTML template; apply the removal here for the email endpoint.
- [[Receipts] Hosted public SMS receipt (Toast-style)](https://app.notion.com/p/36f8280c1b1d8124bdb2c2cce0984a7a) — hosted SMS receipt page.

## Notes / scope
- **Gated endpoints:** SMS/email may not be fully live (Telnyx A2P 10DLC pending). For any endpoint not yet shipped, the requirement is the **template ships without the line** — flag at QA so a not-yet-live endpoint isn't logged as a failed check.
- **Compliance (Temur):** Cash-discount programs may still require the *cash discount applied* to be disclosed — separate from the alternative total. Removing "If paid by card" is fine; confirm no processor/jurisdiction rule mandates the alt-price specifically.
- **Scope boundary:** Finalized transaction receipt only. Pre-sale dual-price disclosure (menu / CFD) is the separate CFD display-mode work (Charcoal Gardenia) — out of scope.
- **Not a duplicate** of the dual-pricing-lane or split-payment fee-line tickets — those are math/track/fee defects; this is alternative-line removal.

---

## Resolution (implemented on aliawdi-dev)

**Ticket's "unified renderer" hypothesis was wrong.** No single renderer — the alt line was duplicated across **4 React render sites**, each computing its own `alt*` label/total and gating a JSX row on `breakdown.dual && !isMixed`. Removed the alt-tender block + the now-dead `alt*` consts in each:

1. `app/receipts/[t1]/[t2]/page.tsx` — digital receipt (dexaposai.com) + the page SMS/email link to.
2. `components/dashboard/orders/ReceiptModal.tsx` — admin receipt modal.
3. `components/dashboard/orders/OrderDetailSheet.tsx` — admin order detail sheet.
4. `app/dashboard/orders/[orderId]/page.tsx` — admin order detail page.

**Already compliant — no change needed:**
- **Email** (`lib/messaging/receipt-template.ts` → `renderReceiptHtml`) renders a plain "Total" with no alt row.
- **SMS** (`renderReceiptText`) is total + hosted link only.

**Deliberately preserved (do NOT confuse with the alt line):**
- `TOTAL (CASH)` / `TOTAL (CARD)` label (driven by `breakdown.dual` → `laneLabel`) — the merchant's expected output keeps this.
- **`Cash savings −$X`** line on the admin surfaces (`OrderDetailSheet`, `orders/[orderId]`, and both in `OrderDetailFullPage.tsx`) — this is the cash-discount disclosure flagged in the compliance note, a *different* element from the alt-tender total.
- All pricing math (`getOrderBreakdown`, `base_*_price`, `dual_pricing_percentage`) — untouched. Display-only diff.

**Verification status:** grep confirms zero remaining `If paid by` / `alt*` references in TS/TSX. Automated test run blocked by a broken local toolchain (`rolldown` native binding missing on Windows) — unrelated to this change; needs a manual endpoint sweep on a dual-priced cash order (#S5-0001) for Abubeckr sign-off.
