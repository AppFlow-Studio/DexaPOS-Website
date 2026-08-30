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

---

## JSX: `{expr} text&entity;` silently loses the space (2026-08-30)

**Symptom.** A branch name rendered welded to the next word — `Uptown Branchconfirms each
booking`, `Omar Declinedwill be told`. Three separate occurrences in one feature, all shipped
past `tsc`, all shipped past unit tests, all found only by opening a browser.

**The pattern that breaks:**

```jsx
{branch?.name ?? "This restaurant"} confirms each booking. We&rsquo;ll hold your table
```

The source has the space. `od -c` confirms it. **esbuild compiles it correctly** — the children
array comes out as `[name, " confirms each booking. We\u2019ll hold it."]`, space intact. But
Turbopack/SWC splits the JSXText at the HTML entity and drops the leading whitespace of the first
segment, so React receives two adjacent text nodes with nothing between them.

**It is specific to the entity.** The control case renders fine — `{n} minutes` in
`ReservationsScreen` produces `"5 minutes"` in the DOM. So this is not "JSX eats spaces after
expressions" in general, and there is no need to audit every interpolation in the codebase.

**The rule:** when an expression is followed by text containing an HTML entity (`&rsquo;`,
`&nbsp;`, `&amp;` …), write the space explicitly:

```jsx
{branch?.name ?? "This restaurant"}{" "}
confirms each booking. We&rsquo;ll hold your table
```

**Why it matters beyond typography.** Every instance was in guest-facing or merchant-facing copy
where the interpolated value is a *name* — the restaurant's or the guest's. Getting someone's name
wrong in the first line of a message is the kind of defect a merchant forwards to support.

**The real lesson is about verification, not JSX.** `tsc` cannot see it, unit tests asserting
`toContain("confirms each booking")` pass happily, and a snapshot test would have baked the bug in
as expected output. Only rendering the page catches it. **Copy that interpolates a value must be
read in a browser at least once**, and the assertion worth writing is on the *joined* string
(`toContain("Uptown Branch confirms")`), not on either half.

---

## A published storefront is a different HOST, and `localhost:3000` never tests it

**Symptom.** Every guest who opened "Book a table" on a live site was told *"We could not load
times just now. Please try again."* The booking API was correct, the endpoint returned real slots,
and the whole flow passed QA.

**Cause.** `proxy.ts` rewrites every path on a storefront host to `/sites/{slug}{path}` so the
storefront renders. That rewrite ran before anything else and did not exclude `/api`, so
`POST /api/site-reservations/availability` was rewritten into the storefront's page catch-all and
answered with a 404 **HTML** page. `res.json()` threw, and the widget's `catch` printed the
"could not load times" line — a network-failure message for a routing bug. `/api/site-forms/submit`
was dead the same way, so contact-form submissions were lost.

**Why QA missed it.** All of it was tested at `localhost:3000/sites/{slug}`, which is the apex host,
where no rewrite happens. The bug only exists on the hosts real visitors use:
`{slug}.dexaposai.com`, a merchant's custom domain, and `{slug}.localhost:3000` in development.

**The rule — the signed-out probe now has two axes, host and session.** The existing lesson was
"call a public endpoint signed out". That is necessary and not sufficient. Call it **on a storefront
host** as well:

```bash
# Both must answer JSON. The subdomain answering text/html is the bug.
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" -X POST \
  "http://localhost:3000/api/site-reservations/availability" -H "content-type: application/json" -d '{}'
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" -X POST \
  "http://joes-coffee-shop.localhost:3000/api/site-reservations/availability" -H "content-type: application/json" -d '{}'
```

`{slug}.localhost:3000` needs no hosts-file entry and exercises the real production code path —
`extractStoreSlug` keeps `localhost` as its dev root precisely so this is testable.

**The generalisation.** Any request a *published site* makes to our own origin has to be checked on
the storefront host, not only the apex one: API routes, form actions, redirects back to the page,
and anything reading `Host`. Two hosts serve the same app and only one of them is what a customer
uses.

**And keep the exemption narrow.** The fix exempts `/api/site-reservations` and `/api/site-forms`
from the rewrite — not `/api`. Exempting the whole namespace would make gated app endpoints
reachable on a customer-facing domain, where a signed-in staff cookie can still travel. See
`lib/site-builder/public-api-paths.ts`; a new public storefront endpoint must be added there *and*
to `isPublicApiRoute` in `proxy.ts` — the first decides whether the request reaches its handler, the
second whether Clerk lets a stranger past.

---

## `REVOKE ... FROM PUBLIC` does not lock down a Supabase function

**2026-08-30, reservation request expiry.** Found in verification, not in review or tests.

A new `SECURITY DEFINER` function in `public` that bulk-cancels bookings was written with what
looks like a correct lockdown:

```sql
REVOKE ALL ON FUNCTION public.expire_stale_reservation_requests(int, int, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ... TO service_role;
```

Applied to staging, `proacl` read `{postgres=X, anon=X, authenticated=X, service_role=X}`.

**Why.** Supabase's default privileges `GRANT EXECUTE` to `anon` and `authenticated` *explicitly*
whenever a function is created in `public`. `REVOKE ... FROM PUBLIC` removes the implicit
world grant and does not touch an explicit role grant. The function was therefore a live PostgREST
RPC endpoint callable by anyone holding the publishable key — which ships in every browser — and it
took its own lookback window as an argument, so the caller chose the blast radius.

**The rule.** Name the roles. Every function in `public` that is not meant for browsers ends with:

```sql
REVOKE ALL ON FUNCTION public.fn(args) FROM PUBLIC, anon, authenticated;
```

This repo already had the right form in `20260828160000_reservation_public_write.sql`. Copy from a
neighbour rather than from memory.

**The second, worse half: the test passed.** A contract test asserted
`expect(sql).not.toMatch(/TO anon/)` — which passes trivially on a file that never mentions `anon`,
which is exactly the broken file. A negative assertion over migration *text* cannot distinguish
"revoked" from "never mentioned", and no text assertion can see `proacl` at all.

So:

1. **Assert positively.** Check the file *contains* `FROM PUBLIC, anon, authenticated`. Never write
   a test whose passing condition is that some string is absent from a file, when absence is the
   failure mode.
2. **Text tests are not grant tests.** After applying any migration that creates a function,
   read the live ACL before believing it:

```sql
select proname, proacl::text from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and proname = '<fn>';
```

**Generalisation.** Whenever the security property lives in the *database's* state rather than in
the migration file, the migration file cannot be the evidence. Same class as the migration-ledger
trap already recorded: check `pg_proc`, `information_schema`, and `proacl` — never the artefact
that was supposed to produce them.

**Also found:** `poke_orderout_status_relay` (20260727120100) carries the same open grant. Lower
severity — it only fires an HTTP poke — but it is the same mistake, still live.

## Tailwind 4: an arbitrary value after `ring-` / `divide-` is a WIDTH, not a colour

`focus-within:ring-2 ring-[var(--site-brand)]` produced no focus indicator at
all. The arbitrary value is parsed as a ring *width*, so the colour resolved to
nothing and the computed `box-shadow` was five transparent zero-width layers.
`divide-[var(--site-border)]` fails the same way. `ring-inset` no longer exists
in v4 either — it is `inset-ring`.

**Neither failed loudly.** The classes were on the element, spelled correctly,
and looked right in DevTools' class list. Only `getComputedStyle` revealed that
nothing had been applied.

Rules:
- For a CSS-variable colour use the v4 form (`ring-(--site-brand)`), or avoid the
  ambiguity entirely with an explicit property — this codebase already sets site
  tokens via inline `style`, which cannot be misparsed and is not subject to
  content scanning.
- **Verify a style landed with `getComputedStyle`, never by reading the class
  list.** A class that is present is not a class that applied.
- Do NOT grep `.next/**/*.css` to check whether a utility was generated. Those
  chunks are cached and can predate the running dev server, so they will happily
  tell you a working class is missing and a missing class is present. Ask the
  browser instead.
