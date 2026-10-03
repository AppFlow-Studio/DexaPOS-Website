# `/manage/audit-logs` — design-system conversion (Family 5)

**Date:** 2026-09-29 · **Branch:** `Haydar-AdminRestructure` · **Spec:** [`docs/UI-DESIGN-SYSTEM.md`](../../UI-DESIGN-SYSTEM.md)

Converts the platform audit log onto Part A and §14. Presentation only: the query, filters, CSV export, anomaly
detection and localStorage flags behave as before, except for the changes listed below. The impersonation sub-page
(`…/impersonation`) was converted separately, the same day.

## Scope

| File | Consumers |
|---|---|
| `app/manage/audit-logs/page.tsx` | this route |
| `components/admin/MerchantSearchSelect.tsx` | this route only |

Reuses `app/manage/transactions/components/ledger-primitives.tsx` (`RecordCard`, `CardField`, `FilterSelect`,
`FilterDate`, `LoadError`, `TableEmptyRow`, `CardGridEmpty`). A second route now imports them, which makes the case for
the §11 item "a shared mobile record card + `CardField`": promote the file to `components/dashboard/shell`.

## Work items

- [x] Shell: `PageShell as="div"` + `PageHeader`, with Refresh / Export CSV as pill controls (§4.1, §14.1)
- [x] Tabs: the underline strip became the pill rail (§4.5). Counts are plain muted `tabular-nums`, with no `bg-primary/10` chip
- [x] Filters: the `Card` became a toolbar inside `Panel > PanelSection` (§5.2). Raw `<select>`s became `FilterSelect`, native date inputs became `FilterDate`, and the checkbox became a DS-CTL-03 toggle chip. Visible labels and the card description went; each control has an `aria-label`. Controls sit two to a row on phones. "Clear filters" shows only while a filter is set
- [x] Merchant picker: a muted, borderless trigger (§4.2) and a `rounded-2xl` popover (§4.6). Also fixes the width class: `w-[--radix-popover-trigger-width]` compiles to `width: --radix-…` in Tailwind 4.3, so the popover never matched the trigger. It is now `w-[var(--radix-popover-trigger-width)]`
- [x] Table: `variant="data"`. The `max-h-[62vh]` wrapper well, the `rounded-md border` frame and the `bg-card` header override are gone (§5.2, §5.7). It shows from `2xl`, where `min-w-[1150px]` fits
- [x] Record cards below `2xl` (§5.3): the sentence and time lead, fields sit underneath, and the card has Flag and Details controls. The row and the card render the same `AuditEventDetail`
- [x] Colour (§3.5, §4.6b): per-type org, severity, status and role pills became neutral words. Tinted failed, anomaly and flagged rows became weight. The amber flag icon is now neutral, with `aria-pressed`. The anomaly banner and the error box are now neutral wells with words. The red/green diff wells became old value struck through → new value (§14.6.4)
- [x] No lines (§5.5): the diff lost its `divide-y` and border, and the tabs lost their `border-b`
- [x] Empty and error states (§4.9): the copy depends on the filters, and an empty Flagged tab says "All clear — nothing flagged among events 1–50 of N". A query error shows a neutral well with Retry. An export failure shows a neutral well with Retry, and the cap note is neutral too (it was amber)
- [x] Paging (§5.7): `PaginationBar` at 10 per page on both tabs, with a row-count line when everything fits on one page. Expanded rows collapse when the page or tab changes
- [x] Accessibility: icon buttons have `aria-label`s, the expand control has `aria-expanded` and a rotating chevron (§7), and the diff carries `sr-only` "changed from … to"

## Behaviour changes beyond presentation

| Where | Change | Why |
|---|---|---|
| Paging | 50 per page became 10 per page. The server is still asked for 50 rows at a time; the pager slices that window and fetches the next window when needed | §5.7, and anomaly detection keeps its 50-event window (a 10-row page could never contain "5 voids in an hour") |
| Flagged tab | Now paged at 10, and a caption says which events it covers ("among events 51–100 of N") | The tab only ever covered the loaded window; before, it didn't say so |
| Category column | `user_management` is shown as "User Management" | Humanised labels (§14.6.2) |
| Anomaly and error detail | Moved to the top of the expanded detail | They are the reason to open the row |

## Found, not changed

- **Flags and anomalies only cover the loaded window.** A flagged event on another page is invisible on the Flagged tab, and bursts that span two 50-row windows go undetected. This predates the conversion. Fixing it needs server-side detection or flag storage.
- **Flags live in localStorage**, so they are per browser and are not shared between HQ admins.
- **`useState(() => loadFlaggedIds())`** reads localStorage during the first client render, so the bookmark icons can mismatch the server HTML on hydrate.
- **`getPlatformAuditLogs` returns `{ data: [], total: 0 }` on a query error**, so most failures read as "No audit events yet". Only a thrown error (for example, a permission failure) reaches the new error well.
- The same broken `w-[--radix-popover-trigger-width]` class is still in `ModifierRecipeManager.tsx:452` and `components/support/AssigneeEmailMultiSelect.tsx:74`.

## Verification

- [x] `tsc --noEmit --incremental false`: 0 errors in either changed file (841 project-wide, from other uncommitted work in the tree)
- [x] ESLint compared with `HEAD`: the page went from 2 errors + 3 warnings to 2 errors. The remaining two are the same pre-existing "reset page in an effect" pattern. `MerchantSearchSelect` is unchanged (2 pre-existing)
- [x] §3.5, §4.6b, §5.5, §8 and §12 greps are clean for both files. No bare `<Badge>`, no `Card`, no raw `<select>`, no `rounded-md`
- [x] Tailwind 4.3 compile check for the new variants (`aria-pressed:`, `@md:`, `@3xl:`, `@container`) and for the `w-[var(--radix-popover-trigger-width)]` fix
- [ ] Browser: light + dark at 1536 / 1280 / 375 — **not run** (the Chrome DevTools MCP failed to connect this session). Worth checking: the `2xl` table/card switch, the expanded detail in a card at 375px, the toolbar grid on phones, and the pressed "Has error" chip in dark mode

## Re-audit against the 2026-09-30 rules (D-25 – D-28)

**Date:** 2026-09-30. Both pages were converted on 09-29, one day before the table rules changed. The colour, line,
legacy, panel and empty-state checks still pass: the §3.5, §5.5, §8 and §12 greps return nothing for `page.tsx`,
`impersonation/page.tsx` and `MerchantSearchSelect.tsx`. Every gap below comes from §5.3, §5.7 or §5.9. The reference
to copy is `transactions/components/AuditLogSection.tsx`, which already follows D-25/D-26 (`hidden md:block`, tiered
columns, `bounded={false}`, `RowLink` + `RecordLinkCard`).

### `/manage/audit-logs` — work items

- [x] **A1 · §5.7 / D-25 — inner scroll.** `page.tsx:760` does not pass `bounded={false}`, so from `md` the table is
  capped at `min(70vh,40rem)` with a sticky header. An expanded row makes it scroll inside itself. Pass `bounded={false}`
- [x] **A2 · §5.3 / D-26 — one breakpoint.** The table shows only from `2xl` (`hidden 2xl:block`, unprefixed
  `min-w-[1150px]`), so tablets and laptops up to 1535px get cards. Show the table from `md`, drop the `min-w`, and tier
  the columns: essential = What happened, Status, Who, When; `lg` = Organization; `xl` = Category, Severity;
  `2xl` = Location. Row actions stay at every width
- [x] **A3 · §5.7 — one-line rows.** Four cells stack two or three lines: time + date, org + org type, the sentence
  (`line-clamp-2`) + highlight + "Anomaly detected", and actor + role. Make each cell one truncated line. Move the second
  line into `title` or the detail page, and say "Anomaly" as a leading word on the sentence
- [x] **A4 · §5.3 / D-27 — phone card essentials.** The card has 6 label/value pairs plus Flag and Details buttons.
  The §5.3 audit recipe is: action and result lead, then actor and time. Replace it with a `RecordLinkCard` (the sentence,
  the status word, and "actor · time" underneath) that opens the detail page
- [x] **A5 · §5.9 / D-28 — large detail gets a page.** `AuditEventDetail` renders an anomaly well, an error well, the
  sentence, a diff and a metadata JSON block (two `max-h-72` scroll boxes). That is well over three rows tall, and in a
  card it becomes a long scroll. Both sibling audit lists already link to a page (merchant Audit tab →
  `merchants/[merchantId]/audit/[logId]`, transactions → `transactions/audit/[eventId]`). Add
  `/manage/audit-logs/[logId]` (skeleton C) with a `system.audit.view` read action. It should reuse
  `audit-detail-parts.tsx` and `detail-primitives`, and not be scoped to a merchant, because platform rows can be
  system events. The row (`RowLink`) and the card link to the page. The chevron and in-place expand go
- [x] **A6 · §5.9 — back returns to the same place.** Keep the tab, page and filters in the URL's search params so that
  Back from the detail page lands on the same page of 10 with the same filters
- [x] **A7 · Flag and anomaly on the detail page.** The flag toggle moves into the detail page's header actions, and
  stays as a row icon button that stops propagation. The anomaly reason is computed from the loaded 50-event window, so
  the detail page cannot recompute it. It shows "Anomaly" in the list row; pass the reason through as a search param, or
  leave it on the list only. **Decided: the link carries an anomaly *code* (`voids:7`), not free text**
- [x] **A8 · §13.6 — clear control.** The ✕ in the `MerchantSearchSelect` trigger is an `<svg onClick>` inside the
  trigger `<button>`. It cannot be reached by keyboard and has no accessible name. Make it a real sibling button with
  `aria-label="Clear merchant"`
- [x] **A9 · §14.4 — route skeleton.** There is no `loading.tsx`. The layout awaits `requireAdminAuth` on the server,
  so a sidebar click shows nothing until that resolves. Add `DataPageSkeleton shell="plain"`

### `/manage/audit-logs/impersonation` — work items

- [x] **B1 · §5.3 / D-26 — one breakpoint.** The table shows only from `xl` (`hidden xl:block`, unprefixed
  `min-w-[900px]`). Show it from `md` and drop the `min-w`. Tiers: essential = Started, Merchant, HQ admin, Status;
  `lg` = Duration, Actions; `xl` = Reason
- [x] **B2 · §5.7 — one-line rows.** The HQ admin cell stacks name and email. Show one line, with the email in `title`
- [x] **B3 · §5.4 — skeleton breakpoints.** The loading skeleton switches at `xl` (`hidden xl:block` / `xl:hidden`).
  Move it to `md` with the table
- [ ] **B4 · §14.4 — route skeleton.** No `loading.tsx`; same as A9
- Conforms already: the card leads with merchant and status and has 4 pairs. There is no detail view, so it keeps them
  (§5.3). The page also passes `bounded={false}`, uses neutral status words, and has the worded empty and error wells,
  `PaginationBar` at 10 and a row-count line

### Done — 2026-09-30

B1–B3 were done by a parallel session, which also recorded them in §14.5. B4 (a `loading.tsx` for the
impersonation page) is still open. A1–A9 are done in this change:

| File | Change |
|---|---|
| `app/manage/audit-logs/page.tsx` | The table shows from `md` with tiered columns: When, What happened, Who, Status and Flag from `md`; Organization from `lg`; Category and Severity from `xl`; Location from `2xl`. It passes `bounded={false}` and has no `min-w`. Each row is one line: the sentence cell takes the remaining width and truncates, and the secondary lines (date, org type, role/email) moved into `title`. The whole row opens the entry: `router.push`, plus `RowLink` for keyboard and new-tab use. The flag button stops propagation. Phone cards are `RecordLinkCard`s (sentence, status, actor, time). Anomalies and flags are said in words ("Anomaly · …", "Flagged · …"). The tab, both pagers and every filter live in the URL. Text filters settle for 300 ms before they reach the URL and the query. The in-place expand, `AuditEventDetail` and `ChangeDiffViewer` are gone |
| `app/manage/audit-logs/[logId]/page.tsx` + `loading.tsx` (new) | Skeleton C, laid out like the merchant audit entry page. The header has the action, a status pill, "actor · time" and a Flag for review action. Then a neutral anomaly callout (when the list passed one), the Event facts (the sentence first, then who, where, category, severity, status, PII access, "View as merchant", resource and ids with copy), Error, and Changes beside Request context from `lg`. Back returns to `?list=` |
| `app/manage/audit-logs/audit-log-shared.ts` (new) | Labels, link helpers, anomaly detection as codes (`parseAnomaly` accepts only `voids:N` / `deletes:N` with N ≥ 5, and `after-hours:H` with H < 24, so a crafted link cannot put a sentence on the page), and the flags store |
| `app/manage/audit-logs/loading.tsx` (new) | `DataPageSkeleton` report shape (no stats, 2 tabs, table), also used as the page's Suspense fallback |
| `app/manage/actions/hq-platform/analytics.ts` | `getPlatformAuditLogById` (`system.audit.view`, not merchant-scoped, uuid-checked). The select list, row mapper and client fallback are now shared with `getPlatformAuditLogs`, and the select now includes `is_impersonation` |
| `lib/queries/use-platform-analytics.ts` | `usePlatformAuditLog` + `platformKeys.auditLogDetail` |
| `app/manage/components/audit-detail-parts.tsx` | Moved from `merchants/[merchantId]/audit/[logId]/` now that two entry pages share it. Its `divide-y` and `sm:border-t` row rules are gone (§5.5), which also fixes the merchant entry page |
| `components/admin/MerchantSearchSelect.tsx` | The clear ✕ is a real `<button aria-label="Clear merchant">` beside the trigger (`size-8`), not an `<svg onClick>` inside it |
| `app/manage/transactions/components/ledger-primitives.tsx` | `RecordLinkCardSkeletons`: a two-line skeleton shaped like `RecordLinkCard` (§5.4) |

**Flags moved to `useSyncExternalStore`.** They are still per browser in localStorage. The server render and the
first client render now agree, which fixes the hydrate mismatch noted above. The list and an entry's page share one
store, so flagging on the entry page shows on the list when you go back. A flag set in another browser tab updates too.

**Still found, not changed**
- **Flags and anomalies still cover only the loaded 50-event window**, as noted above. An entry opened from a
  bookmark shows no anomaly callout, because the anomaly exists only relative to that window.
- **The CSV export asks for up to 10,000 rows in one select.** PostgREST caps an unpaged select at 1,000 rows, so an
  export probably stops at 1,000 without a note: `capped` compares `total` with 10,000, not with the rows returned.
  Not verified against the database.
- `AuditLogSection` (transactions) still uses `RecordCardSkeletons` for its link cards. It could switch to
  `RecordLinkCardSkeletons`.

**Verification**
- [x] `tsc --noEmit --incremental false`: 0 errors in any changed or new file (839 project-wide, from other work in the tree; the last record noted 841)
- [x] Vitest: `app/manage/audit-logs/__tests__/audit-log-shared.test.ts`, 10/10 (list href, entry href, anomaly
  codes incl. rejected free text, burst and after-hours detection)
- [x] ESLint on every changed file: the list page went from 2 errors to 0 (the effects that reset the page are
  gone). The only remaining errors are the 2 pre-existing `set-state-in-effect` in `MerchantSearchSelect`, which this
  change did not touch
- [x] §3.5, §5.5, §8 and §12 greps are clean. One `border-l` hit in `audit-detail-parts` is a false positive (`border-border`), and it is a vertical nesting guide anyway
- [ ] Browser: not run (the chrome-devtools MCP failed to connect). Worth checking: 768px, where the table shows 5
  columns and the sentence truncates; Back from an entry restoring page 3 with filters; the flag toggle on a row not
  opening the entry; the anomaly callout; dark mode

### Review follow-ups — 2026-10-03

- [x] **Flag tooltip.** The row's flag button used the browser's native `title` box. It now uses the app `Tooltip`: a small neutral pill centred below the button (`side="bottom"`, `align="center"`). Fixed in `components/ui/tooltip.tsx` at the same time: the arrow had no fill, so its SVG fell back to black, which showed as a dark notch on the light dark-mode tooltip. It now takes `bg-foreground fill-foreground`. This affects every tooltip in the app, and an inline `backgroundColor` still overrides it
- [x] **Calendar on the page edge.** The From/To date fields sit at the right end of the toolbar, so the start-aligned calendar was pushed flush against the 16px collision gutter. `FilterDate` takes an `align` prop, and the audit log passes `end`, so the calendar hangs left under its field. Other `FilterDate` callers are unchanged
- [x] **Repeated "nothing changed".** `describeChanges` returns no caption when nothing changed, since `AuditChanges` already says "This action didn't change any data." This applies to both entry pages (platform and merchant)
- Verification: a scoped `tsc` shows 0 errors in the touched files (2 errors in untouched files reached through imports). ESLint is clean. Not checked in a browser (chrome-devtools unavailable)

### Changes section redesign — 2026-10-03

**Problem.** The diff stopped at top-level keys. One changed setting inside `kiosk_settings` printed the whole object twice, side by side: seat mode `ask` → `fixed` sat among 7 identical seat options with their UUIDs. Values were raw codes. Separately, the `{ field: { old, new } }` format was misread as a bare snapshot.

**Design (approved in chat).** A flat list of the values that actually changed, each labelled by its path, with old (struck through) → new. Added, removed and reordered are said in words. Lists of records are matched by `id` and named by label. Stored codes are humanised, with the raw value in `title`. Unchanged values and the raw JSON sit behind toggles. Single column, so phones need no separate layout. Rejected: highlighted two-column diff (needs red/green, §3.5, and stays long); one sentence per change (hard to scan at ten changes).

- [x] `app/manage/components/audit-diff.ts` (new, pure): `diffChanges`, `readChanges` (now also reads `{ field: { old, new } }`), `formatKey`, `formatScalar`, `itemLabel`, `summarizeValue`
- [x] `app/manage/components/audit-detail-parts.tsx`: `UpdateDiff` renders the flat list. "N fields changed" counts changed values, not top-level keys. Created and removed entries keep the field list, but a list of records collapses to its names or a count. Every shape has "Show raw data". It still re-exports `formatKey` / `readChanges`, so importers are unchanged
- [x] Tests: `app/manage/components/__tests__/audit-diff.test.ts`, 16 cases, written first and seen failing (nested leaves, added/removed, empty-equivalence, list match by id, list add/remove/reorder, plain lists, id-less fallback, both stored formats, humanising, summaries)
- [x] Scoped `tsc`: 0 errors in touched files. ESLint clean. A server-render probe on the kiosk example (since deleted) printed: "3 fields changed · Kiosk settings › Seat mode: Ask → Fixed · Kiosk settings › Table label: Removed 1 · Kiosk settings › Fixed seat label: Added Seat 7 · Show 2 unchanged fields · Show raw data"
- [ ] Browser check, light and dark (chrome-devtools unavailable)
- [x] **Review, 2026-10-03.** "Show raw data" is removed from every shape. The unchanged-fields toggle is hidden below `sm` (`max-sm:hidden`, §13.4). For clarity:
  - Rows are grouped once under their parent instead of repeating the path.
  - Each change sits in its own `bg-muted/40` well, with the field on the left and before → after on the right.
  - Added and removed fields read "Not set → X" and "X → Not set". List entries read "Added X" or "Removed X" (the diff now marks those rows `item: true`, with tests updated first).
  - Strike-through is gone, because it made short values like "1" unreadable.

  26/26 tests pass, ESLint is clean, and scoped tsc is clean in the touched files. A render probe (deleted) shows: "Kiosk settings / Seat mode Ask → Fixed / Table label 1 → Not set / Seat selection enabled Yes → No / Seat options Added Patio / Fixed seat label Not set → Seat 7"
- [x] **Mobile review, 2026-10-03.**
  - **One search box.** The "Actor name or email" and "Resource type" inputs duplicated the main search, which already matched actor name/email and resource type. Both are gone, with their `actor` / `resource` URL params. The main search now also matches `actor_user_id`, the one thing only the actor box covered. Resource type is a substring match now, not exact.
  - **Placeholders no longer cut off.** `FilterSelect` has a `triggerAllLabel` that shows a short, muted name ("Category", "Severity", "Status", "PII access") while no filter is set. The menu still says "All categories".
  - **Phone cards.** They lead with the action, not the sentence: the sentence starts with the actor, so truncated it made every card identical. The time is compact (`shortRelativeTime`: "16h ago", "3d ago", then the date; tested). The result is a neutral glyph (check, cross or question mark) with the word for screen readers and in `title`, as requested.
  - **Flagged caption** is hidden below `sm` (`showCaptionOnMobile` removed).

  Lint is clean, 29/29 tests pass, and scoped tsc is clean in the touched files.
