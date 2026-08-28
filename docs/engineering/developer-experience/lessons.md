# Lessons

## Verify LIVE schema columns before writing DDL that references them (2026-07-14)
Context: auto-grant creator merchant access trigger.
Mistake: I built the trigger's `INSERT INTO admin_merchant_access (... access_level ...)`
from `utils/migrations/017_admin_merchant_access.sql`, which defines `access_level`.
The LIVE table has NO `access_level` column (schema drift). The trigger threw at runtime,
which aborted the AFTER INSERT and rolled back the merchant insert → merchant never created →
"Failed to load merchant" (the exact bug we were fixing), and it broke ALL merchant creation.
Also caught: the `admin_merchant_access_no_self_grant` CHECK in the migration files is NOT
applied live either.

Rule: Before writing/inserting against a table, confirm its ACTUAL columns/constraints on the
target DB (`information_schema.columns`, `pg_constraint`) — do not trust repo migration files,
which can drift from the deployed schema. The ticket's own SQL omitted access_level; that was a
signal I should have matched.

Rule: A broken AFTER INSERT trigger silently breaks the parent insert. Test end-to-end (real
create flow), not just the guard logic, before calling a DB trigger done.

## Statement-level triggers with transition tables can't use a column list (2026-07-21)
Context: converting the snooze→OrderOut resync trigger from FOR EACH ROW to FOR EACH STATEMENT
so a batch/whole-group 86 fires one resync instead of N.
Mistake: wrote `AFTER UPDATE OF snoozed_until ... REFERENCING OLD TABLE ... NEW TABLE ... FOR EACH
STATEMENT`. Postgres rejects it: `transition tables cannot be specified for triggers with column
lists (SQLSTATE 0A000)`. The `UPDATE OF <col>` list and `REFERENCING ... TABLE` are mutually
exclusive.
Rule: For a statement-level trigger with transition tables, drop the `OF <col>` list — fire on
all UPDATEs and filter inside the function (`WHERE n.col IS DISTINCT FROM o.col` over the
NEW/OLD transition tables). Add an early `RETURN NULL` before any expensive work (e.g. Vault
reads / external calls) when nothing relevant changed, since the trigger now runs on every update.
Also: a transition-table trigger can only be bound to ONE event, so INSERT and UPDATE need
separate `CREATE TRIGGER`s (INSERT gets NEW TABLE only; UPDATE gets OLD+NEW). Validate migration
SQL against a real Postgres (local `supabase db reset`, or a scratch branch) before pushing —
`tsc`/`next build` never touch SQL.

## Dual pricing is a CASH DISCOUNT, not a card surcharge (2026-08-24)
Context: `lib/pricing.ts` computed cash as `card / (1 + pct/100)` (surcharge model → 28 ÷ 1.04 =
26.92). The intended model is a cash discount: `cash = card × (1 − pct/100)` (28 × 0.96 = 26.88);
inverse `card = cash ÷ (1 − pct/100)`.
Mistake (mine): the user asked "4% off 28 should be 26.88, how did we get 26.92?" and I initially
*defended* 26.92 as the "more correct" surcharge convention. Their "4% off" wording was the spec —
they meant a flat discount. Don't argue a plausible alternative model over the number the user
explicitly stated; confirm which model they want, then match it.
Rule (FP): the discount lands on exact cent boundaries and binary floats render some as
26.8799999…, so a naive `Math.floor(x*100)/100` drops a whole cent (→26.87, and 15×0.96 → 14.39).
Add a sub-cent epsilon before flooring: `Math.floor(raw*100 + 1e-6)/100`. Postgres `numeric` is
exact decimal, so the SQL side needs NO epsilon — verify each layer empirically (`node -e`, a
`SELECT floor(...)`), don't assume.
Rule (surfaces): `lib/pricing.ts` is the single source of truth, but only `PriceInputGroup`
consumed it. Surfaces that persist prices independently must also derive: `InlinePriceEditor`
(cascade cells) and the bulk-adjust **RPCs** (`bulk_adjust_menu_item_prices` /
`bulk_adjust_menu_item_menu_prices` — the JS `computeNewPrice` is preview-only; the real write is
server-side SQL). A model change to the helper does NOT reach SQL RPCs — grep for the math, don't
trust the funnel. Base/global price scope has no single location %, so leave global cash to the
item editor rather than guessing a rate.

## …then REVERTED: dual pricing is cash-as-base (surcharge) after all (2026-08-27)
Context: the "cash discount" model above was later reversed at the user's direction — the intended
model is cash-as-base: "calculate from the cash price UP, not from the card price down" ($10 cash →
$10.40 card). So `card = cash × (1 + pct/100)`, inverse `cash = card ÷ (1 + pct/100)`. This also
matches the POS, which already derives cash via the inverse (`20260706130000_open_item_dual_pricing_inverse.sql`);
the discount commit had made web inconsistent with the tablet.
Reverted surfaces: `lib/pricing.ts` (+ tests), the two wording-only spots in `PriceInputGroup` and
`InlinePriceEditor` (their derive *wiring* was already direction-correct — only the helper math and
copy changed), and the two bulk-adjust RPCs (`… / (1 + pct/100)`), all in migration
`20260827120000_revert_dual_pricing_cash_surcharge.sql`.
Data fix: the user chose "keep card, only fix cash" — recompute stored cash as `card ÷ (1 + pct/100)`
so menu/card prices don't move; only the cash column shifts (~1¢). The epsilon still matters on the
inverse: a true cash base of $10 stores card $10.40, and `10.40 ÷ 1.04 = 9.99999…` must floor back to
$10.00, not $9.99 — keep `Math.floor(raw*100 + 1e-6)/100`. Meta-lesson: a "more correct" convention
is never the spec; the number/direction the user states is. This is the second flip of the same
math — pin the model in one helper + one migration and confirm the direction before touching prices.
