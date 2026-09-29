# Cardholder signature line + one Sale Receipt row (Website)

- **Ticket:** Notion, "[POS · Receipts] Cardholder signature block on merchant copy"
- **Plan:** https://claude.ai/artifact/5ooS8zJjSePANQTjocUJFG (decisions locked 2026-09-26)
- **Owner:** Temurbek S. · **Verifier:** Abubeckr
- **Repos:** `dexapos-website` (this doc), `Dexa-POS` (prints the block)

## What changed

The Website's Sale Receipt tab used to save a `receipt_templates` row with
`template_type = 'sale'`. The POS prints only from `'receipt'`, so those settings
never reached the tablet. Both apps now use the `'receipt'` row. The Website
still calls the tab "sale" everywhere in the UI and maps the name only where rows
cross the database boundary (`lib/receipts/template-type.ts`).

Two new columns on `receipt_templates` carry the signature setting:
`print_signature_line` (boolean, default false) and `signature_line_disclaimer`
(text, nullable; blank means the POS default string).

## Work items

- [x] `lib/receipts/template-type.ts`: single source for the template type list and the `sale` ↔ `receipt` mapping. A stored `sale` or `sale_retired` row maps to nothing.
- [x] `lib/receipts/signature-block.ts`: when the block prints, and the default disclaimer.
- [x] Actions (`app/dashboard/actions/receipt-templates.ts`): reads and writes go through the mapping; reads are limited to the types the Website manages; the two new columns are saved.
- [x] Defaults are insert-only (`ignoreDuplicates`). Covers `initializeDefaultTemplates` and the per-tab **Use Default** button, which now calls it for one type.
- [x] Form: new **Card payments** group; logo, barcode, QR and tax-breakdown toggles removed from Sale Receipt; header hint about not repeating the address.
- [x] `SaleReceiptPreview`: reordered to the printed layout, with Merchant/Customer and Card/Cash switches.
- [x] `ReceiptModal`: reads the `receipt` row (through the action); tax line always shown.
- [x] `get_public_receipt` reads the `receipt` row: migration `20260927140000_public_receipt_reads_receipt_template.sql` + rollback.
- [x] `database.types.ts` and `app/database.types.ts`: the two columns added to `receipt_templates`.
- [x] Tests (42 passing): `tests/receipt-template-type.test.ts` (mapping, signature rule), `tests/receipt-templates-sale-tab.test.tsx` (rendered form and preview), `tests/receipt-templates-actions.test.ts` (the real server actions against an in-memory table with the database's unique key).
- [x] Read path checked against staging data (2026-09-26, read-only): for Uptown Branch the real `getReceiptTemplates` / `getReceiptTemplate` return the POS-made `receipt` row as the Sale Receipt tab, with the signature line on; `sale_retired` and `refund` rows are left out.
- [x] Apply `20260927140000` to staging. Applied 2026-09-26 as raw SQL (no migration history row, same as `20260927130000`). Checked afterwards: all 4 locations with receipt links get the header and footer held on their `receipt` row; `SECURITY DEFINER` and grants unchanged.
- [ ] Click-through on staging: save the Sale Receipt tab, confirm the `receipt` row changed and no `sale` row appeared. Not done: the browser extension did not respond.
- [ ] Print QA on the tablet (owned by the POS side of the ticket).
- [ ] Prod: apply `20260927130000` and `20260927140000` together with the Website deploy.

## Where the plan and the code disagreed

1. **Emailed and public receipts read the template in SQL.** The plan lists
   `lib/receipts/header.ts`, which only formats a string it is handed. The row is
   chosen inside `get_public_receipt`, which filtered on `'sale'`. After
   `20260927130000` ran on staging there were no `sale` rows left, so the function
   returned no header and no footer for any location. Checked on staging
   2026-09-26: 4 of 4 locations with receipt links got neither, while their
   `receipt` rows hold a footer (4) and a header (2). Fixed by `20260927140000`.
2. **"Initialize defaults" has no caller.** The page never ran it. The path that
   could overwrite a POS-made row was the per-tab **Use Default** button, which
   upserted. Both are insert-only now, and Use Default says so if the template
   already existed instead of claiming it saved.
3. **Tax line in the order receipt modal.** The modal hid the tax line when
   `show_tax_breakdown` was false. With the toggle gone from the Sale Receipt tab
   a merchant could never turn it back on, and the POS prints tax regardless, so
   the modal now always shows it.

## Rollout order

Per environment: `20260927130000`, then `20260927140000`, then the Website deploy.
Until the Website deploy lands, saving the Sale Receipt tab on the old build
writes a fresh `sale` row. The POS and the new Website both ignore it.

Rollback is the reverse: Website revert, `20260927140000` rollback, then the
`20260927130000` rollback (which needs the renamed row ids filled in).

## Notes

- **`receipt_templates` has no `updated_at` trigger.** On staging the Uptown
  Branch `receipt` row had `print_signature_line` switched on with `updated_at`
  still at 2026-03-10 and no audit entry, so the change did not come through the
  Website. The Website sets `updated_at` itself on every save; a writer that does
  not leaves it stale. Not changed here.

- **Types were not fully regenerated.** A full regeneration against staging
  differs from the committed files by about 775 lines of unrelated schema (OrderOut
  delivery, station menus, KDS snapshots), and the two committed copies already
  differ from each other. Only the `receipt_templates` block was brought up to
  date; it matches the regenerated output exactly.
- **`supabase/seed.sql`** still inserts a `sale` row for location `8835e749…`. On
  a local reset it is a leftover the Website ignores.
- **Tip amount in the order receipt modal** is hidden when `show_tip_line` is off,
  although on the printed receipt that setting only controls the write-in lines.
  Not changed here.
- **Out of scope** (from the plan): `void_refund` vs `refund`, `end_of_day`,
  `cash_drawer`, terminal-side signature capture, customer-copy changes, kitchen
  tickets, online-store receipts.
