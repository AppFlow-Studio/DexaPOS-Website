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

## An unstable prop in a test harness kills the vitest worker with no error (2026-09-08)
Context: adding tests to `tests/file-upload-input.test.tsx` made every test in the file — including
ones that never touch the code under test — die with `Worker exited unexpectedly` and no JS error,
after a 70s+ hang. The cause was in the harness, not the component: I changed
`onUploadsChange={setAttachments}` (a stable setState reference) to an inline arrow
`onUploadsChange={(next) => {...}}`. `FileUploadInput` has `useEffect(..., [files, onUploadsChange])`,
so a new function identity every render re-ran the effect forever → stack overflow → hard worker
crash. React's "Maximum update depth" warning never surfaced because the process died first.
Rules for next time:
- A silent worker death with a long hang means infinite recursion, not a flaky environment. Don't
  reach for `--pool=threads` / reporter flags; look for an unstable identity feeding a `useEffect`
  dep array.
- Any callback prop consumed by a dep array must be `useCallback`'d (or a plain setState ref) in
  tests too. Test harnesses obey the same referential-stability contract as production callers.
- Bisect against a *known-good baseline* before theorising. `git stash` the test file alone and run
  it against the modified component: original test passing (even failing cleanly) vs. new test
  crashing localises the fault to the test file in one step. I burned several cycles blaming
  `vi.stubGlobal`/happy-dom's XHR instead.
- Watch for the inverse trap: a passing hand-written probe that differs from the real file in one
  overlooked detail proves nothing. Diff the probe against the real file rather than concluding
  "the component is fine."

## Read a ticket's stated root cause as a hypothesis, not a finding (2026-09-08)
Context: the support-video-attachments ticket confidently described the upload path, the read path,
and the affected routes. Four claims were wrong: uploads use pre-signed URLs (not `storage.upload()`,
so its ~6 MB rationale for adopting TUS didn't hold); reads go through an audit-logging proxy that a
prior hardening pass put in place of signed URLs (so "keep the signed-URL path" would have regressed
security, and the real work — HTTP Range support — went unmentioned); `/office` is an empty stub, so
a whole acceptance criterion was untestable; and "silent failure" was actually a generic-but-present
error. The ticket also missed three server-side gates (Zod MIME enum, 5 MB size cap, filename regex)
that would each have silently defeated its one-line bucket migration.
Rule: before planning from a ticket, verify each stated fact against the code — especially claims
about which code path is in use. Report the corrections and their consequences up front; the parts a
ticket gets wrong are usually where the actual cost is hiding.

## Confirm the project ref from .env before diagnosing anything hosted (2026-09-10)
Context: debugging a failing support-video upload, I inspected Supabase project `hifouuofcaytijrkbvcy`
because older docs in this repo call it "prod". I concluded the Edge Function was undeployed and a
migration unapplied, wrote that up, and proposed deploying both. The user pushed back — "why is
production related here, i dont think it is the problem" — and they were right. `.env` points at
`dfwqakoyittmrwbqvxgw`, where the function was already at v248 with the full feature and the
migration was applied. The entire diagnosis was against a project the app does not use.
Rules:
- Read `NEXT_PUBLIC_SUPABASE_URL` out of `.env` FIRST and use that ref for every hosted query. Never
  take a project ref from documentation — several docs here name a stale "prod" project, and one
  warns about duplicate env lines that no longer exist.
- When a user challenges a premise, re-derive it from the environment instead of defending it. The
  challenge was the cheapest correction available and I nearly argued past it.
- Prefer runtime logs over static reasoning for a live failure. `query_logs` on `function_logs`
  named the real cause ("Invalid JWT form" at `requireAuthenticatedUser`) in one query, after I had
  spent several turns inferring wrong causes from source code.

## Match the auth pattern of the working caller before inventing one (2026-09-10)
Context: support video uploads failed Clerk verification with "Invalid JWT form" because
`FileUploadInput` authorized with a bare `getToken({ skipCache: true })`, which can return a session
ticket that is not a JWT. The two kiosk CDN uploaders calling the SAME `cdn-upload` function already
did `getToken({ template: 'supabase' }).catch(() => null) || getToken()`. The support uploader was
the only CDN caller missing the template.
Rule: when adding a new caller to an existing authenticated endpoint, grep for the endpoint's other
callers and copy their auth shape. A lone caller that differs from every sibling is a bug, not a
simplification — and here the difference only surfaced at runtime, against a real Clerk session.

## Clerk's skipCache does not guarantee a usable token — set leewayInSeconds: 0 (2026-09-10)
Context: a 90 MB support video failed with a generic network error. The logs showed the prepare call
rejected with `token-expired` — the JWT expired 7 seconds BEFORE it was used, despite being fetched
with `skipCache: true`. Clerk session tokens live 60s, and the default leeway lets a cached token be
served with almost no life remaining; `skipCache` skips the cache lookup but does not guarantee the
returned token has useful time left. Fix: `getToken({ skipCache: true, leewayInSeconds: 0 })`.
Rule: any token used for a request that is not instantaneous — an authorization round-trip followed
by a large transfer, most obviously — needs explicit zero leeway, not just `skipCache`.

## A 502 with no function boot is the gateway, not your code (2026-09-10)
Context: the same failure showed `POST -> 502` in function_edge_logs with NO corresponding "booted"
event and no error line in function_logs, even though every 502 path in the function logs first.
That proves the request never reached the function: the Supabase gateway generated the 502 itself.
Because a gateway response carries no CORS headers, the browser cannot read it, fires `xhr.onerror`
instead of `xhr.onload`, and the app can only report a generic failure — the real status exists only
in the edge logs.
Rules:
- Correlate `function_edge_logs` (status codes) with `function_logs` (boot events + your own
  console lines). A status with no boot means the failure is upstream of your code.
- Don't trust a client-side "network error" to mean a network problem. If `onload` has good error
  handling and the user still saw the generic message, the response was unreadable, not absent.
- Check the deployed function version against local source before diagnosing. Here a stack trace
  cited line numbers that did not match the version previously read, and the user's reported error
  string predated the current code — both signs the running build differs from the working tree.
