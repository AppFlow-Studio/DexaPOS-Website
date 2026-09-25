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
## Billing "automatic payment approved" toast lied while the invoice showed Failed (2026-09-14)
Symptom: HQ operator clicked "Save & Charge Subscription" for a location (Downtown Hamra), got
"Subscription updated and automatic payment approved", but the invoice in Billing history showed
**Failed**. Not a reconciliation gap — the charge genuinely failed and nothing new was charged.
Two stacked bugs:
1. **Silent no-charge + lying toast.** Prior charge attempts had failed, leaving the location sub in
   `past_due`. The editor loads `status = past_due` from the sub, and `effectiveStatus` passed it
   straight through. `saveAndChargeMerchantSubscription` then took its `if (targetStatus !== 'active')
   return { success: true }` branch — saving the config but **generating no invoice and charging
   nothing** — yet the client toast was keyed only on "does a subscription exist", so it said
   "automatic payment approved". Audit log was the tell: `subscription_created`/`recalculated`/
   `plan_changed` with NO `invoice_generated` and NO charge on the last two saves.
   Fix: (a) "Save & Charge" on a lapsed sub (`past_due`/`suspended`/`canceled`) with services enabled
   now targets `active` (reactivation → real charge); (b) the toast only claims "approved" when the
   server returns proof of a real charge (`invoiceId` for location saves; a new `charged` flag for
   merchant-tier). Same fix applied to `HqSubscriptionsWorkspace`, `SubscriptionBillingAdminCard`,
   and `handleSaveMerchantTier`. Meta-lesson: never key a success message on the existence of a row;
   key it on the outcome the message claims.
2. **Opaque Valor failure.** The real charges failed with the generic "Valor recurring request
   failed" and `processor_response: {}`, because `_shared/valor.ts:postWithBodyCredentials` discarded
   the raw response text. Valor's `/?addSub` was returning **HTTP 200 with an empty body**, which
   `isValorSuccess` (needs `error_no:'S00'`+`error_code:'00'`) correctly treats as non-success — but
   we couldn't tell an empty body from a differently-shaped success or a real decline. Setup was
   otherwise correct (card + charge on the same central EPI, valid vault IDs, correct
   `CustomerProfileID`/`PaymentProfileID` keys), so the leading suspect is a central EPI not
   provisioned for native recurring.
   Fix: capture raw response text + content-type + HTTP status; persist a `_valor_diagnostic` object
   into `processor_response` instead of `{}`; emit a specific message ("Valor returned HTTP 200 with
   an empty response body — recurring not confirmed; this EPI may not be provisioned for native
   recurring"). Meta-lesson: a payment integration must persist the raw processor response on failure
   — a generic fallback string with an empty body is undebuggable and hides double-charge risk.

## A JSX comment cannot lead a `return (`

Made this mistake twice in one session, in two different files
(`MerchantSubscriptionSummary.tsx`, then `RiskStrip.tsx`), while adding an
explanatory comment above a component's root element.

```tsx
// WRONG — TS1005 ')' expected
return (
  {/* why this element looks like this */}
  <div className="…">
)
```

`{/* … */}` is only valid as a *child* of a JSX element. At the top of a
`return (`, the `{` starts an object literal, so the parser fails several lines
later with a cascade of TS1005/TS1128 errors that point at the closing tag
rather than the comment — easy to misread as a broken element.

Use a plain `//` comment above the `return` instead:

```tsx
// why this element looks like this
return (
  <div className="…">
)
```

Rule for myself: when a comment explains the root element, it goes *above*
`return`, never inside the parens. Only put `{/* */}` between sibling elements.
Meta-lesson: `tsc --noEmit` catches this instantly — run it after adding a
comment to JSX, not just after changing logic.

---

## Never `git stash` a tree containing someone else's uncommitted work

**What I did:** To get a "baseline" type-error count, I ran `git stash` →
`tsc` → `git stash pop`. The pop collided with a *pre-existing, unrelated*
stash from another branch and left ~130 files in a `UU` conflicted state.
Cleaning up, I ran `git checkout --ours .` — which reverted every unstaged
file in the repo to HEAD, destroying both my own work and the user's
uncommitted `DeviceFleetMap.tsx` changes. Not recoverable from `git fsck` or
VSCode local history. (The user restored it from their own backup.)

**Two distinct mistakes:**

1. **Stashing a dirty tree I didn't own.** The working tree had changes that
   predated my session. `git stash` is *not* read-only — it mutates shared
   state, and `pop` can conflict against stashes I never inspected.
2. **`git checkout --ours .` as cleanup.** A bulk, whole-directory,
   irreversible command run to fix a mess I had just created. Panic-cleanup
   is exactly when destructive commands are most dangerous.

**Rules for myself:**

- To compare against a baseline, **never stash**. Either:
  - filter the current output to the files I touched
    (`tsc --noEmit | grep -E "MyFile\.tsx"` — empty means clean), or
  - compare against a *separate* checkout (`git worktree add`), never the
    live working tree.
- A whole-repo error count is not a metric I need. "Zero errors in the files
  I changed" is the actual gate, and it requires no stashing at all.
- Before any `git` command that can discard working-tree state
  (`checkout --`, `checkout --ours/--theirs`, `reset --hard`, `clean`),
  run `git status` first and **name the specific paths** — never `.`.
- If `git stash pop` conflicts: `git checkout --merge` / `git stash apply`
  are recoverable; `checkout --ours .` is not. Prefer `git reset -q` (clears
  the index, keeps the tree) and resolve per-file.
- `git status` being "clean" **at session start** does not mean it is clean
  now. Re-check before touching git state.

**Repeat offence (2026-09-23) — the pop can fail for reasons unrelated to
git.** I ran the same stash→`tsc`→pop baseline trick again, on a tree holding
~22 files of someone else's uncommitted work. This time the pop failed with
`fatal: ... index.lock write error. Out of diskspace` — the volume was at
100% (0 bytes free). The stash had already stripped the tree, so *every*
uncommitted change on the branch was live only inside `stash@{0}`, and git
could not write the index needed to restore it. Recovery meant freeing space
first (`rm -rf $TEMP/next-* $TEMP/turbo-*` → 8.6G) and only then popping.

- A stash is not a safe round-trip — it is two operations, and the second one
  can fail on disk, locks, or conflicts while the tree is already empty.
- **Check `df -h .` before any git operation that parks work in a stash.** On
  a full disk, git cannot write `.git/index.lock` and the restore is blocked.
- The per-file gate makes all of this unnecessary:
  `npx tsc --noEmit 2>&1 | grep -c "^<path>"` per edited file. Zero errors in
  the files I touched is the real bar; a whole-repo baseline count never was.

**Meta-lesson:** the harness rule "before deleting or overwriting, look at the
target" applies to git commands, not just file writes. `checkout --ours .`
*is* an overwrite of every file in the repo. And a lesson already written in
this file does not protect you — re-read it *before* reaching for the
command, not while recovering from it.

---

## Don't attribute a visible symptom to a fix you just read

**Context:** Reviewing external (Codex) feedback on the HQ Mission Control
mobile view. The screenshots showed `↘ 100.0% vs last week` on `$0` revenue.
I had just read `percentChange()` in `PlatformPulseSection.tsx`, which returns
`null` on a zero baseline, and `c4a4f7a2` ("fix misleading KPI deltas") was
that same day. I told the user the screenshots were stale and the deltas were
already fixed.

**What was actually true:** the deltas were correct and live. The baseline is
*last week's* revenue, which is non-zero; today is $0. `percentChange(0, 4200)`
is -100%, and rendering it is exactly what the code is supposed to do. The
guard only suppresses a **zero denominator**, not a zero numerator. Nothing
was stale — I had confirmed a build artifact was missing (`.next/BUILD_ID`)
and let that unrelated fact corroborate a conclusion it had no bearing on.

**Rules for myself:**

- A guard I just read tells me what it *prevents*, not that the symptom
  on screen is the thing it prevents. Trace the actual runtime values —
  here, one `sed -n` on `dashboard.ts` showed the baseline came from a
  different day's query and settled it in seconds.
- "Zero-looking number on screen" is ambiguous: zero *numerator* and zero
  *denominator* produce different correct behaviours. Name which one I mean
  before claiming a fix covers it.
- Two facts landing the same day (a fix commit, a missing build) are not
  evidence for each other. Verify the causal link or state neither.
- When a claim of mine is contradicted by the running app, correct it in one
  plain sentence and move on — don't re-litigate whether the original
  reasoning was defensible.

**Meta-lesson:** CLAUDE.md's "Verification Before Done" applies to *claims
about existing behaviour*, not just to code I write. I asserted "already
fixed" from reading alone, when the browser was already open and could have
answered it.

---

## `hidden` loses to a display utility baked into a shared class constant

**Context:** Hiding the status badge on mobile in `MerchantSpotlightCard` and
the device-count badge in `AlertsPanel`. Both render
`<span className={`hidden ${BADGE_SHELL} sm:inline-flex`}>`, where
`BADGE_SHELL` is a shared constant that already begins with `inline-flex`.
Both badges stayed visible on phones — the spotlight card rendered "Active"
**twice**, once from the mobile row and once from the supposedly-hidden
desktop badge.

**Why:** `hidden` and `inline-flex` are both `display` declarations at the
same specificity, so the winner is decided by **order in the generated CSS
file**, not by order in the `className` string. Tailwind emits `inline-flex`
after `hidden`, so `inline-flex` always wins. Interpolating a shared shell
constant hides the conflict: nothing at the call site reads as a display
utility.

**Rules for myself:**

- Before adding `hidden`/`sm:hidden` to an element whose classes come partly
  from a shared constant, read the constant. If it sets `display`
  (`inline-flex`, `flex`, `grid`, `block`, `inline`), the `hidden` is dead.
- Fix by wrapping, not by reordering: put the responsive visibility on a
  plain `<div className="hidden sm:block">` around the styled element. Class
  order in the string will never fix it.
- Any shared `*_SHELL` / `*_CLASSES` constant that starts with a display
  utility is a trap for every future responsive tweak — `BADGE_SHELL` in
  `AlertsPanel.tsx` and `MerchantSpotlightCard.tsx` both qualify.
- Verify a hide by counting **visible** elements in the DOM
  (`getBoundingClientRect().width > 0`), not by reading the JSX. The
  duplicate "Active" was invisible in code review and obvious in one query.

**Meta-lesson:** "I added `hidden`" is not evidence the thing is hidden. For
CSS changes the browser is the only authority, and the check costs one
`evaluate_script`.

## Declutter requests: remove only what was named

**Mistake:** Asked to hide "the subtitle of the header and the KPIs and graphs"
on mobile analytics, I also hid the whole Platform totals panel and the
Overview tab, reasoning the tab would be "empty". The user wanted the header
and Overview kept, with only the subtitles gone.

**Rule:**
- When a "make it simpler" request is ambiguous about scope, pick the
  **smallest** reading (hide the text lines named), not the largest.
- Never remove a whole section, tab, or navigation entry that the user did not
  name. If you think one would end up empty, ask first.

## Check the team's accepted environment practice before proposing infrastructure (2026-09-20)

Context: OrderOut Direct spike. I found that the single OrderOut `push_order` webhook is
registered platform-wide against **production**, and that the API key is shared by staging and
prod. I escalated this into a multi-step "get a second integrator key, re-register webhooks,
re-onboard staging restaurants" proposal. The user cut it off: the team's position is that the
shared key + Joes Coffee Shop *is* the staging account, and that's an accepted trade-off.

Lesson: a real finding still needs to be **sized against how the team already works** before it
becomes a plan. State the fact in one line with its concrete consequence ("staging pushes will
echo into prod's webhook; the echo guard can't be E2E-tested on staging"), ask whether that's
acceptable, and stop. Don't design the fix until someone says the problem is theirs to fix.
Corollary: when a user says "nevermind this", drop it fully — record the fact in the plan doc
as a known constraint and move to the next unblocked step.

## Read the vendor's stored record before blaming your own request (2026-09-20)

`POST /v2/delivery/quotes` returned `400 {"reason": "Invalid 'phone_number'"}`. I burned five
attempts guessing request field names (`phone_number`, `dropoff_phone`, `customer_phone`, …).
The error was about the **restaurant record on OrderOut's side** (`phone_number: ""`, plus a
Virginia zip on a Brooklyn store) — one `GET /api/pos/restaurant/{id}` showed it immediately.
Lesson: when a vendor rejects a field you didn't send, read back the entity you're acting on
first. Second-order finding: `orderout-onboard` never sent `phone_number`, so every merchant was
un-quotable — a spike against real data surfaced a shipped bug the docs never would have.

## An outbox pattern is only safe for idempotent calls — check that before copying it (2026-09-20)

Context: OrderOut Direct dispatch. I copied the proven `orderout_status_relay_queue` pattern
(claim with backoff-as-lease → HTTP → complete → retry on 5xx) for the courier push. The relay's
call is a PUT of a status — harmless to repeat. The push is `POST /api/channel/order/push`, which
**books a courier**: every retry after an ambiguous result (5xx, timeout, network, worker crash
between the call and `complete`) is a second courier and a second charge. An adversarial review
found three CRITICALs that were all this one mistake: in-process retry, retry on the next claim,
and a 30 s lease that let the next drain re-push a slow batch.

Lesson: before reusing a retry/queue pattern, write down what the remote call does when it is
repeated. If the answer is "creates something", the design needs (1) no automatic retry after an
ambiguous outcome — park the row in an explicit `*_unconfirmed` state that only positive evidence
(echo, status event) or a human resolves; (2) a lease that is longer than the worst-case batch and
separate from the backoff; (3) every completion RPC conditional on the row's *current* state, so a
concurrent cancel is never overwritten; (4) a "call attempted" marker written before the call so a
crashed worker's row is parked, not re-sent. Corollary from the same review: put the dashboard
lookup in the branch the dashboard actually calls — I added the dispatch banner to the HQ-only
branch of `GetOrderDetails` and merchants never saw it.

