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

## Deleting a component can orphan a feature that every test still passes (2026-08-18)
Context: the Owner-shaped website-builder rebuild deleted `PageListCard.tsx`, which was the only
thing that opened the page-settings panel. The panel itself survived — store action
`openPageSettings`, and 100 lines of `PageSettings` in `SectionDrawer` rendering page name, web
address and *Remove this page* with its confirm dialog.
Mistake: nothing anywhere called `openPageSettings` any more, so pages could no longer be renamed
or deleted at all. 381 unit tests passed, `tsc` was clean, and the production build succeeded —
every unit under the orphan is reachable and correct *in isolation*. Only clicking through the
product found it.
Rule: when a rebuild deletes UI, grep every public action of the surviving store for callers
(`grep -rn "<action>" --include=*.tsx`). An action with exactly one reference — its own definition
— is an orphaned feature, not dead code to remove. Do this before claiming a phase complete, and
treat "create → edit → publish → unpublish → delete" style lifecycle click-throughs as part of
done, because no unit test can see a missing entry point.

## A `redirect()` page under a force-dynamic layout is not an HTTP redirect (2026-08-18)
Context: three moved website routes rendered "This page couldn't load" instead of redirecting, on
Next 16.2.12.
Mistake: assumed `redirect()` in a Server Component emits a 3xx. It does not once the response has
begun streaming — Next answers **200** and instructs the client router to navigate. That path is
currently broken upstream: the router state becomes a promise, `useActionQueue` calls `use()`
conditionally on exactly that, the hook count changes between renders, and React throws "Rendered
more hooks than during the previous render" (vercel/next.js#78396). Every pure redirect page in
this repo has it, including `/dashboard/billing` on `main`.
Rule: express a static path-to-path move in `redirects()` in `next.config.ts`, not as a page that
calls `redirect()`. It is served before React exists — a real 307, no render, works with JS off,
and immune to this class of bug. Source query strings carry over automatically; use a `has` query
capture to lift a query param into a path segment. Keep `permanent: false` for internal routes, as
browsers cache a 308 indefinitely. Reserve runtime `redirect()` for genuinely conditional
branching (auth, role), which cannot move to config.
